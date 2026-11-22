/* Modal dialogs */
import { h } from '../utils.js';
import { icon } from '../icons.js';

const stack = [];

document.addEventListener('keydown', (e) => {
  if (e.key !== 'Escape' || !stack.length) return;
  if (document.querySelector('.menu, .picker, .suggest')) return; // popovers close first
  const top = stack[stack.length - 1];
  if (top.escClose) { e.preventDefault(); top.close(); }
});

/**
 * openModal({title, width, body, foot, onClose}) → {el, close, setBusy}
 * body/foot: Node or array of nodes. Without title → bare container (used by dialogs).
 */
export function openModal({ title, width = 560, body, foot, onClose, className = '', escClose = true, label }) {
  const prevFocus = document.activeElement;
  const modal = h(`div.modal${className ? `.${className}` : ''}`, {
    role: 'dialog', 'aria-modal': 'true', 'aria-label': label || title || 'Диалог', style: { width: `${width}px` },
  });
  if (title) {
    modal.append(h('div.modal-head',
      h('h2.modal-title', title),
      h('button.modal-close', { type: 'button', 'aria-label': 'Закрыть', onclick: () => api.close() }, icon('close', 6, 1.6))));
  }
  if (body) modal.append(...[].concat(body));
  if (foot) modal.append(h('div.modal-foot', foot));
  const overlay = h('div.overlay', modal);
  let downOnOverlay = false;
  overlay.addEventListener('mousedown', (e) => { downOnOverlay = e.target === overlay; });
  overlay.addEventListener('click', (e) => { if (e.target === overlay && downOnOverlay) api.close(); });

  const api = {
    el: modal,
    escClose,
    closed: false,
    close(result) {
      if (api.closed) return;
      api.closed = true;
      overlay.remove();
      stack.splice(stack.indexOf(api), 1);
      onClose?.(result);
      if (prevFocus && document.contains(prevFocus)) prevFocus.focus?.();
    },
  };
  stack.push(api);
  document.body.append(overlay);
  requestAnimationFrame(() => {
    const first = modal.querySelector('[autofocus], input:not([type=hidden]), textarea, .btn-primary, button');
    first?.focus?.();
  });
  return api;
}

/** Close every open modal (e.g. when the page changes). */
export function closeAllModals() { [...stack].reverse().forEach((m) => m.close()); }

/** Confirmation dialog in the А3 style (red warning icon). Resolves true/false. */
export function confirmDialog({ title, text, confirm = 'Удалить', kind = 'danger', width = 480 }) {
  return new Promise((resolve) => {
    let ok = false;
    const m = openModal({
      width, label: title, onClose: () => resolve(ok),
      body: [
        h('button.modal-close.dialog-close', { type: 'button', 'aria-label': 'Закрыть', onclick: () => m.close() }, icon('close', 6, 1.6)),
        h('div.dialog-head',
          h('div.dialog-icon', icon('warn', 9)),
          h('div', h('div.dialog-title', title), text ? h('div.dialog-sub', text) : null)),
        h('div', { style: { height: '28px' } }),
        h('div.dialog-foot',
          h('button.btn.btn-secondary.btn-lg', { type: 'button', style: { width: '96px' }, onclick: () => m.close() }, 'Отмена'),
          h(`button.btn.btn-${kind}.btn-lg`, { type: 'button', autofocus: true, onclick: () => { ok = true; m.close(); } }, confirm)),
      ],
    });
  });
}
