import {
  BFS_COMPLEXITY,
  COMPONENTS_COMPLEXITY,
  TARJAN_COMPLEXITY,
  SAMPLE_DEVICES,
  SAMPLE_LINKS,
  type AdjacencyEntry,
  type ArticulationResult,
  type ComponentsResult,
  type DeviceView,
  type GraphData,
  type GraphMetrics,
  type GraphSnapshot,
  type LinkView,
  type PathResult,
} from './types';

/** Stable identifier for an undirected link (independent of endpoint order). */
export function linkId(a: string, b: string): string {
  return [a, b].sort().join('~');
}

/**
 * ADJACENCY-LIST NETWORK GRAPH
 *
 * Ported 1:1 from the C++ `NetworkGraph` class in Mini_project.cpp.
 *
 *   nameToIndex : unordered_map<string,int>  -> Map<string, number>
 *   indexToName : vector<string>             -> string[]
 *   adjList     : vector<vector<int>>        -> number[][]
 *   activeVertices : vector<bool>            -> boolean[]
 *   failedLinks : vector<pair<int,int>>      -> link catalog with active flags
 *
 * Indexes are never re-used or shifted, exactly like the original, so device
 * names and adjacency indexes stay stable for the whole run.
 */
export class NetworkGraph {
  private nameToIndex = new Map<string, number>();
  private indexToName: string[] = [];
  private adjList: number[][] = [];
  private activeVertices: boolean[] = [];

  /**
   * Physical link catalog (insertion ordered). The adjacency list only holds
   * links that are up; this catalog additionally remembers cut links so the UI
   * can draw and restore them.
   */
  private links: Array<{ u: number; v: number; active: boolean }> = [];
  private linkIndex = new Map<string, number>();
  private updatedAt = new Date().toISOString();

  /** Build the exact topology seeded by buildSampleTopology() in the C++ code. */
  static sample(): NetworkGraph {
    const graph = new NetworkGraph();
    for (const name of SAMPLE_DEVICES) graph.addDevice(name);
    for (const [u, v] of SAMPLE_LINKS) graph.addLink(u, v);
    return graph;
  }

  static fromData(data: GraphData): NetworkGraph {
    const graph = new NetworkGraph();
    for (const device of data.devices) graph.addDevice(device.name);
    for (const link of data.links) graph.addLink(link.u, link.v);
    for (const link of data.links) {
      if (!link.active) graph.failLink(link.u, link.v);
    }
    for (const device of data.devices) {
      if (!device.active) graph.failDevice(device.name);
    }
    return graph;
  }

  clone(): NetworkGraph {
    return NetworkGraph.fromData(this.toData());
  }

  get deviceCount(): number {
    return this.indexToName.length;
  }

  get updatedTimestamp(): string {
    return this.updatedAt;
  }

  private touch(): void {
    this.updatedAt = new Date().toISOString();
  }

  hasDevice(name: string): boolean {
    return this.nameToIndex.has(name);
  }

  isDeviceActive(name: string): boolean {
    const index = this.nameToIndex.get(name);
    return index !== undefined && this.activeVertices[index] === true;
  }

  deviceNames(): string[] {
    return [...this.indexToName];
  }

  /** Add a device (Vertex). Returns false if the name already exists. */
  addDevice(name: string): boolean {
    const clean = name.trim();
    if (!clean || this.nameToIndex.has(clean)) return false;

    this.nameToIndex.set(clean, this.indexToName.length);
    this.indexToName.push(clean);
    this.adjList.push([]);
    this.activeVertices.push(true);
    this.touch();
    return true;
  }

  /**
   * Add a physical bidirectional link (Undirected Edge).
   * Self-loops and duplicate links are rejected, as in the C++ addLink().
   */
  addLink(u: string, v: string): boolean {
    const uIdx = this.nameToIndex.get(u);
    const vIdx = this.nameToIndex.get(v);
    if (uIdx === undefined || vIdx === undefined || uIdx === vIdx) return false;
    const key = linkId(u, v);
    if (this.linkIndex.has(key)) return false;

    this.adjList[uIdx].push(vIdx);
    this.adjList[vIdx].push(uIdx);
    this.linkIndex.set(key, this.links.length);
    this.links.push({ u: uIdx, v: vIdx, active: true });
    this.touch();
    return true;
  }

