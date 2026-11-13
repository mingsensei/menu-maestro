import type { Category, MenuItem } from '@/type/type';
import type { Language } from '@/contexts/LanguageContext';

const base = (import.meta.env.VITE_API_BASE_URL || '/api').replace(/\/$/, '');
export class ApiError extends Error {
  constructor(public status: number, message: string) { super(message); }
}
async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`${base}${path}`, {
      ...options, credentials: 'include',
      headers: { ...(typeof options.body === 'string' ? { 'Content-Type': 'application/json' } : {}), ...options.headers },
    });
  } catch { throw new ApiError(0, 'Cannot reach the server. Please check your connection.'); }
  const body = await response.json().catch(() => null);
  if (!response.ok) throw new ApiError(response.status, body?.error || 'Request failed. Please try again.');
  if (!body) throw new ApiError(502, 'The server returned an invalid response.');
  return body as T;
}
const json = (method: string, body?: unknown): RequestInit => ({ method, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
const query = (values: Record<string, string | number>) => new URLSearchParams(Object.entries(values).map(([key, value]) => [key, String(value)])).toString();

export interface Session { user: { id: string; email: string } | null; isAdmin: boolean }
export interface Preferences { diet: 'any' | 'vegetarian' | 'vegan' | 'gluten_free' | 'dairy_free'; maxPrice: number | null; mild: boolean; avoid: string[] }
export type ChatAction = 'chat' | 'suggest' | 'popular' | 'vegetarian' | 'mild';
export interface ChatMessage { role: 'user' | 'assistant'; content: string }
export interface AppliedChatFilters { diets: Exclude<Preferences['diet'], 'any'>[]; maxPrice: number | null; mild: boolean; avoid: string[]; allergy?: string[]; alcohol: 'any' | 'none' | 'alcoholic' }
export interface ChatReply { appliedFilters?: AppliedChatFilters; language?: Language; conversationId?: string; reply: string; items: (MenuItem & { price_with_vat: number })[]; mode: 'ai' | 'filters' | 'unavailable'; sources?: { id: string; title: string }[] }
export interface KnowledgeDocument { content: string; version: string }
export interface MaintenanceJob { id: string; status: 'running' | 'complete' | 'failed'; current: number; total: number; updated: number; skipped: number; errors: string[] }
export interface Analytics { totalViews: number; todayViews: number; trackingAvailable: boolean; topItems: { menu_item_id: string; name: string; view_count: number }[] }

export const api = {
  knowledge: () => request<KnowledgeDocument>('/admin/knowledge'),
  saveKnowledge: (document: KnowledgeDocument) => request<KnowledgeDocument>('/admin/knowledge', json('PATCH', document)),
  menu: (filters: { page: number; search: string; category: string; sort: string }, signal?: AbortSignal) => request<{ data: MenuItem[]; count: number }>(`/menu?${query(filters)}`, { signal }),
  categories: (admin = false) => request<{ data: Category[] }>(admin ? '/admin/categories' : '/categories'),
  pageView: (page_path: string) => request('/page-views', json('POST', { page_path })),
  itemView: (id: string) => request(`/menu/${encodeURIComponent(id)}/views`, json('POST', {})),
  session: () => request<Session>('/auth/session'),
  login: async (email: string, password: string) => { const result = await request<Session>('/auth/login', json('POST', { email, password })); window.dispatchEvent(new Event('authchange')); return result; },
  logout: async () => { await request('/auth/logout', json('POST', {})); window.dispatchEvent(new Event('authchange')); },
  adminItems: (filters: Record<string, string> = {}) => request<{ data: MenuItem[] }>(`/admin/menu?${query(filters)}`),
  saveItem: (data: Omit<MenuItem, 'id'>, id?: string) => request<{ data: MenuItem; warning?: string }>(id ? `/admin/menu/${encodeURIComponent(id)}` : '/admin/menu', json(id ? 'PATCH' : 'POST', data)),
  deleteItem: (id: string) => request(`/admin/menu/${encodeURIComponent(id)}`, json('DELETE')),
  saveCategory: (data: Partial<Category>, id?: string) => request(id ? `/admin/categories/${encodeURIComponent(id)}` : '/admin/categories', json(id ? 'PATCH' : 'POST', data)),
  deleteCategory: (id: string) => request(`/admin/categories/${encodeURIComponent(id)}`, json('DELETE')),
  updateVAT: (ids: string[], vat: number) => request('/admin/vat', json('POST', { ids, vat })),
  analytics: () => request<Analytics>('/admin/analytics'),
  translate: <T,>(body: { description?: string; descriptions?: string[] }) => request<T>('/admin/translate', json('POST', body)),
  uploadImage: (file: File) => request<{ imageUrl: string; thumbnailUrl: string }>('/admin/images', { method: 'POST', body: file, headers: { 'Content-Type': file.type || 'application/octet-stream' } }),
  startJob: (type: 'optimize' | 'auto-fix') => request<MaintenanceJob>('/admin/jobs', json('POST', { type })),
  job: (id: string, signal?: AbortSignal) => request<MaintenanceJob>(`/admin/jobs/${encodeURIComponent(id)}`, { signal }),
  chat: (messages: ChatMessage[], language: Language, preferences: Preferences, action: ChatAction, signal?: AbortSignal, context: 'home' | 'menu' = 'menu', conversationId?: string) => request<ChatReply>('/chat', { ...json('POST', { messages, language, preferences, action, context, conversationId }), signal }),
};
