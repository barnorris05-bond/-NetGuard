import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { motion } from 'framer-motion';
import {
  ArrowRight,
  Boxes,
  Cable,
  ChevronDown,
  CircleAlert,
  Gauge,
  GitBranch,
  Keyboard,
  Layers,
  ListOrdered,
  Pause,
  Play,
  RotateCcw,
  ShieldAlert,
  SkipBack,
  SkipForward,
  Sparkles,
  Waypoints,
  Zap,
} from 'lucide-react';
import type { GraphSnapshot, TraceAlgorithm } from '../lib/types';
import { useNetworkStore } from '../store/useNetworkStore';
import { NetworkCanvas } from '../components/NetworkCanvas';
import { CanvasLegend, DotSwatch, LineSwatch } from '../components/CanvasLegend';
import { InspectorDock } from '../components/InspectorDock';
import { DeviceIcon } from '../components/DeviceIcon';
import { COMPONENT_COLORS, deviceMeta } from '../lib/layout';
import {
  Badge,
  Button,
  ComplexityChip,
  EmptyState,
  Kbd,
  Panel,
  SectionHeader,
  Skeleton,
  cn,
  type BadgeTone,
} from '../components/ui';

const ALGORITHMS: Array<{
  id: TraceAlgorithm;
  label: string;
  icon: typeof Waypoints;
  hint: string;
}> = [
  { id: 'bfs', label: 'BFS path', icon: Waypoints, hint: 'queue · visited · parent[]' },
  { id: 'components', label: 'Components', icon: Boxes, hint: 'flood fill per subnetwork' },
  { id: 'tarjan', label: 'Tarjan', icon: ShieldAlert, hint: 'disc[] · low[] · bridges' },
];

const SPEEDS = [0.5, 1, 2];

const ACTION_TONES: Record<string, BadgeTone> = {
  bridge: 'rose',
  articulation: 'rose',
  blocked: 'rose',
  'no-path': 'rose',
  enqueue: 'cyan',
  discover: 'cyan',
  dequeue: 'cyan',
  destination: 'emerald',
  path: 'emerald',
  complete: 'emerald',
  'component-complete': 'emerald',
  'component-start': 'violet',
  'tree-edge': 'amber',
  'back-edge': 'amber',
  'low-update': 'violet',
  finish: 'slate',
};

function DeviceSelect({
  label,
  value,
  devices,
  onChange,
}: {
  label: string;
  value: string;
  devices: GraphSnapshot['devices'];
  onChange: (value: string) => void;
}) {
  const device = devices.find((entry) => entry.name === value);
  const meta = value ? deviceMeta(value) : null;
  return (
    <label className="block min-w-0 flex-1">
      <span className="mb-1.5 flex items-center gap-1.5 font-mono text-[8.5px] uppercase tracking-[0.14em] text-slate-500">
        <span className="size-1.5 rounded-full" style={{ backgroundColor: meta?.color ?? '#64748b' }} />
        {label}
      </span>
      <div className="relative">
        {device && (
          <span className="pointer-events-none absolute left-3 top-1/2 z-[1] -translate-y-1/2">
            <DeviceIcon
              kind={deviceMeta(device.name).kind}
              size={14}
              color={device.active ? deviceMeta(device.name).color : '#64748b'}
            />
          </span>
        )}
        <select
          value={value}
          onChange={(event) => onChange(event.target.value)}
          className={cn(
            'h-10 w-full appearance-none rounded-lg border bg-[#07111e] pl-9 pr-8 font-mono text-[11.5px] outline-none transition-colors',
            device?.active
              ? 'border-white/10 text-slate-100 hover:border-white/20 focus:border-cyan-400/50'
              : 'border-rose-400/25 text-rose-200 focus:border-rose-400/50',
          )}
        >
          {devices.map((entry) => (
            <option key={entry.name} value={entry.name}>
              {entry.name}
              {entry.active ? '' : ' · DOWN'}
            </option>
          ))}
        </select>
        <ChevronDown size={13} className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-500" />
      </div>
    </label>
  );
}

