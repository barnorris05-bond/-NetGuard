import { useEffect, useState } from 'react';
import {
  Activity,
  Cable,
  ChevronDown,
  CircleDot,
  Layers,
  Link2,
  Plus,
  Power,
  PowerOff,
  RotateCcw,
  Server,
  TriangleAlert,
  Unplug,
  Zap,
} from 'lucide-react';
import type { GraphSnapshot } from '../lib/types';
import { useNetworkStore } from '../store/useNetworkStore';
import { NetworkCanvas } from '../components/NetworkCanvas';
import { CanvasLegend, DotSwatch, LineSwatch } from '../components/CanvasLegend';
import { InspectorDock } from '../components/InspectorDock';
import { DeviceIcon } from '../components/DeviceIcon';
import { deviceMeta } from '../lib/layout';
import { Badge, Button, Panel, SectionHeader, StatCard, cn } from '../components/ui';

function Toggle({
  on,
  onClick,
  busy,
  label,
}: {
  on: boolean;
  onClick: () => void;
  busy?: boolean;
  label: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={busy}
      aria-pressed={on}
      aria-label={label}
      title={label}
      className={cn(
        'relative h-5 w-9 shrink-0 rounded-full border transition-colors duration-200 disabled:opacity-50',
        on
          ? 'border-emerald-400/30 bg-emerald-400/25'
          : 'border-rose-400/30 bg-rose-400/15',
      )}
    >
      <span
        className={cn(
          'absolute top-1/2 grid size-4 -translate-y-1/2 place-items-center rounded-full transition-all duration-200',
          on ? 'left-[18px] bg-emerald-300 text-emerald-900' : 'left-0.5 bg-rose-300 text-rose-950',
        )}
      >
        {busy ? <RotateCcw size={9} className="animate-spin" /> : on ? <Power size={9} /> : <PowerOff size={9} />}
      </span>
    </button>
  );
}

