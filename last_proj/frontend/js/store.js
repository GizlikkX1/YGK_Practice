/* Global app state: session, workspace, sidebar data */
import { api, setApiUser } from './api.js';

const USER_KEY = 'taskboard.userId';
const listeners = new Set();

export const store = {
  userId: null,
  me: null,            // {user, active_tasks, owned_boards}
  users: [],
  workspace: { name: '', members_count: 0 },
  boards: [],          // summaries of non-archived boards (sidebar)
  route: { name: 'boards', params: {} },
  currentBoard: null,  // full board on the board page (used for role in the sidebar)
};

export function subscribe(fn) { listeners.add(fn); return () => listeners.delete(fn); }
export function notify() { for (const fn of listeners) fn(store); }

export async function loadSession() {
  store.users = await api.users();
  const saved = Number(localStorage.getItem(USER_KEY));
  const user = store.users.find((u) => u.id === saved) || store.users[0];
  if (!user) throw new Error('В базе нет пользователей');
  store.userId = user.id;
  setApiUser(user.id);
  await refreshShell();
}

export async function refreshShell() {
  const [me, workspace, boards, users] = await Promise.all([api.me(), api.workspace(), api.boards('all'), api.users()]);
  Object.assign(store, { me, workspace, boards, users });
  notify();
}

export function switchUser(id) {
  localStorage.setItem(USER_KEY, String(id));
  store.userId = id;
  setApiUser(id);
}

export const userById = (id) => store.users.find((u) => u.id === id);
