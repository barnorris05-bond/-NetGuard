import type {
  ComponentsResult,
  DemoResult,
  GraphSnapshot,
  HistoryResponse,
  PathResponse,
  VulnerabilityResult,
} from './types';

const SESSION_KEY = 'netguard.session.v1';

function makeSessionId(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID();
  return `ng-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

export function getSessionId(): string {
  try {
    const existing = localStorage.getItem(SESSION_KEY);
    if (existing) return existing;
    const created = makeSessionId();
    localStorage.setItem(SESSION_KEY, created);
    return created;
  } catch {
    return 'anonymous';
  }
}

export class ApiError extends Error {
  status: number;
  constructor(message: string, status = 0) {
    super(message);
    this.status = status;
  }
}

interface RequestOptions {
  method?: 'GET' | 'POST' | 'DELETE';
  body?: unknown;
}

async function request<T>(path: string, options: RequestOptions = {}): Promise<T> {
  let response: Response;
  try {
    response = await fetch(path, {
      method: options.method ?? 'GET',
      headers: {
        'Content-Type': 'application/json',
        'x-session-id': getSessionId(),
      },
      body: options.body === undefined ? undefined : JSON.stringify(options.body),
    });
  } catch {
    throw new ApiError('Cannot reach the NetGuard API. Is the backend running on port 4000?');
  }

  const text = await response.text();
  const payload = text ? (JSON.parse(text) as T & { error?: string }) : ({} as T & { error?: string });
  if (!response.ok) {
    throw new ApiError(payload?.error || `Request failed (${response.status})`, response.status);
  }
  return payload as T;
}

export const api = {
  graph: () => request<GraphSnapshot>('/api/graph'),
  path: (source: string, destination: string) =>
    request<PathResponse>('/api/path', { method: 'POST', body: { source, destination } }),
  vulnerabilities: () => request<VulnerabilityResult>('/api/vulnerabilities'),
  components: () => request<ComponentsResult>('/api/components'),
  failDevice: (name: string) =>
    request<{ message: string; graph: GraphSnapshot }>(`/api/devices/${encodeURIComponent(name)}/fail`, {
      method: 'POST',
      body: {},
    }),
  restoreDevice: (name: string) =>
    request<{ message: string; graph: GraphSnapshot }>(`/api/devices/${encodeURIComponent(name)}/restore`, {
      method: 'POST',
      body: {},
    }),
  failLink: (u: string, v: string) =>
    request<{ message: string; graph: GraphSnapshot }>('/api/links/fail', { method: 'POST', body: { u, v } }),
  restoreLink: (u: string, v: string) =>
    request<{ message: string; graph: GraphSnapshot }>('/api/links/restore', { method: 'POST', body: { u, v } }),
  restoreAll: () =>
    request<{ message: string; graph: GraphSnapshot }>('/api/restore-all', { method: 'POST', body: {} }),
  addDevice: (name: string) =>
    request<{ message: string; graph: GraphSnapshot }>('/api/devices', { method: 'POST', body: { name } }),
  addLink: (u: string, v: string) =>
    request<{ message: string; graph: GraphSnapshot }>('/api/links', { method: 'POST', body: { u, v } }),
  reset: () =>
    request<{ message: string; graph: GraphSnapshot }>('/api/reset', { method: 'POST', body: {} }),
  demo: (fail?: string) => {
    const params = new URLSearchParams({ source: 'Admin_PC', destination: 'Web_Server' });
    if (fail) params.set('fail', fail);
    return request<DemoResult>(`/api/demo/before-after?${params.toString()}`);
  },
  history: (scope: 'all' | 'session' = 'all') =>
    request<HistoryResponse>(`/api/history?scope=${scope}`),
  clearHistory: () =>
    request<HistoryResponse>('/api/history', { method: 'DELETE' }),
};

export function downloadFile(content: BlobPart, filename: string, type: string): void {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
