import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { NetworkGraph, linkId } from './graph';

/** Build a graph from explicit devices and links, in a single readable line. */
function build(devices: string[], links: Array<[string, string]>): NetworkGraph {
  const graph = new NetworkGraph();
  for (const name of devices) graph.addDevice(name);
  for (const [u, v] of links) graph.addLink(u, v);
  return graph;
}

const CHAIN = ['A', 'B', 'C', 'D'];
const CHAIN_LINKS: Array<[string, string]> = [
  ['A', 'B'],
  ['B', 'C'],
  ['C', 'D'],
];

function bridgeIds(graph: NetworkGraph): Set<string> {
  return new Set(graph.vulnerabilityAnalysis().bridges.map((bridge) => bridge.id));
}

function componentSizes(graph: NetworkGraph): number[] {
  return graph
    .connectedComponents()
    .components.map((component) => component.nodes.length)
    .sort((a, b) => a - b);
}

/* ------------------------------------------------------------------ */
/* A. Basic structure & adjacency list                                  */
/* ------------------------------------------------------------------ */

describe('adjacency list structure', () => {
  it('assigns stable sequential indices and rejects duplicate or empty names', () => {
    const graph = NetworkGraph.sample();
    assert.equal(graph.deviceCount, 10);
    assert.deepEqual(graph.deviceNames(), [
      'Core_Router',
      'Dist_Router_1',
      'Dist_Router_2',
      'Switch_A',
      'Switch_B',
      'Switch_C',
      'Web_Server',
      'Db_Server',
      'Admin_PC',
      'User_PC',
    ]);

    assert.equal(graph.addDevice('  Guest_PC  '), true, 'trimmed name is accepted');
    assert.equal(graph.deviceCount, 11);
    const guest = graph.snapshot().devices.find((device) => device.name === 'Guest_PC');
    assert.ok(guest, 'device is stored under its trimmed name');
    assert.equal(guest.index, 10, 'new vertex gets the next free index, never a reused one');

    assert.equal(graph.addDevice('Guest_PC'), false, 'duplicate name is rejected');
    assert.equal(graph.addDevice('   '), false, 'blank name is rejected');
    assert.equal(graph.deviceCount, 11);
  });

  it('registers every link in both adjacency lists', () => {
    const graph = build(['A', 'B', 'C'], [
      ['A', 'B'],
      ['B', 'C'],
    ]);
    const adjacency = graph.snapshot().adjacency;

    const rowA = adjacency.find((entry) => entry.name === 'A')!;
    const rowB = adjacency.find((entry) => entry.name === 'B')!;
    assert.deepEqual(rowA.neighbors.map((neighbor) => neighbor.name), ['B']);
    assert.deepEqual(rowB.neighbors.map((neighbor) => neighbor.name), ['A', 'C'], 'neighbours follow link insertion order');
    assert.equal(rowA.activeNeighborCount, 1);
    assert.equal(rowB.activeNeighborCount, 2);
    assert.equal(
      adjacency.reduce((sum, entry) => sum + entry.neighbors.length, 0),
      4,
      'one undirected edge contributes two adjacency entries',
    );
  });

  it('rejects duplicate links, self-loops, and links to unknown devices', () => {
    const graph = build(['A', 'B'], [['A', 'B']]);

    assert.equal(graph.addLink('A', 'B'), false, 'duplicate link in the same direction');
    assert.equal(graph.addLink('B', 'A'), false, 'duplicate link in reverse direction');
    assert.equal(graph.addLink('A', 'A'), false, 'self-loop');
    assert.equal(graph.addLink('A', 'Missing'), false, 'unknown endpoint');

    assert.equal(graph.snapshot().links.length, 1);
    assert.equal(graph.failLink('A', 'Missing').ok, false);
    assert.equal(graph.restoreLink('A', 'A').ok, false);
  });

  it('serializes the adjacency list with names, indices, and neighbour state', () => {
    const graph = NetworkGraph.sample();
    const snapshot = graph.snapshot();

    assert.equal(snapshot.adjacency.length, 10);
    const switchC = snapshot.adjacency.find((entry) => entry.name === 'Switch_C')!;
    assert.equal(switchC.index, 5);
    assert.equal(switchC.active, true);
    assert.deepEqual(
      switchC.neighbors.map((neighbor) => neighbor.name),
      ['Dist_Router_2', 'Admin_PC', 'User_PC'],
    );
    for (const neighbor of switchC.neighbors) {
      assert.equal(neighbor.linkActive, true);
      assert.equal(neighbor.deviceActive, true);
      assert.equal(neighbor.active, true);
    }

    const roundTrip = NetworkGraph.fromData(graph.toData());
    assert.equal(roundTrip.deviceCount, graph.deviceCount);
    assert.deepEqual(roundTrip.toData(), graph.toData());
    assert.equal(roundTrip.snapshot().metrics.activeLinks, 10);
  });

  it('keeps a failed device in the physical rows but excludes it from active counts', () => {
    const graph = NetworkGraph.sample();
    graph.failDevice('Web_Server');

    const adjacency = graph.snapshot().adjacency;
    const switchA = adjacency.find((entry) => entry.name === 'Switch_A')!;
    const webLink = switchA.neighbors.find((neighbor) => neighbor.name === 'Web_Server')!;
    assert.equal(webLink.linkActive, true, 'the cable itself is still installed');
    assert.equal(webLink.deviceActive, false, 'the device behind it is down');
    assert.equal(webLink.active, false, 'traffic cannot cross the link');
    assert.equal(switchA.activeNeighborCount, 2, 'only Dist_Router_1 and Switch_B remain reachable');

    const webRow = adjacency.find((entry) => entry.name === 'Web_Server')!;
    assert.equal(webRow.active, false);
    assert.equal(webRow.activeNeighborCount, 1, 'its cable still reaches the active Switch_A');
    const webDevice = graph.snapshot().devices.find((device) => device.name === 'Web_Server')!;
    assert.equal(webDevice.physicalDegree, 1, 'the server is still wired to Switch_A');
    assert.equal(webDevice.active, false);

    const snapshot = graph.snapshot();
    assert.equal(snapshot.metrics.activeDevices, 9);
    for (const component of graph.connectedComponents().components) {
      assert.equal(component.nodes.includes('Web_Server'), false, 'down devices are not traversed');
    }
    assert.equal(graph.findPath('Web_Server', 'Db_Server').found, false);
  });
});

