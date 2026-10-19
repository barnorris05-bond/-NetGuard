import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { NetworkGraph } from './graph';
import {
  SAMPLE_DEVICES,
  SAMPLE_LINKS,
  type ComponentsResult,
  type GraphData,
  type GraphSnapshot,
  type HistoryEvent,
  type HistorySummary,
  type HistoryType,
  type PathResult,
  type ArticulationResult,
} from './types';

const DATA_DIR = path.join(__dirname, '..', 'data');
const DATA_FILE = path.join(DATA_DIR, 'netguard.json');
const MAX_HISTORY = 500;

interface PersistedState {
  graph: GraphData;
  history: HistoryEvent[];
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
    vulnerabilities: ArticulationResult;
    components: ComponentsResult;
  };
  after: {
    snapshot: GraphSnapshot;
    path: PathResult;
    vulnerabilities: ArticulationResult;
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

/**
 * In-memory graph + JSON-file persistence.
 * A write is made after every mutation so the app survives restarts and works
 * entirely offline. The file is written atomically (tmp + rename).
 */
class NetworkStore {
  graph: NetworkGraph;
  history: HistoryEvent[] = [];

  constructor() {
    this.graph = NetworkGraph.sample();
    this.load();
  }

  private load(): void {
    try {
      if (!fs.existsSync(DATA_FILE)) {
        this.persist();
        return;
      }
      const raw = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8')) as PersistedState;
      if (!raw?.graph?.devices || !Array.isArray(raw.graph.devices)) {
        throw new Error('Malformed persistence file');
      }
      this.graph = NetworkGraph.fromData(raw.graph);
      this.history = Array.isArray(raw.history) ? raw.history.slice(-MAX_HISTORY) : [];
      // Add anything missing if an old file predates the sample topology.
      if (this.graph.deviceCount === 0) {
        this.graph = NetworkGraph.sample();
        this.persist();
      }
    } catch (error) {
      console.warn('[netguard] Could not load saved state, starting from sample topology.', error);
      this.graph = NetworkGraph.sample();
      this.history = [];
      this.persist();
    }
  }

  persist(): void {
    try {
      fs.mkdirSync(DATA_DIR, { recursive: true });
      const state: PersistedState = { graph: this.graph.toData(), history: this.history };
      const tmp = `${DATA_FILE}.tmp`;
      fs.writeFileSync(tmp, JSON.stringify(state, null, 2), 'utf8');
      fs.renameSync(tmp, DATA_FILE);
    } catch (error) {
      console.error('[netguard] Failed to persist state.', error);
    }
  }

  snapshot(): GraphSnapshot {
    return this.graph.snapshot(new Date().toISOString());
  }

  record(type: HistoryType, sessionId: string, message: string, meta?: Record<string, unknown>): HistoryEvent {
    const event: HistoryEvent = {
      id: randomUUID(),
      sessionId,
      type,
      message,
      timestamp: new Date().toISOString(),
      meta,
    };
    this.history.push(event);
    if (this.history.length > MAX_HISTORY) this.history = this.history.slice(-MAX_HISTORY);
    this.persist();
    return event;
  }

  historyFor(sessionId: string, scope: 'all' | 'session'): HistoryEvent[] {
    const events = scope === 'session' ? this.history.filter((e) => e.sessionId === sessionId) : this.history;
    return [...events].reverse();
  }

  historySummary(events: HistoryEvent[]): HistorySummary {
    const failedDevices = new Set<string>();
    for (const event of events) {
      if (event.type === 'fail-device' && typeof event.meta?.device === 'string') {
        failedDevices.add(event.meta.device);
      }
    }
    return {
      total: events.length,
      failures: events.filter((e) => e.type === 'fail-device' || e.type === 'fail-link').length,
      restores: events.filter(
        (e) => e.type === 'restore-device' || e.type === 'restore-link' || e.type === 'restore-all',
      ).length,
      pathQueries: events.filter((e) => e.type === 'path-query').length,
      failedDevices: [...failedDevices],
      lastEventAt: events.length ? [...events].sort((a, b) => a.timestamp.localeCompare(b.timestamp)).at(-1)!.timestamp : null,
    };
  }

  clearHistory(): void {
    this.history = [];
    this.persist();
  }

  reset(sessionId: string): GraphSnapshot {
    this.graph = NetworkGraph.sample();
    this.record('reset', sessionId, 'Topology reset to the healthy 10-device sample network.');
    return this.snapshot();
  }

  /**
   * Clone the live graph, analyse it, fail one critical device in the clone,
   * and return both states. The live network is never mutated by the demo.
   */
  runDemo(
    options: { failTarget?: string; source?: string; destination?: string },
    sessionId: string,
  ): DemoResult {
    const source = options.source || 'Admin_PC';
    const destination = options.destination || 'Web_Server';
    const clone = this.graph.clone();
    const beforeVulnerabilities = clone.vulnerabilityAnalysis();

    let target = options.failTarget || 'Dist_Router_1';
    let adjusted = false;
    let note = '';

    if (!clone.hasDevice(target) || !clone.isDeviceActive(target)) {
      const fallback =
        beforeVulnerabilities.articulationPoints.find((name) => clone.isDeviceActive(name)) ??
        clone.deviceNames().find((name) => clone.isDeviceActive(name));
      if (!fallback) {
        throw new Error('The network has no active device left to fail.');
      }
      note = `'${target}' is not available, so the demo targets '${fallback}' instead.`;
      target = fallback;
      adjusted = true;
    }

    const wasCriticalDevice = beforeVulnerabilities.articulationPoints.includes(target);
    const beforeSnapshot = clone.snapshot(new Date().toISOString());
    const beforePath = clone.findPath(source, destination);
    const beforeComponents = clone.connectedComponents();

    clone.failDevice(target);

    const afterSnapshot = clone.snapshot(new Date().toISOString());
    const afterPath = clone.findPath(source, destination);
    const afterVulnerabilities = clone.vulnerabilityAnalysis();
    const afterComponents = clone.connectedComponents();
    const isolatedDevices = afterSnapshot.metrics.devices - afterSnapshot.metrics.activeDevices;

    const narrative = [
      wasCriticalDevice
        ? `${target} is an articulation point: removing it disconnects the network.`
        : `${target} is not an articulation point, so the demo shows only local impact.`,
      afterComponents.count > beforeComponents.count
        ? `Surviving subnetworks increased from ${beforeComponents.count} to ${afterComponents.count}.`
        : 'The number of subnetworks did not change.',
      beforePath.found && !afterPath.found
        ? `The path ${source} → ${destination} was ${beforePath.hops} hops and is now broken.`
        : afterPath.found
          ? `Traffic ${source} → ${destination} still has a path (${afterPath.hops} hops).`
          : `No path existed between ${source} and ${destination} even before the failure.`,
      'The live network is untouched — this comparison ran on a cloned graph.',
    ];

    this.record('demo', sessionId, `Before/after demo: failed ${target} on a cloned graph.`, {
      target,
      source,
      destination,
      pathBroken: beforePath.found && !afterPath.found,
      componentsBefore: beforeComponents.count,
      componentsAfter: afterComponents.count,
    });

    return {
      target: {
        name: target,
        wasCriticalDevice,
        adjusted,
        note: adjusted
          ? note
          : wasCriticalDevice
            ? `${target} is one of the network's articulation points.`
            : `${target} is not currently a critical device.`,
      },
      source,
      destination,
      before: {
        snapshot: beforeSnapshot,
        path: beforePath,
        vulnerabilities: beforeVulnerabilities,
        components: beforeComponents,
      },
      after: {
        snapshot: afterSnapshot,
        path: afterPath,
        vulnerabilities: afterVulnerabilities,
        components: afterComponents,
      },
      impact: {
        pathBroken: beforePath.found && !afterPath.found,
        componentsDelta: afterComponents.count - beforeComponents.count,
        hopsBefore: beforePath.hops,
        hopsAfter: afterPath.hops,
        isolatedDevices,
        narrative,
      },
    };
  }

  sampleInfo() {
    return { devices: [...SAMPLE_DEVICES], links: SAMPLE_LINKS };
  }
}

export const store = new NetworkStore();
