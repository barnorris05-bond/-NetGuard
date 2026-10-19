import type { ReactNode } from 'react';
import { cn } from './ui';

export interface LegendItem {
  label: string;
  swatch: ReactNode;
}

export function CanvasLegend({
  items,
  note,
  className,
}: {
  items: LegendItem[];
  note?: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        'flex flex-wrap items-center gap-x-4 gap-y-2 border-t border-white/[0.05] bg-[#050c16]/60 px-4 py-2.5',
        className,
      )}
    >
      {items.map((item) => (
        <span key={item.label} className="inline-flex items-center gap-1.5 font-mono text-[9px] uppercase tracking-[0.08em] text-slate-500">
          {item.swatch}
          {item.label}
        </span>
      ))}
      {note && <span className="ml-auto text-[10px] text-slate-500">{note}</span>}
    </div>
  );
}

export function LineSwatch({ color, dashed = false, glow = false }: { color: string; dashed?: boolean; glow?: boolean }) {
  return (
    <span
      className={cn('inline-block h-[2px] w-5 rounded-full', glow && 'shadow-[0_0_6px_currentColor]')}
      style={{
        backgroundColor: color,
        color,
        backgroundImage: dashed ? `repeating-linear-gradient(90deg, ${color} 0 3px, transparent 3px 6px)` : undefined,
      }}
    />
  );
}

export function DotSwatch({ color }: { color: string }) {
  return <span className="inline-block size-2 rounded-full" style={{ backgroundColor: color, boxShadow: `0 0 8px ${color}66` }} />;
}