  /** Mark a device DOWN. Its adjacency list is retained, like the original. */
  failDevice(name: string): { ok: boolean; message: string } {
    const idx = this.nameToIndex.get(name);
    if (idx === undefined) return { ok: false, message: `Device '${name}' was not found.` };
    if (!this.activeVertices[idx]) return { ok: false, message: `Device '${name}' is already DOWN.` };

    this.activeVertices[idx] = false;
    this.touch();
    return { ok: true, message: `[SIMULATION] Device '${name}' HAS FAILED (DOWN).` };
  }

  /** Restore a device to UP. */
  restoreDevice(name: string): { ok: boolean; message: string } {
    const idx = this.nameToIndex.get(name);
    if (idx === undefined) return { ok: false, message: `Device '${name}' was not found.` };
    if (this.activeVertices[idx]) return { ok: false, message: `Device '${name}' is already UP.` };

    this.activeVertices[idx] = true;
    this.touch();
    return { ok: true, message: `[SIMULATION] Device '${name}' HAS BEEN RESTORED (UP).` };
  }

  /** Cut a link by removing it from both adjacency lists. */
  failLink(u: string, v: string): { ok: boolean; message: string } {
    const uIdx = this.nameToIndex.get(u);
    const vIdx = this.nameToIndex.get(v);
    if (uIdx === undefined || vIdx === undefined) {
      return { ok: false, message: 'Cannot fail link: one or both devices were not found.' };
    }
    const catalogIndex = this.linkIndex.get(linkId(u, v));
    if (catalogIndex === undefined) {
      return { ok: false, message: `No link exists between '${u}' and '${v}'.` };
    }
    const link = this.links[catalogIndex];
    if (!link.active) {
      return { ok: false, message: `Link between '${u}' and '${v}' is already DOWN.` };
    }

    this.adjList[uIdx] = this.adjList[uIdx].filter((n) => n !== vIdx);
    this.adjList[vIdx] = this.adjList[vIdx].filter((n) => n !== uIdx);
    link.active = false;
    this.touch();
    return { ok: true, message: `[SIMULATION] Link between '${u}' and '${v}' HAS FAILED (CUT).` };
  }

  /** Re-add a previously cut physical link to both adjacency lists. */
  restoreLink(u: string, v: string): { ok: boolean; message: string } {
    const uIdx = this.nameToIndex.get(u);
    const vIdx = this.nameToIndex.get(v);
    if (uIdx === undefined || vIdx === undefined) {
      return { ok: false, message: 'Cannot restore link: one or both devices were not found.' };
    }
    if (uIdx === vIdx) return { ok: false, message: 'A device cannot have a link to itself.' };

    const catalogIndex = this.linkIndex.get(linkId(u, v));
    if (catalogIndex === undefined) {
      return { ok: false, message: `No physical link exists between '${u}' and '${v}'.` };
    }
    const link = this.links[catalogIndex];
    if (link.active) {
      return { ok: false, message: `Link between '${u}' and '${v}' is already UP.` };
    }

    this.adjList[uIdx].push(vIdx);
    this.adjList[vIdx].push(uIdx);
    link.active = true;
    this.touch();
    return { ok: true, message: `[SIMULATION] Link between '${u}' and '${v}' HAS BEEN RESTORED.` };
  }

