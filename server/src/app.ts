import path from 'node:path';
import fs from 'node:fs';
import express, { type NextFunction, type Request, type Response } from 'express';
import cors from 'cors';
import { NetworkStore, store as defaultStore } from './store';
import { traceBfs, traceComponents, traceTarjan } from './trace';
import type { HistoryType } from './types';

const MAX_LIMIT = 500;

function str(value: unknown): string | null {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null;
}

/**
 * Build the Express application around a graph store.
 *
 * Extracted from index.ts so the HTTP layer can be exercised in tests without
 * opening a fixed port or touching the persisted development state: pass a
 * `NetworkStore` backed by a temporary file.
 */
export function createApp(appStore: NetworkStore = defaultStore) {
  const app = express();
  const clientDist = path.join(__dirname, '..', '..', 'client', 'dist');

  app.use(cors());
  app.use(express.json({ limit: '64kb' }));

  /** Lightweight session tagging: the browser generates an id and sends it in a header. */
  app.use((req, _res, next) => {
    const header = req.header('x-session-id');
    (req as Request & { sessionId: string }).sessionId =
      typeof header === 'string' && header.length > 0 && header.length <= 100 ? header : 'anonymous';
    next();
  });

  function session(req: Request): string {
    return (req as Request & { sessionId?: string }).sessionId || 'anonymous';
  }

  function fail(res: Response, status: number, message: string) {
    return res.status(status).json({ error: message });
  }

  function log(type: HistoryType, req: Request, message: string, meta?: Record<string, unknown>) {
    appStore.record(type, session(req), message, meta);
  }

  /* ------------------------------------------------------------------ */
  /* Core graph                                                          */
  /* ------------------------------------------------------------------ */

  app.get('/api/health', (_req, res) => {
    res.json({
      ok: true,
      service: 'netguard-api',
      uptimeSeconds: Math.round(process.uptime()),
      topology: 'sample-10-device',
    });
  });

  app.get('/api/graph', (_req, res) => {
    res.json(appStore.snapshot());
  });

  app.post('/api/devices', (req, res) => {
    const name = str(req.body?.name);
    if (!name) return fail(res, 400, 'A device name is required.');
    if (name.length > 40) return fail(res, 400, 'Device names must be 40 characters or fewer.');
    if (!appStore.graph.addDevice(name)) return fail(res, 409, `Device '${name}' already exists.`);
    log('add-device', req, `Added device '${name}' to the topology.`, { device: name });
    res.status(201).json({ message: `Device '${name}' added.`, graph: appStore.snapshot() });
  });

  app.post('/api/links', (req, res) => {
    const u = str(req.body?.u);
    const v = str(req.body?.v);
    if (!u || !v) return fail(res, 400, 'Both link endpoints are required.');
    if (!appStore.graph.hasDevice(u) || !appStore.graph.hasDevice(v)) {
      return fail(res, 404, 'One or both devices were not found.');
    }
    if (!appStore.graph.addLink(u, v)) return fail(res, 409, `A link between '${u}' and '${v}' already exists.`);
    log('add-link', req, `Added link ${u} ↔ ${v}.`, { u, v });
    res.status(201).json({ message: `Link ${u} ↔ ${v} added.`, graph: appStore.snapshot() });
  });

  /* ------------------------------------------------------------------ */
  /* Failure simulation                                                  */
  /* ------------------------------------------------------------------ */

  app.post('/api/devices/:name/fail', (req, res) => {
    const name = req.params.name;
    const result = appStore.graph.failDevice(name);
    if (!result.ok) return fail(res, 400, result.message);
    log('fail-device', req, result.message.replace('[SIMULATION] ', ''), { device: name });
    res.json({ message: result.message, graph: appStore.snapshot() });
  });

  app.post('/api/devices/:name/restore', (req, res) => {
    const name = req.params.name;
    const result = appStore.graph.restoreDevice(name);
    if (!result.ok) return fail(res, 400, result.message);
    log('restore-device', req, result.message.replace('[SIMULATION] ', ''), { device: name });
    res.json({ message: result.message, graph: appStore.snapshot() });
  });

  app.post('/api/links/fail', (req, res) => {
    const u = str(req.body?.u);
    const v = str(req.body?.v);
    if (!u || !v) return fail(res, 400, 'Both link endpoints are required.');
    const result = appStore.graph.failLink(u, v);
    if (!result.ok) return fail(res, 400, result.message);
    log('fail-link', req, result.message.replace('[SIMULATION] ', ''), { u, v });
    res.json({ message: result.message, graph: appStore.snapshot() });
  });

  app.post('/api/links/restore', (req, res) => {
    const u = str(req.body?.u);
    const v = str(req.body?.v);
    if (!u || !v) return fail(res, 400, 'Both link endpoints are required.');
    const result = appStore.graph.restoreLink(u, v);
    if (!result.ok) return fail(res, 400, result.message);
    log('restore-link', req, result.message.replace('[SIMULATION] ', ''), { u, v });
    res.json({ message: result.message, graph: appStore.snapshot() });
  });

  app.post('/api/reset', (req, res) => {
    const snapshot = appStore.reset(session(req));
    res.json({ message: 'Topology restored to the healthy sample network.', graph: snapshot });
  });

  /** Bring every cut link and down device back up without resetting custom topology. */
  app.post('/api/restore-all', (req, res) => {
    const before = appStore.snapshot();
    let devices = 0;
    let links = 0;
    for (const device of before.devices) {
      if (!device.active && appStore.graph.restoreDevice(device.name).ok) devices += 1;
    }
    for (const link of before.links) {
      if (!link.active && appStore.graph.restoreLink(link.u, link.v).ok) links += 1;
    }
    if (devices + links > 0) {
      log('restore-all', req, `Restored all failures (${devices} devices, ${links} links).`, { devices, links });
    }
    res.json({
      message: devices + links > 0 ? `Restored ${devices} device(s) and ${links} link(s).` : 'Nothing was down.',
      graph: appStore.snapshot(),
    });
  });

  /* ------------------------------------------------------------------ */
  /* Algorithms                                                          */
  /* ------------------------------------------------------------------ */

  app.post('/api/path', (req, res) => {
    const source = str(req.body?.source);
    const destination = str(req.body?.destination);
    if (!source || !destination) return fail(res, 400, 'Source and destination are required.');
    if (!appStore.graph.hasDevice(source) || !appStore.graph.hasDevice(destination)) {
      return fail(res, 404, 'Source or destination device was not found.');
    }

    const result = appStore.graph.findPath(source, destination);
    log(
      'path-query',
      req,
      result.found
        ? `BFS ${source} → ${destination}: path found in ${result.hops} hops.`
        : `BFS ${source} → ${destination}: no path exists.`,
      { source, destination, found: result.found, hops: result.hops, path: result.path },
    );
    res.json({ source, destination, result });
  });

  app.get('/api/components', (_req, res) => {
    res.json(appStore.graph.connectedComponents());
  });

  app.get('/api/vulnerabilities', (_req, res) => {
    res.json(appStore.graph.vulnerabilityAnalysis());
  });

  /**
   * Step-by-step teaching traces. Read-only: the live graph is projected into
   * immutable snapshots, so stepping through a trace never mutates any state.
   */
  app.get('/api/trace', (req, res) => {
    const algorithm = str(req.query.algorithm);
    if (algorithm !== 'bfs' && algorithm !== 'components' && algorithm !== 'tarjan') {
      return fail(res, 400, "algorithm must be 'bfs', 'components' or 'tarjan'.");
    }

    const snapshot = appStore.snapshot();
    if (algorithm === 'components') return res.json(traceComponents(snapshot));
    if (algorithm === 'tarjan') return res.json(traceTarjan(snapshot));

    const source = str(req.query.source);
    const destination = str(req.query.destination);
    if (!source || !destination) return fail(res, 400, 'source and destination are required for a BFS trace.');
    if (!appStore.graph.hasDevice(source) || !appStore.graph.hasDevice(destination)) {
      return fail(res, 404, 'Source or destination device was not found.');
    }
    res.json(traceBfs(snapshot, source, destination));
  });

  app.get('/api/demo/before-after', (req, res) => {
    const failTarget = str(req.query.fail) ?? undefined;
    const source = str(req.query.source) ?? undefined;
    const destination = str(req.query.destination) ?? undefined;
    try {
      const demo = appStore.runDemo({ failTarget, source, destination }, session(req));
      res.json(demo);
    } catch (error) {
      fail(res, 400, error instanceof Error ? error.message : 'Demo could not be generated.');
    }
  });

  /* ------------------------------------------------------------------ */
  /* History                                                             */
  /* ------------------------------------------------------------------ */

  app.get('/api/history', (req, res) => {
    const scope = req.query.scope === 'session' ? 'session' : 'all';
    const limit = Math.min(Math.max(Number(req.query.limit) || 200, 1), MAX_LIMIT);
    const events = appStore.historyFor(session(req), scope).slice(0, limit);
    res.json({
      events,
      summary: appStore.historySummary(scope === 'session' ? appStore.historyFor(session(req), scope) : appStore.history),
      scope,
    });
  });

  app.delete('/api/history', (_req, res) => {
    appStore.clearHistory();
    res.json({ message: 'History cleared.', events: [], summary: appStore.historySummary([]), scope: 'all' });
  });

  /* ------------------------------------------------------------------ */
  /* Static client (production convenience)                              */
  /* ------------------------------------------------------------------ */

  if (fs.existsSync(clientDist)) {
    app.use(express.static(clientDist));
    app.get('*', (req, res, next) => {
      if (req.path.startsWith('/api/')) return next();
      res.sendFile(path.join(clientDist, 'index.html'));
    });
  }

  app.use('/api', (_req, res) => fail(res, 404, 'API route not found.'));

  app.use((error: Error, _req: Request, res: Response, _next: NextFunction) => {
    console.error('[netguard] Unhandled error:', error);
    fail(res, 500, 'Internal server error.');
  });

  return app;
}
