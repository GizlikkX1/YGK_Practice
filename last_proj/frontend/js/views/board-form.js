/* Screen А2 — «Новая доска»: template, column editor, members */
import { h, isEmail, focusLater } from '../utils.js';
import { icon } from '../icons.js';
import { avatar, errorLine } from '../ui/components.js';
import { openModal } from '../ui/overlay.js';
import { placePopover } from '../ui/menu.js';
import { errorToast, snackbar } from '../ui/toast.js';
import { api } from '../api.js';
import { store, refreshShell } from '../store.js';
import { columnsEditor, COLUMN_PALETTE } from './columns-editor.js';
import { navigate } from '../main.js';

const TEMPLATES = [
  { key: 'basic', name: 'Базовый', sub: ['Новые · В работе ·', 'Готово'], cols: [['Новые', '#868E96'], ['В работе', '#3B5BDB'], ['Готово', '#2F9E44']] },
  { key: 'dev', name: 'Разработка', sub: ['Бэклог · В работе ·', 'Ревью · Готово'], cols: [['Бэклог', '#868E96'], ['В работе', '#3B5BDB'], ['Ревью', '#F08C00'], ['Готово', '#2F9E44']] },
  { key: 'empty', name: 'Пустая', sub: ['Колонки добавите', 'сами'], cols: [] },
];

let seq = 0;
const draftRows = (tpl) => tpl.cols.map(([name, color], i, all) => ({ key: `d${++seq}`, name, color, is_final: i === all.length - 1 }));

