import { linkId } from './graph';
import type { GraphSnapshot } from './types';

/**
 * ALGORITHM TRACE ENGINE
 *
 * Produces step-by-step teaching traces for the three NetworkGraph algorithms.
 * This module is a *read-only projection*: it consumes a GraphSnapshot and
 * never mutates the graph engine or its adjacency list. Traversal order follows
 * the snapshot's adjacency rows, which preserve link insertion order, so BFS
 * parent selection matches NetworkGraph.findPath().
 */

export type TraceAlgorithm = 'bfs' | 'components' | 'tarjan';
export type TraceNodeState = 'unvisited' | 'frontier' | 'current' | 'visited' | 'down';

export interface TraceEdge {
  u: string;
  v: string;
  id: string;
}

export interface TraceNode {
  name: string;
  state: TraceNodeState;
  disc?: number;
  low?: number;
  parent?: string | null;
  component?: number;
}

export interface TraceStep {
  index: number;
  action: string;
  title: string;
  explanation: string;
  current: string | null;
  queue: string[];
  stack: string[];
  visited: string[];
  nodes: TraceNode[];
  disc: Record<string, number>;
  low: Record<string, number>;
  parent: Record<string, string | null>;
  components: Record<string, number>;
  activeComponent: number | null;
  path: string[] | null;
  focusEdge: TraceEdge | null;
  detectedBridge: TraceEdge | null;
  detectedArticulation: string | null;
  articulationPoints: string[];
  bridges: TraceEdge[];
}

export interface TraceSummary {
  found?: boolean;
  path?: string[];
  hops?: number;
  visitedOrder?: string[];
  components?: Array<{ id: number; nodes: string[] }>;
  count?: number;
  articulationPoints?: string[];
  bridges?: TraceEdge[];
  message?: string;
}

export interface TraceResult {
  algorithm: TraceAlgorithm;
  complexity: string;
  source?: string;
  destination?: string;
  steps: TraceStep[];
  summary: TraceSummary;
}

/** Adjacency rows restricted to links that can actually carry traffic. */
function activeAdjacency(snapshot: GraphSnapshot): Map<string, string[]> {
  const adjacency = new Map<string, string[]>();
  for (const entry of snapshot.adjacency) {
    adjacency.set(
      entry.name,
      entry.active ? entry.neighbors.filter((neighbor) => neighbor.active).map((neighbor) => neighbor.name) : [],
    );
  }
  return adjacency;
}

interface PushExtra {
  bridge?: TraceEdge;
  articulation?: string;
}

/** Accumulates trace state and snapshots it into immutable steps. */
class TraceBuilder {
  readonly steps: TraceStep[] = [];
  queue: string[] = [];
  stack: string[] = [];
  visited: string[] = [];
  disc = new Map<string, number>();
  low = new Map<string, number>();
  parent = new Map<string, string | null>();
  components = new Map<string, number>();
  articulationPoints: string[] = [];
  bridges: TraceEdge[] = [];
  current: string | null = null;
  activeComponent: number | null = null;
  path: string[] | null = null;
  focusEdge: TraceEdge | null = null;

  private states = new Map<string, TraceNodeState>();

  constructor(private readonly snapshot: GraphSnapshot, readonly algorithm: TraceAlgorithm) {
    for (const device of snapshot.devices) {
      this.states.set(device.name, device.active ? 'unvisited' : 'down');
    }
  }

  mark(name: string, state: TraceNodeState): void {
    this.states.set(name, state);
  }

  private edge(u: string, v: string): TraceEdge {
    return { u, v, id: linkId(u, v) };
  }

  focus(u: string, v: string): void {
    this.focusEdge = this.edge(u, v);
  }

  clearFocus(): void {
    this.focusEdge = null;
  }

  push(action: string, title: string, explanation: string, extra: PushExtra = {}): void {
    const disc = Object.fromEntries(this.disc) as Record<string, number>;
    const low = Object.fromEntries(this.low) as Record<string, number>;
    const parent = Object.fromEntries(this.parent) as Record<string, string | null>;
    const components = Object.fromEntries(this.components) as Record<string, number>;

    this.steps.push({
      index: this.steps.length,
      action,
      title,
      explanation,
      current: this.current,
      queue: [...this.queue],
      stack: [...this.stack],
      visited: [...this.visited],
      nodes: this.snapshot.devices.map((device) => {
        const node: TraceNode = { name: device.name, state: this.states.get(device.name) ?? 'unvisited' };
        if (disc[device.name] !== undefined) node.disc = disc[device.name];
        if (low[device.name] !== undefined) node.low = low[device.name];
        if (parent[device.name] !== undefined) node.parent = parent[device.name];
        if (components[device.name] !== undefined) node.component = components[device.name];
        return node;
      }),
      disc,
      low,
      parent,
      components,
      activeComponent: this.activeComponent,
      path: this.path ? [...this.path] : null,
      focusEdge: this.focusEdge ? { ...this.focusEdge } : null,
      detectedBridge: extra.bridge ? { ...extra.bridge } : null,
      detectedArticulation: extra.articulation ?? null,
      articulationPoints: [...this.articulationPoints],
      bridges: this.bridges.map((bridge) => ({ ...bridge })),
    });
  }
}

