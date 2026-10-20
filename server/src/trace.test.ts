import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { NetworkGraph, linkId } from './graph';
import { traceBfs, traceComponents, traceTarjan } from './trace';

const steps = (result: { steps: Array<{ index: number }> }) => result.steps;

describe('BFS trace', () => {
  it('ends on the same six-hop path as NetworkGraph.findPath', () => {
    const graph = NetworkGraph.sample();
    const trace = traceBfs(graph.snapshot(), 'Admin_PC', 'Web_Server');
    const expected = graph.findPath('Admin_PC', 'Web_Server');

    assert.equal(trace.summary.found, true);
    assert.deepEqual(trace.summary.path, expected.path);
    assert.equal(trace.summary.hops, 6);
    assert.equal(trace.algorithm, 'bfs');
    assert.equal(trace.complexity, 'O(V + E)');

    const last = trace.steps.at(-1)!;
    assert.deepEqual(last.path, expected.path);
    assert.equal(last.action, 'path');
    assert.match(last.explanation, /parent\[\]/);
  });

  it('records queue growth, visited order, and parent pointers consistently', () => {
    const graph = NetworkGraph.sample();
    const trace = traceBfs(graph.snapshot(), 'Admin_PC', 'Web_Server');

    const enqueued = trace.steps.filter((step) => step.action === 'enqueue');
    assert.ok(enqueued.length > 0, 'BFS explains each discovery');
    assert.equal(trace.steps[0].action, 'init');
    assert.deepEqual(trace.steps[0].queue, ['Admin_PC']);

    for (const step of trace.steps) {
      assert.equal(new Set(step.queue).size, step.queue.length, 'a vertex is never queued twice');
      assert.equal(new Set(step.visited).size, step.visited.length, 'a vertex is visited once');
      for (const name of step.visited) {
        assert.ok(name in step.parent, `${name} has a parent entry`);
      }
    }

    assert.deepEqual(trace.summary.visitedOrder, graph.findPath('Admin_PC', 'Web_Server').visitedOrder);
  });

  it('reports no path after a critical device failure', () => {
    const graph = NetworkGraph.sample();
    graph.failDevice('Dist_Router_1');
    const trace = traceBfs(graph.snapshot(), 'Admin_PC', 'Web_Server');

    assert.equal(trace.summary.found, false);
    assert.deepEqual(trace.summary.path, []);
    const last = trace.steps.at(-1)!;
    assert.equal(last.action, 'no-path');
    assert.equal(last.path, null);
    assert.ok(last.visited.length < graph.snapshot().metrics.activeDevices + 1);
  });

  it('stops immediately when an endpoint is DOWN', () => {
    const graph = NetworkGraph.sample();
    graph.failDevice('Web_Server');
    const trace = traceBfs(graph.snapshot(), 'Admin_PC', 'Web_Server');

    assert.equal(trace.steps.length, 1);
    assert.equal(trace.steps[0].action, 'blocked');
    assert.equal(trace.summary.found, false);
    assert.match(trace.steps[0].explanation, /DOWN/);
  });

  it('does not mutate the source graph', () => {
    const graph = NetworkGraph.sample();
    const before = graph.toData();
    traceBfs(graph.snapshot(), 'Admin_PC', 'Web_Server');
    traceComponents(graph.snapshot());
    traceTarjan(graph.snapshot());
    assert.deepEqual(graph.toData(), before);
  });
});

describe('connected components trace', () => {
  it('matches the engine component count and membership on the healthy sample', () => {
    const graph = NetworkGraph.sample();
    const trace = traceComponents(graph.snapshot());
    const expected = graph.connectedComponents();

    assert.equal(trace.summary.count, 1);
    assert.deepEqual(
      trace.summary.components?.map((component) => component.nodes),
      expected.components.map((component) => component.nodes),
    );
    assert.equal(trace.steps.at(-1)!.action, 'complete');
    assert.match(trace.steps.at(-1)!.explanation, /O\(V \+ E\)/);
  });

  it('discovers a second component after a partition and colors it separately', () => {
    const graph = NetworkGraph.sample();
    graph.failDevice('Dist_Router_1');
    const trace = traceComponents(graph.snapshot());

    assert.equal(trace.summary.count, 2);
    const sizes = trace.summary.components!.map((component) => component.nodes.length).sort((a, b) => a - b);
    assert.deepEqual(sizes, [4, 5]);

    const last = trace.steps.at(-1)!;
    const assigned = Object.values(last.components);
    assert.equal(assigned.length, 9, 'the failed device is never assigned');
    assert.equal(new Set(assigned).size, 2);
    assert.equal(last.nodes.find((node) => node.name === 'Dist_Router_1')!.state, 'down');
  });

  it('gives an isolated device its own component id', () => {
    const graph = NetworkGraph.sample();
    graph.addDevice('Guest_PC');
    const trace = traceComponents(graph.snapshot());

    assert.equal(trace.summary.count, 2);
    const guest = trace.summary.components!.find((component) => component.nodes.includes('Guest_PC'))!;
    assert.deepEqual(guest.nodes, ['Guest_PC']);
    assert.equal(trace.steps.at(-1)!.components.Guest_PC, guest.id);
  });
});

