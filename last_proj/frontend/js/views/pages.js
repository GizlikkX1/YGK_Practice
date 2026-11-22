/* Sidebar sections: «Мои задачи», «Участники», «Настройки» */
import { h, pl, isEmail } from '../utils.js';
import { avatar, errorLine, plusIcon } from '../ui/components.js';
import { openModal } from '../ui/overlay.js';
import { snackbar } from '../ui/toast.js';
import { api } from '../api.js';
import { store, refreshShell } from '../store.js';
import { myTasksTable } from './boards.js';
import { changeUser } from '../main.js';

export async function renderMyTasks(root) {
  const rows = await api.myTasks();
  if (store.route.name !== 'my') return;
  const overdue = rows.filter((r) => r.task.is_overdue).length;
  root.replaceChildren(h('div.page',
    h('div.page-head', h('div',
      h('h1.page-title', 'Мои задачи'),
      h('div.page-sub', `${pl(rows.length, 'активная задача', 'активные задачи', 'активных задач')}${overdue ? ` · ${overdue} просрочено` : ''} · по всем доскам`))),
    h('div', { style: { marginTop: '28px' } }, myTasksTable(rows))));
}

export async function renderMembers(root) {
  const users = await api.users();
  if (store.route.name !== 'members') return;
  root.replaceChildren(h('div.page',
    h('div.page-head',
      h('div', h('h1.page-title', 'Участники'), h('div.page-sub', `${pl(users.length, 'человек', 'человека', 'человек')} · ${store.workspace.name}`)),
      h('button.btn.btn-primary.btn-lg', { type: 'button', onclick: () => addPerson(root) }, plusIcon(), 'Добавить в команду')),
    h('div.table-card', { style: { marginTop: '28px' } }, h('table.table',
      h('colgroup', h('col', { style: { width: '340px' } }), h('col', { style: { width: '220px' } }), h('col', { style: { width: '260px' } }), h('col', { style: { width: '110px' } }), h('col')),
      h('thead', h('tr', ['Участник', 'Роль в команде', 'Email', 'Доски', 'Активные задачи'].map((t) => h('th', t)))),
      h('tbody', users.map((u) => h('tr',
        h('td', h('span.t-user', avatar(u, 30), h('b', u.name, u.id === store.userId ? h('span.t-sub', ' (вы)') : null))),
        h('td.t-muted', u.position || '—'),
        h('td.t-muted', u.email),
        h('td.t-muted', String(u.boards_count)),
        h('td.t-muted', String(u.active_tasks)))))))));
}

function addPerson(root) {
  const name = h('input.input', { placeholder: 'Фамилия Имя Отчество', 'aria-label': 'ФИО', maxlength: 100 });
  const email = h('input.input', { placeholder: 'name@company.ru', type: 'email', 'aria-label': 'Email' });
  const position = h('input.input', { placeholder: 'Например: Frontend-разработчик', 'aria-label': 'Роль в команде', maxlength: 100 });
  const err = h('div');
  const submit = async () => {
    if (!name.value.trim()) { err.replaceChildren(errorLine('Введите ФИО')); return; }
    if (!isEmail(email.value)) { err.replaceChildren(errorLine('Введите корректный email')); return; }
    try {
      const u = await api.createUser({ name: name.value.trim(), email: email.value.trim(), position: position.value.trim() });
      m.close();
      await refreshShell();
      renderMembers(root);
      snackbar(`${u.name} добавлен(а) в команду`);
    } catch (e) { err.replaceChildren(errorLine(e.message)); }
  };
  [name, email, position].forEach((i) => i.addEventListener('keydown', (e) => { if (e.key === 'Enter') submit(); }));
  const m = openModal({
    title: 'Новый участник команды', width: 480,
    body: h('div.modal-body',
      h('label.label', 'ФИО', h('span.req', '*')), name,
      h('label.label', { style: { marginTop: '16px' } }, 'Email', h('span.req', '*')), email,
      h('label.label', { style: { marginTop: '16px' } }, 'Роль в команде'), position, err),
    foot: [h('span.hint', 'Добавить человека на доску можно кнопкой «Пригласить»'),
      h('button.btn.btn-secondary.btn-lg', { type: 'button', style: { width: '96px' }, onclick: () => m.close() }, 'Отмена'),
      h('button.btn.btn-primary.btn-lg', { type: 'button', onclick: submit }, 'Добавить')],
  });
}

export function renderSettings(root) {
  root.replaceChildren(h('div.page',
    h('div.page-head', h('div', h('h1.page-title', 'Настройки'), h('div.page-sub', store.workspace.name))),
    h('div.settings-card',
      h('h2', 'Пользователь'),
      h('p', 'Демо-режим без паролей: выберите, от чьего имени работать. Откройте приложение во второй вкладке под другим пользователем — изменения на доске появятся у обоих в реальном времени.'),
      h('div.user-pick', { role: 'radiogroup', 'aria-label': 'Пользователь' }, store.users.map((u) => h(`button${u.id === store.userId ? '.is-on' : ''}`, {
        type: 'button', role: 'radio', 'aria-checked': String(u.id === store.userId),
        onclick: () => { if (u.id !== store.userId) changeUser(u.id); },
      }, avatar(u, 30), h('span', h('b', { style: { display: 'block', fontWeight: 600 } }, u.name), h('span', { style: { fontSize: '12px', color: 'var(--text-3)' } }, [u.position, u.email].filter(Boolean).join(' · '))),
      h(`span.radio${u.id === store.userId ? '.is-on' : ''}`))))),
    h('div.settings-card',
      h('h2', 'О приложении'),
      h('p', 'TaskBoard — командная канбан-доска. Документация API: ', h('a', { href: '/docs', target: '_blank', style: { color: 'var(--primary)', fontWeight: 600 } }, '/docs'), '.'))));
}

