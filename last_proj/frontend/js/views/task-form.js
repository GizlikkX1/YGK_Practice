/* Screen 3 — «Новая задача» (+ А1 validation errors, А5 assignee not found → invite) */
import { h, todayISO, focusLater } from '../utils.js';
import { icon } from '../icons.js';
import { avatar, emptyAvatar, errorLine, dateField } from '../ui/components.js';
import { openModal } from '../ui/overlay.js';
import { openMenu } from '../ui/menu.js';
import { openAssigneePicker } from '../ui/picker.js';
import { errorToast } from '../ui/toast.js';
import { api } from '../api.js';

const PRIORITIES = [['low', 'Низкий'], ['mid', 'Средний'], ['high', 'Высокий']];

export function openTaskForm(board, { columnId, onCreated, onMembersChanged } = {}) {
  const members = board.members.map((m) => ({ ...m }));
  const canInvite = board.role === 'owner';
  const state = {
    title: '', description: '', due: '', dueInvalid: false, dueShowInvalid: false, assignee: null,
    columnId: columnId || board.columns[0]?.id, priority: 'mid',
    touched: false, busy: false, serverError: null,
  };
  const col = () => board.columns.find((c) => c.id === state.columnId);

  // --- controls
  const title = h('input.input', { id: 'tf-title', type: 'text', placeholder: 'Например: Экран оплаты заказа', maxlength: 200, autocomplete: 'off', 'aria-required': 'true' });
  const titleErr = h('div.error-slot', { id: 'tf-title-err' });
  const desc = h('textarea.textarea', { id: 'tf-desc', placeholder: 'Добавьте подробности, ссылки, критерии готовности' });
  const dueField = dateField({
    id: 'tf-due', min: todayISO(),
    onChange: ({ iso, invalid, complete, blurred }) => {
      state.due = iso || '';
      state.dueInvalid = invalid;
      state.dueShowInvalid = invalid && (complete || blurred);
      if (state.serverError?.field === 'due') state.serverError = null;
      render();
    },
  });
  const due = dueField.input;
  due.setAttribute('aria-describedby', 'tf-due-err');
  const dueErr = h('div.error-slot', { id: 'tf-due-err' });
  const assigneeBtn = h('button.select', { type: 'button', id: 'tf-assignee', 'aria-haspopup': 'dialog' });
  const columnBtn = h('button.select', { type: 'button', id: 'tf-column', 'aria-haspopup': 'menu' });
  const segmented = h('div.segmented', { role: 'group', 'aria-label': 'Приоритет' });
  const hint = h('span.hint');
  const createBtn = h('button.btn.btn-primary.btn-lg', { type: 'button', style: { width: '156px' } }, 'Создать задачу');

  const errors = () => {
    const e = {};
    if (!state.title.trim()) e.title = 'Введите название задачи';
    else if (state.title.trim().length > 200) e.title = 'Название — не длиннее 200 символов';
    if (state.dueInvalid) e.due = 'Введите дату в формате дд.мм.гггг';
    else if (state.due && state.due < todayISO()) e.due = 'Срок раньше сегодняшней даты';
    if (state.serverError) e[state.serverError.field] = state.serverError.message;
    return e;
  };

  function render() {
    const e = errors();
    const showTitle = e.title && (state.touched || state.serverError?.field === 'title');
    title.classList.toggle('is-error', !!showTitle);
    title.setAttribute('aria-invalid', String(!!showTitle));
    titleErr.replaceChildren(showTitle ? errorLine(e.title) : '');
    const showDue = e.due && (!state.dueInvalid || state.dueShowInvalid);
    due.classList.toggle('is-error', !!showDue);
    due.setAttribute('aria-invalid', String(!!showDue));
    dueErr.replaceChildren(showDue ? errorLine(e.due) : '');

    // only touch the DOM that changed: replacing nodes under the pointer would swallow clicks
    const a = state.assignee;
    const aKey = a ? a.id : 'none';
    if (assigneeBtn.dataset.key !== String(aKey)) {
      assigneeBtn.dataset.key = String(aKey);
      assigneeBtn.replaceChildren(
        h('span.select-value', a ? avatar(a, 22) : emptyAvatar(22), h('span.truncate', { class: a ? '' : 'placeholder' }, a ? a.name : 'Не назначен')),
        h('span.select-chev', icon('chev', 4.5, 1.6)));
    }
    const c = col();
    if (columnBtn.dataset.key !== String(state.columnId)) {
      columnBtn.dataset.key = String(state.columnId);
      columnBtn.replaceChildren(
        h('span.select-value', h('span.select-dot', { style: { background: c?.color } }), h('span.truncate', c?.name || '')),
        h('span.select-chev', icon('chev', 4.5, 1.6)));
    }
    if (!segmented.children.length) {
      segmented.append(...PRIORITIES.map(([k, label]) => h('button', {
        type: 'button', dataset: { k }, onclick: () => { state.priority = k; render(); },
      }, label)));
    }
    for (const btn of segmented.children) btn.setAttribute('aria-pressed', String(btn.dataset.k === state.priority));

    const hasErrors = Object.keys(e).length > 0;
    hint.textContent = (hasErrors && (state.touched || e.due)) ? 'Обязательно только название' : `Добавится в конец колонки «${c?.name || ''}»`;
    createBtn.disabled = hasErrors || state.busy;
    createBtn.textContent = state.busy ? 'Создаём…' : 'Создать задачу';
  }

  title.addEventListener('input', () => { state.title = title.value; if (state.serverError?.field === 'title') state.serverError = null; render(); });
  title.addEventListener('blur', () => { state.touched = true; render(); });
  title.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); submit(); } });
  desc.addEventListener('input', () => { state.description = desc.value; });
  desc.addEventListener('keydown', (e) => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) submit(); });

  assigneeBtn.addEventListener('click', () => openAssigneePicker(assigneeBtn, {
    members, selectedId: state.assignee?.id ?? null, canInvite,
    onSelect: (u) => { state.assignee = u; render(); assigneeBtn.focus(); },
    onInvite: async (email) => {
      const m = await api.addMember(board.id, { email });
      members.push(m);
      onMembersChanged?.();
      return m.user;
    },
  }));
  columnBtn.addEventListener('click', () => openMenu(columnBtn, board.columns.map((c) => ({
    label: c.name, dot: c.color, check: c.id === state.columnId, tag: c.is_final ? 'финальная' : null,
    onSelect: () => { state.columnId = c.id; render(); },
  })), { width: 244 }));

  async function submit() {
    state.touched = true;
    render();
    if (createBtn.disabled) { (errors().title ? title : due).focus(); return; }
    state.busy = true; render();
    try {
      const task = await api.createTask(board.id, {
        title: state.title.trim(), description: state.description.trim(), column_id: state.columnId,
        assignee_id: state.assignee?.id ?? null, due_date: state.due || null, priority: state.priority,
      });
      modal.close();
      onCreated?.(task);
    } catch (e) {
      state.busy = false;
      if (e.status === 422 && (e.field === 'title' || e.field === 'due_date')) {
        state.serverError = { field: e.field === 'title' ? 'title' : 'due', message: e.message };
      } else {
        errorToast('Не удалось создать задачу', e.message);
      }
      render();
    }
  }
  createBtn.addEventListener('click', submit);

  const field = (label, control, { req = false, err = null, forId, mb = 12 } = {}) => h('div.field', { style: { marginBottom: `${mb}px` } },
    h('label.label', { for: forId }, label, req ? h('span.req', '*') : null), control, err);

  const body = h('div.modal-body',
    field('Название', title, { req: true, err: titleErr, forId: 'tf-title' }),
    field('Описание', desc, { forId: 'tf-desc', mb: 20 }),
    h('div', { style: { display: 'grid', gridTemplateColumns: '1fr 1fr', columnGap: '16px' } },
      field('Срок', dueField.el, { err: dueErr, forId: 'tf-due' }),
      field('Исполнитель', assigneeBtn, { forId: 'tf-assignee', err: h('div.error-slot') }),
      field('Колонка', columnBtn, { forId: 'tf-column', mb: 0 }),
      field('Приоритет', segmented, { mb: 0 })));

  const modal = openModal({
    title: 'Новая задача', width: 560, body,
    foot: [hint, h('button.btn.btn-secondary.btn-lg', { type: 'button', style: { width: '96px' }, onclick: () => modal.close() }, 'Отмена'), createBtn],
  });
  render();
  focusLater(title);
  return modal;
}