function Chip({ children, tone = 'slate' }: { children: ReactNode; tone?: BadgeTone }) {
  const tones: Record<BadgeTone, string> = {
    slate: 'border-white/10 bg-white/[0.03] text-slate-400',
    cyan: 'border-cyan-400/25 bg-cyan-400/[0.07] text-cyan-200',
    amber: 'border-amber-400/25 bg-amber-400/[0.07] text-amber-200',
    emerald: 'border-emerald-400/25 bg-emerald-400/[0.07] text-emerald-200',
    rose: 'border-rose-400/25 bg-rose-400/[0.07] text-rose-200',
    violet: 'border-violet-400/25 bg-violet-400/[0.07] text-violet-200',
    blue: 'border-blue-400/25 bg-blue-400/[0.07] text-blue-200',
  };
  return (
    <span className={cn('inline-flex items-center rounded-md border px-1.5 py-0.5 font-mono text-[9px]', tones[tone])}>
      {children}
    </span>
  );
}

export function TraceTab({ graph }: { graph: GraphSnapshot }) {
  const trace = useNetworkStore((state) => state.trace);
  const traceLoading = useNetworkStore((state) => state.traceLoading);
  const runTrace = useNetworkStore((state) => state.runTrace);
  const clearTrace = useNetworkStore((state) => state.clearTrace);
  const selected = useNetworkStore((state) => state.selected);
  const select = useNetworkStore((state) => state.select);

  const [algorithm, setAlgorithm] = useState<TraceAlgorithm>('bfs');
  const [source, setSource] = useState('Admin_PC');
  const [destination, setDestination] = useState('Web_Server');
  const [stepIndex, setStepIndex] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState(1);
  const [syncPacket, setSyncPacket] = useState(true);

  useEffect(() => {
    if (!graph.devices.some((device) => device.name === source)) setSource(graph.devices[0]?.name ?? '');
    if (!graph.devices.some((device) => device.name === destination)) {
      setDestination(graph.devices[1]?.name ?? '');
    }
  }, [graph.devices]); // eslint-disable-line react-hooks/exhaustive-deps

  const steps = trace?.steps ?? [];
  const lastIndex = Math.max(0, steps.length - 1);
  const step = steps[Math.min(stepIndex, lastIndex)];
  const atEnd = Boolean(trace) && stepIndex >= lastIndex;

  useEffect(() => {
    setStepIndex(0);
    setPlaying(false);
  }, [trace]);

  const run = async () => {
    setPlaying(false);
    const result = await runTrace(algorithm, source, destination);
    if (result) setStepIndex(0);
  };

  const chooseAlgorithm = (next: TraceAlgorithm) => {
    if (next === algorithm) return;
    setAlgorithm(next);
    setPlaying(false);
    clearTrace();
  };

  const goTo = useCallback(
    (index: number) => {
      setPlaying(false);
      setStepIndex(Math.max(0, Math.min(index, lastIndex)));
    },
    [lastIndex],
  );

  const next = useCallback(() => {
    setStepIndex((current) => {
      if (current >= lastIndex) return current;
      return current + 1;
    });
  }, [lastIndex]);

  const previous = useCallback(() => {
    setPlaying(false);
    setStepIndex((current) => Math.max(0, current - 1));
  }, []);

  /* Auto-play: one step per interval, stopping on the final step. */
  useEffect(() => {
    if (!playing || !trace) return;
    if (stepIndex >= lastIndex) {
      setPlaying(false);
      return;
    }
    const timer = setTimeout(() => {
      setStepIndex((current) => Math.min(current + 1, lastIndex));
    }, 1400 / speed);
    return () => clearTimeout(timer);
  }, [playing, stepIndex, lastIndex, speed, trace]);

  /* Viva keyboard shortcuts: Space/→ next, ← previous, P play, R reset. */
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (target && ['INPUT', 'SELECT', 'TEXTAREA', 'BUTTON'].includes(target.tagName)) return;
      if (!trace) return;
      if (event.code === 'Space' || event.key === 'ArrowRight') {
        event.preventDefault();
        setPlaying(false);
        next();
      } else if (event.key === 'ArrowLeft') {
        event.preventDefault();
        previous();
      } else if (event.key.toLowerCase() === 'p') {
        event.preventDefault();
        setPlaying((value) => (atEnd ? false : !value));
      } else if (event.key.toLowerCase() === 'r') {
        event.preventDefault();
        setPlaying(false);
        setStepIndex(0);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [trace, next, previous, atEnd]);

  /* Overlay projected from the current step. */
  const traceNodes = useMemo(() => new Map((step?.nodes ?? []).map((node) => [node.name, node])), [step]);
  const componentMap = useMemo(() => {
    const map = new Map<string, number>();
    if (!step) return map;
    for (const [name, id] of Object.entries(step.components)) map.set(name, id - 1);
    return map;
  }, [step]);

  const articulationPoints = useMemo(() => new Set(step?.articulationPoints ?? []), [step]);
  const bridgeIds = useMemo(() => new Set((step?.bridges ?? []).map((bridge) => bridge.id)), [step]);

  const discoveredComponents = useMemo(() => {
    if (!step) return [];
    const groups = new Map<number, string[]>();
    for (const [name, id] of Object.entries(step.components)) {
      const list = groups.get(id) ?? [];
      list.push(name);
      groups.set(id, list);
    }
    return [...groups.entries()].sort((a, b) => a[0] - b[0]).map(([id, nodes]) => ({ id, nodes }));
  }, [step]);

  const visitedParents = useMemo(() => {
    if (!step) return [];
    return step.visited.map((name) => ({ name, parent: step.parent[name] ?? null }));
  }, [step]);

  const packetAt =
    algorithm === 'bfs' && syncPacket && step?.current && !atEnd ? step.current : undefined;
  const brokenSource =
    algorithm === 'bfs' && trace?.summary.found === false && atEnd ? source : undefined;

  return (
    <div className="space-y-4">
      <Panel glow className="overflow-hidden">
        <div className="p-4 sm:p-5">
          <SectionHeader
            eyebrow="algorithm trace · drive the algorithm yourself"
            title="Step-by-Step Trace"
            subtitle="Run BFS, the component flood fill, or Tarjan one operation at a time. The queue, stack, disc[], low[] and every detection are shown as they happen."
            icon={ListOrdered}
            actions={
              <ComplexityChip
                complexity={trace?.complexity ?? 'O(V + E)'}
                explain="Each vertex is discovered once and each adjacency entry is scanned at most once (2E entries for an undirected graph). Initialising the O(V) arrays adds a linear term, so the total is O(V + E) time and O(V) auxiliary space."
              />
            }
          />

          {/* algorithm selector */}
          <div className="mt-4 grid gap-2 sm:grid-cols-3">
            {ALGORITHMS.map((item) => {
              const active = algorithm === item.id;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => chooseAlgorithm(item.id)}
                  aria-pressed={active}
                  className={cn(
                    'flex items-center gap-2.5 rounded-xl border px-3 py-2.5 text-left transition-colors',
                    active
                      ? 'border-cyan-400/40 bg-cyan-400/[0.09] text-cyan-100'
                      : 'border-white/[0.07] bg-white/[0.02] text-slate-400 hover:border-white/15 hover:text-slate-200',
                  )}
                >
                  <span
                    className={cn(
                      'grid size-8 shrink-0 place-items-center rounded-lg border',
                      active ? 'border-cyan-400/30 bg-cyan-400/10 text-cyan-300' : 'border-white/10 bg-white/[0.03] text-slate-500',
                    )}
                  >
                    <item.icon size={15} />
                  </span>
                  <span className="min-w-0">
                    <span className="block text-[11.5px] font-medium">{item.label}</span>
                    <span className="block truncate font-mono text-[8.5px] text-slate-500">{item.hint}</span>
                  </span>
                </button>
              );
            })}
          </div>

          <div className="mt-3 rounded-xl border border-white/[0.07] bg-[#060e1a]/70 p-3">
            {algorithm === 'bfs' ? (
              <div className="flex flex-col gap-2.5 sm:flex-row sm:items-end">
                <DeviceSelect
                  label="Source"
                  value={source}
                  devices={graph.devices}
                  onChange={(value) => {
                    setSource(value);
                    clearTrace();
                  }}
                />
                <ArrowRight size={14} className="mx-auto hidden shrink-0 text-slate-600 sm:block" />
                <DeviceSelect
                  label="Destination"
                  value={destination}
                  devices={graph.devices}
                  onChange={(value) => {
                    setDestination(value);
                    clearTrace();
                  }}
                />
                <Button variant="primary" icon={Sparkles} loading={traceLoading} onClick={() => void run()} className="h-10 shrink-0 px-4">
                  Trace BFS
                </Button>
              </div>
            ) : (
              <div className="flex flex-wrap items-center justify-between gap-3">
                <p className="max-w-xl text-[10.5px] leading-relaxed text-slate-500">
                  {algorithm === 'components'
                    ? 'Start one flood fill per unvisited active device. Watch component IDs grow and colours spread across the topology.'
                    : 'A single DFS assigns disc[] and low[], then marks bridges when low[child] > disc[parent] and articulation points when low[child] >= disc[parent].'}
                </p>
                <Button variant="primary" icon={Sparkles} loading={traceLoading} onClick={() => void run()} className="h-10 shrink-0 px-4">
                  Trace {algorithm === 'components' ? 'components' : 'Tarjan'}
                </Button>
              </div>
            )}
            <p className="mt-2 font-mono text-[9px] text-slate-600">
              traces are read-only · the live adjacency list is never modified
            </p>
          </div>
        </div>

        <div className="px-3 pb-3 sm:px-4">
          <NetworkCanvas
            graph={graph}
            selected={selected}
            onSelectDevice={(name) => select({ kind: 'device', name })}
            onSelectLink={(u, v) => select({ kind: 'link', u, v })}
            highlight={{
              path: step?.path ?? [],
              articulationPoints,
              bridges: bridgeIds,
              componentMap: algorithm === 'components' ? componentMap : undefined,
              componentColors: COMPONENT_COLORS,
            }}
            trace={
              step
                ? {
                    nodes: traceNodes,
                    focusEdge: step.focusEdge,
                    showDiscLow: algorithm === 'tarjan',
                  }
                : undefined
            }
            packetAt={packetAt}
            brokenSource={brokenSource}
          />
        </div>

        <CanvasLegend
          items={
            algorithm === 'tarjan'
              ? [
                  { label: 'current vertex', swatch: <DotSwatch color="#22d3ee" /> },
                  { label: 'on DFS stack', swatch: <DotSwatch color="#fbbf24" /> },
                  { label: 'finished', swatch: <DotSwatch color="#34d399" /> },
                  { label: 'disc / low values', swatch: <span className="font-mono text-[9px] text-violet-300">d=3 l=1</span> },
                ]
              : algorithm === 'components'
                ? [
                    { label: 'component colour', swatch: <DotSwatch color="#a78bfa" /> },
                    { label: 'current vertex', swatch: <DotSwatch color="#22d3ee" /> },
                    { label: 'queued', swatch: <DotSwatch color="#fbbf24" /> },
                  ]
                : [
                    { label: 'current vertex', swatch: <DotSwatch color="#22d3ee" /> },
                    { label: 'queued frontier', swatch: <DotSwatch color="#fbbf24" /> },
                    { label: 'visited', swatch: <DotSwatch color="#34d399" /> },
                    { label: 'edge examined', swatch: <LineSwatch color="#fde68a" dashed /> },
                  ]
          }
          note={step ? `step ${step.index + 1} of ${steps.length}` : 'choose an algorithm and run a trace'}
        />
      </Panel>

      {traceLoading && !trace ? (
        <div className="panel space-y-3 p-5">
          <Skeleton className="h-4 w-48" />
          <Skeleton className="h-16 w-full" />
          <div className="flex gap-2">
            <Skeleton className="h-9 w-24" />
            <Skeleton className="h-9 w-24" />
            <Skeleton className="h-9 w-24" />
          </div>
        </div>
      ) : !trace || !step ? (
        <div className="panel p-4 sm:p-5">
          <EmptyState
            icon={ListOrdered}
            title="Nothing traced yet"
            description="Trace BFS from Admin_PC to Web_Server to watch the queue and parent pointers, flood-fill the components, or run Tarjan to see disc[] and low[] decide every bridge."
            action={
              <Button variant="primary" size="sm" icon={Sparkles} loading={traceLoading} onClick={() => void run()}>
                Run first trace
              </Button>
            }
          />
        </div>
      ) : (
        <>
          <Panel className="overflow-hidden">
            <div className="flex flex-wrap items-start justify-between gap-3 p-4">
              <div className="flex min-w-0 items-start gap-3">
                <span className="grid size-9 shrink-0 place-items-center rounded-lg border border-cyan-400/25 bg-cyan-400/[0.08] font-mono text-[11px] text-cyan-200">
                  {step.index + 1}
                </span>
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="font-display text-[15px] font-semibold text-slate-100">{step.title}</h3>
                    <Badge tone={ACTION_TONES[step.action] ?? 'slate'}>{step.action.replace(/-/g, ' ')}</Badge>
                    {step.detectedBridge && <Badge tone="rose" icon={Cable}>bridge</Badge>}
                    {step.detectedArticulation && <Badge tone="rose" icon={ShieldAlert}>AP</Badge>}
                  </div>
                  <p className="mt-1.5 max-w-3xl text-[11.5px] leading-relaxed text-slate-400">{step.explanation}</p>
                </div>
              </div>
              <span className="shrink-0 font-mono text-[9px] uppercase tracking-[0.12em] text-slate-500">
                step {step.index + 1} / {steps.length}
              </span>
            </div>

            <div className="border-t border-white/[0.05] p-4">
              <input
                type="range"
                min={0}
                max={lastIndex}
                value={Math.min(stepIndex, lastIndex)}
                onChange={(event) => goTo(Number(event.target.value))}
                aria-label="Trace step"
                className="trace-range w-full"
              />
              <div className="mt-3 flex flex-wrap items-center gap-2">
                <Button size="sm" variant="secondary" icon={SkipBack} onClick={previous} disabled={stepIndex === 0}>
                  Prev
                </Button>
                <Button
                  size="sm"
                  variant="primary"
                  icon={playing ? Pause : atEnd ? RotateCcw : Play}
                  onClick={() => {
                    if (atEnd) {
                      setStepIndex(0);
                      setPlaying(true);
                      return;
                    }
                    setPlaying((value) => !value);
                  }}
                >
                  {playing ? 'Pause' : atEnd ? 'Replay' : 'Play'}
                </Button>
                <Button size="sm" variant="secondary" icon={SkipForward} onClick={next} disabled={atEnd}>
                  Next
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  icon={RotateCcw}
                  onClick={() => {
                    setPlaying(false);
                    setStepIndex(0);
                  }}
                  disabled={stepIndex === 0 && !playing}
                >
                  Reset
                </Button>

                <div className="ml-auto flex flex-wrap items-center gap-2">
                  {algorithm === 'bfs' && (
                    <button
                      type="button"
                      onClick={() => setSyncPacket((value) => !value)}
                      aria-pressed={syncPacket}
                      className={cn(
                        'rounded-lg border px-2 py-1 font-mono text-[9px] transition-colors',
                        syncPacket
                          ? 'border-cyan-400/30 bg-cyan-400/[0.08] text-cyan-200'
                          : 'border-white/10 bg-white/[0.02] text-slate-500',
                      )}
                    >
                      packet {syncPacket ? 'on' : 'off'}
                    </button>
                  )}
                  <div className="flex items-center gap-1 rounded-lg border border-white/[0.07] bg-white/[0.02] p-0.5">
                    {SPEEDS.map((value) => (
                      <button
                        key={value}
                        type="button"
                        onClick={() => setSpeed(value)}
                        className={cn(
                          'rounded-md px-1.5 py-1 font-mono text-[9px] transition-colors',
                          speed === value ? 'bg-cyan-400/15 text-cyan-200' : 'text-slate-500 hover:text-slate-300',
                        )}
                      >
                        {value}x
                      </button>
                    ))}
                  </div>
                </div>
              </div>
              <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 font-mono text-[8.5px] text-slate-600">
                <span className="inline-flex items-center gap-1"><Keyboard size={10} /> shortcuts</span>
                <span><Kbd>Space</Kbd> next</span>
                <span><Kbd>←</Kbd> <Kbd>→</Kbd> step</span>
                <span><Kbd>P</Kbd> play</span>
                <span><Kbd>R</Kbd> reset</span>
              </div>
            </div>
          </Panel>

          <div className="grid gap-3 lg:grid-cols-2">
            <Panel className="overflow-hidden">
              <div className="flex items-center justify-between border-b border-white/[0.06] px-4 py-2.5">
                <div className="flex items-center gap-2">
                  <Layers size={13} className="text-cyan-300" />
                  <h3 className="font-display text-[12px] font-semibold text-slate-100">
                    {algorithm === 'tarjan' ? 'DFS stack' : 'BFS frontier (queue)'}
                  </h3>
                </div>
                <span className="font-mono text-[8.5px] uppercase tracking-[0.12em] text-slate-600">
                  {algorithm === 'tarjan' ? step.stack.length : step.queue.length} item{(algorithm === 'tarjan' ? step.stack.length : step.queue.length) === 1 ? '' : 's'}
                </span>
              </div>
              <div className="space-y-3 p-4">
                {(algorithm === 'tarjan' ? step.stack : step.queue).length === 0 ? (
                  <p className="font-mono text-[10px] italic text-slate-600">
                    {algorithm === 'tarjan' ? 'stack empty' : 'queue empty'}
                  </p>
                ) : (
                  <div className="flex flex-wrap items-center gap-1.5">
                    {(algorithm === 'tarjan' ? step.stack : step.queue).map((name, index) => (
                      <span key={`${name}-${index}`} className="flex items-center gap-1.5">
                        <Chip tone={algorithm === 'tarjan' && index === step.stack.length - 1 ? 'cyan' : index === 0 && algorithm !== 'tarjan' ? 'cyan' : 'amber'}>
                          {name}
                        </Chip>
                        {index < (algorithm === 'tarjan' ? step.stack : step.queue).length - 1 && (
                          <ArrowRight size={9} className="text-slate-700" />
                        )}
                      </span>
                    ))}
                  </div>
                )}
                <p className="font-mono text-[8.5px] text-slate-600">
                  {algorithm === 'tarjan'
                    ? 'top of stack = vertex currently being expanded'
                    : 'front of queue = next vertex BFS will dequeue'}
                </p>

                <div className="border-t border-white/[0.05] pt-3">
                  <p className="mb-1.5 font-mono text-[8.5px] uppercase tracking-[0.12em] text-slate-600">
                    visited order · {step.visited.length}
                  </p>
                  <div className="flex flex-wrap gap-1">
                    {step.visited.length === 0 ? (
                      <span className="font-mono text-[9.5px] italic text-slate-600">none yet</span>
                    ) : (
                      step.visited.map((name, index) => (
                        <span key={`${name}-${index}`} className="inline-flex items-center gap-1 rounded border border-emerald-400/15 bg-emerald-400/[0.05] px-1.5 py-0.5 font-mono text-[9px] text-emerald-200/80">
                          <span className="text-emerald-400/50">{index + 1}</span>
                          {name}
                        </span>
                      ))
                    )}
                  </div>
                </div>
              </div>
            </Panel>

            {algorithm === 'tarjan' ? (
              <Panel className="overflow-hidden">
                <div className="flex items-center justify-between border-b border-white/[0.06] px-4 py-2.5">
                  <div className="flex items-center gap-2">
                    <Gauge size={13} className="text-violet-300" />
                    <h3 className="font-display text-[12px] font-semibold text-slate-100">disc[] / low[] table</h3>
                  </div>
                  <Badge tone="violet">timestamps</Badge>
                </div>
                <div className="max-h-[300px] overflow-y-auto thin-scrollbar">
                  <table className="w-full border-collapse text-left font-mono text-[10px]">
                    <thead className="sticky top-0 bg-[#070f1b]">
                      <tr className="border-b border-white/[0.06] text-[8px] uppercase tracking-[0.1em] text-slate-600">
                        <th className="px-4 py-2 font-normal">vertex</th>
                        <th className="px-2 py-2 text-right font-normal">disc</th>
                        <th className="px-2 py-2 text-right font-normal">low</th>
                        <th className="px-2 py-2 font-normal">parent</th>
                        <th className="px-4 py-2 text-right font-normal">role</th>
                      </tr>
                    </thead>
                    <tbody>
                      {step.nodes
                        .filter((node) => node.disc !== undefined)
                        .sort((a, b) => (a.disc ?? 0) - (b.disc ?? 0))
                        .map((node) => {
                          const isCurrent = step.current === node.name;
                          const isAp = step.articulationPoints.includes(node.name);
                          return (
                            <tr
                              key={node.name}
                              className={cn(
                                'border-b border-white/[0.035] last:border-0',
                                isCurrent && 'bg-cyan-400/[0.07]',
                              )}
                            >
                              <td className="px-4 py-1.5 text-slate-300">{node.name}</td>
                              <td className="px-2 py-1.5 text-right tabular-nums text-cyan-200">{node.disc}</td>
                              <td className={cn('px-2 py-1.5 text-right tabular-nums', (node.low ?? 0) < (node.disc ?? 0) ? 'text-amber-300' : 'text-slate-400')}>
                                {node.low}
                              </td>
                              <td className="px-2 py-1.5 text-slate-500">{node.parent ?? '—'}</td>
                              <td className="px-4 py-1.5 text-right">
                                {isAp ? <span className="text-rose-300">AP</span> : <span className="text-slate-600">—</span>}
                              </td>
                            </tr>
                          );
                        })}
                    </tbody>
                  </table>
                </div>
                <div className="flex flex-wrap items-center gap-2 border-t border-white/[0.05] px-4 py-2.5">
                  <Badge tone="rose" icon={ShieldAlert}>{step.articulationPoints.length} AP</Badge>
                  <Badge tone="amber" icon={Cable}>{step.bridges.length} bridge{step.bridges.length === 1 ? '' : 's'}</Badge>
                  <span className="ml-auto font-mono text-[8.5px] text-slate-600">detected so far</span>
                </div>
              </Panel>
            ) : algorithm === 'components' ? (
              <Panel className="overflow-hidden">
                <div className="flex items-center justify-between border-b border-white/[0.06] px-4 py-2.5">
                  <div className="flex items-center gap-2">
                    <Boxes size={13} className="text-violet-300" />
                    <h3 className="font-display text-[12px] font-semibold text-slate-100">Components discovered</h3>
                  </div>
                  <span className="font-mono text-[8.5px] uppercase tracking-[0.12em] text-slate-600">
                    active {step.activeComponent ?? '—'}
                  </span>
                </div>
                <div className="space-y-2 p-3">
                  {discoveredComponents.length === 0 ? (
                    <p className="px-1 py-2 font-mono text-[10px] italic text-slate-600">no component started yet</p>
                  ) : (
                    discoveredComponents.map((component, index) => {
                      const color = COMPONENT_COLORS[(component.id - 1) % COMPONENT_COLORS.length];
                      return (
                        <div key={component.id} className="rounded-lg border border-white/[0.06] bg-white/[0.02] px-3 py-2">
                          <div className="flex items-center gap-2">
                            <span
                              className="grid size-5 place-items-center rounded border font-mono text-[9px]"
                              style={{ color, borderColor: `${color}44`, backgroundColor: `${color}14` }}
                            >
                              {component.id}
                            </span>
                            <span className="font-mono text-[9px] uppercase tracking-[0.1em] text-slate-500">
                              {component.nodes.length} device{component.nodes.length === 1 ? '' : 's'}
                            </span>
                            {step.activeComponent === component.id && <Badge tone="cyan">building</Badge>}
                            {index === discoveredComponents.length - 1 && step.activeComponent !== component.id && (
                              <Badge tone="emerald">closed</Badge>
                            )}
                          </div>
                          <div className="mt-1.5 flex flex-wrap gap-1">
                            {component.nodes.map((name) => (
                              <Chip key={name}>{name}</Chip>
                            ))}
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
              </Panel>
            ) : (
              <Panel className="overflow-hidden">
                <div className="flex items-center justify-between border-b border-white/[0.06] px-4 py-2.5">
                  <div className="flex items-center gap-2">
                    <ListOrdered size={13} className="text-violet-300" />
                    <h3 className="font-display text-[12px] font-semibold text-slate-100">parent[] pointers</h3>
                  </div>
                  <Badge tone="violet">reconstruction tree</Badge>
                </div>
                <div className="max-h-[300px] overflow-y-auto p-3 thin-scrollbar">
                  {visitedParents.length === 0 ? (
                    <p className="px-1 py-2 font-mono text-[10px] italic text-slate-600">no vertex dequeued yet</p>
                  ) : (
                    <div className="space-y-1">
                      {visitedParents.map(({ name, parent }) => (
                        <div key={name} className="flex items-center gap-2 rounded border border-white/[0.045] bg-white/[0.015] px-2 py-1 font-mono text-[9.5px]">
                          <span className="text-slate-500">parent</span>
                          <span className="text-cyan-200">[{name}]</span>
                          <span className="text-slate-600">=</span>
                          <span className="text-slate-300">{parent ?? 'null (source)'}</span>
                        </div>
                      ))}
                    </div>
                  )}
                  {step.path && (
                    <div className="mt-3 rounded-lg border border-emerald-400/20 bg-emerald-400/[0.05] p-2.5">
                      <p className="font-mono text-[8.5px] uppercase tracking-[0.12em] text-emerald-300/80">path from parent[]</p>
                      <div className="mt-1.5 flex flex-wrap items-center gap-1">
                        {step.path.map((name, index) => (
                          <span key={`${name}-${index}`} className="flex items-center gap-1">
                            <Chip tone="emerald">{name}</Chip>
                            {index < step.path!.length - 1 && <ArrowRight size={8} className="text-emerald-500/60" />}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </Panel>
            )}
          </div>

          {atEnd && (
            <motion.div
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              className="panel-inset flex flex-wrap items-center justify-between gap-3 p-4"
            >
              <div className="flex items-start gap-2.5">
                <span className="mt-0.5 grid size-8 shrink-0 place-items-center rounded-lg border border-emerald-400/20 bg-emerald-400/[0.07] text-emerald-300">
                  <CircleAlert size={15} />
                </span>
                <div>
                  <p className="text-[11px] font-medium text-slate-200">Trace complete</p>
                  <p className="mt-0.5 max-w-2xl text-[10.5px] leading-relaxed text-slate-500">
                    {algorithm === 'bfs'
                      ? trace.summary.found
                        ? `Shortest path uses ${trace.summary.hops} hops and was found without ever revisiting a vertex.`
                        : 'BFS exhausted every reachable device; the destination is separated by a failure.'
                      : algorithm === 'components'
                        ? `${trace.summary.count} connected component${trace.summary.count === 1 ? '' : 's'} survived on the current topology.`
                        : `${trace.summary.articulationPoints?.length ?? 0} articulation point(s) and ${trace.summary.bridges?.length ?? 0} bridge(s) were detected in one DFS.`}
                  </p>
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <Button size="sm" variant="secondary" icon={RotateCcw} onClick={() => setStepIndex(0)}>
                  Replay steps
                </Button>
                <Button size="sm" variant="ghost" icon={Zap} onClick={() => void runTrace(algorithm, source, destination)}>
                  Re-run
                </Button>
              </div>
            </motion.div>
          )}

          <div className="panel-inset flex flex-wrap items-start gap-3 p-4">
            <div className="grid size-8 shrink-0 place-items-center rounded-lg border border-violet-400/15 bg-violet-400/[0.06] text-violet-300">
              <GitBranch size={15} />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-[11px] font-medium text-slate-200">How to defend this in the viva</p>
              <p className="mt-1 max-w-3xl text-[10.5px] leading-relaxed text-slate-500">
                Step to the point where the algorithm changes its state and read the explanation aloud: BFS grows the
                frontier one layer at a time; the flood fill assigns component ids; Tarjan compares{' '}
                <span className="font-mono text-violet-300">low[v]</span> with{' '}
                <span className="font-mono text-violet-300">disc[u]</span> to classify the edge or vertex. The list on
                the right always shows the same structure the algorithm is walking.
              </p>
            </div>
          </div>
        </>
      )}

      <InspectorDock graph={graph} selected={selected} />
    </div>
  );
}
