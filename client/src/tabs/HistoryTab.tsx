import { useEffect, useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import {
  Activity,
  Cable,
  CircleAlert,
  FileJson,
  FileSpreadsheet,
  FileText,
  GitCompareArrows,
  History as HistoryIcon,
  Plus,
  RefreshCw,
  RotateCcw,
  Route,
  Scissors,
  Trash2,
  Zap,
  type LucideIcon,
} from 'lucide-react';
import type { GraphSnapshot, HistoryEvent, HistoryType } from '../lib/types';
import { downloadFile, getSessionId } from '../lib/api';
import { useNetworkStore } from '../store/useNetworkStore';
import { Badge, Button, EmptyState, Panel, SectionHeader, Skeleton, StatCard, cn } from '../components/ui';

type Filter = 'all' | 'failures' | 'paths' | 'system';

const FILTERS: Array<{ id: Filter; label: string }> = [
  { id: 'all', label: 'All events' },
  { id: 'failures', label: 'Failures' },
  { id: 'paths', label: 'Path queries' },
  { id: 'system', label: 'System' },
];

interface EventMeta {
  label: string;
  icon: LucideIcon;
  tone: string;
  iconTone: string;
}

const EVENT_META: Record<HistoryType, EventMeta> = {
  'fail-device': {
    label: 'Device failed',
    icon: Zap,
    tone: 'border-rose-400/15 bg-rose-400/[0.035]',
    iconTone: 'border-rose-400/25 bg-rose-400/[0.08] text-rose-300',
  },
  'fail-link': {
    label: 'Link cut',
    icon: Scissors,
    tone: 'border-amber-400/15 bg-amber-400/[0.03]',
    iconTone: 'border-amber-400/25 bg-amber-400/[0.08] text-amber-300',
  },
  'restore-device': {
    label: 'Device restored',
    icon: RotateCcw,
    tone: 'border-emerald-400/15 bg-emerald-400/[0.025]',
    iconTone: 'border-emerald-400/25 bg-emerald-400/[0.08] text-emerald-300',
  },
  'restore-link': {
    label: 'Link restored',
    icon: RotateCcw,
    tone: 'border-emerald-400/15 bg-emerald-400/[0.025]',
    iconTone: 'border-emerald-400/25 bg-emerald-400/[0.08] text-emerald-300',
  },
  'restore-all': {
    label: 'All restored',
    icon: RotateCcw,
    tone: 'border-emerald-400/15 bg-emerald-400/[0.025]',
    iconTone: 'border-emerald-400/25 bg-emerald-400/[0.08] text-emerald-300',
  },
  'path-query': {
    label: 'BFS query',
    icon: Route,
    tone: 'border-cyan-400/15 bg-cyan-400/[0.025]',
    iconTone: 'border-cyan-400/25 bg-cyan-400/[0.08] text-cyan-300',
  },
  demo: {
    label: 'Guided demo',
    icon: GitCompareArrows,
    tone: 'border-violet-400/15 bg-violet-400/[0.025]',
    iconTone: 'border-violet-400/25 bg-violet-400/[0.08] text-violet-300',
  },
  reset: {
    label: 'Topology reset',
    icon: RotateCcw,
    tone: 'border-blue-400/15 bg-blue-400/[0.025]',
    iconTone: 'border-blue-400/25 bg-blue-400/[0.08] text-blue-300',
  },
  'add-device': {
    label: 'Device added',
    icon: Plus,
    tone: 'border-blue-400/15 bg-blue-400/[0.025]',
    iconTone: 'border-blue-400/25 bg-blue-400/[0.08] text-blue-300',
  },
  'add-link': {
    label: 'Link added',
    icon: Cable,
    tone: 'border-blue-400/15 bg-blue-400/[0.025]',
    iconTone: 'border-blue-400/25 bg-blue-400/[0.08] text-blue-300',
  },
};

function formatDate(iso: string): string {
  return new Date(iso).toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
}

function relativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  if (diff < 45_000) return 'just now';
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m ago`;
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h ago`;
  return `${Math.floor(diff / 86_400_000)}d ago`;
}

function eventMatches(event: HistoryEvent, filter: Filter): boolean {
  if (filter === 'all') return true;
  if (filter === 'failures') return event.type === 'fail-device' || event.type === 'fail-link';
  if (filter === 'paths') return event.type === 'path-query';
  return ['demo', 'reset', 'add-device', 'add-link', 'restore-all'].includes(event.type);
}

