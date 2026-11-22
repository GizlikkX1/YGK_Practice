/* Screen 2 — board: columns, cards, drag & drop (4), done (6), column menu/deletion (А3),
   move via menu & keyboard (А4), save errors & live updates (А6) */
import { h, pl, fmtShort, debounce, parseDate, today, daysBetween, focusLater } from '../utils.js';
import { icon } from '../icons.js';
import { avatar, avatarStack, priorityPill, plusIcon, colDot } from '../ui/components.js';
import { openMenu, closeMenus } from '../ui/menu.js';
import { openModal, confirmDialog } from '../ui/overlay.js';
import { toast, errorToast, snackbar } from '../ui/toast.js';
import { api, CLIENT_ID } from '../api.js';
import { store, notify, refreshShell } from '../store.js';
import { openBoardSocket, closeBoardSocket, connection, onConnection, reconnectNow } from '../realtime.js';
import { openTaskForm } from './task-form.js';
import { openTaskDrawer, closeTaskDrawer, drawerTaskId, refreshDrawer } from './task-drawer.js';
import { openMembersModal } from './members-modal.js';
import { openColumnsModal } from './columns-modal.js';
import { navigate } from '../main.js';

const S = {
  boardId: null,
  board: null,
  root: null,
  filters: { q: '', assignee: undefined, priority: null, due: null },
  errors: new Map(),       // taskId → failed move {columnId, index}
  marks: new Map(),        // taskId → css class (is-updated / is-moved)
  drag: null,
  kb: null,                // keyboard "picked" card
  busy: 0,
  pendingReload: false,
  el: {},
  search: null,
  unsubConn: null,
};

export const boardState = S;
export const isOwner = () => S.board?.role === 'owner';
const colById = (id) => S.board.columns.find((c) => c.id === id);
const taskById = (id) => S.board.tasks.find((t) => t.id === id);
const tasksIn = (colId) => S.board.tasks.filter((t) => t.column_id === colId).sort((a, b) => a.position - b.position);

/* ---------------------------------------------------------------- lifecycle */
export async function renderBoardPage(root, boardId, taskId) {
  const switching = S.boardId !== boardId;
  if (switching) leaveBoard();
  S.root = root;
  if (switching) {
    S.boardId = boardId;
    S.filters = { q: '', assignee: undefined, priority: null, due: null };
    S.errors.clear(); S.marks.clear();
    try {
      S.board = await api.board(boardId);
    } catch (e) {
      S.boardId = null;
      root.replaceChildren(h('div.page', h('div.empty', { style: { marginTop: '80px' } },
        h('div.empty-title', e.status === 404 ? 'Доска не найдена' : e.status === 403 ? 'Нет доступа к доске' : 'Не удалось загрузить доску'),
        e.message, h('div', { style: { marginTop: '16px' } }, h('a.btn.btn-secondary', { href: '#/' }, 'К списку досок')))));
      return;
    }
    store.currentBoard = S.board;
    notify();
    buildPage();
    openBoardSocket(boardId, store.userId, onLiveEvent);
    S.unsubConn = onConnection(() => drawToolbar());
  }
  if (taskId) openTaskDrawer(taskId, drawerContext());
  else closeTaskDrawer(false);
}

export function leaveBoard() {
  if (S.boardId == null) return;
  closeBoardSocket();
  S.unsubConn?.();
  closeTaskDrawer(false);
  S.boardId = null; S.board = null; S.drag = null; S.kb = null;
  store.currentBoard = null;
}

export async function reloadBoard() {
  if (S.boardId == null) return;
  if (S.drag || S.kb || S.busy) { S.pendingReload = true; return; }
  S.pendingReload = false;
  try {
    const b = await api.board(S.boardId);
    if (S.boardId !== b.id) return;
    S.board = b;
    store.currentBoard = b;
    drawAll();
  } catch (e) {
    if (e.status === 403 || e.status === 404) {
      toast({ kind: 'error', title: 'Доска недоступна', body: e.message });
      navigate('#/');
    }
  }
}

function drawerContext() {
  return {
    get board() { return S.board; },
    move: (taskId, colId, index) => commitMove(taskId, colId, index),
    deleteTask: (t) => deleteTask(t),
    reload: async () => { await reloadBoard(); refreshShell(); },
    close: () => navigate(`#/board/${S.boardId}`),
  };
}

/* ---------------------------------------------------------------- page skeleton */
function buildPage() {
  S.search = h('input.input', {
    type: 'search', placeholder: 'Поиск задач', 'aria-label': 'Поиск задач', value: S.filters.q,
    oninput: debounce((e) => { S.filters.q = e.target.value; drawColumns(); drawToolbar(); }, 120),
  });
  S.el.top = h('div.board-top');
  S.el.toolbar = h('div.toolbar');
  S.el.columns = h('div.columns', { role: 'list' });
  S.el.kbd = h('div.kbd-panel', { hidden: true, 'aria-hidden': 'true' },
    h('b', 'С клавиатуры:'),
    h('span.kbd', 'Пробел'), h('span', 'взять задачу'),
    h('span.kbd', '← →'), h('span', 'сменить колонку'),
    h('span.kbd', '↑ ↓'), h('span', 'позиция в колонке'),
    h('span.kbd', 'Пробел'), h('span', 'положить'),
    h('span.kbd', 'Esc'), h('span', 'отменить'));
  S.el.live = h('div.sr-only', { 'aria-live': 'assertive' });
  S.el.page = h('div.board-page', S.el.top, S.el.toolbar, S.el.columns, S.el.kbd, S.el.live);
  S.root.replaceChildren(S.el.page);

  S.el.columns.addEventListener('focusin', (e) => { if (e.target.closest('.card')) S.el.kbd.hidden = false; });
  S.el.columns.addEventListener('focusout', () => setTimeout(() => {
    if (!S.kb && !S.el.columns.contains(document.activeElement)) S.el.kbd.hidden = true;
  }, 0));
  drawAll();
}

