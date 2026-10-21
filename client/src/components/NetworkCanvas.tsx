import { useEffect, useId, useMemo, useRef, useState } from 'react';
import {
  Database,
  Globe,
  Monitor,
  Network,
  Router,
  ShieldCheck,
  Server,
  TriangleAlert,
  WifiOff,
} from 'lucide-react';
import type { GraphSnapshot, Selection, TraceNode } from '../lib/types';
import { buildLayout, deviceMeta, linkKey, type DeviceKind, type Point } from '../lib/layout';
import { cn } from './ui';

const DEVICE_ICONS: Record<DeviceKind, typeof Router> = {
  router: Router,
  switch: Network,
  web: Globe,
  database: Database,
  admin: ShieldCheck,
  workstation: Monitor,
  unknown: Server,
};

const NODE_ALT: Record<DeviceKind, string> = {
  router: 'router',
  switch: 'switch',
  web: 'web server',
  database: 'database server',
  admin: 'admin workstation',
  workstation: 'workstation',
  unknown: 'network device',
};

export interface CanvasHighlight {
  path?: string[];
  articulationPoints?: Set<string>;
  bridges?: Set<string>;
  componentMap?: Map<string, number>;
  componentColors?: string[];
  dimUnrelated?: boolean;
}

/** Live step overlays for the Algorithm Trace tab. */
export interface TraceOverlay {
  nodes: Map<string, TraceNode>;
  focusEdge?: { u: string; v: string } | null;
  showDiscLow?: boolean;
}

export interface PacketConfig {
  path: string[];
  playing: boolean;
  speed: number;
  /** Changing this number restarts the packet from hop 0. */
  resetKey: number;
  onHop?: (hop: number, node: string) => void;
  onComplete?: () => void;
}

interface NetworkCanvasProps {
  graph: GraphSnapshot;
  selected?: Selection;
  onSelectDevice?: (name: string) => void;
  onSelectLink?: (u: string, v: string) => void;
  highlight?: CanvasHighlight;
  packet?: PacketConfig;
  /** Static packet marker used when the trace steps drive the animation. */
  packetAt?: string;
  trace?: TraceOverlay;
  brokenSource?: string;
  compact?: boolean;
  interactive?: boolean;
  className?: string;
  overlayLabel?: string;
}

