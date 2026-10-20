import { motion } from 'framer-motion';
import {
  GitCompareArrows,
  History,
  ListOrdered,
  Network,
  Route,
  ShieldAlert,
  Layers,
  Zap,
  type LucideIcon,
} from 'lucide-react';
import type { TabId } from '../lib/types';
import { useNetworkStore } from '../store/useNetworkStore';
import { cn } from './ui';

interface TabDefinition {
  id: TabId;
  label: string;
  icon: LucideIcon;
  count?: number;
}

export function TabNav() {
  const tab = useNetworkStore((state) => state.tab);
  const setTab = useNetworkStore((state) => state.setTab);
  const graph = useNetworkStore((state) => state.graph);
  const historyCount = useNetworkStore((state) => state.history.length);

  const tabs: TabDefinition[] = [
    { id: 'topology', label: 'Topology', icon: Network },
    { id: 'trace', label: 'Step Trace', icon: ListOrdered },
    { id: 'path', label: 'Path Finder', icon: Route },
    { id: 'vulnerability', label: 'Vulnerability', icon: ShieldAlert, count: graph?.metrics.articulationPoints },
    { id: 'components', label: 'Components', icon: Layers, count: graph?.metrics.components },
    { id: 'failure', label: 'Failure Sim', icon: Zap },
    { id: 'demo', label: 'Before / After', icon: GitCompareArrows },
    { id: 'history', label: 'History', icon: History, count: historyCount || undefined },
  ];

  return (
    <div className="no-scrollbar -mx-1 flex flex-wrap items-center gap-1 rounded-2xl border border-white/[0.07] bg-[#070f1b]/90 p-1.5 md:flex-nowrap md:overflow-x-auto">
      {tabs.map((item) => {
        const active = tab === item.id;
        return (
          <motion.button
            key={item.id}
            type="button"
            onClick={() => setTab(item.id)}
            whileTap={{ scale: 0.98 }}
            className={cn(
              'relative z-[1] flex shrink-0 items-center gap-1.5 rounded-xl px-2.5 py-2 text-[11px] font-medium transition-colors duration-200 sm:gap-2 sm:px-3.5 sm:text-[11.5px]',
              active ? 'text-[#03121a]' : 'text-slate-400 hover:bg-white/[0.035] hover:text-slate-200',
            )}
            aria-current={active ? 'page' : undefined}
          >
            {active && (
              <motion.span
                layoutId="netguard-active-tab"
                className="absolute inset-0 -z-[1] rounded-xl bg-gradient-to-br from-cyan-300 to-cyan-400 shadow-[0_8px_22px_-10px_rgba(34,211,238,0.9)]"
                transition={{ type: 'spring', stiffness: 420, damping: 34 }}
              />
            )}
            <item.icon size={14} strokeWidth={active ? 2.2 : 1.8} />
            <span className="whitespace-nowrap">{item.label}</span>
            {item.count !== undefined && item.count > 0 && (
              <span
                className={cn(
                  'hidden rounded-full px-1 py-0.5 font-mono text-[8px] leading-none md:inline',
                  active ? 'bg-[#03121a]/15 text-[#03121a]' : 'bg-white/[0.06] text-slate-500',
                )}
              >
                {item.count}
              </span>
            )}
          </motion.button>
        );
      })}
    </div>
  );
}