  /**
   * 1. BFS REACHABILITY / SHORTEST PATH — O(V + E)
   *
   * Explores the adjacency list level by level, recording each node's parent
   * so the shortest hop path can be reconstructed by walking parents backwards.
   * Inactive devices and everything behind them are skipped.
   */
  findPath(source: string, destination: string): PathResult {
    const started = performance.now();
    const src = this.nameToIndex.get(source);
    const dest = this.nameToIndex.get(destination);
    const fail = (message: string, visitedOrder: string[] = []): PathResult => ({
      found: false,
      path: [],
      hops: 0,
      visitedOrder,
      message,
      complexity: BFS_COMPLEXITY,
      executionMs: Number((performance.now() - started).toFixed(3)),
    });

    if (src === undefined || dest === undefined) {
      return fail('Cannot compute path: source or destination device was not found.');
    }
    if (!this.activeVertices[src] || !this.activeVertices[dest]) {
      return fail('Cannot compute path: either source or destination is DOWN.');
    }

    const visited = new Array<boolean>(this.indexToName.length).fill(false);
    const parent = new Array<number>(this.indexToName.length).fill(-1);
    const queue: number[] = [src];
    const visitedOrder: string[] = [];
    visited[src] = true;

    for (let head = 0; head < queue.length; head++) {
      const curr = queue[head];
      visitedOrder.push(this.indexToName[curr]);
      if (curr === dest) break;

      for (const neighbor of this.adjList[curr]) {
        if (this.activeVertices[neighbor] && !visited[neighbor]) {
          visited[neighbor] = true;
          parent[neighbor] = curr;
          queue.push(neighbor);
        }
      }
    }

    const executionMs = Number((performance.now() - started).toFixed(3));
    if (!visited[dest]) {
      return {
        ...fail(`STATUS: NO PATH EXISTS between ${source} and ${destination}.`, visitedOrder),
        executionMs,
      };
    }

    // Reconstruct shortest path by following parent pointers backwards.
    const path: string[] = [];
    for (let at: number = dest; at !== -1; at = parent[at]) {
      path.push(this.indexToName[at]);
    }
    path.reverse();

    return {
      found: true,
      path,
      hops: path.length - 1,
      visitedOrder,
      message: `STATUS: PATH FOUND — ${path.join(' → ')} (${path.length - 1} hops)`,
      complexity: BFS_COMPLEXITY,
      executionMs,
    };
  }

  /**
   * 2. CONNECTED COMPONENTS — O(V + E)
   *
   * Every unvisited active device starts a new BFS flood fill. Each flood is
   * one surviving "island" (isolated subnetwork) after failures.
   */
  connectedComponents(record = true): ComponentsResult {
    const started = performance.now();
    void record;
    const visited = new Array<boolean>(this.indexToName.length).fill(false);
    const components: Array<{ id: number; nodes: string[] }> = [];

    for (let i = 0; i < this.indexToName.length; i++) {
      if (visited[i] || !this.activeVertices[i]) continue;

      const nodes: string[] = [];
      const queue: number[] = [i];
      visited[i] = true;

      for (let head = 0; head < queue.length; head++) {
        const curr = queue[head];
        nodes.push(this.indexToName[curr]);
        for (const neighbor of this.adjList[curr]) {
          if (this.activeVertices[neighbor] && !visited[neighbor]) {
            visited[neighbor] = true;
            queue.push(neighbor);
          }
        }
      }
      components.push({ id: components.length + 1, nodes });
    }

    const inactiveDevices = this.indexToName.filter((_, i) => !this.activeVertices[i]);
    return {
      components,
      count: components.length,
      inactiveDevices,
      complexity: COMPONENTS_COMPLEXITY,
      executionMs: Number((performance.now() - started).toFixed(3)),
    };
  }

  /**
   * Tarjan DFS helper for bridges + articulation points.
   * discovery[] and low[] are timestamps; a bridge exists when low[v] > disc[u].
   * u is an articulation point if it is a DFS root with 2+ children, or a
   * non-root whose child v satisfies low[v] >= disc[u].
   */
  private tarjanDFS(
    u: number,
    disc: number[],
    low: number[],
    parent: number[],
    bridges: Array<{ u: number; v: number }>,
    articulationPoints: number[],
    time: { value: number },
  ): void {
    disc[u] = low[u] = time.value + 1;
    time.value += 1;
    let children = 0;
    let isArticulation = false;

    for (const v of this.adjList[u]) {
      if (!this.activeVertices[v]) continue;

      if (disc[v] === -1) {
        children += 1;
        parent[v] = u;
        this.tarjanDFS(v, disc, low, parent, bridges, articulationPoints, time);

        low[u] = Math.min(low[u], low[v]);

        if (parent[u] === -1 && children > 1) isArticulation = true;
        if (parent[u] !== -1 && low[v] >= disc[u]) isArticulation = true;
        if (low[v] > disc[u]) bridges.push({ u, v });
      } else if (v !== parent[u]) {
        low[u] = Math.min(low[u], disc[v]);
      }
    }

    if (isArticulation) articulationPoints.push(u);
  }

