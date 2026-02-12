import { getTelegramWebApp } from './telegram';

const API_BASE = import.meta.env.VITE_API_BASE ?? 'http://localhost:8080';

async function apiFetch(path: string, options: RequestInit = {}) {
  const tg = getTelegramWebApp();
  const initData = tg?.initData ?? '';
  const headers = new Headers(options.headers || {});
  if (initData) headers.set('x-telegram-init-data', initData);
  // Dev helper: set VITE_DEV_TG_ID to work in browser outside Telegram
  const dev = import.meta.env.VITE_DEV_TG_ID;
  if (dev) headers.set('x-dev-tg-id', String(dev));
  headers.set('content-type', 'application/json');

  const res = await fetch(`${API_BASE}${path}`, { ...options, headers });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json?.error ?? `HTTP ${res.status}`);
  return json;
}

export const api = {
  me: () => apiFetch('/me'),
  subscription: () => apiFetch('/me/subscription'),
  listFocuses: () => apiFetch('/focuses'),
  createFocus: (data: any) => apiFetch('/focuses', { method: 'POST', body: JSON.stringify(data) }),
  getFocus: (id: string) => apiFetch(`/focuses/${id}`),
  listTasks: (focusId: string, assigned: 'me'|'all' = 'me') => apiFetch(`/focuses/${focusId}/tasks?assigned=${assigned}`),
  createTask: (focusId: string, data: any) => apiFetch(`/focuses/${focusId}/tasks`, { method: 'POST', body: JSON.stringify(data) }),
  patchTask: (taskId: string, data: any) => apiFetch(`/tasks/${taskId}`, { method: 'PATCH', body: JSON.stringify(data) }),
  getThread: (focusId: string) => apiFetch(`/focuses/${focusId}/assistant/thread`),
  sendMessage: (focusId: string, content: string) => apiFetch(`/focuses/${focusId}/assistant/message`, { method: 'POST', body: JSON.stringify({ content }) }),
  planToTasks: (focusId: string, tasks: any[]) => apiFetch(`/focuses/${focusId}/assistant/plan_to_tasks`, { method: 'POST', body: JSON.stringify({ tasks }) }),

  listKpis: (focusId: string) => apiFetch(`/focuses/${focusId}/kpis`),
  createKpi: (focusId: string, data: any) => apiFetch(`/focuses/${focusId}/kpis`, { method: 'POST', body: JSON.stringify(data) }),
  patchKpi: (kpiId: string, data: any) => apiFetch(`/kpis/${kpiId}`, { method: 'PATCH', body: JSON.stringify(data) }),

  getNotifSettings: () => apiFetch('/me/notifications/settings'),
  patchNotifSettings: (data: any) => apiFetch('/me/notifications/settings', { method: 'PATCH', body: JSON.stringify(data) })
};