function drawAll() {
  if (!S.el.page?.isConnected) return;
  drawTop(); drawToolbar(); drawColumns();
}

function announce(text) { S.el.live.textContent = text; }

/* ---------------------------------------------------------------- header */
function drawTop() {
  const b = S.board;
  const title = h(`h1.board-title${isOwner() ? '.is-editable' : ''}`, {
    title: isOwner() ? 'Нажмите, чтобы переименовать' : null,
    onclick: () => isOwner() && renameBoard(title),
  }, b.name);
  const star = h(`button.star-btn${b.is_favorite ? '.is-on' : ''}`, {
    type: 'button', 'aria-pressed': String(b.is_favorite), 'aria-label': b.is_favorite ? 'Убрать из избранного' : 'Добавить в избранное',
    onclick: async () => {
      try { await api.favorite(b.id, !b.is_favorite); b.is_favorite = !b.is_favorite; drawTop(); } catch (e) { errorToast('Не удалось обновить', e.message); }
    },
  }, icon('star', 8, b.is_favorite));

  const members = b.members.map((m) => m.user);
  const stack = avatarStack(members, 28, 4);
  stack.setAttribute('role', 'button');
  stack.setAttribute('tabindex', '0');
  stack.setAttribute('aria-label', `Участники: ${members.map((u) => u.name).join(', ')}`);
  stack.addEventListener('click', () => openMembersModal(S.board, reloadAfterMembers));
  stack.addEventListener('keydown', (e) => { if (e.key === 'Enter') openMembersModal(S.board, reloadAfterMembers); });

  S.el.top.replaceChildren(
    h('div',
      h('div.crumbs', h('a', { href: '#/' }, 'Мои доски'), '  /  ', b.name),
      h('div.board-title-row', title, star)),
    h('div.board-actions',
      stack,
      h('button.btn.btn-secondary', { type: 'button', style: { width: '118px' }, onclick: () => openMembersModal(S.board, reloadAfterMembers) },
        icon('users'), 'Пригласить'),
      h('button.btn.btn-primary', { type: 'button', style: { width: '116px' }, disabled: !b.columns.length, onclick: () => newTask() },
        plusIcon(), 'Задача')));
}

async function reloadAfterMembers() { await reloadBoard(); refreshShell(); }

function renameBoard(titleEl) {
  const input = h('input.board-title-input', { value: S.board.name, 'aria-label': 'Название доски', maxlength: 100 });
  let done = false;
  const finish = async (save) => {
    if (done) return; done = true;
    const name = input.value.trim();
    if (save && name && name !== S.board.name) {
      try { await api.updateBoard(S.board.id, { name }); S.board.name = name; refreshShell(); } catch (e) { errorToast('Не удалось переименовать', e.message); }
    }
    drawTop();
  };
  input.addEventListener('keydown', (e) => { if (e.key === 'Enter') finish(true); if (e.key === 'Escape') { e.stopPropagation(); finish(false); } });
  input.addEventListener('blur', () => finish(true));
  titleEl.replaceWith(input);
  focusLater(input, true);
}

/* ---------------------------------------------------------------- toolbar / offline banner */
const DUE_FILTERS = { overdue: 'Просрочено', today: 'Сегодня', week: 'На этой неделе', none: 'Без срока' };
const filtersActive = () => S.filters.q.trim() || S.filters.assignee !== undefined || S.filters.priority || S.filters.due;

function drawToolbar() {
  if (!S.el.toolbar) return;
  if (!connection.online) {
    S.el.toolbar.replaceChildren(h('div.banner', { role: 'alert' },
      icon('cloudOff'),
      h('b', 'Нет соединения с сервером.'),
      h('span', `Изменения не сохраняются — повторное подключение через ${connection.countdown || 5} с…`),
      h('button.banner-action', { type: 'button', onclick: () => reconnectNow() }, 'Подключиться сейчас')));
    return;
  }
  const f = S.filters;
  const member = f.assignee ? S.board.members.find((m) => m.user.id === f.assignee) : null;
  const filterBtn = (label, setLabel, onOpen) => h(`button.filter-btn${setLabel ? '.is-set' : ''}`, {
    type: 'button', 'aria-haspopup': 'menu', onclick: (e) => onOpen(e.currentTarget),
  }, setLabel || label, icon('chev', 4, 1.6));

  const assigneeBtn = filterBtn('Исполнитель', f.assignee === null ? 'Без исполнителя' : member?.user.name, (a) => openMenu(a, [
    { label: 'Все исполнители', check: f.assignee === undefined, onSelect: () => setFilter('assignee', undefined) },
    { label: 'Мои задачи', check: f.assignee === store.userId, onSelect: () => setFilter('assignee', store.userId) },
    { sep: true },
    ...S.board.members.map((m) => ({ label: m.user.name, user: m.user, check: f.assignee === m.user.id, onSelect: () => setFilter('assignee', m.user.id) })),
    { label: 'Без исполнителя', emptyUser: true, check: f.assignee === null, onSelect: () => setFilter('assignee', null) },
  ], { width: 240 }));
  const PRS = { high: ['Высокий', '#C92A2A'], mid: ['Средний', '#E67700'], low: ['Низкий', '#087F5B'] };
  const priorityBtn = filterBtn('Приоритет', f.priority && PRS[f.priority][0], (a) => openMenu(a, [
    { label: 'Любой приоритет', check: !f.priority, onSelect: () => setFilter('priority', null) },
    { sep: true },
    ...Object.entries(PRS).map(([k, [label, color]]) => ({ label, dot: color, check: f.priority === k, onSelect: () => setFilter('priority', k) })),
  ], { width: 220 }));
  const dueBtn = filterBtn('Срок', f.due && DUE_FILTERS[f.due], (a) => openMenu(a, [
    { label: 'Любой срок', check: !f.due, onSelect: () => setFilter('due', null) },
    { sep: true },
    ...Object.entries(DUE_FILTERS).map(([k, label]) => ({ label, check: f.due === k, onSelect: () => setFilter('due', k) })),
  ], { width: 220 }));

  S.el.toolbar.replaceChildren(
    h('div.search.input-icon', icon('search', 14), S.search),
    assigneeBtn, priorityBtn, dueBtn,
    h(`button.reset-btn${filtersActive() ? '.is-on' : ''}`, {
      type: 'button', disabled: !filtersActive(),
      onclick: () => { S.filters = { q: '', assignee: undefined, priority: null, due: null }; S.search.value = ''; drawToolbar(); drawColumns(); },
    }, 'Сбросить'),
    h('div.spacer'),
    h('button.btn.btn-secondary', { type: 'button', style: { width: '148px' }, onclick: () => openColumnsModal(S.board, { reload: reloadBoard, deleteColumn: deleteColumnFlow }) },
      icon('gear', 15), 'Колонки'));
}

