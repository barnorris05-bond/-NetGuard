import { AnimatePresence, motion } from 'framer-motion';
import {
  BookOpen,
  Boxes,
  Cable,
  ChevronDown,
  GitBranch,
  GraduationCap,
  Map as MapIcon,
  Network,
  ShieldAlert,
  Waypoints,
} from 'lucide-react';
import type { GraphSnapshot } from '../lib/types';
import { getSessionId } from '../lib/api';
import { useNetworkStore } from '../store/useNetworkStore';
import { cn, LiveDot } from './ui';

/* ------------------------------------------------------------------ */
/* Adjacency list — the educational centerpiece                        */
/* ------------------------------------------------------------------ */

export function AdjacencyPanel({ graph }: { graph: GraphSnapshot }) {
  const selected = useNetworkStore((state) => state.selected);
  const select = useNetworkStore((state) => state.select);
  const open = useNetworkStore((state) => state.showAdjacency);
  const toggle = useNetworkStore((state) => state.toggleAdjacency);
  const diff = useNetworkStore((state) => state.adjacencyDiff);
  const totalActiveEdges = graph.metrics.activeLinks * 2;
  const changedRows = diff ? Object.keys(diff.neighbors).length + Object.keys(diff.devices).length : 0;

  return (
    <section className="panel overflow-hidden">
      <header className="flex items-center justify-between gap-2 border-b border-white/[0.06] px-4 py-3.5">
        <div className="flex items-center gap-2.5">
          <div className="grid size-8 place-items-center rounded-lg border border-cyan-400/20 bg-cyan-400/[0.07] text-cyan-300">
            <MapIcon size={15} strokeWidth={1.9} />
          </div>
          <div>
            <h2 className="font-display text-[13.5px] font-semibold text-slate-100">Adjacency List</h2>
            <p className="font-mono text-[8.5px] uppercase tracking-[0.14em] text-slate-500">vector&lt;vector&lt;int&gt;&gt; · always on</p>
          </div>
        </div>
        <div className="flex items-center gap-1.5">
          {changedRows > 0 && (
            <span className="rounded-full border border-amber-400/25 bg-amber-400/[0.08] px-1.5 py-0.5 font-mono text-[8px] uppercase tracking-[0.1em] text-amber-300">
              Δ{changedRows}
            </span>
          )}
          <div className="flex items-center gap-1.5 rounded-full border border-emerald-400/15 bg-emerald-400/[0.05] px-2 py-1">
            <LiveDot />
            <span className="font-mono text-[8px] uppercase tracking-[0.12em] text-emerald-300">live</span>
          </div>
          <button
            type="button"
            onClick={toggle}
            aria-expanded={open}
            aria-label={open ? 'Collapse adjacency list' : 'Expand adjacency list'}
            className="grid size-6 place-items-center rounded-md border border-white/[0.08] bg-white/[0.02] text-slate-400 transition-colors hover:border-white/20 hover:text-slate-200"
          >
            <ChevronDown size={13} className={cn('transition-transform duration-200', open && 'rotate-180')} />
          </button>
        </div>
      </header>

      {!open && (
        <div className="flex items-center justify-between px-4 py-2 font-mono text-[9px] text-slate-500">
          <span>{graph.metrics.devices} devices · {graph.metrics.activeLinks} active links</span>
          <span>{graph.metrics.components} component{graph.metrics.components === 1 ? '' : 's'}</span>
        </div>
      )}

      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            key="adjacency-body"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
            className="overflow-hidden"
          >
            <div className="flex items-center justify-between border-b border-white/[0.04] px-4 py-2 font-mono text-[9px] uppercase tracking-[0.08em] text-slate-500">
              <span>device → neighbours</span>
              <span>
                V={graph.metrics.devices} · 2E={totalActiveEdges}
              </span>
            </div>

            {diff && (
              <div className="border-b border-amber-400/10 bg-amber-400/[0.03] px-4 py-1.5 font-mono text-[8.5px] text-amber-300/80">
                just changed · red = removed, green = restored
              </div>
            )}

            <div>
              {graph.adjacency.map((entry) => {
                const isSelected = selected?.kind === 'device' && selected.name === entry.name;
                const rowChange = diff?.devices[entry.name];
                return (
                  <button
                    key={entry.name}
                    type="button"
                    onClick={() => select({ kind: 'device', name: entry.name })}
                    className={cn(
                      'block w-full border-b border-white/[0.035] px-3.5 py-1.5 text-left transition-colors last:border-b-0',
                      isSelected ? 'bg-cyan-400/[0.055]' : 'hover:bg-white/[0.025]',
                      rowChange === 'down' && 'adj-row-down',
                      rowChange === 'restored' && 'adj-row-restored',
                    )}
                  >
                    <div className="flex items-center gap-2">
                      <span className="w-6 shrink-0 font-mono text-[9px] text-slate-600">[{entry.index}]</span>
                      <span
                        className={cn(
                          'size-1.5 shrink-0 rounded-full',
                          entry.active ? 'bg-emerald-400 shadow-[0_0_6px_rgba(52,211,153,0.5)]' : 'bg-rose-400',
                        )}
                      />
                      <span
                        className={cn(
                          'truncate font-mono text-[10.5px]',
                          entry.active ? 'text-slate-200' : 'text-rose-300/80 line-through decoration-rose-400/40',
                        )}
                      >
                        {entry.name}
                      </span>
                      <span className="ml-auto shrink-0 font-mono text-[8px] uppercase tracking-wide text-slate-600">
                        {entry.active ? `${entry.activeNeighborCount} up` : 'down'}
                      </span>
                    </div>

                    <div className="mt-0.5 flex flex-wrap items-center gap-1 pl-8">
                      <span className="font-mono text-[9.5px] text-slate-600">→</span>
                      {entry.neighbors.length === 0 && (
                        <span className="font-mono text-[9px] italic text-slate-600">EMPTY (isolated node)</span>
                      )}
                      {!entry.active && entry.neighbors.length > 0 && (
                        <span className="font-mono text-[9px] italic text-rose-400/60">device inactive — traversals skip it</span>
                      )}
                      {entry.neighbors.map((neighbor) => {
                        const change = diff?.neighbors[entry.name]?.find((item) => item.name === neighbor.name)?.change;
                        return (
                          <span
                            key={neighbor.name}
                            className={cn(
                              'inline-flex items-center gap-1 rounded border px-1.5 font-mono text-[8.5px] leading-[15px]',
                              neighbor.active
                                ? 'border-cyan-400/15 bg-cyan-400/[0.05] text-cyan-200/80'
                                : neighbor.linkActive
                                  ? 'border-white/[0.06] bg-white/[0.02] text-slate-500'
                                  : 'border-rose-400/15 bg-rose-400/[0.04] text-rose-300/60 line-through',
                              change === 'removed' && 'adj-chip-removed',
                              change === 'added' && 'adj-chip-added',
                            )}
                            title={
                              change === 'removed'
                                ? 'Just changed: traffic can no longer cross this neighbour'
                                : change === 'added'
                                  ? 'Just restored: traffic can cross this neighbour again'
                                  : neighbor.active
                                    ? 'Active link'
                                    : !neighbor.linkActive
                                      ? 'Physical link is cut'
                                      : 'Neighbouring device is down'
                            }
                          >
                            {neighbor.name}
                          </span>
                        );
                      })}
                    </div>
                  </button>
                );
              })}
            </div>

            <footer className="flex items-center justify-between border-t border-white/[0.05] px-4 py-2.5 font-mono text-[8.5px] text-slate-600">
              <span>adjList[i] = neighbours of device i</span>
              <span className="text-cyan-400/50">O(V+E)</span>
            </footer>
          </motion.div>
        )}
      </AnimatePresence>
    </section>
  );
}

