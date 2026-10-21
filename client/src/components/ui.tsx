import { useEffect, useRef, useState, type ButtonHTMLAttributes, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { Info, Loader2, type LucideIcon } from 'lucide-react';

export function cn(...values: Array<string | false | null | undefined>): string {
  return values.filter(Boolean).join(' ');
}

/* ------------------------------------------------------------------ */
/* Panel                                                               */
/* ------------------------------------------------------------------ */

export function Panel({
  children,
  className,
  glow = false,
}: {
  children: ReactNode;
  className?: string;
  glow?: boolean;
}) {
  return <section className={cn('panel', glow && 'panel-glow', className)}>{children}</section>;
}

export function SectionHeader({
  eyebrow,
  title,
  subtitle,
  icon: Icon,
  actions,
  className,
}: {
  eyebrow?: string;
  title: string;
  subtitle?: ReactNode;
  icon?: LucideIcon;
  actions?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn('flex flex-wrap items-start justify-between gap-3', className)}>
      <div className="flex min-w-0 items-start gap-3">
        {Icon && (
          <div className="mt-0.5 grid size-10 shrink-0 place-items-center rounded-xl border border-cyan-400/20 bg-cyan-400/[0.08] text-cyan-300 shadow-[0_0_24px_-10px_rgba(34,211,238,0.7)]">
            <Icon size={19} strokeWidth={1.8} />
          </div>
        )}
        <div className="min-w-0">
          {eyebrow && <p className="eyebrow mb-1">{eyebrow}</p>}
        <h2 className="font-display text-lg font-semibold tracking-tight text-slate-100 sm:text-xl">{title}</h2>
          {subtitle && <p className="mt-1 text-sm leading-relaxed text-slate-400">{subtitle}</p>}
        </div>
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Button                                                              */
/* ------------------------------------------------------------------ */

type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'success' | 'warning';
type ButtonSize = 'sm' | 'md' | 'icon' | 'icon-sm';

const buttonVariants: Record<ButtonVariant, string> = {
  primary:
    'border border-[var(--active)] bg-[var(--active)] text-white hover:brightness-110 shadow-sm',
  secondary:
    'border border-white/10 bg-white/[0.045] text-slate-200 hover:border-white/20 hover:bg-white/[0.08]',
  ghost: 'border border-transparent text-slate-400 hover:bg-white/[0.06] hover:text-slate-100',
  danger:
    'border border-rose-400/25 bg-rose-500/[0.12] text-rose-200 hover:border-rose-400/40 hover:bg-rose-500/20',
  success:
    'border border-emerald-400/25 bg-emerald-500/[0.12] text-emerald-200 hover:border-emerald-400/40 hover:bg-emerald-500/20',
  warning:
    'border border-amber-400/25 bg-amber-500/[0.12] text-amber-200 hover:border-amber-400/40 hover:bg-amber-500/20',
};

const buttonSizes: Record<ButtonSize, string> = {
  sm: 'h-8 gap-1.5 rounded-lg px-3 text-[11.5px]',
  md: 'h-10 gap-2 rounded-xl px-4 text-[13px]',
  icon: 'size-10 rounded-xl',
  'icon-sm': 'size-8 rounded-lg',
};

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  loading?: boolean;
  icon?: LucideIcon;
}

export function Button({
  children,
  variant = 'secondary',
  size = 'md',
  loading = false,
  icon: Icon,
  className,
  disabled,
  ...rest
}: ButtonProps) {
  return (
    <button
      {...rest}
      disabled={disabled || loading}
      className={cn(
        'inline-flex select-none items-center justify-center font-medium tracking-tight transition-all duration-200',
        'disabled:cursor-not-allowed disabled:opacity-45 focus-visible:outline-cyan-400',
        buttonVariants[variant],
        buttonSizes[size],
        className,
      )}
    >
      {loading ? (
        <Loader2 size={size === 'md' ? 15 : 13} className="animate-spin" />
      ) : (
        Icon && <Icon size={size === 'md' ? 15 : 13} strokeWidth={2} />
      )}
      {children}
    </button>
  );
}

/* ------------------------------------------------------------------ */
/* Badges                                                              */
/* ------------------------------------------------------------------ */

export type BadgeTone = 'slate' | 'cyan' | 'amber' | 'rose' | 'emerald' | 'violet' | 'blue';

const badgeTones: Record<BadgeTone, string> = {
  slate: 'border-white/10 bg-white/[0.04] text-slate-400',
  cyan: 'border-cyan-400/25 bg-cyan-400/[0.08] text-cyan-300',
  amber: 'border-amber-400/25 bg-amber-400/[0.08] text-amber-300',
  rose: 'border-rose-400/25 bg-rose-400/[0.08] text-rose-300',
  emerald: 'border-emerald-400/25 bg-emerald-400/[0.08] text-emerald-300',
  violet: 'border-violet-400/25 bg-violet-400/[0.08] text-violet-300',
  blue: 'border-blue-400/25 bg-blue-400/[0.08] text-blue-300',
};

export function Badge({
  children,
  tone = 'slate',
  className,
  icon: Icon,
}: {
  children: ReactNode;
  tone?: BadgeTone;
  className?: string;
  icon?: LucideIcon;
}) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-full border px-2 py-0.5 font-mono text-[9.5px] font-medium uppercase tracking-[0.08em]',
        badgeTones[tone],
        className,
      )}
    >
      {Icon && <Icon size={10} strokeWidth={2.2} />}
      {children}
    </span>
  );
}