function setFilter(key, value) { S.filters[key] = value; drawToolbar(); drawColumns(); }

function matchesFilters(t) {
  const f = S.filters;
  const q = f.q.trim().toLowerCase();
  if (q && !t.title.toLowerCase().includes(q) && !t.key.toLowerCase().includes(q) && !(t.description || '').toLowerCase().includes(q)) return false;
  if (f.assignee !== undefined && (t.assignee?.id ?? null) !== f.assignee) return false;
  if (f.priority && t.priority !== f.priority) return false;
  if (f.due) {
    if (f.due === 'none') return !t.due_date;
    if (!t.due_date) return false;
    const n = daysBetween(today(), parseDate(t.due_date));
    if (f.due === 'overdue') return t.is_overdue;
    if (f.due === 'today') return n === 0;
    if (f.due === 'week') return n >= 0 && n <= 7;
  }
  return true;
}

/* ---------------------------------------------------------------- columns & cards */
function drawColumns() {
  if (!S.el.columns || !S.board) return;
  const focusedId = document.activeElement?.closest?.('.card')?.dataset.taskId;
  const cols = S.board.columns.map((c) => columnEl(c));
  if (!S.board.columns.length) {
    cols.push(h('div.board-empty',
      h('div.empty-title', 'На доске пока нет колонок'),
      h('div', { style: { color: 'var(--text-2)', fontSize: '13.5px', marginTop: '4px' } },
        isOwner() ? 'Добавьте первую колонку, например «Новые», «В работе» и «Готово».' : 'Попросите владельца доски добавить колонки.')));
  }
  if (isOwner()) {
    cols.push(h('button.add-column.dash-col', { type: 'button', 'aria-label': 'Добавить колонку', onclick: () => addColumn() },
      icon('plus', 7, 1.8), 'Колонка'));
  }
  S.el.columns.replaceChildren(...cols);
  if (focusedId) S.el.columns.querySelector(`.card[data-task-id="${focusedId}"]`)?.focus({ preventScroll: true });
}

function columnEl(col) {
  const all = tasksIn(col.id);
  const visible = all.filter(matchesFilters);
  const menuBtn = h('button.icon-btn', {
    type: 'button', 'aria-label': `Меню колонки «${col.name}»`, 'aria-haspopup': 'menu',
    onclick: (e) => columnMenu(e.currentTarget, col),
  }, icon('dots'));
  const nameEl = h('h2.col-name', { title: col.name }, col.name);
  const el = h('section.column', { dataset: { colId: col.id }, role: 'listitem', 'aria-label': `Колонка ${col.name}` },
    h('div.col-head',
      colDot(col.color),
      nameEl,
      h('span.pill.pill-count', { title: filtersActive() ? `Показано ${visible.length} из ${all.length}` : null },
        String(filtersActive() ? visible.length : all.length)),
      col.is_final ? h('span.pill.pill-final', { title: 'Задачи в этой колонке считаются завершёнными' }, 'финальная') : null,
      h('div.col-tools',
        h('button.icon-btn', { type: 'button', 'aria-label': `Добавить задачу в «${col.name}»`, onclick: () => newTask(col.id) }, icon('plus', 5, 1.6)),
        menuBtn)),
    h('div.cards', { dataset: { colId: col.id } }, visible.map((t) => cardEl(t, col))),
    h('button.add-task', { type: 'button', onclick: () => newTask(col.id) }, icon('plus', 5, 1.6), 'Добавить задачу'));
  el._nameEl = nameEl;
  return el;
}