export function NetworkCanvas({
  graph,
  selected = null,
  onSelectDevice,
  onSelectLink,
  highlight,
  packet,
  packetAt,
  trace,
  brokenSource,
  compact = false,
  interactive = true,
  className,
  overlayLabel,
}: NetworkCanvasProps) {
  const rawId = useId();
  const uid = useMemo(() => rawId.replace(/[^a-zA-Z0-9]/g, ''), [rawId]);
  const layout = useMemo(() => buildLayout(graph.devices.map((device) => device.name)), [graph.devices]);
  const deviceByName = useMemo(() => new Map(graph.devices.map((d) => [d.name, d])), [graph.devices]);

  const path = packet?.path ?? highlight?.path ?? [];
  const pathKey = path.join('>');
  const pathEdgeSet = useMemo(() => {
    const set = new Set<string>();
    for (let i = 0; i < path.length - 1; i++) set.add(linkKey(path[i], path[i + 1]));
    return set;
  }, [pathKey]); // eslint-disable-line react-hooks/exhaustive-deps

  const pathPoints = useMemo(
    () => path.map((name) => layout.get(name)).filter((point): point is Point => Boolean(point)),
    [pathKey, layout], // eslint-disable-line react-hooks/exhaustive-deps
  );

  /* ---------------- packet animation ---------------- */
  const [progress, setProgress] = useState(0);
  const progressRef = useRef(0);
  const lastPaintRef = useRef(0);
  const onHopRef = useRef(packet?.onHop);
  onHopRef.current = packet?.onHop;
  const onCompleteRef = useRef(packet?.onComplete);
  onCompleteRef.current = packet?.onComplete;
  const completedRef = useRef(false);
  const maxProgress = Math.max(0, pathPoints.length - 1);

  useEffect(() => {
    progressRef.current = 0;
    lastPaintRef.current = 0;
    completedRef.current = false;
    setProgress(0);
    if (path.length > 0) onHopRef.current?.(0, path[0]);
  }, [pathKey, packet?.resetKey]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!packet?.playing || !packet.path || pathPoints.length < 2) return;
    let frame = 0;
    let last = performance.now();
    let lastHop = Math.min(Math.floor(progressRef.current), pathPoints.length - 1);

    const tick = (now: number) => {
      const delta = Math.min((now - last) / 1000, 0.1);
      last = now;
      const next = Math.min(maxProgress, progressRef.current + delta * 1.1 * Math.max(packet.speed, 0.1));
      progressRef.current = next;
      if (now - lastPaintRef.current >= 1000 / 30 || next >= maxProgress) {
        lastPaintRef.current = now;
        setProgress(next);
      }
      const hop = Math.min(Math.floor(next), pathPoints.length - 1);
      if (hop !== lastHop) {
        lastHop = hop;
        onHopRef.current?.(hop, packet.path[hop] ?? packet.path[0]);
      }
      if (next >= maxProgress && !completedRef.current) {
        completedRef.current = true;
        onCompleteRef.current?.();
      }
      if (next < maxProgress) frame = requestAnimationFrame(tick);
    };

    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [packet?.playing, packet?.speed, packet?.resetKey, pathKey, pathPoints.length, maxProgress]); // eslint-disable-line react-hooks/exhaustive-deps

  const packetPosition = useMemo(() => {
    if (pathPoints.length === 0) return null;
    if (pathPoints.length === 1) return pathPoints[0] ?? null;
    // progress can briefly be ahead of a newly shortened path during a render
    // that precedes the reset effect, so clamp hard before indexing.
    const safeProgress = Number.isFinite(progress) ? Math.min(Math.max(progress, 0), pathPoints.length - 1) : 0;
    const segment = Math.min(Math.floor(safeProgress), pathPoints.length - 2);
    const t = Math.max(0, Math.min(1, safeProgress - segment));
    const a = pathPoints[segment];
    const b = pathPoints[segment + 1];
    if (!a || !b) return a ?? null;
    return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
  }, [progress, pathPoints]);

  const activeDeviceCount = graph.metrics.activeDevices;
  const critical = highlight?.articulationPoints ?? new Set<string>();
  const bridges = highlight?.bridges ?? new Set<string>();
  const componentMap = highlight?.componentMap;
  const componentColors = highlight?.componentColors ?? ['var(--active)'];

  const focusPoint = trace?.focusEdge
    ? { a: layout.get(trace.focusEdge.u), b: layout.get(trace.focusEdge.v) }
    : null;
  const packetMarker = packetAt ? layout.get(packetAt) : undefined;

  const focusNodes = useMemo(() => {
    const set = new Set<string>();
    if (path.length > 0) path.forEach((name) => set.add(name));
    else {
      critical.forEach((name) => set.add(name));
      bridges.forEach((id) => id.split('~').forEach((name) => set.add(name)));
    }
    return set;
  }, [pathKey, critical, bridges]); // eslint-disable-line react-hooks/exhaustive-deps

  const focusLinks = path.length > 0 ? pathEdgeSet : bridges;
  const dimUnrelated = Boolean(highlight?.dimUnrelated);
  const brokenPoint = brokenSource ? layout.get(brokenSource) : undefined;

  return (
    <div className={cn('canvas-shell', className)}>
      <svg
        viewBox="0 0 1000 620"
        className="relative z-[1] block h-auto w-full"
        role="img"
        aria-label="Interactive network topology graph"
      >
        <defs>
          <filter id={`${uid}-soft`} x="-60%" y="-60%" width="220%" height="220%">
            <feGaussianBlur stdDeviation="3.2" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
          <filter id={`${uid}-packet`} x="-200%" y="-200%" width="500%" height="500%">
            <feGaussianBlur stdDeviation="7" />
          </filter>
          <radialGradient id={`${uid}-aura`}>
          <stop offset="0%" stopColor="var(--active)" stopOpacity="0.4" />
            <stop offset="100%" stopColor="var(--active)" stopOpacity="0" />
          </radialGradient>
          <linearGradient id={`${uid}-path`} x1="0" x2="1">
            <stop offset="0%" stopColor="var(--active)" />
            <stop offset="100%" stopColor="var(--focus)" />
          </linearGradient>
        </defs>

        {/* Links are drawn below nodes. */}
        <g>
          {graph.links.map((link) => {
            const points = { a: layout.get(link.u), b: layout.get(link.v) };
            if (!points.a || !points.b) return null;
            const isBridge = bridges.has(link.id);
            const isPath = pathEdgeSet.has(link.id);
            const component = componentMap?.get(link.u);
            const color = component !== undefined ? componentColors[component % componentColors.length] : undefined;
            const isSelected = selected?.kind === 'link' && linkKey(selected.u, selected.v) === link.id;
            return (
              <GraphLink
                key={link.id}
                u={link.u}
                v={link.v}
                a={points.a}
                b={points.b}
                active={link.active}
                uActive={deviceByName.get(link.u)?.active ?? true}
                vActive={deviceByName.get(link.v)?.active ?? true}
                selected={isSelected}
                isBridge={isBridge}
                isPath={isPath}
                componentColor={color}
                dimmed={dimUnrelated && !focusLinks.has(link.id) && !isPath}
                interactive={interactive}
                onSelect={onSelectLink}
                softFilter={`url(#${uid}-soft)`}
              />
            );
          })}
        </g>

        {/* Focused edge for the current algorithm-trace step (drawn above links). */}
        {focusPoint?.a && focusPoint.b && (
          <g pointerEvents="none">
            <line
              x1={focusPoint.a.x}
              y1={focusPoint.a.y}
              x2={focusPoint.b.x}
              y2={focusPoint.b.y}
              stroke="var(--critical)"
              strokeWidth={5}
              opacity={0.22}
              strokeLinecap="round"
            />
            <line
              x1={focusPoint.a.x}
              y1={focusPoint.a.y}
              x2={focusPoint.b.x}
              y2={focusPoint.b.y}
              stroke="var(--critical)"
              strokeWidth={2}
              strokeDasharray="4 4"
              strokeLinecap="round"
              className="trace-edge"
            />
          </g>
        )}

        {/* Devices */}
        <g>
          {graph.devices.map((device) => {
            const point = layout.get(device.name);
            if (!point) return null;
            const onPath = path.includes(device.name);
            const pathRole =
              path.length > 0 && path[0] === device.name
                ? 'source'
                : path.length > 1 && path[path.length - 1] === device.name
                  ? 'destination'
                  : undefined;
            const component = componentMap?.get(device.name);
            const componentColor = component !== undefined ? componentColors[component % componentColors.length] : undefined;
            const isSelected = selected?.kind === 'device' && selected.name === device.name;
            return (
              <GraphDevice
                key={device.name}
                name={device.name}
                point={point}
                active={device.active}
                selected={isSelected}
                critical={critical.has(device.name)}
                onPath={onPath}
                pathRole={pathRole}
                dimmed={dimUnrelated && !focusNodes.has(device.name)}
                componentColor={componentColor}
                degree={device.activeDegree}
                traceNode={trace?.nodes.get(device.name)}
                showDiscLow={Boolean(trace?.showDiscLow)}
                interactive={interactive}
                onSelect={onSelectDevice}
              />
            );
          })}
        </g>

        {/* Broken-signal ripple */}
        {brokenPoint && (
          <g pointerEvents="none">
            <circle
              cx={brokenPoint.x}
              cy={brokenPoint.y}
              r={48}
              fill="none"
              stroke="var(--failed)"
              strokeWidth={2}
              opacity={0.65}
              className="signal-ripple"
            />
            <circle
              cx={brokenPoint.x}
              cy={brokenPoint.y}
              r={48}
              fill="none"
              stroke="var(--failed)"
              strokeWidth={1.4}
              className="signal-ripple-delayed"
            />
          </g>
        )}

        {/* Static packet marker, synchronised with BFS trace steps. */}
        {packetMarker && (
          <g transform={`translate(${packetMarker.x + 50},${packetMarker.y - 44})`} pointerEvents="none">
            <circle r={20} fill="var(--active)" opacity={0.14} />
            <circle r={8} fill="var(--active)" opacity={0.92} filter={`url(#${uid}-packet)`} />
            <circle r={3} fill="var(--text-primary)" stroke="var(--active)" strokeWidth={1.6} className="packet-core" />
          </g>
        )}

        {/* Moving packet */}
        {packet && packetPosition && path.length > 0 && (
          <g pointerEvents="none">
            <circle cx={packetPosition.x} cy={packetPosition.y} r={42} fill={`url(#${uid}-aura)`} />
            <circle
              cx={packetPosition.x}
              cy={packetPosition.y}
              r={13}
              fill="var(--active)"
              opacity={0.85}
              filter={`url(#${uid}-packet)`}
            />
            <circle
              cx={packetPosition.x}
              cy={packetPosition.y}
              r={12}
              fill="none"
              stroke="var(--focus)"
              strokeWidth={1}
              strokeDasharray="2 5"
              opacity={0.8}
              className="link-flow-fast"
            />
            <circle
              cx={packetPosition.x}
              cy={packetPosition.y}
              r={5}
              fill="var(--text-primary)"
              stroke="var(--active)"
              strokeWidth={2}
              className="packet-core"
            />
            {!compact && (
              <g transform={`translate(${packetPosition.x},${packetPosition.y + 26})`}>
                <rect x={-19} y={-8} width={38} height={16} rx={8} fill="var(--surface)" opacity={0.92} stroke="var(--border)" strokeWidth={1} />
                <text textAnchor="middle" y={3} fill="var(--active)" fontSize={8.5} fontFamily="'JetBrains Mono', monospace">
                  HOP {Math.min(Math.floor(progress), maxProgress)}/{maxProgress}
                </text>
              </g>
            )}
          </g>
        )}
      </svg>

      {!compact && (
        <>
          <div className="pointer-events-none absolute left-4 top-3 z-[2] flex items-center gap-2 rounded-full border border-white/[0.06] bg-[#050d19]/85 px-2.5 py-1">
            <span className={cn('size-1.5 rounded-full', activeDeviceCount === graph.metrics.devices ? 'bg-emerald-400' : 'bg-rose-400')} />
            <span className="font-mono text-[8.5px] uppercase tracking-[0.16em] text-slate-500">
              {overlayLabel ?? 'Live topology'}
            </span>
            <span className="font-mono text-[9px] text-slate-300">
              {activeDeviceCount}/{graph.metrics.devices} UP
            </span>
          </div>
          <div className="pointer-events-none absolute right-4 top-3 z-[2] hidden items-center gap-2 rounded-full border border-white/[0.06] bg-[#050d19]/85 px-2.5 py-1 font-mono text-[8.5px] uppercase tracking-[0.14em] text-slate-500 sm:flex">
            V={graph.metrics.devices}
            <span className="text-slate-700">·</span>
            E={graph.metrics.activeLinks}/{graph.metrics.links}
          </div>
        </>
      )}

      {brokenSource && path.length === 0 && (
        <div className="pointer-events-none absolute inset-0 z-[3] grid place-items-center">
          <div className="flex items-center gap-2 rounded-full border border-rose-400/30 bg-[#16080f]/95 px-4 py-2 shadow-[0_0_40px_-10px_rgba(244,63,94,0.65)]">
            <WifiOff size={13} className="text-rose-300" />
            <span className="font-mono text-[9px] font-medium uppercase tracking-[0.16em] text-rose-200">Signal lost</span>
            <span className="text-rose-400/50">·</span>
            <span className="font-mono text-[9px] uppercase tracking-[0.16em] text-rose-300/60">no route</span>
          </div>
        </div>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Link                                                                */
/* ------------------------------------------------------------------ */

function GraphLink({
  u,
  v,
  a,
  b,
  active,
  uActive,
  vActive,
  selected,
  isBridge,
  isPath,
  componentColor,
  dimmed,
  interactive,
  onSelect,
  softFilter,
}: {
  u: string;
  v: string;
  a: Point;
  b: Point;
  active: boolean;
  uActive: boolean;
  vActive: boolean;
  selected: boolean;
  isBridge: boolean;
  isPath: boolean;
  componentColor?: string;
  dimmed: boolean;
  interactive: boolean;
  onSelect?: (u: string, v: string) => void;
  softFilter: string;
}) {
  const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
  const traversable = active && uActive && vActive;

  let stroke = 'var(--border-strong)';
  let width = 2;
  let opacity = traversable ? 0.9 : 0.62;
  if (componentColor) stroke = componentColor;
  if (isBridge) {
    stroke = 'var(--critical)';
    width = 2.2;
  }
  if (isPath) {
    stroke = 'var(--active)';
    width = 2.6;
  }
  if (!active) {
    stroke = 'var(--failed)';
    width = 1.7;
    opacity = 0.55;
  }

  return (
    <g
      className={cn('graph-link group', interactive && 'cursor-pointer')}
      opacity={dimmed ? 0.25 : 1}
      onClick={() => interactive && onSelect?.(u, v)}
      role={interactive ? 'button' : undefined}
      tabIndex={interactive ? 0 : -1}
      aria-label={`Link between ${u} and ${v}, ${active ? 'up' : 'cut'}`}
      onKeyDown={(event) => {
        if (interactive && (event.key === 'Enter' || event.key === ' ')) {
          event.preventDefault();
          onSelect?.(u, v);
        }
      }}
    >
      <title>
        {u} ↔ {v} — {active ? (traversable ? 'UP' : 'DOWN (device offline)') : 'CUT'}
        {isBridge ? ' · critical link (bridge)' : ''}
      </title>
      {selected && (
        <line x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke="var(--active)" strokeWidth={8} opacity={0.16} strokeLinecap="round" />
      )}
      {isBridge && (
        <line
          x1={a.x}
          y1={a.y}
          x2={b.x}
          y2={b.y}
          stroke="var(--critical)"
          strokeWidth={7}
          opacity={0.16}
          strokeLinecap="round"
          className="critical-halo"
        />
      )}
      <line
        x1={a.x}
        y1={a.y}
        x2={b.x}
        y2={b.y}
        stroke={stroke}
        strokeWidth={width}
        strokeLinecap="round"
        strokeDasharray={active ? undefined : '5 5'}
        opacity={opacity}
        filter={isPath ? softFilter : undefined}
      />

      {isPath && (
        <>
          <line
            x1={a.x}
            y1={a.y}
            x2={b.x}
            y2={b.y}
            stroke="var(--focus)"
            strokeWidth={2.2}
            opacity={0.9}
            filter={softFilter}
          />
          <line
            x1={a.x}
            y1={a.y}
            x2={b.x}
            y2={b.y}
            stroke="var(--text-primary)"
            strokeWidth={1.2}
            strokeDasharray="3 10"
            opacity={0.8}
            strokeLinecap="round"
            className="link-flow-fast"
          />
        </>
      )}

      {!active && (
        <g transform={`translate(${mid.x},${mid.y})`} pointerEvents="none">
          <circle r={8} fill="var(--surface)" stroke="var(--failed)" strokeWidth={1} opacity={0.95} />
          <path d="M -3 -3 L 3 3 M 3 -3 L -3 3" stroke="var(--failed)" strokeWidth={1.4} strokeLinecap="round" />
        </g>
      )}

      <line
        x1={a.x}
        y1={a.y}
        x2={b.x}
        y2={b.y}
        stroke="transparent"
        strokeWidth={18}
        pointerEvents={interactive ? 'stroke' : 'none'}
      />
    </g>
  );
}

/* ------------------------------------------------------------------ */
/* Device                                                              */
/* ------------------------------------------------------------------ */

function GraphDevice({
  name,
  point,
  active,
  selected,
  critical,
  onPath,
  pathRole,
  dimmed,
  componentColor,
  degree,
  traceNode,
  showDiscLow,
  interactive,
  onSelect,
}: {
  name: string;
  point: Point;
  active: boolean;
  selected: boolean;
  critical: boolean;
  onPath: boolean;
  pathRole?: 'source' | 'destination';
  dimmed: boolean;
  componentColor?: string;
  degree: number;
  /** Current step state from an algorithm trace, if the Trace tab is active. */
  traceNode?: TraceNode;
  showDiscLow: boolean;
  interactive: boolean;
  onSelect?: (name: string) => void;
}) {
  const meta = deviceMeta(name);
  const Icon = DEVICE_ICONS[meta.kind];
  const traceState = traceNode?.state;
  const stroke = !active
    ? 'var(--failed)'
    : traceState === 'current'
      ? 'var(--active)'
      : traceState === 'frontier'
        ? 'var(--critical)'
        : selected
        ? 'var(--active)'
          : onPath
          ? 'var(--focus)'
    : critical
              ? 'var(--critical)'
              : `${meta.color}66`;

  return (
    <g
      transform={`translate(${point.x},${point.y})`}
      className="device-node group cursor-pointer"
      opacity={dimmed ? 0.4 : 1}
      onClick={() => interactive && onSelect?.(name)}
      role={interactive ? 'button' : undefined}
      tabIndex={interactive ? 0 : -1}
      aria-label={`${name}, ${NODE_ALT[meta.kind]}, ${active ? 'up' : 'down'}, degree ${degree}${critical ? ', critical device' : ''}`}
      onKeyDown={(event) => {
        if (interactive && (event.key === 'Enter' || event.key === ' ')) {
          event.preventDefault();
          onSelect?.(name);
        }
      }}
    >
      <title>
        {name} — {meta.label}, {active ? 'UP' : 'DOWN'}, degree {degree}
        {critical ? ' · critical device (articulation point)' : ''}
        {traceNode?.disc !== undefined ? ` · disc=${traceNode.disc} low=${traceNode.low}` : ''}
      </title>

      {/* Hover degree chip — the current number of active neighbours. */}
      <g transform="translate(44,-52)" pointerEvents="none" className="opacity-0 transition-opacity duration-150 group-hover:opacity-100 group-focus:opacity-100">
        <rect x={-22} y={-8} width={44} height={15} rx={7.5} fill="var(--surface)" stroke="var(--border-strong)" strokeWidth={1} />
        <text textAnchor="middle" y={3} fill="var(--active)" fontSize={7} fontFamily="'JetBrains Mono', monospace">
          deg {degree}
        </text>
      </g>

      {/* Trace state ring: cyan = current, amber = queued/on stack, emerald = finished. */}
      {traceState === 'current' && (
        <rect
          x={-71}
          y={-49}
          width={142}
          height={98}
          rx={19}
          fill="none"
          stroke="var(--active)"
          strokeWidth={1.8}
          className="trace-pulse"
        />
      )}
      {traceState === 'frontier' && (
        <rect
          x={-71}
          y={-49}
          width={142}
          height={98}
          rx={19}
          fill="none"
          stroke="var(--critical)"
          strokeWidth={1.3}
          strokeDasharray="4 4"
          opacity={0.85}
        />
      )}
      {traceState === 'visited' && (
        <rect x={-69} y={-47} width={138} height={94} rx={17} fill="var(--healthy)" opacity={0.06} />
      )}

      {critical && (
        <rect
          x={-75}
          y={-53}
          width={150}
          height={106}
          rx={23}
          fill="none"
          stroke="var(--critical)"
          strokeWidth={1.6}
          className="critical-halo"
        />
      )}

      {selected && (
        <rect
          x={-72}
          y={-50}
          width={144}
          height={100}
          rx={20}
          fill="none"
          stroke="var(--active)"
          strokeWidth={1.4}
          strokeDasharray="4 4"
          opacity={0.9}
        />
      )}

      {pathRole && (
        <g transform="translate(0,-57)" pointerEvents="none">
          <rect
            x={-22}
            y={-8}
            width={44}
            height={16}
            rx={8}
            fill={pathRole === 'source' ? '#062018' : '#150f28'}
            stroke={pathRole === 'source' ? '#34d399aa' : '#a78bfaaa'}
            strokeWidth={1}
          />
          <text
            textAnchor="middle"
            y={3.3}
            fill={pathRole === 'source' ? '#6ee7b7' : '#c4b5fd'}
            fontSize={7.2}
            fontFamily="'JetBrains Mono', monospace"
            letterSpacing="1.1"
          >
            {pathRole === 'source' ? 'SOURCE' : 'TARGET'}
          </text>
        </g>
      )}

      <rect
        className="node-shell"
        x={-66}
        y={-44}
        width={132}
        height={88}
        rx={16}
        fill={active ? 'var(--graph-surface)' : 'color-mix(in srgb, var(--failed) 12%, var(--graph-surface))'}
        stroke={stroke}
        strokeWidth={selected ? 1.6 : 1.1}
        strokeDasharray={active ? undefined : '5 4'}
        opacity={active ? 1 : 0.82}
      />
      <rect x={-66} y={-44} width={132} height={88} rx={16} fill={meta.color} opacity={active ? 0.035 : 0.015} pointerEvents="none" />

      <rect
        className="node-focus"
        x={-70}
        y={-48}
        width={140}
        height={96}
        rx={19}
        fill="none"
        stroke="var(--focus)"
        strokeWidth={1.4}
        pointerEvents="none"
      />

      {/* device type glyph */}
      <circle cx={0} cy={-17} r={15} fill={`${meta.color}1c`} stroke={`${meta.color}55`} strokeWidth={1} />
      <Icon
        x={-9}
        y={-26}
        width={18}
        height={18}
        color={active ? meta.color : '#64748b'}
        strokeWidth={1.7}
        aria-hidden="true"
      />

      {/* status LED */}
      <circle cx={53} cy={-33} r={3.4} fill={active ? 'var(--healthy)' : 'var(--failed)'} />
      <circle cx={53} cy={-33} r={6.5} fill={active ? 'var(--healthy)' : 'var(--failed)'} opacity={0.14} />

      {critical && (
        <g transform="translate(-53,-33)">
          <circle r={7.5} fill="var(--critical)" opacity={0.16} />
          <TriangleAlert x={-5} y={-5} width={10} height={10} color="var(--critical)" strokeWidth={2} />
        </g>
      )}

      <text
        textAnchor="middle"
        y={10}
        fill={active ? 'var(--text-primary)' : 'var(--text-muted)'}
        fontSize={10.6}
        fontFamily="'JetBrains Mono', monospace"
        letterSpacing="-0.2"
        className="node-label"
      >
        {name}
      </text>
      <text
        textAnchor="middle"
        y={24}
        fill={active ? 'var(--text-muted)' : 'var(--failed)'}
        fontSize={7}
        fontFamily="'JetBrains Mono', monospace"
        letterSpacing="1.3"
      >
        {active ? meta.label : 'OFFLINE'}
      </text>

      {componentColor && active && (
        <rect x={-28} y={34} width={56} height={2.6} rx={1.3} fill={componentColor} />
      )}

      {/* Tarjan disc[] / low[] values, shown under the node while tracing. */}
      {showDiscLow && traceNode?.disc !== undefined && (
        <g transform="translate(0,43)" pointerEvents="none">
          <rect x={-40} y={-8} width={80} height={15} rx={4} fill="#0b1220" stroke="#a78bfa55" strokeWidth={0.8} />
          <text
            textAnchor="middle"
            y={3}
            fill="#c4b5fd"
            fontSize={7}
            fontFamily="'JetBrains Mono', monospace"
          >
            d={traceNode.disc} · l={traceNode.low}
          </text>
        </g>
      )}

      {!active && (
        <g transform="translate(0,53)" pointerEvents="none">
          <rect x={-23} y={-8} width={46} height={16} rx={8} fill="var(--surface)" stroke="var(--failed)" strokeOpacity={0.55} strokeWidth={1} />
          <text
            textAnchor="middle"
            y={3}
            fill="#fda4af"
            fontSize={7.2}
            fontFamily="'JetBrains Mono', monospace"
            letterSpacing="1.2"
          >
            DOWN
          </text>
        </g>
      )}
    </g>
  );
}
