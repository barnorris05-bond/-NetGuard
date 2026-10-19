/** Shared API + graph-engine types for NetGuard. */

export interface DeviceData {
  name: string;
  active: boolean;
}

export interface LinkData {
  u: string;
  v: string;
  active: boolean;
}

export interface GraphData {
  devices: DeviceData[];
  links: LinkData[];
}

export interface DeviceView extends DeviceData {
  index: number;
  activeDegree: number;
  physicalDegree: number;
}

export interface LinkView extends LinkData {
  id: string;
}

export interface AdjacencyNeighbor {
  name: string;
  /** The physical link itself is up. */
  linkActive: boolean;
  /** The neighbouring device is up. */
  deviceActive: boolean;
  /** Both conditions hold, so traffic can actually cross this link. */
  active: boolean;
}

export interface AdjacencyEntry {
  name: string;
  index: number;
  active: boolean;
  neighbors: AdjacencyNeighbor[];
  activeNeighborCount: number;
}

export interface GraphMetrics {
  devices: number;
  activeDevices: number;
  links: number;
  activeLinks: number;
  components: number;
  articulationPoints: number;
  bridges: number;
}

export interface GraphSnapshot {
  devices: DeviceView[];
  links: LinkView[];
  /** The visible adjacency list, including down links for teaching purposes. */
  adjacency: AdjacencyEntry[];
  metrics: GraphMetrics;
  updatedAt: string;
}

export interface PathResult {
  found: boolean;
  path: string[];
  hops: number;
  visitedOrder: string[];
  message: string;
  complexity: string;
  executionMs: number;
}

export interface ArticulationResult {
  articulationPoints: string[];
  bridges: Array<{ u: string; v: string; id: string }>;
  complexity: string;
  executionMs: number;
}

export interface ComponentsResult {
  components: Array<{ id: number; nodes: string[] }>;
  count: number;
  inactiveDevices: string[];
  complexity: string;
  executionMs: number;
}

export type HistoryType =
  | 'fail-device'
  | 'restore-device'
  | 'fail-link'
  | 'restore-link'
  | 'restore-all'
  | 'path-query'
  | 'add-device'
  | 'add-link'
  | 'demo'
  | 'reset';

export interface HistoryEvent {
  id: string;
  sessionId: string;
  type: HistoryType;
  message: string;
  timestamp: string;
  meta?: Record<string, unknown>;
}

export interface HistorySummary {
  total: number;
  failures: number;
  restores: number;
  pathQueries: number;
  failedDevices: string[];
  lastEventAt: string | null;
}

/** Exactly the 10-device topology from Mini_project.cpp. */
export const SAMPLE_DEVICES = [
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
] as const;

/** Exactly the 10 links from the C++ sample, including the redundant SwA–SwB link. */
export const SAMPLE_LINKS: Array<[string, string]> = [
  ['Core_Router', 'Dist_Router_1'],
  ['Core_Router', 'Dist_Router_2'],
  ['Dist_Router_1', 'Switch_A'],
  ['Dist_Router_1', 'Switch_B'],
  ['Dist_Router_2', 'Switch_C'],
  ['Switch_A', 'Web_Server'],
  ['Switch_B', 'Db_Server'],
  ['Switch_C', 'Admin_PC'],
  ['Switch_C', 'User_PC'],
  ['Switch_A', 'Switch_B'], // redundant link
];

export const BFS_COMPLEXITY = 'O(V + E)';
export const COMPONENTS_COMPLEXITY = 'O(V + E)';
export const TARJAN_COMPLEXITY = 'O(V + E)';
