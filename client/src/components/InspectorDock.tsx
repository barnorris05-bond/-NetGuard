import { AnimatePresence, motion } from 'framer-motion';
import { Cable, CircleAlert, Gauge, Power, PowerOff, X, Zap } from 'lucide-react';
import type { GraphSnapshot, Selection } from '../lib/types';
import { deviceMeta, linkKey } from '../lib/layout';
import { DeviceIcon } from './DeviceIcon';
import { Badge, Button, cn, Spinner } from './ui';
import { useNetworkStore } from '../store/useNetworkStore';

export function InspectorDock({ graph, selected }: { graph: GraphSnapshot; selected: Selection }) {
  const select = useNetworkStore((state) => state.select);
  const failDevice = useNetworkStore((state) => state.failDevice);
  const restoreDevice = useNetworkStore((state) => state.restoreDevice);
  const failLink = useNetworkStore((state) => state.failLink);
  const restoreLink = useNetworkStore((state) => state.restoreLink);
  const pending = useNetworkStore((state) => state.pending);
  const vulnerabilities = useNetworkStore((state) => state.vulnerabilities);

  if (!selected) return null;

  const device =
    selected.kind === 'device' ? graph.devices.find((entry) => entry.name === selected.name) : undefined;
  const link =
    selected.kind === 'link'
      ? graph.links.find((entry) => entry.id === linkKey(selected.u, selected.v))
      : undefined;

  const selectedKey =
    selected.kind === 'device' ? `device:${selected.name}` : selected.kind === 'link' ? `link:${linkKey(selected.u, selected.v)}` : '';
  const isPending = pending.includes(selectedKey);

  return (
    <AnimatePresence mode="wait">
      {device && (
        <motion.div
          key={`device-${device.name}`}
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 6 }}
          transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
          className="panel-inset mt-3 overflow-hidden"
        >
          <div className="flex flex-wrap items-start gap-4 p-4">
            <div
              className="grid size-12 shrink-0 place-items-center rounded-xl border"
              style={{
                color: deviceMeta(device.name).color,
                borderColor: `${deviceMeta(device.name).color}33`,
                backgroundColor: `${deviceMeta(device.name).color}12`,
              }}
            >
              <DeviceIcon kind={deviceMeta(device.name).kind} size={22} strokeWidth={1.7} />
            </div>

            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <h3 className="font-mono text-[13px] font-medium tracking-tight text-slate-100">{device.name}</h3>
                <Badge tone={device.active ? 'emerald' : 'rose'}>{device.active ? 'UP' : 'DOWN'}</Badge>
                {vulnerabilities?.articulationPoints.includes(device.name) && (
                  <Badge tone="amber" icon={CircleAlert}>
                    critical device
                  </Badge>
                )}
              </div>
              <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 font-mono text-[10px] text-slate-500">
                <span className="inline-flex items-center gap-1">
                  <Gauge size={11} />
                  index [{device.index}]
                </span>
                <span>{deviceMeta(device.name).label}</span>
                <span>{device.activeDegree} active links</span>
                <span>{device.physicalDegree} physical links</span>
              </div>
              <div className="mt-2.5 flex flex-wrap gap-1.5">
                {graph.adjacency
                  .find((entry) => entry.name === device.name)
                  ?.neighbors.map((neighbor) => (
                    <button
                      key={neighbor.name}
                      type="button"
                      onClick={() => select({ kind: 'device', name: neighbor.name })}
                      className={cn(
                        'group inline-flex items-center gap-1 rounded-md border px-2 py-1 font-mono text-[9.5px] transition-colors',
                        neighbor.active
                          ? 'border-white/10 bg-white/[0.03] text-slate-400 hover:border-cyan-400/30 hover:text-cyan-200'
                          : 'border-rose-400/15 bg-rose-400/[0.05] text-rose-300/70',
                      )}
                    >
                      <span
                        className={cn(
                          'size-1 rounded-full',
                          neighbor.active ? 'bg-emerald-400' : 'bg-rose-400',
                        )}
                      />
                      {neighbor.name}
                      {!neighbor.linkActive && <span className="text-[8px] uppercase text-rose-400">cut</span>}
                      {!neighbor.deviceActive && <span className="text-[8px] uppercase text-rose-400">down</span>}
                    </button>
                  ))}
                {(graph.adjacency.find((entry) => entry.name === device.name)?.neighbors.length ?? 0) === 0 && (
                  <span className="font-mono text-[10px] text-slate-500">isolated — no physical links</span>
                )}
              </div>
            </div>

            <div className="flex items-center gap-2">
              <Button
                size="sm"
                variant={device.active ? 'danger' : 'success'}
                icon={device.active ? Zap : Power}
                loading={isPending}
                onClick={() => (device.active ? failDevice(device.name) : restoreDevice(device.name))}
              >
                {device.active ? 'Fail device' : 'Restore'}
              </Button>
              <Button size="icon-sm" variant="ghost" icon={X} onClick={() => select(null)} aria-label="Close inspector" />
            </div>
          </div>
        </motion.div>
      )}

      {link && (
        <motion.div
          key={`link-${link.id}`}
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 6 }}
          transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
          className="panel-inset mt-3 overflow-hidden"
        >
          <div className="flex flex-wrap items-start gap-4 p-4">
            <div className="grid size-12 shrink-0 place-items-center rounded-xl border border-cyan-400/20 bg-cyan-400/[0.07] text-cyan-300">
              <Cable size={22} strokeWidth={1.7} />
            </div>

            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <h3 className="font-mono text-[13px] font-medium tracking-tight text-slate-100">
                  {link.u} <span className="text-slate-600">↔</span> {link.v}
                </h3>
                <Badge tone={link.active ? 'emerald' : 'rose'}>{link.active ? 'UP' : 'CUT'}</Badge>
                {vulnerabilities?.bridges.some((bridge) => bridge.id === link.id) && (
                  <Badge tone="amber" icon={CircleAlert}>
                    bridge
                  </Badge>
                )}
              </div>
              <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 font-mono text-[10px] text-slate-500">
                <span>undirected edge</span>
                <span>id {link.id}</span>
                <span>
                  {graph.devices.find((entry) => entry.name === link.u)?.active ? 'UP' : 'DOWN'} /{' '}
                  {graph.devices.find((entry) => entry.name === link.v)?.active ? 'UP' : 'DOWN'} endpoints
                </span>
              </div>
              <p className="mt-2 text-[11px] leading-relaxed text-slate-500">
                Removing a link deletes it from <span className="font-mono text-slate-400">adjList[{graph.devices.find((d) => d.name === link.u)?.index}]</span>{' '}
                and <span className="font-mono text-slate-400">adjList[{graph.devices.find((d) => d.name === link.v)?.index}]</span>{' '}
                in both directions.
              </p>
            </div>

            <div className="flex items-center gap-2">
              <Button
                size="sm"
                variant={link.active ? 'danger' : 'success'}
                icon={link.active ? PowerOff : Power}
                loading={isPending}
                onClick={() => (link.active ? failLink(link.u, link.v) : restoreLink(link.u, link.v))}
              >
                {link.active ? 'Cut link' : 'Restore'}
              </Button>
              <Button size="icon-sm" variant="ghost" icon={X} onClick={() => select(null)} aria-label="Close inspector" />
            </div>
          </div>
        </motion.div>
      )}

      {!device && !link && (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="panel-inset mt-3 flex items-center gap-2 p-4 text-xs text-slate-500">
          <Spinner size={12} /> This element is no longer present in the topology.
          <Button size="icon-sm" variant="ghost" icon={X} onClick={() => select(null)} aria-label="Close inspector" />
        </motion.div>
      )}
    </AnimatePresence>
  );
}