const COMPLEXITY_EXPLANATION =
  'Each vertex is visited once and every adjacency entry is scanned at most once (2E entries for an undirected graph). Initialising the O(V) arrays adds a linear term, so the total is O(V + E) time and O(V) auxiliary space.';

export function ComplexityChip({
  complexity,
  time,
  explain = COMPLEXITY_EXPLANATION,
}: {
  complexity: string;
  time?: number;
  /** Plain-English justification shown by the info button. */
  explain?: string;
}) {
  const [position, setPosition] = useState<{ left: number; top: number } | null>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const open = position !== null;

  /** Keep the fixed-position tooltip inside the viewport, near its button. */
  const computePosition = () => {
    const rect = buttonRef.current?.getBoundingClientRect();
    if (!rect) return null;
    const width = 288;
    return {
      left: Math.max(8, Math.min(rect.right - width, window.innerWidth - width - 8)),
      top: Math.min(rect.bottom + 6, window.innerHeight - 120),
    };
  };

  /* The tooltip is portalled to <body> so panel overflow-hidden cannot clip it. */
  useEffect(() => {
    if (!position) return;
    const follow = () => {
      const next = computePosition();
      if (next) setPosition(next);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setPosition(null);
    };
    const onPointerDown = (event: PointerEvent) => {
      if (buttonRef.current?.contains(event.target as Node)) return;
      setPosition(null);
    };
    window.addEventListener('scroll', follow, true);
    window.addEventListener('resize', follow);
    window.addEventListener('keydown', onKeyDown);
    document.addEventListener('pointerdown', onPointerDown);
    return () => {
      window.removeEventListener('scroll', follow, true);
      window.removeEventListener('resize', follow);
      window.removeEventListener('keydown', onKeyDown);
      document.removeEventListener('pointerdown', onPointerDown);
    };
  }, [position]); // eslint-disable-line react-hooks/exhaustive-deps

  const toggle = () => {
    if (position) {
      setPosition(null);
      return;
    }
    const next = computePosition();
    if (next) setPosition(next);
  };

  return (
    <span className="relative inline-flex items-center gap-2 rounded-lg border border-violet-400/20 bg-violet-400/[0.07] px-2.5 py-1 font-mono text-[10px] text-violet-200">
      <span className="text-violet-400">TIME</span>
      {complexity}
      {time !== undefined && <span className="text-slate-500">{time.toFixed(2)} ms</span>}
      <button
        ref={buttonRef}
        type="button"
        onClick={toggle}
        aria-label={`Why is this ${complexity}?`}
        aria-expanded={open}
        title={explain}
        className="grid size-4 place-items-center rounded-full text-violet-300/70 transition-colors hover:bg-violet-400/15 hover:text-violet-200 focus-visible:outline-cyan-400"
      >
        <Info size={11} strokeWidth={2.2} />
      </button>
      {position &&
        createPortal(
          <span
            role="tooltip"
            style={{ left: position.left, top: position.top, width: 288 }}
            className="fixed z-[100] rounded-lg border border-violet-400/25 bg-[#0b0a1a] p-2.5 font-sans text-[10px] font-normal normal-case leading-relaxed tracking-normal text-slate-300 shadow-[0_18px_40px_-18px_rgba(0,0,0,0.9)]"
          >
            {explain}
          </span>,
          document.body,
        )}
    </span>
  );
}

