/* REST client. The demo has no passwords: the current user is sent in X-User-Id. */
export const CLIENT_ID = (crypto.randomUUID ? crypto.randomUUID() : `tab-${Date.now()}-${Math.random().toString(16).slice(2)}`);

let currentUserId = null;
let networkListener = () => {};
export function setApiUser(id) { currentUserId = id; }
export function onNetworkError(fn) { networkListener = fn; }

export class ApiError extends Error {
  constructor(message, { status = 0, network = false, field = '' } = {}) {
    super(message);
    this.status = status;
    this.network = network;
    this.field = field;
  }
}

async function request(path, { method = 'GET', body, query } = {}) {
  let url = `/api${path}`;
  if (query) {
    const qs = new URLSearchParams(Object.entries(query).filter(([, v]) => v != null && v !== ''));
    if ([...qs].length) url += `?${qs}`;
  }
  const headers = { 'X-Client-Id': CLIENT_ID };
  if (currentUserId != null) headers['X-User-Id'] = String(currentUserId);
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  let res;
  try {
    res = await fetch(url, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
  } catch (e) {
    networkListener(e);
    throw new ApiError('Нет соединения с сервером', { network: true });
  }
  if (res.status === 204) return null;
  let data = null;
  try { data = await res.json(); } catch { /* empty body */ }
  if (!res.ok) {
    if (res.status >= 502 && res.status <= 504) networkListener(new Error(res.statusText));
    const detail = typeof data?.detail === 'string' ? data.detail : 'Не удалось выполнить запрос';
    throw new ApiError(detail, { status: res.status, field: data?.field || '' });
  }
  return data;
}

export const api = {
  health: () => request('/health'),
  workspace: () => request('/workspace'),
  users: () => request('/users'),
  createUser: (p) => request('/users', { method: 'POST', body: p }),
  me: () => request('/me'),
  myTasks: () => request('/me/tasks'),

  boards: (filter = 'all') => request('/boards', { query: { filter } }),
  board: (id) => request(`/boards/${id}`),
  createBoard: (p) => request('/boards', { method: 'POST', body: p }),
  updateBoard: (id, p) => request(`/boards/${id}`, { method: 'PATCH', body: p }),
  deleteBoard: (id) => request(`/boards/${id}`, { method: 'DELETE' }),
  favorite: (id, v) => request(`/boards/${id}/favorite`, { method: 'PUT', body: { is_favorite: v } }),
  addMember: (id, p) => request(`/boards/${id}/members`, { method: 'POST', body: p }),
  removeMember: (id, uid) => request(`/boards/${id}/members/${uid}`, { method: 'DELETE' }),

  createColumn: (bid, p) => request(`/boards/${bid}/columns`, { method: 'POST', body: p }),
  updateColumn: (id, p) => request(`/columns/${id}`, { method: 'PATCH', body: p }),
  reorderColumns: (bid, ids) => request(`/boards/${bid}/columns/order`, { method: 'PUT', body: { column_ids: ids } }),
  deleteColumn: (id, strategy, target) => request(`/columns/${id}`, { method: 'DELETE', query: { strategy, target_column_id: target } }),

  createTask: (bid, p) => request(`/boards/${bid}/tasks`, { method: 'POST', body: p }),
  task: (id) => request(`/tasks/${id}`),
  updateTask: (id, p) => request(`/tasks/${id}`, { method: 'PATCH', body: p }),
  moveTask: (id, column_id, position) => request(`/tasks/${id}/move`, { method: 'POST', body: { column_id, position } }),
  deleteTask: (id) => request(`/tasks/${id}`, { method: 'DELETE' }),
  history: (id) => request(`/tasks/${id}/history`),
  comments: (id) => request(`/tasks/${id}/comments`),
  addComment: (id, text) => request(`/tasks/${id}/comments`, { method: 'POST', body: { text } }),
};
