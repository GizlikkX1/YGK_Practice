/* Screen 5 — task panel: details, editable fields, comments, «История изменений» */
import { h, fmtLong, fmtShort, fmtWhen, fmtStamp, relDue, todayISO, verb, focusLater, PRIORITY } from '../utils.js';
import { icon } from '../icons.js';
import { avatar, emptyAvatar, priorityPill, errorLine } from '../ui/components.js';
import { openMenu, closeMenus } from '../ui/menu.js';
import { openAssigneePicker, closePicker } from '../ui/picker.js';
import { errorToast, snackbar } from '../ui/toast.js';
import { api } from '../api.js';
import { store } from '../store.js';

let D = null;

export const drawerTaskId = () => D?.taskId ?? null;

export async function openTaskDrawer(taskId, ctx) {
  if (D && D.taskId === taskId) { refreshDrawer(); return; }
  closeTaskDrawer(false);
  const overlay = h('div.drawer-overlay', { onclick: () => ctx.close() });
  const panel = h('aside.drawer', { role: 'dialog', 'aria-modal': 'true', 'aria-label': 'Карточка задачи', tabindex: '-1' });
  D = { taskId, ctx, overlay, panel, tab: 'history', task: null, history: [], comments: [], editing: null, prevFocus: document.activeElement };
  document.body.append(overlay, panel);
  document.addEventListener('keydown', onKey);
  setActiveCard(taskId, true);
  D.task = ctx.board.tasks.find((t) => t.id === taskId) || null;
  if (D.task) render();
  else panel.append(h('div.loading', h('div.spinner')));
  await refreshDrawer();
  panel.focus({ preventScroll: true });
}

export function closeTaskDrawer(navigateBack = true) {
  if (!D) return;
  const { overlay, panel, ctx, taskId, prevFocus } = D;
  closeMenus(); closePicker();
  overlay.remove(); panel.remove();
  document.removeEventListener('keydown', onKey);
  setActiveCard(taskId, false);
  D = null;
  if (navigateBack) ctx.close();
  const card = document.querySelector(`.card[data-task-id="${taskId}"]`);
  (card || (prevFocus && document.contains(prevFocus) ? prevFocus : null))?.focus?.({ preventScroll: true });
}

function setActiveCard(taskId, on) {
  document.querySelector(`.card[data-task-id="${taskId}"]`)?.classList.toggle('is-active', on);
}

function onKey(e) {
  if (e.key !== 'Escape' || !D) return;
  if (document.querySelector('.menu, .picker, .overlay')) return;
  if (D.editing) return; // inline editors handle Esc themselves
  e.preventDefault();
  closeTaskDrawer(true);
}

export async function refreshDrawer() {
  if (!D) return;
  const id = D.taskId;
  try {
    const [task, history, comments] = await Promise.all([api.task(id), api.history(id), api.comments(id)]);
    if (!D || D.taskId !== id) return;
    Object.assign(D, { task, history, comments });
    if (!D.editing) render();
  } catch (e) {
    if (!D) return;
    if (e.status === 404) { errorToast('Задача не найдена', 'Возможно, её удалили.'); closeTaskDrawer(true); return; }
    if (!D.task) D.panel.replaceChildren(h('div.empty', h('div.empty-title', 'Не удалось загрузить задачу'), e.message));
  }
}

async function update(patch, errTitle = 'Не удалось сохранить') {
  try {
    D.task = await api.updateTask(D.taskId, patch);
    await D.ctx.reload();
    await refreshDrawer();
    return true;
  } catch (e) {
    errorToast(errTitle, e.message);
    return false;
  }
}

