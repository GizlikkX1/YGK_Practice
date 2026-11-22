/* Left sidebar: brand, team, navigation, boards, current user (switching users in the demo) */
import { h, pl } from '../utils.js';
import { icon } from '../icons.js';
import { avatar } from '../ui/components.js';
import { openMenu } from '../ui/menu.js';
import { store } from '../store.js';
import { openBoardForm } from './board-form.js';
import { navigate, changeUser } from '../main.js';

export function renderSidebar(root) {
  const { route, me, boards, workspace } = store;
  const onBoard = route.name === 'board';
  const navActive = onBoard ? 'boards' : route.name;

  const nav = [
    { key: 'boards', label: 'Мои доски', href: '#/', ic: icon('board') },
    { key: 'my', label: 'Мои задачи', href: '#/my', ic: icon('task'), count: me?.active_tasks },
    { key: 'members', label: 'Участники', href: '#/members', ic: icon('users') },
    { key: 'settings', label: 'Настройки', href: '#/settings', ic: icon('gear', 16) },
  ];

  let role = me?.owned_boards ? 'Владелец' : 'Участник';
  if (onBoard && store.currentBoard) role = store.currentBoard.role === 'owner' ? 'Владелец' : 'Участник';

  const teamBtn = h('button.team', {
    type: 'button', 'aria-haspopup': 'menu',
    onclick: (e) => openMenu(e.currentTarget, [
      { label: 'Участники команды', onSelect: () => navigate('#/members') },
      { label: 'Настройки', onSelect: () => navigate('#/settings') },
    ], { width: 188 }),
  },
  h('div.truncate', h('div.team-name.truncate', workspace.name), h('div.team-sub', pl(workspace.members_count, 'участник', 'участника', 'участников'))),
  icon('chev', 4, 1.6));

  const meBtn = h('button.me', {
    type: 'button', 'aria-haspopup': 'menu', title: 'Сменить пользователя',
    onclick: (e) => openMenu(e.currentTarget, store.users.map((u) => ({
      label: u.name, user: u, check: u.id === store.userId,
      onSelect: () => { if (u.id !== store.userId) changeUser(u.id); },
    })), { title: 'Войти как', width: 220, placement: 'top' }),
  },
  me ? avatar(me.user, 30) : null,
  h('div.truncate', h('div.me-name.truncate', me?.user.name || ''), h('div.me-role', role)));

  root.replaceChildren(
    h('div.brand', h('div.logo', h('i'), h('i'), h('i')), 'TaskBoard'),
    teamBtn,
    h('nav.nav', { 'aria-label': 'Разделы' }, nav.map((n) => h(`a.nav-item${n.key === navActive ? '.is-active' : ''}`, {
      href: n.href, 'aria-current': n.key === navActive ? 'page' : null,
    }, h('span.nav-icon', n.ic), n.label, n.count ? h('span.pill.pill-muted', String(n.count)) : null))),
    h('div.side-label', 'Доски'),
    h('div.side-boards',
      boards.map((b) => h(`a.side-board${onBoard && route.params.id === b.id ? '.is-active' : ''}`, {
        href: `#/board/${b.id}`, title: b.name,
      }, h('span.sq', { style: { background: b.color } }), h('span.truncate', b.name))),
      h('button.side-board.is-add', { type: 'button', onclick: () => openBoardForm() }, icon('plus', 5, 1.6), 'Новая доска')),
    meBtn,
  );
}
