/* Entry point: hash router + bootstrap */
import { h } from './utils.js';
import { store, subscribe, loadSession, refreshShell, switchUser, userById } from './store.js';
import { onConnection } from './realtime.js';
import { snackbar } from './ui/toast.js';
import { closeMenus } from './ui/menu.js';
import { closeAllModals } from './ui/overlay.js';
import { closePicker } from './ui/picker.js';
import { renderSidebar } from './views/sidebar.js';
import { renderBoards } from './views/boards.js';
import { renderBoardPage, leaveBoard } from './views/board.js';
import { renderMyTasks, renderMembers, renderSettings } from './views/pages.js';

const sidebarEl = document.getElementById('sidebar');
const mainEl = document.getElementById('main');

export function navigate(hash) {
  if (location.hash === hash) route();
  else location.hash = hash;
}

export async function changeUser(id) {
  switchUser(id);
  leaveBoard();
  await refreshShell();
  navigate('#/');
  snackbar(`Вы работаете как ${userById(id)?.name}`);
}

function parse(hash) {
  const parts = hash.replace(/^#\/?/, '').split('/').filter(Boolean);
  if (parts[0] === 'board' && Number(parts[1])) {
    return { name: 'board', params: { id: Number(parts[1]), taskId: parts[2] === 'task' ? Number(parts[3]) || null : null } };
  }
  if (parts[0] === 'my') return { name: 'my', params: {} };
  if (parts[0] === 'members') return { name: 'members', params: {} };
  if (parts[0] === 'settings') return { name: 'settings', params: {} };
  return { name: 'boards', params: {} };
}

let lastPage = null;
async function route() {
  closeMenus();
  const r = parse(location.hash);
  store.route = r;
  if (r.name !== 'board') leaveBoard();
  renderSidebar(sidebarEl);
  const pageKey = r.name === 'board' ? `board-${r.params.id}` : r.name;
  if (pageKey !== lastPage) {
    closeAllModals(); closePicker();
    mainEl.scrollTop = 0; mainEl.scrollLeft = 0;
    if (r.name !== 'board' || !mainEl.querySelector('.board-page')) mainEl.replaceChildren(h('div.loading', h('div.spinner')));
  }
  lastPage = pageKey;
  try {
    if (r.name === 'board') await renderBoardPage(mainEl, r.params.id, r.params.taskId);
    else if (r.name === 'my') await renderMyTasks(mainEl);
    else if (r.name === 'members') await renderMembers(mainEl);
    else if (r.name === 'settings') renderSettings(mainEl);
    else await renderBoards(mainEl);
  } catch (e) {
    mainEl.replaceChildren(h('div.page', h('div.empty', { style: { marginTop: '80px' } },
      h('div.empty-title', 'Не удалось загрузить страницу'), e.message,
      h('div', { style: { marginTop: '16px' } }, h('button.btn.btn-secondary', { type: 'button', onclick: route }, 'Повторить')))));
  }
}

async function start() {
  try {
    await loadSession();
  } catch (e) {
    document.body.replaceChildren(h('div.loading', { style: { height: '100vh', flexDirection: 'column', gap: '12px' } },
      h('div.empty-title', 'Не удалось подключиться к серверу'),
      h('div', { style: { color: 'var(--text-2)' } }, 'Проверьте, что backend запущен (см. README), и обновите страницу.'),
      h('button.btn.btn-primary', { type: 'button', onclick: () => location.reload() }, 'Обновить')));
    return;
  }
  subscribe(() => renderSidebar(sidebarEl));
  window.addEventListener('hashchange', route);
  onConnection((c) => { if (c.online && store.route.name !== 'board') refreshShell(); });
  route();
}

start();
