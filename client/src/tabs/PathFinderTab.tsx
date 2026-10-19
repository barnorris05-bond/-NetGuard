import { useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import {
  ArrowLeftRight,
  ArrowRight,
  ChevronDown,
  CircleAlert,
  Gauge,
  Pause,
  Play,
  RotateCcw,
  Route,
  Unplug,
  Waypoints,
} from 'lucide-react';
import type { GraphSnapshot } from '../lib/types';
import { useNetworkStore } from '../store/useNetworkStore';
import { NetworkCanvas } from '../components/NetworkCanvas';
import { CanvasLegend, DotSwatch, LineSwatch } from '../components/CanvasLegend';
import { InspectorDock } from '../components/InspectorDock';
import { DeviceIcon } from '../components/DeviceIcon';
import { Badge, Button, ComplexityChip, EmptyState, Panel, SectionHeader, Skeleton, cn } from '../components/ui';
import { deviceMeta } from '../lib/layout';

const SPEEDS = [0.5, 1, 2, 4];

function DeviceField({
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
              size={15}
              color={device.active ? deviceMeta(device.name).color : '#64748b'}
              strokeWidth={1.8}
            />
          </span>
        )}
        <select
          value={value}
          onChange={(event) => onChange(event.target.value)}
          className={cn(
            'h-11 w-full appearance-none rounded-xl border bg-[#07111e] pl-9 pr-9 font-mono text-[12px] outline-none transition-colors',
            device?.active
              ? 'border-white/10 text-slate-100 hover:border-white/20 focus:border-cyan-400/50'
              : 'border-rose-400/25 text-rose-200 focus:border-rose-400/50',
          )}
        >
          {devices.map((entry) => (
            <option key={entry.name} value={entry.name}>
              {entry.name}
              {entry.active ? '' : '  ·  DOWN'}
            </option>
          ))}
        </select>
        <ChevronDown size={14} className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-slate-500" />
      </div>
    </label>
  );
}

