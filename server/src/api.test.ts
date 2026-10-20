import assert from 'node:assert/strict';
import { after, before, beforeEach, describe, it } from 'node:test';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { AddressInfo } from 'node:net';
import type { Server } from 'node:http';
import { createApp } from './app';
import { NetworkStore } from './store';

/**
 * HTTP-level suite. The app is built around a store backed by a temporary file,
 * so these tests never read or overwrite server/data/netguard.json.
 */
const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'netguard-api-'));
const store = new NetworkStore(path.join(tempDir, 'netguard.test.json'));
const app = createApp(store);

let server: Server | undefined;
let baseUrl = '';

before(async () => {
  await new Promise<void>((resolve) => {
    server = app.listen(0, '127.0.0.1', () => resolve());
  });
  const address = server!.address() as AddressInfo;
  baseUrl = `http://127.0.0.1:${address.port}`;
});

after(async () => {
  await new Promise<void>((resolve, reject) => {
    if (!server) return resolve();
    server.close((error) => (error ? reject(error) : resolve()));
  });
  fs.rmSync(tempDir, { recursive: true, force: true });
});

beforeEach(() => {
  store.reset('test-session');
  store.clearHistory();
});

async function api(pathname: string, init: RequestInit = {}) {
  const response = await fetch(`${baseUrl}${pathname}`, {
    ...init,
    headers: {
      'content-type': 'application/json',
      'x-session-id': 'test-session',
      ...(init.headers ?? {}),
    },
  });
  const body = (await response.json()) as Record<string, any>;
  return { status: response.status, body };
}