/* ------------------------------------------------------------------ */
/* BFS shortest path                                                   */
/* ------------------------------------------------------------------ */

export function traceBfs(snapshot: GraphSnapshot, source: string, destination: string): TraceResult {
  const builder = new TraceBuilder(snapshot, 'bfs');
  const adjacency = activeAdjacency(snapshot);
  const sourceEntry = snapshot.adjacency.find((entry) => entry.name === source);
  const destinationEntry = snapshot.adjacency.find((entry) => entry.name === destination);

  const finish = (summary: TraceSummary): TraceResult => ({
    algorithm: 'bfs',
    complexity: 'O(V + E)',
    source,
    destination,
    steps: builder.steps,
    summary,
  });

  if (!sourceEntry || !destinationEntry) {
    builder.push('error', 'Unknown device', 'BFS cannot start: the source or destination device does not exist in this topology.');
    return finish({ found: false, path: [], hops: 0, visitedOrder: [], message: 'Unknown source or destination.' });
  }
  if (!sourceEntry.active || !destinationEntry.active) {
    builder.mark(sourceEntry.active ? source : destination, 'down');
    builder.push(
      'blocked',
      'BFS cannot start',
      `${!sourceEntry.active ? source : destination} is DOWN. Traversals skip inactive vertices, so no path can be computed until it is restored.`,
    );
    return finish({ found: false, path: [], hops: 0, visitedOrder: [], message: 'Source or destination is DOWN.' });
  }

  const seen = new Set<string>([source]);
  builder.parent.set(source, null);
  builder.mark(source, 'frontier');
  builder.queue.push(source);
  builder.push(
    'init',
    `Start BFS at ${source}`,
    `Mark ${source} visited (distance 0), record parent[${source}] = null, and enqueue it as the only vertex in the frontier.`,
  );

  let found = false;
  while (builder.queue.length > 0) {
    const node = builder.queue.shift()!;
    builder.current = node;
    builder.mark(node, 'current');
    builder.visited.push(node);
    builder.push(
      'dequeue',
      `Dequeue ${node}`,
      `Remove ${node} from the front of the queue and scan its adjacency list in stored order. Its parent is ${builder.parent.get(node) ?? 'null'}.`,
    );

    if (node === destination) {
      found = true;
      builder.mark(node, 'visited');
      builder.current = null;
      builder.clearFocus();
      builder.push(
        'destination',
        `Destination ${destination} dequeued`,
        `BFS removes vertices in non-decreasing hop distance, so the first dequeue of ${destination} guarantees a shortest route. Reconstruct it by walking parent pointers backwards.`,
      );
      break;
    }

    const neighbors = adjacency.get(node) ?? [];
    for (const neighbor of neighbors) {
      builder.focus(node, neighbor);
      if (seen.has(neighbor)) {
        builder.push(
          'skip',
          `Examine ${node} ↔ ${neighbor}`,
          `${neighbor} is already visited, so this edge cannot shorten any route. BFS ignores it.`,
        );
        continue;
      }
      seen.add(neighbor);
      builder.parent.set(neighbor, node);
      builder.mark(neighbor, 'frontier');
      builder.queue.push(neighbor);
      builder.push(
        'enqueue',
        `Discover ${neighbor}`,
        `${neighbor} is new. Set parent[${neighbor}] = ${node} and append it to the queue; it becomes reachable after one more hop.`,
      );
    }

    builder.mark(node, 'visited');
    builder.current = null;
    builder.clearFocus();
    builder.push(
      'scan-complete',
      `Finished ${node}`,
      `Every neighbour of ${node} has been processed. ${neighbors.length} adjacency entr${neighbors.length === 1 ? 'y was' : 'ies were'} scanned.`,
    );
  }

  if (!found) {
    builder.push(
      'no-path',
      'Queue exhausted — no path',
      `BFS visited every device reachable from ${source} and never discovered ${destination}. A failed device or link separates them.`,
    );
    return finish({
      found: false,
      path: [],
      hops: 0,
      visitedOrder: [...builder.visited],
      message: `NO PATH EXISTS between ${source} and ${destination}.`,
    });
  }

  const path: string[] = [];
  let cursor: string | null = destination;
  while (cursor !== null) {
    path.push(cursor);
    cursor = builder.parent.get(cursor) ?? null;
  }
  path.reverse();
  builder.path = path;
  builder.push(
    'path',
    `Shortest path: ${path.length - 1} hops`,
    `Follow parent[] backwards from ${destination} to ${source}: ${path.join(' → ')}. Fewest-hop route found in O(V + E).`,
  );

  return finish({ found: true, path, hops: path.length - 1, visitedOrder: [...builder.visited] });
}