function metaChips(event: HistoryEvent): Array<{ key: string; value: string }> {
  const allowed = ['device', 'u', 'v', 'source', 'destination', 'hops', 'found', 'target', 'pathBroken', 'componentsAfter'];
  return Object.entries(event.meta ?? {})
    .filter(([key, value]) => allowed.includes(key) && (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean'))
    .map(([key, value]) => ({ key, value: typeof value === 'boolean' ? (value ? 'true' : 'false') : String(value) }));
}

const ascii = (value: string): string =>
  value
    .replace(/→/g, '->')
    .replace(/↔/g, '<->')
    .replace(/[–—]/g, '-')
    .replace(/·/g, '|')
    .replace(/[“”]/g, '"')
    .replace(/[‘’]/g, "'")
    .replace(/[^\x20-\x7E\n]/g, '');

export function HistoryTab({ graph }: { graph: GraphSnapshot }) {
  const events = useNetworkStore((state) => state.history);
  const summary = useNetworkStore((state) => state.historySummary);
  const loading = useNetworkStore((state) => state.historyLoading);
  const scope = useNetworkStore((state) => state.historyScope);
  const load = useNetworkStore((state) => state.loadHistory);
  const clear = useNetworkStore((state) => state.clearHistory);
  const pushToast = useNetworkStore((state) => state.pushToast);
  const [filter, setFilter] = useState<Filter>('all');
  const [confirmClear, setConfirmClear] = useState(false);

  useEffect(() => {
    void load();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!confirmClear) return;
    const timer = setTimeout(() => setConfirmClear(false), 3500);
    return () => clearTimeout(timer);
  }, [confirmClear]);

  const filtered = useMemo(() => events.filter((event) => eventMatches(event, filter)), [events, filter]);
  const counts = useMemo(
    () => ({
      all: events.length,
      failures: events.filter((event) => eventMatches(event, 'failures')).length,
      paths: events.filter((event) => eventMatches(event, 'paths')).length,
      system: events.filter((event) => eventMatches(event, 'system')).length,
    }),
    [events],
  );

  const fileStamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-');

  const exportJson = () => {
    const payload = {
      generatedAt: new Date().toISOString(),
      application: 'NetGuard – Graph-Based Network Reliability Simulator',
      scope,
      filter,
      sessionId: getSessionId(),
      graph: { metrics: graph.metrics, devices: graph.devices, links: graph.links },
      summary,
      events: filtered,
    };
    downloadFile(JSON.stringify(payload, null, 2), `netguard-report-${fileStamp}.json`, 'application/json');
    pushToast(`Exported ${filtered.length} event(s) as JSON.`, 'success');
  };

  const exportCsv = () => {
    const escape = (value: unknown) => `"${String(value ?? '').replace(/"/g, '""')}"`;
    const header = ['timestamp', 'type', 'message', 'session_id', 'metadata'];
    const rows = filtered.map((event) =>
      [event.timestamp, event.type, event.message, event.sessionId, event.meta ? JSON.stringify(event.meta) : '']
        .map(escape)
        .join(','),
    );
    downloadFile(`\uFEFF${[header.join(','), ...rows].join('\r\n')}`, `netguard-report-${fileStamp}.csv`, 'text/csv;charset=utf-8');
    pushToast(`Exported ${filtered.length} event(s) as CSV.`, 'success');
  };

  const exportPdf = async () => {
    // Loaded on demand so the fairly large PDF library stays out of the initial bundle.
    const { jsPDF } = await import('jspdf');
    const pdf = new jsPDF({ unit: 'pt', format: 'a4' });
    const margin = 44;
    const maxWidth = 595 - margin * 2;
    let y = 52;

    const line = (text: string, size = 9, style: 'normal' | 'bold' = 'normal', color = 40) => {
      pdf.setFont('helvetica', style);
      pdf.setFontSize(size);
      pdf.setTextColor(color, color, color);
      const lines = pdf.splitTextToSize(ascii(text), maxWidth) as string[];
      for (const part of lines) {
        if (y > 800) {
          pdf.addPage();
          y = 52;
        }
        pdf.text(part, margin, y);
        y += size + 4;
      }
    };

    pdf.setFillColor(5, 10, 20);
    pdf.rect(0, 0, 595, 120, 'F');
    pdf.setTextColor(103, 232, 249);
    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(22);
    pdf.text('NETGUARD', margin, 52);
    pdf.setFont('helvetica', 'normal');
    pdf.setFontSize(10);
    pdf.setTextColor(203, 213, 225);
    pdf.text('Graph-Based Network Reliability Report', margin, 70);
    pdf.setFontSize(8);
    pdf.setTextColor(148, 163, 184);
    pdf.text(ascii(`Generated ${formatDate(new Date().toISOString())}  |  Scope: ${scope}  |  Filter: ${filter}`), margin, 88);
    y = 146;

    line('NETWORK SNAPSHOT', 11, 'bold', 15);
    line(
      `Devices ${graph.metrics.activeDevices}/${graph.metrics.devices} up  |  Links ${graph.metrics.activeLinks}/${graph.metrics.links}  |  Subnetworks ${graph.metrics.components}`,
      9,
    );
    line(
      `Critical devices ${graph.metrics.articulationPoints}  |  Critical links ${graph.metrics.bridges}  |  Complexity O(V + E)`,
      9,
    );
    y += 8;

    line('SESSION SUMMARY', 11, 'bold', 15);
    line(
      `Total events ${summary.total}  |  Failures ${summary.failures}  |  Restores ${summary.restores}  |  Path queries ${summary.pathQueries}`,
      9,
    );
    line(`Failed devices: ${summary.failedDevices.length ? summary.failedDevices.join(', ') : 'none'}`, 9);
    y += 8;

    line(`EVENT LOG (${filtered.length})`, 11, 'bold', 15);
    if (filtered.length === 0) {
      line('No events recorded for this filter.', 9);
    }
    filtered.slice(0, 120).forEach((event) => {
      line(`${formatDate(event.timestamp)}  ${EVENT_META[event.type].label.toUpperCase()}`, 8, 'bold', 60);
      line(event.message, 8.5);
      y += 3;
    });
    if (filtered.length > 120) {
      y += 4;
      line(`... ${filtered.length - 120} more events omitted from the PDF export.`, 8);
    }
    line('Generated by NetGuard. Algorithms: BFS, connected components, Tarjan bridges / articulation points.', 7.5, 'normal', 120);
    pdf.save(`netguard-report-${fileStamp}.pdf`);
    pushToast('PDF summary exported.', 'success');
  };

  const handleClear = () => {
    if (!confirmClear) {
      setConfirmClear(true);
      return;
    }
    setConfirmClear(false);
    void clear();
  };

  return (
    <div className="space-y-4">
      <Panel glow className="overflow-hidden">
        <div className="p-4 sm:p-5">
          <SectionHeader
            eyebrow="07 · persistence & reports"
            title="History & Reports"
            subtitle="Every failure, restore and BFS query is logged by the API and persisted to JSON. Export the current view as JSON, CSV or a PDF summary."
            icon={HistoryIcon}
            actions={
              <>
                <Button size="sm" variant="ghost" icon={RefreshCw} loading={loading} onClick={() => void load()}>
                  Refresh
                </Button>
                <Button
                  size="sm"
                  variant={confirmClear ? 'danger' : 'ghost'}
                  icon={Trash2}
                  onClick={handleClear}
                  onBlur={() => setConfirmClear(false)}
                  disabled={events.length === 0}
                >
                  {confirmClear ? 'Confirm clear' : 'Clear'}
                </Button>
              </>
            }
          />

          <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-1 rounded-lg border border-white/[0.07] bg-white/[0.02] p-0.5">
              {(['all', 'session'] as const).map((value) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => void load(value)}
                  className={cn(
                    'rounded-md px-2.5 py-1.5 font-mono text-[9px] uppercase tracking-[0.08em] transition-colors',
                    scope === value ? 'bg-cyan-400/15 text-cyan-200' : 'text-slate-500 hover:text-slate-300',
                  )}
                >
                  {value === 'all' ? 'All activity' : 'This session'}
                </button>
              ))}
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Button size="sm" variant="secondary" icon={FileJson} onClick={exportJson} disabled={filtered.length === 0}>
                JSON
              </Button>
              <Button size="sm" variant="secondary" icon={FileSpreadsheet} onClick={exportCsv} disabled={filtered.length === 0}>
                CSV
              </Button>
              <Button size="sm" variant="secondary" icon={FileText} onClick={() => void exportPdf()}>
                PDF
              </Button>
            </div>
          </div>
        </div>
      </Panel>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Total events" value={summary.total} hint={summary.lastEventAt ? `last activity ${relativeTime(summary.lastEventAt)}` : 'no activity yet'} icon={Activity} tone="cyan" />
        <StatCard label="Failures simulated" value={summary.failures} hint="devices failed + links cut" icon={Zap} tone={summary.failures ? 'rose' : 'emerald'} />
        <StatCard label="Restores" value={summary.restores} hint="failures brought back online" icon={RotateCcw} tone="emerald" />
        <StatCard label="BFS path queries" value={summary.pathQueries} hint="logged reachability checks" icon={Route} tone="violet" />
      </div>

      <Panel className="overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/[0.06] px-4 py-3">
          <div className="no-scrollbar flex items-center gap-1 overflow-x-auto">
            {FILTERS.map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => setFilter(item.id)}
                className={cn(
                  'flex items-center gap-1.5 whitespace-nowrap rounded-lg px-2.5 py-1.5 text-[10.5px] transition-colors',
                  filter === item.id ? 'bg-white/[0.07] text-slate-100' : 'text-slate-500 hover:bg-white/[0.03] hover:text-slate-300',
                )}
              >
                {item.label}
                <span className="rounded bg-white/[0.05] px-1 py-0.5 font-mono text-[8px] text-slate-500">{counts[item.id]}</span>
              </button>
            ))}
          </div>
          <div className="flex items-center gap-2 font-mono text-[8.5px] uppercase tracking-[0.1em] text-slate-600">
            <span className="size-1.5 rounded-full bg-emerald-400/80" />
            persisted to server/data/netguard.json
          </div>
        </div>

        {loading && events.length === 0 ? (
          <div className="space-y-2 p-4">
            {[0, 1, 2, 3].map((key) => (
              <div key={key} className="flex items-center gap-3">
                <Skeleton className="size-8 rounded-lg" />
                <div className="flex-1 space-y-1.5">
                  <Skeleton className="h-3 w-2/3" />
                  <Skeleton className="h-2 w-28" />
                </div>
              </div>
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <div className="p-4">
            <EmptyState
              icon={HistoryIcon}
              title={events.length === 0 ? 'No simulation history yet' : 'No events in this filter'}
              description={
                events.length === 0
                  ? 'Fail a device, cut a link or run a BFS query — every operation is persisted with a timestamp and session id.'
                  : 'Choose another filter or run a new simulation to populate this category.'
              }
            />
          </div>
        ) : (
          <div className="relative p-3 sm:p-4">
            <div className="absolute bottom-6 left-[30px] top-6 w-px bg-gradient-to-b from-cyan-400/20 via-white/[0.06] to-transparent sm:left-[34px]" />
            <div className="space-y-1">
              {filtered.map((event, index) => {
                const meta = EVENT_META[event.type];
                const chips = metaChips(event);
                return (
                  <motion.div
                    key={event.id}
                    initial={{ opacity: 0, x: -6 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ duration: 0.22, delay: Math.min(index * 0.015, 0.25) }}
                    className="relative flex gap-3 rounded-lg px-1 py-2 transition-colors hover:bg-white/[0.018]"
                  >
                    <div className={cn('relative z-[1] grid size-9 shrink-0 place-items-center rounded-lg border', meta.iconTone)}>
                      <meta.icon size={14} strokeWidth={1.9} />
                    </div>
                    <div className="min-w-0 flex-1 border-b border-white/[0.035] pb-2 last:border-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-mono text-[8px] uppercase tracking-[0.12em] text-slate-600">{meta.label}</span>
                        <span className="font-mono text-[8px] text-slate-700">·</span>
                        <span className="font-mono text-[8.5px] text-slate-600">{relativeTime(event.timestamp)}</span>
                        <span className="ml-auto font-mono text-[8px] tabular-nums text-slate-700">{formatDate(event.timestamp)}</span>
                      </div>
                      <p className="mt-1 text-[11px] leading-relaxed text-slate-300">{event.message}</p>
                      {chips.length > 0 && (
                        <div className="mt-1.5 flex flex-wrap gap-1">
                          {chips.map((chip) => (
                            <span
                              key={`${event.id}-${chip.key}`}
                              className="inline-flex items-center gap-1 rounded border border-white/[0.06] bg-white/[0.02] px-1.5 py-0.5 font-mono text-[8.5px] text-slate-500"
                            >
                              <span className="text-slate-600">{chip.key}</span>
                              <span className="text-slate-400">{chip.value}</span>
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                  </motion.div>
                );
              })}
            </div>
          </div>
        )}

        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-white/[0.05] px-4 py-2.5 font-mono text-[8.5px] uppercase tracking-[0.08em] text-slate-600">
          <span className="inline-flex items-center gap-1.5">
            <CircleAlert size={10} /> session {getSessionId().slice(0, 8)} · {scope === 'all' ? 'all devices' : 'this browser'}
          </span>
          <span>
            showing {filtered.length} / {events.length} events
          </span>
        </div>
      </Panel>

      <div className="panel-inset flex flex-wrap items-start gap-3 p-4">
        <span className="grid size-8 shrink-0 place-items-center rounded-lg border border-violet-400/15 bg-violet-400/[0.06] text-violet-300">
          <FileText size={15} />
        </span>
        <p className="min-w-0 flex-1 text-[10.5px] leading-relaxed text-slate-500">
          Reports include the live network snapshot, the active scope filter and event metadata such as BFS hops and
          found/not-found results. History is capped at 500 events per store so the JSON file stays lightweight.
        </p>
        <Badge tone="violet">offline-ready</Badge>
      </div>
    </div>
  );
}
