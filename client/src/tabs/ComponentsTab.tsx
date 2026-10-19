import { useEffect, useMemo } from 'react';
import { motion } from 'framer-motion';
import { ArrowRight, Boxes, CircleAlert, Layers, RefreshCw, Unplug, WifiOff } from 'lucide-react';
import type { GraphSnapshot } from '../lib/types';
import { useNetworkStore } from '../store/useNetworkStore';
import { NetworkCanvas } from '../components/NetworkCanvas';
import { CanvasLegend, DotSwatch } from '../components/CanvasLegend';
import { InspectorDock } from '../components/InspectorDock';
import { DeviceIcon } from '../components/DeviceIcon';
import { COMPONENT_COLORS, deviceMeta } from '../lib/layout';
import { Badge, Button, ComplexityChip, EmptyState, Panel, SectionHeader, Skeleton } from '../components/ui';

export function ComponentsTab({ graph }: { graph: GraphSnapshot }) {
  const components = useNetworkStore((state) => state.components);
  const loading = useNetworkStore((state) => state.componentsLoading);
  const load = useNetworkStore((state) => state.loadComponents);
  const select = useNetworkStore((state) => state.select);
  const setTab = useNetworkStore((state) => state.setTab);
  const selected = useNetworkStore((state) => state.selected);

  useEffect(() => {
    void load();
  }, [graph.updatedAt, load]);

  const componentMap = useMemo(() => {
    const map = new Map<string, number>();
    components?.components.forEach((component, index) => {
      component.nodes.forEach((name) => map.set(name, index));
    });
    return map;
  }, [components]);

  const largestSize = components?.components.reduce((max, component) => Math.max(max, component.nodes.length), 0) ?? 0;

  return (
    <div className="space-y-4">
      <Panel glow className="overflow-hidden">
        <div className="p-4 sm:p-5">
          <SectionHeader
            eyebrow="04 · flood fill"
            title="Connected Components"
            subtitle="Every unvisited active device starts a BFS flood fill across its adjacency list. Each flood is one surviving subnetwork after failures."
            icon={Layers}
            actions={
              <>
                {components && <ComplexityChip complexity={components.complexity} time={components.executionMs} />}
                <Button size="sm" variant="secondary" icon={RefreshCw} loading={loading} onClick={() => void load()}>
                  Refresh
                </Button>
              </>
            }
          />
        </div>

        <div className="px-3 pb-3 sm:px-4">
          <NetworkCanvas
            graph={graph}
            selected={selected}
            onSelectDevice={(name) => select({ kind: 'device', name })}
            onSelectLink={(u, v) => select({ kind: 'link', u, v })}
            highlight={{
              componentMap,
              componentColors: COMPONENT_COLORS,
            }}
          />
        </div>

        <CanvasLegend
          items={[
            ...(components?.components ?? []).slice(0, 5).map((component, index) => ({
              label: `subnetwork ${component.id} · ${component.nodes.length}`,
              swatch: <DotSwatch color={COMPONENT_COLORS[index % COMPONENT_COLORS.length]} />,
            })),
          ]}
          note={components ? `${components.count} component${components.count === 1 ? '' : 's'} detected` : 'Scanning…'}
        />
      </Panel>

      <InspectorDock graph={graph} selected={selected} />

      {loading && !components ? (
        <div className="grid gap-3 md:grid-cols-2">
          {[0, 1].map((key) => (
            <div key={key} className="panel space-y-3 p-4">
              <Skeleton className="h-4 w-32" />
              <div className="flex gap-2">
                <Skeleton className="h-8 w-24" />
                <Skeleton className="h-8 w-24" />
              </div>
            </div>
          ))}
        </div>
      ) : components ? (
        <>
          <div className="flex flex-wrap items-center gap-2">
            <Badge tone={components.count === 1 ? 'emerald' : 'amber'} icon={Boxes}>
              {components.count} active subnetwork{components.count === 1 ? '' : 's'}
            </Badge>
            {components.inactiveDevices.length > 0 && (
              <Badge tone="rose" icon={WifiOff}>
                {components.inactiveDevices.length} device{components.inactiveDevices.length === 1 ? '' : 's'} down
              </Badge>
            )}
            <span className="ml-auto font-mono text-[9px] text-slate-600">
              {components.count === 1 ? 'entire active network is reachable' : 'traffic cannot cross subnetworks'}
            </span>
          </div>

          <div className="grid gap-3 md:grid-cols-2">
            {components.components.map((component, index) => {
              const color = COMPONENT_COLORS[index % COMPONENT_COLORS.length];
              const isLargest = component.nodes.length === largestSize && components.components.length > 1;
              const percent = Math.round((component.nodes.length / Math.max(1, components.components.reduce((sum, item) => sum + item.nodes.length, 0))) * 100);
              return (
                <motion.div
                  key={component.id}
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.25, delay: index * 0.04 }}
                  className="panel relative overflow-hidden"
                >
                  <span className="absolute inset-x-0 top-0 h-px" style={{ backgroundColor: `${color}88` }} />
                  <div className="flex items-center gap-3 px-4 pt-3.5">
                    <span
                      className="grid size-8 place-items-center rounded-lg border font-mono text-[11px] font-semibold"
                      style={{ color, borderColor: `${color}33`, backgroundColor: `${color}12` }}
                    >
                      {component.id}
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <h3 className="font-display text-[13px] font-semibold text-slate-100">Subnetwork {component.id}</h3>
                        {isLargest && <Badge tone="cyan">largest</Badge>}
                      </div>
                      <p className="font-mono text-[8.5px] uppercase tracking-[0.1em] text-slate-600">
                        {component.nodes.length} devices · {percent}% of active nodes
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="font-display text-xl font-semibold tabular-nums" style={{ color }}>
                        {component.nodes.length}
                      </p>
                      <p className="font-mono text-[8px] uppercase tracking-wide text-slate-600">devices</p>
                    </div>
                  </div>

                  <div className="mx-4 my-3 h-1 overflow-hidden rounded-full bg-white/[0.04]">
                    <div className="h-full rounded-full" style={{ width: `${percent}%`, backgroundColor: color }} />
                  </div>

                  <div className="flex flex-wrap gap-1.5 px-4 pb-4">
                    {component.nodes.map((name) => {
                      const meta = deviceMeta(name);
                      return (
                        <button
                          key={name}
                          type="button"
                          onClick={() => select({ kind: 'device', name })}
                          className="inline-flex items-center gap-1.5 rounded-md border border-white/[0.08] bg-white/[0.02] px-2 py-1 font-mono text-[9.5px] text-slate-300 transition-colors hover:border-white/20 hover:bg-white/[0.05]"
                        >
                          <DeviceIcon kind={meta.kind} size={10} color={meta.color} />
                          {name}
                        </button>
                      );
                    })}
                  </div>
                </motion.div>
              );
            })}
          </div>

          {components.inactiveDevices.length > 0 && (
            <div className="panel-inset flex flex-wrap items-center gap-2 p-3.5">
              <span className="inline-flex items-center gap-1.5 font-mono text-[8.5px] uppercase tracking-[0.12em] text-rose-300/80">
                <Unplug size={12} /> excluded from components
              </span>
              {components.inactiveDevices.map((name) => (
                <button
                  key={name}
                  type="button"
                  onClick={() => select({ kind: 'device', name })}
                  className="inline-flex items-center gap-1 rounded-md border border-rose-400/20 bg-rose-400/[0.06] px-2 py-1 font-mono text-[9.5px] text-rose-200/80"
                >
                  {name}
                  <span className="text-[8px] uppercase text-rose-400">down</span>
                </button>
              ))}
            </div>
          )}

          <div className="panel-inset flex flex-wrap items-center justify-between gap-3 p-4">
            <div className="flex items-center gap-3">
              <span className="grid size-9 place-items-center rounded-lg border border-cyan-400/15 bg-cyan-400/[0.06] text-cyan-300">
                <Boxes size={16} />
              </span>
              <p className="text-[10.5px] leading-relaxed text-slate-500">
                Each component is discovered in <span className="font-mono text-cyan-300">O(V + E)</span>. Isolated UP
                devices count as their own subnetwork; DOWN devices are skipped entirely.
              </p>
            </div>
            <Button size="sm" variant="secondary" icon={ArrowRight} onClick={() => setTab('failure')}>
              Open failure simulator
            </Button>
          </div>
        </>
      ) : (
        <div className="panel p-4">
          <EmptyState
            icon={CircleAlert}
            title="Component scan unavailable"
            description="The API did not return components. Check the backend connection and retry."
            action={
              <Button size="sm" variant="secondary" icon={RefreshCw} onClick={() => void load()}>
                Retry
              </Button>
            }
          />
        </div>
      )}
    </div>
  );
}
