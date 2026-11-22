/* «Пригласить»: board members, invitations by email, removal (owner only) */
import { h, pl, isEmail, focusLater } from '../utils.js';
import { icon } from '../icons.js';
import { avatar, errorLine } from '../ui/components.js';
import { openModal, confirmDialog } from '../ui/overlay.js';
import { placePopover } from '../ui/menu.js';
import { errorToast, snackbar } from '../ui/toast.js';
import { api } from '../api.js';
import { store } from '../store.js';

export function openMembersModal(board, onChanged) {
  const owner = board.role === 'owner';
  let members = board.members;
  const list = h('div.member-rows', { role: 'list' });
  const input = h('input.input', { placeholder: 'Email или имя', 'aria-label': 'Email или имя участника', autocomplete: 'off' });
  const err = h('div');
  const inviteBtn = h('button.btn.btn-primary', { type: 'button', style: { width: '128px' } }, 'Пригласить');
  let suggest = null;
  const closeSuggest = () => { suggest?.remove(); suggest = null; };

  const candidates = () => {
    const q = input.value.trim().toLowerCase();
    const taken = new Set(members.map((m) => m.user.id));
    return q ? store.users.filter((u) => !taken.has(u.id) && (u.name.toLowerCase().includes(q) || u.email.toLowerCase().includes(q))).slice(0, 5) : [];
  };

  async function invite(payload) {
    err.replaceChildren();
    inviteBtn.disabled = true;
    try {
      const m = await api.addMember(board.id, payload);
      members = [...members, m];
      input.value = '';
      closeSuggest();
      render();
      snackbar(`${m.user.name} теперь участник доски`);
      onChanged?.();
    } catch (e) {
      err.replaceChildren(h('div', { style: { marginTop: '0' } }, errorLine(e.message)));
    } finally { inviteBtn.disabled = false; focusLater(input); }
  }

  function submit() {
    const q = input.value.trim();
    const first = candidates()[0];
    if (first && !isEmail(q)) return invite({ user_id: first.id });
    if (isEmail(q)) {
      const existing = store.users.find((u) => u.email.toLowerCase() === q.toLowerCase());
      return invite(existing ? { user_id: existing.id } : { email: q });
    }
    err.replaceChildren(errorLine(q ? 'Не нашли такого человека — введите email, чтобы пригласить' : 'Введите email или имя'));
  }

  input.addEventListener('input', () => {
    err.replaceChildren();
    closeSuggest();
    const c = candidates();
    if (!c.length) return;
    suggest = h('div.suggest', c.map((u) => h('button.menu-item', { type: 'button', onmousedown: (e) => { e.preventDefault(); invite({ user_id: u.id }); } },
      avatar(u, 22), h('span.label-col', h('b', { style: { fontWeight: 500 } }, u.name), h('span', u.email)))));
    document.body.append(suggest);
    placePopover(suggest, input);
  });
  input.addEventListener('blur', () => setTimeout(closeSuggest, 100));
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') { e.preventDefault(); submit(); }
    if (e.key === 'Escape' && suggest) { e.stopPropagation(); closeSuggest(); }
  });
  inviteBtn.addEventListener('click', submit);

  function render() {
    list.replaceChildren(...members.map((m) => h('div.member-row', { role: 'listitem' },
      avatar(m.user, 28),
      h('div.truncate',
        h('div.mr-name.truncate', m.user.name, m.user.id === store.userId ? h('span', { style: { color: 'var(--text-3)', fontWeight: 500 } }, ' (вы)') : null),
        h('div.mr-sub.truncate', `${m.user.position ? `${m.user.position} · ` : ''}${m.user.email} · ${pl(m.active_tasks || 0, 'активная задача', 'активные задачи', 'активных задач')}`)),
      h('div.mr-right',
        h(`span.pill.${m.role === 'owner' ? 'pill-primary' : 'pill-muted'}`, m.role === 'owner' ? 'Владелец' : 'Участник'),
        owner && m.role !== 'owner' ? h('button.icon-btn', {
          type: 'button', 'aria-label': `Исключить ${m.user.name}`, title: 'Исключить из доски',
          onclick: async () => {
            const ok = await confirmDialog({
              title: `Исключить ${m.user.name}?`,
              text: 'Человек потеряет доступ к доске, его задачи останутся без исполнителя.', confirm: 'Исключить',
            });
            if (!ok) return;
            try {
              await api.removeMember(board.id, m.user.id);
              members = members.filter((x) => x !== m);
              render();
              onChanged?.();
            } catch (e) { errorToast('Не удалось исключить участника', e.message); }
          },
        }, icon('close', 4.5, 1.6)) : null))));
  }

  const body = h('div.modal-body', { style: { paddingBottom: '18px' } },
    owner
      ? [h('label.label', 'Пригласить на доску'), h('div.invite-row', input, inviteBtn), err]
      : h('div', { style: { fontSize: '13.5px', color: 'var(--text-2)' } }, 'Приглашать участников может только владелец доски.'),
    h('div.label', { style: { marginTop: '20px', marginBottom: '0' } }, `Участники · ${members.length}`),
    list);
  render();
  const modal = openModal({
    title: 'Участники доски', width: 520, body, onClose: closeSuggest,
    foot: [h('span.hint', 'Исполнителем может быть только участник доски'),
      h('button.btn.btn-primary.btn-lg', { type: 'button', style: { width: '120px' }, onclick: () => modal.close() }, 'Готово')],
  });
  return modal;
}