/* ---------------------------------------------------------------- render */
function render() {
  if (!D?.task) return;
  const t = D.task;
  const board = D.ctx.board;
  const col = board.columns.find((c) => c.id === t.column_id) || { name: '—', color: '#868E96' };
  D.panel.setAttribute('aria-label', `Задача ${t.key}: ${t.title}`);

  const columnMenu = (anchor) => openMenu(anchor, board.columns.map((c) => ({
    label: c.name, dot: c.color, check: c.id === t.column_id, tag: c.is_final ? 'финальная' : null,
    onSelect: async () => {
      if (c.id === t.column_id) return;
      const end = board.tasks.filter((x) => x.column_id === c.id && x.id !== t.id).length;
      await D.ctx.move(t.id, c.id, end);
      refreshDrawer();
    },
  })), { width: 240, title: 'Колонка' });

  const statusBtn = h('button.status-btn', { type: 'button', 'aria-haspopup': 'menu', 'aria-label': `Колонка: ${col.name}`, onclick: (e) => columnMenu(e.currentTarget) },
    h('i', { style: { background: col.color } }), col.name, icon('chev', 4, 1.6));

  const bar = h('div.drawer-bar',
    statusBtn,
    h('span.drawer-key', t.key),
    h('div.bar-right',
      h('button.icon-btn', {
        type: 'button', 'aria-label': 'Действия', 'aria-haspopup': 'menu',
        onclick: (e) => openMenu(e.currentTarget, [
          { label: 'Скопировать ссылку', onSelect: () => copyLink(t) },
          { sep: true },
          { label: 'Удалить задачу', kind: 'danger', onSelect: () => D.ctx.deleteTask(t) },
        ], { width: 220, align: 'right' }),
      }, icon('dots')),
      h('button.icon-btn', { type: 'button', 'aria-label': 'Закрыть', onclick: () => closeTaskDrawer(true) }, icon('close', 6, 1.6))));

  const body = h('div.drawer-body',
    titleBlock(t),
    h('div.props', { role: 'list' },
      prop('Колонка', h('button.prop-value', { type: 'button', 'aria-haspopup': 'menu', onclick: (e) => columnMenu(e.currentTarget) },
        h('span.col-dot', { style: { background: col.color } }), col.name, h('span.ic.chev', icon('chev', 4, 1.6)))),
      prop('Исполнитель', assigneeValue(t, board)),
      prop('Срок', ...dueValue(t)),
      prop('Приоритет', h('button.prop-value', {
        type: 'button', 'aria-haspopup': 'menu', 'aria-label': `Приоритет: ${PRIORITY[t.priority].label}`,
        onclick: (e) => openMenu(e.currentTarget, [['high', '#C92A2A'], ['mid', '#E67700'], ['low', '#087F5B']].map(([k, color]) => ({
          label: PRIORITY[k].label, dot: color, check: t.priority === k, onSelect: () => k !== t.priority && update({ priority: k }),
        })), { width: 200 }),
      }, priorityPill(t.priority))),
      prop('Автор', h('div.prop-value', avatar(t.author, 22), `${t.author.name} · ${fmtStamp(t.created_at)}`))),
    descBlock(t),
    tabs(),
    D.tab === 'history' ? timeline() : commentsBlock());

  D.panel.replaceChildren(bar, h('div.drawer-scroll', body));
}

function prop(label, ...value) {
  return h('div.prop', { role: 'listitem' }, h('span.prop-label', label), ...value);
}

function titleBlock(t) {
  if (D.editing === 'title') {
    const ta = h('textarea.d-title-input', { rows: 1, maxlength: 200, 'aria-label': 'Название задачи' });
    ta.value = t.title;
    const err = h('div.d-title-error');
    const fit = () => { ta.style.height = 'auto'; ta.style.height = `${ta.scrollHeight + 2}px`; };
    let done = false;
    const finish = async (save) => {
      if (done) return;
      const v = ta.value.trim();
      if (save && !v) { err.replaceChildren(errorLine('Введите название задачи')); ta.focus(); return; }
      done = true;
      D.editing = null;
      if (save && v !== t.title) { await update({ title: v }, 'Не удалось переименовать'); } else render();
    };
    ta.addEventListener('input', () => { fit(); err.replaceChildren(); });
    ta.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') { e.preventDefault(); finish(true); }
      if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); done = true; D.editing = null; render(); }
    });
    ta.addEventListener('blur', () => finish(true));
    requestAnimationFrame(() => { fit(); ta.focus(); ta.setSelectionRange(ta.value.length, ta.value.length); });
    return h('div', ta, err);
  }
  return h('h2.d-title', {
    tabindex: '0', title: 'Нажмите, чтобы изменить',
    onclick: () => { D.editing = 'title'; render(); },
    onkeydown: (e) => { if (e.key === 'Enter') { D.editing = 'title'; render(); } },
  }, t.title);
}

