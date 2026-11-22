/* DOM helpers and Russian formatting */

/** h('div.card.is-done', {onclick, dataset, style, attrs...}, ...children) */
export function h(tag, props, ...children) {
  const [name, ...classes] = tag.split('.');
  const el = document.createElement(name || 'div');
  if (classes.length) el.className = classes.join(' ');
  if (props && (typeof props !== 'object' || props instanceof Node || Array.isArray(props))) {
    children.unshift(props);
    props = null;
  }
  if (props) {
    for (const [k, v] of Object.entries(props)) {
      if (v == null || v === false) continue;
      if (k === 'class') el.className += (el.className ? ' ' : '') + v;
      else if (k === 'style' && typeof v === 'object') Object.assign(el.style, v);
      else if (k === 'dataset') Object.assign(el.dataset, v);
      else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2).toLowerCase(), v);
      else if (k === 'html') el.innerHTML = v;
      else if (k in el && typeof v !== 'string') el[k] = v;
      else el.setAttribute(k, v === true ? '' : v);
    }
  }
  append(el, children);
  return el;
}

export function append(el, children) {
  for (const c of children.flat(Infinity)) {
    if (c == null || c === false || c === true) continue;
    el.append(c instanceof Node ? c : document.createTextNode(String(c)));
  }
  return el;
}

export function fromHTML(html) {
  const t = document.createElement('template');
  t.innerHTML = html.trim();
  return t.content.firstElementChild;
}

export function clear(el) { while (el.firstChild) el.firstChild.remove(); return el; }

export function plural(n, one, few, many) {
  const m10 = n % 10, m100 = n % 100;
  if (m10 === 1 && m100 !== 11) return one;
  if (m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14)) return few;
  return many;
}
export const pl = (n, one, few, many) => `${n} ${plural(n, one, few, many)}`;

export function verb(user, masc, fem) {
  if (user?.gender === 'f') return fem;
  if (user?.gender === 'm') return masc;
  return `${masc}(а)`;
}

/* ---------------------------------------------------------------- dates */
const MON_SHORT = ['янв', 'фев', 'мар', 'апр', 'мая', 'июн', 'июл', 'авг', 'сен', 'окт', 'ноя', 'дек'];
const MON_LONG = ['января', 'февраля', 'марта', 'апреля', 'мая', 'июня', 'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря'];

export function parseDate(iso) { // 'YYYY-MM-DD' → local Date at midnight
  if (!iso) return null;
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, m - 1, d);
}
export function toISODate(d) {
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}
export function today() { const d = new Date(); d.setHours(0, 0, 0, 0); return d; }
export const todayISO = () => toISODate(today());
export function daysBetween(a, b) { return Math.round((b - a) / 86400000); }

export function fmtShort(iso) {
  const d = parseDate(iso);
  if (!d) return '';
  const s = `${d.getDate()} ${MON_SHORT[d.getMonth()]}`;
  return d.getFullYear() === today().getFullYear() ? s : `${s} ${d.getFullYear()}`;
}
export function fmtLong(iso) {
  const d = parseDate(iso);
  return d ? `${d.getDate()} ${MON_LONG[d.getMonth()]} ${d.getFullYear()}` : '';
}
export function fmtDMY(iso) {
  const d = parseDate(iso);
  if (!d) return '';
  return `${String(d.getDate()).padStart(2, '0')}.${String(d.getMonth() + 1).padStart(2, '0')}.${d.getFullYear()}`;
}
export function relDue(iso) {
  const n = daysBetween(today(), parseDate(iso));
  if (n === 0) return 'сегодня';
  if (n === 1) return 'завтра';
  if (n === -1) return 'просрочено на 1 день';
  if (n < 0) return `просрочено на ${pl(-n, 'день', 'дня', 'дней')}`;
  return `через ${pl(n, 'день', 'дня', 'дней')}`;
}

const pad2 = (n) => String(n).padStart(2, '0');
export function fmtWhen(isoUtc) {
  const d = new Date(isoUtc);
  const time = `${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
  const day = new Date(d); day.setHours(0, 0, 0, 0);
  const diff = daysBetween(day, today());
  if (diff === 0) return `сегодня, ${time}`;
  if (diff === 1) return `вчера, ${time}`;
  const y = d.getFullYear() === today().getFullYear() ? '' : ` ${d.getFullYear()}`;
  return `${d.getDate()} ${MON_SHORT[d.getMonth()]}${y}, ${time}`;
}
/** '22 ноя, 10:14' (always with the date) */
export function fmtStamp(isoUtc) {
  const d = new Date(isoUtc);
  const y = d.getFullYear() === today().getFullYear() ? '' : ` ${d.getFullYear()}`;
  return `${d.getDate()} ${MON_SHORT[d.getMonth()]}${y}, ${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
}
export function fmtAgo(isoUtc) {
  const d = new Date(isoUtc);
  const min = Math.floor((Date.now() - d.getTime()) / 60000);
  if (min < 1) return 'только что';
  if (min < 60) return `${min} мин назад`;
  const day = new Date(d); day.setHours(0, 0, 0, 0);
  const days = daysBetween(day, today());
  if (days === 0) return `${pl(Math.floor(min / 60), 'час', 'часа', 'часов')} назад`;
  if (days === 1) return 'вчера';
  if (days < 7) return `${pl(days, 'день', 'дня', 'дней')} назад`;
  return fmtShort(toISODate(d));
}

export const PRIORITY = {
  high: { label: 'Высокий', order: 0 },
  mid: { label: 'Средний', order: 1 },
  low: { label: 'Низкий', order: 2 },
};

export function debounce(fn, ms = 200) {
  let t;
  return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); };
}

export function isEmail(s) { return /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test((s || '').trim()); }

export function focusLater(el, select = false) {
  requestAnimationFrame(() => { el?.focus(); if (select) el?.select?.(); });
}