function cardEl(t, col) {
  const err = S.errors.has(t.id);
  const mark = S.marks.get(t.id);
  const done = col.is_final;
  const cls = ['card', done && 'is-done', err && 'is-error', !err && mark, drawerTaskId() === t.id && 'is-active'].filter(Boolean).join('.');
  const menuBtn = h('button.card-menu-btn', {
    type: 'button', 'aria-label': 'Действия с задачей', 'aria-haspopup': 'menu', tabindex: '-1',
    onclick: (e) => { e.stopPropagation(); cardMenu(e.currentTarget, t); },
  }, icon('dots'));

  let topRight;
  if (err) topRight = h('span.pill.pill-danger', icon('warn', 5), 'Не сохранено');
  else if (done) topRight = h('span', { style: { display: 'flex' } }, h('span.card-done', { title: 'Задача завершена' }, icon('check', 0.85, 1.8)));
  else topRight = menuBtn;

  let due;
  if (!t.due_date) due = h('span.due-none', 'Без срока');
  else if (t.is_overdue) due = h('span.due-overdue', icon('calendar', 13), `${fmtShort(t.due_date)} · просрочено`);
  else due = h('span.due', icon('calendar', 13), fmtShort(t.due_date));

  const card = h(`article.${cls}`, {
    tabindex: '0', dataset: { taskId: t.id },
    'aria-label': `${t.title}. ${col.name}. Приоритет ${t.priority === 'high' ? 'высокий' : t.priority === 'mid' ? 'средний' : 'низкий'}${t.assignee ? `. Исполнитель ${t.assignee.name}` : ''}`,
    'aria-roledescription': 'карточка задачи',
  },
  h('div.card-top', priorityPill(t.priority), topRight),
  h('div.card-title', t.title),
  h('div.card-meta',
    due,
    t.comments_count ? h('span.comments', { title: pl(t.comments_count, 'комментарий', 'комментария', 'комментариев') }, icon('comment'), String(t.comments_count)) : null,
    avatar(t.assignee, 24)));

  if (done || err) { // keep the menu reachable on hover
    card.addEventListener('mouseenter', () => { if (!card.contains(menuBtn)) topRight.replaceWith(menuBtn); });
    card.addEventListener('mouseleave', () => { if (menuBtn.getAttribute('aria-expanded') !== 'true' && card.contains(menuBtn)) menuBtn.replaceWith(topRight); });
  }
  card.addEventListener('pointerdown', (e) => onPointerDown(e, t, card));
  card.addEventListener('keydown', (e) => onCardKey(e, t, card));
  card.addEventListener('contextmenu', (e) => { e.preventDefault(); cardMenu(menuBtn.isConnected ? menuBtn : card, t); });
  return card;
}

function newTask(columnId) {
  if (!S.board.columns.length) return;
  openTaskForm(S.board, {
    columnId,
    onCreated: async (task) => {
      await reloadBoard();
      refreshShell();
      mark(task.id, 'is-updated', 2500);
      S.el.columns.querySelector(`.card[data-task-id="${task.id}"]`)?.scrollIntoView({ block: 'nearest', inline: 'nearest', behavior: 'smooth' });
      snackbar(`Задача «${task.title}» создана`, { label: 'Открыть', onClick: () => navigate(`#/board/${S.boardId}/task/${task.id}`) });
    },
    onMembersChanged: reloadAfterMembers,
  });
}

function mark(taskId, cls, ms) {
  S.marks.set(taskId, cls);
  const el = S.el.columns?.querySelector(`.card[data-task-id="${taskId}"]`);
  el?.classList.add(cls);
  setTimeout(() => {
    if (S.marks.get(taskId) === cls) S.marks.delete(taskId);
    S.el.columns?.querySelector(`.card[data-task-id="${taskId}"]`)?.classList.remove(cls);
  }, ms);
}

/* ---------------------------------------------------------------- moving (shared by DnD, menu, keyboard, drawer) */
function localMove(tasks, taskId, colId, index) {
  const t = tasks.find((x) => x.id === taskId);
  const from = tasks.filter((x) => x.column_id === t.column_id && x.id !== taskId).sort((a, b) => a.position - b.position);
  from.forEach((x, i) => { x.position = i; });
  const to = tasks.filter((x) => x.column_id === colId && x.id !== taskId).sort((a, b) => a.position - b.position);
  to.splice(Math.max(0, Math.min(index, to.length)), 0, t);
  t.column_id = colId;
  to.forEach((x, i) => { x.position = i; });
  const col = colById(colId);
  t.is_done = !!col?.is_final;
  if (t.is_done) t.is_overdue = false;
}

export async function commitMove(taskId, colId, index, { silent = false } = {}) {
  const t = taskById(taskId);
  if (!t) return;
  const prevCol = colById(t.column_id);
  const prev = { colId: t.column_id, index: tasksIn(t.column_id).indexOf(t) };
  const target = colById(colId);
  const sameSpot = prev.colId === colId && prev.index === index;
  if (sameSpot && !S.errors.has(taskId)) { drawColumns(); return; }

  const snapshot = S.board.tasks.map((x) => ({ ...x }));
  localMove(S.board.tasks, taskId, colId, index);
  S.errors.delete(taskId);
  drawColumns();
  S.busy++;
  try {
    await api.moveTask(taskId, colId, index);
    S.busy--;
    if (!prevCol.is_final && target.is_final && !silent) {
      mark(taskId, 'is-moved', 3500);
      snackbar(`Задача «${t.title}» завершена`, {
        label: 'Отменить', onClick: () => commitMove(taskId, prev.colId, prev.index, { silent: true }),
      });
    }
    announce(`Задача «${t.title}» перемещена в «${target.name}», позиция ${index + 1}`);
    await reloadBoard();
    if (prevCol.id !== target.id) refreshShell();
    if (drawerTaskId() === taskId) refreshDrawer();
  } catch (e) {
    S.busy--;
    S.board.tasks = snapshot;
    S.errors.set(taskId, { colId, index });
    drawColumns();
    toast({
      kind: 'error', key: `move-${taskId}`, timeout: 12000,
      title: 'Не удалось переместить задачу',
      body: e.network ? `«${t.title}» возвращена в «${prevCol.name}», изменения не сохранены.` : e.message,
      action: { label: 'Повторить', onClick: () => commitMove(taskId, colId, index) },
    });
    if (S.pendingReload && !e.network) reloadBoard();
  }
}