/* ------------------------------------------------------------------ */
/* B. Isolated & disconnected cases                                     */
/* ------------------------------------------------------------------ */

describe('isolated and disconnected graphs', () => {
  it('treats a single isolated device as its own connected component', () => {
    const graph = build(['A', 'B', 'Lonely'], [['A', 'B']]);
    const components = graph.connectedComponents();

    assert.equal(components.count, 2);
    assert.deepEqual(componentSizes(graph), [1, 2]);
    assert.deepEqual(
      components.components.find((component) => component.nodes.length === 1)!.nodes,
      ['Lonely'],
    );
    assert.equal(graph.findPath('Lonely', 'A').found, false);
    assert.equal(graph.vulnerabilityAnalysis().bridges.length, 1, 'A ↔ B is still a bridge');
    assert.equal(graph.vulnerabilityAnalysis().articulationPoints.length, 0);
  });

  it('counts every isolated device as a separate component', () => {
    const graph = build(['A', 'B', 'C', 'D'], [['A', 'B']]);
    assert.equal(graph.connectedComponents().count, 3);
    assert.deepEqual(componentSizes(graph), [1, 1, 2]);
    assert.equal(graph.snapshot().metrics.components, 3);
  });

  it('reports V components and no critical elements for an edgeless graph', () => {
    const graph = build(['A', 'B', 'C'], []);
    const vulnerabilities = graph.vulnerabilityAnalysis();

    assert.equal(graph.connectedComponents().count, 3);
    assert.equal(vulnerabilities.bridges.length, 0);
    assert.equal(vulnerabilities.articulationPoints.length, 0);
    assert.equal(graph.findPath('A', 'B').found, false);
    assert.equal(graph.snapshot().metrics.activeLinks, 0);
  });

  it('leaves exactly one active component when only a single device is up', () => {
    const graph = build(['A', 'B', 'C'], [
      ['A', 'B'],
      ['B', 'C'],
    ]);
    graph.failDevice('B');
    graph.failDevice('C');

    const components = graph.connectedComponents();
    assert.equal(components.count, 1);
    assert.deepEqual(components.components[0].nodes, ['A']);
    assert.deepEqual(components.inactiveDevices, ['B', 'C']);
    assert.equal(graph.snapshot().metrics.activeDevices, 1);
  });
});

