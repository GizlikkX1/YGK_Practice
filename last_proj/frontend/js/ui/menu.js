/* Dropdown menus with submenus and keyboard support (А3 column menu, А4 card menu, filters) */
import { h } from '../utils.js';
import { icon } from '../icons.js';
import { avatar, emptyAvatar } from './components.js';

let active = null;

export function closeMenus() { active?.close(); }

/**
 * items: [{label, kind:'danger'|'muted', dot, tag, final, check, kbd, disabled, user, emptyUser,
 *          sub: items | () => items, subTitle, onSelect}, {sep: true}]
 */
export function openMenu(anchor, items, { align = 'left', width, title, placement = 'bottom', onClose, offset = 4 } = {}) {
  closeMenus();
  const layer = h('div.popover-layer');
  const menus = [];
  let closed = false;

  const state = {
    close() {
      if (closed) return;
      closed = true;
      layer.remove();
      menus.forEach((m) => m.remove());
      anchor?.setAttribute?.('aria-expanded', 'false');
      window.removeEventListener('resize', state.close);
      document.removeEventListener('scroll', onScroll, true);
      if (active === state) active = null;
      onClose?.();
    },
  };
  const onScroll = (e) => { if (!menus.some((m) => m.contains(e.target))) state.close(); };
  layer.addEventListener('mousedown', (e) => { if (e.target === layer) state.close(); });
  layer.addEventListener('contextmenu', (e) => { e.preventDefault(); state.close(); });

  function build(list, level, menuTitle, w) {
    const el = h('div.menu', { role: 'menu', tabindex: '-1', style: w ? { width: `${w}px` } : null });
    if (menuTitle) el.append(h('div.menu-title', menuTitle));
    const buttons = [];
    let child = null;
    const closeChild = () => { if (child) { child.remove(); menus.splice(menus.indexOf(child), 1); child = null; } };

    for (const it of list) {
      if (it.sep) { el.append(h('div.menu-sep', { role: 'separator' })); continue; }
      const btn = h(`button.menu-item${it.kind === 'danger' ? '.is-danger' : ''}${it.kind === 'muted' ? '.is-muted' : ''}`, {
        type: 'button', role: 'menuitem', disabled: it.disabled, 'aria-haspopup': it.sub ? 'menu' : null,
      });
      if (it.user) btn.append(avatar(it.user, 22));
      else if (it.emptyUser) btn.append(emptyAvatar(22));
      if (it.dot) btn.append(h('span.menu-dot', { style: { background: it.dot } }));
      btn.append(h('span.truncate', it.label));
      if (it.tag) btn.append(h('span.pill.pill-tag', it.tag));
      if (it.final) btn.append(h('span.pill.pill-final', 'финальная'));
      if (it.kbd) btn.append(h('span.menu-right', it.kbd));
      if (it.check) btn.append(h('span.menu-check', icon('check', 0.9, 1.8)));
      if (it.sub) btn.append(h('span.menu-sub', icon('chevRight', 4.5, 1.6)));

      const openChild = (focus) => {
        closeChild();
        const subItems = typeof it.sub === 'function' ? it.sub() : it.sub;
        child = build(subItems, level + 1, it.subTitle, it.subWidth || 240);
        document.body.append(child);
        menus.push(child);
        const pr = el.getBoundingClientRect();
        const br = btn.getBoundingClientRect();
        const titleH = it.subTitle ? 28 : 0;
        let left = pr.right + 4;
        if (left + child.offsetWidth > innerWidth - 8) left = pr.left - 4 - child.offsetWidth;
        let top = br.top - 1 - 7 - titleH - 1;
        top = Math.max(8, Math.min(top, innerHeight - child.offsetHeight - 8));
        Object.assign(child.style, { left: `${left}px`, top: `${top}px` });
        btn.classList.add('is-active');
        if (focus) child._focusFirst();
      };

      btn.addEventListener('mouseenter', () => {
        buttons.forEach((b) => b !== btn && b.classList.remove('is-active'));
        if (it.sub && !it.disabled) openChild(false);
        else { closeChild(); }
      });
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        if (it.disabled) return;
        if (it.sub) { openChild(true); return; }
        state.close();
        it.onSelect?.();
      });
      btn._openChild = openChild;
      buttons.push(btn);
      el.append(btn);
    }

    const enabled = () => buttons.filter((b) => !b.disabled);
    el._focusFirst = () => { const f = enabled()[0]; f?.focus(); };
    el.addEventListener('keydown', (e) => {
      const list2 = enabled();
      const i = list2.indexOf(document.activeElement);
      if (e.key === 'ArrowDown') { e.preventDefault(); list2[(i + 1) % list2.length]?.focus(); }
      else if (e.key === 'ArrowUp') { e.preventDefault(); list2[(i - 1 + list2.length) % list2.length]?.focus(); }
      else if (e.key === 'ArrowRight' && i >= 0 && list2[i]._openChild && list2[i].getAttribute('aria-haspopup')) {
        e.preventDefault(); list2[i]._openChild(true);
      } else if (e.key === 'ArrowLeft' && level > 0) {
        e.preventDefault(); e.stopPropagation();
        const parent = menus[menus.indexOf(el) - 1];
        el.remove(); menus.splice(menus.indexOf(el), 1);
        parent?.querySelector('.menu-item.is-active')?.focus();
      } else if (e.key === 'Escape' || e.key === 'Tab') {
        e.preventDefault(); e.stopPropagation(); state.close(); anchor?.focus?.();
      }
    });
    return el;
  }

  const root = build(items, 0, title, width);
  document.body.append(layer, root);
  menus.push(root);

  // position next to the anchor
  const ar = anchor.getBoundingClientRect();
  const mw = root.offsetWidth, mh = root.offsetHeight;
  let left = align === 'right' ? ar.right - mw : ar.left;
  let top = placement === 'top' ? ar.top - offset - mh : ar.bottom + offset;
  if (top + mh > innerHeight - 8) top = ar.top - offset - mh;
  if (top < 8) top = Math.min(ar.bottom + offset, innerHeight - mh - 8);
  left = Math.max(8, Math.min(left, innerWidth - mw - 8));
  Object.assign(root.style, { left: `${left}px`, top: `${Math.max(8, top)}px` });

  anchor?.setAttribute?.('aria-expanded', 'true');
  window.addEventListener('resize', state.close);
  document.addEventListener('scroll', onScroll, true);
  active = state;
  requestAnimationFrame(() => root._focusFirst());
  return state;
}

/** Place a free-form popover element next to an anchor (used by pickers). */
export function placePopover(el, anchor, { gap = 6, align = 'left' } = {}) {
  const ar = anchor.getBoundingClientRect();
  const w = el.offsetWidth, hgt = el.offsetHeight;
  let left = align === 'right' ? ar.right - w : ar.left;
  left = Math.max(8, Math.min(left, innerWidth - w - 8));
  let top = ar.bottom + gap;
  if (top + hgt > innerHeight - 8) top = Math.max(8, ar.top - gap - hgt);
  Object.assign(el.style, { left: `${left}px`, top: `${top}px` });
}
