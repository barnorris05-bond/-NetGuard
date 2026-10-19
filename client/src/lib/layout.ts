export const VIEW_WIDTH = 1000;
export const VIEW_HEIGHT = 620;

export type DeviceKind = 'router' | 'switch' | 'web' | 'database' | 'admin' | 'workstation' | 'unknown';

export interface Point {
  x: number;
  y: number;
}

/** Hand-tuned coordinates for the 10-device sample topology. */
export const NODE_POSITIONS: Record<string, Point> = {
  Core_Router: { x: 500, y: 82 },
  Dist_Router_1: { x: 296, y: 218 },
  Dist_Router_2: { x: 704, y: 218 },
  Switch_A: { x: 202, y: 364 },
  Switch_B: { x: 438, y: 364 },
  Switch_C: { x: 752, y: 364 },
  Web_Server: { x: 118, y: 524 },
  Db_Server: { x: 470, y: 532 },
  Admin_PC: { x: 658, y: 526 },
  User_PC: { x: 842, y: 524 },
};

/** Stable fallback slots for devices added through the topology editor. */
const FALLBACK_SLOTS: Point[] = [
  { x: 880, y: 92 },
  { x: 94, y: 92 },
  { x: 886, y: 236 },
  { x: 78, y: 236 },
  { x: 878, y: 430 },
  { x: 90, y: 430 },
  { x: 610, y: 104 },
  { x: 330, y: 104 },
];

export function buildLayout(deviceNames: string[]): Map<string, Point> {
  const layout = new Map<string, Point>();
  const used = new Set<string>();
  deviceNames.forEach((name) => {
    const fixed = NODE_POSITIONS[name];
    if (fixed) {
      layout.set(name, fixed);
      used.add(`${fixed.x},${fixed.y}`);
    }
  });

  let fallbackIndex = 0;
  for (const name of deviceNames) {
    if (layout.has(name)) continue;
    let slot = FALLBACK_SLOTS[fallbackIndex % FALLBACK_SLOTS.length];
    while (used.has(`${slot.x},${slot.y}`) && fallbackIndex < 40) {
      fallbackIndex += 1;
      slot = FALLBACK_SLOTS[fallbackIndex % FALLBACK_SLOTS.length];
    }
    // Nudge any remaining collisions onto a small deterministic ring.
    const ring = Math.floor(fallbackIndex / FALLBACK_SLOTS.length);
    const point = ring === 0 ? slot : { x: 500 + Math.cos(fallbackIndex) * 300, y: 320 + Math.sin(fallbackIndex) * 210 };
    layout.set(name, point);
    used.add(`${point.x},${point.y}`);
    fallbackIndex += 1;
  }
  return layout;
}

export const COMPONENT_COLORS = [
  '#22d3ee',
  '#a78bfa',
  '#fbbf24',
  '#34d399',
  '#fb7185',
  '#60a5fa',
  '#f97316',
  '#e879f9',
];

export interface DeviceMeta {
  kind: DeviceKind;
  label: string;
  color: string;
}

export function deviceMeta(name: string): DeviceMeta {
  const lower = name.toLowerCase();
  if (/db|database|sql/.test(lower)) return { kind: 'database', label: 'DATABASE', color: '#fbbf24' };
  if (/web|http|cdn/.test(lower)) return { kind: 'web', label: 'WEB SERVER', color: '#34d399' };
  if (/admin/.test(lower)) return { kind: 'admin', label: 'ADMIN PC', color: '#f472b6' };
  if (/router|gateway|core/.test(lower)) return { kind: 'router', label: 'ROUTER', color: '#8b5cf6' };
  if (/switch|hub|bridge/.test(lower)) return { kind: 'switch', label: 'SWITCH', color: '#22d3ee' };
  if (/pc|user|workstation|laptop/.test(lower)) return { kind: 'workstation', label: 'WORKSTATION', color: '#60a5fa' };
  if (/server/.test(lower)) return { kind: 'web', label: 'SERVER', color: '#34d399' };
  return { kind: 'unknown', label: 'DEVICE', color: '#94a3b8' };
}

export const linkKey = (a: string, b: string) => [a, b].sort().join('~');

export function getLinkPoint(
  link: { u: string; v: string },
  layout: Map<string, Point>,
): { a: Point; b: Point } | null {
  const a = layout.get(link.u);
  const b = layout.get(link.v);
  if (!a || !b) return null;
  return { a, b };
}