describe('HTTP API integration', () => {
  it('reports service readiness from the health endpoint', async () => {
    const { status, body } = await api('/api/health');

    assert.equal(status, 200);
    assert.equal(body.ok, true);
    assert.equal(body.service, 'netguard-api');
    assert.equal(body.topology, 'sample-10-device');
    assert.equal(typeof body.uptimeSeconds, 'number');
  });

  it('serializes the full topology and its adjacency list', async () => {
    const { status, body } = await api('/api/graph');

    assert.equal(status, 200);
    assert.equal(body.devices.length, 10);
    assert.equal(body.links.length, 10);
    assert.equal(body.adjacency.length, 10);
    assert.equal(body.metrics.activeDevices, 10);
    assert.equal(body.metrics.components, 1);
    assert.equal(body.metrics.articulationPoints, 6);
    assert.equal(body.metrics.bridges, 7);
    assert.deepEqual(
      body.adjacency.find((entry: any) => entry.name === 'Switch_C').neighbors.map((n: any) => n.name),
      ['Dist_Router_2', 'Admin_PC', 'User_PC'],
    );
    assert.match(body.updatedAt, /^\d{4}-\d{2}-\d{2}T/);
  });

  it('rejects malformed requests with 400 and a message', async () => {
    const pathBody = await api('/api/path', { method: 'POST', body: JSON.stringify({}) });
    assert.equal(pathBody.status, 400);
    assert.match(pathBody.body.error, /required/i);

    const device = await api('/api/devices', { method: 'POST', body: JSON.stringify({ name: '   ' }) });
    assert.equal(device.status, 400);

    const link = await api('/api/links', { method: 'POST', body: JSON.stringify({ u: 'Switch_A' }) });
    assert.equal(link.status, 400);
  });

  it('rejects unknown vertex names on path and link endpoints', async () => {
    const pathResponse = await api('/api/path', {
      method: 'POST',
      body: JSON.stringify({ source: 'Ghost_Router', destination: 'Web_Server' }),
    });
    assert.equal(pathResponse.status, 404);
    assert.match(pathResponse.body.error, /not found/i);

    const linkResponse = await api('/api/links', {
      method: 'POST',
      body: JSON.stringify({ u: 'Ghost_Router', v: 'Core_Router' }),
    });
    assert.equal(linkResponse.status, 404);

    const failResponse = await api('/api/devices/Ghost_Router/fail', { method: 'POST' });
    assert.equal(failResponse.status, 400);
    assert.match(failResponse.body.error, /not found/i);
  });

  it('returns found:false when routing between devices on opposite sides of a failure', async () => {
    const failed = await api('/api/devices/Dist_Router_1/fail', { method: 'POST' });
    assert.equal(failed.status, 200);
    assert.equal(failed.body.graph.metrics.activeDevices, 9);

    const { status, body } = await api('/api/path', {
      method: 'POST',
      body: JSON.stringify({ source: 'Admin_PC', destination: 'Web_Server' }),
    });
    assert.equal(status, 200, 'an unreachable pair is a valid query, not a client error');
    assert.equal(body.result.found, false);
    assert.match(body.result.message, /NO PATH/);

    const components = await api('/api/components');
    assert.equal(components.body.count, 2);
  });

  it('refuses to route when the destination device is DOWN', async () => {
    await api('/api/devices/Web_Server/fail', { method: 'POST' });

    const { status, body } = await api('/api/path', {
      method: 'POST',
      body: JSON.stringify({ source: 'Admin_PC', destination: 'Web_Server' }),
    });
    assert.equal(status, 200);
    assert.equal(body.result.found, false);
    assert.deepEqual(body.result.path, []);
    assert.match(body.result.message, /DOWN/);
  });

  it('exposes a step-by-step BFS trace whose final step matches the path result', async () => {
    const path = await api('/api/path', {
      method: 'POST',
      body: JSON.stringify({ source: 'Admin_PC', destination: 'Web_Server' }),
    });
    const { status, body } = await api('/api/trace?algorithm=bfs&source=Admin_PC&destination=Web_Server');

    assert.equal(status, 200);
    assert.equal(body.algorithm, 'bfs');
    assert.equal(body.complexity, 'O(V + E)');
    assert.ok(body.steps.length > 5, 'BFS emits intermediate steps');
    assert.equal(body.summary.hops, path.body.result.hops);
    assert.deepEqual(body.steps.at(-1).path, path.body.result.path);
    assert.equal(body.steps[0].nodes.length, 10, 'every step describes every device');
    assert.ok(body.steps.some((step: any) => step.action === 'enqueue'));
  });

  it('validates trace algorithm and endpoints', async () => {
    const algorithm = await api('/api/trace?algorithm=dfs');
    assert.equal(algorithm.status, 400);
    assert.match(algorithm.body.error, /algorithm/);

    const missing = await api('/api/trace?algorithm=bfs&source=Admin_PC');
    assert.equal(missing.status, 400);

    const unknown = await api('/api/trace?algorithm=bfs&source=Nope&destination=Web_Server');
    assert.equal(unknown.status, 404);
  });

  it('supports adding devices and links, then restoring every failure', async () => {
    const added = await api('/api/devices', {
      method: 'POST',
      body: JSON.stringify({ name: 'Lab_PC' }),
    });
    assert.equal(added.status, 201);
    assert.equal(added.body.graph.metrics.devices, 11);

    const link = await api('/api/links', {
      method: 'POST',
      body: JSON.stringify({ u: 'Lab_PC', v: 'Switch_C' }),
    });
    assert.equal(link.status, 201);
    assert.equal(link.body.graph.metrics.links, 11);

    await api('/api/devices/Switch_C/fail', { method: 'POST' });
    await api('/api/links/fail', {
      method: 'POST',
      body: JSON.stringify({ u: 'Core_Router', v: 'Dist_Router_1' }),
    });

    const restored = await api('/api/restore-all', { method: 'POST' });
    assert.equal(restored.status, 200);
    assert.match(restored.body.message, /Restored 1 device\(s\) and 1 link\(s\)/);
    assert.equal(restored.body.graph.metrics.activeDevices, 11);
    assert.equal(restored.body.graph.metrics.activeLinks, 11);
    assert.equal(restored.body.graph.metrics.components, 1);
  });

  it('records failures and path queries in the session history', async () => {
    await api('/api/devices/Web_Server/fail', { method: 'POST' });
    await api('/api/path', {
      method: 'POST',
      body: JSON.stringify({ source: 'Admin_PC', destination: 'Web_Server' }),
    });

    const { status, body } = await api('/api/history?scope=session');
    assert.equal(status, 200);
    assert.equal(body.scope, 'session');
    assert.equal(body.summary.failures, 1);
    assert.equal(body.summary.pathQueries, 1);
    assert.deepEqual(body.summary.failedDevices, ['Web_Server']);
    assert.ok(body.events.length >= 2);
    assert.ok(body.events.every((event: any) => event.sessionId === 'test-session'));

    const cleared = await api('/api/history', { method: 'DELETE' });
    assert.equal(cleared.status, 200);
    assert.deepEqual(cleared.body.events, []);
    assert.equal(cleared.body.summary.total, 0);
  });

  it('analyses a failure on a clone without mutating the live graph', async () => {
    const { status, body } = await api('/api/demo/before-after?fail=Dist_Router_1');

    assert.equal(status, 200);
    assert.equal(body.target.name, 'Dist_Router_1');
    assert.equal(body.impact.pathBroken, true);
    assert.equal(body.impact.hopsBefore, 6);
    assert.equal(body.impact.componentsDelta, 1);
    assert.equal(body.before.components.count, 1);
    assert.equal(body.after.components.count, 2);
    assert.deepEqual(body.after.snapshot.metrics.activeDevices, 9);

    const live = await api('/api/graph');
    assert.equal(live.body.metrics.activeDevices, 10, 'the live network is untouched');
    assert.equal(live.body.metrics.components, 1);
  });

  it('returns a structured 404 for unknown API routes', async () => {
    const { status, body } = await api('/api/does-not-exist');
    assert.equal(status, 404);
    assert.match(body.error, /not found/i);
  });
});
