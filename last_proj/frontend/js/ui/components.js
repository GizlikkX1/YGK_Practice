/* Small reusable UI pieces from the mockup */
import { h, PRIORITY, fmtDMY } from '../utils.js';
import { icon } from '../icons.js';

/** Avatar with initials. d = diameter in px (mockup: 22, 24, 26, 28, 30). */
export function avatar(user, d = 24, extra = {}) {
  if (!user) return emptyAvatar(d);
  const fs = Math.round(d * 0.39 * 10) / 10;
  return h('span.avatar', {
    style: { width: `${d}px`, height: `${d}px`, fontSize: `${fs}px`, background: user.color },
    title: user.name, ...extra,
  }, user.initials);
}

export function emptyAvatar(d = 24) {
  const el = icon('emptyAvatar', d);
  el.setAttribute('aria-label', 'Не назначен');
  return el;
}

export function avatarStack(users, d = 28, max = 4) {
  const shown = users.slice(0, max);
  const rest = users.length - shown.length;
  const overlap = -(d - d * 0.8); // centres are 1.6·r apart, as in the mockup
  const el = h('span.avatar-stack', { style: { '--overlap': `${overlap}px` } },
    shown.map((u) => avatar(u, d)));
  if (rest > 0) {
    el.append(h('span.avatar.avatar-extra', {
      style: { width: `${d}px`, height: `${d}px`, fontSize: `${Math.round(d * 0.36 * 10) / 10}px` },
      title: users.slice(max).map((u) => u.name).join(', '),
    }, `+${rest}`));
  }
  return el;
}

export function priorityPill(p) {
  return h(`span.pill.pill-dot.pill-${p}`, PRIORITY[p].label);
}

export function button(label, { kind = 'primary', size = '', icon: ic, width, onClick, disabled, type = 'button', attrs = {} } = {}) {
  const cls = `button.btn.btn-${kind}${size ? `.btn-${size}` : ''}`;
  return h(cls, { type, onclick: onClick, disabled, style: width ? { width: `${width}px` } : null, ...attrs },
    ic || null, label);
}

export function plusIcon() { return icon('plus', 5.5, 1.9); }

export function errorLine(text) {
  return h('div.field-error', h('span.err-dot', '!'), text);
}

export function fieldLabel(text, { req = false, forId } = {}) {
  return h('label.label', { for: forId }, text, req ? h('span.req', '*') : null);
}

/**
 * Date field «дд.мм.гггг» — looks the same in every browser locale (as in the mockup);
 * the native calendar opens from the icon. onChange({iso, invalid}).
 */
export function dateField({ id, value = null, min, onChange }) {
  const text = h('input.input', { id, type: 'text', inputmode: 'numeric', placeholder: 'дд.мм.гггг', autocomplete: 'off', maxlength: 10 });
  text.value = value ? fmtDMY(value) : '';
  const native = h('input.date-native', { type: 'date', tabindex: '-1', 'aria-hidden': 'true', min });
  const btn = h('button.date-btn', { type: 'button', 'aria-label': 'Открыть календарь' }, icon('calendar', 14));
  const parse = (raw) => {
    const s = raw.trim();
    if (!s) return { iso: null, invalid: false, complete: true };
    const m = /^(\d{2})\.(\d{2})\.(\d{4})$/.exec(s);
    if (!m) return { iso: null, invalid: true, complete: s.length >= 10 };
    const [, d, mo, y] = m;
    const dt = new Date(Number(y), Number(mo) - 1, Number(d));
    const ok = dt.getFullYear() === Number(y) && dt.getMonth() === Number(mo) - 1 && dt.getDate() === Number(d);
    return ok ? { iso: `${y}-${mo}-${d}`, invalid: false, complete: true } : { iso: null, invalid: true, complete: true };
  };
  const emit = () => onChange(parse(text.value));
  text.addEventListener('input', (e) => {
    if (!(e.inputType || '').startsWith('delete')) {
      const digits = text.value.replace(/\D/g, '').slice(0, 8);
      text.value = digits.slice(0, 2) + (digits.length > 2 ? `.${digits.slice(2, 4)}` : '') + (digits.length > 4 ? `.${digits.slice(4)}` : '');
    }
    emit();
  });
  text.addEventListener('blur', () => onChange({ ...parse(text.value), blurred: true }));
  btn.addEventListener('click', () => {
    native.value = parse(text.value).iso || '';
    try { native.showPicker(); } catch { native.focus(); native.click(); }
  });
  native.addEventListener('change', () => { text.value = native.value ? fmtDMY(native.value) : ''; emit(); text.focus(); });
  return { el: h('div.date-input', text, native, btn), input: text };
}

export function colDot(color, cls = 'col-dot') {
  return h(`span.${cls}`, { style: { background: color } });
}