function assigneeValue(t, board) {
  const btn = h(`button.prop-value${t.assignee ? '' : '.is-placeholder'}`, { type: 'button', 'aria-haspopup': 'dialog' },
    t.assignee ? avatar(t.assignee, 22) : emptyAvatar(22), t.assignee ? t.assignee.name : 'Не назначен');
  if (!t.assignee) btn.firstChild.style.marginRight = '8px';
  btn.addEventListener('click', () => openAssigneePicker(btn, {
    members: board.members, selectedId: t.assignee?.id ?? null, canInvite: board.role === 'owner',
    onSelect: (u) => { if ((u?.id ?? null) !== (t.assignee?.id ?? null)) update({ assignee_id: u?.id ?? null }, 'Не удалось назначить исполнителя'); },
    onInvite: async (email) => { const m = await api.addMember(board.id, { email }); await D.ctx.reload(); return m.user; },
  }));
  return btn;
}

function dueValue(t) {
  const input = h('input.hidden-date', { type: 'date', min: todayISO(), tabindex: '-1', 'aria-hidden': 'true' });
  input.value = t.due_date || '';
  input.addEventListener('change', () => {
    const v = input.value || null;
    if (v && v < todayISO()) { errorToast('Срок не сохранён', 'Срок раньше сегодняшней даты'); input.value = t.due_date || ''; return; }
    if (v !== t.due_date) update({ due_date: v }, 'Не удалось изменить срок');
  });
  const overdue = t.is_overdue;
  const btn = h(`button.prop-value${t.due_date ? '' : '.is-placeholder'}`, {
    type: 'button', 'aria-label': t.due_date ? `Срок: ${fmtLong(t.due_date)}` : 'Срок не задан',
    onclick: () => { try { input.showPicker(); } catch { input.focus(); input.click(); } },
  },
  h('span.cal', icon('calendar', 14)),
  t.due_date ? fmtLong(t.due_date) : 'Без срока',
  t.due_date && !t.is_done ? h(`span.muted${overdue ? '.is-danger' : ''}`, `· ${relDue(t.due_date)}`) : null);
  const clear = t.due_date
    ? h('button.icon-btn.clear-btn', { type: 'button', 'aria-label': 'Убрать срок', onclick: () => update({ due_date: null }, 'Не удалось изменить срок') }, icon('close', 4, 1.5))
    : null;
  return [h('span', { style: { position: 'relative', display: 'inline-flex', alignItems: 'center', flex: '0 1 auto', minWidth: '0' } }, btn, input), clear];
}

function descBlock(t) {
  const label = h('div.d-section-label', 'Описание');
  if (D.editing === 'desc') {
    const ta = h('textarea.textarea', { 'aria-label': 'Описание задачи', placeholder: 'Добавьте подробности, ссылки, критерии готовности' });
    ta.value = t.description || '';
    const save = async () => { D.editing = null; if (ta.value.trim() !== (t.description || '')) await update({ description: ta.value }); else render(); };
    ta.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); D.editing = null; render(); }
      if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) save();
    });
    focusLater(ta);
    return h('div.d-section.d-desc-edit', label, ta, h('div.actions',
      h('button.btn.btn-primary.btn-sm', { type: 'button', onclick: save }, 'Сохранить'),
      h('button.btn.btn-secondary.btn-sm', { type: 'button', onclick: () => { D.editing = null; render(); } }, 'Отмена')));
  }
  return h('div.d-section', label, h(`div.d-desc${t.description ? '' : '.is-empty'}`, {
    tabindex: '0', title: 'Нажмите, чтобы изменить',
    onclick: () => { D.editing = 'desc'; render(); },
    onkeydown: (e) => { if (e.key === 'Enter') { D.editing = 'desc'; render(); } },
  }, t.description || 'Добавьте описание…'));
}

function tabs() {
  const tab = (key, label, count, ic) => h(`button.d-tab${D.tab === key ? '.is-active' : ''}`, {
    type: 'button', role: 'tab', 'aria-selected': String(D.tab === key), onclick: () => { D.tab = key; render(); },
  }, ic || null, label, h(`span.pill.${D.tab === key ? 'pill-primary' : 'pill-muted'}`, String(count)));
  return h('div.d-tabs', { role: 'tablist' },
    tab('comments', 'Комментарии', D.comments.length),
    tab('history', 'История изменений', D.history.length, D.tab === 'history' ? icon('history', 7) : null));
}

/* ---------------------------------------------------------------- history */
const PR_LABEL = (p) => PRIORITY[p]?.label || p;

