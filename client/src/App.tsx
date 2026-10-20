import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { CircleAlert, Network, RefreshCw } from 'lucide-react';
import { useNetworkStore } from './store/useNetworkStore';
import { Header } from './components/Header';
import { TabErrorBoundary } from './components/ErrorBoundary';
import { TabNav } from './components/TabNav';
import { AppSidebar } from './components/Sidebar';
import { ToastViewport } from './components/Toasts';
import { StatusBar } from './components/StatusBar';
import { Button, cn, Panel, Skeleton } from './components/ui';
import { TopologyTab } from './tabs/TopologyTab';
import { TraceTab } from './tabs/TraceTab';
import { PathFinderTab } from './tabs/PathFinderTab';
import { VulnerabilityTab } from './tabs/VulnerabilityTab';
import { ComponentsTab } from './tabs/ComponentsTab';
import { FailureTab } from './tabs/FailureTab';
import { DemoTab } from './tabs/DemoTab';
import { HistoryTab } from './tabs/HistoryTab';
import type { GraphSnapshot, TabId } from './lib/types';

function TabContent({ tab, graph }: { tab: TabId; graph: GraphSnapshot }) {
  switch (tab) {
    case 'topology':
      return <TopologyTab graph={graph} />;
    case 'trace':
      return <TraceTab graph={graph} />;
    case 'path':
      return <PathFinderTab graph={graph} />;
    case 'vulnerability':
      return <VulnerabilityTab graph={graph} />;
    case 'components':
      return <ComponentsTab graph={graph} />;
    case 'failure':
      return <FailureTab graph={graph} />;
    case 'demo':
      return <DemoTab graph={graph} />;
    case 'history':
      return <HistoryTab graph={graph} />;
    default:
      return null;
  }
}

function LoadingSkeleton() {
  return (
    <div className="mt-4 grid gap-4 xl:grid-cols-[minmax(0,1fr)_360px] 2xl:grid-cols-[minmax(0,1fr)_380px]">
      <Panel className="p-4">
        <div className="flex items-center gap-3">
          <Skeleton className="size-10 rounded-xl" />
          <div className="space-y-2">
            <Skeleton className="h-3.5 w-44" />
            <Skeleton className="h-2.5 w-72" />
          </div>
        </div>
        <Skeleton className="mt-4 aspect-[1000/620] w-full rounded-2xl" />
        <div className="mt-3 flex gap-3">
          <Skeleton className="h-16 flex-1" />
          <Skeleton className="h-16 flex-1" />
          <Skeleton className="h-16 flex-1" />
        </div>
      </Panel>
      <div className="space-y-4">
        <Panel className="p-4">
          <Skeleton className="mb-3 h-5 w-32" />
          {Array.from({ length: 9 }).map((_, index) => (
            <div key={index} className="mb-2.5 flex items-center gap-2">
              <Skeleton className="size-2.5 rounded-full" />
              <Skeleton className="h-3 flex-1" />
              <Skeleton className="h-3 w-14" />
            </div>
          ))}
        </Panel>
        <Panel className="p-4">
          <Skeleton className="mb-3 h-5 w-28" />
          <Skeleton className="h-3 w-full" />
          <Skeleton className="mt-2 h-3 w-4/5" />
        </Panel>
      </div>
    </div>
  );
}

function ApiOffline({ error }: { error: string }) {
  const refreshGraph = useNetworkStore((state) => state.refreshGraph);
  const [retrying, setRetrying] = useState(false);

  const retry = async () => {
    setRetrying(true);
    await refreshGraph();
    setRetrying(false);
  };

  return (
    <div className="mt-8 grid place-items-center px-4">
      <Panel glow className="w-full max-w-lg p-6 text-center">
        <div className="mx-auto grid size-12 place-items-center rounded-2xl border border-rose-400/25 bg-rose-400/[0.08] text-rose-300">
          <CircleAlert size={24} />
        </div>
        <h2 className="mt-4 font-display text-xl font-semibold text-slate-100">API offline</h2>
        <p className="mx-auto mt-2 max-w-sm text-[12px] leading-relaxed text-slate-400">{error}</p>
        <div className="mt-4 rounded-xl border border-white/[0.08] bg-[#050c16] px-3 py-2.5 text-left font-mono text-[10.5px] text-cyan-200/80">
          <span className="text-slate-600">$</span> npm run dev
        </div>
        <p className="mt-2 text-[10px] text-slate-600">
          Starts the Express API on :4000 and Vite on :5173. The client proxies <span className="font-mono">/api</span>.
        </p>
        <Button variant="primary" size="md" icon={RefreshCw} loading={retrying} onClick={() => void retry()} className="mt-4">
          Retry connection
        </Button>
      </Panel>
    </div>
  );
}

export default function App() {
  const bootstrap = useNetworkStore((state) => state.bootstrap);
  const graph = useNetworkStore((state) => state.graph);
  const graphLoading = useNetworkStore((state) => state.graphLoading);
  const error = useNetworkStore((state) => state.error);
  const tab = useNetworkStore((state) => state.tab);
  const initialized = useNetworkStore((state) => state.initialized);

  useEffect(() => {
    void bootstrap();
  }, [bootstrap]);

  useEffect(() => {
    window.scrollTo(0, 0);
  }, [tab]);

  return (
    <div className="app-shell min-h-screen">
      <Header />

      <main className="mx-auto w-full max-w-[1680px] px-4 pb-24 sm:px-5 lg:px-6">
        <div className="mt-3">
          <TabNav />
        </div>

        {!initialized || (graphLoading && !graph) ? (
          <LoadingSkeleton />
        ) : !graph ? (
          <ApiOffline error={error ?? 'The backend did not respond. Start it with npm run dev.'} />
        ) : (
          <div className="mt-4 grid items-start gap-4 xl:grid-cols-[minmax(0,1fr)_360px] 2xl:grid-cols-[minmax(0,1fr)_384px]">
            <div className="min-w-0">
              {/* Enter-only transition: mounting never waits for an exit animation,
                  so a throttled/background tab can still switch instantly. */}
              <motion.div
                key={tab}
                initial={{ opacity: 0.94, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
                className="min-w-0"
              >
                <TabErrorBoundary label={`The ${tab} tab`}>
                  <TabContent tab={tab} graph={graph} />
                </TabErrorBoundary>
              </motion.div>
            </div>
            <AppSidebar />
          </div>
        )}

        <footer className="mt-7 flex flex-wrap items-center justify-between gap-2 border-t border-white/[0.05] px-1 pt-4 font-mono text-[8.5px] uppercase tracking-[0.12em] text-slate-600">
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
            <span>NetGuard · adjacency-list graph engine</span>
            <span className="hidden text-slate-700 sm:inline">/</span>
            <span className="hidden sm:inline">BFS · Tarjan · Components · O(V+E)</span>
          </div>
          <div className="flex items-center gap-4">
            <span className="inline-flex items-center gap-1.5">
              <Network size={10} />
              C++ logic ported to TypeScript
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span className={cn('size-1.5 rounded-full', error ? 'bg-rose-400' : 'bg-emerald-400')} />
              {error ? 'api disconnected' : 'api connected'}
            </span>
          </div>
        </footer>
      </main>

      <StatusBar />
      <ToastViewport />
    </div>
  );
}
