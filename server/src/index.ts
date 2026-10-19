import 'dotenv/config';
import path from 'node:path';
import fs from 'node:fs';
import express, { type NextFunction, type Request, type Response } from 'express';
import cors from 'cors';
import { store } from './store';
import type { HistoryType } from './types';

const app = express();
// Some hosts inject PORT=0 ("pick any free port"). NetGuard needs a stable,
// predictable port for the Vite proxy, so only accept a positive number.
const envPort = Number(process.env.PORT);
const PORT = Number.isInteger(envPort) && envPort > 0 ? envPort : 4000;
const MAX_LIMIT = 500;

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

function str(value: unknown): string | null {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null;
}

function fail(res: Response, status: number, message: string) {
  return res.status(status).json({ error: message });
}

function log(type: HistoryType, req: Request, message: string, meta?: Record<string, unknown>) {
  store.record(type, session(req), message, meta);
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
  res.json(store.snapshot());
});

app.post('/api/devices', (req, res) => {
  const name = str(req.body?.name);
  if (!name) return fail(res, 400, 'A device name is required.');
  if (name.length > 40) return fail(res, 400, 'Device names must be 40 characters or fewer.');
  if (!store.graph.addDevice(name)) return fail(res, 409, `Device '${name}' already exists.`);
  log('add-device', req, `Added device '${name}' to the topology.`, { device: name });
  res.status(201).json({ message: `Device '${name}' added.`, graph: store.snapshot() });
});

app.post('/api/links', (req, res) => {
  const u = str(req.body?.u);
  const v = str(req.body?.v);
  if (!u || !v) return fail(res, 400, 'Both link endpoints are required.');
  if (!store.graph.hasDevice(u) || !store.graph.hasDevice(v)) {
    return fail(res, 404, 'One or both devices were not found.');
  }
  if (!store.graph.addLink(u, v)) return fail(res, 409, `A link between '${u}' and '${v}' already exists.`);
  log('add-link', req, `Added link ${u} ↔ ${v}.`, { u, v });
  res.status(201).json({ message: `Link ${u} ↔ ${v} added.`, graph: store.snapshot() });
});

/* ------------------------------------------------------------------ */
/* Failure simulation                                                  */
/* ------------------------------------------------------------------ */

app.post('/api/devices/:name/fail', (req, res) => {
  const name = req.params.name;
  const result = store.graph.failDevice(name);
  if (!result.ok) return fail(res, 400, result.message);
  log('fail-device', req, result.message.replace('[SIMULATION] ', ''), { device: name });
  res.json({ message: result.message, graph: store.snapshot() });
});

app.post('/api/devices/:name/restore', (req, res) => {
  const name = req.params.name;
  const result = store.graph.restoreDevice(name);
  if (!result.ok) return fail(res, 400, result.message);
  log('restore-device', req, result.message.replace('[SIMULATION] ', ''), { device: name });
  res.json({ message: result.message, graph: store.snapshot() });
});

app.post('/api/links/fail', (req, res) => {
  const u = str(req.body?.u);
  const v = str(req.body?.v);
  if (!u || !v) return fail(res, 400, 'Both link endpoints are required.');
  const result = store.graph.failLink(u, v);
  if (!result.ok) return fail(res, 400, result.message);
  log('fail-link', req, result.message.replace('[SIMULATION] ', ''), { u, v });
  res.json({ message: result.message, graph: store.snapshot() });
});

app.post('/api/links/restore', (req, res) => {
  const u = str(req.body?.u);
  const v = str(req.body?.v);
  if (!u || !v) return fail(res, 400, 'Both link endpoints are required.');
  const result = store.graph.restoreLink(u, v);
  if (!result.ok) return fail(res, 400, result.message);
  log('restore-link', req, result.message.replace('[SIMULATION] ', ''), { u, v });
  res.json({ message: result.message, graph: store.snapshot() });
});

app.post('/api/reset', (req, res) => {
  const snapshot = store.reset(session(req));
  res.json({ message: 'Topology restored to the healthy sample network.', graph: snapshot });
});

/** Bring every cut link and down device back up without resetting custom topology. */
app.post('/api/restore-all', (req, res) => {
  const before = store.snapshot();
  let devices = 0;
  let links = 0;
  for (const device of before.devices) {
    if (!device.active && store.graph.restoreDevice(device.name).ok) devices += 1;
  }
  for (const link of before.links) {
    if (!link.active && store.graph.restoreLink(link.u, link.v).ok) links += 1;
  }
  if (devices + links > 0) {
    log('restore-all', req, `Restored all failures (${devices} devices, ${links} links).`, { devices, links });
  }
  res.json({
    message: devices + links > 0 ? `Restored ${devices} device(s) and ${links} link(s).` : 'Nothing was down.',
    graph: store.snapshot(),
  });
});

/* ------------------------------------------------------------------ */
/* Algorithms                                                          */
/* ------------------------------------------------------------------ */

app.post('/api/path', (req, res) => {
  const source = str(req.body?.source);
  const destination = str(req.body?.destination);
  if (!source || !destination) return fail(res, 400, 'Source and destination are required.');
  if (!store.graph.hasDevice(source) || !store.graph.hasDevice(destination)) {
    return fail(res, 404, 'Source or destination device was not found.');
  }

  const result = store.graph.findPath(source, destination);
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
  res.json(store.graph.connectedComponents());
});

app.get('/api/vulnerabilities', (_req, res) => {
  res.json(store.graph.vulnerabilityAnalysis());
});

app.get('/api/demo/before-after', (req, res) => {
  const failTarget = str(req.query.fail) ?? undefined;
  const source = str(req.query.source) ?? undefined;
  const destination = str(req.query.destination) ?? undefined;
  try {
    const demo = store.runDemo({ failTarget, source, destination }, session(req));
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
  const events = store.historyFor(session(req), scope).slice(0, limit);
  res.json({
    events,
    summary: store.historySummary(scope === 'session' ? store.historyFor(session(req), scope) : store.history),
    scope,
  });
});

app.delete('/api/history', (_req, res) => {
  store.clearHistory();
  res.json({ message: 'History cleared.', events: [], summary: store.historySummary([]), scope: 'all' });
});

/* ------------------------------------------------------------------ */
/* Static client (production convenience)                              */
/* ------------------------------------------------------------------ */

const clientDist = path.join(__dirname, '..', '..', 'client', 'dist');
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

app.listen(PORT, '127.0.0.1', () => {
  console.log(`[netguard] API ready on http://localhost:${PORT}`);
  console.log(`[netguard] Topology: ${store.graph.deviceCount} devices loaded.`);
});
