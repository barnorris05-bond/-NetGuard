import { useEffect, useState } from 'react';
import { Activity, Boxes, Cable, CircleAlert, RotateCcw, Server } from 'lucide-react';
import { useNetworkStore } from '../store/useNetworkStore';
import { Button, cn, LiveDot } from './ui';

/**
 * Always-accessible control strip. Keeps the three numbers a viva examiner asks
 * about (active devices, active links, components) on screen, and offers the
 * post-failure "re-run analysis" and "reset" actions from any tab.
 */
export function StatusBar() {
  const graph = useNetworkStore((state) => state.graph);
  const pending = useNetworkStore((state) => state.pending);
  const rerunAnalysis = useNetworkStore((state) => state.rerunAnalysis);
  const resetTopology = useNetworkStore((state) => state.resetTopology);
  const [confirmReset, setConfirmReset] = useState(false);

  useEffect(() => {
    if (!confirmReset) return;
    const timer = setTimeout(() => setConfirmReset(false), 3200);
    return () => clearTimeout(timer);
  }, [confirmReset]);

  if (!graph) return null;

  const { metrics } = graph;
  const degraded = metrics.components > 1 || metrics.activeDevices < metrics.devices || metrics.activeLinks < metrics.links;

  const items = [
    {
      icon: Server,
      label: 'devices',
      value: `${metrics.activeDevices}/${metrics.devices}`,
      tone: metrics.activeDevices === metrics.devices ? 'text-slate-300' : 'text-rose-300',
    },
    {
      icon: Cable,
      label: 'links',
      value: `${metrics.activeLinks}/${metrics.links}`,
      tone: metrics.activeLinks === metrics.links ? 'text-slate-300' : 'text-rose-300',
    },
    {
      icon: Boxes,
      label: 'components',
      value: String(metrics.components),
      tone: metrics.components === 1 ? 'text-emerald-300' : 'text-amber-300',
    },
    {
      icon: CircleAlert,
      label: 'critical',
      value: `${metrics.articulationPoints} AP · ${metrics.bridges} BR`,
      tone: 'text-amber-300/90',
    },
  ];

  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-0 z-40 px-3 pb-3">
      <div className="pointer-events-auto mx-auto flex w-full max-w-[1680px] flex-wrap items-center gap-x-4 gap-y-2 rounded-xl border border-[var(--border)] bg-[var(--surface)] px-3 py-2 shadow-[0_-10px_32px_-20px_rgba(2,8,23,0.7)] sm:px-4">
        <div className="flex items-center gap-2">
          <LiveDot tone={degraded ? 'amber' : 'emerald'} />
          <span className="font-mono text-[8.5px] uppercase tracking-[0.14em] text-slate-500">live state</span>
        </div>

        <div className="flex flex-1 flex-wrap items-center gap-x-4 gap-y-1">
          {items.map((item) => (
            <div key={item.label} className="flex items-center gap-1.5">
              <item.icon size={12} className={item.tone} strokeWidth={1.9} />
              <span className={cn('font-mono text-[10px] tabular-nums', item.tone)}>{item.value}</span>
              <span className="hidden font-mono text-[8px] uppercase tracking-[0.1em] text-slate-600 sm:inline">
                {item.label}
              </span>
            </div>
          ))}
        </div>

        <div className="flex items-center gap-2">
          <Button
            size="sm"
            variant={degraded ? 'warning' : 'ghost'}
            icon={Activity}
            onClick={() => void rerunAnalysis()}
            title="Re-run components and Tarjan on the current topology"
          >
            Re-run analysis
          </Button>
          <Button
            size="sm"
            variant={confirmReset ? 'danger' : 'ghost'}
            icon={RotateCcw}
            loading={pending.includes('reset')}
            onClick={() => {
              if (!confirmReset) {
                setConfirmReset(true);
                return;
              }
              setConfirmReset(false);
              void resetTopology();
            }}
            onBlur={() => setConfirmReset(false)}
            title="Reset to the healthy 10-device network"
          >
            {confirmReset ? 'Confirm reset' : 'Reset healthy'}
          </Button>
        </div>
      </div>
    </div>
  );
}
