/* Column list editor (А2): drag rows to reorder, rename inline, pick the final column, add/remove.
   Works on a local draft (new board) or live against the API (board settings). */
import { h, append, pl } from '../utils.js';
import { icon } from '../icons.js';

const PALETTE = ['#868E96', '#3B5BDB', '#F08C00', '#2F9E44', '#AE3EC9', '#1098AD', '#E64980', '#7950F2'];

/**
 * ops: { list() → rows[{key, name, color, is_final, count?}], rename(row, name), reorder(rowsInOrder),
 *        setFinal(row), setColor(row, color), remove(row), add(name), readOnly }
 * Every op may return a promise; the editor re-renders afterwards.
 */
export function columnsEditor(ops) {
  const root = h('div');
  let editingKey = null;
  let adding = false;
  let toFocus = null; // focused right after render, so no keystroke is lost

  const nextColor = (color) => PALETTE[(PALETTE.indexOf(color) + 1) % PALETTE.length];

  async function run(fn) {
    try { await fn(); } finally { render(); }
  }

  function rowEl(row, i, rows) {
    const editing = editingKey === row.key;
    const el = h('div.col-row', { dataset: { key: row.key }, role: 'listitem' });
    const grip = h('span.grip', { title: 'Перетащите, чтобы изменить порядок', 'aria-hidden': 'true' }, icon('grip'));
    const dot = ops.readOnly
      ? h('span.dot', { style: { background: row.color } })
      : h('button.dot', { type: 'button', style: { background: row.color }, title: 'Сменить цвет', 'aria-label': `Цвет колонки «${row.name}»`,
        onclick: () => run(() => ops.setColor(row, nextColor(row.color))) });

    let name;
    if (editing) {
      name = h('input.name-input', { value: row.name, maxlength: 60, 'aria-label': 'Название колонки' });
      let done = false;
      const finish = (save) => {
        if (done) return; done = true;
        editingKey = null;
        const v = name.value.trim();
        if (save && v && v !== row.name) run(() => ops.rename(row, v)); else render();
      };
      name.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') { e.preventDefault(); finish(true); }
        if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); finish(false); }
      });
      name.addEventListener('blur', () => finish(true));
      toFocus = name;
    } else {
      name = h('span.name', {
        tabindex: ops.readOnly ? null : '0', title: ops.readOnly ? row.name : 'Нажмите, чтобы переименовать',
        onclick: () => { if (!ops.readOnly) { editingKey = row.key; render(); } },
        onkeydown: (e) => { if (e.key === 'Enter' && !ops.readOnly) { editingKey = row.key; render(); } },
      }, row.name);
    }

    append(el, [
      ops.readOnly ? h('span', { style: { width: '24px' } }) : grip,
      h('span.num', String(i + 1)),
      dot,
      name,
      row.is_final ? h('span.pill.pill-final', 'финальная — задачи считаются завершёнными') : null,
      row.count != null ? h('span.count', pl(row.count, 'задача', 'задачи', 'задач')) : null,
      ops.readOnly ? null : h('div.row-actions',
        row.is_final ? null : h('button.make-final', { type: 'button', onclick: () => run(() => ops.setFinal(row)) }, 'Сделать финальной'),
        h('button.icon-btn', {
          type: 'button', 'aria-label': `Удалить колонку «${row.name}»`, title: 'Удалить колонку',
          disabled: rows.length === 1 && ops.live, onclick: () => run(() => ops.remove(row)),
        }, icon('close', 4.5, 1.6)))]);

    if (!ops.readOnly) grip.addEventListener('pointerdown', (e) => startDrag(e, el));
    return el;
  }

  function startDrag(e, el) {
    e.preventDefault();
    const list = el.parentElement;
    const startY = e.clientY;
    const rows = () => [...list.querySelectorAll('.col-row')];
    el.classList.add('is-dragging');
    el.setPointerCapture?.(e.pointerId);
    const move = (ev) => {
      el.style.transform = `translateY(${ev.clientY - startY}px)`;
      const others = rows().filter((r) => r !== el);
      let before = null;
      for (const r of others) {
        const rr = r.getBoundingClientRect();
        if (ev.clientY < rr.top + rr.height / 2) { before = r; break; }
      }
      const curNext = el.nextElementSibling;
      if (before !== curNext) {
        const prevTop = el.getBoundingClientRect().top;
        list.insertBefore(el, before);
        const shift = el.getBoundingClientRect().top - prevTop;
        const cur = parseFloat(el.style.transform.replace(/[^-\d.]/g, '')) || 0;
        el.style.transform = `translateY(${cur - shift}px)`;
      }
    };
    const up = () => {
      el.removeEventListener('pointermove', move);
      el.removeEventListener('pointerup', up);
      el.removeEventListener('pointercancel', up);
      el.style.transform = '';
      el.classList.remove('is-dragging');
      const keys = rows().map((r) => r.dataset.key);
      const current = ops.list().map((r) => String(r.key));
      if (keys.join() !== current.join()) {
        const byKey = Object.fromEntries(ops.list().map((r) => [String(r.key), r]));
        run(() => ops.reorder(keys.map((k) => byKey[k])));
      } else render();
    };
    el.addEventListener('pointermove', move);
    el.addEventListener('pointerup', up);
    el.addEventListener('pointercancel', up);
  }

  function addRow() {
    if (!adding) {
      return h('button.add-row.dash-row', { type: 'button', onclick: () => { adding = true; render(); } }, icon('plus', 5, 1.7), 'Добавить колонку');
    }
    const input = h('input.input', { placeholder: 'Название колонки', maxlength: 60, 'aria-label': 'Название новой колонки', style: { height: '40px' } });
    let done = false;
    const finish = (save) => {
      if (done) return; done = true;
      adding = false;
      const v = input.value.trim();
      if (save && v) run(() => ops.add(v)); else render();
    };
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') { e.preventDefault(); finish(true); }
      if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); finish(false); }
    });
    input.addEventListener('blur', () => finish(true));
    toFocus = input;
    return h('div', { style: { marginTop: '8px' } }, input);
  }

  function render() {
    const rows = ops.list();
    root.replaceChildren(
      rows.length ? h('div.col-rows', { role: 'list' }, rows.map((r, i) => rowEl(r, i, rows)))
        : h('div.empty', { style: { padding: '14px 0', textAlign: 'left' } }, 'Колонок пока нет — добавьте первую.'),
      ops.readOnly ? null : addRow());
    if (toFocus?.isConnected) { toFocus.focus(); toFocus.select?.(); }
    toFocus = null;
  }

  render();
  return { el: root, render };
}

export const COLUMN_PALETTE = PALETTE;