  /** 3. VULNERABILITY ANALYSIS — O(V + E) */
  vulnerabilityAnalysis(): ArticulationResult {
    const started = performance.now();
    const disc = new Array<number>(this.indexToName.length).fill(-1);
    const low = new Array<number>(this.indexToName.length).fill(-1);
    const parent = new Array<number>(this.indexToName.length).fill(-1);
    const rawBridges: Array<{ u: number; v: number }> = [];
    const rawPoints: number[] = [];
    const time = { value: 0 };

    for (let i = 0; i < this.indexToName.length; i++) {
      if (this.activeVertices[i] && disc[i] === -1) {
        this.tarjanDFS(i, disc, low, parent, rawBridges, rawPoints, time);
      }
    }

    return {
      articulationPoints: rawPoints.map((i) => this.indexToName[i]),
      bridges: rawBridges.map((bridge) => {
        const u = this.indexToName[bridge.u];
        const v = this.indexToName[bridge.v];
        return { u, v, id: linkId(u, v) };
      }),
      complexity: TARJAN_COMPLEXITY,
      executionMs: Number((performance.now() - started).toFixed(3)),
    };
  }

  /** Current adjacency list, enriched for the teaching panel. */
  adjacencyEntries(): AdjacencyEntry[] {
    return this.indexToName.map((name, index) => {
      const neighbors = this.links
        .filter((link) => link.u === index || link.v === index)
        .map((link) => {
          const other = link.u === index ? link.v : link.u;
          const deviceActive = this.activeVertices[other];
          return {
            name: this.indexToName[other],
            linkActive: link.active,
            deviceActive,
            active: link.active && deviceActive,
          };
        });

      return {
        name,
        index,
        active: this.activeVertices[index],
        neighbors,
        activeNeighborCount: this.adjList[index].filter((n) => this.activeVertices[n]).length,
      };
    });
  }

  snapshot(updatedAt = this.updatedAt): GraphSnapshot {
    const devices: DeviceView[] = this.indexToName.map((name, index) => ({
      name,
      index,
      active: this.activeVertices[index],
      activeDegree: this.adjList[index].filter((n) => this.activeVertices[n]).length,
      physicalDegree: this.links.filter((link) => link.u === index || link.v === index).length,
    }));

    const links: LinkView[] = this.links.map((link) => ({
      id: linkId(this.indexToName[link.u], this.indexToName[link.v]),
      u: this.indexToName[link.u],
      v: this.indexToName[link.v],
      active: link.active,
    }));

    const vulnerabilities = this.vulnerabilityAnalysis();
    const components = this.connectedComponents();

    const metrics: GraphMetrics = {
      devices: devices.length,
      activeDevices: devices.filter((d) => d.active).length,
      links: links.length,
      activeLinks: links.filter((l) => l.active).length,
      components: components.count,
      articulationPoints: vulnerabilities.articulationPoints.length,
      bridges: vulnerabilities.bridges.length,
    };

    return {
      devices,
      links,
      adjacency: this.adjacencyEntries(),
      metrics,
      updatedAt,
    };
  }

  toData(): GraphData {
    return {
      devices: this.indexToName.map((name, index) => ({
        name,
        active: this.activeVertices[index],
      })),
      links: this.links.map((link) => ({
        u: this.indexToName[link.u],
        v: this.indexToName[link.v],
        active: link.active,
      })),
    };
  }
}