/* ---------------------------------------------------------------- pointer drag & drop (screen 4) */
function onPointerDown(e, t, card) {
  if (e.button !== 0 || e.target.closest('button') || S.kb) return;
  const rect = card.getBoundingClientRect();
  const st = { t, card, startX: e.clientX, startY: e.clientY, dx: e.clientX - rect.left, dy: e.clientY - rect.top, started: false, pointerId: e.pointerId };
  const move = (ev) => onPointerMove(ev, st);
  const up = (ev) => { cleanup(); onPointerUp(ev, st); };
  const cancel = (ev) => { if (ev.key === 'Escape' && st.started) { ev.preventDefault(); cleanup(); endDrag(st, false); } };
  function cleanup() {
    window.removeEventListener('pointermove', move);
    window.removeEventListener('pointerup', up);
    window.removeEventListener('pointercancel', up);
    window.removeEventListener('keydown', cancel, true);
  }
  window.addEventListener('pointermove', move);
  window.addEventListener('pointerup', up);
  window.addEventListener('pointercancel', up);
  window.addEventListener('keydown', cancel, true);
}

function onPointerMove(e, st) {
  if (!st.started) {
    if (Math.hypot(e.clientX - st.startX, e.clientY - st.startY) < 5) return;
    startDrag(st);
  }
  st.ghost.style.left = `${e.clientX - st.dx}px`;
  st.ghost.style.top = `${e.clientY - st.dy}px`;
  updateDrop(st, e.clientX, e.clientY);
  autoScroll(e.clientX);
}

function startDrag(st) {
  st.started = true;
  closeMenus();
  const r = st.card.getBoundingClientRect();
  st.height = r.height;
  st.ghost = st.card.cloneNode(true);
  st.ghost.classList.remove('is-error', 'is-updated', 'is-moved', 'is-active');
  st.ghost.classList.add('card-ghost');
  st.ghost.removeAttribute('tabindex');
  st.ghost.setAttribute('aria-hidden', 'true');
  document.body.append(st.ghost);
  st.source = h('div.source-slot.dash-slot', { style: { height: `${r.height}px` } }, 'Исходное место задачи');
  st.card.replaceWith(st.source);
  st.drop = h('div.drop-slot.dash-drop', { style: { height: `${r.height}px` } }, h('span.slot-label'));
  S.drag = st;
  S.el.columns.classList.add('is-dragging');
  document.body.classList.add('is-grabbing');
}

function updateDrop(st, x, y) {
  const columns = [...S.el.columns.querySelectorAll('.column')];
  let colEl = columns.find((c) => { const r = c.getBoundingClientRect(); return x >= r.left - 8 && x <= r.right + 8; });
  if (!colEl) {
    colEl = columns.reduce((best, c) => {
      const r = c.getBoundingClientRect(); const d = Math.min(Math.abs(x - r.left), Math.abs(x - r.right));
      return !best || d < best.d ? { c, d } : best;
    }, null)?.c;
  }
  if (!colEl) return;
  columns.forEach((c) => c.classList.toggle('is-target', c === colEl));
  const list = colEl.querySelector('.cards');
  const cards = [...list.querySelectorAll('.card')];
  let before = null;
  for (const c of cards) {
    const r = c.getBoundingClientRect();
    if (y < r.top + r.height / 2) { before = c; break; }
  }
  if (before) list.insertBefore(st.drop, before);
  else list.append(st.drop);

  const colId = Number(colEl.dataset.colId);
  const ids = tasksIn(colId).filter((t) => t.id !== st.t.id).map((t) => t.id);
  const index = before ? ids.indexOf(Number(before.dataset.taskId)) : ids.length;
  st.target = { colId, index: Math.max(0, index) };
  st.drop.firstChild.textContent = `Задача встанет сюда (позиция ${st.target.index + 1})`;
}

function autoScroll(x) {
  const main = S.root.closest('.main') || S.root;
  const r = main.getBoundingClientRect();
  if (x > r.right - 60) main.scrollLeft += 14;
  else if (x < r.left + 60) main.scrollLeft -= 14;
}

function endDrag(st, commit) {
  st.ghost?.remove();
  st.drop?.remove();
  S.el.columns.classList.remove('is-dragging');
  S.el.columns.querySelectorAll('.column.is-target').forEach((c) => c.classList.remove('is-target'));
  document.body.classList.remove('is-grabbing');
  S.drag = null;
  if (commit && st.target) {
    commitMove(st.t.id, st.target.colId, st.target.index);
  } else {
    drawColumns();
    if (S.pendingReload) reloadBoard();
  }
}

function onPointerUp(e, st) {
  if (st.started) { endDrag(st, true); return; }
  if (e.target.closest('button')) return;
  navigate(`#/board/${S.boardId}/task/${st.t.id}`);
}

/* ---------------------------------------------------------------- keyboard (А4) */
function onCardKey(e, t, card) {
  if (S.kb && S.kb.taskId === t.id) { kbPicked(e, card); return; }
  if (e.key === 'Enter') { e.preventDefault(); navigate(`#/board/${S.boardId}/task/${t.id}`); return; }
  if (e.key === ' ' || e.key === 'Spacebar') {
    e.preventDefault();
    const idx = tasksIn(t.column_id).indexOf(t);
    S.kb = { taskId: t.id, origCol: t.column_id, origIndex: idx, colId: t.column_id, index: idx };
    card.classList.add('is-picked');
    S.el.kbd.hidden = false;
    announce(`Задача «${t.title}» взята. Стрелки — переместить, пробел — положить, Esc — отменить.`);
    return;
  }
  if (e.altKey && (e.key === 'ArrowUp' || e.key === 'ArrowDown')) {
    e.preventDefault();
    const idx = tasksIn(t.column_id).indexOf(t);
    const next = e.key === 'ArrowUp' ? idx - 1 : idx + 1;
    if (next >= 0 && next < tasksIn(t.column_id).length) commitMove(t.id, t.column_id, next);
    return;
  }
  if (e.key === 'ContextMenu' || (e.shiftKey && e.key === 'F10')) {
    e.preventDefault();
    cardMenu(card.querySelector('.card-menu-btn') || card, t);
    return;
  }
  if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.key)) { // roam between cards
    e.preventDefault();
    const cols = [...S.el.columns.querySelectorAll('.cards')];
    const ci = cols.indexOf(card.parentElement);
    const inCol = [...card.parentElement.querySelectorAll('.card')];
    const ri = inCol.indexOf(card);
    let target = null;
    if (e.key === 'ArrowUp') target = inCol[ri - 1];
    if (e.key === 'ArrowDown') target = inCol[ri + 1];
    if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
      for (let k = ci + (e.key === 'ArrowLeft' ? -1 : 1); k >= 0 && k < cols.length; k += (e.key === 'ArrowLeft' ? -1 : 1)) {
        const cs = cols[k].querySelectorAll('.card');
        if (cs.length) { target = cs[Math.min(ri, cs.length - 1)]; break; }
      }
    }
    target?.focus();
  }
}

