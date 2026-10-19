import { useEffect, useMemo, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import {
  ArrowRight,
  Cable,
  CheckCircle2,
  CircleAlert,
  Copy,
  Crosshair,
  GitCompareArrows,
  Layers,
  Play,
  Scissors,
  Server,
  Sparkles,
  Unplug,
} from 'lucide-react';
import type { GraphSnapshot } from '../lib/types';
import { useNetworkStore } from '../store/useNetworkStore';
import { NetworkCanvas } from '../components/NetworkCanvas';
import { COMPONENT_COLORS } from '../lib/layout';
import { Badge, Button, EmptyState, Panel, SectionHeader, Skeleton, cn } from '../components/ui';

const STEPS = [
  { number: '01', title: 'Clone', detail: 'Deep-copy the live adjacency list', icon: Copy },
  { number: '02', title: 'Cut', detail: 'Fail the critical device in the clone', icon: Scissors },
  { number: '03', title: 'Compare', detail: 'Re-run path, components and Tarjan', icon: GitCompareArrows },
];

export function DemoTab({ graph }: { graph: GraphSnapshot }) {
  const demo = useNetworkStore((state) => state.demo);
  const demoLoading = useNetworkStore((state) => state.demoLoading);
  const runDemo = useNetworkStore((state) => state.runDemo);
  const [stage, setStage] = useState(0);

  useEffect(() => {
    if (!demo) {
      setStage(0);
      return;
    }
    setStage(1);
    const first = setTimeout(() => setStage(2), 550);
    const second = setTimeout(() => setStage(3), 1200);
    return () => {
      clearTimeout(first);
      clearTimeout(second);
    };
  }, [demo]);

  const afterComponentMap = useMemo(() => {
    const map = new Map<string, number>();
    demo?.after.components.components.forEach((component, index) => {
      component.nodes.forEach((name) => map.set(name, index));
    });
    return map;
  }, [demo]);

  const targetDevice = graph.devices.find((device) => device.name === (demo?.target.name ?? 'Dist_Router_1'));

  return (
    <div className="space-y-4">
      <Panel glow className="overflow-hidden">
        <div className="p-4 sm:p-5">
          <SectionHeader
            eyebrow="06 · guided demonstration"
            title="Before vs After Failure"
            subtitle="A controlled experiment on a cloned graph: measure the healthy network, fail one critical device, then measure the damage — without touching your live simulation."
            icon={GitCompareArrows}
            actions={
              demo ? (
                <Button variant="secondary" size="sm" icon={Sparkles} loading={demoLoading} onClick={() => void runDemo()}>
                  Run again
                </Button>
              ) : (
                <Badge tone="cyan">clone-safe</Badge>
              )
            }
          />
        </div>

        <AnimatePresence mode="wait">
          {demoLoading && !demo ? (
            <motion.div key="loading" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="border-t border-white/[0.06] p-5">
              <div className="flex flex-wrap items-center gap-4">
                <Skeleton className="size-12 rounded-xl" />
                <div className="flex-1 space-y-2">
                  <Skeleton className="h-4 w-56" />
                  <Skeleton className="h-3 w-80" />
                </div>
                <Skeleton className="h-10 w-36 rounded-xl" />
              </div>
              <div className="mt-5 grid gap-3 md:grid-cols-2">
                <Skeleton className="h-64 w-full rounded-xl" />
                <Skeleton className="h-64 w-full rounded-xl" />
              </div>
            </motion.div>
          ) : demo ? (
            <motion.div
              key="result"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="border-t border-white/[0.06]"
            >
              {demo.target.adjusted && (
                <div className="mx-4 mt-4 flex items-start gap-2 rounded-lg border border-amber-400/20 bg-amber-400/[0.05] px-3 py-2 text-[10.5px] text-amber-200/80 sm:mx-5">
                  <CircleAlert size={13} className="mt-0.5 shrink-0" />
                  {demo.target.note}
                </div>
              )}

              {/* stepper */}
              <div className="flex flex-col gap-2 border-b border-white/[0.05] px-4 py-4 sm:flex-row sm:items-center sm:gap-3 sm:px-5">
                {STEPS.map((step, index) => {
                  const active = stage >= index + 1;
                  return (
                    <div key={step.number} className="flex flex-1 items-center gap-3">
                      <div
                        className={cn(
                          'grid size-8 shrink-0 place-items-center rounded-lg border transition-all duration-300',
                          active
                            ? 'border-cyan-400/30 bg-cyan-400/[0.12] text-cyan-300'
                            : 'border-white/[0.08] bg-white/[0.02] text-slate-600',
                        )}
                      >
                        <step.icon size={14} />
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className={cn('font-mono text-[8px] uppercase tracking-[0.14em]', active ? 'text-cyan-300/80' : 'text-slate-600')}>
                          step {step.number}
                        </p>
                        <p className={cn('truncate text-[11px] font-medium', active ? 'text-slate-200' : 'text-slate-600')}>{step.title}</p>
                      </div>
                      {index < STEPS.length - 1 && (
                        <span className={cn('hidden h-px flex-1 sm:block', active ? 'bg-cyan-400/25' : 'bg-white/[0.06]')} />
                      )}
                    </div>
                  );
                })}
              </div>

              <div className="grid gap-3 p-4 md:grid-cols-2 sm:p-5">
                <div className="overflow-hidden rounded-xl border border-emerald-400/15 bg-[#061310]/50">
                  <div className="flex items-center justify-between border-b border-emerald-400/10 px-3.5 py-2.5">
                    <div className="flex items-center gap-2">
                      <span className="size-1.5 rounded-full bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.7)]" />
                      <span className="font-mono text-[9px] uppercase tracking-[0.14em] text-emerald-300">Before · healthy</span>
                    </div>
                    <span className="font-mono text-[8.5px] text-slate-500">{demo.before.snapshot.metrics.components} subnetwork</span>
                  </div>
                  <NetworkCanvas
                    graph={demo.before.snapshot}
                    compact
                    interactive={false}
                    highlight={{
                      path: demo.before.path.found ? demo.before.path.path : [],
                      articulationPoints: demo.target.wasCriticalDevice ? new Set([demo.target.name]) : new Set(),
                    }}
                  />
                  <div className="flex items-center justify-between gap-2 border-t border-emerald-400/10 px-3.5 py-2.5">
                    <span className="font-mono text-[9.5px] text-emerald-200/80">
                      {demo.before.path.found ? `${demo.before.path.hops} hops` : 'no path'}
                      <span className="text-slate-600"> · {demo.before.path.visitedOrder.length} visited</span>
                    </span>
                    <span className="inline-flex items-center gap-1 font-mono text-[8.5px] text-slate-500">
                      <Crosshair size={10} /> {demo.target.name} online
                    </span>
                  </div>
                </div>

                <div className="overflow-hidden rounded-xl border border-rose-400/20 bg-[#14080e]/50">
                  <div className="flex items-center justify-between border-b border-rose-400/10 px-3.5 py-2.5">
                    <div className="flex items-center gap-2">
                      <span className="size-1.5 rounded-full bg-rose-400 shadow-[0_0_8px_rgba(251,113,133,0.7)]" />
                      <span className="font-mono text-[9px] uppercase tracking-[0.14em] text-rose-300">After · device failed</span>
                    </div>
                    <span className="font-mono text-[8.5px] text-slate-500">{demo.after.snapshot.metrics.components} subnetworks</span>
                  </div>
                  <NetworkCanvas
                    graph={demo.after.snapshot}
                    compact
                    interactive={false}
                    highlight={{ componentMap: afterComponentMap, componentColors: COMPONENT_COLORS }}
                  />
                  <div className="flex items-center justify-between gap-2 border-t border-rose-400/10 px-3.5 py-2.5">
                    <span className={cn('font-mono text-[9.5px]', demo.after.path.found ? 'text-amber-200/90' : 'text-rose-300')}>
                      {demo.after.path.found ? `${demo.after.path.hops} hops` : 'PATH BROKEN'}
                      <span className="text-slate-600"> · {demo.after.path.visitedOrder.length} visited</span>
                    </span>
                    <span className="inline-flex items-center gap-1 font-mono text-[8.5px] text-rose-400/80">
                      <Unplug size={10} /> {demo.target.name} down
                    </span>
                  </div>
                </div>
              </div>

              {/* comparison */}
              <div className="grid gap-4 px-4 pb-4 sm:px-5 sm:pb-5 lg:grid-cols-[1fr_320px]">
                <div className="panel-inset overflow-hidden">
                  <table className="w-full border-collapse text-left">
                    <thead>
                      <tr className="border-b border-white/[0.06] font-mono text-[8px] uppercase tracking-[0.12em] text-slate-600">
                        <th className="px-3 py-2 font-normal">metric</th>
                        <th className="px-3 py-2 text-right font-normal text-emerald-400/70">before</th>
                        <th className="px-3 py-2 text-right font-normal text-rose-400/70">after</th>
                        <th className="px-3 py-2 text-right font-normal">delta</th>
                      </tr>
                    </thead>
                    <tbody className="font-mono text-[10px]">
                      {[
                        {
                          label: 'active devices',
                          before: demo.before.snapshot.metrics.activeDevices,
                          after: demo.after.snapshot.metrics.activeDevices,
                          tone: 'rose' as const,
                        },
                        {
                          label: 'surviving subnetworks',
                          before: demo.before.snapshot.metrics.components,
                          after: demo.after.snapshot.metrics.components,
                          tone: 'amber' as const,
                        },
                        {
                          label: 'critical devices left',
                          before: demo.before.vulnerabilities.articulationPoints.length,
                          after: demo.after.vulnerabilities.articulationPoints.length,
                          tone: 'slate' as const,
                        },
                        {
                          label: 'critical links left',
                          before: demo.before.vulnerabilities.bridges.length,
                          after: demo.after.vulnerabilities.bridges.length,
                          tone: 'slate' as const,
                        },
                      ].map((row) => {
                        const delta = row.after - row.before;
                        return (
                          <tr key={row.label} className="border-b border-white/[0.04] last:border-0">
                            <td className="px-3 py-2 text-slate-400">{row.label}</td>
                            <td className="px-3 py-2 text-right tabular-nums text-emerald-200/90">{row.before}</td>
                            <td className="px-3 py-2 text-right tabular-nums text-rose-200/90">{row.after}</td>
                            <td
                              className={cn(
                                'px-3 py-2 text-right tabular-nums',
                                delta < 0 ? 'text-rose-300' : delta > 0 ? 'text-amber-300' : 'text-slate-600',
                              )}
                            >
                              {delta > 0 ? `+${delta}` : delta === 0 ? '—' : delta}
                            </td>
                          </tr>
                        );
                      })}
                      <tr>
                        <td className="px-3 py-2 text-slate-400">shortest path</td>
                        <td className="px-3 py-2 text-right text-emerald-200/90">
                          {demo.before.path.found ? `${demo.before.path.hops} hops` : 'broken'}
                        </td>
                        <td className={cn('px-3 py-2 text-right', demo.after.path.found ? 'text-amber-200/90' : 'text-rose-300')}>
                          {demo.after.path.found ? `${demo.after.path.hops} hops` : 'broken'}
                        </td>
                        <td className="px-3 py-2 text-right text-rose-300">
                          {demo.impact.pathBroken ? 'lost' : demo.after.path.hops - demo.before.path.hops !== 0 ? `${demo.after.path.hops - demo.before.path.hops} hops` : '—'}
                        </td>
                      </tr>
                    </tbody>
                  </table>
                </div>

                <div className="space-y-3">
                  <div
                    className={cn(
                      'rounded-xl border p-3.5',
                      demo.impact.pathBroken
                        ? 'border-rose-400/25 bg-gradient-to-br from-rose-500/[0.12] to-[#160a10]'
                        : 'border-amber-400/20 bg-amber-400/[0.05]',
                    )}
                  >
                    <div className="flex items-center gap-2">
                      <span
                        className={cn(
                          'grid size-8 place-items-center rounded-lg border',
                          demo.impact.pathBroken
                            ? 'border-rose-400/25 bg-rose-400/10 text-rose-300'
                            : 'border-amber-400/20 bg-amber-400/10 text-amber-300',
                        )}
                      >
                        {demo.impact.pathBroken ? <Unplug size={16} /> : <CheckCircle2 size={16} />}
                      </span>
                      <div>
                        <p className="font-mono text-[8px] uppercase tracking-[0.14em] text-slate-500">route impact</p>
                        <p className="font-display text-[13px] font-semibold text-slate-100">
                          {demo.impact.pathBroken ? 'Path Broken' : 'Path still reachable'}
                        </p>
                      </div>
                    </div>
                    <div className="mt-2.5 flex items-center gap-1.5 overflow-hidden font-mono text-[9.5px]">
                      <span className="truncate rounded border border-white/10 bg-white/[0.04] px-1.5 py-1 text-slate-300">{demo.source}</span>
                      <ArrowRight size={10} className="shrink-0 text-slate-600" />
                      <span className="truncate rounded border border-white/10 bg-white/[0.04] px-1.5 py-1 text-slate-300">{demo.destination}</span>
                    </div>
                    <p className="mt-2 text-[10px] leading-relaxed text-slate-500">
                      {demo.impact.pathBroken
                        ? `The ${demo.impact.hopsBefore}-hop route no longer has a valid adjacency chain.`
                        : `Traffic still crosses in ${demo.impact.hopsAfter} hops after the failure.`}
                    </p>
                  </div>

                  <div className="panel-inset p-3.5">
                    <p className="mb-2 font-mono text-[8px] uppercase tracking-[0.14em] text-slate-600">what changed</p>
                    <ul className="space-y-1.5">
                      {demo.impact.narrative.slice(0, 3).map((line, index) => (
                        <li key={index} className="flex items-start gap-1.5 text-[10px] leading-relaxed text-slate-400">
                          <span className="mt-1 size-1 shrink-0 rounded-full bg-cyan-400/70" />
                          {line}
                        </li>
                      ))}
                    </ul>
                  </div>
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-x-4 gap-y-2 border-t border-white/[0.05] px-4 py-3 sm:px-5">
                <span className="inline-flex items-center gap-1.5 font-mono text-[8.5px] uppercase tracking-[0.1em] text-emerald-300/70">
                  <CheckCircle2 size={11} /> live network untouched
                </span>
                <span className="inline-flex items-center gap-1.5 font-mono text-[8.5px] uppercase tracking-[0.1em] text-slate-500">
                  <Server size={11} /> {demo.after.snapshot.metrics.activeDevices} devices still serving
                </span>
                <span className="inline-flex items-center gap-1.5 font-mono text-[8.5px] uppercase tracking-[0.1em] text-slate-500">
                  <Cable size={11} /> {demo.after.snapshot.metrics.activeLinks} physical links
                </span>
                <span className="ml-auto font-mono text-[8.5px] text-slate-600">
                  {demo.after.vulnerabilities.complexity} per re-analysis
                </span>
              </div>
            </motion.div>
          ) : (
            <motion.div key="idle" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="border-t border-white/[0.06] p-4 sm:p-6">
              <div className="grid gap-6 lg:grid-cols-[1.15fr_0.85fr] lg:items-center">
                <div>
                  <p className="eyebrow">one click · three phases</p>
                  <h3 className="mt-2 max-w-lg font-display text-2xl font-semibold leading-tight tracking-tight text-slate-100 sm:text-[30px]">
                    Watch a single failure split the network.
                  </h3>
                  <p className="mt-3 max-w-lg text-[12px] leading-relaxed text-slate-400">
                    NetGuard clones the live graph, fails <span className="font-mono text-rose-300">Dist_Router_1</span> — an
                    articulation point — then re-runs BFS, connected components and Tarjan's algorithm. The live topology is
                    never modified.
                  </p>
                  <div className="mt-5 flex flex-wrap items-center gap-3">
                    <Button variant="primary" size="md" icon={Play} loading={demoLoading} onClick={() => void runDemo()}>
                      Run guided demo
                    </Button>
                    <span className="font-mono text-[9px] text-slate-600">Admin_PC → Web_Server · live clone</span>
                  </div>

                  <div className="mt-6 grid gap-2 sm:grid-cols-3">
                    {STEPS.map((step) => (
                      <div key={step.number} className="rounded-xl border border-white/[0.06] bg-white/[0.015] p-3">
                        <div className="mb-2 flex items-center justify-between">
                          <step.icon size={13} className="text-cyan-300" />
                          <span className="font-mono text-[8px] text-slate-600">{step.number}</span>
                        </div>
                        <p className="text-[11px] font-medium text-slate-200">{step.title}</p>
                        <p className="mt-1 text-[9.5px] leading-relaxed text-slate-500">{step.detail}</p>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="relative overflow-hidden rounded-2xl border border-white/[0.07] bg-[#060e1a] p-4">
                  <div className="absolute inset-0 grid-fade opacity-30" />
                  <div className="relative">
                    <div className="flex items-center justify-between">
                      <span className="font-mono text-[8px] uppercase tracking-[0.16em] text-slate-500">experiment spec</span>
                      <Badge tone={targetDevice?.active ? 'emerald' : 'rose'}>{targetDevice?.active ? 'ready' : 'target down'}</Badge>
                    </div>
                    <div className="mt-4 space-y-3">
                      <div className="flex items-center gap-3 rounded-lg border border-white/[0.06] bg-white/[0.02] p-2.5">
                        <span className="grid size-8 place-items-center rounded-lg border border-rose-400/20 bg-rose-400/[0.06] text-rose-300">
                          <Crosshair size={15} />
                        </span>
                        <div>
                          <p className="font-mono text-[8px] uppercase tracking-[0.12em] text-slate-600">target vertex</p>
                          <p className="font-mono text-[11px] text-slate-200">{targetDevice?.name ?? 'Dist_Router_1'}</p>
                        </div>
                        <span className="ml-auto font-mono text-[8px] uppercase text-rose-400/70">fail</span>
                      </div>
                      <div className="flex items-center gap-3 rounded-lg border border-white/[0.06] bg-white/[0.02] p-2.5">
                        <span className="grid size-8 place-items-center rounded-lg border border-cyan-400/20 bg-cyan-400/[0.06] text-cyan-300">
                          <ArrowRight size={15} />
                        </span>
                        <div>
                          <p className="font-mono text-[8px] uppercase tracking-[0.12em] text-slate-600">route under test</p>
                          <p className="font-mono text-[11px] text-slate-200">Admin_PC → Web_Server</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-3 rounded-lg border border-white/[0.06] bg-white/[0.02] p-2.5">
                        <span className="grid size-8 place-items-center rounded-lg border border-violet-400/20 bg-violet-400/[0.06] text-violet-300">
                          <Layers size={15} />
                        </span>
                        <div>
                          <p className="font-mono text-[8px] uppercase tracking-[0.12em] text-slate-600">live topology</p>
                          <p className="font-mono text-[11px] text-slate-200">
                            {graph.metrics.activeDevices} up · {graph.metrics.components} subnet{graph.metrics.components === 1 ? '' : 's'}
                          </p>
                        </div>
                        <span className="ml-auto rounded border border-emerald-400/20 bg-emerald-400/[0.06] px-1.5 py-0.5 font-mono text-[7.5px] uppercase text-emerald-300">
                          safe
                        </span>
                      </div>
                    </div>
                    <p className="mt-3 font-mono text-[8.5px] leading-relaxed text-slate-600">
                      Target is an articulation point. If it is already down, the demo automatically picks another active
                      critical device.
                    </p>
                  </div>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </Panel>

      {!demo && (
        <div className="grid gap-3 md:grid-cols-3">
          {[
            {
              icon: Server,
              title: 'Healthy baseline',
              body: 'Run BFS, count components and identify critical elements before anything fails.',
              tone: 'border-emerald-400/15 bg-emerald-400/[0.06] text-emerald-300',
            },
            {
              icon: Scissors,
              title: 'Controlled cut',
              body: 'Fail exactly one articulation point in a deep clone of the graph.',
              tone: 'border-rose-400/15 bg-rose-400/[0.06] text-rose-300',
            },
            {
              icon: GitCompareArrows,
              title: 'Measured impact',
              body: 'Compare hops, subnetwork count and critical-element counts side by side.',
              tone: 'border-cyan-400/15 bg-cyan-400/[0.06] text-cyan-300',
            },
          ].map((item) => (
            <div key={item.title} className="panel p-4">
              <span className={cn('mb-2.5 grid size-8 place-items-center rounded-lg border', item.tone)}>
                <item.icon size={15} />
              </span>
              <p className="font-display text-[12px] font-semibold text-slate-200">{item.title}</p>
              <p className="mt-1 text-[10px] leading-relaxed text-slate-500">{item.body}</p>
            </div>
          ))}
        </div>
      )}

      {!graph.metrics.devices && (
        <EmptyState icon={CircleAlert} title="No topology loaded" description="Start the API and reload the page." />
      )}
    </div>
  );
}