describe('Tarjan trace', () => {
  it('ends with the same articulation points and bridges as the engine', () => {
    const graph = NetworkGraph.sample();
    const trace = traceTarjan(graph.snapshot());
    const expected = graph.vulnerabilityAnalysis();

    assert.deepEqual(new Set(trace.summary.articulationPoints), new Set(expected.articulationPoints));
    assert.deepEqual(
      new Set(trace.summary.bridges!.map((bridge) => bridge.id)),
      new Set(expected.bridges.map((bridge) => bridge.id)),
    );
    assert.equal(trace.summary.bridges!.length, 7);
    assert.equal(trace.summary.articulationPoints!.length, 6);
  });

  it('assigns unique disc values and keeps low <= disc for every vertex', () => {
    const graph = NetworkGraph.sample();
    const trace = traceTarjan(graph.snapshot());
    const last = trace.steps.at(-1)!;

    const values = Object.values(last.disc);
    assert.equal(new Set(values).size, values.length, 'discovery timestamps are unique');
    assert.deepEqual([...values].sort((a, b) => a - b), values.map((_, index) => index + 1));

    for (const [name, disc] of Object.entries(last.disc)) {
      assert.ok(last.low[name] <= disc, `${name}: low <= disc`);
      const parent = last.parent[name];
      if (parent) assert.ok(last.disc[parent] < disc, `${name}: parent discovered earlier`);
    }
  });

  it('flags every chain edge as a bridge and every internal node as an articulation point', () => {
    const graph = new NetworkGraph();
    for (const name of ['A', 'B', 'C', 'D']) graph.addDevice(name);
    for (const [u, v] of [['A', 'B'], ['B', 'C'], ['C', 'D']]) graph.addLink(u, v);

    const trace = traceTarjan(graph.snapshot());
    assert.deepEqual(new Set(trace.summary.bridges!.map((bridge) => bridge.id)), new Set([
      linkId('A', 'B'),
      linkId('B', 'C'),
      linkId('C', 'D'),
    ]));
    assert.deepEqual(new Set(trace.summary.articulationPoints), new Set(['B', 'C']));
  });

  it('finds no critical elements in a complete graph', () => {
    const graph = new NetworkGraph();
    for (const name of ['A', 'B', 'C', 'D']) graph.addDevice(name);
    for (let i = 0; i < 4; i += 1) {
      for (let j = i + 1; j < 4; j += 1) graph.addLink(['A', 'B', 'C', 'D'][i], ['A', 'B', 'C', 'D'][j]);
    }

    const trace = traceTarjan(graph.snapshot());
    assert.deepEqual(trace.summary.articulationPoints, []);
    assert.deepEqual(trace.summary.bridges, []);
    assert.match(trace.steps.at(-1)!.explanation, /0 articulation point/);
  });

  it('explains each detection with its disc/low reason', () => {
    const graph = NetworkGraph.sample();
    const trace = traceTarjan(graph.snapshot());
    const bridgeStep = trace.steps.find((step) => step.action === 'bridge')!;
    const apStep = trace.steps.find((step) => step.action === 'articulation')!;

    assert.ok(bridgeStep, 'a bridge step exists');
    assert.match(bridgeStep.explanation, /low\[.+\] = \d+ > disc\[.+\] = \d+/);
    assert.ok(bridgeStep.detectedBridge);
    assert.equal(bridgeStep.bridges.length, 1, 'bridges accumulate one at a time');

    assert.ok(apStep, 'an articulation step exists');
    assert.match(apStep.explanation, /low\[.+\] = \d+ >= disc\[.+\]|DFS root/);
    assert.ok(apStep.detectedArticulation);
    assert.equal(apStep.articulationPoints.length, 1, 'articulation points accumulate one at a time');
  });

  it('produces a valid trace for a single isolated device', () => {
    const graph = new NetworkGraph();
    graph.addDevice('Alone');
    const trace = traceTarjan(graph.snapshot());

    assert.deepEqual(trace.summary.bridges, []);
    assert.deepEqual(trace.summary.articulationPoints, []);
    assert.ok(steps(trace).length >= 2);
    assert.equal(trace.steps[0].action, 'root');
  });
});
