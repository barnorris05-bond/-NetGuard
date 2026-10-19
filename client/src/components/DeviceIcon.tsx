import { Database, Globe, Monitor, Network, Router, Server, ShieldCheck, type LucideProps } from 'lucide-react';
import type { DeviceKind } from '../lib/layout';

export const DEVICE_ICONS: Record<DeviceKind, typeof Router> = {
  router: Router,
  switch: Network,
  web: Globe,
  database: Database,
  admin: ShieldCheck,
  workstation: Monitor,
  unknown: Server,
};

export function DeviceIcon({ kind, ...props }: { kind: DeviceKind } & LucideProps) {
  const Icon = DEVICE_ICONS[kind];
  return <Icon {...props} />;
}
