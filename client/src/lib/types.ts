export interface Device {
  name: string;
  index: number;
  active: boolean;
  activeDegree: number;
  physicalDegree: number;
}

export interface Link {
  id: string;
  u: string;
  v: string;
  active: boolean;
}

export interface AdjacencyNeighbor {
  name: string;
  linkActive: boolean;
  deviceActive: boolean;
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
  devices: Device[];
  links: Link[];
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

export interface PathResponse {
  source: string;
  destination: string;
  result: PathResult;
}

export interface Bridge {
  u: string;
  v: string;
  id: string;
}

export interface VulnerabilityResult {
  articulationPoints: string[];
  bridges: Bridge[];
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

export interface HistoryResponse {
  events: HistoryEvent[];
  summary: HistorySummary;
  scope: 'all' | 'session';
}

export interface DemoResult {
  target: {
    name: string;
    wasCriticalDevice: boolean;
    adjusted: boolean;
    note: string;
  };
  source: string;
  destination: string;
  before: {
    snapshot: GraphSnapshot;
    path: PathResult;
    vulnerabilities: VulnerabilityResult;
    components: ComponentsResult;
  };
  after: {
    snapshot: GraphSnapshot;
    path: PathResult;
    vulnerabilities: VulnerabilityResult;
    components: ComponentsResult;
  };
  impact: {
    pathBroken: boolean;
    componentsDelta: number;
    hopsBefore: number;
    hopsAfter: number;
    isolatedDevices: number;
    narrative: string[];
  };
}

export type TabId =
  | 'topology'
  | 'path'
  | 'vulnerability'
  | 'components'
  | 'failure'
  | 'demo'
  | 'history';

export type Selection =
  | { kind: 'device'; name: string }
  | { kind: 'link'; u: string; v: string }
  | null;

export interface Toast {
  id: string;
  message: string;
  kind: 'success' | 'error' | 'info';
}
