/* Screen 1 — «Мои доски»: board cards, create card, «Назначено мне» */
import { h, pl, fmtAgo, fmtShort } from '../utils.js';
import { icon } from '../icons.js';
import { avatarStack, priorityPill, plusIcon } from '../ui/components.js';
import { errorToast } from '../ui/toast.js';
import { api } from '../api.js';
import { store } from '../store.js';
import { openBoardForm } from './board-form.js';
import { navigate } from '../main.js';

const TABS = [
  { key: 'all', label: 'Все доски' },
  { key: 'favorites', label: 'Избранные' },
  { key: 'archived', label: 'Архив' },
];
let tab = 'all';

export async function renderBoards(root) {
  const [boards, mine] = await Promise.all([api.boards(tab), api.myTasks()]);
  if (store.route.name !== 'boards') return;
  const total = tab === 'all' ? boards.length : store.boards.length;

  const head = h('div.page-head',
    h('div',
      h('h1.page-title', 'Мои доски'),
      h('div.page-sub', `${pl(total, 'доска', 'доски', 'досок')} · ${store.workspace.name}`)),
    h('button.btn.btn-primary.btn-lg', { type: 'button', style: { width: '160px' }, onclick: () => openBoardForm() },
      plusIcon(), 'Новая доска'));

  const tabs = h('div.tabs', { role: 'tablist' }, TABS.map((t) => h(`button.tab${t.key === tab ? '.is-active' : ''}`, {
    type: 'button', role: 'tab', 'aria-selected': String(t.key === tab),
    onclick: () => { tab = t.key; renderBoards(root); },
  }, t.label)));

  const grid = h('div.board-grid', boards.map((b) => boardCard(b, root)));
  if (tab === 'all') {
    grid.append(h('button.create-card.dash-strong', { type: 'button', onclick: () => openBoardForm() },
      h('span.plus-circle', icon('plus', 7, 2)),
      h('span.cc-title', 'Создать доску'),
      h('span.cc-sub', 'Из шаблона или с пустыми колонками')));
  } else if (!boards.length) {
    grid.append(h('div.empty', { style: { gridColumn: '1 / -1' } },
      h('div.empty-title', tab === 'favorites' ? 'Нет избранных досок' : 'Архив пуст'),
      tab === 'favorites' ? 'Отметьте доску звёздочкой, чтобы она появилась здесь.' : 'Архивированные доски будут храниться здесь.'));
  }

  root.replaceChildren(h('div.page', head, tabs, grid, assignedSection(mine)));
}

function boardCard(b, root) {
  const total = b.task_count;
  const star = h(`button.bc-star${b.is_favorite ? '.is-on' : ''}`, {
    type: 'button', 'aria-label': b.is_favorite ? 'Убрать из избранного' : 'В избранное', 'aria-pressed': String(b.is_favorite),
    onclick: async (e) => {
      e.stopPropagation();
      try { await api.favorite(b.id, !b.is_favorite); await renderBoards(root); } catch (err) { errorToast('Не удалось обновить', err.message); }
    },
  }, icon('star', 8, b.is_favorite));

  const bar = h('div.bc-bar', { 'aria-hidden': 'true' });
  for (const c of b.columns) {
    if (!c.task_count) continue;
    bar.append(h('span', { style: { width: `${(c.task_count / total) * 100}%`, background: c.color } }));
  }

  return h('div.board-card', {
    role: 'link', tabindex: '0', 'aria-label': b.name,
    onclick: () => navigate(`#/board/${b.id}`),
    onkeydown: (e) => { if (e.key === 'Enter') navigate(`#/board/${b.id}`); },
  },
  h('div.bc-head',
    h('div.bc-icon', { style: { background: b.color } }, b.name.trim()[0]?.toUpperCase() || '?'),
    h('div.truncate', { style: { paddingRight: '28px' } },
      h('div.bc-name.truncate', b.name),
      h('div.bc-upd', `Обновлено ${fmtAgo(b.updated_at)}`))),
  star,
  h('div.bc-desc.truncate', b.description || ''),
  bar,
  h('div.bc-stats', `${pl(total, 'задача', 'задачи', 'задач')} · ${b.done_count} выполнено · ${pl(b.columns.length, 'колонка', 'колонки', 'колонок')}`),
  h('div.bc-foot', h('span.lbl', 'Участники'), avatarStack(b.members, 26, 4)));
}

function assignedSection(rows) {
  const n = rows.length;
  const head = h('div.section-head', h('h2.section-title', 'Назначено мне'), h('span.section-sub', pl(n, 'задача', 'задачи', 'задач')));
  return [head, myTasksTable(rows)];
}

export function myTasksTable(rows) {
  if (!rows.length) {
    return h('div.table-card', h('div.empty', h('div.empty-title', 'Нет активных задач'), 'Задачи, назначенные на вас, появятся здесь.'));
  }
  return h('div.table-card', h('table.table',
    h('colgroup', h('col', { style: { width: '360px' } }), h('col', { style: { width: '220px' } }),
      h('col', { style: { width: '140px' } }), h('col', { style: { width: '230px' } }), h('col')),
    h('thead', h('tr', ['Задача', 'Доска', 'Колонка', 'Срок', 'Приоритет'].map((t) => h('th', t)))),
    h('tbody', rows.map(({ task: t, board, column }) => h('tr.is-link', {
      tabindex: '0', onclick: () => navigate(`#/board/${board.id}/task/${t.id}`),
      onkeydown: (e) => { if (e.key === 'Enter') navigate(`#/board/${board.id}/task/${t.id}`); },
    },
    h('td.t-title', h('div.truncate', { style: { maxWidth: '340px' } }, t.title)),
    h('td.t-muted', h('div.truncate', { style: { maxWidth: '200px' } }, board.name)),
    h('td', h('span.t-col', h('i', { style: { background: column.color } }), column.name)),
    h('td', t.due_date
      ? h(`span.t-due${t.is_overdue ? '.is-overdue' : ''}`, icon('calendar', 13), `${fmtShort(t.due_date)}${t.is_overdue ? ' · просрочено' : ''}`)
      : h('span.t-due', 'Без срока')),
    h('td', priorityPill(t.priority)))))));
}

export function resetBoardsTab() { tab = 'all'; }