export function PathFinderTab({ graph }: { graph: GraphSnapshot }) {
  const pathResult = useNetworkStore((state) => state.pathResult);
  const pathLoading = useNetworkStore((state) => state.pathLoading);
  const runPath = useNetworkStore((state) => state.runPath);
  const clearPath = useNetworkStore((state) => state.clearPath);
  const selected = useNetworkStore((state) => state.selected);
  const select = useNetworkStore((state) => state.select);

  const [source, setSource] = useState('Admin_PC');
  const [destination, setDestination] = useState('Web_Server');
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState(1);
  const [resetKey, setResetKey] = useState(0);
  const [hopInfo, setHopInfo] = useState<{ hop: number; node: string }>({ hop: 0, node: 'Admin_PC' });

  useEffect(() => {
    if (!graph.devices.some((device) => device.name === source)) {
      setSource(graph.devices[0]?.name ?? '');
    }
    if (!graph.devices.some((device) => device.name === destination)) {
      setDestination(graph.devices[1]?.name ?? '');
    }
  }, [graph.devices]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    setPlaying(false);
    if (!pathResult) setHopInfo({ hop: 0, node: '' });
  }, [pathResult]);

  useEffect(() => {
    setPlaying(false);
  }, [graph.updatedAt]);

  const changeEndpoint = (which: 'source' | 'destination', value: string) => {
    if (which === 'source') setSource(value);
    else setDestination(value);
    clearPath();
    setPlaying(false);
  };

  const runBfs = async () => {
    setPlaying(false);
    setHopInfo({ hop: 0, node: source });
    const result = await runPath(source, destination);
    if (result?.found) {
      setResetKey((key) => key + 1);
      setPlaying(result.hops > 0);
    }
  };

  const swap = () => {
    setSource(destination);
    setDestination(source);
    clearPath();
    setPlaying(false);
  };

  const swapAndRun = () => {
    setSource(destination);
    setDestination(source);
    clearPath();
    void (async () => {
      const result = await runPath(destination, source);
      if (result?.found) {
        setResetKey((key) => key + 1);
        setPlaying(result.hops > 0);
      }
    })();
  };

  const found = Boolean(pathResult?.found);
  const arrived = Boolean(pathResult?.found && hopInfo.hop >= pathResult.hops);
  const progressPercent = pathResult && pathResult.hops > 0 ? Math.min(100, (hopInfo.hop / pathResult.hops) * 100) : found ? 100 : 0;

  const handlePlay = () => {
    if (!pathResult?.found) return;
    if (arrived || hopInfo.hop >= pathResult.hops) {
      setResetKey((key) => key + 1);
      setHopInfo({ hop: 0, node: pathResult.path[0] ?? source });
      setPlaying(true);
      return;
    }
    setPlaying((value) => !value);
  };

  return (
    <div className="space-y-4">
      <Panel glow className="overflow-hidden">
        <div className="p-4 sm:p-5">
          <SectionHeader
            eyebrow="02 · breadth-first search"
            title="Path Finder"
            subtitle="BFS expands the adjacency list level by level. The first arrival at the destination is the shortest hop path — then watch a packet retrace it."
            icon={Route}
            actions={<Badge tone="violet">O(V + E)</Badge>}
          />

          <div className="mt-4 rounded-xl border border-white/[0.07] bg-[#060e1a]/70 p-3">
            <div className="flex flex-col gap-2.5 sm:flex-row sm:items-end">
              <DeviceField label="Source device" value={source} devices={graph.devices} onChange={(value) => changeEndpoint('source', value)} />
              <button
                type="button"
                onClick={swap}
                className="mx-auto hidden size-9 shrink-0 place-items-center rounded-lg border border-white/10 bg-white/[0.03] text-slate-500 transition-colors hover:border-cyan-400/30 hover:text-cyan-300 sm:grid"
                aria-label="Swap source and destination"
                title="Swap endpoints"
              >
                <ArrowLeftRight size={14} />
              </button>
              <DeviceField
                label="Destination device"
                value={destination}
                devices={graph.devices}
                onChange={(value) => changeEndpoint('destination', value)}
              />
              <Button variant="primary" icon={Waypoints} loading={pathLoading} onClick={runBfs} className="h-11 shrink-0 px-5">
                Run BFS
              </Button>
            </div>
            <div className="mt-2 flex items-center justify-between gap-2">
              <p className="font-mono text-[9px] text-slate-600">
                source and destination must be UP · hops = edges crossed
              </p>
              <button
                type="button"
                onClick={swapAndRun}
                disabled={pathLoading}
                className="font-mono text-[9px] text-cyan-400/60 transition-colors hover:text-cyan-300 disabled:opacity-40"
              >
                try reverse route ↺
              </button>
            </div>
          </div>
        </div>

        <div className="px-3 pb-3 sm:px-4">
          <NetworkCanvas
            graph={graph}
            selected={selected}
            onSelectDevice={(name) => select({ kind: 'device', name })}
            onSelectLink={(u, v) => select({ kind: 'link', u, v })}
            highlight={{ path: pathResult?.found ? pathResult.path : [], dimUnrelated: Boolean(pathResult?.found) }}
            packet={
              pathResult?.found
                ? {
                    path: pathResult.path,
                    playing,
                    speed,
                    resetKey,
                    onHop: (hop, node) => setHopInfo({ hop, node }),
                    onComplete: () => setPlaying(false),
                  }
                : undefined
            }
            brokenSource={pathResult && !pathResult.found ? source : undefined}
          />
        </div>

        <CanvasLegend
          items={
            pathResult?.found
              ? [
                  { label: 'shortest path', swatch: <LineSwatch color="#22d3ee" glow /> },
                  { label: 'packet', swatch: <DotSwatch color="#a5f3fc" /> },
                  { label: 'source', swatch: <DotSwatch color="#34d399" /> },
                  { label: 'destination', swatch: <DotSwatch color="#a78bfa" /> },
                ]
              : pathResult
                ? [
                    { label: 'source ripple', swatch: <DotSwatch color="#fb7185" /> },
                    { label: 'failed device', swatch: <DotSwatch color="#f43f5e" /> },
                    { label: 'blocked route', swatch: <LineSwatch color="#f43f5e" dashed /> },
                    { label: 'search exhausted', swatch: <DotSwatch color="#64748b" /> },
                  ]
                : [
                    { label: 'active link', swatch: <LineSwatch color="#22d3ee" glow /> },
                    { label: 'packet', swatch: <DotSwatch color="#a5f3fc" /> },
                    { label: 'source', swatch: <DotSwatch color="#34d399" /> },
                    { label: 'destination', swatch: <DotSwatch color="#a78bfa" /> },
                  ]
          }
          note={
            pathResult?.found
              ? `visited ${pathResult.visitedOrder.length} of ${graph.metrics.activeDevices} active devices`
              : pathResult
                ? `${pathResult.visitedOrder.length} reachable · destination never enqueued`
                : 'Hop-by-hop packet animation'
          }
        />
      </Panel>

      <InspectorDock graph={graph} selected={selected} />

      <AnimatePresence mode="wait">
        {pathLoading ? (
          <motion.div key="loading" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="panel p-5">
            <div className="flex items-center gap-3">
              <Skeleton className="size-10 rounded-xl" />
              <div className="flex-1 space-y-2">
                <Skeleton className="h-3 w-40" />
                <Skeleton className="h-2.5 w-64" />
              </div>
              <Skeleton className="h-9 w-28" />
            </div>
          </motion.div>
        ) : pathResult ? (
          <motion.div
            key={`${pathResult.found}-${source}-${destination}-${pathResult.hops}`}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            transition={{ duration: 0.28, ease: [0.22, 1, 0.36, 1] }}
            className={cn(
              'panel overflow-hidden',
              pathResult.found ? 'border-cyan-400/20' : 'border-rose-400/25',
            )}
          >
            <div className={cn('h-px w-full', pathResult.found ? 'bg-gradient-to-r from-transparent via-cyan-400/60 to-transparent' : 'bg-gradient-to-r from-transparent via-rose-400/60 to-transparent')} />
            <div className="p-4 sm:p-5">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="flex items-start gap-3">
                  <div
                    className={cn(
                      'grid size-10 shrink-0 place-items-center rounded-xl border',
                      pathResult.found
                        ? 'border-cyan-400/25 bg-cyan-400/[0.08] text-cyan-300'
                        : 'border-rose-400/25 bg-rose-400/[0.08] text-rose-300',
                    )}
                  >
                    {pathResult.found ? <Route size={19} strokeWidth={1.8} /> : <Unplug size={19} strokeWidth={1.8} />}
                  </div>
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="font-display text-base font-semibold text-slate-100">
                        {pathResult.found ? 'Shortest Path Found' : 'Path Broken'}
                      </h3>
                      {pathResult.found ? (
                        <Badge tone="emerald" icon={CircleAlert}>
                          {pathResult.hops} hops
                        </Badge>
                      ) : (
                        <Badge tone="rose" icon={Unplug}>
                          no route
                        </Badge>
                      )}
                    </div>
                    <p className="mt-1 font-mono text-[10px] text-slate-500">
                      BFS visited {pathResult.visitedOrder.length} reachable device{pathResult.visitedOrder.length === 1 ? '' : 's'} ·{' '}
                      {pathResult.executionMs.toFixed(3)} ms
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <ComplexityChip complexity={pathResult.complexity} time={pathResult.executionMs} />
                </div>
              </div>

              {pathResult.found ? (
                <>
                  <div className="mt-4 flex flex-wrap items-center gap-1.5">
                    {pathResult.path.map((name, index) => (
                      <span key={`${name}-${index}`} className="flex items-center gap-1.5">
                        <button
                          type="button"
                          onClick={() => select({ kind: 'device', name })}
                          className="group inline-flex items-center gap-2 rounded-lg border border-white/10 bg-white/[0.03] px-2 py-1.5 transition-colors hover:border-cyan-400/30 hover:bg-cyan-400/[0.06]"
                        >
                          <span className="grid size-4 place-items-center rounded bg-white/[0.05] font-mono text-[8px] text-slate-500">
                            {index}
                          </span>
                          <span className="font-mono text-[10.5px] text-slate-200 group-hover:text-cyan-100">{name}</span>
                          <span
                            className="size-1.5 rounded-full"
                            style={{ backgroundColor: deviceMeta(name).color }}
                          />
                        </button>
                        {index < pathResult.path.length - 1 && <ArrowRight size={11} className="text-cyan-500/50" />}
                      </span>
                    ))}
                  </div>

                  <div className="mt-4 grid gap-3 border-t border-white/[0.06] pt-4 md:grid-cols-[1fr_auto]">
                    <div>
                      <div className="flex items-center justify-between gap-3">
                        <div className="flex items-center gap-2">
                          <span className={cn('size-1.5 rounded-full', playing ? 'animate-pulse bg-cyan-300' : arrived ? 'bg-emerald-400' : 'bg-slate-500')} />
                          <p className="font-mono text-[10px] text-slate-400">
                            {arrived ? 'Packet delivered' : playing ? 'Packet in transit' : 'Animation paused'}
                            <span className="text-slate-600"> · </span>
                            hop {Math.min(hopInfo.hop, pathResult.hops)}/{pathResult.hops}
                            {hopInfo.node && (
                              <>
                                <span className="text-slate-600"> · at </span>
                                <span className="text-cyan-300">{hopInfo.node}</span>
                              </>
                            )}
                          </p>
                        </div>
                        <span className="font-mono text-[9px] text-slate-600">
                          {Math.round(progressPercent)}%
                        </span>
                      </div>
                      <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-white/[0.05]">
                        <motion.div
                          className="h-full rounded-full bg-gradient-to-r from-cyan-500 to-cyan-300"
                          animate={{ width: `${progressPercent}%` }}
                          transition={{ duration: 0.2 }}
                        />
                      </div>
                      <div className="mt-3 flex flex-wrap items-center gap-2">
                        <Button
                          size="sm"
                          variant="primary"
                          icon={playing ? Pause : arrived ? RotateCcw : Play}
                          onClick={handlePlay}
                          disabled={pathResult.hops === 0}
                        >
                          {playing ? 'Pause' : arrived ? 'Replay' : 'Play'}
                        </Button>
                        <Button
                          size="sm"
                          variant="secondary"
                          icon={RotateCcw}
                          disabled={pathResult.hops === 0}
                          onClick={() => {
                            setResetKey((key) => key + 1);
                            setHopInfo({ hop: 0, node: pathResult.path[0] ?? '' });
                            setPlaying(true);
                          }}
                        >
                          Restart
                        </Button>
                        <div className="ml-1 flex items-center gap-1 rounded-lg border border-white/[0.07] bg-white/[0.02] p-0.5">
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

                    <div className="flex items-center gap-4 md:flex-col md:items-end md:justify-center">
                      <div className="text-right">
                        <p className="font-mono text-[8px] uppercase tracking-[0.14em] text-slate-600">total hops</p>
                        <p className="font-display text-2xl font-semibold tabular-nums text-cyan-200">{pathResult.hops}</p>
                      </div>
                      <div className="text-right">
                        <p className="font-mono text-[8px] uppercase tracking-[0.14em] text-slate-600">devices on path</p>
                        <p className="font-display text-2xl font-semibold tabular-nums text-slate-200">{pathResult.path.length}</p>
                      </div>
                    </div>
                  </div>
                </>
              ) : (
                <div className="mt-4">
                  <div className="flex flex-col gap-3 rounded-xl border border-rose-400/15 bg-rose-400/[0.035] p-4 sm:flex-row sm:items-center">
                    <div className="flex flex-1 items-center gap-2 overflow-x-auto">
                      <span className="shrink-0 rounded-lg border border-white/10 bg-white/[0.04] px-2.5 py-1.5 font-mono text-[10.5px] text-slate-300">
                        {source}
                      </span>
                      <span className="flex flex-1 items-center gap-1 px-1">
                        <span className="h-px flex-1 border-t border-dashed border-rose-400/45" />
                        <Unplug size={13} className="shrink-0 text-rose-400" />
                        <span className="h-px flex-1 border-t border-dashed border-rose-400/45" />
                      </span>
                      <span className="shrink-0 rounded-lg border border-white/10 bg-white/[0.04] px-2.5 py-1.5 font-mono text-[10.5px] text-slate-300">
                        {destination}
                      </span>
                    </div>
                    <Button size="sm" variant="danger" icon={Waypoints} onClick={swapAndRun} loading={pathLoading}>
                      Try reverse route
                    </Button>
                  </div>
                  <p className="mt-3 text-[11.5px] leading-relaxed text-rose-200/80">{pathResult.message}</p>
                  <p className="mt-1.5 text-[10.5px] leading-relaxed text-slate-500">
                    BFS explored every reachable active device ({pathResult.visitedOrder.length}) and never enqueued the destination.
                    Restore a failed device or link in Failure Simulation, then run BFS again.
                  </p>
                </div>
              )}
            </div>
          </motion.div>
        ) : (
          <motion.div key="empty" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="panel p-4 sm:p-5">
            <EmptyState
              icon={Route}
              title="No route computed yet"
              description="Choose two UP devices and run BFS. The algorithm reconstructs the shortest path by walking parent pointers backwards, then the packet animates each hop."
              action={
                <div className="flex items-center gap-2">
                  <Button size="sm" variant="primary" icon={Waypoints} loading={pathLoading} onClick={runBfs}>
                    Run example route
                  </Button>
                  <span className="hidden font-mono text-[9px] text-slate-600 sm:inline">Admin_PC → Web_Server</span>
                </div>
              }
            />
          </motion.div>
        )}
      </AnimatePresence>

      <div className="panel-inset flex flex-wrap items-start gap-3 p-4">
        <div className="grid size-8 shrink-0 place-items-center rounded-lg border border-violet-400/15 bg-violet-400/[0.06] text-violet-300">
          <Gauge size={15} />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-[11px] font-medium text-slate-200">Why BFS guarantees the fewest hops</p>
          <p className="mt-1 max-w-3xl text-[10.5px] leading-relaxed text-slate-500">
            BFS visits devices in layers: distance 0 (source), then distance 1, then 2. Because every edge has the same
            cost, the first time the destination is enqueued its parent chain is the shortest route. Each vertex is
            enqueued at most once and each adjacency entry scanned at most once, so the cost is{' '}
            <span className="font-mono text-violet-300">O(V + E)</span>.
          </p>
        </div>
      </div>
    </div>
  );
}
