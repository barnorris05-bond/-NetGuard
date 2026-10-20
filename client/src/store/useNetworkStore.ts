import { create } from 'zustand';
import { ApiError, api } from '../lib/api';
import type {
  ComponentsResult,
  DemoResult,
  GraphSnapshot,
  HistoryEvent,
  HistorySummary,
  PathResult,
  Selection,
  TabId,
  Toast,
  TraceAlgorithm,
  TraceResult,
  VulnerabilityResult,
} from '../lib/types';

const emptySummary: HistorySummary = {
  total: 0,
  failures: 0,
  restores: 0,
  pathQueries: 0,
  failedDevices: [],
  lastEventAt: null,
};

function uid(): string {
  try {
    return crypto.randomUUID();
  } catch {
    return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  }
}

function errorMessage(error: unknown): string {
  return error instanceof ApiError ? error.message : error instanceof Error ? error.message : 'Something went wrong.';
}

interface PathQuery {
  source: string;
  destination: string;
}

/** Transient highlight of what a mutation changed in the adjacency list. */
export interface AdjacencyDiff {
  at: number;
  devices: Record<string, 'down' | 'restored'>;
  neighbors: Record<string, Array<{ name: string; change: 'removed' | 'added' }>>;
}

function computeAdjacencyDiff(previous: GraphSnapshot | null, next: GraphSnapshot): AdjacencyDiff | null {
  if (!previous) return null;
  const devices: AdjacencyDiff['devices'] = {};
  const neighbors: AdjacencyDiff['neighbors'] = {};
  const previousRows = new Map(previous.adjacency.map((entry) => [entry.name, entry]));

  for (const entry of next.adjacency) {
    const before = previousRows.get(entry.name);
    if (!before) continue;
    if (before.active !== entry.active) devices[entry.name] = entry.active ? 'restored' : 'down';

    const beforeNeighbors = new Map(before.neighbors.map((neighbor) => [neighbor.name, neighbor]));
    for (const neighbor of entry.neighbors) {
      const old = beforeNeighbors.get(neighbor.name);
      if (!old || old.active === neighbor.active) continue;
      (neighbors[entry.name] ??= []).push({
        name: neighbor.name,
        change: neighbor.active ? 'added' : 'removed',
      });
    }
  }

  if (Object.keys(devices).length === 0 && Object.keys(neighbors).length === 0) return null;
  return { at: Date.now(), devices, neighbors };
}

interface NetworkState {
  graph: GraphSnapshot | null;
  graphLoading: boolean;
  initialized: boolean;
  error: string | null;

  tab: TabId;
  selected: Selection;
  showEducation: boolean;
  showAdjacency: boolean;
  adjacencyDiff: AdjacencyDiff | null;
  pending: string[];
  toasts: Toast[];

  trace: TraceResult | null;
  traceLoading: boolean;

  pathQuery: PathQuery | null;
  pathResult: PathResult | null;
  pathLoading: boolean;

  vulnerabilities: VulnerabilityResult | null;
  vulnLoading: boolean;

  components: ComponentsResult | null;
  componentsLoading: boolean;

  demo: DemoResult | null;
  demoLoading: boolean;

  history: HistoryEvent[];
  historySummary: HistorySummary;
  historyLoading: boolean;
  historyScope: 'all' | 'session';

  setTab: (tab: TabId) => void;
  select: (selection: Selection) => void;
  setShowEducation: (show: boolean) => void;
  toggleAdjacency: () => void;
  dismissToast: (id: string) => void;
  pushToast: (message: string, kind?: Toast['kind']) => void;

  bootstrap: () => Promise<void>;
  refreshGraph: () => Promise<GraphSnapshot | null>;
  failDevice: (name: string) => Promise<void>;
  restoreDevice: (name: string) => Promise<void>;
  failLink: (u: string, v: string) => Promise<void>;
  restoreLink: (u: string, v: string) => Promise<void>;
  restoreAll: () => Promise<void>;
  addDevice: (name: string) => Promise<boolean>;
  addLink: (u: string, v: string) => Promise<boolean>;
  resetTopology: () => Promise<void>;

