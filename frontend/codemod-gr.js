#!/usr/bin/env node
/* Codemod: map legacy class tokens -> gooseroot gr-* classes inside className attrs.
   Only edits string literals within className={...}/"..." so identifiers are safe. */
const fs = require('fs');
const path = require('path');

const SRC = path.join(__dirname, 'src');

// token -> replacement (longest tokens first wins naturally since we match whole tokens)
const MAP = {
  'btn-primary': 'gr-btn--primary',
  'btn-secondary': 'gr-btn--secondary',
  'btn-success': 'gr-btn--success',
  'btn-danger': 'gr-btn--danger',
  'btn-warning': 'gr-btn--soft',
  'btn-outline': 'gr-btn--secondary',
  'btn-ghost': 'gr-btn--ghost',
  'btn-ink': 'gr-btn--ink',
  'btn-sm': 'gr-btn--sm',
  'btn-xs': 'gr-btn--sm',
  'btn-lg': 'gr-btn--lg',
  'btn-full': 'gr-btn--block',
  'btn-block': 'gr-btn--block',
  'btn': 'gr-btn',

  'close-btn': 'gr-iconbtn',
  'action-btn': 'gr-iconbtn gr-iconbtn--sm',
  'icon-btn': 'gr-iconbtn',
  'inv-icon-btn': 'gr-iconbtn gr-iconbtn--sm',
  'section-icon-btn': 'gr-iconbtn gr-iconbtn--sm',
  'qty-btn': 'pos-qtybtn',
  'quantity-btn': 'pos-qtybtn',

  'modal-overlay': 'gr-modal-live is-open',
  'modal-header': 'gr-modal__head',
  'modal-footer': 'gr-modal__foot',
  'modal-body': 'gr-modal__body',
  'modal': 'gr-modal',

  'card-header': 'gr-card__head',
  'card-title': 'gr-h3',
  'card-body': 'gr-card__body',
  'card-footer': 'gr-card__foot',
  'card': 'gr-card',

  'form-group': 'gr-field',
  'form-row': 'gr-grid gr-form2',
  'form-input': 'gr-input',
  'form-select': 'gr-select',
  'form-textarea': 'gr-textarea',
  'form-label': 'gr-field__label',
  'form-check': 'gr-check',
  'checkbox': 'gr-check',
  'toggle-switch': 'gr-switch',
  'switch': 'gr-switch',

  'badge-success': 'gr-badge--success',
  'badge-primary': 'gr-badge--red',
  'badge-warning': 'gr-badge--red',
  'badge-danger': 'gr-badge--danger',
  'badge-error': 'gr-badge--danger',
  'badge-info': 'gr-badge--red',
  'badge-neutral': 'gr-badge--neutral',
  'badge-secondary': 'gr-badge--neutral',
  'badge': 'gr-badge',

  'empty-state': 'gr-empty',
  'empty': 'gr-empty',

  'pagination': 'gr-pager',

  'stat-card': 'gr-card pos-stat',
  'stat-icon': 'gr-well',
  'stat-value': 'gr-stat__value',
  'stat-label': 'gr-caption',

  'card-icon': 'gr-well',
  'card-value': 'gr-stat__value',
  'card-label': 'gr-caption',
  'card-content': 'gr-stat__top',

  'table-scroll-container': 'gr-tablewrap',
  'table-container': 'gr-tablewrap',
  'table-wrap': 'gr-tablewrap',
  'table-wrapper': 'gr-tablewrap',
  'items-table': 'gr-table',
  'inv-table': 'gr-table',
  'users-table': 'gr-table',
  'stores-table': 'gr-table',
  'expenses-table': 'gr-table',
  'orders-table': 'gr-table',
  'history-table': 'gr-table',
  'data-table': 'gr-table',
  'table': 'gr-table',

  'loading-container': 'pos-loader',
  'spinner': 'gr-spin',

  'detail-row': 'pos-kv',
  'detail-label': 'pos-kv__label',
  'detail-value': 'pos-kv__value',

  'nav-tabs': 'gr-tabs',
  'tab-bar': 'gr-tabs',
  'tabs': 'gr-tabs',
  'tab-btn': 'gr-tab',
  'nav-tab': 'gr-tab',

  'dropdown-menu': 'gr-menu',
  'context-menu': 'gr-menu',
  'menu-item': 'gr-menu__item',
  'dropdown-item': 'gr-menu__item',
  'menu-sep': 'gr-menu__sep',

  'alert': 'gr-alert',
  'tooltip': 'gr-tooltip',
  'kbd': 'gr-kbd',
};

const tokens = Object.keys(MAP).sort((a, b) => b.length - a.length);
const tokenRe = new RegExp('(^|[^\\w-])(' + tokens.map(t => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|') + ')(?![\\w-])', 'g');

function transformStringLiteral(s) {
  return s.replace(tokenRe, (m, pre, tok) => pre + MAP[tok]);
}

function transformTemplate(tpl) {
  // Replace in literal chunks only — mask ${...} expressions
  const parts = [];
  let out = '', i = 0;
  while (i < tpl.length) {
    const j = tpl.indexOf('${', i);
    if (j === -1) { out += transformStringLiteral(tpl.slice(i)); break; }
    out += transformStringLiteral(tpl.slice(i, j));
    // find matching } (naive brace matching)
    let depth = 1, k = j + 2;
    while (k < tpl.length && depth > 0) {
      if (tpl[k] === '{') depth++;
      else if (tpl[k] === '}') depth--;
      k++;
    }
    out += tpl.slice(j, k);
    i = k;
  }
  return out;
}

function transformFile(text) {
  let changed = false;
  // Handle className="..." and className='...'
  let res = text.replace(/className="([^"]*)"/g, (m, inner) => {
    const t = transformStringLiteral(inner);
    if (t !== inner) changed = true;
    return `className="${t}"`;
  });
  res = res.replace(/className='([^']*)'/g, (m, inner) => {
    const t = transformStringLiteral(inner);
    if (t !== inner) changed = true;
    return `className='${t}'`;
  });
  // className={`...`} — template may contain ${}
  res = res.replace(/className=\{`((?:[^`\\]|\\.)*)`\}/g, (m, inner) => {
    const t = transformTemplate(inner);
    if (t !== inner) changed = true;
    return `className={\`${t}\`}`;
  });
  // className={'...'} / className={"..."} already covered above for simple strings in braces
  res = res.replace(/className=\{'([^']*)'\}/g, (m, inner) => {
    const t = transformStringLiteral(inner);
    if (t !== inner) changed = true;
    return `className={'${t}'}`;
  });
  return { text: res, changed };
}

function walk(dir) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (e.name === '.DS_Store') continue;
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p);
    else if (/\.(tsx|ts|jsx|js)$/.test(e.name)) {
      const text = fs.readFileSync(p, 'utf8');
      const { text: out, changed } = transformFile(text);
      if (changed) {
        fs.writeFileSync(p, out);
        console.log('updated', path.relative(SRC, p));
      }
    }
  }
}

walk(SRC);
console.log('done');