export function openBoardForm() {
  const state = { name: '', template: 'basic', rows: draftRows(TEMPLATES[0]), members: [], invites: [], touched: false, busy: false };
  const me = store.me.user;

  const nameInput = h('input.input', { id: 'bf-name', type: 'text', placeholder: 'Например: Маркетинг Q1 2027', maxlength: 100, autocomplete: 'off' });
  const nameErr = h('div.error-slot');
  const tplGrid = h('div.tpl-grid', { role: 'radiogroup', 'aria-label': 'Шаблон колонок' });
  const chips = h('div.chips');
  const createBtn = h('button.btn.btn-primary.btn-lg', { type: 'button', style: { width: '150px' } }, 'Создать доску');

  const ensureFinal = () => {
    if (state.rows.length && !state.rows.some((r) => r.is_final)) state.rows[state.rows.length - 1].is_final = true;
  };
  const editor = columnsEditor({
    list: () => state.rows,
    rename: (row, name) => { row.name = name; },
    reorder: (rows) => { state.rows = rows; },
    setFinal: (row) => { state.rows.forEach((r) => { r.is_final = r === row; }); },
    setColor: (row, color) => { row.color = color; },
    remove: (row) => { state.rows = state.rows.filter((r) => r !== row); ensureFinal(); },
    add: (name) => {
      const used = state.rows.map((r) => r.color);
      const color = COLUMN_PALETTE.find((c) => !used.includes(c)) || COLUMN_PALETTE[state.rows.length % COLUMN_PALETTE.length];
      const finalIdx = state.rows.findIndex((r) => r.is_final);
      const row = { key: `d${++seq}`, name, color, is_final: false };
      if (finalIdx >= 0) state.rows.splice(finalIdx, 0, row); else state.rows.push(row);
      ensureFinal();
    },
  });

  function renderTemplates() {
    tplGrid.replaceChildren(...TEMPLATES.map((t) => h(`button.tpl${state.template === t.key ? '.is-on' : ''}`, {
      type: 'button', role: 'radio', 'aria-checked': String(state.template === t.key),
      onclick: () => { state.template = t.key; state.rows = draftRows(t); renderTemplates(); editor.render(); },
    },
    h('div.tpl-head', h(`span.radio${state.template === t.key ? '.is-on' : ''}`), h('span.tpl-name', t.name)),
    h('div.tpl-sub', t.sub[0], h('br'), t.sub[1]))));
  }

  // --- members chips + suggestions
  const memberInput = h('input.chip-input', { placeholder: 'Email или имя', 'aria-label': 'Добавить участника: email или имя', autocomplete: 'off' });
  let suggest = null;
  const closeSuggest = () => { suggest?.remove(); suggest = null; };
  function candidates() {
    const q = memberInput.value.trim().toLowerCase();
    if (!q) return [];
    const taken = new Set([me.id, ...state.members.map((u) => u.id)]);
    return store.users.filter((u) => !taken.has(u.id) && (u.name.toLowerCase().includes(q) || u.email.toLowerCase().includes(q))).slice(0, 5);
  }
  function addUser(u) { state.members.push(u); memberInput.value = ''; closeSuggest(); renderChips(); focusLater(memberInput); }
  function addEmail(email) {
    email = email.trim().toLowerCase();
    const existing = store.users.find((u) => u.email.toLowerCase() === email);
    if (existing) { if (existing.id !== me.id && !state.members.some((m) => m.id === existing.id)) addUser(existing); return; }
    if (!state.invites.includes(email)) state.invites.push(email);
    memberInput.value = ''; closeSuggest(); renderChips(); focusLater(memberInput);
  }
  function showSuggest() {
    closeSuggest();
    const list = candidates();
    const q = memberInput.value.trim();
    const items = list.map((u) => h('button.menu-item', { type: 'button', onmousedown: (e) => { e.preventDefault(); addUser(u); } },
      avatar(u, 22), h('span.label-col', h('b', { style: { fontWeight: 500 } }, u.name), h('span', u.email))));
    if (isEmail(q) && !store.users.some((u) => u.email.toLowerCase() === q.toLowerCase())) {
      items.push(h('button.menu-item', { type: 'button', onmousedown: (e) => { e.preventDefault(); addEmail(q); } },
        h('span', { style: { color: 'var(--primary)', display: 'flex', marginRight: '8px' } }, icon('plus', 5, 1.8)), `Пригласить ${q}`));
    }
    if (!items.length) return;
    suggest = h('div.suggest', items);
    document.body.append(suggest);
    placePopover(suggest, memberInput, { gap: 6 });
  }
  memberInput.addEventListener('input', showSuggest);
  memberInput.addEventListener('blur', () => setTimeout(closeSuggest, 100));
  memberInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      const first = candidates()[0];
      if (first) addUser(first); else if (isEmail(memberInput.value)) addEmail(memberInput.value);
    } else if (e.key === 'Backspace' && !memberInput.value) {
      if (state.invites.length) state.invites.pop(); else state.members.pop();
      renderChips(); focusLater(memberInput);
    } else if (e.key === 'Escape' && suggest) { e.stopPropagation(); closeSuggest(); }
  });

  function chip(u, label, onRemove) {
    return h(`span.chip${onRemove ? '' : ''}`, { style: onRemove ? { paddingRight: '7px' } : { paddingRight: '16px' } },
      u ? avatar(u, 22) : h('span.avatar', { style: { width: '22px', height: '22px', fontSize: '10px', background: 'var(--text-3)' } }, '@'),
      label,
      onRemove ? h('button.chip-x', { type: 'button', 'aria-label': `Убрать ${label}`, onclick: onRemove }, icon('close', 3.5, 1.4)) : null);
  }
  function renderChips() {
    chips.replaceChildren(
      chip(me, `${me.name} (вы)`, null),
      ...state.members.map((u) => chip(u, u.name, () => { state.members = state.members.filter((x) => x !== u); renderChips(); })),
      ...state.invites.map((em) => chip(null, em, () => { state.invites = state.invites.filter((x) => x !== em); renderChips(); })),
      memberInput);
  }

  function validate() {
    const err = !state.name.trim() ? 'Введите название доски' : null;
    nameInput.classList.toggle('is-error', !!(err && state.touched));
    nameErr.replaceChildren(err && state.touched ? errorLine(err) : '');
    createBtn.disabled = !!err || state.busy;
    return !err;
  }
  nameInput.addEventListener('input', () => { state.name = nameInput.value; validate(); });
  nameInput.addEventListener('blur', () => { state.touched = true; validate(); });
  nameInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') submit(); });

  async function submit() {
    state.touched = true;
    if (!validate()) { nameInput.focus(); return; }
    state.busy = true; createBtn.textContent = 'Создаём…'; validate();
    try {
      const board = await api.createBoard({
        name: state.name.trim(),
        columns: state.rows.map((r) => ({ name: r.name, color: r.color, is_final: r.is_final })),
        member_ids: state.members.map((u) => u.id),
        invite_emails: state.invites,
      });
      modal.close();
      await refreshShell();
      navigate(`#/board/${board.id}`);
      snackbar(`Доска «${board.name}» создана`);
    } catch (e) {
      state.busy = false; createBtn.textContent = 'Создать доску'; validate();
      errorToast('Не удалось создать доску', e.message);
    }
  }
  createBtn.addEventListener('click', submit);

  const body = h('div.modal-body', { style: { paddingBottom: '36px' } },
    h('div.field', h('label.label', { for: 'bf-name' }, 'Название доски', h('span.req', '*')), nameInput, nameErr),
    h('div.field', { style: { marginBottom: '20px' } }, h('div.label', 'Шаблон колонок'), tplGrid),
    h('div.field', { style: { marginBottom: '24px' } },
      h('div.label-row', h('div.label', 'Колонки'), h('span.hint', { style: { marginBottom: '8px' } }, 'Перетащите строку, чтобы изменить порядок')),
      editor.el),
    h('div.field', h('div.label', 'Участники'), chips));

  const modal = openModal({
    title: 'Новая доска', width: 640, body,
    onClose: closeSuggest,
    foot: [h('span.hint', 'Колонки и порядок можно изменить позже'),
      h('button.btn.btn-secondary.btn-lg', { type: 'button', style: { width: '96px' }, onclick: () => modal.close() }, 'Отмена'),
      createBtn],
  });
  renderTemplates();
  renderChips();
  validate();
  focusLater(nameInput);
}