/* ------------------------------------------------------------------ */
/* C. Topology shapes                                                    */
/* ------------------------------------------------------------------ */

describe('topology shapes', () => {
  it('exposes every internal device and every link of a chain as critical', () => {
    const graph = build(CHAIN, CHAIN_LINKS);
    const vulnerabilities = graph.vulnerabilityAnalysis();

    assert.equal(vulnerabilities.bridges.length, 3);
    assert.deepEqual(new Set(vulnerabilities.articulationPoints), new Set(['B', 'C']));
    assert.equal(
      graph.findPath('A', 'D').hops,
      3,
      'BFS must follow the whole chain, one hop per edge',
    );
    assert.equal(graph.connectedComponents().count, 1);

    graph.failLink('B', 'C');
    assert.equal(graph.connectedComponents().count, 2, 'any chain link is a cut link');
    assert.deepEqual(componentSizes(graph), [2, 2]);
  });

  it('finds no bridges and no articulation points in a ring', () => {
    const graph = build(CHAIN, [
      ['A', 'B'],
      ['B', 'C'],
      ['C', 'D'],
      ['D', 'A'],
    ]);
    const vulnerabilities = graph.vulnerabilityAnalysis();

    assert.equal(vulnerabilities.bridges.length, 0);
    assert.equal(vulnerabilities.articulationPoints.length, 0);
    assert.equal(graph.findPath('A', 'C').hops, 2, 'BFS takes the shorter arc of the cycle');

    graph.failDevice('B');
    assert.equal(graph.connectedComponents().count, 1, 'a ring survives one failed vertex');
    assert.equal(graph.findPath('A', 'C').hops, 2, 'traffic reroutes A → D → C around the failed vertex');
  });

  it('concentrates all criticality in the hub of a star', () => {
    const graph = build(['Hub', 'L1', 'L2', 'L3'], [
      ['Hub', 'L1'],
      ['Hub', 'L2'],
      ['Hub', 'L3'],
    ]);
    const vulnerabilities = graph.vulnerabilityAnalysis();

    assert.deepEqual(vulnerabilities.articulationPoints, ['Hub']);
    assert.equal(vulnerabilities.bridges.length, 3);
    assert.equal(graph.findPath('L1', 'L2').hops, 2);

    graph.failDevice('L1');
    assert.equal(graph.connectedComponents().count, 1, 'losing a leaf does not partition a star');
    assert.equal(graph.findPath('L2', 'L3').hops, 2, 'remaining leaves still reach each other');

    graph.restoreDevice('L1');
    graph.failDevice('Hub');
    assert.equal(graph.connectedComponents().count, 3, 'losing the hub isolates every leaf');
  });

  it('removes the last bridge and articulation point when a redundant link is added', () => {
    const graph = build(['A', 'B', 'C', 'D'], [
      ['A', 'B'],
      ['B', 'C'],
      ['C', 'A'],
      ['C', 'D'],
    ]);
    assert.deepEqual(bridgeIds(graph), new Set([linkId('C', 'D')]));
    assert.deepEqual(graph.vulnerabilityAnalysis().articulationPoints, ['C']);
    assert.equal(componentSizes(graph)[0], 4);

    assert.equal(graph.addLink('A', 'D'), true);
    assert.equal(graph.vulnerabilityAnalysis().bridges.length, 0);
    assert.equal(graph.vulnerabilityAnalysis().articulationPoints.length, 0);
    assert.equal(graph.snapshot().metrics.links, 5, 'the redundant link joins the edge set');
    assert.equal(graph.findPath('B', 'D').hops, 2, 'the cycle also shortens some routes');
  });
});

/* ------------------------------------------------------------------ */
/* D. Failure & restoration                                              */
/* ------------------------------------------------------------------ */

