/* Assignee picker (М3 «список исполнителей», А5 «исполнитель не найден» → приглашение) */
import { h, pl, isEmail, focusLater } from '../utils.js';
import { icon } from '../icons.js';
import { avatar, emptyAvatar } from './components.js';
import { closeMenus, placePopover } from './menu.js';

let current = null;
export function closePicker() { current?.close(); }

/**
 * members: [{user, role, active_tasks}], selectedId, canInvite,
 * onSelect(user|null), onInvite(email) → Promise<user>
 */
export function openAssigneePicker(anchor, { members, selectedId = null, canInvite = false, onSelect, onInvite, onClose }) {
  closeMenus();
  closePicker();
  let query = '';
  let mode = 'list'; // list | invite
  let hover = -1;
  let busy = false;
  let inviteError = '';

  const layer = h('div.popover-layer');
  const el = h('div.picker', { role: 'dialog', 'aria-label': 'Выбор исполнителя' });
  const search = h('input.input', { type: 'text', placeholder: 'Поиск участника', 'aria-label': 'Поиск участника', autocomplete: 'off' });
  const searchWrap = h('div.picker-search', h('div.input-icon', icon('search', 14), search));
  const body = h('div');
  el.append(searchWrap, body);

  const state = {
    close() {
      layer.remove(); el.remove();
      anchor.setAttribute('aria-expanded', 'false');
      document.removeEventListener('keydown', onKey, true);
      window.removeEventListener('resize', state.close);
      if (current === state) current = null;
      onClose?.();
    },
  };

  const roleLabel = (m) => [m.user.position || (m.role === 'owner' ? 'Владелец' : 'Участник'), m.user.position && m.role === 'owner' ? 'владелец доски' : null].filter(Boolean).join(' · ');
  const matches = () => {
    const q = query.trim().toLowerCase();
    return members.filter((m) => !q || m.user.name.toLowerCase().includes(q) || m.user.email.toLowerCase().includes(q));
  };

  function choose(user) { state.close(); onSelect(user); }

  async function invite(email) {
    if (!isEmail(email)) { inviteError = 'Введите корректный email'; render(); return; }
    busy = true; inviteError = ''; render();
    try {
      const user = await onInvite(email.trim());
      choose(user);
    } catch (e) {
      busy = false; inviteError = e.message; render();
    }
  }

  function inviteBlock({ title, sub }) {
    const email = h('input.input', {
      type: 'email', placeholder: 'Email участника', value: isEmail(query) ? query.trim() : '',
      'aria-label': 'Email участника', onkeydown: (e) => { if (e.key === 'Enter') { e.preventDefault(); invite(email.value); } },
    });
    const block = h('div.picker-empty',
      h('div.empty-icon', icon('users')),
      h('div.pe-title', title),
      h('div.pe-sub', sub),
      canInvite ? [
        email,
        inviteError ? h('div.field-error', { style: { justifyContent: 'center' } }, h('span.err-dot', '!'), inviteError) : null,
        h('button.btn.btn-primary.btn-block', { type: 'button', disabled: busy, onclick: () => invite(email.value) },
          busy ? 'Приглашаем…' : 'Пригласить и назначить'),
      ] : h('div.pe-note', 'Пригласить участника может только владелец доски'));
    return { block, email };
  }

  function render() {
    body.replaceChildren();
    const list = matches();
    if (mode === 'list' && list.length) {
      const rows = [];
      const items = query.trim() ? list : [{ user: null }, ...list]; // «Не назначен» only without a query
      items.forEach((m, i) => {
        const u = m.user;
        const selected = u ? u.id === selectedId : selectedId == null;
        const row = h(`button.picker-row${selected ? '.is-selected' : ''}${i === hover ? '.is-hover' : ''}`, {
          type: 'button', role: 'option', 'aria-selected': String(selected), onclick: () => choose(u),
          onmouseenter: () => { hover = i; rows.forEach((r, k) => r.classList.toggle('is-hover', k === i)); },
        },
        u ? avatar(u, 28) : emptyAvatar(28),
        h('div',
          h('div.pr-name', u ? u.name : 'Не назначен'),
          h('div.pr-sub', u ? roleLabel(m) + (m.active_tasks ? ` · ${pl(m.active_tasks, 'задача', 'задачи', 'задач')}` : '') : 'Задача без исполнителя')),
        selected ? h('span.ic.check', icon('check', 1, 2)) : null);
        rows.push(row);
      });
      body.append(h('div.picker-list', { role: 'listbox' }, rows));
      if (canInvite) {
        body.append(h('button.picker-foot.is-primary', { type: 'button', onclick: () => { mode = 'invite'; render(); } },
          icon('plus', 5, 1.8), 'Пригласить участника'));
      }
    } else {
      const notFound = mode === 'list';
      const { block, email } = inviteBlock(notFound
        ? { title: `Нет участников по запросу «${query.trim()}»`, sub: 'Исполнителем может быть только участник доски' }
        : { title: 'Пригласить участника', sub: 'Человек получит доступ к доске и станет исполнителем' });
      body.append(block,
        h('button.picker-foot', { type: 'button', onclick: () => (notFound ? choose(null) : (mode = 'list', render())) },
          notFound ? 'Оставить без исполнителя' : 'Назад к списку'));
      if (!notFound) focusLater(email);
    }
    requestAnimationFrame(() => placePopover(el, anchor));
  }

  function onKey(e) {
    if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); state.close(); anchor.focus?.(); return; }
    if (document.activeElement !== search) return;
    const rows = [...body.querySelectorAll('.picker-row')];
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      const cur = rows.findIndex((r) => r.classList.contains('is-hover'));
      const next = e.key === 'ArrowDown' ? Math.min(rows.length - 1, cur + 1) : Math.max(0, cur - 1);
      rows.forEach((r, k) => r.classList.toggle('is-hover', k === next));
      rows[next]?.scrollIntoView({ block: 'nearest' });
    } else if (e.key === 'Enter') {
      e.preventDefault();
      const row = rows.find((r) => r.classList.contains('is-hover')) || (query.trim() && rows[0]);
      row?.click();
    }
  }

  search.addEventListener('input', () => { query = search.value; mode = 'list'; hover = query ? 0 : -1; inviteError = ''; render(); });
  layer.addEventListener('mousedown', () => state.close());
  document.addEventListener('keydown', onKey, true);
  window.addEventListener('resize', state.close);
  anchor.setAttribute('aria-expanded', 'true');
  document.body.append(layer, el);
  render();
  placePopover(el, anchor);
  focusLater(search);
  current = state;
  return state;
}