function kbPicked(e, card) {
  const kb = S.kb;
  const t = taskById(kb.taskId);
  const colIds = S.board.columns.map((c) => c.id);
  const others = (colId) => tasksIn(colId).filter((x) => x.id !== kb.taskId);
  if (e.key === 'Escape') {
    e.preventDefault(); e.stopPropagation();
    S.kb = null; drawColumns();
    S.el.columns.querySelector(`.card[data-task-id="${t.id}"]`)?.focus();
    announce('Перемещение отменено');
    if (S.pendingReload) reloadBoard();
    return;
  }
  if (e.key === ' ' || e.key === 'Spacebar' || e.key === 'Enter') {
    e.preventDefault();
    S.kb = null;
    card.classList.remove('is-picked');
    if (kb.colId === kb.origCol && kb.index === kb.origIndex) { drawColumns(); announce('Задача осталась на месте'); return; }
    commitMove(t.id, kb.colId, kb.index).then(() => S.el.columns.querySelector(`.card[data-task-id="${t.id}"]`)?.focus());
    return;
  }
  let { colId, index } = kb;
  if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
    const ci = colIds.indexOf(colId) + (e.key === 'ArrowLeft' ? -1 : 1);
    if (ci < 0 || ci >= colIds.length) return;
    colId = colIds[ci];
    index = Math.min(index, others(colId).length);
  } else if (e.key === 'ArrowUp') index = Math.max(0, index - 1);
  else if (e.key === 'ArrowDown') index = Math.min(others(colId).length, index + 1);
  else return;
  e.preventDefault();
  kb.colId = colId; kb.index = index;
  // preview: physically move the card element
  const list = S.el.columns.querySelector(`.cards[data-col-id="${colId}"]`);
  const siblings = [...list.querySelectorAll('.card')].filter((c) => c !== card);
  list.insertBefore(card, siblings[index] || null);
  S.el.columns.querySelectorAll('.column').forEach((c) => c.classList.toggle('is-target', Number(c.dataset.colId) === colId && colId !== kb.origCol));
  card.focus();
  card.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  announce(`${colById(colId).name}, позиция ${index + 1}`);
}

/* ---------------------------------------------------------------- card menu (А4) */
function cardMenu(anchor, t) {
  const cardNode = anchor.closest?.('.card');
  cardNode?.classList.add('is-active');
  const inCol = tasksIn(t.column_id);
  const idx = inCol.indexOf(t);
  openMenu(anchor, [
    { label: 'Открыть задачу', onSelect: () => navigate(`#/board/${S.boardId}/task/${t.id}`) },
    {
      label: 'Переместить в', subTitle: 'Колонка', subWidth: 240,
      sub: () => S.board.columns.map((c) => {
        const cur = c.id === t.column_id;
        return {
          label: c.name, dot: c.color, kind: cur ? 'muted' : null, tag: cur ? 'текущая' : (c.is_final ? 'финальная' : null), check: cur,
          onSelect: () => { if (!cur) commitMove(t.id, c.id, tasksIn(c.id).length); },
        };
      }),
    },
    {
      label: 'Назначить исполнителя', subWidth: 250,
      sub: () => [
        ...S.board.members.map((m) => ({ label: m.user.name, user: m.user, check: t.assignee?.id === m.user.id, onSelect: () => assign(t, m.user.id) })),
        { sep: true },
        { label: 'Не назначен', emptyUser: true, check: !t.assignee, onSelect: () => assign(t, null) },
      ],
    },
    { sep: true },
    { label: 'Поднять выше', kbd: 'Alt ↑', disabled: idx <= 0, onSelect: () => commitMove(t.id, t.column_id, idx - 1) },
    { label: 'Опустить ниже', kbd: 'Alt ↓', disabled: idx >= inCol.length - 1, onSelect: () => commitMove(t.id, t.column_id, idx + 1) },
    { label: 'В начало колонки', disabled: idx <= 0, onSelect: () => commitMove(t.id, t.column_id, 0) },
    { sep: true },
    { label: 'Удалить задачу', kind: 'danger', onSelect: () => deleteTask(t) },
  ], { width: 250, onClose: () => { if (drawerTaskId() !== t.id) cardNode?.classList.remove('is-active'); } });
}

async function assign(t, userId) {
  if ((t.assignee?.id ?? null) === userId) return;
  try {
    await api.updateTask(t.id, { assignee_id: userId });
    await reloadBoard();
    refreshShell();
  } catch (e) { errorToast('Не удалось назначить исполнителя', e.message); }
}

export async function deleteTask(t) {
  const ok = await confirmDialog({
    title: `Удалить задачу «${t.title}»?`,
    text: 'Задача, её комментарии и история изменений будут удалены без возможности восстановления.',
    confirm: 'Удалить задачу',
  });
  if (!ok) return false;
  try {
    await api.deleteTask(t.id);
    if (drawerTaskId() === t.id) navigate(`#/board/${S.boardId}`);
    await reloadBoard();
    refreshShell();
    snackbar(`Задача «${t.title}» удалена`);
    return true;
  } catch (e) { errorToast('Не удалось удалить задачу', e.message); return false; }
}