export function FailureTab({ graph }: { graph: GraphSnapshot }) {
  const selected = useNetworkStore((state) => state.selected);
  const select = useNetworkStore((state) => state.select);
  const pending = useNetworkStore((state) => state.pending);
  const failDevice = useNetworkStore((state) => state.failDevice);
  const restoreDevice = useNetworkStore((state) => state.restoreDevice);
  const failLink = useNetworkStore((state) => state.failLink);
  const restoreLink = useNetworkStore((state) => state.restoreLink);
  const restoreAll = useNetworkStore((state) => state.restoreAll);
  const rerunAnalysis = useNetworkStore((state) => state.rerunAnalysis);
  const addDevice = useNetworkStore((state) => state.addDevice);
  const addLink = useNetworkStore((state) => state.addLink);

  const [newDevice, setNewDevice] = useState('');
  const [linkU, setLinkU] = useState(graph.devices[0]?.name ?? '');
  const [linkV, setLinkV] = useState(graph.devices[1]?.name ?? '');
  const [editorOpen, setEditorOpen] = useState(false);

  useEffect(() => {
    if (!graph.devices.some((device) => device.name === linkU)) setLinkU(graph.devices[0]?.name ?? '');
    if (!graph.devices.some((device) => device.name === linkV)) setLinkV(graph.devices[1]?.name ?? '');
  }, [graph.devices]); // eslint-disable-line react-hooks/exhaustive-deps

  const failedDevices = graph.devices.filter((device) => !device.active);
  const cutLinks = graph.links.filter((link) => !link.active);
  const totalFailures = failedDevices.length + cutLinks.length;

  const handleAddDevice = async () => {
    if (!newDevice.trim()) return;
    const ok = await addDevice(newDevice.trim());
    if (ok) setNewDevice('');
  };

  const handleAddLink = async () => {
    if (!linkU || !linkV || linkU === linkV) return;
    await addLink(linkU, linkV);
  };

  return (
    <div className="space-y-4">
      <Panel glow className="overflow-hidden">
        <div className="p-4 sm:p-5">
          <SectionHeader
            eyebrow="05 · live mutation"
            title="Failure Simulation"
            subtitle="Fail a device to remove it from every traversal, or cut a link to erase it from both adjacency lists. The change is immediate and persisted."
            icon={Zap}
            actions={
              <>
                <Badge tone={totalFailures > 0 ? 'rose' : 'emerald'}>
                  {totalFailures > 0 ? `${totalFailures} active failure${totalFailures === 1 ? '' : 's'}` : 'all systems up'}
                </Badge>
                <Button
                  size="sm"
                  variant={totalFailures > 0 ? 'success' : 'secondary'}
                  icon={RotateCcw}
                  loading={pending.includes('restore-all')}
                  disabled={totalFailures === 0}
                  onClick={() => void restoreAll()}
                >
                  Restore all
                </Button>
              </>
            }
          />

          {totalFailures > 0 && (
            <div className="mt-3 flex flex-wrap items-center justify-between gap-2 rounded-lg border border-amber-400/20 bg-amber-400/[0.05] px-3 py-2">
              <p className="text-[10.5px] leading-relaxed text-amber-200/80">
                Topology changed. Re-run components and Tarjan on the mutated adjacency list.
              </p>
              <Button size="sm" variant="warning" icon={Activity} onClick={() => void rerunAnalysis()}>
                Re-run analysis
              </Button>
            </div>
          )}
        </div>

        <div className="px-3 pb-3 sm:px-4">
          <NetworkCanvas
            graph={graph}
            selected={selected}
            onSelectDevice={(name) => select({ kind: 'device', name })}
            onSelectLink={(u, v) => select({ kind: 'link', u, v })}
          />
        </div>

        <CanvasLegend
          items={[
            { label: 'device up', swatch: <DotSwatch color="#34d399" /> },
            { label: 'device down', swatch: <DotSwatch color="#fb7185" /> },
            { label: 'active link', swatch: <LineSwatch color="#22d3ee" glow /> },
            { label: 'cut link', swatch: <LineSwatch color="#f43f5e" dashed /> },
          ]}
          note="Toggle a switch below or click an element on the graph"
        />
      </Panel>

      <div className="grid gap-3 sm:grid-cols-3">
        <StatCard
          label="Devices down"
          value={`${failedDevices.length} / ${graph.metrics.devices}`}
          hint={failedDevices.length ? failedDevices.map((device) => device.name).join(', ') : 'No device failures'}
          icon={Server}
          tone={failedDevices.length ? 'rose' : 'emerald'}
        />
        <StatCard
          label="Links cut"
          value={`${cutLinks.length} / ${graph.metrics.links}`}
          hint={cutLinks.length ? cutLinks.map((link) => `${link.u}–${link.v}`).join(', ') : 'All physical links intact'}
          icon={Cable}
          tone={cutLinks.length ? 'rose' : 'emerald'}
        />
        <StatCard
          label="Surviving subnetworks"
          value={graph.metrics.components}
          hint={graph.metrics.components === 1 ? 'Network is fully connected' : 'Traffic cannot cross groups'}
          icon={Layers}
          tone={graph.metrics.components > 1 ? 'amber' : 'cyan'}
        />
      </div>

      <InspectorDock graph={graph} selected={selected} />

      <div className="grid gap-3 lg:grid-cols-2">
        <section className="panel overflow-hidden">
          <header className="flex items-center justify-between border-b border-white/[0.06] px-4 py-3">
            <div className="flex items-center gap-2">
              <Server size={14} className="text-cyan-300" />
              <h3 className="font-display text-[13px] font-semibold text-slate-100">Devices</h3>
              <Badge tone="slate">{graph.metrics.activeDevices} up</Badge>
            </div>
            <span className="font-mono text-[8px] uppercase tracking-[0.12em] text-slate-600">vertex state</span>
          </header>
          <div className="thin-scrollbar max-h-[455px] overflow-y-auto p-2.5">
            {graph.devices.map((device) => {
              const meta = deviceMeta(device.name);
              const busy = pending.includes(`device:${device.name}`);
              return (
                <div
                  key={device.name}
                  className={cn(
                    'mb-1 flex items-center gap-2.5 rounded-lg border px-2 py-1.5 transition-colors last:mb-0',
                    device.active
                      ? 'border-transparent hover:border-white/[0.07] hover:bg-white/[0.02]'
                      : 'border-rose-400/10 bg-rose-400/[0.035]',
                  )}
                >
                  <button
                    type="button"
                    onClick={() => select({ kind: 'device', name: device.name })}
                    className="flex min-w-0 flex-1 items-center gap-2.5 text-left"
                  >
                    <span
                      className="grid size-7 shrink-0 place-items-center rounded-md border"
                      style={{
                        color: device.active ? meta.color : '#64748b',
                        borderColor: device.active ? `${meta.color}30` : 'rgba(244,63,94,0.2)',
                        backgroundColor: device.active ? `${meta.color}0f` : 'rgba(244,63,94,0.05)',
                      }}
                    >
                      <DeviceIcon kind={meta.kind} size={13} />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className={cn('block truncate font-mono text-[10.5px]', device.active ? 'text-slate-200' : 'text-rose-200/80')}>
                        {device.name}
                      </span>
                      <span className="block font-mono text-[8px] text-slate-600">
                        [{device.index}] · {device.activeDegree} active links
                      </span>
                    </span>
                    <Badge tone={device.active ? 'emerald' : 'rose'}>{device.active ? 'UP' : 'DOWN'}</Badge>
                  </button>
                  <Toggle
                    on={device.active}
                    busy={busy}
                    label={device.active ? `Fail ${device.name}` : `Restore ${device.name}`}
                    onClick={() => void (device.active ? failDevice(device.name) : restoreDevice(device.name))}
                  />
                </div>
              );
            })}
          </div>
        </section>

        <section className="panel overflow-hidden">
          <header className="flex items-center justify-between border-b border-white/[0.06] px-4 py-3">
            <div className="flex items-center gap-2">
              <Link2 size={14} className="text-amber-300" />
              <h3 className="font-display text-[13px] font-semibold text-slate-100">Physical Links</h3>
              <Badge tone="slate">{graph.metrics.activeLinks} up</Badge>
            </div>
            <span className="font-mono text-[8px] uppercase tracking-[0.12em] text-slate-600">undirected edge state</span>
          </header>
          <div className="thin-scrollbar max-h-[455px] overflow-y-auto p-2.5">
            {graph.links.map((link) => {
              const busy = pending.includes(`link:${[link.u, link.v].sort().join('~')}`);
              const isSelected =
                selected?.kind === 'link' && [link.u, link.v].sort().join('~') === [selected.u, selected.v].sort().join('~');
              return (
                <div
                  key={link.id}
                  className={cn(
                    'mb-1 flex items-center gap-2.5 rounded-lg border px-2 py-1.5 transition-colors last:mb-0',
                    !link.active
                      ? 'border-rose-400/10 bg-rose-400/[0.035]'
                      : isSelected
                        ? 'border-cyan-400/20 bg-cyan-400/[0.03]'
                        : 'border-transparent hover:border-white/[0.07] hover:bg-white/[0.02]',
                  )}
                >
                  <button
                    type="button"
                    onClick={() => select({ kind: 'link', u: link.u, v: link.v })}
                    className="flex min-w-0 flex-1 items-center gap-2.5 text-left"
                  >
                    <span
                      className={cn(
                        'grid size-7 shrink-0 place-items-center rounded-md border',
                        link.active
                          ? 'border-amber-400/20 bg-amber-400/[0.05] text-amber-300/80'
                          : 'border-rose-400/20 bg-rose-400/[0.05] text-rose-300',
                      )}
                    >
                      {link.active ? <Cable size={13} /> : <Unplug size={13} />}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className={cn('block truncate font-mono text-[10.5px]', link.active ? 'text-slate-200' : 'text-rose-200/80')}>
                        {link.u} <span className="text-slate-600">↔</span> {link.v}
                      </span>
                      <span className="block font-mono text-[8px] text-slate-600">
                        {link.id}
                      </span>
                    </span>
                    <Badge tone={link.active ? 'emerald' : 'rose'}>{link.active ? 'UP' : 'CUT'}</Badge>
                  </button>
                  <Toggle
                    on={link.active}
                    busy={busy}
                    label={link.active ? `Cut ${link.u} to ${link.v}` : `Restore ${link.u} to ${link.v}`}
                    onClick={() => void (link.active ? failLink(link.u, link.v) : restoreLink(link.u, link.v))}
                  />
                </div>
              );
            })}
          </div>
        </section>
      </div>

      <section className="panel overflow-hidden">
        <button
          type="button"
          onClick={() => setEditorOpen((open) => !open)}
          className="flex w-full items-center justify-between gap-2 px-4 py-3.5 text-left"
          aria-expanded={editorOpen}
        >
          <div className="flex items-center gap-2">
            <Plus size={14} className="text-violet-300" />
            <span className="font-display text-[12.5px] font-semibold text-slate-200">Extend the topology</span>
            <Badge tone="violet">optional</Badge>
          </div>
          <ChevronDown size={15} className={cn('text-slate-500 transition-transform', editorOpen && 'rotate-180')} />
        </button>
        {editorOpen && (
          <div className="grid gap-4 border-t border-white/[0.06] p-4 md:grid-cols-2">
            <div className="rounded-xl border border-white/[0.06] bg-white/[0.015] p-3.5">
              <p className="mb-1 flex items-center gap-1.5 text-[11px] font-medium text-slate-200">
                <CircleDot size={12} className="text-cyan-300" /> Add a device vertex
              </p>
              <p className="mb-3 text-[10px] text-slate-500">A new vertex gets its own empty adjacency list.</p>
              <div className="flex gap-2">
                <input
                  value={newDevice}
                  onChange={(event) => setNewDevice(event.target.value)}
                  onKeyDown={(event) => event.key === 'Enter' && void handleAddDevice()}
                  placeholder="e.g. Backup_Router"
                  maxLength={40}
                  className="h-9 min-w-0 flex-1 rounded-lg border border-white/10 bg-[#07111e] px-3 font-mono text-[11px] text-slate-100 outline-none transition-colors placeholder:text-slate-600 focus:border-cyan-400/45"
                />
                <Button size="sm" variant="primary" icon={Plus} loading={pending.includes('add-device')} onClick={() => void handleAddDevice()}>
                  Add
                </Button>
              </div>
            </div>

            <div className="rounded-xl border border-white/[0.06] bg-white/[0.015] p-3.5">
              <p className="mb-1 flex items-center gap-1.5 text-[11px] font-medium text-slate-200">
                <Cable size={12} className="text-amber-300" /> Add an undirected link
              </p>
              <p className="mb-3 text-[10px] text-slate-500">The edge is appended to both endpoint adjacency lists.</p>
              <div className="flex flex-wrap gap-2">
                <select
                  value={linkU}
                  onChange={(event) => setLinkU(event.target.value)}
                  className="h-9 min-w-0 flex-1 rounded-lg border border-white/10 bg-[#07111e] px-2 font-mono text-[10.5px] text-slate-200 outline-none focus:border-cyan-400/45"
                >
                  {graph.devices.map((device) => (
                    <option key={device.name} value={device.name}>
                      {device.name}
                    </option>
                  ))}
                </select>
                <span className="grid place-items-center text-slate-600">↔</span>
                <select
                  value={linkV}
                  onChange={(event) => setLinkV(event.target.value)}
                  className="h-9 min-w-0 flex-1 rounded-lg border border-white/10 bg-[#07111e] px-2 font-mono text-[10.5px] text-slate-200 outline-none focus:border-cyan-400/45"
                >
                  {graph.devices.map((device) => (
                    <option key={device.name} value={device.name}>
                      {device.name}
                    </option>
                  ))}
                </select>
                <Button
                  size="sm"
                  variant="secondary"
                  icon={Link2}
                  loading={pending.includes('add-link')}
                  disabled={linkU === linkV}
                  onClick={() => void handleAddLink()}
                >
                  Link
                </Button>
              </div>
            </div>
          </div>
        )}
      </section>

      <div className="panel-inset flex flex-wrap items-start gap-3 p-4">
        <span className="grid size-8 shrink-0 place-items-center rounded-lg border border-rose-400/15 bg-rose-400/[0.06] text-rose-300">
          <TriangleAlert size={15} />
        </span>
        <p className="min-w-0 flex-1 text-[10.5px] leading-relaxed text-slate-500">
          Device failures mirror the C++ <span className="font-mono text-slate-300">activeVertices[idx] = false</span> flag:
          the adjacency list is retained but every traversal ignores the vertex. Link failures mirror{' '}
          <span className="font-mono text-slate-300">failLink()</span>, which physically erases the edge from both lists and
          records it for restoration.
        </p>
      </div>
    </div>
  );
}
