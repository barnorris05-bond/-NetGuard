import assert from 'node:assert/strict';
import { NetworkGraph, linkId } from './graph';

/** Small sanity suite for the ported C++ algorithms. Run with `npm test -w server`. */
function testSampleTopology() {
  const graph = NetworkGraph.sample();
  assert.equal(graph.deviceCount, 10);
  const snapshot = graph.snapshot();
  assert.equal(snapshot.links.length, 10);
  assert.equal(snapshot.adjacency.reduce((sum, entry) => sum + entry.neighbors.length, 0), 20);
  assert.equal(snapshot.metrics.activeDevices, 10);
  assert.equal(snapshot.metrics.activeLinks, 10);
  assert.equal(snapshot.metrics.components, 1);
}

function testBfsShortestPath() {
  const graph = NetworkGraph.sample();
  const result = graph.findPath('Admin_PC', 'Web_Server');
  assert.equal(result.found, true);
  assert.equal(result.hops, 6);
  assert.deepEqual(result.path, [
    'Admin_PC',
    'Switch_C',
    'Dist_Router_2',
    'Core_Router',
    'Dist_Router_1',
    'Switch_A',
    'Web_Server',
  ]);
  assert.equal(result.visitedOrder[0], 'Admin_PC');
  assert.equal(result.complexity, 'O(V + E)');

  const same = graph.findPath('User_PC', 'User_PC');
  assert.equal(same.found, true);
  assert.equal(same.hops, 0);
}

function testTarjan() {
  const graph = NetworkGraph.sample();
  const result = graph.vulnerabilityAnalysis();
  assert.equal(result.articulationPoints.length, 6);
  assert.deepEqual(
    new Set(result.articulationPoints),
    new Set([
      'Core_Router',
      'Dist_Router_1',
      'Dist_Router_2',
      'Switch_A',
      'Switch_B',
      'Switch_C',
    ]),
  );
  assert.equal(result.bridges.length, 7);
  const bridgeIds = new Set(result.bridges.map((bridge) => bridge.id));
  for (const [a, b] of [
    ['Core_Router', 'Dist_Router_1'],
    ['Core_Router', 'Dist_Router_2'],
    ['Dist_Router_2', 'Switch_C'],
    ['Switch_A', 'Web_Server'],
    ['Switch_B', 'Db_Server'],
    ['Switch_C', 'Admin_PC'],
    ['Switch_C', 'User_PC'],
  ]) {
    assert.ok(bridgeIds.has(linkId(a, b)), `${a} ↔ ${b} should be a bridge`);
  }
}

function testFailureAndRestore() {
  const graph = NetworkGraph.sample();
  const fail = graph.failDevice('Dist_Router_1');
  assert.equal(fail.ok, true);
  assert.equal(graph.findPath('Admin_PC', 'Web_Server').found, false);

  const components = graph.connectedComponents();
  assert.equal(components.count, 2);
  const sizes = components.components.map((c) => c.nodes.length).sort((a, b) => a - b);
  assert.deepEqual(sizes, [4, 5]);
  assert.equal(graph.isDeviceActive('Dist_Router_1'), false);

  assert.equal(graph.restoreDevice('Dist_Router_1').ok, true);
  assert.equal(graph.findPath('Admin_PC', 'Web_Server').hops, 6);
  assert.equal(graph.connectedComponents().count, 1);
}

function testLinkCut() {
  const graph = NetworkGraph.sample();
  assert.equal(graph.failLink('Switch_A', 'Web_Server').ok, true);
  assert.equal(graph.findPath('Admin_PC', 'Web_Server').found, false);
  const adjacency = graph.snapshot().adjacency;
  const switchA = adjacency.find((entry) => entry.name === 'Switch_A')!;
  const webLink = switchA.neighbors.find((neighbor) => neighbor.name === 'Web_Server')!;
  assert.equal(webLink.linkActive, false);

  assert.equal(graph.restoreLink('Switch_A', 'Web_Server').ok, true);
  assert.equal(graph.findPath('Admin_PC', 'Web_Server').found, true);

  // The redundant link is not itself a bridge, but cutting it removes the only
  // cycle between R1–SwA–SwB, so two more links become critical (7 → 9).
  assert.equal(graph.failLink('Switch_A', 'Switch_B').ok, true);
  assert.equal(graph.connectedComponents().count, 1);
  const afterCut = graph.vulnerabilityAnalysis();
  assert.equal(afterCut.bridges.length, 9);
  const ids = new Set(afterCut.bridges.map((bridge) => bridge.id));
  assert.ok(ids.has(linkId('Dist_Router_1', 'Switch_A')));
  assert.ok(ids.has(linkId('Dist_Router_1', 'Switch_B')));
}

function testDemoClone() {
  const graph = NetworkGraph.sample();
  const clone = graph.clone();
  clone.failDevice('Dist_Router_1');
  assert.equal(graph.isDeviceActive('Dist_Router_1'), true);
  assert.equal(clone.isDeviceActive('Dist_Router_1'), false);
}

for (const test of [
  testSampleTopology,
  testBfsShortestPath,
  testTarjan,
  testFailureAndRestore,
  testLinkCut,
  testDemoClone,
]) {
  test();
  console.log(`✓ ${test.name}`);
}
console.log('All graph engine tests passed.');