/* ------------------------------------------------------------------ */
/* Connected components                                                */
/* ------------------------------------------------------------------ */

export function traceComponents(snapshot: GraphSnapshot): TraceResult {
  const builder = new TraceBuilder(snapshot, 'components');
  const adjacency = activeAdjacency(snapshot);
  const seen = new Set<string>();
  const components: Array<{ id: number; nodes: string[] }> = [];
  let componentId = 0;

  const finish = (): TraceResult => ({
    algorithm: 'components',
    complexity: 'O(V + E)',
    steps: builder.steps,
    summary: { components, count: components.length },
  });

  for (const entry of snapshot.adjacency) {
    if (!entry.active || seen.has(entry.name)) continue;

    componentId += 1;
    const nodes: string[] = [];
    builder.activeComponent = componentId;
    seen.add(entry.name);
    builder.components.set(entry.name, componentId);
    builder.mark(entry.name, 'frontier');
    builder.queue.push(entry.name);
    builder.push(
      'component-start',
      `Component ${componentId} starts at ${entry.name}`,
      `${entry.name} is the first unvisited active device. A new BFS flood fill begins, and its component id is ${componentId}.`,
    );

    while (builder.queue.length > 0) {
      const node = builder.queue.shift()!;
      builder.current = node;
      builder.mark(node, 'current');
      builder.visited.push(node);
      nodes.push(node);
      builder.push(
        'dequeue',
        `Visit ${node} (component ${componentId})`,
        `Dequeue ${node}, assign it to component ${componentId}, and flood into its active neighbours.`,
      );

      for (const neighbor of adjacency.get(node) ?? []) {
        builder.focus(node, neighbor);
        if (seen.has(neighbor)) {
          builder.push(
            'skip',
            `Examine ${node} ↔ ${neighbor}`,
            `${neighbor} already belongs to a component, so the flood fill does not cross this edge again.`,
          );
          continue;
        }
        seen.add(neighbor);
        builder.components.set(neighbor, componentId);
        builder.mark(neighbor, 'frontier');
        builder.queue.push(neighbor);
        builder.push(
          'discover',
          `Add ${neighbor} to component ${componentId}`,
          `${neighbor} is reachable from ${node}, so it joins component ${componentId} and is enqueued for expansion.`,
        );
      }

      builder.mark(node, 'visited');
      builder.current = null;
      builder.clearFocus();
    }

    components.push({ id: componentId, nodes: [...nodes] });
    builder.activeComponent = null;
    builder.push(
      'component-complete',
      `Component ${componentId} complete`,
      `${nodes.length} device${nodes.length === 1 ? '' : 's'} form this subnetwork: ${nodes.join(', ')}. No remaining edge connects them to another component.`,
    );
  }

  if (components.length === 0) {
    builder.push('complete', 'No active devices', 'Every device is DOWN, so there is no component to discover.');
  } else {
    builder.push(
      'complete',
      `${components.length} component${components.length === 1 ? '' : 's'} detected`,
      `Each active device was assigned to exactly one flood fill, so the total work is O(V + E). Inactive devices are excluded entirely.`,
    );
  }

  return finish();
}

/* ------------------------------------------------------------------ */
/* Tarjan bridges + articulation points                                */
/* ------------------------------------------------------------------ */

