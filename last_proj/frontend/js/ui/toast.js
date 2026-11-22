/* Notifications: light toasts (А6) and the dark snackbar with «Отменить» (М6) */
import { h } from '../utils.js';
import { icon } from '../icons.js';

let container = null;
function host() {
  if (!container || !document.body.contains(container)) {
    container = h('div.toasts', { role: 'status', 'aria-live': 'polite' });
    document.body.append(container);
  }
  return container;
}

function leave(el) {
  if (!el.isConnected) return;
  el.classList.add('is-leaving');
  setTimeout(() => el.remove(), 180);
}

/** toast({kind: 'info'|'error', title, body, action: {label, onClick}, timeout}) */
export function toast({ kind = 'info', title, body, action, timeout = 6000, key }) {
  const root = host();
  if (key) root.querySelector(`[data-key="${key}"]`)?.remove();
  const el = h(`div.toast${kind === 'error' ? '.is-error' : ''}`, { dataset: key ? { key } : undefined },
    h('span.toast-icon', kind === 'error' ? icon('warn', 7) : icon('info', 8)),
    h('div.toast-title', title),
    body ? h('div.toast-body', body) : null,
    action ? h('button.btn.btn-secondary.btn-sm', { type: 'button', onclick: () => { leave(el); action.onClick(); } }, action.label) : null,
    h('button.icon-btn.toast-close', { type: 'button', 'aria-label': 'Закрыть', onclick: () => leave(el) }, icon('close', 4.5, 1.6)));
  root.append(el);
  while (root.children.length > 3) root.firstElementChild.remove();
  if (timeout) setTimeout(() => leave(el), timeout);
  return { close: () => leave(el) };
}

export const errorToast = (title, body) => toast({ kind: 'error', title, body });

let snack = null;
/** Dark snackbar at the bottom of the board area (single instance). */
export function snackbar(text, action, timeout = 6000) {
  snack?.remove();
  const el = h('div.snackbar', { role: 'status', 'aria-live': 'polite' },
    h('span.snack-icon', icon('check', 0.85, 1.8)),
    h('span.snack-text.truncate', text),
    action ? h('button.snack-action', { type: 'button', onclick: () => { leave(el); action.onClick(); } }, action.label) : null);
  document.body.append(el);
  snack = el;
  setTimeout(() => leave(el), timeout);
}