function describe(e) {
  const a = e.actor;
  const v = (m, f) => verb(a, m, f);
  const chip = (text, { old = false, dot = null } = {}) => h(`span.ev-chip${old ? '.is-old' : ''}`, dot ? h('i', { style: { background: dot } }) : null, h('span', text));
  const pair = (from, to) => h('div.ev-chips', from, h('span.ev-arrow', '→'), to);
  switch (e.action) {
    case 'created': {
      const tv = e.to_value || {};
      const parts = [];
      if (tv.column) parts.push(`в колонке «${tv.column.name}»`);
      if (tv.priority) parts.push(`приоритет «${PR_LABEL(tv.priority)}»`);
      if (tv.assignee) parts.push(`исполнитель ${tv.assignee.name}`);
      if (tv.due) parts.push(`срок ${fmtShort(tv.due)}`);
      return [`${v('создал', 'создала')} задачу`, parts.length ? h('div.ev-plain', parts.join(', ')) : null];
    }
    case 'moved':
      return [`${v('переместил', 'переместила')} задачу`, pair(chip(e.from_value?.name, { dot: e.from_value?.color }), chip(e.to_value?.name, { dot: e.to_value?.color }))];
    case 'assignee': {
      const act = !e.from_value ? v('назначил', 'назначила') + ' исполнителя' : !e.to_value ? v('снял', 'сняла') + ' исполнителя' : v('сменил', 'сменила') + ' исполнителя';
      return [act, pair(chip(e.from_value?.name || 'Не назначен', { old: true }), chip(e.to_value?.name || 'Не назначен'))];
    }
    case 'due': {
      const act = !e.from_value ? v('установил', 'установила') + ' срок' : !e.to_value ? v('убрал', 'убрала') + ' срок' : v('изменил', 'изменила') + ' срок';
      return [act, pair(chip(e.from_value ? fmtShort(e.from_value) : 'Без срока', { old: true }), chip(e.to_value ? fmtShort(e.to_value) : 'Без срока'))];
    }
    case 'priority':
      return [`${v('изменил', 'изменила')} приоритет`, pair(chip(PR_LABEL(e.from_value), { old: true }), chip(PR_LABEL(e.to_value)))];
    case 'title':
      return [`${v('переименовал', 'переименовала')} задачу`, pair(chip(e.from_value, { old: true }), chip(e.to_value))];
    default:
      return [`${v('изменил', 'изменила')} задачу`, null];
  }
}

function timeline() {
  if (!D.history.length) return h('div.empty', 'Изменений пока нет');
  return h('ol.timeline', { 'aria-label': 'История изменений' }, D.history.map((e) => {
    const [act, extra] = describe(e);
    return h('li.event',
      avatar(e.actor, 28),
      h('div.ev-main',
        h('div.ev-head', h('b', e.actor.name), h('span.act.truncate', act), h('time.when', { datetime: e.created_at }, fmtWhen(e.created_at))),
        extra));
  }));
}

/* ---------------------------------------------------------------- comments */
function commentsBlock() {
  const ta = h('textarea.textarea', { placeholder: 'Написать комментарий…', 'aria-label': 'Новый комментарий' });
  const send = h('button.btn.btn-primary.btn-sm', { type: 'button', disabled: true }, 'Отправить');
  ta.addEventListener('input', () => { send.disabled = !ta.value.trim(); });
  const submit = async () => {
    const text = ta.value.trim();
    if (!text) return;
    send.disabled = true;
    try {
      await api.addComment(D.taskId, text);
      await refreshDrawer();
      D.ctx.reload();
    } catch (e) { send.disabled = false; errorToast('Комментарий не отправлен', e.message); }
  };
  ta.addEventListener('keydown', (e) => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) submit(); });
  send.addEventListener('click', submit);
  const me = store.me?.user;
  return h('div',
    h('div.comments-list', D.comments.length ? D.comments.map((c) => h('div.comment',
      avatar(c.author, 28),
      h('div', { style: { flex: '1', minWidth: '0' } },
        h('div.c-head', h('b', c.author.name), h('span', fmtWhen(c.created_at))),
        h('div.c-text', c.text)))) : h('div.empty', { style: { padding: '16px 0 8px' } }, 'Комментариев пока нет')),
    h('div.composer', me ? avatar(me, 28) : null, h('div', { style: { flex: '1' } }, ta, h('div.actions', send))));
}

async function copyLink(t) {
  const url = `${location.origin}${location.pathname}#/board/${t.board_id}/task/${t.id}`;
  try { await navigator.clipboard.writeText(url); snackbar('Ссылка на задачу скопирована'); } catch { prompt('Ссылка на задачу', url); }
}