export function traceTarjan(snapshot: GraphSnapshot): TraceResult {
  const builder = new TraceBuilder(snapshot, 'tarjan');
  const adjacency = activeAdjacency(snapshot);
  let time = 0;

  const finish = (): TraceResult => ({
    algorithm: 'tarjan',
    complexity: 'O(V + E)',
    steps: builder.steps,
    summary: {
      articulationPoints: [...builder.articulationPoints],
      bridges: builder.bridges.map((bridge) => ({ ...bridge })),
    },
  });

  const dfs = (u: string, isRoot: boolean): void => {
    time += 1;
    builder.disc.set(u, time);
    builder.low.set(u, time);
    // The parent stays on the DFS stack, so demote it from "current" to
    // "frontier" before the child becomes the active vertex.
    if (builder.current) builder.mark(builder.current, 'frontier');
    builder.stack.push(u);
    builder.current = u;
    builder.mark(u, 'current');
    builder.push(
      'discover',
      `Discover ${u}`,
      `Assign disc[${u}] = ${time} and low[${u}] = ${time}. Push ${u} onto the DFS stack and explore its adjacency list.`,
    );

    let children = 0;
    for (const v of adjacency.get(u) ?? []) {
      builder.focus(u, v);

      if (!builder.disc.has(v)) {
        children += 1;
        builder.parent.set(v, u);
        builder.push(
          'tree-edge',
          `Tree edge ${u} ↔ ${v}`,
          `${v} is still undiscovered, so ${u} → ${v} becomes a DFS tree edge. Recurse into ${v}.`,
        );

        dfs(v, false);

        const previousLow = builder.low.get(u)!;
        const nextLow = Math.min(previousLow, builder.low.get(v)!);
        builder.low.set(u, nextLow);
        builder.push(
          'low-update',
          `Return to ${u}`,
          `Back from ${v}: low[${u}] = min(${previousLow}, low[${v}] = ${builder.low.get(v)}) = ${nextLow}.`,
        );

        if (builder.low.get(v)! > builder.disc.get(u)!) {
          const bridge: TraceEdge = { u, v, id: linkId(u, v) };
          builder.bridges.push(bridge);
          builder.push(
            'bridge',
            `Bridge detected: ${u} ↔ ${v}`,
            `low[${v}] = ${builder.low.get(v)} > disc[${u}] = ${builder.disc.get(u)}. The subtree at ${v} has no back edge to ${u} or above, so cutting this link isolates it.`,
            { bridge },
          );
        }

        const isArticulation = isRoot ? children > 1 : builder.low.get(v)! >= builder.disc.get(u)!;
        if (isArticulation && !builder.articulationPoints.includes(u)) {
          builder.articulationPoints.push(u);
          builder.push(
            'articulation',
            `Articulation point detected: ${u}`,
            isRoot
              ? `${u} is the DFS root with ${children} independent children. Removing it separates those DFS branches, so it is an articulation point.`
              : `low[${v}] = ${builder.low.get(v)} >= disc[${u}] = ${builder.disc.get(u)}. ${v}'s subtree can only reconnect through ${u}, so removing ${u} splits the graph.`,
            { articulation: u },
          );
        }
      } else if (v !== builder.parent.get(u)) {
        const previousLow = builder.low.get(u)!;
        const nextLow = Math.min(previousLow, builder.disc.get(v)!);
        builder.low.set(u, nextLow);
        builder.push(
          'back-edge',
          `Back edge ${u} ↔ ${v}`,
          `${v} is already discovered and is not the parent of ${u}, so ${u} ↔ ${v} is a back edge. low[${u}] = min(${previousLow}, disc[${v}] = ${builder.disc.get(v)}) = ${nextLow}.`,
        );
      } else {
        builder.push(
          'skip-parent',
          `Skip ${u} ↔ ${v}`,
          `${v} is the parent of ${u}. The reverse direction of a tree edge is ignored; only true back edges lower low[].`,
        );
      }
    }

    builder.stack.pop();
    builder.mark(u, 'visited');
    builder.current = builder.stack.at(-1) ?? null;
    if (builder.current) builder.mark(builder.current, 'current');
    builder.clearFocus();
    builder.push(
      'finish',
      `Finish ${u}`,
      `DFS at ${u} is complete: disc[${u}] = ${builder.disc.get(u)}, low[${u}] = ${builder.low.get(u)}. Pop it from the DFS stack.`,
    );
  };

  for (const entry of snapshot.adjacency) {
    if (!entry.active || builder.disc.has(entry.name)) continue;
    builder.parent.set(entry.name, null);
    builder.push(
      'root',
      `New DFS root: ${entry.name}`,
      `${entry.name} is active and undiscovered, so a fresh Tarjan DFS starts here. Its parent stays null, which makes it a root for the articulation-point rule.`,
    );
    dfs(entry.name, true);
  }

  if (builder.steps.length === 0) {
    builder.push('complete', 'No active devices', 'Every device is DOWN, so Tarjan has nothing to traverse.');
  } else {
    builder.push(
      'complete',
      `${builder.bridges.length} bridge${builder.bridges.length === 1 ? '' : 's'}, ${builder.articulationPoints.length} articulation point${builder.articulationPoints.length === 1 ? '' : 's'}`,
      `One DFS classified every edge and vertex: ${builder.articulationPoints.length} articulation point(s) and ${builder.bridges.length} bridge(s). The whole audit is O(V + E).`,
    );
  }

  return finish();
}
