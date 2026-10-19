import { useEffect, useState } from 'react';
import {
  Activity,
  Boxes,
  Cable,
  CircleAlert,
  Network,
  RotateCcw,
  Server,
  Sparkles,
} from 'lucide-react';
import { useNetworkStore } from '../store/useNetworkStore';
import { Badge, Button, cn, LiveDot } from './ui';

function healthOf(metrics: { devices: number; activeDevices: number; links: number; activeLinks: number; components: number }) {
  const failed = metrics.devices - metrics.activeDevices;
  const cut = metrics.links - metrics.activeLinks;
  if (metrics.activeDevices === 0) return { label: 'OFFLINE', tone: 'rose' as const, text: 'text-rose-300 border-rose-400/25 bg-rose-400/[0.07]' };
  if (metrics.activeDevices < metrics.devices * 0.6 || metrics.components >= 3) {
    return {
      label: 'CRITICAL',
      tone: 'rose' as const,
      text: 'text-rose-300 border-rose-400/25 bg-rose-400/[0.07]',
    };
  }
  if (failed > 0 || cut > 0 || metrics.components > 1) {
    return { label: 'DEGRADED', tone: 'amber' as const, text: 'text-amber-300 border-amber-400/25 bg-amber-400/[0.07]' };
  }
  return { label: 'HEALTHY', tone: 'emerald' as const, text: 'text-emerald-300 border-emerald-400/25 bg-emerald-400/[0.07]' };
}

function MiniMetric({
  icon: Icon,
  label,
  value,
  tone = 'text-slate-300',
}: {
  icon: typeof Server;
  label: string;
  value: string;
  tone?: string;
}) {
  return (
    <div className="flex items-center gap-2 border-l border-white/[0.07] px-3 first:border-l-0 first:pl-0">
      <Icon size={13} className={tone} strokeWidth={1.9} />
      <div className="leading-none">
        <p className="font-mono text-[7.5px] uppercase tracking-[0.14em] text-slate-600">{label}</p>
        <p className={cn('mt-1 font-mono text-[11px] font-medium tabular-nums', tone)}>{value}</p>
      </div>
    </div>
  );
}

export function Header() {
  const graph = useNetworkStore((state) => state.graph);
  const setTab = useNetworkStore((state) => state.setTab);
  const runDemo = useNetworkStore((state) => state.runDemo);
  const demoLoading = useNetworkStore((state) => state.demoLoading);
  const resetTopology = useNetworkStore((state) => state.resetTopology);
  const pending = useNetworkStore((state) => state.pending);
  const [confirmReset, setConfirmReset] = useState(false);

  useEffect(() => {
    if (!confirmReset) return;
    const timer = setTimeout(() => setConfirmReset(false), 3500);
    return () => clearTimeout(timer);
  }, [confirmReset]);

  const metrics = graph?.metrics;
  const health = metrics ? healthOf(metrics) : null;

  const handleDemo = () => {
    setTab('demo');
    void runDemo();
  };

  const handleReset = () => {
    if (!confirmReset) {
      setConfirmReset(true);
      return;
    }
    setConfirmReset(false);
    void resetTopology();
  };

  return (
    <header className="mx-auto w-full max-w-[1680px] px-4 pb-1 pt-4 sm:px-5 lg:px-6">
      <div className="flex flex-wrap items-center gap-x-5 gap-y-3">
        <div className="flex items-center gap-3">
          <div className="relative grid size-11 shrink-0 place-items-center rounded-[14px] border border-cyan-400/25 bg-gradient-to-br from-cyan-400/[0.18] via-cyan-400/[0.05] to-violet-500/[0.12] text-cyan-300 shadow-[0_0_30px_-8px_rgba(34,211,238,0.55)]">
            <Network size={22} strokeWidth={1.8} />
            <span className="absolute -right-0.5 -top-0.5 size-2 rounded-full border-2 border-[#050a14] bg-emerald-400" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="font-display text-[19px] font-bold leading-none tracking-[0.1em] text-slate-50">
                NET<span className="text-cyan-300">GUARD</span>
              </h1>
              <span className="rounded border border-white/10 bg-white/[0.03] px-1.5 py-0.5 font-mono text-[8px] text-slate-500">
                v1.0
              </span>
            </div>
            <p className="mt-1 font-mono text-[8px] uppercase tracking-[0.2em] text-slate-500">
              Graph-based reliability simulator
            </p>
          </div>
        </div>

        {metrics && (
          <div className="hidden items-center rounded-xl border border-white/[0.07] bg-white/[0.02] px-3 py-2 lg:flex">
            <MiniMetric
              icon={Server}
              label="Devices"
              value={`${metrics.activeDevices}/${metrics.devices}`}
              tone={metrics.activeDevices === metrics.devices ? 'text-slate-300' : 'text-rose-300'}
            />
            <MiniMetric
              icon={Cable}
              label="Links"
              value={`${metrics.activeLinks}/${metrics.links}`}
              tone={metrics.activeLinks === metrics.links ? 'text-slate-300' : 'text-rose-300'}
            />
            <MiniMetric
              icon={Boxes}
              label="Subnets"
              value={String(metrics.components)}
              tone={metrics.components === 1 ? 'text-slate-300' : 'text-amber-300'}
            />
            <MiniMetric
              icon={CircleAlert}
              label="Critical"
              value={`${metrics.articulationPoints} / ${metrics.bridges}`}
              tone="text-amber-300/90"
            />
          </div>
        )}

        <div className="ml-auto flex flex-wrap items-center gap-2">
          {health && (
            <div className={cn('flex items-center gap-2 rounded-full border px-3 py-1.5', health.text)}>
              <LiveDot tone={health.tone} />
              <span className="font-mono text-[9px] font-medium uppercase tracking-[0.14em]">{health.label}</span>
            </div>
          )}
          <Button variant="primary" size="sm" icon={Sparkles} loading={demoLoading} onClick={handleDemo}>
            Guided demo
          </Button>
          <Button
            variant={confirmReset ? 'danger' : 'ghost'}
            size="sm"
            icon={confirmReset ? Activity : RotateCcw}
            loading={pending.includes('reset')}
            onClick={handleReset}
            onBlur={() => setConfirmReset(false)}
            title="Restore the healthy sample topology"
          >
            {confirmReset ? 'Confirm reset' : 'Reset'}
          </Button>
        </div>
      </div>

      {metrics && (
        <div className="mt-3 flex flex-wrap items-center gap-3 lg:hidden">
          <div className="flex flex-1 items-center justify-between rounded-xl border border-white/[0.07] bg-white/[0.02] px-3 py-2">
            <MiniMetric icon={Server} label="Devices" value={`${metrics.activeDevices}/${metrics.devices}`} />
            <MiniMetric icon={Cable} label="Links" value={`${metrics.activeLinks}/${metrics.links}`} />
            <MiniMetric icon={Boxes} label="Subnets" value={String(metrics.components)} tone="text-amber-300/90" />
            <MiniMetric icon={CircleAlert} label="Critical" value={`${metrics.articulationPoints}`} tone="text-amber-300/90" />
          </div>
        </div>
      )}

      {!graph && (
        <div className="mt-3 flex items-center gap-2">
          <Badge tone="amber">connecting to API</Badge>
          <div className="skeleton h-3 w-40" />
        </div>
      )}
    </header>
  );
}
