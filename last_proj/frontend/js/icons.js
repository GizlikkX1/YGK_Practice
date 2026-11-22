/* Icons — same geometry as the mockup generator (lib.py), drawn with currentColor */
import { fromHTML } from './utils.js';

const r = (n) => Math.round(n * 100) / 100;
const svg = (w, h, body, cls = '') =>
  `<svg class="ic ${cls}" width="${r(w)}" height="${r(h)}" viewBox="0 0 ${r(w)} ${r(h)}" fill="none" aria-hidden="true" focusable="false">${body}</svg>`;
const st = (sw) => `stroke="currentColor" stroke-width="${sw}" stroke-linecap="round" stroke-linejoin="round"`;

const ICONS = {
  calendar: (s = 14) => svg(s, s,
    `<rect x=".75" y="2" width="${s - 1.5}" height="${s - 2.75}" rx="2.5" stroke="currentColor" stroke-width="1.4"/>` +
    `<path d="M.75 6H${s - .75}" stroke="currentColor" stroke-width="1.4"/>` +
    `<path d="M4.5 .7V3.5M${s - 4.5} .7V3.5" ${st(1.4)}/>`),
  search: (s = 14) => svg(s + 1, s + 1,
    `<circle cx="${s * .43 + .5}" cy="${s * .43 + .5}" r="${s * .32}" stroke="currentColor" stroke-width="1.6"/>` +
    `<path d="M${s * .68 + .5} ${s * .68 + .5}L${s * .95 + .5} ${s * .95 + .5}" ${st(1.6)}/>`),
  plus: (s = 6, sw = 1.8) => { const w = 2 * s + sw; const c = w / 2; return svg(w, w, `<path d="M${sw / 2} ${c}H${w - sw / 2}M${c} ${sw / 2}V${w - sw / 2}" ${st(sw)}/>`); },
  close: (s = 5, sw = 1.6) => { const w = 2 * s + sw; const a = sw / 2, b = w - sw / 2; return svg(w, w, `<path d="M${a} ${a}L${b} ${b}M${a} ${b}L${b} ${a}" ${st(sw)}/>`); },
  chev: (s = 4.5, sw = 1.6) => { const p = sw / 2; return svg(2 * s + sw, s + sw, `<path d="M${p} ${p}L${s + p} ${s + p}L${2 * s + p} ${p}" ${st(sw)}/>`); },
  chevRight: (s = 4.5, sw = 1.6) => { const p = sw / 2; return svg(s + sw, 2 * s + sw, `<path d="M${p} ${p}L${s + p} ${s + p}L${p} ${2 * s + p}" ${st(sw)}/>`); },
  dots: (rad = 1.6, gap = 5) => svg(2 * gap + 2 * rad, 2 * rad,
    [0, 1, 2].map((i) => `<circle cx="${rad + i * gap}" cy="${rad}" r="${rad}" fill="currentColor"/>`).join('')),
  check: (k = 1, sw = 1.8) => { const p = sw / 2 + .2; const x0 = 4 * k + p, y0 = 3 * k + p;
    return svg(8.2 * k + 2 * p, 5.8 * k + 2 * p, `<path d="M${x0 - 4 * k} ${y0}L${x0 - 1.2 * k} ${y0 + 2.8 * k}L${x0 + 4.2 * k} ${y0 - 3 * k}" ${st(sw)}/>`); },
  grip: () => svg(8, 13, [0, 1, 2].flatMap((i) => [0, 1].map((j) => `<circle cx="${1.5 + j * 5}" cy="${1.5 + i * 5}" r="1.5" fill="currentColor"/>`)).join('')),
  board: () => svg(17.5, 14,
    `<rect width="4.5" height="14" rx="1.5" fill="currentColor"/><rect x="6.5" width="4.5" height="10" rx="1.5" fill="currentColor"/><rect x="13" width="4.5" height="6" rx="1.5" fill="currentColor"/>`),
  task: () => svg(17, 17,
    `<rect x=".75" y=".75" width="15.5" height="15.5" rx="4" stroke="currentColor" stroke-width="1.5"/>` +
    `<path d="M5.1 8.5L7.48 10.88L12.07 5.95" ${st(1.6)}/>`),
  users: () => svg(18.5, 16.5,
    `<circle cx="6" cy="5" r="3.2" stroke="currentColor" stroke-width="1.5"/>` +
    `<path d="M.5 15.5C1 10 11 10 11.5 15.5" ${st(1.5)}/>` +
    `<circle cx="13" cy="5.5" r="2.6" stroke="currentColor" stroke-width="1.4"/>` +
    `<path d="M13.5 10C16 10.5 17 12.5 17.5 15.5" ${st(1.4)}/>`),
  gear: (s = 16) => { const c = s / 2; let b = '';
    for (let i = 0; i < 8; i++) { const a = i * Math.PI / 4;
      b += `<path d="M${r(c + Math.cos(a) * s * .3)} ${r(c + Math.sin(a) * s * .3)}L${r(c + Math.cos(a) * s * .48)} ${r(c + Math.sin(a) * s * .48)}" ${st(2.2)}/>`; }
    b += `<circle cx="${c}" cy="${c}" r="${r(s * .3)}" stroke="currentColor" stroke-width="1.5"/><circle cx="${c}" cy="${c}" r="${r(s * .11)}" fill="currentColor"/>`;
    return svg(s, s, b); },
  warn: (s = 8) => { const cx = s * 1.05 + 1, cy = s + 1;
    return svg(2 * s * 1.05 + 2, 1.8 * s + 2,
      `<path d="M${r(cx)} ${r(cy - s)}L${r(cx + s * 1.05)} ${r(cy + s * .8)}L${r(cx - s * 1.05)} ${r(cy + s * .8)}Z" ${st(1.6)}/>` +
      `<path d="M${r(cx)} ${r(cy - s * .35)}V${r(cy + s * .2)}" ${st(1.6)}/><circle cx="${r(cx)}" cy="${r(cy + s * .5)}" r=".9" fill="currentColor"/>`); },
  history: (rad = 7) => { const c = rad + 1;
    return svg(2 * c, 2 * c, `<circle cx="${c}" cy="${c}" r="${rad}" stroke="currentColor" stroke-width="1.5"/>` +
      `<path d="M${c} ${r(c - rad * .55)}V${c}L${r(c + rad * .45)} ${r(c + rad * .3)}" ${st(1.5)}/>`); },
  comment: () => svg(16, 15,
    `<path d="M1 2.5Q1 1 2.5 1H13.5Q15 1 15 2.5V9.5Q15 11 13.5 11H6L3 14V11H2.5Q1 11 1 9.5Z" ${st(1.4)}/>`),
  cloudOff: () => svg(25, 21,
    `<path d="M5 16Q1 16 1 12Q1 8 5 8Q7 3 13 3Q19 3 20 9Q24 9 24 12.5Q24 16 20 16Z" ${st(1.5)}/>` +
    `<path d="M4 1L22 19" ${st(1.6)}/>`),
  info: (rad = 8) => { const c = rad + 1;
    return svg(2 * c, 2 * c, `<circle cx="${c}" cy="${c}" r="${rad}" stroke="currentColor" stroke-width="1.5"/>` +
      `<path d="M${c} ${c - .5}V${c + 4}" ${st(1.6)}/><circle cx="${c}" cy="${c - 3.6}" r="1" fill="currentColor"/>`); },
  star: (rad = 8, filled = false) => { const c = rad + 1; const pts = [];
    for (let i = 0; i < 10; i++) { const a = -Math.PI / 2 + i * Math.PI / 5; const rr = i % 2 === 0 ? rad : rad * .45;
      pts.push(`${r(c + Math.cos(a) * rr)} ${r(c + Math.sin(a) * rr)}`); }
    return svg(2 * c, 2 * c, `<path d="M${pts.join('L')}Z" fill="${filled ? 'currentColor' : 'none'}" ${st(1.3)}/>`); },
  arrowLeft: () => svg(16, 12, `<path d="M6 1L1 6L6 11M1 6H15" ${st(1.6)}/>`),
  emptyAvatar: (d = 24) => { const rad = d / 2 - .6; const c = d / 2; const s = (d / 2) * .38;
    return svg(d, d, `<circle cx="${c}" cy="${c}" r="${rad}" fill="#fff" stroke="currentColor" stroke-width="1.2" stroke-dasharray="3 2.5"/>` +
      `<path d="M${r(c - s)} ${c}H${r(c + s)}M${c} ${r(c - s)}V${r(c + s)}" ${st(1.4)}/>`, 'avatar-empty'); },
};

export function icon(name, ...args) { return fromHTML(ICONS[name](...args)); }
export function iconHTML(name, ...args) { return ICONS[name](...args); }
