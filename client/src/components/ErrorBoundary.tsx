import { Component, type ErrorInfo, type ReactNode } from 'react';
import { RefreshCw, TriangleAlert } from 'lucide-react';

interface Props {
  children: ReactNode;
  label?: string;
}

interface State {
  error: Error | null;
}

export class TabErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error('[netguard] Tab render failed:', error, info.componentStack);
  }

  render() {
    if (this.state.error) {
      return (
        <div className="panel p-6 text-center">
          <div className="mx-auto grid size-11 place-items-center rounded-xl border border-rose-400/25 bg-rose-400/[0.08] text-rose-300">
            <TriangleAlert size={20} />
          </div>
          <h2 className="mt-3 font-display text-base font-semibold text-slate-100">This view hit a render error</h2>
          <p className="mx-auto mt-1.5 max-w-md text-[11px] leading-relaxed text-slate-500">
            {this.props.label ?? 'The tab'} could not be rendered. Your live topology is safe on the API — reload the view
            to recover.
          </p>
          <p className="mx-auto mt-2 max-w-md overflow-hidden rounded-lg border border-white/[0.06] bg-black/20 px-2 py-1 font-mono text-[9px] text-rose-300/70">
            {this.state.error.message}
          </p>
          <button
            type="button"
            onClick={() => this.setState({ error: null })}
            className="mt-4 inline-flex h-9 items-center gap-2 rounded-lg border border-white/10 bg-white/[0.04] px-3 text-[11px] text-slate-200 hover:bg-white/[0.07]"
          >
            <RefreshCw size={13} /> Try again
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