  runPath: (source: string, destination: string) => Promise<PathResult | null>;
  clearPath: () => void;
  loadVulnerabilities: () => Promise<void>;
  loadComponents: () => Promise<void>;
  rerunAnalysis: () => Promise<void>;
  runTrace: (algorithm: TraceAlgorithm, source?: string, destination?: string) => Promise<TraceResult | null>;
  clearTrace: () => void;
  runDemo: () => Promise<DemoResult | null>;
  loadHistory: (scope?: 'all' | 'session') => Promise<void>;
  clearHistory: () => Promise<void>;
}

export const useNetworkStore = create<NetworkState>((set, get) => {
  const begin = (key: string) =>
    set((state) => ({ pending: state.pending.includes(key) ? state.pending : [...state.pending, key] }));
  const end = (key: string) => set((state) => ({ pending: state.pending.filter((entry) => entry !== key) }));

  const pushToast = (message: string, kind: Toast['kind'] = 'info') => {
    const id = uid();
    set((state) => ({ toasts: [...state.toasts.slice(-3), { id, message, kind }] }));
    setTimeout(() => get().dismissToast(id), kind === 'error' ? 5200 : 3400);
  };

  let diffTimer: ReturnType<typeof setTimeout> | null = null;

  /**
   * Any graph mutation invalidates cached analyses and records exactly which
   * adjacency rows/neighbours changed, so the always-visible list can flash
   * red (removed) or green (restored) for a few seconds.
   */
  const applyGraph = (graph: GraphSnapshot) => {
    const diff = computeAdjacencyDiff(get().graph, graph);
    if (diffTimer) clearTimeout(diffTimer);
    diffTimer = diff ? setTimeout(() => set({ adjacencyDiff: null }), 5000) : null;
    set((state) => ({
      graph,
      error: null,
      pathResult: null,
      pathQuery: state.pathLoading ? state.pathQuery : null,
      vulnerabilities: null,
      components: null,
      trace: null,
      adjacencyDiff: diff,
    }));
  };

  const mutate = async (key: string, action: () => Promise<{ message: string; graph: GraphSnapshot }>) => {
    begin(key);
    try {
      const response = await action();
      applyGraph(response.graph);
      pushToast(response.message.replace('[SIMULATION] ', ''), 'success');
    } catch (error) {
      pushToast(errorMessage(error), 'error');
    } finally {
      end(key);
    }
  };

  return {
    graph: null,
    graphLoading: false,
    initialized: false,
    error: null,

    tab: 'topology',
    selected: null,
    showEducation: true,
    showAdjacency: true,
    adjacencyDiff: null,
    pending: [],
    toasts: [],

    trace: null,
    traceLoading: false,

    pathQuery: null,
    pathResult: null,
    pathLoading: false,

    vulnerabilities: null,
    vulnLoading: false,

    components: null,
    componentsLoading: false,

    demo: null,
    demoLoading: false,

    history: [],
    historySummary: emptySummary,
    historyLoading: false,
    historyScope: 'all',

    setTab: (tab) => set({ tab }),
    select: (selected) => set({ selected }),
    setShowEducation: (showEducation) => set({ showEducation }),
    toggleAdjacency: () => set((state) => ({ showAdjacency: !state.showAdjacency })),
    dismissToast: (id) => set((state) => ({ toasts: state.toasts.filter((toast) => toast.id !== id) })),
    pushToast,

    bootstrap: async () => {
      if (get().initialized) return;
      set({ initialized: true, graphLoading: true, error: null });
      try {
        const graph = await api.graph();
        set({ graph, graphLoading: false });
      } catch (error) {
        set({ graphLoading: false, error: errorMessage(error) });
      }
    },

    refreshGraph: async () => {
      try {
        const graph = await api.graph();
        applyGraph(graph);
        return graph;
      } catch (error) {
        set({ error: errorMessage(error) });
        return null;
      }
    },

    failDevice: (name) => mutate(`device:${name}`, () => api.failDevice(name)),
    restoreDevice: (name) => mutate(`device:${name}`, () => api.restoreDevice(name)),
    failLink: (u, v) => mutate(`link:${u}~${v}`, () => api.failLink(u, v)),
    restoreLink: (u, v) => mutate(`link:${u}~${v}`, () => api.restoreLink(u, v)),

    restoreAll: async () => {
      begin('restore-all');
      try {
        const response = await api.restoreAll();
        applyGraph(response.graph);
        pushToast(response.message, 'success');
      } catch (error) {
        pushToast(errorMessage(error), 'error');
      } finally {
        end('restore-all');
      }
    },

    addDevice: async (name) => {
      begin('add-device');
      try {
        const response = await api.addDevice(name);
        applyGraph(response.graph);
        pushToast(response.message, 'success');
        return true;
      } catch (error) {
        pushToast(errorMessage(error), 'error');
        return false;
      } finally {
        end('add-device');
      }
    },

    addLink: async (u, v) => {
      begin('add-link');
      try {
        const response = await api.addLink(u, v);
        applyGraph(response.graph);
        pushToast(response.message, 'success');
        return true;
      } catch (error) {
        pushToast(errorMessage(error), 'error');
        return false;
      } finally {
        end('add-link');
      }
    },

    resetTopology: async () => {
      begin('reset');
      try {
        const response = await api.reset();
        applyGraph(response.graph);
        set({ selected: null });
        pushToast(response.message, 'success');
      } catch (error) {
        pushToast(errorMessage(error), 'error');
      } finally {
        end('reset');
      }
    },

    runPath: async (source, destination) => {
      set({ pathLoading: true });
      try {
        const response = await api.path(source, destination);
        set({ pathResult: response.result, pathQuery: { source, destination }, pathLoading: false });
        return response.result;
      } catch (error) {
        set({ pathLoading: false });
        pushToast(errorMessage(error), 'error');
        return null;
      }
    },

    clearPath: () => set({ pathResult: null, pathQuery: null }),

    loadVulnerabilities: async () => {
      set({ vulnLoading: true });
      try {
        const vulnerabilities = await api.vulnerabilities();
        set({ vulnerabilities, vulnLoading: false });
      } catch (error) {
        set({ vulnLoading: false });
        pushToast(errorMessage(error), 'error');
      }
    },

    loadComponents: async () => {
      set({ componentsLoading: true });
      try {
        const components = await api.components();
        set({ components, componentsLoading: false });
      } catch (error) {
        set({ componentsLoading: false });
        pushToast(errorMessage(error), 'error');
      }
    },

    /** One-click refresh offered after a failure: components + Tarjan together. */
    rerunAnalysis: async () => {
      await Promise.all([get().loadVulnerabilities(), get().loadComponents()]);
      pushToast('Re-ran components and Tarjan on the current topology.', 'info');
    },

    runTrace: async (algorithm, source, destination) => {
      set({ traceLoading: true });
      try {
        const trace = await api.trace(algorithm, source, destination);
        set({ trace, traceLoading: false });
        return trace;
      } catch (error) {
        set({ traceLoading: false });
        pushToast(errorMessage(error), 'error');
        return null;
      }
    },

    clearTrace: () => set({ trace: null }),

    runDemo: async () => {
      set({ demoLoading: true });
      try {
        const demo = await api.demo();
        set({ demo, demoLoading: false });
        return demo;
      } catch (error) {
        set({ demoLoading: false });
        pushToast(errorMessage(error), 'error');
        return null;
      }
    },

    loadHistory: async (scope) => {
      const chosen = scope ?? get().historyScope;
      set({ historyLoading: true, historyScope: chosen });
      try {
        const response = await api.history(chosen);
        set({ history: response.events, historySummary: response.summary, historyLoading: false });
      } catch (error) {
        set({ historyLoading: false });
        pushToast(errorMessage(error), 'error');
      }
    },

    clearHistory: async () => {
      try {
        const response = await api.clearHistory();
        set({
          history: [],
          historySummary: response.summary ?? emptySummary,
          historyLoading: false,
        });
        pushToast('Simulation history cleared.', 'success');
      } catch (error) {
        pushToast(errorMessage(error), 'error');
      }
    },
  };
});

/** Convenience selectors used across tabs. */
export const selectGraph = (state: NetworkState) => state.graph;
export const selectPending = (state: NetworkState) => state.pending;
