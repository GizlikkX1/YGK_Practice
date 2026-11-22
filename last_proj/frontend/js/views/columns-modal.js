/* «Колонки» button on the board: the А2 editor working live against the API (owner) */
import { h } from '../utils.js';
import { openModal, confirmDialog } from '../ui/overlay.js';
import { errorToast, snackbar } from '../ui/toast.js';
import { api } from '../api.js';
import { refreshShell } from '../store.js';
import { columnsEditor } from './columns-editor.js';
import { navigate } from '../main.js';

export function openColumnsModal(board, { reload, deleteColumn }) {
  const owner = board.role === 'owner';
  let current = board;
  const counts = () => Object.fromEntries(current.columns.map((c) => [c.id, current.tasks.filter((t) => t.column_id === c.id).length]));

  const refresh = async () => {
    await reload();
    current = (await api.board(board.id));
  };
  const call = async (fn, title) => {
    try { await fn(); await refresh(); } catch (e) { errorToast(title, e.message); }
  };

  const editor = columnsEditor({
    live: true,
    readOnly: !owner,
    list: () => { const n = counts(); return current.columns.map((c) => ({ key: c.id, name: c.name, color: c.color, is_final: c.is_final, count: n[c.id] })); },
    rename: (row, name) => call(() => api.updateColumn(row.key, { name }), 'Не удалось переименовать'),
    reorder: (rows) => call(() => api.reorderColumns(board.id, rows.map((r) => r.key)), 'Не удалось изменить порядок'),
    setFinal: (row) => call(() => api.updateColumn(row.key, { is_final: true }), 'Не удалось изменить колонку'),
    setColor: (row, color) => call(() => api.updateColumn(row.key, { color }), 'Не удалось изменить цвет'),
    remove: (row) => new Promise((resolve) => {
      const col = current.columns.find((c) => c.id === row.key);
      deleteColumn(col, { onDone: async () => { current = await api.board(board.id); editor.render(); } });
      resolve();
    }),
    add: (name) => {
      const finalIdx = current.columns.findIndex((c) => c.is_final);
      return call(() => api.createColumn(board.id, { name, position: finalIdx >= 0 ? finalIdx : current.columns.length }), 'Не удалось добавить колонку');
    },
  });

  const archiveBtn = owner ? h('button.btn.btn-ghost', {
    type: 'button',
    onclick: async () => {
      if (current.is_archived) {
        await api.updateBoard(board.id, { is_archived: false }).catch((e) => errorToast('Не удалось', e.message));
        modal.close(); await reload(); refreshShell(); snackbar('Доска возвращена из архива');
        return;
      }
      const ok = await confirmDialog({ title: `Архивировать доску «${board.name}»?`, text: 'Доска пропадёт из списка, её можно будет вернуть из вкладки «Архив».', confirm: 'В архив' });
      if (!ok) return;
      try {
        await api.updateBoard(board.id, { is_archived: true });
        modal.close();
        await refreshShell();
        navigate('#/');
        snackbar(`Доска «${board.name}» перенесена в архив`);
      } catch (e) { errorToast('Не удалось архивировать', e.message); }
    },
  }, current.is_archived ? 'Вернуть из архива' : 'Архивировать доску') : null;

  const body = h('div.modal-body',
    h('div.label-row', h('div.label', 'Колонки'), h('span.hint', { style: { marginBottom: '8px' } },
      owner ? 'Перетащите строку, чтобы изменить порядок' : 'Изменять колонки может только владелец доски')),
    editor.el);

  const modal = openModal({
    title: 'Колонки доски', width: 640, body,
    onClose: () => reload(),
    foot: [
      archiveBtn ? h('span.hint.is-left-actions', archiveBtn) : h('span.hint', 'Задачи остаются в своих колонках при любых изменениях'),
      h('button.btn.btn-primary.btn-lg', { type: 'button', style: { width: '120px' }, onclick: () => modal.close() }, 'Готово'),
    ],
  });
  return modal;
}