/* ------------------------------------------------------------------ */
/* Education overlay                                                   */
/* ------------------------------------------------------------------ */

const MAPPINGS = [
  { concept: 'Vertex', network: 'Device', icon: Network, tone: 'text-cyan-300 border-cyan-400/20 bg-cyan-400/[0.06]' },
  { concept: 'Edge', network: 'Physical link', icon: Cable, tone: 'text-blue-300 border-blue-400/20 bg-blue-400/[0.06]' },
  { concept: 'Bridge', network: 'Critical link', icon: GitBranch, tone: 'text-amber-300 border-amber-400/20 bg-amber-400/[0.06]' },
  {
    concept: 'Articulation Point',
    network: 'Critical device',
    icon: ShieldAlert,
    tone: 'text-rose-300 border-rose-400/20 bg-rose-400/[0.06]',
  },
  { concept: 'Component', network: 'Isolated subnetwork', icon: Boxes, tone: 'text-violet-300 border-violet-400/20 bg-violet-400/[0.06]' },
];

const COMPLEXITIES = [
  { name: 'BFS shortest path', value: 'O(V + E)' },
  { name: 'Tarjan bridges + APs', value: 'O(V + E)' },
  { name: 'Connected components', value: 'O(V + E)' },
  { name: 'Adjacency-list memory', value: 'O(V + E)' },
];