/* ---------------------------------------------------------------- column menu & deletion (А3) */
function columnMenu(anchor, col) {
  const idx = S.board.columns.indexOf(col);
  const last = S.board.columns.length - 1;
  const owner = isOwner();
  const items = [
    { label: 'Переименовать', disabled: !owner, onSelect: () => renameColumn(col) },
    { label: 'Сдвинуть влево', disabled: !owner || idx === 0, onSelect: () => shiftColumn(col, -1) },
    { label: 'Сдвинуть вправо', disabled: !owner || idx === last, onSelect: () => shiftColumn(col, 1) },
    col.is_final
      ? { label: 'Финальная колонка', disabled: true, check: true }
      : { label: 'Сделать финальной', disabled: !owner, onSelect: () => makeFinal(col) },
    { sep: true },
    { label: 'Удалить колонку', kind: 'danger', disabled: !owner, onSelect: () => deleteColumnFlow(col) },
  ];
  openMenu(anchor, items, { width: 280, align: 'left', title: owner ? null : 'Меняет только владелец' });
}

async function columnAction(fn, errTitle) {
  try { await fn(); await reloadBoard(); refreshShell(); } catch (e) { errorToast(errTitle, e.message); }
}

function renameColumn(col) {
  const colEl = S.el.columns.querySelector(`.column[data-col-id="${col.id}"]`);
  const nameEl = colEl?._nameEl;
  if (!nameEl) return;
  const input = h('input.col-name-input', { value: col.name, maxlength: 60, 'aria-label': 'Название колонки' });
  let done = false;
  const finish = (save) => {
    if (done) return; done = true;
    const name = input.value.trim();
    if (save && name && name !== col.name) columnAction(() => api.updateColumn(col.id, { name }), 'Не удалось переименовать колонку');
    else drawColumns();
  };
  input.addEventListener('keydown', (e) => { if (e.key === 'Enter') finish(true); if (e.key === 'Escape') { e.stopPropagation(); finish(false); } });
  input.addEventListener('blur', () => finish(true));
  nameEl.replaceWith(input);
  focusLater(input, true);
}

function shiftColumn(col, dir) {
  const ids = S.board.columns.map((c) => c.id);
  const i = ids.indexOf(col.id);
  [ids[i], ids[i + dir]] = [ids[i + dir], ids[i]];
  columnAction(() => api.reorderColumns(S.board.id, ids), 'Не удалось изменить порядок');
}

function makeFinal(col) { columnAction(() => api.updateColumn(col.id, { is_final: true }), 'Не удалось изменить колонку'); }

async function addColumn() {
  // a new column goes right before the final one, so «Готово» stays last
  const finalIdx = S.board.columns.findIndex((c) => c.is_final);
  const position = finalIdx >= 0 ? finalIdx : S.board.columns.length;
  const input = h('input.input', { placeholder: 'Например: Тестирование', maxlength: 60, 'aria-label': 'Название колонки' });
  const err = h('div');
  const submit = async () => {
    const name = input.value.trim();
    if (!name) { err.replaceChildren(h('div.field-error', h('span.err-dot', '!'), 'Введите название колонки')); input.classList.add('is-error'); return; }
    try { await api.createColumn(S.board.id, { name, position }); m.close(); await reloadBoard(); refreshShell(); } catch (e) { errorToast('Не удалось добавить колонку', e.message); }
  };
  input.addEventListener('keydown', (e) => { if (e.key === 'Enter') submit(); });
  input.addEventListener('input', () => { input.classList.remove('is-error'); err.replaceChildren(); });
  const m = openModal({
    title: 'Новая колонка', width: 440,
    body: h('div.modal-body', h('label.label', 'Название', h('span.req', '*')), input, err),
    foot: [h('span.hint', finalIdx >= 0 ? 'Колонка встанет перед финальной' : 'Колонка встанет в конец доски'),
      h('button.btn.btn-secondary.btn-lg', { type: 'button', style: { width: '96px' }, onclick: () => m.close() }, 'Отмена'),
      h('button.btn.btn-primary.btn-lg', { type: 'button', onclick: submit }, 'Добавить')],
  });
}