describe('failure and restoration', () => {
  it('keeps the network connected when a leaf device fails', () => {
    const graph = NetworkGraph.sample();
    graph.failDevice('Web_Server');

    assert.equal(graph.connectedComponents().count, 1);
    assert.equal(graph.snapshot().metrics.activeDevices, 9);
    assert.equal(graph.findPath('Web_Server', 'Db_Server').found, false);
    assert.equal(graph.findPath('Admin_PC', 'Db_Server').found, true, 'unrelated traffic is unaffected');
  });

  it('partitions the network when a critical device fails', () => {
    const graph = NetworkGraph.sample();
    const result = graph.failDevice('Dist_Router_1');

    assert.equal(result.ok, true);
    assert.match(result.message, /HAS FAILED/);
    assert.equal(graph.connectedComponents().count, 2);
    assert.deepEqual(componentSizes(graph), [4, 5]);
    assert.equal(graph.findPath('Admin_PC', 'Web_Server').found, false);
    assert.equal(graph.isDeviceActive('Dist_Router_1'), false);
  });

  it('isolates the device behind a failed bridge link', () => {
    const graph = NetworkGraph.sample();
    assert.equal(graph.failLink('Switch_A', 'Web_Server').ok, true);

    assert.equal(graph.connectedComponents().count, 2);
    assert.deepEqual(componentSizes(graph), [1, 9]);

    const snapshot = graph.snapshot();
    const webRow = snapshot.adjacency.find((entry) => entry.name === 'Web_Server')!;
    assert.equal(webRow.activeNeighborCount, 0, 'the edge is erased from the traversal adjacency list');
    assert.equal(webRow.neighbors[0].active, false, 'the catalog still reports the cut link');
    assert.equal(
      snapshot.devices.find((device) => device.name === 'Web_Server')!.physicalDegree,
      1,
      'the cable is remembered in the link catalog',
    );

    const switchA = graph.snapshot().adjacency.find((entry) => entry.name === 'Switch_A')!;
    const cutNeighbor = switchA.neighbors.find((neighbor) => neighbor.name === 'Web_Server')!;
    assert.equal(cutNeighbor.linkActive, false, 'the teaching view still shows the cut cable');
    assert.equal(cutNeighbor.active, false, 'but traffic can no longer cross it');
    assert.equal(
      switchA.activeNeighborCount,
      2,
      'Switch_A still reaches Dist_Router_1 and Switch_B',
    );
  });

  it('compounds the outage when a device and a link fail together', () => {
    const graph = NetworkGraph.sample();
    graph.failDevice('Dist_Router_1');
    graph.failLink('Switch_A', 'Web_Server');

    assert.equal(graph.connectedComponents().count, 3);
    assert.deepEqual(componentSizes(graph), [1, 3, 5]);
    assert.equal(graph.findPath('Admin_PC', 'Web_Server').found, false);
    assert.equal(graph.findPath('Switch_A', 'Db_Server').found, true, 'the access pair still talks internally');
  });

  it('returns the original connectivity after restoring a failed device', () => {
    const graph = NetworkGraph.sample();
    const before = graph.toData();

    graph.failDevice('Dist_Router_1');
    const restored = graph.restoreDevice('Dist_Router_1');

    assert.equal(restored.ok, true);
    assert.match(restored.message, /RESTORED/);
    assert.equal(graph.connectedComponents().count, 1);
    assert.equal(graph.findPath('Admin_PC', 'Web_Server').hops, 6);
    assert.deepEqual(graph.toData(), before, 'the graph is identical to its pre-failure state');
  });

  it('returns the original connectivity after restoring a cut link', () => {
    const graph = NetworkGraph.sample();

    graph.failLink('Switch_A', 'Switch_B');
    assert.equal(graph.connectedComponents().count, 1, 'the redundant link is not needed for connectivity');
    assert.equal(graph.vulnerabilityAnalysis().bridges.length, 9);

    assert.equal(graph.restoreLink('Switch_A', 'Switch_B').ok, true);
    assert.equal(graph.vulnerabilityAnalysis().bridges.length, 7);
    assert.equal(graph.findPath('Admin_PC', 'Web_Server').hops, 6);
    assert.equal(graph.snapshot().metrics.activeLinks, 10);
  });

  it('rejects duplicate failures and restores without changing the graph', () => {
    const graph = NetworkGraph.sample();
    assert.equal(graph.failDevice('Core_Router').ok, true);
    assert.equal(graph.failDevice('Core_Router').ok, false);
    assert.match(graph.failDevice('Core_Router').message, /already DOWN/);
    assert.equal(graph.findPath('Admin_PC', 'Web_Server').found, false);

    assert.equal(graph.restoreDevice('Core_Router').ok, true);
    assert.equal(graph.restoreDevice('Core_Router').ok, false);
    assert.match(graph.restoreDevice('Core_Router').message, /already UP/);

    assert.equal(graph.failLink('Switch_A', 'Web_Server').ok, true);
    assert.equal(graph.failLink('Web_Server', 'Switch_A').ok, false, 'endpoint order does not matter');
    assert.equal(graph.restoreLink('Switch_A', 'Web_Server').ok, true);
    assert.equal(graph.restoreLink('Switch_A', 'Web_Server').ok, false);
  });

  it('reports descriptive errors for unknown devices and missing links', () => {
    const graph = NetworkGraph.sample();

    const missing = graph.failDevice('Ghost_Router');
    assert.equal(missing.ok, false);
    assert.match(missing.message, /not found/);
    assert.equal(graph.restoreDevice('Ghost_Router').ok, false);

    const noLink = graph.failLink('Web_Server', 'Db_Server');
    assert.equal(noLink.ok, false);
    assert.match(noLink.message, /No link exists/);
    assert.equal(graph.failLink('Web_Server', 'Ghost_Router').ok, false);
  });
});

