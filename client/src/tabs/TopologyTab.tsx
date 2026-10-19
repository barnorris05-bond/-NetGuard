import { GitBranch, ListTree, MousePointerClick, Network, ShieldAlert } from 'lucide-react';
import { NetworkCanvas } from '../components/NetworkCanvas';
import { CanvasLegend, DotSwatch, LineSwatch } from '../components/CanvasLegend';
import { InspectorDock } from '../components/InspectorDock';
import { Badge, Panel, SectionHeader } from '../components/ui';
import { useNetworkStore } from '../store/useNetworkStore';
import type { GraphSnapshot } from '../lib/types';

const INFO = [
  {
    icon: ListTree,
    title: 'The adjacency list is the source of truth',
    body: 'Every row in the sidebar is one vertex and its neighbouring device indexes. The drawing you see is a projection of that array.',
    tone: 'text-cyan-300 border-cyan-400/15 bg-cyan-400/[0.06]',
  },
  {
    icon: ShieldAlert,
    title: 'Failures prune traversals, not the drawing',
    body: 'A down device stays in nameToIndex, but BFS, Tarjan and component scans all skip inactive vertices — exactly like the C++ logic.',
    tone: 'text-rose-300 border-rose-400/15 bg-rose-400/[0.06]',
  },
  {
    icon: GitBranch,
    title: 'One redundant link changes everything',
    body: 'Switch_A ↔ Switch_B closes the only cycle in the switch layer. Without it, the two router uplinks become critical bridges.',
    tone: 'text-amber-300 border-amber-400/15 bg-amber-400/[0.06]',
  },
];

export function TopologyTab({ graph }: { graph: GraphSnapshot }) {
  const selected = useNetworkStore((state) => state.selected);
  const select = useNetworkStore((state) => state.select);

  return (
    <div className="space-y-4">
      <Panel glow className="overflow-hidden">
        <div className="p-4 sm:p-5">
          <SectionHeader
            eyebrow="01 · live structure"
            title="Interactive Network Topology"
            subtitle="An undirected graph rendered from the backend adjacency list. Click a device or a link to inspect its data-structure representation."
            icon={Network}
            actions={
              <>
                <Badge tone="cyan">adjacency list</Badge>
                <span className="hidden items-center gap-1.5 rounded-lg border border-white/10 bg-white/[0.03] px-2.5 py-1 text-[10px] text-slate-500 sm:inline-flex">
                  <MousePointerClick size={11} /> click to inspect
                </span>
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
          />
        </div>

        <CanvasLegend
          items={[
            { label: 'device up', swatch: <DotSwatch color="#34d399" /> },
            { label: 'device down', swatch: <DotSwatch color="#fb7185" /> },
            { label: 'active link', swatch: <LineSwatch color="#22d3ee" glow /> },
            { label: 'cut link', swatch: <LineSwatch color="#f43f5e" dashed /> },
          ]}
          note="Topology state persists to server/data/netguard.json"
        />
      </Panel>

      <InspectorDock graph={graph} selected={selected} />

      <div className="grid gap-3 md:grid-cols-3">
        {INFO.map((item) => (
          <div key={item.title} className="panel p-4">
            <div className={`mb-2.5 grid size-8 place-items-center rounded-lg border ${item.tone}`}>
              <item.icon size={15} strokeWidth={1.8} />
            </div>
            <h3 className="font-display text-[12px] font-semibold leading-snug text-slate-200">{item.title}</h3>
            <p className="mt-1.5 text-[10.5px] leading-relaxed text-slate-500">{item.body}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