export function EducationPanel() {
  const open = useNetworkStore((state) => state.showEducation);
  const setOpen = useNetworkStore((state) => state.setShowEducation);

  return (
    <section className="panel overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="flex w-full items-center justify-between gap-2 px-4 py-3.5 text-left"
        aria-expanded={open}
      >
        <div className="flex items-center gap-2.5">
          <div className="grid size-8 place-items-center rounded-lg border border-violet-400/20 bg-violet-400/[0.07] text-violet-300">
            <BookOpen size={15} strokeWidth={1.9} />
          </div>
          <div>
            <h2 className="font-display text-[13.5px] font-semibold text-slate-100">Graph → Network</h2>
            <p className="font-mono text-[8.5px] uppercase tracking-[0.14em] text-slate-500">concept map · complexity</p>
          </div>
        </div>
        <ChevronDown size={15} className={cn('text-slate-500 transition-transform duration-300', open && 'rotate-180')} />
      </button>

      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.26, ease: [0.22, 1, 0.36, 1] }}
            className="overflow-hidden border-t border-white/[0.05]"
          >
            <div className="space-y-3 p-4">
              <div className="space-y-1.5">
                {MAPPINGS.map((item) => (
                  <div key={item.concept} className="flex items-center gap-2 rounded-lg border border-white/[0.045] bg-white/[0.015] px-2.5 py-1.5">
                    <span className={cn('grid size-6 shrink-0 place-items-center rounded-md border', item.tone)}>
                      <item.icon size={12} strokeWidth={1.9} />
                    </span>
                    <span className="min-w-0 flex-1 truncate text-[10.5px] text-slate-400">{item.concept}</span>
                    <span className="text-slate-600">→</span>
                    <span className="truncate text-[10.5px] font-medium text-slate-200">{item.network}</span>
                  </div>
                ))}
              </div>

              <div className="panel-inset p-3">
                <div className="mb-2 flex items-center gap-1.5">
                  <Waypoints size={11} className="text-cyan-400" />
                  <span className="font-mono text-[8.5px] uppercase tracking-[0.14em] text-slate-500">Every run costs</span>
                </div>
                <div className="space-y-1.5">
                  {COMPLEXITIES.map((item) => (
                    <div key={item.name} className="flex items-center justify-between gap-3">
                      <span className="text-[10px] text-slate-500">{item.name}</span>
                      <span className="font-mono text-[9.5px] text-violet-300">{item.value}</span>
                    </div>
                  ))}
                </div>
              </div>

              <div className="rounded-xl border border-cyan-400/15 bg-cyan-400/[0.035] p-3">
                <div className="mb-1 flex items-center gap-1.5">
                  <GraduationCap size={12} className="text-cyan-300" />
                  <span className="font-mono text-[8.5px] uppercase tracking-[0.14em] text-cyan-300/80">Viva tip</span>
                </div>
                <p className="text-[10.5px] leading-relaxed text-slate-400">
                  <span className="font-mono text-cyan-200/90">adjList[5] = [2, 8, 9]</span> means Switch_C is physically wired to
                  Dist_Router_2, Admin_PC and User_PC. Failure analysis is just pruning this array before traversal.
                </p>
              </div>

              <p className="text-[9px] leading-relaxed text-slate-600">
                Session {getSessionId().slice(0, 8)} · every simulation is persisted by the API.
              </p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </section>
  );
}

/* ------------------------------------------------------------------ */
/* Sidebar shell                                                       */
/* ------------------------------------------------------------------ */

export function AppSidebar() {
  const graph = useNetworkStore((state) => state.graph);

  return (
    <aside className="min-w-0 space-y-4">
      {graph ? (
        <AdjacencyPanel graph={graph} />
      ) : (
        <div className="panel p-4">
          <div className="skeleton mb-3 h-5 w-32" />
          {Array.from({ length: 8 }).map((_, index) => (
            <div key={index} className="mb-2 flex items-center gap-2">
              <div className="skeleton size-3 rounded-full" />
              <div className="skeleton h-3 flex-1" />
              <div className="skeleton h-3 w-14" />
            </div>
          ))}
        </div>
      )}
      <EducationPanel />
    </aside>
  );
}