/* ------------------------------------------------------------------ */
/* Stats                                                               */
/* ------------------------------------------------------------------ */

export function StatCard({
  label,
  value,
  hint,
  icon: Icon,
  tone = 'cyan',
  className,
}: {
  label: string;
  value: ReactNode;
  hint?: ReactNode;
  icon?: LucideIcon;
  tone?: 'cyan' | 'rose' | 'amber' | 'emerald' | 'violet';
  className?: string;
}) {
  const tones = {
    cyan: 'text-cyan-300 border-cyan-400/15 bg-cyan-400/[0.07]',
    rose: 'text-rose-300 border-rose-400/15 bg-rose-400/[0.07]',
    amber: 'text-amber-300 border-amber-400/15 bg-amber-400/[0.07]',
    emerald: 'text-emerald-300 border-emerald-400/15 bg-emerald-400/[0.07]',
    violet: 'text-violet-300 border-violet-400/15 bg-violet-400/[0.07]',
  };
  return (
    <div className={cn('panel-inset flex items-center gap-3 px-3.5 py-3', className)}>
      {Icon && (
        <div className={cn('grid size-9 shrink-0 place-items-center rounded-lg border', tones[tone])}>
          <Icon size={16} strokeWidth={1.9} />
        </div>
      )}
      <div className="min-w-0">
        <p className="truncate font-mono text-[9px] uppercase tracking-[0.14em] text-slate-500">{label}</p>
        <p className="mt-0.5 font-display text-xl font-semibold leading-none tabular-nums text-slate-100">{value}</p>
        {hint && <p className="mt-1 truncate text-[10.5px] text-slate-500">{hint}</p>}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Feedback                                                            */
/* ------------------------------------------------------------------ */

export function Spinner({ size = 14, className }: { size?: number; className?: string }) {
  return <Loader2 size={size} className={cn('animate-spin text-cyan-300', className)} />;
}

export function Skeleton({ className }: { className?: string }) {
  return <div className={cn('skeleton', className)} />;
}

export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
  className,
}: {
  icon?: LucideIcon;
  title: string;
  description?: ReactNode;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        'flex flex-col items-center justify-center rounded-xl border border-dashed border-white/10 bg-white/[0.015] px-6 py-9 text-center',
        className,
      )}
    >
      {Icon && (
        <div className="mb-3 grid size-11 place-items-center rounded-full border border-white/10 bg-white/[0.03] text-slate-500">
          <Icon size={19} strokeWidth={1.6} />
        </div>
      )}
      <p className="font-display text-sm font-medium text-slate-200">{title}</p>
      {description && <p className="mt-1.5 max-w-sm text-xs leading-relaxed text-slate-500">{description}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

export function Kbd({ children }: { children: ReactNode }) {
  return (
    <kbd className="rounded border border-white/10 bg-white/[0.04] px-1.5 py-0.5 font-mono text-[9px] text-slate-500">
      {children}
    </kbd>
  );
}

export function LiveDot({ tone = 'emerald' }: { tone?: 'emerald' | 'rose' | 'amber' }) {
  const colors = { emerald: 'bg-emerald-400', rose: 'bg-rose-400', amber: 'bg-amber-400' };
  return (
    <span className="relative flex size-2">
      <span className={cn('absolute inline-flex size-full animate-ping rounded-full opacity-50', colors[tone])} />
      <span className={cn('relative inline-flex size-2 rounded-full', colors[tone])} />
    </span>
  );
}