/* ------------------------------------------------------------------ */
/* E. Algorithm correctness                                             */
/* ------------------------------------------------------------------ */

describe('algorithm correctness', () => {
  it('reconstructs the exact six-hop sample route with BFS', () => {
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
    assert.equal(result.visitedOrder.at(-1), 'Web_Server', 'BFS stops as soon as the target is dequeued');
    assert.equal(result.complexity, 'O(V + E)');
    assert.equal(result.path.length - 1, result.hops);
  });

  it('returns a zero-hop path when source and destination are the same device', () => {
    const graph = NetworkGraph.sample();
    const result = graph.findPath('User_PC', 'User_PC');

    assert.equal(result.found, true);
    assert.equal(result.hops, 0);
    assert.deepEqual(result.path, ['User_PC']);
  });

  it('refuses to route when an endpoint is DOWN', () => {
    const graph = NetworkGraph.sample();
    graph.failDevice('Web_Server');

    const destinationDown = graph.findPath('Admin_PC', 'Web_Server');
    assert.equal(destinationDown.found, false);
    assert.deepEqual(destinationDown.path, []);
    assert.match(destinationDown.message, /DOWN/);

    graph.failDevice('Admin_PC');
    const bothDown = graph.findPath('Admin_PC', 'Web_Server');
    assert.equal(bothDown.found, false);
    assert.match(bothDown.message, /DOWN/);
  });

  it('reports NO PATH after the only route is destroyed by a critical failure', () => {
    const graph = NetworkGraph.sample();
    graph.failDevice('Dist_Router_1');

    const result = graph.findPath('Admin_PC', 'Web_Server');
    assert.equal(result.found, false);
    assert.match(result.message, /NO PATH/);
    assert.ok(result.visitedOrder.includes('Admin_PC'));
    assert.equal(
      result.visitedOrder.includes('Web_Server'),
      false,
      'the search never reached the far side of the partition',
    );
  });

  it('reroutes around a failed device when a redundant path exists', () => {
    // Diamond: A reaches D through B or C.
    const graph = build(['A', 'B', 'C', 'D'], [
      ['A', 'B'],
      ['A', 'C'],
      ['B', 'D'],
      ['C', 'D'],
    ]);
    assert.equal(graph.findPath('A', 'D').hops, 2);
    assert.equal(graph.vulnerabilityAnalysis().articulationPoints.length, 0);

    graph.failDevice('B');
    const rerouted = graph.findPath('A', 'D');
    assert.equal(rerouted.found, true);
    assert.deepEqual(rerouted.path, ['A', 'C', 'D'], 'BFS uses the surviving branch of the diamond');
    assert.equal(graph.connectedComponents().count, 1);
  });

  it("finds the sample topology's six articulation points and seven bridges with Tarjan", () => {
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
    const ids = new Set(result.bridges.map((bridge) => bridge.id));
    for (const [a, b] of [
      ['Core_Router', 'Dist_Router_1'],
      ['Core_Router', 'Dist_Router_2'],
      ['Dist_Router_2', 'Switch_C'],
      ['Switch_A', 'Web_Server'],
      ['Switch_B', 'Db_Server'],
      ['Switch_C', 'Admin_PC'],
      ['Switch_C', 'User_PC'],
    ]) {
      assert.ok(ids.has(linkId(a, b)), `${a} ↔ ${b} should be a bridge`);
    }

    assert.equal(ids.has(linkId('Switch_A', 'Switch_B')), false, 'the redundant link is not a bridge');
    assert.equal(ids.has(linkId('Dist_Router_1', 'Switch_A')), false, 'the cycle protects this link');
    assert.equal(ids.has(linkId('Dist_Router_1', 'Switch_B')), false, 'the cycle protects this link too');
    assert.equal(result.complexity, 'O(V + E)');
  });

  it('finds no critical elements in a complete graph', () => {
    const devices = ['A', 'B', 'C', 'D', 'E'];
    const links: Array<[string, string]> = [];
    for (let i = 0; i < devices.length; i += 1) {
      for (let j = i + 1; j < devices.length; j += 1) links.push([devices[i], devices[j]]);
    }
    const graph = build(devices, links);
    const vulnerabilities = graph.vulnerabilityAnalysis();

    assert.equal(graph.snapshot().metrics.links, 10, 'K5 has 10 edges');
    assert.equal(vulnerabilities.bridges.length, 0);
    assert.equal(vulnerabilities.articulationPoints.length, 0);
    assert.equal(graph.findPath('A', 'E').hops, 1);
    assert.equal(graph.connectedComponents().count, 1);

    graph.failDevice('C');
    assert.equal(graph.connectedComponents().count, 1, 'a complete graph survives any single failure');
    assert.equal(graph.findPath('A', 'E').hops, 1);
  });

  it('enumerates every bridge of a linear chain exactly once', () => {
    const graph = build(['A', 'B', 'C', 'D', 'E'], [
      ['A', 'B'],
      ['B', 'C'],
      ['C', 'D'],
      ['D', 'E'],
    ]);
    const bridges = graph.vulnerabilityAnalysis().bridges;

    assert.equal(bridges.length, 4);
    assert.equal(new Set(bridges.map((bridge) => bridge.id)).size, 4, 'no duplicate bridge records');
    assert.deepEqual(new Set(bridges.map((bridge) => bridge.id)), new Set([
      linkId('A', 'B'),
      linkId('B', 'C'),
      linkId('C', 'D'),
      linkId('D', 'E'),
    ]));
    assert.deepEqual(new Set(graph.vulnerabilityAnalysis().articulationPoints), new Set(['B', 'C', 'D']));
  });

  it('keeps component counts correct after a partition and a topology extension', () => {
    const graph = NetworkGraph.sample();
    assert.equal(graph.connectedComponents().count, 1);

    graph.failDevice('Dist_Router_1');
    assert.equal(graph.connectedComponents().count, 2);

    graph.addDevice('Guest_PC');
    const afterExtension = graph.connectedComponents();
    assert.equal(afterExtension.count, 3, 'the new isolated device becomes a third component');
    assert.deepEqual(
      afterExtension.components.map((component) => component.nodes.length).sort((a, b) => a - b),
      [1, 4, 5],
    );
  });

  it('visits each reachable device at most once during BFS', () => {
    const graph = build(CHAIN, CHAIN_LINKS);
    const result = graph.findPath('A', 'D');

    assert.equal(result.visitedOrder.length, 4);
    assert.equal(new Set(result.visitedOrder).size, 4, 'no vertex is enqueued twice');
    assert.deepEqual(result.visitedOrder, ['A', 'B', 'C', 'D'], 'FIFO order follows hop distance');
  });

  it('isolates demonstrations from the live network by cloning', () => {
    const graph = NetworkGraph.sample();
    const clone = graph.clone();
    clone.failDevice('Dist_Router_1');
    clone.failLink('Switch_A', 'Web_Server');

    assert.equal(graph.isDeviceActive('Dist_Router_1'), true);
    assert.equal(graph.connectedComponents().count, 1);
    assert.equal(clone.connectedComponents().count, 3);
    assert.equal(graph.findPath('Admin_PC', 'Web_Server').hops, 6);
  });
});