export function deleteColumnFlow(col, { onDone } = {}) {
  const tasks = tasksIn(col.id);
  const after = async () => { await reloadBoard(); refreshShell(); onDone?.(); };
  if (S.board.columns.length === 1) { errorToast('Нельзя удалить колонку', 'На доске должна остаться хотя бы одна колонка.'); return; }
  if (!tasks.length) {
    confirmDialog({ title: `Удалить колонку «${col.name}»?`, text: 'Колонка пустая — задачи не пострадают.', confirm: 'Удалить колонку' })
      .then((ok) => ok && api.deleteColumn(col.id, 'move').then(after).catch((e) => errorToast('Не удалось удалить колонку', e.message)));
    return;
  }
  const others = S.board.columns.filter((c) => c.id !== col.id);
  let strategy = 'move';
  const ci = S.board.columns.indexOf(col);
  // by default tasks go to the previous column (as in the mockup: «На проверке» → «В работе»)
  let targetId = (S.board.columns[ci - 1] || S.board.columns[ci + 1]).id;
  const optsEl = h('div');
  const confirmBtn = h('button.btn.btn-danger.btn-lg', { type: 'button', style: { width: '200px' } });
  let m;

  const draw = () => {
    const target = colById(targetId);
    const selectBtn = h('button.select.input-md', {
      type: 'button', style: { width: '250px', marginTop: '10px' }, 'aria-haspopup': 'menu', 'aria-label': 'Колонка для задач',
      onclick: (e) => { e.stopPropagation(); openMenu(e.currentTarget, others.map((c) => ({ label: c.name, dot: c.color, check: c.id === targetId, tag: c.is_final ? 'финальная' : null, onSelect: () => { targetId = c.id; draw(); } })), { width: 250 }); },
    }, h('span.select-value', h('span.select-dot', { style: { background: target.color } }), h('span.truncate', target.name)), h('span.select-chev', icon('chev', 4.5, 1.6)));

    const opt1 = h(`div.option${strategy === 'move' ? '.is-on' : ''}`, {
      role: 'radio', tabindex: '0', 'aria-checked': String(strategy === 'move'),
      style: strategy === 'move' ? { paddingBottom: '27px' } : null,
      onclick: () => { strategy = 'move'; draw(); }, onkeydown: (e) => { if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); strategy = 'move'; draw(); } },
    },
    h(`span.radio${strategy === 'move' ? '.is-on' : ''}`),
    h('div.option-title', 'Перенести задачи в другую колонку'),
    h('div.option-sub', 'Задачи сохранят историю и окажутся в конце колонки'),
    strategy === 'move' ? [
      selectBtn,
      h('ul', { style: { marginTop: '7px' } }, tasks.slice(0, 5).map((t) => h('li', { style: { display: 'flex', alignItems: 'center', gap: '10px', height: '24px', fontSize: '13px', fontWeight: '500', paddingLeft: '2px' } },
        h('span', { style: { width: '6px', height: '6px', borderRadius: '1.5px', background: 'var(--text-3)', flex: '0 0 auto' } }), h('span.truncate', t.title))),
      tasks.length > 5 ? h('li', { style: { fontSize: '12.5px', color: 'var(--text-3)', paddingLeft: '18px', height: '24px', lineHeight: '24px' } }, `и ещё ${pl(tasks.length - 5, 'задача', 'задачи', 'задач')}`) : null),
    ] : null);
    const opt2 = h(`div.option${strategy === 'delete' ? '.is-on' : ''}`, {
      role: 'radio', tabindex: '0', 'aria-checked': String(strategy === 'delete'), style: { paddingBottom: '14px' },
      onclick: () => { strategy = 'delete'; draw(); }, onkeydown: (e) => { if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); strategy = 'delete'; draw(); } },
    },
    h(`span.radio${strategy === 'delete' ? '.is-on' : ''}`),
    h('div.option-title', 'Удалить колонку вместе с задачами'),
    h('div.option-sub', 'Только для владельца доски · действие необратимо'));
    optsEl.replaceChildren(h('div', { role: 'radiogroup', 'aria-label': 'Что сделать с задачами' }, opt1, opt2));
    confirmBtn.textContent = strategy === 'move' ? 'Перенести и удалить' : 'Удалить с задачами';
  };

  confirmBtn.addEventListener('click', async () => {
    confirmBtn.disabled = true;
    try {
      await api.deleteColumn(col.id, strategy, strategy === 'move' ? targetId : null);
      m.close();
      snackbar(strategy === 'move'
        ? `Колонка «${col.name}» удалена, задачи перенесены в «${colById(targetId).name}»`
        : `Колонка «${col.name}» удалена вместе с задачами`);
      await after();
    } catch (e) {
      confirmBtn.disabled = false;
      errorToast('Не удалось удалить колонку', e.message);
    }
  });

  draw();
  m = openModal({
    width: 540, label: `Удалить колонку «${col.name}»?`,
    body: [
      h('button.modal-close.dialog-close', { type: 'button', 'aria-label': 'Закрыть', onclick: () => m.close() }, icon('close', 6, 1.6)),
      h('div.dialog-head',
        h('div.dialog-icon', icon('warn', 9)),
        h('div', h('div.dialog-title', `Удалить колонку «${col.name}»?`),
          h('div.dialog-sub', `В колонке ${pl(tasks.length, 'задача', 'задачи', 'задач')}. Выберите, что с ними сделать.`))),
      h('div.dialog-body', optsEl),
      h('div.dialog-foot',
        h('button.btn.btn-secondary.btn-lg', { type: 'button', style: { width: '96px' }, onclick: () => m.close() }, 'Отмена'),
        confirmBtn),
    ],
  });
}

/* ---------------------------------------------------------------- live updates (А6) */
function onLiveEvent(ev) {
  if (ev.type === 'reconnected') { reloadBoard(); refreshShell(); return; }
  if (ev.origin === CLIENT_ID) return; // our own change, already applied
  const fromOther = ev.actor?.id !== store.userId;
  if (ev.type === 'board.deleted') {
    toast({ kind: 'info', title: 'Доска удалена', body: ev.message });
    refreshShell();
    navigate('#/');
    return;
  }
  if (ev.type === 'members.changed' && ev.removed_user_id === store.userId) {
    toast({ kind: 'info', title: 'Вас исключили из доски', body: ev.message });
    refreshShell();
    navigate('#/');
    return;
  }
  if (fromOther && ev.type !== 'comment.created') {
    toast({ kind: 'info', title: 'Доска обновлена', body: ev.message, key: 'board-updated' });
  }
  if (ev.task_id && ev.type !== 'task.deleted' && fromOther) S.marks.set(ev.task_id, 'is-updated');
  reloadBoard().then(() => {
    if (ev.task_id && fromOther && ev.type !== 'task.deleted') mark(ev.task_id, 'is-updated', 4000);
  });
  if (['board.updated', 'members.changed', 'task.moved', 'task.updated', 'task.created', 'task.deleted', 'columns.changed'].includes(ev.type)) refreshShell();
  if (drawerTaskId() && ev.task_id === drawerTaskId()) {
    if (ev.type === 'task.deleted') {
      toast({ kind: 'info', title: 'Задача удалена', body: ev.message });
      navigate(`#/board/${S.boardId}`);
    } else refreshDrawer();
  }
}

