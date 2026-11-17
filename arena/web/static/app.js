/* Arena Desktop — local interface controller
 * Unofficial client shell. No direct requests to arena.ai.
 * The only optional simulated data lives behind ?demo=1.
 *
 * AUTO-GENERATED — edit source files in js/ instead.
 * Rebuild: python scripts/build-js.py
 */
(() => {
  'use strict';

  if (window.__arenaDesktopApp) return;
  window.__arenaDesktopApp = true;

  // ═══ 01-core.js ═══
  const DEMO = new URLSearchParams(window.location.search).get('demo') === '1';
  const $ = (selector, root = document) => root.querySelector(selector);
  const $$ = (selector, root = document) => Array.from(root.querySelectorAll(selector));
  const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
  const esc = (value) => String(value ?? '').replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[ch]);
  const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

  /* ---------------------------------------------------------------------- */
  /* Icons: static, local SVG only. Never derived from server/model text.   */
  /* ---------------------------------------------------------------------- */
  const ICONS = {
    plus: '<path d="M12 5v14M5 12h14"/>',
    'panel-left': '<rect x="3" y="4" width="18" height="16" rx="2.5"/><path d="M9 4v16"/>',
    'panel-right': '<rect x="3" y="4" width="18" height="16" rx="2.5"/><path d="M15 4v16"/>',
    layers: '<path d="m12 3 9 5-9 5-9-5 9-5Z"/><path d="m3 13 9 5 9-5"/>',
    search: '<circle cx="11" cy="11" r="6.8"/><path d="m16 16 4.2 4.2"/>',
    clock: '<circle cx="12" cy="12" r="8.7"/><path d="M12 7.6v4.9l3.2 1.8"/>',
    refresh: '<path d="M20 11a8 8 0 1 0-2.1 6.5"/><path d="M20 4v7h-7"/>',
    folder: '<path d="M3.5 6.5a2 2 0 0 1 2-2h4l2 2h7a2 2 0 0 1 2 2v8.8a2 2 0 0 1-2 2h-13a2 2 0 0 1-2-2v-10Z"/>',
    settings: '<circle cx="12" cy="12" r="3.2"/><path d="M19.2 13.5a7.7 7.7 0 0 0 0-3l2-1.6-2-3.4-2.4 1a8.4 8.4 0 0 0-2.6-1.5L14 2.5h-4L9.8 5a8.4 8.4 0 0 0-2.6 1.5l-2.4-1-2 3.4 2 1.6a7.7 7.7 0 0 0 0 3l-2 1.6 2 3.4 2.4-1A8.4 8.4 0 0 0 9.8 19l.2 2.5h4l.2-2.5a8.4 8.4 0 0 0 2.6-1.5l2.4 1 2-3.4-2-1.6Z"/>',
    help: '<circle cx="12" cy="12" r="8.7"/><path d="M9.6 9.2a2.5 2.5 0 1 1 3.5 2.3c-.7.35-1.1.9-1.1 1.7v.4"/><path d="M12 17.2h.01"/>',
    globe: '<circle cx="12" cy="12" r="8.7"/><path d="M3.6 12h16.8M12 3.3c2.2 2.3 3.4 5.3 3.4 8.7s-1.2 6.4-3.4 8.7c-2.2-2.3-3.4-5.3-3.4-8.7S9.8 5.6 12 3.3Z"/>',
    x: '<path d="m6 6 12 12M18 6 6 18"/>',
    'chevron-down': '<path d="m6.5 9 5.5 5.5L17.5 9"/>',
    'chevron-right': '<path d="m9 6.5 5.5 5.5L9 17.5"/>',
    'arrow-up': '<path d="M12 19V5M6.5 10.5 12 5l5.5 5.5"/>',
    stop: '<rect x="6.5" y="6.5" width="11" height="11" rx="1.6" fill="currentColor" stroke="none"/>',
    shield: '<path d="M12 3.2 19 6v5.1c0 4.4-2.9 7.8-7 9.6-4.1-1.8-7-5.2-7-9.6V6l7-2.8Z"/><path d="m9.2 12 1.9 1.9 3.8-4"/>',
    'shield-alert': '<path d="M12 3.2 19 6v5.1c0 4.4-2.9 7.8-7 9.6-4.1-1.8-7-5.2-7-9.6V6l7-2.8Z"/><path d="M12 8v4.5"/><path d="M12 16h.01"/>',
    'wifi-off': '<path d="m3 3 18 18M8.6 15.3a5.2 5.2 0 0 1 6.8 0M5.5 12.2a10.2 10.2 0 0 1 4-2M14.2 9.9a10.2 10.2 0 0 1 4.3 2.3M2.5 8.8A15.8 15.8 0 0 1 7 6.4M12 5c2.1 0 4.1.5 6 1.4M12 20h.01"/>',
    flask: '<path d="M9 3h6M10 3v6.1l-5 8.2A2 2 0 0 0 6.7 20h10.6a2 2 0 0 0 1.7-2.7l-5-8.2V3"/><path d="M7.3 14h9.4"/>',
    trophy: '<path d="M7.5 4h9v5a4.5 4.5 0 0 1-9 0V4Z"/><path d="M7.5 5.5H4.7a2.8 2.8 0 0 0 2.9 4M16.5 5.5h2.8a2.8 2.8 0 0 1-2.9 4M12 13.6v3M8.8 20h6.4M10 20l.6-3.4M14 20l-.6-3.4"/>',
    'thumbs-up': '<path d="M6.8 10.2v9.3H4.3a.8.8 0 0 1-.8-.8v-7.7a.8.8 0 0 1 .8-.8h2.5ZM6.8 12.4l3.9-7.3c1.3-.2 2.4.8 2.3 2l-.6 3.1h5.9c1 0 1.7 1 1.4 1.9l-1.4 5.4a2 2 0 0 1-2 1.5H8.5c-.9 0-1.7-.7-1.7-1.7v-4.9Z"/>',
    'thumbs-down': '<path d="M17.2 13.8V4.5h2.5a.8.8 0 0 1 .8.8v7.7a.8.8 0 0 1-.8.8h-2.5ZM17.2 11.6l-3.9 7.3c-1.3.2-2.4-.8-2.3-2l.6-3.1H5.7c-1 0-1.7-1-1.4-1.9l1.4-5.4a2 2 0 0 1 2-1.5h7.8c.9 0 1.7.7 1.7 1.7v4.9Z"/>',
    scale: '<path d="M12 4v16M7.5 20h9M12 4 6 6.4M12 4l6 2.4M6 6.4 3.4 12a3.4 3.4 0 0 0 5.2 0L6 6.4ZM18 6.4 15.4 12a3.4 3.4 0 0 0 5.2 0L18 6.4Z"/>',
    menu: '<path d="M4 7h16M4 12h16M4 17h16"/>',
    trash: '<path d="M4.8 7h14.4M9.2 7V4.6h5.6V7M7.2 7l.9 13h7.8l.9-13M10 10.5v6M14 10.5v6"/>',
    layout: '<rect x="3.5" y="4.5" width="17" height="15" rx="2"/><path d="M3.5 9h17M9 9v10.5"/>',
    chart: '<path d="M4 20V4M4 20h16"/><path d="M8 16v-4M12.5 16V7.5M17 16v-6"/>',
    gamepad: '<path d="M8.5 8.2h7a4.5 4.5 0 0 1 4.3 3.2l1 3.4a2.4 2.4 0 0 1-4.2 2.1l-1.2-1.5H8.6l-1.2 1.5a2.4 2.4 0 0 1-4.2-2.1l1-3.4a4.5 4.5 0 0 1 4.3-3.2Z"/><path d="M8 11v3M6.5 12.5h3M16 11.5h.01M18 13.5h.01"/>',
    bug: '<rect x="7" y="7.5" width="10" height="12" rx="5"/><path d="M9.5 7.5a2.5 2.5 0 0 1 5 0M4 11h3M17 11h3M4 16h3M17 16h3M8.5 19l-2 2M15.5 19l2 2"/>',
    'git-branch': '<circle cx="6" cy="5" r="2"/><circle cx="18" cy="6" r="2"/><circle cx="6" cy="19" r="2"/><path d="M6 7v10M8 7c4 0 4.5-1 8-1"/>',
    'file-text': '<path d="M7 3.5h7l4 4V20H7z"/><path d="M14 3.5V8h4M9.5 12h5M9.5 15.5h5"/>',
    image: '<rect x="3.5" y="4.5" width="17" height="15" rx="2"/><circle cx="9" cy="9.5" r="1.5"/><path d="m4 17 4.6-4.5 3.3 3 2.4-2.1 5.7 5"/>',
    video: '<rect x="3.5" y="5.5" width="12.5" height="13" rx="2"/><path d="m16 10 4.5-2.5v9L16 14"/>',
    code: '<path d="m8.5 8-4 4 4 4M15.5 8l4 4-4 4M13.5 5l-3 14"/>',
    'search-plus': '<circle cx="10.5" cy="10.5" r="6.4"/><path d="m15.3 15.3 4.2 4.2M10.5 7.8v5.4M7.8 10.5h5.4"/>',
    copy: '<rect x="8.2" y="8.2" width="11.3" height="11.3" rx="2"/><path d="M15.8 8.2V6a1.8 1.8 0 0 0-1.8-1.8H6A1.8 1.8 0 0 0 4.2 6v8a1.8 1.8 0 0 0 1.8 1.8h2.2"/>',
    check: '<path d="m5 12.4 4.4 4.4L19 7"/>',
    package: '<path d="m12 3 8 4.3v9.4L12 21l-8-4.3V7.3L12 3Z"/><path d="m4.3 7.5 7.7 4 7.7-4M12 11.5V21"/>',
    sliders: '<path d="M4 7h9M17 7h3M4 17h3M11 17h9"/><circle cx="15" cy="7" r="2"/><circle cx="9" cy="17" r="2"/>',
    download: '<path d="M12 3.5v11M7.5 10.5 12 15l4.5-4.5M4 19.5h16"/>',
    external: '<path d="M13 4h7v7M20 4l-8 8"/><path d="M18 13v5a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h5"/>',
    terminal: '<rect x="3.5" y="4.5" width="17" height="15" rx="2"/><path d="m7.2 9 2.8 2.7L7.2 14.5M12.4 15h4.2"/>',
    plug: '<path d="M9 3v5M15 3v5M6.8 8h10.4v3.4a5.2 5.2 0 0 1-10.4 0V8Z"/><path d="M12 16.6V21"/>',
    cloud: '<path d="M17.5 18.2a4.2 4.2 0 0 0 .6-8.36A6.2 6.2 0 0 0 6.5 7.7 5.2 5.2 0 0 0 6.8 18z"/>',
    braces: '<path d="M8 4H7a3 3 0 0 0-3 3v2.5A2.5 2.5 0 0 1 1.8 12 2.5 2.5 0 0 1 4 14.5V17a3 3 0 0 0 3 3h1M16 4h1a3 3 0 0 1 3 3v2.5a2.5 2.5 0 0 0 2.2 2.5A2.5 2.5 0 0 0 20 14.5V17a3 3 0 0 1-3 3h-1"/>',
    info: '<circle cx="12" cy="12" r="8.7"/><path d="M12 10.5v5.2M12 7.8h.01"/>',
    alert: '<path d="M10.3 4.6a2 2 0 0 1 3.4 0l7.4 12.7a2 2 0 0 1-1.7 3H4.6a2 2 0 0 1-1.7-3L10.3 4.6Z"/><path d="M12 9v4M12 16.4h.01"/>',
    lock: '<rect x="4.8" y="10" width="14.4" height="10.5" rx="2"/><path d="M8.2 10V7.5a3.8 3.8 0 0 1 7.6 0V10M12 14v2.4"/>',
    user: '<circle cx="12" cy="8.5" r="3.7"/><path d="M4.8 20a7.2 7.2 0 0 1 14.4 0"/>',
    login: '<path d="M14 4h4a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-4M9 8l4 4-4 4M13 12H3.5"/>',
    logout: '<path d="M10 4H6a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h4M15 8l4 4-4 4M19 12H9"/>',
    mail: '<rect x="3.5" y="5.2" width="17" height="14" rx="2"/><path d="m4.5 7 7.5 6 7.5-6"/>',
    file: '<path d="M7 3.5h7l4 4V20H7z"/><path d="M14 3.5V8h4"/>',
    archive: '<rect x="3.5" y="4.5" width="17" height="5" rx="1.2"/><path d="M5 9.5V20h14V9.5M9.5 13h5"/>',
    spark: '<path d="M12 2.8c.55 5.35 3.85 8.65 9.2 9.2-5.35.55-8.65 3.85-9.2 9.2-.55-5.35-3.85-8.65-9.2-9.2 5.35-.55 8.65-3.85 9.2-9.2Z"/>',
    swords: '<path d="M4.5 4.5 15 15M19.5 4.5 9 15M4.5 4.5v3.2M4.5 4.5h3.2M19.5 4.5v3.2M19.5 4.5h-3.2M13.8 13.8 19 19M10.2 13.8 5 19"/>',
    columns: '<rect x="3.5" y="4.5" width="17" height="15" rx="2"/><path d="M12 4.5v15"/>',
    message: '<path d="M20.5 12a8.3 8.3 0 0 1-12 7.2L4 20.5l1.4-4.2A8.3 8.3 0 1 1 20.5 12Z"/>',
    type: '<path d="M5 5h14M12 5v14M9.5 19h5"/>',
    play: '<circle cx="12" cy="12" r="8.7"/><path d="m10 8.5 5 3.5-5 3.5v-7Z"/>',
    'arrow-down': '<path d="M12 5v14M6.5 13.5 12 19l5.5-5.5"/>',
    compress: '<path d="M9.5 3.5 4 9M4 4.8V9h4.2M14.5 3.5 20 9M20 4.8V9h-4.2M9.5 20.5 4 15M4 19.2V15h4.2M14.5 20.5 20 15M20 19.2V15h-4.2"/>',
    'file-code': '<path d="M7 3.5h7l4 4V20H7z"/><path d="M14 3.5V8h4"/><path d="m10 12.5-2 1.5 2 1.5M14 12.5l2 1.5-2 1.5"/>'
  };

  function icon(name, className = '') {
    const body = ICONS[name] || ICONS.info;
    return `<svg${className ? ` class="${className}"` : ''} viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">${body}</svg>`;
  }

  function iconEl(name, className = '') {
    const span = document.createElement('span');
    span.className = `icon${className ? ` ${className}` : ''}`;
    span.setAttribute('aria-hidden', 'true');
    span.innerHTML = icon(name);
    return span;
  }

  function hydrateIcons(root = document) {
    $$('[data-icon]', root).forEach((node) => {
      if (node.dataset.iconReady === '1' || node.querySelector('svg')) return;
      node.innerHTML = icon(node.dataset.icon);
      node.dataset.iconReady = '1';
      node.setAttribute('aria-hidden', 'true');
    });
  }

  /* ---------------------------------------------------------------------- */
  /* Typewriter loading phrases                                            */
  /* ---------------------------------------------------------------------- */
  const _loadingPhrases = [
    "asking Terry", "argmaxxing...", "thinking deeply", "sampling candidates",
    "routing tokens", "consulting the oracle", "parsing intent",
    "reasoning through it", "exploring solutions", "warming up neurons",
    "cross-referencing", "beam searching", "calibrating confidence",
    "attention is all you need", "gradient descending", "softmax engaged",
    "embedding your query", "considering alternatives", "drafting a response",
    "deliberating", "asking the council", "crunching logits",
    "traversing the latent space", "pondering deeply", "assembling thoughts",
    "running inference", "token by token", "weighing probabilities",
    "searching the manifold", "spinning up context"
  ];

  function createThinkingTypewriter() {
    const wrap = el('span', { class: 'loading-block thinking-typewriter' });
    const dot = el('span', { class: 'status-dot is-online' });
    const text = el('span', { class: 'typewriter-text' });
    const cursor = el('span', { class: 'typewriter-cursor' });
    wrap.append(dot, text, cursor);

    let alive = true;
    let used = new Set();
    const pick = () => {
      if (used.size >= _loadingPhrases.length) used.clear();
      let phrase;
      do { phrase = _loadingPhrases[Math.floor(Math.random() * _loadingPhrases.length)]; } while (used.has(phrase));
      used.add(phrase);
      return phrase;
    };

    // The element is created before it is attached, and chat re-renders move
    // it between containers, so a short detach must not end the animation.
    // Only a long absence (the lane finished, chat switched) stops it.
    let detachedSince = 0;
    const attached = async () => {
      while (alive && !wrap.isConnected) {
        if (!detachedSince) detachedSince = Date.now();
        if (Date.now() - detachedSince > 3000) { alive = false; wrap._dead = true; return false; }
        await new Promise(r => setTimeout(r, 60));
      }
      detachedSince = 0;
      return alive;
    };
    const run = async () => {
      while (alive && await attached()) {
        const phrase = pick();
        for (let i = 0; i <= phrase.length && alive; i++) {
          text.textContent = phrase.slice(0, i);
          await new Promise(r => setTimeout(r, 30 + Math.random() * 25));
        }
        await new Promise(r => setTimeout(r, 1200 + Math.random() * 800));
        for (let i = phrase.length; i >= 0 && alive; i--) {
          text.textContent = phrase.slice(0, i);
          await new Promise(r => setTimeout(r, 15));
        }
        await new Promise(r => setTimeout(r, 200));
      }
    };

    run();
    wrap._destroy = () => { alive = false; wrap._dead = true; };
    return wrap;
  }

  /* ---------------------------------------------------------------------- */
  /* Small DOM and formatting helpers                                      */
  /* ---------------------------------------------------------------------- */
  function append(parent, child) {
    if (child === null || child === undefined || child === false) return;
    if (Array.isArray(child)) {
      child.forEach((item) => append(parent, item));
      return;
    }
    if (child instanceof Node) {
      parent.appendChild(child);
      return;
    }
    parent.appendChild(document.createTextNode(String(child)));
  }

  function el(tag, props = {}, ...children) {
    const node = document.createElement(tag);
    for (const [key, value] of Object.entries(props || {})) {
      if (value === null || value === undefined || value === false) continue;
      if (key === 'class' || key === 'className') node.className = String(value);
      else if (key === 'text') node.textContent = String(value);
      else if (key === 'style' && typeof value === 'object') Object.assign(node.style, value);
      else if (key === 'dataset' && typeof value === 'object') Object.assign(node.dataset, value);
      else if (key.startsWith('on') && typeof value === 'function') node.addEventListener(key.slice(2).toLowerCase(), value);
      else if (value === true) node.setAttribute(key, '');
      else node.setAttribute(key, String(value));
    }
    children.forEach((child) => append(node, child));
    return node;
  }

  function clear(node) {
    if (node) node.replaceChildren();
    return node;
  }

  function announce(text) {
    const region = $('#liveRegion');
    if (!region) return;
    region.textContent = '';
    window.setTimeout(() => { region.textContent = text; }, 20);
  }

  function textValue(value) {
    if (value === null || value === undefined) return '';
    if (typeof value === 'string') return value;
    if (typeof value === 'number' || typeof value === 'boolean') return String(value);
    if (Array.isArray(value)) return value.map((item) => textValue(typeof item === 'object' ? (item?.text ?? item?.content ?? '') : item)).filter(Boolean).join('\n');
    if (typeof value === 'object') return textValue(value.text ?? value.content ?? value.message ?? '');
    return '';
  }

  function safeUrl(raw, { image = false } = {}) {
    if (typeof raw !== 'string') return null;
    const value = raw.trim();
    if (!value) return null;
    if (image && value.startsWith('data:image/')) {
      if (/^data:image\/(png|jpe?g|webp|gif);/i.test(value)) return value;
      return null;
    }
    if (image && /^blob:/i.test(value)) return value;
    if (value.startsWith('/') && !value.startsWith('//')) return value;
    try {
      const parsed = new URL(value, window.location.href);
      if (parsed.protocol === 'http:' || parsed.protocol === 'https:') return parsed.href;
    } catch { /* invalid URL */ }
    return null;
  }

  function hostOf(raw) {
    const safe = safeUrl(raw);
    if (!safe) return '';
    try { return new URL(safe, window.location.href).host.replace(/^www\./, ''); } catch { return ''; }
  }

  function safeColor(raw) {
    if (typeof raw !== 'string') return '';
    const value = raw.trim();
    if (/^#[0-9a-f]{3,8}$/i.test(value)) return value;
    if (/^rgba?\(\s*[\d.%\s,/]+\)$/i.test(value)) return value;
    if (/^hsla?\(\s*[\d.%\s,/deg]+\)$/i.test(value)) return value;
    return '';
  }

  function initialLetters(name, max = 2) {
    const clean = String(name || 'Arena Desktop').replace(/[^\p{L}\p{N}\s._-]/gu, ' ').trim();
    const words = clean.split(/[\s._-]+/).filter(Boolean);
    if (!words.length) return 'AD';
    return words.slice(0, max).map((word) => word[0]).join('').toUpperCase();
  }

  // Arena's model catalog carries no per-model icon: the website draws the
  // organization's logo. Keep the same local brand marks (static SVG only);
  // an icon_url from the catalog, when Arena provides one, wins.
  const ORG_LOGOS = {
    google: '<svg viewBox="0 0 24 24" width="18" height="18"><path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#4285F4"/><path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/><path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18A10.96 10.96 0 0 0 1 12c0 1.77.42 3.45 1.18 4.93l3.66-2.84z" fill="#FBBC05"/><path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/></svg>',
    openai: '<svg viewBox="0 0 24 24" width="18" height="18"><path d="M22.28 9.37a6.17 6.17 0 0 0-.53-5.07 6.24 6.24 0 0 0-6.73-2.98A6.2 6.2 0 0 0 10.36 0a6.24 6.24 0 0 0-5.95 4.33A6.17 6.17 0 0 0 .27 8.06a6.24 6.24 0 0 0 .77 7.32 6.17 6.17 0 0 0 .53 5.07 6.24 6.24 0 0 0 6.73 2.98A6.2 6.2 0 0 0 12.96 24a6.24 6.24 0 0 0 5.95-4.33 6.17 6.17 0 0 0 4.14-3.73 6.24 6.24 0 0 0-.77-6.57z" fill="#10B981"/></svg>',
    anthropic: '<svg viewBox="0 0 24 24" width="18" height="18"><path d="M13.83 2H16.7l6.3 20h-2.87l-1.46-4.83H12.6L14.04 14h4.5L15.27 4.37 10.15 22H7.28L13.83 2zM1 22L7.2 2h2.87l-1.85 5.97L4.69 22H1z" fill="#F97316"/></svg>',
    xai: '<svg viewBox="0 0 24 24" width="18" height="18"><path d="M3 3l7.5 9L3 21h2.2l6.3-7.56L17.8 21H21l-7.8-9.36L20.4 3h-2.2l-5.7 6.84L6.2 3H3z" fill="#D946EF"/></svg>',
    meta: '<svg viewBox="0 0 24 24" width="18" height="18"><path d="M6.91 4.24C5.21 4.24 3.76 5.6 2.73 7.74 1.46 10.38.87 13.59.87 15.46c0 2.74 1.16 4.3 3.24 4.3 1.62 0 3.15-1.34 4.88-4.28.73-1.23 1.44-2.67 2.15-4.28l.98-2.27c.89-2.04 1.92-3.87 3.12-5.14A5.87 5.87 0 0 1 19.35 2c2.39 0 3.78 1.74 3.78 4.45 0 3.09-1.4 6.63-3.52 8.92a8.97 8.97 0 0 1-2.8 2.22" fill="none" stroke="#06B6D4" stroke-width="2"/></svg>',
    mistral: '<svg viewBox="0 0 24 24" width="18" height="18"><rect x="2" y="2" width="5" height="5" fill="#F7D046"/><rect x="9.5" y="2" width="5" height="5" fill="#F7D046"/><rect x="17" y="2" width="5" height="5" fill="#EF4444"/><rect x="2" y="9.5" width="5" height="5" fill="#F7D046"/><rect x="9.5" y="9.5" width="5" height="5" fill="#EF4444"/><rect x="17" y="9.5" width="5" height="5" fill="#F7D046"/><rect x="2" y="17" width="5" height="5" fill="#EF4444"/><rect x="9.5" y="17" width="5" height="5" fill="#F7D046"/><rect x="17" y="17" width="5" height="5" fill="#F7D046"/></svg>',
    deepseek: '<svg viewBox="0 0 24 24" width="18" height="18"><circle cx="12" cy="12" r="10" fill="#3B82F6"/><text x="12" y="16" text-anchor="middle" fill="white" font-size="12" font-weight="700" font-family="sans-serif">D</text></svg>',
    alibaba: '<svg viewBox="0 0 24 24" width="18" height="18"><circle cx="12" cy="12" r="10" fill="#F59E0B"/><text x="12" y="16" text-anchor="middle" fill="white" font-size="11" font-weight="700" font-family="sans-serif">Q</text></svg>',
    nvidia: '<svg viewBox="0 0 24 24" width="18" height="18"><path d="M9.2 9.48v-.72c.04 0 .08 0 .14-.01 2.1-.14 3.66 1.71 3.66 1.71s-1.74 2.04-3.52 2.04c-.11 0-.2-.01-.28-.03V9.48zm0-2.97v1.68l.06-.01c2.68-.2 4.63 2.2 4.63 2.2s-2.35 2.72-4.47 2.72a2.5 2.5 0 0 1-.22-.01v1.1c.06 0 .13.01.2.01 2.54 0 4.42-1.3 6.22-2.82a17.4 17.4 0 0 1 1.37 1.12c-2.06 1.66-6.86 3.22-7.77 3.22h-.02v1.26C11.5 16.96 18 13.18 18 13.18a21.88 21.88 0 0 0-4.06-3.84c1.3-1.14 2.82-1.85 2.82-1.85A16.67 16.67 0 0 0 9.2 6.51z" fill="#76B900"/></svg>'
  };

  function orgLogoSvg(org, color) {
    const key = String(org || '').trim().toLowerCase();
    if (ORG_LOGOS[key]) return ORG_LOGOS[key];
    const initial = (key || '?')[0].toUpperCase();
    const colors = { minimax: '#14B8A6', zai: '#8B5CF6', stepfun: '#EC4899', bytedance: '#00D1FF', tencent: '#2B82EE', amazon: '#FF9900', microsoft: '#00BCF2', ibm: '#054ADA', cohere: '#F43F5E' };
    const fill = safeColor(color) || colors[key] || '#C7C2BC';
    return `<svg viewBox="0 0 24 24" width="18" height="18"><circle cx="12" cy="12" r="10" fill="${fill}"/><text x="12" y="16" text-anchor="middle" fill="white" font-size="11" font-weight="700" font-family="sans-serif">${initial}</text></svg>`;
  }

  function inferOrgFromModelName(name) {
    const text = String(name || '').toLowerCase();
    if (/gpt|openai|chatgpt|o[0-9]\b/.test(text)) return 'openai';
    if (/claude|anthropic/.test(text)) return 'anthropic';
    if (/gemini|gemma|google/.test(text)) return 'google';
    if (/grok|xai/.test(text)) return 'xai';
    if (/llama|meta/.test(text)) return 'meta';
    if (/mistral|mixtral|codestral/.test(text)) return 'mistral';
    if (/deepseek/.test(text)) return 'deepseek';
    if (/qwen|alibaba|tongyi/.test(text)) return 'alibaba';
    if (/nvidia|nemotron/.test(text)) return 'nvidia';
    if (/command|cohere/.test(text)) return 'cohere';
    if (/minimax/.test(text)) return 'minimax';
    return '';
  }

  function modelIconNode(model) {
    const iconUrl = safeUrl(model?.icon_url || model?.iconUrl || model?.logo_url || '', { image: true });
    const org = model?.org || model?.org_display || inferOrgFromModelName(model?.name || model?.modelName || '');
    const wrap = el('span', { class: 'model-org-logo', 'aria-hidden': 'true' });
    if (iconUrl) {
      const img = el('img', { src: iconUrl, alt: '', loading: 'lazy', referrerpolicy: 'no-referrer' });
      img.addEventListener('error', () => { wrap.innerHTML = orgLogoSvg(org, model?.color); }, { once: true });
      wrap.appendChild(img);
    } else if (org) {
      wrap.innerHTML = orgLogoSvg(org, model?.color);
    } else {
      return null;
    }
    return wrap;
  }

  const CONNECTOR_DOMAINS = {
    github: 'github.com', googledrive: 'drive.google.com', drive: 'drive.google.com',
    googledocs: 'docs.google.com', docs: 'docs.google.com', googlesheets: 'docs.google.com',
    googleslides: 'docs.google.com', gmail: 'mail.google.com', googlecalendar: 'calendar.google.com',
    calendar: 'calendar.google.com', notion: 'notion.so', linear: 'linear.app',
    dropbox: 'dropbox.com', vercel: 'vercel.com', supabase: 'supabase.com', slack: 'slack.com',
    figma: 'figma.com', airtable: 'airtable.com', hubspot: 'hubspot.com',
    salesforce: 'salesforce.com', stripe: 'stripe.com', discord: 'discord.com',
    spotify: 'spotify.com', youtube: 'youtube.com', asana: 'asana.com', jira: 'atlassian.com',
    confluence: 'atlassian.com', gitlab: 'gitlab.com', zoom: 'zoom.us', outlook: 'outlook.live.com'
  };

  function connectorFallbackLogoUrl(item) {
    const key = String(item?.slug || item?.id || item?.preset_id || item?.name || '')
      .toLowerCase().replace(/[^a-z0-9]/g, '');
    const domain = CONNECTOR_DOMAINS[key];
    return domain ? `https://www.google.com/s2/favicons?domain=${domain}&sz=64` : '';
  }

  function connectorLogoNode(item) {
    const fallback = () => el('span', {
      class: 'arena-connector-logo is-fallback', 'aria-hidden': 'true',
      text: initialLetters(item?.name || item?.slug || '?')
    });
    const logoUrl = safeUrl(item?.logo_url || item?.logoUrl || '', { image: true }) || connectorFallbackLogoUrl(item);
    if (!logoUrl) return fallback();
    const img = el('img', { class: 'arena-connector-logo', src: logoUrl, alt: '', loading: 'lazy', referrerpolicy: 'no-referrer' });
    img.addEventListener('error', () => { img.replaceWith(fallback()); }, { once: true });
    return img;
  }

  function accountAvatarNode(extraClass = '') {
    const node = el('span', {
      class: `avatar${extraClass ? ` ${extraClass}` : ''}${state.demo ? ' is-demo' : state.authenticated ? '' : ' is-anonymous'}`
    });
    fillAvatarNode(node);
    return node;
  }

  function fillAvatarNode(node) {
    if (!node) return;
    const displayName = state.fullName || state.email || 'Arena';
    const url = state.authenticated && !state.demo ? safeUrl(state.avatarUrl || '', { image: true }) : '';
    if (url) {
      if (node.dataset.avatarUrl === url && node.querySelector('img')) return;
      node.dataset.avatarUrl = url;
      node.textContent = '';
      const img = el('img', { src: url, alt: '', referrerpolicy: 'no-referrer' });
      img.addEventListener('error', () => {
        delete node.dataset.avatarUrl;
        node.textContent = initialLetters(displayName, 2);
      }, { once: true });
      node.appendChild(img);
      return;
    }
    delete node.dataset.avatarUrl;
    node.textContent = state.authenticated ? initialLetters(displayName, 2) : '—';
  }

  function relativeTime(raw) {
    if (!raw) return '';
    const date = new Date(raw);
    if (Number.isNaN(date.getTime())) return String(raw);
    const diff = Date.now() - date.getTime();
    const minute = 60 * 1000;
    const hour = 60 * minute;
    const day = 24 * hour;
    if (diff < 55 * 1000 && diff > -60 * 1000) return "just now";
    if (diff < hour) return `${Math.max(1, Math.round(diff / minute))} minutes ago`;
    if (diff < day) return `${Math.round(diff / hour)} hours ago`;
    if (diff < 2 * day) return "yesterday";
    if (diff < 7 * day) return `${Math.round(diff / day)} days ago`;
    try {
      return new Intl.DateTimeFormat('en-US', { day: 'numeric', month: 'short' }).format(date);
    } catch { return date.toLocaleDateString(); }
  }

  function formatClock(raw) {
    const date = raw ? new Date(raw) : new Date();
    if (Number.isNaN(date.getTime())) return '';
    try {
      return new Intl.DateTimeFormat('en-US', { hour: '2-digit', minute: '2-digit' }).format(date);
    } catch { return ''; }
  }

  function truncate(value, length = 54) {
    const text = textValue(value).replace(/\s+/g, ' ').trim();
    return text.length > length ? `${text.slice(0, Math.max(1, length - 1))}…` : text;
  }

  function baseName(path) {
    if (!path) return '';
    const parts = String(path).replace(/[\\/]+$/, '').split(/[\\/]/);
    return parts[parts.length - 1] || String(path);
  }

  function errorMessage(error) {
    if (!error) return "An unknown error.";
    if (error instanceof ApiError) return error.message;
    if (error.name === 'AbortError') return "Request has been stopped.";
    if (error instanceof TypeError) {
      return "The local application server is unavailable. Check that the application is running and try again.";
    }
    return String(error.message || error);
  }

  async function copyText(value) {
    const text = String(value ?? '');
    try {
      if (navigator.clipboard && window.isSecureContext) {
        await navigator.clipboard.writeText(text);
        return true;
      }
    } catch { /* fall through to legacy method */ }
    try {
      const area = el('textarea', { class: 'sr-only', readonly: true });
      area.value = text;
      document.body.appendChild(area);
      area.select();
      const ok = document.execCommand('copy');
      area.remove();
      return ok;
    } catch { return false; }
  }

  function showButtonFeedback(button, label = "Copied and copied") {
    if (!button) return;
    const original = button.dataset.originalLabel || button.textContent.trim();
    button.dataset.originalLabel = original;
    button.textContent = label;
    window.setTimeout(() => {
      if (button.isConnected) button.textContent = original;
    }, 1500);
  }

  function focusFirst(root) {
    if (!root) return;
    const candidate = root.querySelector('[data-autofocus], button:not([disabled]), input:not([disabled]), textarea:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])');
    if (candidate) {
      try { candidate.focus({ preventScroll: true }); } catch { candidate.focus(); }
    }
  }

  function trapFocus(event, container) {
    if (event.key !== 'Tab' || !container) return;
    const focusable = $$('button:not([disabled]), input:not([disabled]), textarea:not([disabled]), select:not([disabled]), a[href], [tabindex]:not([tabindex="-1"])', container)
      .filter((node) => node.offsetParent !== null || node === document.activeElement);
    if (!focusable.length) return;
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  }

  function downloadBlob(blob, filename) {
    const url = URL.createObjectURL(blob);
    const anchor = el('a', { href: url, download: filename });
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 2500);
  }

  // ═══ 02-api.js ═══
  /* ---------------------------------------------------------------------- */
  /* API layer: relative URLs only, no token, no arena.ai requests.         */
  /* ---------------------------------------------------------------------- */
  class ApiError extends Error {
    constructor(message, status = 0, details = null) {
      super(message);
      this.name = 'ApiError';
      this.status = status;
      this.details = details;
    }
  }

  function extractError(payload, status) {
    let message = '';
    if (typeof payload === 'string') {
      const trimmed = payload.trim();
      const looksLikeMarkup = /^<!doctype|^<html|<\/body>|<\/html>/i.test(trimmed);
      if (!looksLikeMarkup && trimmed.length <= 500) message = trimmed;
    } else if (payload && typeof payload === 'object') {
      const value = payload.error ?? payload.detail ?? payload.message ?? payload.status_message;
      if (typeof value === 'string') message = value.slice(0, 700);
      else if (value && typeof value === 'object') message = textValue(value.message ?? value.detail ?? value.error).slice(0, 700);
    }
    if (!message) message = status ? `Server returned an error ${status}. Check that the local application is running.` : "It was not possible to execute the request.";
    return message;
  }

  async function parseResponsePayload(response) {
    const text = await response.text().catch(() => '');
    if (!text) return null;
    try { return JSON.parse(text); } catch { return text; }
  }

  let _apiToken = document.querySelector('meta[name="api-token"]')?.content || '';
  const _previewToken = document.querySelector('meta[name="preview-token"]')?.content || '';

  // Workspace file preview URL. The read-only key is part of the path, so the
  // page's relative CSS/JS/images load too, in the app, an iframe or a browser.
  function previewLink(path, { absolute = false } = {}) {
    const rel = String(path || '').replace(/^\/+/, '').split('/').map(encodeURIComponent).join('/');
    const url = _previewToken
      ? `/preview/${encodeURIComponent(_previewToken)}/${rel}`
      : `/api/workspace/preview/${rel}?token=${encodeURIComponent(_apiToken)}`;
    return absolute ? new URL(url, window.location.origin).href : url;
  }

  // Open a site preview: its own WebView2 window in the desktop app (arena.site
  // pages refuse to load inside frames), a new browser tab otherwise.
  function openPreview(url, title = 'Preview') {
    const href = new URL(String(url || ''), window.location.origin).href;
    const api = window.pywebview?.api;
    if (api?.open_preview) {
      Promise.resolve(api.open_preview(href, title)).then((ok) => {
        if (!ok) window.open(href, '_blank', 'noopener');
      }).catch(() => window.open(href, '_blank', 'noopener'));
      return;
    }
    window.open(href, '_blank', 'noopener');
  }

  const liveApi = {
    async request(path, { method = 'GET', body, signal } = {}) {
      const options = {
        method,
        credentials: 'same-origin',
        cache: 'no-store',
        headers: { Accept: 'application/json', 'X-Arena-Token': _apiToken },
        signal
      };
      if (body !== undefined) {
        options.headers['Content-Type'] = 'application/json';
        options.body = JSON.stringify(body);
      }
      let response;
      try {
        response = await fetch(path, options);
      } catch (error) {
        if (error?.name === 'AbortError') throw error;
        throw new ApiError("The local application server is unavailable. Check that the application is running and try again.", 0, error);
      }
      const payload = await parseResponsePayload(response);
      if (!response.ok) throw new ApiError(extractError(payload, response.status), response.status, payload);
      return payload ?? {};
    },
    getStatus() { return this.request('/api/status'); },
    getSettings() { return this.request('/api/settings'); },
    saveSettings(body) { return this.request('/api/settings', { method: 'POST', body }); },
    login() { return this.request('/api/login', { method: 'POST', body: { method: 'window' } }); },
    loginCookie(cookie) { return this.request('/api/login', { method: 'POST', body: { method: 'manual', cookie } }); },
    loginPoll() { return this.request('/api/login/poll'); },
    engineShow() { return this.request('/api/engine/show', { method: 'POST', body: {} }); },
    engineHide() { return this.request('/api/engine/hide', { method: 'POST', body: {} }); },
    logout() { return this.request('/api/logout', { method: 'POST', body: {} }); },
    getModels(modality, mode, force = false) { return this.request(`/api/models?mode=${encodeURIComponent(mode || '')}&modality=${encodeURIComponent(modality)}${force ? '&force=1' : ''}`); },
    setMode(mode) { return this.request('/api/mode', { method: 'POST', body: { mode } }); },
    setModality(modality) { return this.request('/api/modality', { method: 'POST', body: { modality } }); },
    newChat() { return this.request('/api/new', { method: 'POST', body: {} }); },
    getChats() { return this.request('/api/chats'); },
    getArenaChats() { return this.request('/api/arena-chats?limit=50'); },
    openArenaChat(id, type, title) { return this.request(`/api/arena-chats/${encodeURIComponent(id)}/open`, { method: 'POST', body: { type, title } }); },
    archiveArenaChat(id, type) { return this.request(`/api/arena-chats/${encodeURIComponent(id)}/archive`, { method: 'POST', body: { type } }); },
    vote(chatId, body) { return this.request(`/api/chats/${encodeURIComponent(chatId)}/vote`, { method: 'POST', body }); },
    getChat(id) { return this.request(`/api/chats/${encodeURIComponent(id)}`); },
    refreshChat(id) { return this.request(`/api/chats/${encodeURIComponent(id)}/refresh`, { method: 'POST', body: {} }); },
    deleteChat(id) { return this.request(`/api/chats/${encodeURIComponent(id)}/delete`, { method: 'POST', body: {} }); },
    compactChat(id) { return this.request(`/api/chats/${encodeURIComponent(id)}/compact`, { method: 'POST', body: {} }); },
    getMemory() { return this.request('/api/memory'); },
    saveMemory(body) { return this.request('/api/memory', { method: 'POST', body }); },
    updateCheck(force = false) { return this.request(`/api/update-check${force ? '?force=1' : ''}`); },
    updateDownload() { return this.request('/api/update/download', { method: 'POST', body: {} }); },
    updateStatus() { return this.request('/api/update/status'); },
    updateApply() { return this.request('/api/update/apply', { method: 'POST', body: {} }); },
    whatsNew() { return this.request('/api/update/whatsnew'); },
    clearWhatsNew() { return this.request('/api/update/whatsnew', { method: 'DELETE' }); },
    exportSettings() { return this.request('/api/settings/export'); },
    importSettings(bundle) { return this.request('/api/settings/import', { method: 'POST', body: bundle }); },
    diagnostics() { return this.request('/api/diagnostics'); },
    diagnosticsRun() { return this.request('/api/diagnostics/run'); },
    getUsage() { return this.request('/api/usage'); },
    getPulse() { return this.request('/api/usage/pulse'); },
    syncProject(chatId) { return this.request(`/api/chats/${encodeURIComponent(chatId)}/sync-project`, { method: 'POST', body: {} }); },
    getGateway() { return this.request('/api/gateway'); },
    startGateway() { return this.request('/api/gateway/start', { method: 'POST', body: {} }); },
    stopGateway() { return this.request('/api/gateway/stop', { method: 'POST', body: {} }); },
    getComponents() { return this.request('/api/components'); },
    installComponent(id) { return this.request('/api/components/install', { method: 'POST', body: { id } }); },
    getQuestions() { return this.request('/api/questions'); },
    answerQuestion(id, answer) { return this.request(`/api/questions/${encodeURIComponent(id)}`, { method: 'POST', body: { answer } }); },
    getMediaChoices() { return this.request('/api/media-choices'); },
    answerMediaChoice(id, body) { return this.request(`/api/media-choices/${encodeURIComponent(id)}`, { method: 'POST', body }); },
    searchChats(q) { return this.request(`/api/search?q=${encodeURIComponent(q)}`); },
    forkChat(id, messageIndex) { return this.request(`/api/chats/${encodeURIComponent(id)}/fork`, { method: 'POST', body: { message_index: messageIndex } }); },
    restoreCheckpoint(id) { return this.request(`/api/checkpoints/${encodeURIComponent(id)}/restore`, { method: 'POST', body: {} }); },
    workspaceSnapshot(paths) { return this.request('/api/workspace/snapshot', { method: 'POST', body: { paths } }); },
    getElo() { return this.request('/api/elo'); },
    getAutomations() { return this.request('/api/automations'); },
    saveAutomation(body) { return this.request('/api/automations', { method: 'POST', body }); },
    deleteAutomation(id) { return this.request(`/api/automations/${encodeURIComponent(id)}`, { method: 'DELETE' }); },
    runAutomation(id) { return this.request(`/api/automations/${encodeURIComponent(id)}/run`, { method: 'POST', body: {} }); },
    getHistory() { return this.request('/api/history'); },
    getPermissions() { return this.request('/api/permissions'); },
    decidePermission(id, decision) {
      return this.request(`/api/permissions/${encodeURIComponent(id)}`, { method: 'POST', body: { decision } });
    },
    getPermissionMode() { return this.request('/api/permission-mode'); },
    setPermissionMode(mode) { return this.request('/api/permission-mode', { method: 'POST', body: { mode } }); },
    getWorkspace() { return this.request('/api/workspace'); },
    setWorkspace(path) { return this.request('/api/workspace/set', { method: 'POST', body: { path } }); },
    clearWorkspace() { return this.request('/api/workspace/set', { method: 'POST', body: { clear: true } }); },
    runLocal(path) { return this.request('/api/workspace/run-local', { method: 'POST', body: { path } }); },
    runLocalState(id) { return this.request(`/api/workspace/run-local/${encodeURIComponent(id)}`); },
    stopRunLocal(id) { return this.request(`/api/workspace/run-local/${encodeURIComponent(id)}`, { method: 'DELETE' }); },
    async uploadAttachment(file, kind, modality) {
      const form = new FormData();
      form.append('file', file, file.name);
      form.append('kind', kind || 'evaluation');
      if (modality) form.append('modality', modality);
      let response;
      try {
        response = await fetch('/api/uploads', {
          method: 'POST', credentials: 'same-origin', cache: 'no-store',
          headers: { Accept: 'application/json', 'X-Arena-Token': _apiToken }, body: form
        });
      } catch (error) {
        throw new ApiError("The local application server is unavailable. The file was not uploaded.", 0, error);
      }
      const payload = await parseResponsePayload(response);
      if (!response.ok) throw new ApiError(extractError(payload, response.status), response.status, payload);
      return payload ?? {};
    },
    saveWorkspace(chatId, lane) { return this.request('/api/workspace/save', { method: 'POST', body: { chat_id: chatId, lane } }); },
    openWorkspace(path) { return this.request('/api/workspace/open', { method: 'POST', body: { path } }); },
    getWorkspaceTree(path = '.') { return this.request(`/api/workspace/tree?path=${encodeURIComponent(path)}`); },
    async uploadToWorkspace(files) {
      const fd = new FormData();
      for (const f of files) fd.append('files', f, f.webkitRelativePath || f.name);
      const resp = await fetch('/api/workspace/upload', { method: 'POST', body: fd, credentials: 'same-origin', headers: { 'X-Arena-Token': _apiToken } });
      if (!resp.ok) throw new ApiError('Upload failed', resp.status);
      return resp.json();
    },
    getWorkspaceFile(path) { return this.request(`/api/workspace/file?path=${encodeURIComponent(path)}`); },
    saveWorkspaceFile(path, content) { return this.request('/api/workspace/file', { method: 'POST', body: { path, content } }); },
    getChatProject(chatId) { return this.request(`/api/chats/${encodeURIComponent(chatId)}/project`); },
    async downloadWorkspaceFile(path) {
      let response;
      try {
        response = await fetch(`/api/workspace/download?path=${encodeURIComponent(path)}`, { credentials: 'same-origin', cache: 'no-store', headers: { 'X-Arena-Token': _apiToken } });
      } catch (error) {
        throw new ApiError('The local application server is unavailable.', 0, error);
      }
      if (!response.ok) {
        const payload = await parseResponsePayload(response);
        throw new ApiError(extractError(payload, response.status), response.status, payload);
      }
      return response.blob();
    },
    getConnectors() { return this.request('/api/connectors'); },
    reloadConnectors() { return this.request('/api/connectors/reload', { method: 'POST', body: {} }); },
    openConnectorConfig() { return this.request('/api/connectors/config/open', { method: 'POST', body: {} }); },
    installConnectorPreset(presetId, values, connect = true) { return this.request('/api/connectors/preset', { method: 'POST', body: { preset_id: presetId, values, connect } }); },
    addConnectorCli(body) { return this.request('/api/connectors/cli', { method: 'POST', body }); },
    connectConnector(name) { return this.request(`/api/connectors/${encodeURIComponent(name)}/connect`, { method: 'POST', body: {} }); },
    disconnectConnector(name) { return this.request(`/api/connectors/${encodeURIComponent(name)}/disconnect`, { method: 'POST', body: {} }); },
    setConnectorEnabled(name, enabled) { return this.request(`/api/connectors/${encodeURIComponent(name)}/enabled`, { method: 'POST', body: { enabled } }); },
    deleteConnector(name) { return this.request(`/api/connectors/${encodeURIComponent(name)}/delete`, { method: 'POST', body: {} }); },
    getArenaConnectors() { return this.request('/api/arena-connectors'); },
    openNativeAgent(message) { return this.request('/api/agent/native', { method: 'POST', body: { message } }); },
    connectArenaConnector(slug) { return this.request(`/api/arena-connectors/${encodeURIComponent(slug)}/connect`, { method: 'POST', body: {} }); },
    pollArenaConnector(slug) { return this.request(`/api/arena-connectors/${encodeURIComponent(slug)}/connect/poll`); },
    disconnectArenaConnector(slug) { return this.request(`/api/arena-connectors/${encodeURIComponent(slug)}/disconnect`, { method: 'POST', body: {} }); },
    saveMedia(url) { return this.request('/api/media/save', { method: 'POST', body: { url } }); },
    getDoctor() { return this.request('/api/doctor'); },
    async workspaceZip(path) {
      let response;
      try {
        response = await fetch(`/api/workspace/zip?path=${encodeURIComponent(path)}`, { credentials: 'same-origin', cache: 'no-store', headers: { 'X-Arena-Token': _apiToken } });
      } catch (error) {
        throw new ApiError("The local application server is unavailable.", 0, error);
      }
      if (!response.ok) {
        const payload = await parseResponsePayload(response);
        throw new ApiError(extractError(payload, response.status), response.status, payload);
      }
      const contentType = response.headers.get('content-type') || '';
      if (contentType.includes('application/json')) {
        const payload = await response.json().catch(() => null);
        throw new ApiError(extractError(payload, response.status), response.status, payload);
      }
      return response.blob();
    },
    async stop(chatId) { return this.request('/api/stop', { method: 'POST', body: chatId ? { chat_id: chatId } : {} }); },
    getAccounts() { return this.request('/api/accounts'); },
    switchAccount(id) { return this.request('/api/accounts/switch', { method: 'POST', body: { id } }); },
    addAccount() { return this.request('/api/accounts/add', { method: 'POST', body: {} }); },
    removeAccount(id) { return this.request('/api/accounts/remove', { method: 'POST', body: { id } }); },
    async streamChat(body, onEvent, signal) {
      let response;
      try {
        response = await fetch('/api/chat', {
          method: 'POST',
          credentials: 'same-origin',
          cache: 'no-store',
          headers: { 'Content-Type': 'application/json', Accept: 'text/event-stream, application/json', 'X-Arena-Token': _apiToken },
          body: JSON.stringify(body),
          signal
        });
      } catch (error) {
        if (error?.name === 'AbortError') throw error;
        throw new ApiError("The local application server is unavailable. Check that the application is running and try again.", 0, error);
      }
      if (!response.ok) {
        const payload = await parseResponsePayload(response);
        throw new ApiError(extractError(payload, response.status), response.status, payload);
      }
      if (!response.body) throw new ApiError("The server opened an empty response stream.", response.status);
      const reader = response.body.getReader();
      const decoder = new TextDecoder('utf-8');
      const parser = new SSEParser(onEvent, (raw) => {
        onEvent({ type: 'notice', message: "A damaged flow event was missed." });
      });
      try {
        while (true) {
          const { value, done } = await reader.read();
          if (done) break;
          parser.push(decoder.decode(value, { stream: true }));
        }
        parser.push(decoder.decode());
        parser.flush();
      } finally {
        try { reader.releaseLock(); } catch { /* already released */ }
      }
    }
  };

  /**
   * SSE parser for fetch + ReadableStream.
   * Handles partial chunks, CRLF boundaries, UTF-8 decoding, multiline data.
   */
  class SSEParser {
    constructor(onEvent, onMalformed) {
      this.buffer = '';
      this.onEvent = onEvent;
      this.onMalformed = onMalformed;
      this.closed = false;
    }
    push(chunk) {
      if (this.closed) return;
      this.buffer += chunk;
      this.buffer = this.buffer.replace(/\r\n/g, '\n');
      let index;
      while ((index = this.buffer.indexOf('\n\n')) !== -1) {
        const block = this.buffer.slice(0, index);
        this.buffer = this.buffer.slice(index + 2);
        this.parseBlock(block);
      }
    }
    flush() {
      if (this.buffer.trim()) this.parseBlock(this.buffer);
      this.buffer = '';
    }
    parseBlock(block) {
      const dataLines = [];
      for (const line of block.split('\n')) {
        if (!line || line.startsWith(':')) continue;
        const colon = line.indexOf(':');
        const field = colon === -1 ? line : line.slice(0, colon);
        let value = colon === -1 ? '' : line.slice(colon + 1);
        if (value.startsWith(' ')) value = value.slice(1);
        if (field === 'data') dataLines.push(value);
      }
      if (!dataLines.length) return;
      const raw = dataLines.join('\n');
      if (raw.trim() === '[DONE]') {
        this.onEvent({ type: 'done' });
        return;
      }
      try {
        const data = JSON.parse(raw);
        if (!data || typeof data !== 'object') return;
        if (!data.type && (data.error || data.detail)) data.type = 'error';
        this.onEvent(data);
      } catch (error) {
        if (this.onMalformed) this.onMalformed(raw, error);
      }
    }
  }

  /* ---------------------------------------------------------------------- */
  // ═══ 03-demo.js ═══
  /* Demo backend (only with ?demo=1). Every event here is simulated locally. */
  /* ---------------------------------------------------------------------- */
  function demoArtwork(title, hue = 145, subline = 'Arena Desktop · demo') {
    const safeTitle = String(title).replace(/[<>&"]/g, '');
    const safeSub = String(subline).replace(/[<>&"]/g, '');
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="800" height="500" viewBox="0 0 800 500"><defs><linearGradient id="bg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="hsl(${hue} 34% 13%)"/><stop offset="1" stop-color="hsl(${hue + 36} 24% 7%)"/></linearGradient><radialGradient id="glow" cx=".68" cy=".2" r=".8"><stop offset="0" stop-color="hsl(${hue} 54% 66%)" stop-opacity=".42"/><stop offset="1" stop-color="hsl(${hue} 54% 54%)" stop-opacity="0"/></radialGradient></defs><rect width="800" height="500" fill="url(#bg)"/><rect width="800" height="500" fill="url(#glow)"/><circle cx="640" cy="240" r="128" fill="none" stroke="hsl(${hue} 42% 68%)" stroke-opacity=".27"/><circle cx="640" cy="240" r="84" fill="none" stroke="hsl(${hue} 42% 68%)" stroke-opacity=".42"/><circle cx="640" cy="240" r="18" fill="hsl(${hue} 54% 73%)" fill-opacity=".9"/><path d="M75 384h400M75 358h286M75 332h322" stroke="hsl(${hue} 22% 50%)" stroke-opacity=".45" stroke-width="2" stroke-linecap="round"/><text x="75" y="174" fill="#edf2ed" font-family="Segoe UI, Arial, sans-serif" font-size="34" font-weight="600">${safeTitle}</text><text x="75" y="214" fill="hsl(${hue} 25% 69%)" font-family="Segoe UI, Arial, sans-serif" font-size="17">${safeSub}</text><rect x="75" y="284" width="122" height="29" rx="6" fill="hsl(${hue} 30% 44%)" fill-opacity=".28"/><text x="91" y="304" fill="hsl(${hue} 42% 82%)" font-family="Segoe UI, Arial, sans-serif" font-size="13">simulated media</text></svg>`;
    return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
  }

  function demoModel(id, name, org, color, rank, score, capabilities = []) {
    return { id, name, org, org_display: org, color, rank, arena_score: score, capabilities };
  }

  const demoModels = {
    text: [
      demoModel('atlas-3', 'Atlas 3', 'Nordic Labs', '#9fc7f4', 1, 1385, ["Text", "Reasoning", "200K context"]),
      demoModel('sable-r1', 'Sable R1', 'Sable AI', '#bda7eb', 2, 1364, ["Text", "Reasoning", "Code"]),
      demoModel('lumen-2-pro', 'Lumen 2 Pro', 'Tessera', '#eac28f', 3, 1320, ["Text", "Long context"]),
      demoModel('kestrel-max', 'Kestrel Max', 'Monolith', '#98d6b1', 4, 1298, ["Text", "Fast"]),
      demoModel('northstar-mini', 'Northstar Mini', 'Fjord', '#a6d9d6', 5, 1240, ["Text", "Economical"]),
      demoModel('meridian-2', 'Meridian 2', 'Arcadia', '#e1adad', 6, 1198, ["Text", "Instructions"])
    ],
    code: [
      demoModel('forge-1-coder', 'Forge 1 Coder', 'Monolith', '#97d9b8', 1, 1392, ["Code", "Tools"]),
      demoModel('atlas-3', 'Atlas 3', 'Nordic Labs', '#9fc7f4', 2, 1360, ["Code", "Reasoning"]),
      demoModel('kestrel-code', 'Kestrel Code', 'Sable AI', '#c1b1ec', 3, 1318, ["Code", "Fast"]),
      demoModel('lumen-dev', 'Lumen Dev', 'Tessera', '#ebc48f', 4, 1272, ["Code", "Files"])
    ],
    search: [
      demoModel('compass-search', 'Compass Search', 'Arcadia', '#a9c7ef', 1, 1330, ["Search", "Sources"]),
      demoModel('atlas-search', 'Atlas Search', 'Nordic Labs', '#9fc7f4', 2, 1296, ["Search", "Reasoning"]),
      demoModel('scout-mini', 'Scout Mini', 'Fjord', '#a6d9d6', 3, 1215, ["Search", "Economical"])
    ],
    image: [
      demoModel('prism-canvas', 'Prism Canvas', 'Tessera', '#e5b48e', 1, 1310, ["Images"]),
      demoModel('aurora-image', 'Aurora Image', 'Sable AI', '#bfa8e9', 2, 1278, ["Images"]),
      demoModel('lumen-sketch', 'Lumen Sketch', 'Nordic Labs', '#a7d8c2', 3, 1224, ["Images"])
    ],
    video: [
      demoModel('reelforge', 'ReelForge', 'Monolith', '#e3b58f', 1, 1200, ["Video · preview"]),
      demoModel('motionlite', 'MotionLite', 'Arcadia', '#a9c7ef', 2, 1168, ["Video · preview"])
    ]
  };

  const demoStore = {
    authenticated: true,
    email: 'demo@local.invalid',
    engineOpen: false,
    offline: false,
    loading: false,
    sessionError: null,
    permissionMode: 'acceptEdits',
    workspace: 'C:\\ArenaWorkspace\\foto-studio',
    mode: 'direct',
    modality: 'text',
    chats: [],
    messages: {},
    cloudChats: [],
    cloudMessages: {},
    connectors: [],
    pendingPermissions: [],
    mediaChoices: [],
    loginAt: 0,
    pendingAdd: false,
    activeChatId: null,
    activeStream: null,
    streams: new Set(),
    currentAccountId: 'demo-acc-1',
    accounts: [
      { id: 'demo-acc-1', email: 'demo@local.invalid', name: 'Demo User', avatar_url: null, expired: false },
      { id: 'demo-acc-2', email: 'second@local.invalid', name: 'Second User', avatar_url: null, expired: false },
      { id: 'demo-acc-3', email: 'old@local.invalid', name: 'Old User', avatar_url: null, expired: true }
    ],
    serial: 0,
    settings: {}
  };

  (function seedDemoChats() {
    const now = Date.now();
    const landingId = 'demo-chat-landing';
    const testsId = 'demo-chat-tests';
    const searchId = 'demo-chat-search';
    const imageId = 'demo-chat-image';
    demoStore.messages[landingId] = [
      {
        role: 'user', created_at: new Date(now - 2.4 * 3600e3).toISOString(),
        content: "Put together a landing structure for a small photo studio. We need a calm visual language, no noise, and an adaptive grid. Suggest two directions."
      },
      {
        role: 'assistant', lane: 'a', model_id: 'atlas-3', model_name: 'Atlas 3', created_at: new Date(now - 2.3 * 3600e3).toISOString(),
        content: "### direction A - \"quiet gallery\"\n\nMain idea: photos are an interface. Minimum text, lots of air and one clear scenario.\n\n1.  ** first screen :** series of 3 frames, studio name and one button.\n2.  ** work :** grid 2 x 2 with different proportions.\n3.  ** about studio :** short manifesto and contact.\n4.  ** palette :** warm graphite, paper, one low accent.\n\n```css\n.hero {\n  display: grid;\n  grid-template-columns: minmax(0, 1.2fr) minmax(220px, .8fr);\n  gap: clamp(1rem, 4vw, 4rem);\n}\n\n@media (max-width: 760px) {\n  .hero { grid-template-columns: 1fr; }\n}\n```\n\nI do not promise a ready site before launch: first it is necessary to agree on the structure and photos.",
        reasoning: "Comparing two calm approaches. For a photo studio, the rhythm of the grid and the quality of the shots are more important than decorative effects.",
        sources: []
      },
      {
        role: 'assistant', lane: 'b', model_id: 'sable-r1', model_name: 'Sable R1', created_at: new Date(now - 2.3 * 3600e3).toISOString(),
        content: "### Direction B — \"Magazine Story\"\n\nRestrained editorial grid, large typography, and thoughtful captions for the works.\n\n- Top row: studio name, city, contact.\n- Large headline-story instead of an advertising slogan.\n- Asymmetrical pairs of photos.\n- The mobile version maintains the feeling of a magazine rather than turning into cards.\n\n**Next step:** choose one hero scenario and select 6–9 photos for the first screen.",
        sources: []
      }
    ];
    demoStore.messages[testsId] = [
      { role: 'user', created_at: new Date(now - 26 * 3600e3).toISOString(), content: "Check the approach to tests for the Flask endpoint. Which cases should be added?" },
      { role: 'assistant', lane: 'a', model_id: null, model_name: 'Agent', created_at: new Date(now - 25.7 * 3600e3).toISOString(), content: "Add checks for a successful JSON response, an incorrect request body, an empty set, and a backend failure. Do not mix the network client and the Flask test client. In the demo, this is an illustrative example, not an actual run." }
    ];
    demoStore.messages[searchId] = [
      { role: 'user', created_at: new Date(now - 3.2 * 86400e3).toISOString(), content: "Collect sources on WebView2 and pywebview — only for illustrating demo mode." },
      { role: 'assistant', lane: 'a', model_id: 'compass-search', model_name: 'Compass Search', created_at: new Date(now - 3.1 * 86400e3).toISOString(), content: "Below are **simulated demo-mode sources**. These are not the results of actual search.", sources: [
        { title: "Demonstration source on WebView2", url: 'https://example.com/demo/webview2', snippet: "Example of a source card." },
        { title: "Demonstration source on pywebview", url: 'https://example.com/demo/pywebview', snippet: "Example of a source card." }
      ] }
    ];
    demoStore.messages[imageId] = [
      { role: 'user', created_at: new Date(now - 4.5 * 86400e3).toISOString(), content: "Come up with three calm covers for a podcast." },
      { role: 'assistant', lane: 'a', model_id: 'prism-canvas', model_name: 'Prism Canvas', created_at: new Date(now - 4.4 * 86400e3).toISOString(), content: "Here is a sample demo cover. Real image generation was not performed.", media: [
        { kind: 'image', url: demoArtwork("Quiet Echo", 155, "demo image · not generated"), title: "Quiet Echo · demo cover" }
      ] }
    ];
    const secondId = 'demo-chat-second-account';
    demoStore.messages[secondId] = [
      { role: 'user', created_at: new Date(now - 1.2 * 3600e3).toISOString(), content: "A chat that belongs to the second demo account." },
      { role: 'assistant', lane: 'a', model_id: 'atlas-3', model_name: 'Atlas 3', created_at: new Date(now - 1.1 * 3600e3).toISOString(), content: "This dialogue is only listed while the second demo account is current." }
    ];
    demoStore.chats = [
      { id: secondId, title: "Second account notes", updated_at: new Date(now - 1.1 * 3600e3).toISOString(), mode: 'direct', modality: 'text', account: 'demo-acc-2' },
      { id: landingId, title: "Landing page for a photo studio", updated_at: new Date(now - 2.3 * 3600e3).toISOString(), mode: 'side-by-side', modality: 'text' },
      { id: testsId, title: "Check approach to tests", updated_at: new Date(now - 25.7 * 3600e3).toISOString(), mode: 'agent', modality: 'text' },
      { id: searchId, title: "Sources: WebView2 and pywebview", updated_at: new Date(now - 3.1 * 86400e3).toISOString(), mode: 'direct', modality: 'search' },
      { id: imageId, title: "Cover options", updated_at: new Date(now - 4.4 * 86400e3).toISOString(), mode: 'direct', modality: 'image' }
    ];
    const cloudEvalId = 'demo-cloud-evaluation';
    const cloudAgentId = 'demo-cloud-agent';
    demoStore.cloudMessages[cloudEvalId] = [
      { role: 'user', created_at: new Date(now - 5.2 * 86400e3).toISOString(), content: "This dialogue seems to have been created on the arena.ai website." },
      {
        role: 'assistant', lane: 'a', model_id: 'atlas-3', model_name: 'Atlas 3',
        created_at: new Date(now - 5.1 * 86400e3).toISOString(),
        reasoning: "In the demo, I check that the reasoning remains a normal paragraph and that each word is not moved to a separate line.",
        content: "When imported, this demonstration dialogue will also appear in the local history of Arena Desktop. The actual request to arena.ai was not performed."
      }
    ];
    demoStore.cloudChats = [
      {
        id: cloudEvalId, eval_id: cloudEvalId, type: 'evaluation', title: "Dialogue from the arena.ai website · demo",
        updated_at: new Date(now - 5.1 * 86400e3).toISOString(), created_at: new Date(now - 5.2 * 86400e3).toISOString(),
        mode: 'direct', modality: 'text', message_count: 2, local_chat_id: null, source: 'arena'
      },
      {
        id: cloudAgentId, eval_id: cloudAgentId, type: 'agentic', title: 'Arena Agent · demo',
        updated_at: new Date(now - 6.4 * 86400e3).toISOString(), created_at: new Date(now - 6.5 * 86400e3).toISOString(),
        mode: 'agent', modality: 'text', message_count: 4, local_chat_id: null, source: 'arena'
      }
    ];
    demoStore.connectors = [{
      id: 'filesystem', name: 'filesystem', preset_id: 'filesystem', source: 'official', transport: 'stdio',
      enabled: true, running: false, status: 'stopped',
      description: "Demo entry of the official MCP Filesystem. The real process does not run in preview.",
      command_display: 'npx -y @modelcontextprotocol/server-filesystem C:\\ArenaWorkspace\\foto-studio',
      tools: [], tools_count: 0, error: null
    }];
    demoStore.arenaConnectors = [
      { slug: 'github', name: 'GitHub', description: 'Work with repos, issues, and pull requests.', auth_status: 'connected' },
      { slug: 'google-drive', name: 'Drive', description: 'Find and manage files in Google Drive.', auth_status: 'connected' },
      { slug: 'google-docs', name: 'Docs', description: 'Create, read, and edit Google Docs.', auth_status: 'disconnected' },
      { slug: 'notion', name: 'Notion', description: 'Look up your documents.', auth_status: 'disconnected' },
      { slug: 'gmail', name: 'Gmail', description: 'Connect your email account.', auth_status: 'disconnected' },
      { slug: 'linear', name: 'Linear', description: 'Track issues, projects, and cycles.', auth_status: 'disconnected' },
      { slug: 'google-calendar', name: 'Calendar', description: 'Connect your Google Calendar.', auth_status: 'disconnected' },
      { slug: 'google-slides', name: 'Slides', description: 'Read and edit slides in your presentations.', auth_status: 'disconnected' },
      { slug: 'google-sheets', name: 'Sheets', description: 'Read, edit, and format your spreadsheets.', auth_status: 'disconnected' },
      { slug: 'dropbox', name: 'Dropbox', description: 'Browse, read, and organize your Dropbox files.', auth_status: 'disconnected' },
      { slug: 'vercel', name: 'Vercel', description: 'Manage deployments and projects.', auth_status: 'disconnected' },
      { slug: 'supabase', name: 'Supabase', description: 'Manage your Postgres database and auth.', auth_status: 'disconnected' }
    ].map((item) => ({ ...item, logo_url: null, connected: item.auth_status === 'connected' }));
    demoStore.arenaConnectorPending = {};
    demoStore.activeChatId = null;
  })();

  const demoRouter = {
    ...demoModel('demo-max-router', "Max Router (demo)", "Demo", '#a9c4ae', 0, null, ["Router"]),
    provider: 'boss-bandit', user_selectable: true, is_router: true, fixed: true
  };

  function demoFindModel(id) {
    if (!id) return null;
    if (String(id) === String(demoRouter.id)) return demoRouter;
    for (const list of Object.values(demoModels)) {
      const found = list.find((model) => String(model.id) === String(id));
      if (found) return found;
    }
    return null;
  }

  function demoDefaultModels(modality) {
    return demoModels[modality] || demoModels.text;
  }

  function demoValidateSelection(mode, modality) {
    if (modality === 'video' && mode !== 'battle') throw new ApiError('Video is available only in Battle Mode; Arena selects both models.', 400);
    if (modality === 'auto' && mode !== 'battle') throw new ApiError('Auto is available only in Battle Mode.', 400);
    if (mode === 'agent' && modality !== 'text') throw new ApiError('Agent Mode is text-only; its model is assigned automatically.', 400);
  }

  const demoAgentIdentity = { id: 'agent', name: 'Agent', org: "Automatic model selection", org_display: "Automatic model selection", color: '#a9c4ae', capabilities: [] };

  const demoWorkspaceTreeData = {
    '.': [
      { name: 'src', path: 'src', is_dir: true, size: 0 },
      { name: 'tests', path: 'tests', is_dir: true, size: 0 },
      { name: 'README.md', path: 'README.md', is_dir: false, size: 421 },
      { name: 'page.html', path: 'page.html', is_dir: false, size: 512 },
      { name: 'notes.txt', path: 'notes.txt', is_dir: false, size: 188 }
    ],
    src: [
      { name: 'app.py', path: 'src/app.py', is_dir: false, size: 1320 },
      { name: 'normalize.py', path: 'src/normalize.py', is_dir: false, size: 640 }
    ],
    tests: [
      { name: 'test_normalize.py', path: 'tests/test_normalize.py', is_dir: false, size: 512 }
    ]
  };

  const demoWorkspaceFileData = {
    'README.md': "# Photo Studio (demo)\n\nThis is a demonstration file in the browser. The real local folder was not read.",
    'page.html': "<!doctype html>\n<title>Demo page</title>\n<style>body{font-family:system-ui;background:#101418;color:#e8f0e9;padding:24px}h1{color:#9fd8ae}</style>\n<h1>Demo HTML preview</h1>\n<p>Rendered in a sandboxed frame.</p>",
    'notes.txt': "Demo notes: check the light, the grid, and the mobile version. No actions were performed on the computer.",
    'src/app.py': "# Demo file\n\ndef main() -> None:\n    print(\"Arena Desktop demo\")\n",
    'src/normalize.py': 'def normalize_name(value: str) -> str:\n    return " ".join(value.strip().split()).casefold()\n',
    'tests/test_normalize.py': "def test_demo() -> None:\n    assert True  # Demo file was not run\n"
  };

  function demoClone(value) {
    return JSON.parse(JSON.stringify(value));
  }

  function demoConnectorPresets() {
    const ws = demoStore.workspace;
    const installed = new Set(demoStore.connectors.map((server) => server.preset_id || server.name));
    const presets = [
      { id: 'filesystem', name: 'Filesystem', vendor: 'Model Context Protocol', description: "Files inside the selected working folder.", requirements: 'Node.js (npx)', docs: 'https://github.com/modelcontextprotocol/servers/tree/main/src/filesystem', Fields: [{ key: 'path', label: "Access folder", type: 'text', default: ws }], command: `npx -y @modelcontextprotocol/server-filesystem ${ws}` },
      { id: 'git', name: 'Git', vendor: 'Model Context Protocol', description: "History, status, diff, and branches of the local repository.", requirements: 'uv (uvx), Git', docs: 'https://github.com/modelcontextprotocol/servers/tree/main/src/git', Fields: [{ key: 'path', label: "Repository folder", type: 'text', default: ws }], command: `uvx mcp-server-git --repository ${ws}` },
      { id: 'fetch', name: 'Fetch', vendor: 'Model Context Protocol', description: "Loading web pages as text/Markdown.", requirements: 'uv (uvx)', docs: 'https://github.com/modelcontextprotocol/servers/tree/main/src/fetch', Fields: [], command: 'uvx mcp-server-fetch' },
      { id: 'memory', name: 'Memory', vendor: 'Model Context Protocol', description: "Agent's local long-term memory.", requirements: 'Node.js (npx)', docs: 'https://github.com/modelcontextprotocol/servers/tree/main/src/memory', Fields: [], command: 'npx -y @modelcontextprotocol/server-memory' },
      { id: 'time', name: 'Time', vendor: 'Model Context Protocol', description: "Current time and time zones.", requirements: 'uv (uvx)', docs: 'https://github.com/modelcontextprotocol/servers/tree/main/src/time', Fields: [], command: 'uvx mcp-server-time' },
      { id: 'sequential_thinking', name: 'Sequential Thinking', vendor: 'Model Context Protocol', description: "Structured step-by-step reasoning.", requirements: 'Node.js (npx)', docs: 'https://github.com/modelcontextprotocol/servers/tree/main/src/sequentialthinking', Fields: [], command: 'npx -y @modelcontextprotocol/server-sequential-thinking' },
      { id: 'everything', name: "Everything (MCP demo)", vendor: 'Model Context Protocol', description: "Official test MCP server.", requirements: 'Node.js (npx)', docs: 'https://github.com/modelcontextprotocol/servers/tree/main/src/everything', Fields: [], command: 'npx -y @modelcontextprotocol/server-everything' },
      { id: 'github', name: 'GitHub', vendor: 'GitHub', description: "Official GitHub MCP: repositories, issues, pull requests, and code.", requirements: 'Docker; GitHub Personal Access Token', docs: 'https://github.com/github/github-mcp-server', Fields: [{ key: 'token', label: 'GitHub Personal Access Token', type: 'password', required: false, help: "No token is required in the demo." }, { key: 'read_only', label: "Read-only (recommended)", type: 'checkbox', default: true }], command: 'docker run -i --rm -e GITHUB_PERSONAL_ACCESS_TOKEN -e GITHUB_READ_ONLY=1 ghcr.io/github/github-mcp-server' },
      { id: 'playwright', name: 'Playwright', vendor: 'Microsoft', description: "Official browser MCP Microsoft.", requirements: 'Node.js (npx)', docs: 'https://github.com/microsoft/playwright-mcp', Fields: [], command: 'npx -y @playwright/mcp@latest' }
    ];
    return presets.map((preset) => ({ ...preset, installed: installed.has(preset.id) }));
  }

  function demoConnectorSummary(server) {
    const tools = Array.isArray(server.tools) ? server.tools : [];
    return { ...demoClone(server), id: server.name, tools, tools_count: tools.length };
  }

  function demoConnectorsPayload() {
    return {
      ok: true,
      demo: true,
      config_path: 'C:\\Users\\Demo\\.arena-personal\\mcp.json',
      config_error: null,
      servers: demoStore.connectors.map(demoConnectorSummary),
      presets: demoConnectorPresets(),
      transports: { stdio: true, http: false }
    };
  }

  function demoToolsFor(server) {
    const byPreset = {
      filesystem: ['list_allowed_directories', 'list_directory', 'read_text_file'],
      git: ['git_status', 'git_log', 'git_diff_unstaged'],
      fetch: ['fetch'],
      memory: ['search_nodes', 'create_entities'],
      time: ['get_current_time', 'convert_time'],
      sequential_thinking: ['sequentialthinking'],
      everything: ['echo', 'add', 'get-sum'],
      github: ['search_repositories', 'get_me', 'list_issues'],
      playwright: ['browser_navigate', 'browser_snapshot']
    };
    return (byPreset[server.preset_id] || ['demo_echo']).map((name) => ({ name, description: "Demo tool", annotations: {} }));
  }

  function demoConnectServer(server) {
    server.running = true;
    server.status = 'connected';
    server.error = null;
    server.tools = demoToolsFor(server);
    return demoConnectorSummary(server);
  }

  // ═══ 04-demo-api.js ═══
  const demoApi = {
    async getSettings() { await sleep(40); return { ...demoStore.settings }; },
    async saveSettings(body) { Object.assign(demoStore.settings, body || {}); await sleep(40); return { ok: true }; },
    async getStatus() {
      await sleep(180);
      const current = demoStore.accounts.find((a) => a.id === demoStore.currentAccountId) || null;
      return {
        authenticated: demoStore.authenticated,
        email: demoStore.authenticated && current ? current.email : demoStore.email,
        full_name: demoStore.authenticated && current ? current.name : null,
        avatar_url: null,
        loading: false,
        engine_loading: false,
        generating: demoStore.streams.size > 0,
        generating_chat_ids: [...demoStore.streams].map((stream) => stream.chatId).filter(Boolean),
        accounts: demoStore.accounts.map((a) => ({ ...a, current: a.id === demoStore.currentAccountId && demoStore.authenticated })),
        current_account_id: demoStore.authenticated ? demoStore.currentAccountId : null,
        offline: demoStore.offline,
        session_error: demoStore.sessionError,
        mode: demoStore.mode,
        modality: demoStore.modality,
        desktop: true,
        engine: demoStore.engineOpen,
        permission_mode: demoStore.permissionMode,
        workspace: demoStore.workspace,
        workspace_chosen: true,
        app_version: '5.6.1',
        pending_permissions: demoStore.pendingPermissions.length,
        demo: true
      };
    },
    async login() { demoStore.pendingAdd = false; demoStore.loginAt = Date.now(); await sleep(220); return { ok: true, pending: true }; },
    async addAccount() { demoStore.pendingAdd = true; demoStore.loginAt = Date.now(); await sleep(220); return { ok: true, pending: true }; },
    async getAccounts() {
      await sleep(60);
      return { accounts: demoStore.accounts.map((a) => ({ ...a, current: a.id === demoStore.currentAccountId && demoStore.authenticated })), current_id: demoStore.authenticated ? demoStore.currentAccountId : null };
    },
    async switchAccount(id) {
      await sleep(160);
      const account = demoStore.accounts.find((a) => a.id === id);
      if (!account) throw new ApiError('That account is not saved in this app.', 404, { accounts: demoStore.accounts });
      if (account.expired) throw new ApiError('arena.ai rejected this session. Sign in to it again.', 401, { expired: true, accounts: demoStore.accounts.map((a) => ({ ...a, current: a.id === demoStore.currentAccountId })) });
      demoStore.currentAccountId = account.id;
      demoStore.authenticated = true;
      demoStore.email = account.email;
      return { ok: true, accounts: demoStore.accounts.map((a) => ({ ...a, current: a.id === account.id })) };
    },
    async removeAccount(id) {
      await sleep(80);
      demoStore.accounts = demoStore.accounts.filter((a) => a.id !== id);
      return { ok: true, accounts: demoStore.accounts.map((a) => ({ ...a, current: a.id === demoStore.currentAccountId && demoStore.authenticated })) };
    },
    async loginPoll() {
      await sleep(260);
      if (!demoStore.loginAt) return { done: false };
      if (Date.now() - demoStore.loginAt < 1700) return { done: false, pending: true };
      if (demoStore.pendingAdd) {
        demoStore.pendingAdd = false;
        let added = demoStore.accounts.find((a) => a.id === 'demo-acc-added');
        if (!added) {
          added = { id: 'demo-acc-added', email: 'added@local.invalid', name: 'Added User', avatar_url: null, expired: false };
          demoStore.accounts.push(added);
        }
        added.expired = false;
        demoStore.currentAccountId = added.id;
        demoStore.email = added.email;
      } else if (!demoStore.currentAccountId || !demoStore.accounts.some((a) => a.id === demoStore.currentAccountId)) {
        demoStore.currentAccountId = 'demo-acc-1';
        if (!demoStore.accounts.some((a) => a.id === 'demo-acc-1')) {
          demoStore.accounts.unshift({ id: 'demo-acc-1', email: 'demo@local.invalid', name: 'Demo User', avatar_url: null, expired: false });
        }
        demoStore.email = 'demo@local.invalid';
      }
      demoStore.authenticated = true;
      return { done: true, ok: true, authenticated: true };
    },
    async engineShow() { demoStore.engineOpen = true; await sleep(160); return { ok: true, engine: true, demo: true }; },
    async engineHide() { demoStore.engineOpen = false; await sleep(120); return { ok: true, engine: false, demo: true }; },
    async logout() {
      demoStore.accounts = demoStore.accounts.filter((a) => a.id !== demoStore.currentAccountId);
      demoStore.currentAccountId = null;
      demoStore.authenticated = false;
      demoStore.email = '';
      await sleep(180);
      return { ok: true };
    },
    async getModels(modality, mode) {
      await sleep(150);
      demoValidateSelection(mode || demoStore.mode, modality || demoStore.modality);
      if ((mode || demoStore.mode) === 'battle' || (modality || demoStore.modality) === 'video') return [];
      if ((mode || demoStore.mode) === 'agent') return [];
      const list = demoDefaultModels(modality).slice();
      return ((mode || demoStore.mode) === 'direct' && (modality || demoStore.modality) === 'text')
        ? [demoRouter, ...list] : list;
    },
    async setMode(mode) {
      const pair = normalizeSelection(mode, demoStore.modality);
      demoStore.mode = pair.mode;
      demoStore.modality = pair.modality;
      await sleep(180);
      return { ok: true, mode: pair.mode, modality: pair.modality };
    },
    async setModality(modality) {
      const next = demoStore.mode === 'agent' ? 'text' : modality;
      demoValidateSelection(demoStore.mode, next);
      demoStore.modality = next;
      await sleep(160);
      return { ok: true, modality: next };
    },
    async newChat() {
      demoStore.serial += 1;
      const id = `demo-chat-${Date.now()}-${demoStore.serial}`;
      demoStore.activeChatId = id;
      demoStore.messages[id] = [];
      demoStore.chats.unshift({ id, title: "New chat", updated_at: new Date().toISOString(), mode: demoStore.mode, modality: demoStore.modality, account: demoStore.currentAccountId || 'demo-acc-1' });
      await sleep(130);
      return { ok: true, chat_id: id };
    },
    async getChats() {
      await sleep(100);
      const current = demoStore.currentAccountId || 'demo-acc-1';
      return demoStore.chats.filter((chat) => (chat.account || 'demo-acc-1') === current).map((chat) => ({ ...chat }));
    },
    async getArenaChats() {
      await sleep(120);
      if (!demoStore.authenticated) throw new ApiError("Logged out of the profile in the demo.", 401);
      return {
        ok: true,
        entries: demoStore.cloudChats.map((entry) => {
          const local = demoStore.chats.find((chat) => chat.id === entry.eval_id || chat.eval_id === entry.eval_id);
          return { ...entry, local_chat_id: local?.id || null, local_mode: local?.mode || null };
        })
      };
    },
    async openArenaChat(id, type) {
      await sleep(160);
      const existing = demoStore.chats.find((chat) => chat.id === id || chat.eval_id === id);
      if (existing) return { ok: true, chat_id: existing.id, imported: false, demo: true };
      const entry = demoStore.cloudChats.find((item) => item.eval_id === id || item.id === id);
      if (!entry) throw new ApiError("Demo chat arena.ai not found.", 404);
      const chat = {
        id: entry.eval_id, eval_id: entry.eval_id, title: entry.title, updated_at: entry.updated_at,
        created_at: entry.created_at, mode: entry.mode, modality: entry.modality, source: 'arena',
        agent_backend: type === 'agentic' ? 'arena' : null
      };
      demoStore.chats.unshift(chat);
      demoStore.messages[chat.id] = demoClone(demoStore.cloudMessages[entry.eval_id] || []);
      return { ok: true, chat_id: chat.id, imported: true, demo: true };
    },
    async uploadAttachment(file, kind) {
      await sleep(260);
      const mediaType = file?.type || 'application/octet-stream';
      if (kind === 'agent') {
        return { ok: true, kind: 'agent', filename: file?.name || 'file', mediaType, url: 'demo://agent-file', size: file?.size || 0, demo: true };
      }
      return { ok: true, kind: 'evaluation', name: file?.name || 'file', contentType: mediaType, url: 'demo://file', size: file?.size || 0, demo: true };
    },
    async downloadWorkspaceFile(path) {
      await sleep(60);
      return new Blob([`Demo content of ${path}`], { type: 'text/plain' });
    },
    async vote(chatId, body) {
      await sleep(240);
      const messages = demoStore.messages[chatId] || [];
      // Pairs appear either as one dual record (text_b) or as consecutive
      // lane records 'a' + 'b' written by the demo stream.
      const pairs = [];
      for (let i = 0; i < messages.length; i += 1) {
        const item = messages[i];
        if (!item || item.role !== 'assistant') continue;
        if ('text_b' in item) pairs.push(item);
        else if (item.lane === 'a') {
          const next = messages[i + 1];
          if (next && next.role === 'assistant' && next.lane === 'b') pairs.push(item);
        }
      }
      const pairIndex = Number.isInteger(body?.pair_index) && body.pair_index >= 0 && body.pair_index < pairs.length
        ? body.pair_index : pairs.length - 1;
      const msg = pairs[pairIndex];
      if (!msg) throw new ApiError("There is no paired answer for voting in the demo chat.", 422);
      if (msg.vote) throw new ApiError("This answer has already been voted on.", 409);
      msg.vote = body?.value || 'tie';
      msg.names = { a: "Demo model A", b: "Demo model B" };
      return { ok: true, vote: msg.vote, names: msg.names, model_a: 'demo-a', model_b: 'demo-b', demo: true };
    },
    async getChat(id) {
      demoStore.activeChatId = id;
      const chat = demoStore.chats.find((item) => item.id === id);
      await sleep(110);
      if (!chat) throw new ApiError("Demo chat not found.", 404);
      if (chat.mode) demoStore.mode = chat.mode;
      if (chat.modality) demoStore.modality = chat.modality;
      const histChars = (demoStore.messages[chat.id] || []).reduce((sum, m) => sum + String(m.text || '').length + String(m.text_b || '').length, 0);
      return { ...chat, history_chars: histChars };
    },
    async refreshChat(id) {
      await sleep(80);
      return { ok: true, chat_id: id, added: 0, total: (demoStore.messages[id] || []).length, demo: true };
    },
    async deleteChat(id) {
      const chat = demoStore.chats.find((item) => item.id === id);
      demoStore.chats = demoStore.chats.filter((item) => item.id !== id);
      if (chat?.eval_id) demoStore.cloudChats = demoStore.cloudChats.filter((item) => item.eval_id !== chat.eval_id);
      delete demoStore.messages[id];
      await sleep(120);
      return { ok: true, arena: chat?.eval_id || chat?.source === 'arena' ? 'archived' : 'none', demo: true };
    },
    async compactChat(id) {
      await sleep(150);
      const list = demoStore.messages[id] || (demoStore.messages[id] = []);
      const notice = "Context compacted \u2014 this conversation continues in a fresh Arena session with a summary of everything above.";
      list.push({ role: 'notice', compact: true, digest_chars: 1200, text: notice });
      return { ok: true, digest_chars: 1200, history_chars: 1200, memory_saved: Boolean(demoStore.workspace), notice, demo: true };
    },
    async getMemory() {
      await sleep(80);
      return { enabled: demoStore.memoryEnabled !== false, folder: demoStore.workspace || null,
               global: demoStore.memoryGlobal || '', workspace: demoStore.memoryWorkspace ?? '', demo: true };
    },
    async saveMemory(body = {}) {
      await sleep(80);
      if (typeof body.global === 'string') demoStore.memoryGlobal = body.global;
      if (typeof body.workspace === 'string') demoStore.memoryWorkspace = body.workspace;
      if ('enabled' in body) demoStore.memoryEnabled = Boolean(body.enabled);
      return { ok: true, enabled: demoStore.memoryEnabled !== false, demo: true };
    },
    async getPulse() { return { ok: false }; },
    async syncProject() { return { ok: false }; },
    async updateDownload() { return { ok: false, error: 'Updates are disabled in demo mode.', demo: true }; },
    async updateStatus() { return { state: 'idle', demo: true }; },
    async updateApply() { return { ok: false, demo: true }; },
    async whatsNew() { return {}; },
    async clearWhatsNew() { return { ok: true }; },
    async updateCheck() { await sleep(60); return { enabled: true, current: 'demo', latest: null, update: false, url: null, demo: true }; },
    async exportSettings() { await sleep(60); return { app: 'Arena Desktop', version: 1, config: {}, memory_global: demoStore.memoryGlobal || '', memory_workspace: demoStore.memoryWorkspace || '', mcp: null, demo: true }; },
    async importSettings(bundle = {}) { await sleep(60); if (typeof bundle.memory_global === 'string') demoStore.memoryGlobal = bundle.memory_global; return { ok: true, backup: 'demo', demo: true }; },
    async diagnostics() { await sleep(60); return { text: 'Arena Desktop (demo)\nDiagnostics are illustrative in demo mode.', demo: true }; },
    async getUsage() {
      await sleep(40);
      const today = new Date().toISOString().slice(0, 10);
      return { today, current_account: 'demo',
        days: { [today]: { demo: { email: 'demo@local.invalid', sends: 42, by_modality: { text: 38, media: 4 }, models: { 'gpt-x-mini': 20, 'opus-max': 12 }, rate_limits: 1 } } },
        events: [{ ts: Math.floor(Date.now() / 1000) - 3600, account: 'demo@local.invalid', modality: 'text', model: 'opus-max', wait: 7200, message: "You've reached your Arena daily usage limit." }], demo: true };
    },
    async getGateway() {
      await sleep(40);
      const s = demoStore.gatewaySession || null;
      return { enabled: Boolean(demoStore.settings?.gateway_enabled), auto: Boolean(demoStore.settings?.gateway_auto),
        chosen: null,
        available: [{ name: 'blender', enabled: true, transport: 'stdio' }, { name: 'roblox_studio', enabled: true, transport: 'stdio' }],
        workspace: { available: true, folder: 'C:\\Users\\Demo\\Project', exposed: demoStore.settings?.gateway_workspace !== false },
        session: s || { state: 'off', url: null, servers: [], calls: [], error: null }, demo: true };
    },
    async startGateway() {
      await sleep(300);
      if (!demoStore.componentsInstalled?.cloudflared) {
        const err = new Error('cloudflared is not installed');
        err.details = { code: 'cloudflared_missing' };
        throw err;
      }
      demoStore.gatewaySession = { state: 'on', url: 'https://demo-gateway.trycloudflare.com', pairing: 'demo-pairing-code',
        servers: ['blender', 'roblox_studio'], started_at: Date.now() / 1000, expires_at: Date.now() / 1000 + 8 * 3600,
        calls: [{ ts: Date.now() / 1000 - 30, server: 'blender', tool: 'get_scene_info', ok: true, ms: 142 }], error: null };
      return { ok: true, session: demoStore.gatewaySession, demo: true };
    },
    async stopGateway() { await sleep(120); demoStore.gatewaySession = null; return { ok: true, demo: true }; },
    async getComponents() {
      await sleep(40);
      const installed = demoStore.componentsInstalled || {};
      const jobs = {};
      if (demoStore.componentJob) jobs[demoStore.componentJob.id] = demoStore.componentJob;
      return { components: [
        { id: 'cloudflared', name: 'cloudflared (Cloudflare Tunnel)', purpose: 'Agent Gateway tunnel.', installed: Boolean(installed.cloudflared), version: installed.cloudflared ? '2026.10.7' : null, install_kind: 'download', size_mb: 53, source: 'github.com/cloudflare/cloudflared', note: 'Demo data.' },
        { id: 'node', name: 'Node.js', purpose: 'npx-based local MCP servers.', installed: true, version: 'v22.0.0', install_kind: 'winget', source: 'winget', note: '' },
        { id: 'python', name: 'Python', purpose: 'Python MCP servers.', installed: false, version: null, install_kind: 'link', source: 'python.org', note: '' },
        { id: 'webview2', name: 'Microsoft Edge WebView2 Runtime', purpose: 'App window rendering.', installed: true, version: '141.0.0.0', install_kind: 'bootstrapper', source: 'Microsoft', note: '' }
      ], jobs, demo: true };
    },
    installComponent(id) {
      demoStore.componentJob = { id, state: 'downloading', progress: 20, error: null };
      setTimeout(() => { if (demoStore.componentJob) demoStore.componentJob.progress = 65; }, 500);
      setTimeout(() => {
        demoStore.componentJob = { id, state: 'done', progress: 100, error: null };
        demoStore.componentsInstalled = { ...(demoStore.componentsInstalled || {}), [id]: true };
      }, 1100);
      return Promise.resolve({ ok: true, demo: true });
    },
    async getQuestions() { await sleep(40); return []; },
    async answerQuestion() { await sleep(40); return { ok: true, demo: true }; },
    async getMediaChoices() { await sleep(40); return demoClone(demoStore.mediaChoices || []); },
    async answerMediaChoice(id, body = {}) {
      await sleep(60);
      const item = (demoStore.mediaChoices || []).find((choice) => String(choice.id) === String(id));
      const selected = Number.isFinite(Number(body.selected_index)) ? Number(body.selected_index)
        : Number(item?.candidates?.[0]?.index || 0);
      if (item) {
        item.status = 'completed';
        item.selected_index = selected;
        item.selection_method = body.skip ? 'skip' : 'user';
      }
      demoStore.mediaChoices = (demoStore.mediaChoices || []).filter((choice) => String(choice.id) !== String(id));
      return { ok: true, selected_index: selected, selection_method: body.skip ? 'skip' : 'user', demo: true };
    },
    async searchChats() { await sleep(40); return []; },
    async forkChat() { await sleep(40); return { ok: true, chat_id: null, demo: true }; },
    async restoreCheckpoint() { await sleep(40); return { ok: true, restored: 0, removed: 0, demo: true }; },
    async workspaceSnapshot() { await sleep(40); return { ok: true, text: '[Attached workspace files]\n\n--- demo.txt ---\nDemo file content.\n\n[/Attached workspace files]', chars: 90, files: 1, demo: true }; },
    async getElo() { await sleep(40); return { enabled: true, models: {}, demo: true }; },
    async getAutomations() { await sleep(40); return { items: demoStore.automations || [] }; },
    async saveAutomation(body) { await sleep(40); const item = { id: body?.id || `demo-auto-${Date.now()}`, ...body }; demoStore.automations = [...(demoStore.automations || []).filter((x) => x.id !== item.id), item]; return { ok: true, item, demo: true }; },
    async deleteAutomation(id) { await sleep(40); demoStore.automations = (demoStore.automations || []).filter((x) => x.id !== id); return { ok: true, demo: true }; },
    async runAutomation() { await sleep(40); return { ok: true, demo: true }; },
    async archiveArenaChat(id) {
      demoStore.cloudChats = demoStore.cloudChats.filter((item) => item.eval_id !== id && item.id !== id);
      await sleep(120);
      return { ok: true, arena: 'archived', demo: true };
    },
    async getHistory() {
      await sleep(130);
      return (demoStore.messages[demoStore.activeChatId] || []).map((message) => ({ ...message }));
    },
    async getPermissions() { await sleep(80); return demoStore.pendingPermissions.map((item) => ({ ...item })); },
    async decidePermission(id, decision) {
      const permission = demoStore.pendingPermissions.find((item) => String(item.id) === String(id));
      demoStore.pendingPermissions = demoStore.pendingPermissions.filter((item) => String(item.id) !== String(id));
      if (permission?.resolve) permission.resolve(decision);
      await sleep(160);
      return { ok: true, decision, demo: true };
    },
    async getPermissionMode() { await sleep(90); return { mode: demoStore.permissionMode }; },
    async setPermissionMode(mode) { demoStore.permissionMode = mode; await sleep(150); return { ok: true, mode }; },
    async getWorkspace() { await sleep(80); return { path: demoStore.workspace, workspace: demoStore.workspace, panel_root: demoStore.workspace }; },
    async setWorkspace(path) { demoStore.workspace = path; await sleep(160); return { ok: true, path }; },
    async runLocal(path) {
      await sleep(400);
      return { ok: true, id: 'bg1', folder: path || demoStore.workspace, cmd: 'npm install && npm run dev',
        running: true, urls: [], log: 'added 312 packages in 9s' };
    },
    async runLocalState(id) {
      await sleep(120);
      return { ok: true, id, running: true, urls: ['http://localhost:3000'], log: '  - Local: http://localhost:3000' };
    },
    async stopRunLocal(id) { await sleep(120); return { ok: true, id, running: false, urls: [], log: '' }; },
    async clearWorkspace() { demoStore.workspace = 'C:\\Users\\Demo\\ArenaProjects\\workspace'; await sleep(120); return { ok: true, workspace: demoStore.workspace, cleared: true }; },
    async saveWorkspace(chatId, lane) {
      await sleep(220);
      return { ok: true, path: `${demoStore.workspace}\\demo-save-${lane || 'a'}`, demo: true };
    },
    async openWorkspace() { await sleep(120); return { ok: true, demo: true, note: "Cannot open demo folder." }; },
    async getWorkspaceTree(path = '.') {
      await sleep(90);
      const key = String(path || '.');
      if (!(key in demoWorkspaceTreeData)) throw new ApiError("Demo folder not found.", 404);
      return { root: demoStore.workspace, path: key, entries: demoClone(demoWorkspaceTreeData[key]), truncated: false, demo: true };
    },
    async getWorkspaceFile(path) {
      await sleep(90);
      const key = String(path || '');
      if (!(key in demoWorkspaceFileData)) throw new ApiError("Demo file not found or unavailable for preview.", 404);
      return { path: key, name: key.split('/').pop(), size: demoWorkspaceFileData[key].length, content: demoWorkspaceFileData[key], demo: true };
    },
    async saveWorkspaceFile(path, content) {
      await sleep(120);
      const key = String(path || '');
      demoWorkspaceFileData[key] = String(content ?? '');
      return { ok: true, path: key, name: key.split('/').pop(), size: demoWorkspaceFileData[key].length, demo: true };
    },
    async getChatProject() {
      await sleep(60);
      return { root: demoStore.workspace, rel: '.', name: 'Demo', lane: 'a', mode: 'direct', modality: 'webdev', demo: true };
    },
    async getConnectors() { await sleep(110); return demoConnectorsPayload(); },
    async reloadConnectors() { await sleep(110); return demoConnectorsPayload(); },
    async openConnectorConfig() { await sleep(110); return { ok: true, path: 'C:\\Users\\Demo\\.arena-personal\\mcp.json', demo: true }; },
    async installConnectorPreset(presetId, values, connect = true) {
      await sleep(180);
      const preset = demoConnectorPresets().find((item) => item.id === presetId);
      if (!preset) throw new ApiError("Demo connector not found.", 404);
      if (demoStore.connectors.some((server) => server.name === presetId)) throw new ApiError(`Connector already exists: ${presetId}`, 400);
      let command = preset.command;
      if ((presetId === 'filesystem' || presetId === 'git') && values?.path) command = command.replace(demoStore.workspace, String(values.path));
      const server = {
        id: presetId, name: presetId, preset_id: presetId, source: 'official', transport: 'stdio',
        enabled: true, running: false, status: 'stopped', description: `${preset.description} (demo: the process does not start)`,
        command_display: command, tools: [], tools_count: 0, error: null
      };
      demoStore.connectors.push(server);
      const summary = connect ? demoConnectServer(server) : demoConnectorSummary(server);
      return { ...demoConnectorsPayload(), server: summary };
    },
    async addConnectorCli(body) {
      await sleep(180);
      const name = String(body?.name || '').trim();
      const command = String(body?.command || '').trim();
      if (!name || !command) throw new ApiError("Name and CLI command are required.", 400);
      if (demoStore.connectors.some((server) => server.name === name)) throw new ApiError(`Connector already exists: ${name}`, 400);
      const server = {
        id: name, name, preset_id: null, source: 'custom', transport: 'stdio', enabled: true,
        running: false, status: 'stopped', description: String(body.description || "Custom demo MCP. Command not executed."),
        command_display: command, tools: [], tools_count: 0, error: null
      };
      demoStore.connectors.push(server);
      const summary = body.connect === false ? demoConnectorSummary(server) : demoConnectServer(server);
      return { ...demoConnectorsPayload(), server: summary };
    },
    async connectConnector(name) {
      await sleep(180);
      const server = demoStore.connectors.find((item) => item.name === name);
      if (!server) throw new ApiError("Demo connector not found.", 404);
      if (!server.enabled) throw new ApiError("Connector is disabled in demo configuration.", 400);
      return { ...demoConnectorsPayload(), server: demoConnectServer(server) };
    },
    async disconnectConnector(name) {
      await sleep(100);
      const server = demoStore.connectors.find((item) => item.name === name);
      if (server) { server.running = false; server.status = 'stopped'; server.tools = []; }
      return demoConnectorsPayload();
    },
    async setConnectorEnabled(name, enabled) {
      await sleep(120);
      const server = demoStore.connectors.find((item) => item.name === name);
      if (!server) throw new ApiError("Demo connector not found.", 404);
      server.enabled = Boolean(enabled);
      if (!enabled) { server.running = false; server.status = 'disabled'; server.tools = []; }
      else if (server.status === 'disabled') server.status = 'stopped';
      return demoConnectorsPayload();
    },
    async deleteConnector(name) {
      await sleep(120);
      demoStore.connectors = demoStore.connectors.filter((server) => server.name !== name);
      return demoConnectorsPayload();
    },
    async getArenaConnectors() {
      await sleep(110);
      if (!demoStore.authenticated) throw new ApiError("Login not performed (demo).", 401);
      return { ok: true, demo: true, source: 'arena', connectors: demoClone(demoStore.arenaConnectors) };
    },
    async connectArenaConnector(slug) {
      await sleep(180);
      const item = demoStore.arenaConnectors.find((entry) => entry.slug === slug);
      if (!item) throw new ApiError("Demo connector Arena not found.", 404);
      demoStore.arenaConnectorPending[slug] = Date.now();
      return { ok: true, pending: true, slug, demo: true };
    },
    async pollArenaConnector(slug) {
      await sleep(120);
      const item = demoStore.arenaConnectors.find((entry) => entry.slug === slug);
      const started = demoStore.arenaConnectorPending[slug] || 0;
      if (item && started && Date.now() - started > 900) {
        item.auth_status = 'connected';
        item.connected = true;
        delete demoStore.arenaConnectorPending[slug];
        return { ok: true, done: true, connected: true, slug, demo: true, connectors: demoClone(demoStore.arenaConnectors) };
      }
      return { ok: true, done: false, connected: false, slug, demo: true };
    },
    async disconnectArenaConnector(slug) {
      await sleep(140);
      const item = demoStore.arenaConnectors.find((entry) => entry.slug === slug);
      if (item) { item.auth_status = 'disconnected'; item.connected = false; }
      return { ok: true, slug, demo: true, connectors: demoClone(demoStore.arenaConnectors) };
    },
    async openNativeAgent() { await sleep(160); return { ok: true, demo: true, url: 'https://arena.ai/agent' }; },
    async saveMedia() { await sleep(180); return { ok: true, path: `${demoStore.workspace}\\demo-media.png`, demo: true }; },
    async getDoctor() {
      await sleep(220);
      return {
        demo: true,
        backend: "browser simulation",
        python: "unavailable in demo",
        webview2: "checked by the application",
        desktop_bridge: "simulated only for demo",
        workspace: demoStore.workspace,
        official_client: false,
        note: "Demonstration data. Real diagnostics are only available through the local Flask backend."
      };
    },
    async stop(chatId) {
      for (const stream of demoStore.streams) {
        if (!chatId || String(stream.chatId) === String(chatId)) stream.stopped = true;
      }
      for (const permission of demoStore.pendingPermissions) {
        if (permission.resolve && (!chatId || String(permission.chat_id) === String(chatId))) permission.resolve('deny');
      }
      await sleep(100);
      return { ok: true, demo: true };
    },
    async streamChat(body, onEvent, signal) {
      demoStore.loading = true;
      const chatId = body.chat_id || demoStore.activeChatId;
      const controller = {
        stopped: false,
        signal,
        chatId,
        pendingResolvers: new Map()
      };
      demoStore.activeStream = controller;
      demoStore.streams.add(controller);
      const chat = demoStore.chats.find((item) => item.id === chatId);
      let modality = body.modality || demoStore.modality;
      const mode = body.mode || demoStore.mode;
      if (mode === 'battle' && modality === 'auto') modality = 'text'; // demo router resolves to Text
      demoStore.modality = modality;
      demoStore.mode = mode;
      demoValidateSelection(mode, modality);
      const allModels = demoDefaultModels(modality);
      const selectedA = mode === 'agent' ? demoAgentIdentity : (demoFindModel(body.model_id) || allModels[0]);
      const selectedB = demoFindModel(body.model_id_b) || allModels.find((model) => model.id !== selectedA?.id) || allModels[0];
      const laneModels = {
        a: mode === 'battle' ? allModels[0] : selectedA,
        b: mode === 'battle' ? allModels[1] || allModels[0] : selectedB
      };
      const emit = (event) => {
        if (signal?.aborted) return;
        try { onEvent(event); } catch (error) { console.error(error); }
      };
      const checkStop = () => controller.stopped || Boolean(signal?.aborted);
      const stoppedNotice = () => {
        emit({ type: 'notice', message: "Generation stopped. This is a demonstration event." });
        emit({ type: 'done', stopped: true, demo: true });
      };
      const typeOut = async (lane, text, model) => {
        let index = 0;
        while (index < text.length) {
          if (checkStop()) return false;
          const size = 5 + Math.floor(Math.random() * 18);
          emit({ type: 'text', model: lane, text: text.slice(index, index + size) });
          index += size;
          await sleep(14 + Math.floor(Math.random() * 18));
        }
        return true;
      };
      const requestPermission = (permission) => new Promise((resolve) => {
        const record = {
          ...permission,
          demo: true,
          resolve,
          status: 'pending',
          chat_id: chatId
        };
        demoStore.pendingPermissions.push(record);
        emit({ type: 'permission', ...permission, chat_id: chatId });
      });

      try {
        emit({
          type: 'meta',
          mode,
          modality,
          chat_id: chatId,
          models: {
            a: laneModels.a ? { ...laneModels.a } : null,
            b: (mode === 'battle' || mode === 'side-by-side') && laneModels.b ? { ...laneModels.b } : null
          }
        });
        emit({ type: 'reasoning', model: 'a', text: "Demo mode: response " });
        emit({ type: 'reasoning', model: 'a', text: "and events are generated locally. " });
        emit({ type: 'reasoning', model: 'a', text: "No real request to the models was sent." });
        await sleep(160);

        const prompt = body.message.toLowerCase();
        const twoLanes = mode === 'battle' || mode === 'side-by-side';
        const wantsLanding = /landing|website|page/.test(prompt);
        const wantsCode = modality === 'code' || /code|python|javascript|function/.test(prompt);

        const textA = wantsCode || modality === 'code'
          ? `### Demo mode: plan without execution

Below is a **conditional example**, not the result of a real model or sandbox.

1. First, identify the input data and expected behavior.
2. Isolate the problem with a small test.
3. Check edge cases and only then change the implementation.

\`\`\`python
def normalize_name(value: str) -> str:
    """Safe demonstration example."""
    return " ".join(value.strip().split()).casefold()
\`\`\`

The local folder is not fully transferred to the remote sandbox. Files and preview links appear only based on server events.`
          : wantsLanding
            ? `### Calm Page Framework

In the demo, I will show the direction, not the finished published result.

- **Hero:** a large photo and a short phrase.
- **Works:** an airy grid with different proportions.
- **Approach:** one accent color and lots of white space.
- **Mobile version:** single-column rhythm without losing air.

\`\`\`css
.hero {
  display: grid;
  gap: clamp(1.25rem, 4vw, 4rem);
  grid-template-columns: minmax(0, 1.2fr) minmax(220px, .8fr);
}

@media (max-width: 720px) {
  .hero { grid-template-columns: 1fr; }
}
\`\`\`

The next step is to agree on the structure, content, and images.`
            : `### Demonstration Response

Thank you, the request has been received. This is a **interface simulation**: text, models, and events are generated locally, without a request to arena.ai.

- Settings can be changed in the input field.
- A/B responses are displayed side by side in Battle and Side-by-side modes.
- Permissions and sandbox actions require explicit confirmation.

How can I assist further?`;

        const textB = mode === 'battle'
          ? `### Second Demonstration Variant

A more compact approach: start with a single scenario and test it in a narrow window.

1. One key screen.
2. Check at a width of 360 px.
3. Only after that — additional blocks.

This is **not an Arena model evaluation** and not the result of actual generation.`
          : wantsLanding
            ? `### Alternative Presentation

Editorial grid: large typography, photo captions, and one clear contact.

- Studio name instead of an advertising slogan.
- Series of shots with an asymmetric rhythm.
- Dark or paper palette.

All content is for demonstration.`
            : `### Second Direction

You can start with a more structured option: one script, short captions, and a clear next action. This is a simulated demo mode response.`;

        const okA = await typeOut('a', textA);
        if (!okA) { stoppedNotice(); return; }
        if (twoLanes) {
          const okB = await typeOut('b', textB);
          if (!okB) { stoppedNotice(); return; }
        }

        if (modality === 'search') {
          emit({ type: 'source', model: 'a', title: "Demo source: WebView2 overview", url: 'https://example.com/demo/webview2', snippet: "Simulated source card." });
          emit({ type: 'source', model: 'a', title: "Demo source: pywebview documentation", url: 'https://example.com/demo/pywebview', snippet: "The link is marked as a demonstration." });
          emit({ type: 'notice', message: "Sources and links in demo mode are simulated." });
        }

        if (modality === 'image') {
          emit({ type: 'media', model: 'a', kind: 'image', url: demoArtwork("Calm cover", 162, "demo image · without real generation"), title: "Demo cover · 16:10" });
          emit({ type: 'notice', message: "Media in demo mode is created locally, not by the arena.ai server." });
        }

        if (modality === 'video') {
          emit({ type: 'media', model: 'a', kind: 'video', poster: demoArtwork("Video · demo", 205, "no file was created"), title: "Demonstration video event · without file" });
          emit({ type: 'notice', message: "The video file was not created. Only a demonstration event is shown." });
        }

        if (mode === 'agent') {
          emit({ type: 'agent', stage: 'planning', message: "I am making a demonstration plan. Commands are not executed without permission." });
          emit({
            type: 'tool_call', id: 'demo-tool-1', name: 'read_file', model: 'a',
            title: "Read the project file",
            path: `${demoStore.workspace}\\app.py`,
            status: 'running'
          });
          await sleep(480);
          if (checkStop()) { stoppedNotice(); return; }
          emit({ type: 'tool_result', id: 'demo-tool-1', status: 'ok', output: "Demo: the contents of the file were not read or transmitted." });
          emit({ type: 'tool_call', id: 'demo-tool-2', tool: 'run_cmd', model: 'a', command: 'npm install && npm run build', status: 'running' });
          const demoLines = ['added 214 packages, and audited 215 packages in 3s', '', '> demo-site@1.0.0 build', '> vite build',
            'vite v5.4.0 building for production...', 'transforming (12) src/main.js', '✓ 34 modules transformed.',
            'dist/index.html                 0.46 kB', 'dist/assets/index-4f2a.css     2.10 kB', 'dist/assets/index-9c1b.js     48.31 kB',
            '✓ built in 612ms'];
          for (let i = 1; i <= demoLines.length; i += 3) {
            await sleep(260);
            if (checkStop()) { stoppedNotice(); return; }
            emit({ type: 'tool_progress', id: 'demo-tool-2', output: demoLines.slice(0, i).join('\n') });
          }
          emit({ type: 'tool_result', id: 'demo-tool-2', status: 'ok', output: `exit code 0\n${demoLines.join('\n')}` });
          emit({ type: 'tool_call', id: 'demo-tool-3', tool: 'edit_file', model: 'a', rel: 'src/main.js', status: 'running',
            diff: "--- src/main.js\n+++ src/main.js\n@@ -1,3 +1,3 @@\n-const title = 'Hello';\n+const title = 'Engineering portfolio';\n render(title);" });
          emit({ type: 'tool_result', id: 'demo-tool-3', status: 'ok', output: 'Edited src/main.js' });
          emit({ type: 'tool_call', id: 'demo-tool-4', tool: 'run_cmd', model: 'a', command: 'npm test', status: 'running' });
          emit({ type: 'tool_result', id: 'demo-tool-4', status: 'error', output: 'exit code 1\nFAIL src/main.test.js\n  expected "Hello" to be "Engineering portfolio"\n[Process exited with code 1]' });
          const permission = {
            id: `demo-permission-${Date.now()}`,
            kind: 'command',
            category: "Run commands",
            title: "Run tests in the sandbox?",
            description: "Demo request. The command will not be executed on your computer.",
            command: 'python -m pytest -q',
            cwd: demoStore.workspace,
            path: demoStore.workspace,
            diff: null,
            lane: 'a'
          };
          const decision = await requestPermission(permission);
          if (checkStop() && !decision) { stoppedNotice(); return; }
          emit({ type: 'permission_done', id: permission.id, decision });
          if (decision === 'allow' || decision === 'always') {
            emit({ type: 'tool_result', id: `demo-permission-${permission.id}`, status: 'ok', output: "Demo: check marked as allowed. The command was not executed." });
            emit({ type: 'text', model: 'a', text: "\n\nPermission granted in demo. **The real command was not executed.** Permission bypass is not used." });
          } else {
            emit({ type: 'text', model: 'a', text: "\n\nAction denied. **The command was not run**, the working folder was not changed." });
            emit({ type: 'notice', message: "Permission denied by the user in the demo scenario." });
          }
        }

        if (modality === 'code') {
          emit({ type: 'sandbox', id: 'demo-sandbox-1', status: 'ready', title: "Demo sandbox", note: "The local folder did not fully load." });
          emit({ type: 'files_written', model: 'a', lane: 'a', files: [
            { path: 'src/normalize.py', name: 'normalize.py', note: "simulated file" },
            { path: 'tests/test_normalize.py', name: 'test_normalize.py', note: "simulated file" }
          ] });
          emit({ type: 'preview', model: 'a', lane: 'a', title: "Demonstration preview", url: 'https://example.com/demo/preview' });
          emit({ type: 'sandbox_done', id: 'demo-sandbox-1', status: 'idle', message: "The demo sandbox completed the simulation." });
        }

        if (checkStop()) { stoppedNotice(); return; }
        emit({ type: 'done', demo: true });

        if (chat) {
          demoStore.messages[chatId] = demoStore.messages[chatId] || [];
          demoStore.messages[chatId].push({ role: 'user', content: body.message, attachments: Array.isArray(body.attachments) ? body.attachments : [], created_at: new Date().toISOString() });
          const laneA = { role: 'assistant', lane: 'a', model_id: laneModels.a?.id, model_name: laneModels.a?.name || "Model A", content: textA, created_at: new Date().toISOString() };
          demoStore.messages[chatId].push(laneA);
          if (twoLanes) demoStore.messages[chatId].push({ role: 'assistant', lane: 'b', model_id: laneModels.b?.id, model_name: laneModels.b?.name || "Model B", content: textB, created_at: new Date().toISOString() });
          if (chat.title === "New chat") chat.title = truncate(body.message, 48);
          chat.updated_at = new Date().toISOString();
        }
      } catch (error) {
        if (!checkStop()) {
          emit({ type: 'error', message: errorMessage(error) });
          emit({ type: 'done', demo: true });
        }
      } finally {
        demoStore.streams.delete(controller);
        demoStore.loading = demoStore.streams.size > 0;
        if (demoStore.activeStream === controller) demoStore.activeStream = null;
      }
    }
  };

  /* ---------------------------------------------------------------------- */
  /* Application state                                                     */
  /* ---------------------------------------------------------------------- */
  const MODES = [
    { id: 'battle', label: 'Battle Mode', title: 'Battle Mode', desc: 'Battle 2 anonymous models', icon: 'swords' },
    { id: 'agent', label: 'Agent Mode', title: 'Agent Mode', desc: 'Built for complex tasks', icon: 'spark' },
    { id: 'side-by-side', label: 'Side by Side', title: 'Side by Side', desc: 'Compare 2 models of your choice', icon: 'columns' },
    { id: 'direct', label: 'Direct', title: 'Direct', desc: 'Chat with 1 model at a time', icon: 'message' }
  ];
  const MODALITIES = [
    { id: 'video', label: 'Video', icon: 'video', desc: 'Generate Videos' },
    { id: 'image', label: 'Image', icon: 'image', desc: 'Generate Images' },
    { id: 'search', label: 'Web Search', icon: 'globe', desc: 'Search the Web' },
    { id: 'code', label: 'Code', icon: 'code', desc: 'Build Apps and Websites' },
    { id: 'text', label: 'Text', icon: 'type', desc: 'Try Language and Vision models' },
    { id: 'auto', label: 'Auto', icon: 'spark', desc: 'Automatically Detect Modality' }
  ];
  const PERMISSION_MODES = [
    { id: 'default', label: 'Ask', short: 'Ask', icon: 'shield', desc: 'Ask before file changes and commands' },
    { id: 'acceptEdits', label: 'Accept edits', short: 'Accept edits', icon: 'check', desc: 'File edits run automatically, commands still ask' },
    { id: 'auto', label: 'Auto', short: 'Auto', icon: 'spark', desc: 'Safe actions run automatically' },
    { id: 'plan', label: 'Plan only', short: 'Plan only', icon: 'file-text', desc: 'Read and plan — no changes' },
    { id: 'bypassPermissions', label: 'Bypass permissions', short: 'Bypass', icon: 'shield-alert', desc: 'Everything runs without asking', danger: true }
  ];
  const VALID_MODES = MODES.map((item) => item.id);
  const VALID_MODALITIES = MODALITIES.map((item) => item.id);
  const VALID_PERMISSION_MODES = PERMISSION_MODES.map((item) => item.id);

  const state = {
    demo: DEMO,
    booted: false,
    phase: 'loading',
    status: null,
    serverError: null,
    networkOffline: !navigator.onLine,
    retrying: false,
    authenticated: false,
    email: '',
    fullName: '',
    avatarUrl: '',
    backendReached: false,
    mode: 'direct',
    modality: 'text',
    savedModality: 'auto',
    layout: { sidebarWidth: 276, workspaceWidth: 332, connectorsShare: 38 },
    selectionTouched: false,
    // Agent has two honest backends: Arena's native Agent Mode (opens on the
    // site, never a Direct chat) and the local folder-tools loop.
    agentKind: (() => { try { return window.localStorage.getItem('ap-agent-kind') === 'local' ? 'local' : 'native'; } catch { return 'native'; } })(),
    directTools: (() => { try { return window.localStorage.getItem('ap-direct-tools') !== '0'; } catch { return true; } })(),
    rateLimitUntil: 0,
    usageRemaining: null,
    usageReset: null,
    usageModality: null,
    usageSendsToday: 0,
    usageRateLimitsToday: 0,
    historyChars: 0,
    memoryData: null,
    updateInfo: null,
    appSettings: null,
    pendingQuestions: [],
    pendingMediaChoices: [],
    answeringMediaChoices: new Set(),
    activeChatEvalId: null,
    activeChatSource: 'local',
    refreshingChatId: null,
    refreshCheckedAt: {},
    chatTodos: {},
    fanoutModels: [],
    eloModels: null,
    searchResults: [],
    _rateLimitTimer: null,
    appVersion: '',
    workspaceChosen: false,
    permissionMode: 'default',
    workspace: '',
    desktop: false,
    engineOpen: false,
    engineKnown: false,
    nativeReady: false,
    dockShare: 0.42,
    sidebarCollapsed: false,
    chats: [],
    chatsLoading: true,
    chatsError: null,
    cloudChats: [],
    cloudChatsLoading: false,
    cloudChatsError: null,
    chatFilter: '',
    workspacePanelOpen: false,
    workspacePanelRoot: '',
    workspaceTree: [],
    workspaceTreeLoaded: false,
    workspaceTreeLoading: false,
    workspaceTreeError: null,
    workspaceTreeTruncated: false,
    workspaceChildren: {},
    workspaceLoadingPaths: new Set(),
    workspaceExpanded: new Set(),
    workspaceRequest: 0,
    connectors: null,
    connectorsLoading: false,
    connectorsError: null,
    connectorBusy: new Set(),
    connectorRequest: 0,
    arenaConnectors: null,
    arenaConnectorsLoading: false,
    arenaConnectorsError: null,
    arenaConnectorBusy: new Set(),
    arenaConnectorsOff: new Set(),
    arenaConnectorRequest: 0,
    arenaConnectorPoll: null,
    activeChatId: null,
    activeChatTitle: '',
    messages: [],
    historyLoading: false,
    historyError: null,
    view: 'welcome',
    models: [],
    modelsLoading: false,
    modelsError: null,
    modelsMode: null,
    modelsModality: null,
    modelsPromise: null,
    modelsRequest: 0,
    modelAId: null,
    modelBId: null,
    pendingChanges: 0,
    transitionQueue: Promise.resolve(),
    generating: false,
    remoteBusy: false,
    stopping: false,
    stopRequested: false,
    starting: false,
    currentStream: null,
    activeGeneration: null,
    // Per-chat generation state: several chats can work at once.  The
    // legacy Fields above mirror the OPEN chat only (kept in sync by
    // syncGenerationState), while these hold every running chat.
    generations: new Map(),
    chatTurns: {},
    unreadDone: new Set(),
    accounts: [],
    currentAccountId: null,
    accountBusy: false,
    pendingPermissions: [],
    permissionCount: 0,
    decidingPermissions: new Set(),
    artifacts: [],
    attachments: [],
    challenge: null,
    loginPending: false,
    settingsTab: 'connection',
    settingsRerender: null,
    draft: '',
    unread: false
  };

  const API = DEMO ? demoApi : liveApi;
  const els = {};

  const UNREAD_DONE_KEY = 'arenaDesktop.unreadDone.v1';
  function loadUnreadDone() {
    try {
      const raw = JSON.parse(localStorage.getItem(UNREAD_DONE_KEY) || '[]');
      if (Array.isArray(raw)) state.unreadDone = new Set(raw.map(String));
    } catch { /* storage unavailable */ }
  }
  function saveUnreadDone() {
    try { localStorage.setItem(UNREAD_DONE_KEY, JSON.stringify([...state.unreadDone])); } catch { /* noop */ }
  }
  function chatIsGenerating(chatId) {
    return chatId != null && state.generations.has(String(chatId));
  }
  function anyGenerationRunning() { return state.generations.size > 0; }
  function syncGenerationState() {
    const gen = state.activeChatId ? state.generations.get(String(state.activeChatId)) : null;
    state.generating = Boolean(gen);
    state.activeGeneration = gen || null;
    state.currentStream = gen ? gen.controller : null;
    state.stopRequested = Boolean(gen && gen.stopRequested);
    if (!gen) state.stopping = false;
    updateComposerState();
    renderChats();
    renderQueuedBar();
  }
  function stashActiveTurns() {
    if (state.activeChatId && Array.isArray(state.messages) && state.messages.length) {
      state.chatTurns[String(state.activeChatId)] = state.messages;
    }
  }
  function markChatSeen(chatId) {
    if (chatId == null) return;
    if (state.unreadDone.delete(String(chatId))) saveUnreadDone();
  }

  /* ---------------------------------------------------------------------- */
  // ═══ 05-state.js ═══
  /* State normalizers and common UI state                                 */
  /* ---------------------------------------------------------------------- */
  function validMode(value) { return VALID_MODES.includes(value) ? value : null; }
  function validModality(value) {
    // Older chats and the server's initial state use API aliases. Auto is a
    // real Battle work type now, not an alias for Text.
    const canonical = ({ chat: 'text', webdev: 'code' })[value] || value;
    return VALID_MODALITIES.includes(canonical) ? canonical : null;
  }
  function validPermissionMode(value) { return VALID_PERMISSION_MODES.includes(value) ? value : null; }

  function selectionIssue(mode, modality) {
    // Agent never blocks on the work type: it runs as Text while its
    // work-type selector is hidden, exactly like arena.ai.
    if (mode === 'agent') return '';
    if (modality === 'video' && mode !== 'battle') return 'Video is available only in Battle Mode; Arena selects both models.';
    if (modality === 'auto' && mode !== 'battle') return 'Auto is available only in Battle Mode.';
    return '';
  }
  function isValidSelection(mode, modality) { return !selectionIssue(mode, modality); }
  function normalizeSelection(mode, modality) {
    const nextMode = validMode(mode) || 'battle';
    let nextModality = validModality(modality) || 'text';
    if (nextMode === 'agent') nextModality = 'text';
    else if ((nextModality === 'video' || nextModality === 'auto') && nextMode !== 'battle') nextModality = 'text';
    return { mode: nextMode, modality: nextModality };
  }
  function modalityOptionsForMode(mode) {
    if (mode === 'agent') return [];
    if (mode === 'battle') return MODALITIES;
    return MODALITIES.filter((item) => item.id !== 'video' && item.id !== 'auto');
  }
  function allowsManualModels(mode = state.mode, modality = state.modality) {
    return (mode === 'direct' || mode === 'side-by-side') && modality !== 'video';
  }
  function chatLocked() {
    // After the first message, a chat keeps its mode, modality and models
    // (like arena.ai): the selection controls only apply to new chats.
    return Boolean(state.activeChatId)
      && (state.messages || []).some((turn) => turn && (turn.user || Object.keys(turn.lanes || {}).length));
  }
  function lockedNotice(what) {
    toast(`${what} Recorded after the first message — like on arena.ai. Create a new chat to make changes.`,
      'info', "Chat already started");
  }
  function modeMeta(value) { return MODES.find((item) => item.id === value) || MODES.find((item) => item.id === 'direct'); }
  function modalityMeta(value) { return MODALITIES.find((item) => item.id === value) || MODALITIES.find((item) => item.id === 'text'); }
  function permissionMeta(value) { return PERMISSION_MODES.find((item) => item.id === value) || PERMISSION_MODES[0]; }

  function normalizeWorkspace(raw) {
    if (!raw) return '';
    if (typeof raw === 'string') return raw;
    if (typeof raw === 'object') {
      const value = raw.path ?? raw.workspace ?? raw.directory ?? raw.cwd;
      return typeof value === 'string' ? value : '';
    }
    return '';
  }

  function normalizeEngine(raw) {
    if (raw === null || raw === undefined) return { known: false, open: false, share: 0.42 };
    if (typeof raw === 'boolean') return { known: true, open: raw, share: 0.42 };
    if (typeof raw === 'string') return { known: true, open: ['open', 'shown', 'docked', 'visible', 'true'].includes(raw.toLowerCase()), share: 0.42 };
    if (typeof raw === 'object') {
      const open = Boolean(raw.open ?? raw.shown ?? raw.visible ?? raw.docked ?? raw.is_open);
      const shareCandidate = Number(raw.share ?? raw.width_share ?? raw.split);
      return { known: true, open, share: Number.isFinite(shareCandidate) && shareCandidate > 0 ? shareCandidate : 0.42 };
    }
    return { known: false, open: false, share: 0.42 };
  }

  function normalizeStatus(raw) {
    const data = raw && typeof raw === 'object' ? raw : {};
    return {
      authenticated: Boolean(data.authenticated ?? data.logged_in ?? data.auth),
      email: typeof data.email === 'string' ? data.email : '',
      full_name: typeof (data.full_name ?? data.fullName ?? data.name) === 'string' ? (data.full_name ?? data.fullName ?? data.name) : '',
      avatar_url: typeof (data.avatar_url ?? data.avatarUrl) === 'string' ? (data.avatar_url ?? data.avatarUrl) : '',
      loading: Boolean(data.loading),
      engine_loading: Boolean(data.engine_loading ?? data.loading),
      generating: Boolean(data.generating ?? data.busy),
      offline: Boolean(data.offline),
      session_error: data.session_error ?? data.sessionError ?? null,
      mode: validMode(data.mode),
      modality: validModality(data.modality),
      desktop: Boolean(data.desktop),
      engine: data.engine,
      permission_mode: validPermissionMode(data.permission_mode ?? data.permissionMode),
      workspace: normalizeWorkspace(data.workspace),
      workspace_chosen: Boolean(data.workspace_chosen),
      app_version: typeof data.app_version === 'string' ? data.app_version : '',
      pending_permissions: Number.isFinite(Number(data.pending_permissions ?? data.pendingPermissions)) ? Number(data.pending_permissions ?? data.pendingPermissions) : 0,
      generating_chat_ids: Array.isArray(data.generating_chat_ids) ? data.generating_chat_ids : null,
      accounts: Array.isArray(data.accounts) ? data.accounts : null,
      current_account_id: data.current_account_id ?? null,
      challenge: data.challenge ?? null,
      gateway: data.gateway ?? null
    };
  }

  function normalizeChat(raw) {
    if (!raw || typeof raw !== 'object') return null;
    const id = raw.id ?? raw.chat_id ?? raw.uuid;
    if (!id) return null;
    return {
      id: String(id),
      title: String(raw.title ?? raw.name ?? "New chat"),
      updated_at: raw.updated_at ?? raw.updatedAt ?? raw.modified_at ?? raw.created_at ?? null,
      created_at: raw.created_at ?? raw.createdAt ?? null,
      mode: validMode(raw.mode),
      modality: validModality(raw.modality),
      agent_backend: raw.agent_backend === 'arena' ? 'arena' : raw.agent_backend === 'local' ? 'local' : null,
      pinned: Boolean(raw.pinned ?? raw.starred),
      source: raw.source === 'arena' ? 'arena' : 'local',
      eval_id: typeof raw.eval_id === 'string' ? raw.eval_id : null,
      parent_id: raw.parent_id ? String(raw.parent_id) : null,
      children: Array.isArray(raw.children) ? raw.children.map((kid) => normalizeChat(kid)).filter(Boolean) : [],
      raw
    };
  }

  function normalizeModel(raw) {
    if (!raw || typeof raw !== 'object') return null;
    const id = raw.id ?? raw.model_id ?? raw.slug ?? raw.model;
    if (id === null || id === undefined || id === '') return null;
    const orgValue = raw.org_display ?? raw.org ?? raw.organization ?? raw.provider;
    const org = typeof orgValue === 'string' ? orgValue : textValue(orgValue?.display_name ?? orgValue?.name ?? '');
    let capabilities = raw.capabilities ?? raw.tags ?? [];
    if (typeof capabilities === 'string') capabilities = capabilities.split(/[,;]/).map((item) => item.trim()).filter(Boolean);
    if (!Array.isArray(capabilities)) capabilities = [];
    return {
      id: String(id),
      name: String(raw.name ?? raw.display_name ?? raw.label ?? id),
      org,
      org_display: org,
      color: safeColor(raw.color),
      capabilities,
      provider: String(raw.provider ?? ''),
      user_selectable: raw.user_selectable !== false,
      is_router: Boolean(raw.is_router),
      icon_url: typeof (raw.icon_url ?? raw.iconUrl ?? raw.logo_url) === 'string' ? (raw.icon_url ?? raw.iconUrl ?? raw.logo_url) : '',
      fixed: Boolean(raw.fixed),
      rank: Number.isFinite(Number(raw.rank)) ? Number(raw.rank) : null,
      arena_score: Number.isFinite(Number(raw.arena_score ?? raw.score)) ? Number(raw.arena_score ?? raw.score) : null,
      raw
    };
  }

  function modelArray(payload) {
    const list = Array.isArray(payload) ? payload : (Array.isArray(payload?.models) ? payload.models : []);
    return list.map(normalizeModel).filter(Boolean);
  }

  function getModel(id) {
    if (id === null || id === undefined) return null;
    return state.models.find((model) => String(model.id) === String(id)) || null;
  }
  function currentModelA() { return getModel(state.modelAId); }
  function currentModelB() { return getModel(state.modelBId); }

  function modelName(id, fallback = "Model") {
    return getModel(id)?.name || fallback;
  }

  function ensureModelSelections() {
    const validIds = new Set(state.models.map((model) => String(model.id)));
    if (state.modelAId !== null && !validIds.has(String(state.modelAId))) state.modelAId = null;
    if (state.modelBId !== null && !validIds.has(String(state.modelBId))) state.modelBId = null;
    if (state.mode === 'battle') {
      state.modelAId = null;
      state.modelBId = null;
      return;
    }
    if (state.mode === 'agent') {
      state.modelAId = null;
      state.modelBId = null;
      return;
    }
    if (!allowsManualModels() || !state.models.length) return;
    if (!state.modelAId) state.modelAId = state.models[0].id;
    if (state.mode === 'side-by-side') {
      if (!state.modelBId || String(state.modelBId) === String(state.modelAId)) {
        const candidate = state.models.find((model) => String(model.id) !== String(state.modelAId));
        state.modelBId = candidate ? candidate.id : null;
      }
    } else {
      state.modelBId = null;
    }
  }

  function requiredModelsReady() {
    if (!isValidSelection(state.mode, state.modality)) return false;
    if (state.mode === 'battle' || state.mode === 'agent') return true;
    if (state.modelsLoading || state.modelsError) return false;
    if (!state.models.length) return false;
    if (!getModel(state.modelAId)) return false;
    if (state.mode === 'side-by-side' && (!getModel(state.modelBId) || String(state.modelAId) === String(state.modelBId))) return false;
    return true;
  }

  function workspaceName() {
    return state.workspace ? baseName(state.workspace) : "Choose folder";
  }

  /* ---------------------------------------------------------------------- */
  /* Markdown: a safe DOM renderer. Source text is never assigned to HTML. */
  /* ---------------------------------------------------------------------- */
  function appendInline(parent, source, depth = 0) {
    const text = String(source ?? '');
    if (depth > 6) {
      append(parent, text);
      return;
    }
    const pattern = /(`[^`\n]+`|\*\*[^\n]+?\*\*|__[^\n]+?__|~~[^\n]+?~~|\[[^\]\n]+\]\([^)\s]+\)|\*[^*\n]+?\*|_[^_\n]+?_)/g;
    let last = 0;
    let match;
    while ((match = pattern.exec(text)) !== null) {
      if (match.index > last) append(parent, text.slice(last, match.index));
      const token = match[0];
      if (token.startsWith('`')) {
        parent.appendChild(el('code', { class: 'inline-code', text: token.slice(1, -1) }));
      } else if (token.startsWith('**') || token.startsWith('__')) {
        const strong = el('strong');
        appendInline(strong, token.slice(2, -2), depth + 1);
        parent.appendChild(strong);
      } else if (token.startsWith('~~')) {
        parent.appendChild(el('del', { text: token.slice(2, -2) }));
      } else if (token.startsWith('*') || token.startsWith('_')) {
        const emphasis = el('em');
        appendInline(emphasis, token.slice(1, -1), depth + 1);
        parent.appendChild(emphasis);
      } else {
        const linkMatch = token.match(/^\[([^\]]+)\]\(([^)]+)\)$/);
        if (linkMatch) {
          const label = linkMatch[1];
          const url = safeUrl(linkMatch[2]);
          if (url) {
            parent.appendChild(el('a', {
              href: url,
              target: url.startsWith('/') ? '_self' : '_blank',
              rel: 'noopener noreferrer',
              title: url,
              text: label
            }));
          } else {
            append(parent, label);
          }
        } else {
          append(parent, token);
        }
      }
      last = pattern.lastIndex;
    }
    if (last < text.length) append(parent, text.slice(last));
  }

  function codeBlock(language, code) {
    const wrapper = el('div', { class: 'code-block' });
    const copyButton = el('button', {
      class: 'code-copy', type: 'button', 'data-copy-code': '1',
      'aria-label': "Copy code"
    }, iconEl('copy'), el('span', { text: "Copy" }));
    const head = el('div', { class: 'code-block-head' },
      el('span', { text: language || 'code' }),
      copyButton
    );
    const pre = el('pre');
    pre.appendChild(el('code', { text: code }));
    wrapper.append(head, pre);
    return wrapper;
  }

  function isTableDivider(line) {
    return /^\s*\|?\s*:?-{3,}:?\s*(\|\s*:?-{3,}:?\s*)+\|?\s*$/.test(String(line));
  }

  function tableCells(line) {
    let value = String(line).trim();
    if (value.startsWith('|')) value = value.slice(1);
    if (value.endsWith('|')) value = value.slice(0, -1);
    return value.split('|').map((cell) => cell.trim());
  }

  function renderMarkdown(source) {
    const fragment = document.createDocumentFragment();
    const lines = String(source ?? '').replace(/\r\n?/g, '\n').split('\n');
    let index = 0;
    let paragraph = [];

    const flushParagraph = () => {
      if (!paragraph.length) return;
      const p = el('p');
      appendInline(p, paragraph.join('\n'));
      fragment.appendChild(p);
      paragraph = [];
    };

    while (index < lines.length) {
      const line = lines[index];
      const trimmed = line.trim();

      if (!trimmed) {
        flushParagraph();
        index += 1;
        continue;
      }

      const fence = line.match(/^\s{0,3}(```|~~~)\s*([^\s`]*)\s*$/);
      if (fence) {
        flushParagraph();
        const marker = fence[1];
        const language = fence[2] || '';
        const codeLines = [];
        index += 1;
        while (index < lines.length && !new RegExp(`^\\s{0,3}${marker === '```' ? '```' : '~~~'}\\s*$`).test(lines[index])) {
          codeLines.push(lines[index]);
          index += 1;
        }
        if (index < lines.length) index += 1;
        fragment.appendChild(codeBlock(language, codeLines.join('\n')));
        continue;
      }

      if (isTableDivider(lines[index + 1] || '') && line.includes('|')) {
        flushParagraph();
        const headers = tableCells(line);
        const table = el('table');
        const thead = el('thead');
        const headerRow = el('tr');
        headers.forEach((cell) => {
          const th = el('th');
          appendInline(th, cell);
          headerRow.appendChild(th);
        });
        thead.appendChild(headerRow);
        const tbody = el('tbody');
        table.append(thead, tbody);
        index += 2;
        while (index < lines.length && lines[index].includes('|') && lines[index].trim()) {
          const cells = tableCells(lines[index]);
          if (!cells.some(Boolean)) break;
          const row = el('tr');
          headers.forEach((_, cellIndex) => {
            const td = el('td');
            appendInline(td, cells[cellIndex] || '');
            row.appendChild(td);
          });
          tbody.appendChild(row);
          index += 1;
        }
        fragment.appendChild(table);
        continue;
      }

      const heading = line.match(/^\s{0,3}(#{1,6})\s+(.+?)\s*#*\s*$/);
      if (heading) {
        flushParagraph();
        const headingNode = el(`h${Math.min(6, heading[1].length)}`);
        appendInline(headingNode, heading[2]);
        fragment.appendChild(headingNode);
        index += 1;
        continue;
      }

      if (/^\s{0,3}([-*_])(?:\s*\1){2,}\s*$/.test(line)) {
        flushParagraph();
        fragment.appendChild(el('hr'));
        index += 1;
        continue;
      }

      if (/^\s*>\s?/.test(line)) {
        flushParagraph();
        const quote = el('blockquote');
        const quoteLines = [];
        while (index < lines.length && /^\s*>\s?/.test(lines[index])) {
          quoteLines.push(lines[index].replace(/^\s*>\s?/, ''));
          index += 1;
        }
        const p = el('p');
        appendInline(p, quoteLines.join('\n'));
        quote.appendChild(p);
        fragment.appendChild(quote);
        continue;
      }

      const unorderedMatch = line.match(/^\s*[-*+]\s+(.+)$/);
      const orderedMatch = line.match(/^\s*\d+[.)]\s+(.+)$/);
      if (unorderedMatch || orderedMatch) {
        flushParagraph();
        const list = el(orderedMatch ? 'ol' : 'ul');
        const matcher = orderedMatch ? /^\s*\d+[.)]\s+(.+)$/ : /^\s*[-*+]\s+(.+)$/;
        while (index < lines.length) {
          const itemMatch = lines[index].match(matcher);
          if (!itemMatch) break;
          const item = el('li');
          appendInline(item, itemMatch[1]);
          list.appendChild(item);
          index += 1;
        }
        fragment.appendChild(list);
        continue;
      }

      if (/^\s*\|/.test(line) && line.trim().endsWith('|')) {
        flushParagraph();
        const pre = el('pre', { class: 'plain-pre', text: line });
        fragment.appendChild(pre);
        index += 1;
        continue;
      }

      paragraph.push(line);
      index += 1;
    }
    flushParagraph();
    return fragment;
  }

  /* ---------------------------------------------------------------------- */
  /* Source / media / activity normalizers                                 */
  /* ---------------------------------------------------------------------- */
  function normalizeSource(raw) {
    if (!raw || typeof raw !== 'object') return null;
    const url = safeUrl(raw.url ?? raw.link ?? raw.href ?? '');
    const title = String(raw.title ?? raw.name ?? raw.label ?? hostOf(url) ?? "Source");
    if (!title && !url) return null;
    return {
      title: title || "Source",
      url: url || '',
      snippet: String(raw.snippet ?? raw.description ?? raw.text ?? ''),
      domain: hostOf(url)
    };
  }

  function normalizeMedia(raw) {
    if (!raw || typeof raw !== 'object') return null;
    const kindRaw = String(raw.kind ?? raw.type ?? raw.media_type ?? '').toLowerCase();
    const kind = kindRaw.includes('video') ? 'video' : kindRaw.includes('audio') ? 'audio' : 'image';
    const url = safeUrl(raw.url ?? raw.src ?? raw.media_url ?? raw.file ?? '', { image: true });
    const poster = safeUrl(raw.poster ?? raw.thumbnail ?? raw.preview ?? '', { image: true });
    if (!url && !poster) return null;
    return {
      kind,
      url: url || '',
      poster: poster || '',
      title: String(raw.title ?? raw.alt ?? raw.name ?? (kind === 'video' ? "Video" : "Image")),
      alt: String(raw.alt ?? raw.title ?? "Media from server response"),
      demo: Boolean(raw.demo)
    };
  }

  function normalizeMediaChoice(raw) {
    if (!raw || typeof raw !== 'object') return null;
    const attributionByIndex = new Map();
    const attributionRaw = Array.isArray(raw.attribution) ? raw.attribution : [];
    attributionRaw.forEach((item, position) => {
      if (!item || typeof item !== 'object') return;
      const index = Number.isFinite(Number(item.index)) ? Number(item.index) : position;
      attributionByIndex.set(index, {
        index,
        model_name: textValue(item.model_name ?? item.modelName ?? item.name ?? ''),
        organization: textValue(item.organization ?? item.org ?? ''),
        is_private: Boolean(item.is_private ?? item.isPrivate)
      });
    });
    const candidates = (Array.isArray(raw.candidates) ? raw.candidates : []).map((candidate, position) => {
      if (!candidate || typeof candidate !== 'object') return null;
      const index = Number.isFinite(Number(candidate.index)) ? Number(candidate.index) : position;
      const reveal = attributionByIndex.get(index) || {};
      const hash = textValue(candidate.hash || '');
      let url = safeUrl(candidate.url ?? candidate.src ?? '', { image: true });
      if (!url && /^[A-Za-z0-9_-]{43}$/.test(hash)) url = `/api/native-cas/${hash}`;
      return {
        index,
        hash,
        url,
        title: textValue(candidate.title ?? candidate.filename ?? `Option ${index + 1}`),
        model_name: textValue(candidate.model_name ?? candidate.modelName ?? reveal.model_name ?? ''),
        organization: textValue(candidate.organization ?? candidate.org ?? reveal.organization ?? ''),
        is_private: Boolean(candidate.is_private ?? candidate.isPrivate ?? reveal.is_private)
      };
    }).filter(Boolean);
    if (!candidates.length) return null;
    const selectedRaw = raw.selected_index ?? raw.selectedIndex;
    const selectedIndex = selectedRaw === null || selectedRaw === undefined || selectedRaw === ''
      ? null : (Number.isFinite(Number(selectedRaw)) ? Number(selectedRaw) : null);
    const status = textValue(raw.status || (selectedIndex !== null ? 'completed' : 'awaiting_user_response'));
    return {
      id: raw.id ? String(raw.id) : null,
      toolCallId: textValue(raw.tool_call_id ?? raw.toolCallId ?? ''),
      chatId: raw.chat_id ?? raw.chatId ?? null,
      kind: 'image',
      status,
      prompt: textValue(raw.prompt || ''),
      filePath: textValue(raw.file_path ?? raw.filePath ?? ''),
      candidates,
      selectedIndex,
      selectionMethod: textValue(raw.selection_method ?? raw.selectionMethod ?? ''),
      attribution: [...attributionByIndex.values()]
    };
  }

  function mediaChoiceIsPending(choice) {
    return Boolean(choice && choice.selectedIndex === null
      && !['completed', 'cancelled', 'error'].includes(String(choice.status || '').toLowerCase()));
  }

  function sameMediaChoice(left, right) {
    if (!left || !right) return false;
    if (left.id && right.id && String(left.id) === String(right.id)) return true;
    return Boolean(left.toolCallId && right.toolCallId && left.toolCallId === right.toolCallId);
  }

  function mergeMediaChoice(existing, incoming) {
    if (!existing) return incoming;
    if (!incoming) return existing;
    const merged = { ...existing, ...incoming };
    // A completed stream event can be keyed only by tool-call id; preserve
    // the broker id already shown in the waiting card whenever possible.
    merged.id = existing.id || incoming.id;
    merged.chatId = existing.chatId || incoming.chatId;
    merged.toolCallId = existing.toolCallId || incoming.toolCallId;
    if (!incoming.candidates?.length) merged.candidates = existing.candidates;
    else if (existing.candidates?.length) {
      const oldByIndex = new Map(existing.candidates.map((candidate) => [candidate.index, candidate]));
      merged.candidates = incoming.candidates.map((candidate) => {
        const old = oldByIndex.get(candidate.index) || {};
        return {
          ...old,
          ...candidate,
          url: candidate.url || old.url || '',
          model_name: candidate.model_name || old.model_name || '',
          organization: candidate.organization || old.organization || ''
        };
      });
    }
    const attribution = new Map();
    [...(existing.attribution || []), ...(incoming.attribution || [])].forEach((item) => {
      if (item && Number.isFinite(Number(item.index))) attribution.set(Number(item.index), item);
    });
    merged.attribution = [...attribution.values()];
    merged.candidates = (merged.candidates || []).map((candidate) => {
      const reveal = attribution.get(candidate.index) || {};
      return {
        ...candidate,
        model_name: candidate.model_name || reveal.model_name || '',
        organization: candidate.organization || reveal.organization || '',
        is_private: Boolean(candidate.is_private || reveal.is_private)
      };
    });
    return merged;
  }

  function upsertLaneMediaChoice(lane, raw) {
    const incoming = normalizeMediaChoice(raw);
    if (!incoming || !lane) return null;
    if (!Array.isArray(lane.mediaChoices)) lane.mediaChoices = [];
    const existingIndex = lane.mediaChoices.findIndex((choice) => sameMediaChoice(choice, incoming));
    if (existingIndex >= 0) {
      lane.mediaChoices[existingIndex] = mergeMediaChoice(lane.mediaChoices[existingIndex], incoming);
      return lane.mediaChoices[existingIndex];
    }
    lane.mediaChoices.push(incoming);
    return incoming;
  }

  function applyMediaReveal(lane, event) {
    if (!lane) return null;
    if (event?.media_choice?.candidates?.length) return upsertLaneMediaChoice(lane, event.media_choice);
    if (!Array.isArray(lane.mediaChoices) || !lane.mediaChoices.length) return null;
    const toolCallId = textValue(event?.tool_call_id ?? event?.toolCallId ?? '');
    const choice = lane.mediaChoices.find((item) => toolCallId && item.toolCallId === toolCallId)
      || lane.mediaChoices[lane.mediaChoices.length - 1];
    if (!choice) return null;
    const normalized = normalizeMediaChoice({
      ...choice,
      candidates: choice.candidates,
      selected_index: choice.selectedIndex,
      selection_method: choice.selectionMethod,
      file_path: choice.filePath,
      tool_call_id: choice.toolCallId,
      chat_id: choice.chatId,
      attribution: event?.attribution || []
    });
    const merged = mergeMediaChoice(choice, normalized);
    const index = lane.mediaChoices.indexOf(choice);
    if (index >= 0) lane.mediaChoices[index] = merged;
    return merged;
  }

  function normalizeActivity(raw, type = 'tool') {
    if (!raw || typeof raw !== 'object') return null;
    const input = raw.input && typeof raw.input === 'object' ? raw.input : {};
    const command = String(raw.command ?? input.command ?? raw.cmd ?? '');
    const path = String(raw.path ?? input.path ?? input.file_path ?? input.file ?? '');
    const name = String(raw.name ?? raw.tool ?? raw.title ?? (type === 'sandbox' ? "Sandbox" : "Tool"));
    const detail = String(raw.detail ?? raw.description ?? raw.message ?? raw.note ?? raw.output ?? '');
    return {
      id: raw.id ? String(raw.id) : `activity-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      kind: type,
      name,
      command,
      path,
      detail,
      output: String(raw.output ?? ''),
      status: String(raw.status ?? 'running'),
      url: safeUrl(raw.url ?? ''),
      raw
    };
  }

  function normalizeArtifact(raw, kind = 'file') {
    if (typeof raw === 'string') {
      return { path: raw, name: baseName(raw), url: '', kind, demo: false };
    }
    if (!raw || typeof raw !== 'object') return null;
    const path = String(raw.path ?? raw.file ?? raw.name ?? raw.filename ?? '');
    const url = safeUrl(raw.url ?? raw.preview ?? raw.href ?? '');
    if (!path && !url) return null;
    return {
      path,
      name: String(raw.name ?? baseName(path) ?? "File"),
      url,
      title: String(raw.title ?? raw.name ?? path ?? "Artifact"),
      kind,
      note: String(raw.note ?? raw.description ?? ''),
      demo: Boolean(raw.demo)
    };
  }

  function normalizePermission(raw) {
    if (!raw || typeof raw !== 'object') return null;
    const source = raw.permission && typeof raw.permission === 'object' ? { ...raw, ...raw.permission } : raw;
    const input = source.input && typeof source.input === 'object' ? source.input : {};
    const diff = typeof source.diff === 'string' ? source.diff : (source.diff ? textValue(source.diff) : '');
    return {
      id: source.id ?? source.permission_id ?? source.request_id ?? null,
      title: String(source.title ?? source.name ?? (source.command ? "Execute the command?" : "Allow action?")),
      description: String(source.description ?? source.summary ?? source.reason ?? source.message ?? ''),
      command: String(source.command ?? input.command ?? source.cmd ?? ''),
      path: String(source.path ?? input.path ?? input.file_path ?? source.file ?? ''),
      cwd: String(source.cwd ?? source.workspace ?? ''),
      category: String(source.category ?? source.permission_type ?? source.scope ?? "actions"),
      diff,
      lane: source.model === 'b' || source.lane === 'b' ? 'b' : 'a',
      chatId: source.chat_id ?? source.chatId ?? null,
      status: 'pending',
      demo: Boolean(source.demo),
      raw: source
    };
  }

  function permissionDetail(permission) {
    const value = permission.command || permission.path || permission.cwd;
    if (value) return value;
    if (permission.raw && typeof permission.raw === 'object') {
      try { return JSON.stringify(permission.raw, null, 2); } catch { return "Details not provided."; }
    }
    return "Details not provided by the server.";
  }

  /* ---------------------------------------------------------------------- */
  /* API-driven loading                                                    */
  // ═══ 06-data.js ═══
  /* ---------------------------------------------------------------------- */
  function setServerError(error) {
    state.serverError = errorMessage(error);
    state.backendReached = false;
    state.phase = 'offline';
    updateConnectionUI();
    updateComposerState();
    if (state.view === 'welcome') renderWelcomeState();
    renderChats();
  }

  function clearServerError() {
    state.serverError = null;
    state.backendReached = true;
    state.phase = 'ready';
  }

  function applyStartModeParam() {
    try {
      const wanted = new URLSearchParams(window.location.search).get('mode');
      if (!wanted || state.activeChatId) return;
      if (!['battle', 'agent', 'side-by-side', 'direct'].includes(wanted)) return;
      if (wanted !== state.mode) {
        state.mode = wanted;
        state.selectionTouched = true;
        Promise.resolve(API.setMode?.(wanted)).catch(() => {});
        updateComposerState();
      }
    } catch { /* malformed URL: ignore */ }
  }

  function checkForUpdatesOnce() {
    if (state.demo || state.updateInfo) return;
    API.updateCheck().then((info) => {
      state.updateInfo = info;
      if (info?.enabled !== false && info?.update && info?.latest) {
        showUpdateIsland(info.latest, info.url, info);
      }
    }).catch(() => {});
  }

  function showWhatsNewOnce() {
    if (state.demo) return;
    API.whatsNew().then((data) => {
      if (!data?.version) return;
      const notes = Array.isArray(data.notes) ? data.notes : [];
      const content = el('div', {},
        el('p', { class: 'modal-copy', text: `Arena Desktop updated from ${data.from || 'the previous version'} to ${data.version}.` }),
        notes.length
          ? el('ul', { class: 'update-notes' }, ...notes.map((n) => el('li', { text: n })))
          : el('p', { class: 'modal-note', text: 'No release notes were published for this version.' }));
      setTimeout(() => mountModal({
        title: `Updated to ${data.version}`, subtitle: 'Here is what is new', content,
        actions: [{ label: 'Got it', variant: 'primary', autofocus: true }],
        onClose: () => { API.clearWhatsNew().catch(() => {}); }
      }), 900);
    }).catch(() => {});
  }

  function openUpdateModal(info) {
    const notes = Array.isArray(info.notes) ? info.notes : [];
    const hint = el('p', { class: 'modal-note', text: info.can_install
      ? 'One click: the app downloads the update, closes, installs it and opens again by itself. Your chats and settings stay.'
      : 'Open the download page to get this version.' });
    const content = el('div', {},
      el('p', { class: 'modal-copy', text: `Version ${info.latest} is ready. You have ${info.current}.` }),
      notes.length ? el('h3', { class: 'modal-section-title', text: 'What is new' }) : null,
      notes.length ? el('ul', { class: 'update-notes' }, ...notes.map((n) => el('li', { text: n }))) : null,
      hint);
    const fill = el('span', { class: 'update-bar-fill' });
    const bar = el('div', { class: 'update-bar is-wait', hidden: true, role: 'progressbar', 'aria-label': 'Download progress' }, fill);
    content.appendChild(bar);
    const install = async () => {
      bar.hidden = false;
      const start = await API.updateDownload();
      if (!start?.ok) throw new Error(start?.error || 'Could not start the download.');
      for (;;) {
        await new Promise((r) => setTimeout(r, 400));
        const st = await API.updateStatus();
        if (st.state === 'error') throw new Error(st.error || 'Download failed.');
        if (st.state === 'ready') break;
        const pct = st.total ? Math.floor((st.done / st.total) * 100) : 0;
        bar.classList.toggle('is-wait', pct === 0);
        fill.style.width = `${pct}%`;
        bar.setAttribute('aria-valuenow', String(pct));
        const mb = (n) => (n / 1048576).toFixed(1);
        hint.textContent = st.total ? `Downloading… ${mb(st.done)} of ${mb(st.total)} MB` : 'Starting the download…';
      }
      bar.classList.remove('is-wait'); fill.style.width = '100%';
      hint.textContent = 'Installing and restarting…';
      const res = await API.updateApply();
      if (!res?.ok) throw new Error(res?.error || 'Could not start the update.');
      return false;
    };
    mountModal({
      title: 'Update available', subtitle: `Arena Desktop ${info.latest}`, content,
      actions: [
        { label: 'Later' },
        info.can_install
          ? { label: 'Update now', variant: 'primary', icon: 'download', autofocus: true, onClick: install }
          : { label: 'Open download page', variant: 'primary', icon: 'external', onClick: async () => { window.open(info.url, '_blank', 'noopener'); } }
      ]
    });
  }

  function showUpdateIsland(version, url, info) {
    const existing = document.querySelector('.update-island');
    if (existing) existing.remove();
    const island = el('div', { class: 'update-island', title: 'Click to download the update' });
    island.appendChild(el('span', { class: 'island-dot' }));
    island.appendChild(el('span', { text: 'Update available \u2014 ' }));
    island.appendChild(el('span', { class: 'island-ver', text: `v${version}` }));
    const close = el('span', { class: 'island-close', text: '\u00d7' });
    close.addEventListener('click', (e) => { e.stopPropagation(); island.remove(); });
    island.appendChild(close);
    island.addEventListener('click', () => {
      if (info?.can_install) openUpdateModal(info);
      else if (url) window.open(url, '_blank', 'noopener');
      else openSettings('about');
    });
    document.body.appendChild(island);
  }

  async function exportSettingsFile() {
    const bundle = await API.exportSettings();
    const ui = {};
    try {
      for (let i = 0; i < window.localStorage.length; i += 1) {
        const k = window.localStorage.key(i);
        if (k && (k.startsWith('arenaDesktop.') || k.startsWith('ap-'))) ui[k] = window.localStorage.getItem(k);
      }
    } catch { /* storage unavailable */ }
    const blob = new Blob([JSON.stringify({ ...bundle, ui }, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = el('a', { href: url, download: 'arena-desktop-settings.json' });
    document.body.appendChild(a);
    a.click();
    a.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 4000);
    toast('Settings exported (no account cookies inside).', 'success', 'Settings');
  }

  async function importSettingsFile(file) {
    let bundle;
    try {
      bundle = JSON.parse(await file.text());
    } catch {
      toast('That file is not valid JSON.', 'error', 'Import settings');
      return;
    }
    if (bundle?.ui && typeof bundle.ui === 'object') {
      try {
        Object.entries(bundle.ui).forEach(([k, v]) => {
          if ((k.startsWith('arenaDesktop.') || k.startsWith('ap-')) && typeof v === 'string') window.localStorage.setItem(k, v);
        });
      } catch { /* ignore */ }
    }
    await API.importSettings(bundle);
    state.memoryData = null;
    toast('Settings imported. Restart the app if the folder or tray setting changed.', 'success', 'Settings');
  }

  async function copyDiagnosticsText(text) {
    try {
      await navigator.clipboard.writeText(text);
      toast('Diagnostics copied \u2014 versions and state only, no prompts or cookies.', 'success', 'Diagnostics');
    } catch {
      const area = el('textarea', { class: 'input mono memory-field', rows: '14', readonly: true });
      area.value = text;
      mountModal({ title: 'Diagnostics', content: area, actions: [{ label: 'Done', variant: 'primary' }] });
    }
  }

  async function loadStatus({ initial = false, quiet = false } = {}) {
    if (!quiet) {
      if (!state.backendReached) state.phase = 'loading';
      updateConnectionUI();
    }
    try {
      const raw = await API.getStatus();
      const status = normalizeStatus(raw);
      const oldMode = state.mode;
      const oldModality = state.modality;
      state.status = status;
      state.backendReached = true;
      state.serverError = null;
      state.phase = 'ready';
      state.authenticated = status.authenticated;
      state.email = status.email;
      state.fullName = status.full_name || '';
      state.avatarUrl = status.avatar_url || '';
      state.desktop = status.desktop;
      // status.loading only means the Arena engine/session is loading.
      // remoteBusy now means "a generation this window does not track"
      // (e.g. started in another window); chats tracked locally never
      // block work in other chats.
      const serverBusyIds = Array.isArray(status.generating_chat_ids)
        ? status.generating_chat_ids.map(String) : null;
      state.remoteBusy = serverBusyIds
        ? serverBusyIds.some((id) => !state.generations.has(id))
        : Boolean(status.generating && !anyGenerationRunning());
      if (Array.isArray(status.accounts)) {
        state.accounts = status.accounts;
        state.currentAccountId = status.current_account_id
          || (status.accounts.find((a) => a.current) || {}).id || null;
      }
      state.permissionCount = status.pending_permissions;
      if (status.workspace) state.workspace = status.workspace;
      state.workspaceChosen = Boolean(status.workspace_chosen);
      if (status.workspace_missing && !state.missingFolderShown) {
        state.missingFolderShown = true;
        toast('The folder you chose no longer exists. Pick another one with the folder button above the message box.', 'warning', 'Folder not found');
      } else if (!status.workspace_missing) { state.missingFolderShown = false; }
      if (status.app_version) {
        state.appVersion = status.app_version;
        const versionNode = document.querySelector('.status-desktop');
        if (versionNode) versionNode.textContent = `Arena Desktop · v${status.app_version}`;
      }
      // Adopt the server's mode only until the user (or an opened chat) makes
      // a selection.  After that the composer is authoritative: a slow status
      // answer must not silently flip Agent back to Direct/Battle.
      if (!state.selectionTouched && !state.generating && state.pendingChanges === 0) {
        const selection = normalizeSelection(status.mode || state.mode, status.modality || state.modality);
        state.mode = selection.mode;
        state.modality = selection.modality;
      }
      if (status.permission_mode) state.permissionMode = status.permission_mode;
      const engine = normalizeEngine(status.engine);
      state.engineKnown = engine.known;
      if (engine.known) {
        state.dockShare = clamp(engine.share, 0.24, 0.7);
        state.engineOpen = engine.open;
        syncDock(false);
      }
      if (status.challenge) {
        state.challenge = typeof status.challenge === 'object' ? status.challenge : { message: textValue(status.challenge) };
      }
      state.gateway = status.gateway || null;
      syncGatewayChip();
      maybeGatewaySetupPrompt();
      if (!status.authenticated) {
        state.modelAId = null;
        state.modelBId = null;
      }
      updateAllUI();
      if (initial) {
        applyStartModeParam();
        checkForUpdatesOnce();
        void refreshPulse();
        setInterval(() => { if (!document.hidden) void refreshPulse(); }, 60000);
        showWhatsNewOnce();
      }
      if (!initial && (oldMode !== state.mode || oldModality !== state.modality)) loadModels(state.modality, { quiet: true });
      return status;
    } catch (error) {
      state.backendReached = false;
      state.phase = 'offline';
      state.serverError = errorMessage(error);
      state.status = null;
      updateAllUI();
      return null;
    }
  }

  async function retryConnection() {
    if (state.retrying) return;
    state.retrying = true;
    state.phase = 'loading';
    updateConnectionUI();
    updateComposerState();
    renderChats();
    try {
      const status = await loadStatus();
      if (status) {
        await Promise.allSettled([
          loadChats(),
          state.authenticated ? loadModels(state.modality) : Promise.resolve(),
          loadPermissions({ quiet: true }),
          refreshWorkspacePanel({ force: true })
        ]);
        tabNotice("Connection restored.", 'success');
        announce("Connection to the local server restored.");
      }
    } finally {
      state.retrying = false;
      updateAllUI();
    }
  }

  async function loadPermissions({ quiet = false } = {}) {
    if (state.serverError || state.networkOffline) return;
    try {
      const raw = await API.getPermissions();
      const list = Array.isArray(raw) ? raw : (Array.isArray(raw?.permissions) ? raw.permissions : []);
      const normalized = list.map(normalizePermission).filter(Boolean);
      const seen = new Set();
      state.pendingPermissions = normalized.filter((item) => {
        const key = item.id ? String(item.id) : `${item.title}:${item.command}:${item.path}`;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      });
      state.permissionCount = state.pendingPermissions.length;
      renderPendingPermissionsUI();
      if (!quiet && normalized.length) toast(`Awaiting permissions: ${normalized.length}`, 'warning', "Your decision is needed");
    } catch (error) {
      if (!quiet) toast(errorMessage(error), 'error', "Failed to obtain permission");
    }
  }

  async function refreshStatusSilently() {
    if (state.demo) return loadStatus({ quiet: true });
    return loadStatus({ quiet: true });
  }

  async function loadChats({ silent = false } = {}) {
    if (!silent) {
      state.chatsLoading = true;
      state.chatsError = null;
      renderChats();
    }
    if (state.serverError) {
      state.chatsLoading = false;
      state.chatsError = state.serverError;
      renderChats();
      return;
    }
    try {
      const raw = await API.getChats();
      const list = Array.isArray(raw) ? raw : (Array.isArray(raw?.chats) ? raw.chats : []);
      const serverChats = list.map(normalizeChat).filter(Boolean);
      const serverIds = new Set(serverChats.map((chat) => chat.id));
      const keptLocal = (state.chats || []).filter((chat) =>
        !serverIds.has(chat.id)
        && (state.generations.has(chat.id) || chat.id === String(state.activeChatId)));
      state.chats = [...keptLocal, ...serverChats].sort((a, b) => {
        if (a.pinned !== b.pinned) return a.pinned ? -1 : 1;
        const left = new Date(a.updated_at || a.created_at || 0).getTime();
        const right = new Date(b.updated_at || b.created_at || 0).getTime();
        return right - left;
      });
      state.chatsLoading = false;
      state.chatsError = null;
      if (state.activeChatId) {
        const active = state.chats.find((chat) => chat.id === String(state.activeChatId));
        if (active) state.activeChatTitle = active.title;
      }
      renderChats();
      updateTopbarTitle();
      if (state.authenticated) await loadArenaChats({ silent: true });
      else { state.cloudChats = []; state.cloudChatsError = null; renderChats(); }
      return state.chats;
    } catch (error) {
      state.chatsLoading = false;
      state.chatsError = errorMessage(error);
      renderChats();
      if (!silent) toast(state.chatsError, 'error', "Chat list unavailable");
      return [];
    }
  }

  function normalizeArenaChat(raw) {
    if (!raw || typeof raw !== 'object') return null;
    const id = raw.eval_id ?? raw.id;
    if (!id) return null;
    const apiMode = ({ 'direct-battle': 'direct' })[raw.mode] || raw.mode;
    return {
      id: String(id),
      eval_id: String(id),
      type: raw.type === 'agentic' ? 'agentic' : 'evaluation',
      title: String(raw.title ?? raw.name ?? "arena.ai Chat"),
      updated_at: raw.updated_at ?? raw.modified_at ?? raw.created_at ?? null,
      created_at: raw.created_at ?? null,
      mode: raw.type === 'agentic' ? 'agent' : validMode(apiMode),
      modality: validModality(raw.modality),
      local_chat_id: raw.local_chat_id ? String(raw.local_chat_id) : null,
      local_mode: validMode(raw.local_mode) || null,
      message_count: Number.isFinite(Number(raw.message_count)) ? Number(raw.message_count) : null,
      raw
    };
  }

  async function loadArenaChats({ silent = false } = {}) {
    if (!state.authenticated) {
      state.cloudChats = [];
      state.cloudChatsError = null;
      state.cloudChatsLoading = false;
      renderChats();
      return [];
    }
    state.cloudChatsLoading = true;
    if (!silent) { state.cloudChatsError = null; renderChats(); }
    try {
      const raw = await API.getArenaChats();
      const list = Array.isArray(raw) ? raw : (Array.isArray(raw?.entries) ? raw.entries : []);
      state.cloudChats = list.map(normalizeArenaChat).filter(Boolean);
      state.cloudChatsError = raw?.ok === false ? errorMessage(new ApiError(raw.error || "arena.ai history is unavailable", 0, raw)) : null;
      return state.cloudChats;
    } catch (error) {
      state.cloudChatsError = errorMessage(error);
      if (!silent) toast(state.cloudChatsError, 'error', "arena.ai chats are unavailable");
      return [];
    } finally {
      state.cloudChatsLoading = false;
      renderChats();
    }
  }

  async function openArenaChat(entry) {
    if (!entry) return;
    if (entry.local_chat_id) { await openChat(entry.local_chat_id); return; }
    try {
      const result = await API.openArenaChat(entry.eval_id || entry.id, entry.type || 'evaluation', entry.title || '');
      if (result?.external) {
        toast('Arena Agent chat imported.', 'info');
        return;
      }
      const chatId = result?.chat_id || result?.id;
      if (!chatId) throw new ApiError("The server did not return the ID of the imported chat.", 0, result);
      await loadChats({ silent: true });
      await openChat(chatId);
      if (result.imported) toast("Chat imported from arena.ai into local history.", 'success');
    } catch (error) {
      const url = error?.details?.url;
      toast(errorMessage(error), 'error', "Failed to open arena.ai chat");
      if (url && state.demo) window.open(url, '_blank', 'noopener,noreferrer');
    }
  }

  async function loadModels(modality = state.modality, { quiet = false, mode = state.mode, force = false } = {}) {
    const requestId = ++state.modelsRequest;
    const selectionProblem = selectionIssue(mode, modality);
    if (selectionProblem || mode === 'battle' || mode === 'agent' || modality === 'video') {
      state.models = [];
      state.modelsMode = mode;
      state.modelsModality = modality;
      state.modelsLoading = false;
      state.modelsError = selectionProblem || null;
      state.modelsPromise = null;
      ensureModelSelections();
      renderModelStrip();
      renderModelsNavCount();
      updateComposerState();
      return [];
    }
    state.modelsLoading = true;
    if (!quiet) state.modelsError = null;
    renderModelStrip();
    updateComposerState();
    const promise = (async () => {
      try {
        const raw = await API.getModels(modality, mode, force);
        if (requestId !== state.modelsRequest) return;
        state.models = modelArray(raw);
        state.modelsMode = mode;
        state.modelsModality = modality;
        state.modelsError = null;
        ensureModelSelections();
        renderModelStrip();
        renderModelsNavCount();
        return state.models;
      } catch (error) {
        if (requestId !== state.modelsRequest) return;
        state.models = [];
        state.modelsMode = mode;
        state.modelsModality = modality;
        state.modelsError = errorMessage(error);
        state.modelAId = null;
        state.modelBId = null;
        renderModelStrip();
        renderModelsNavCount();
        if (!quiet) toast(state.modelsError, 'error', "Models unavailable");
        return [];
      } finally {
        if (requestId === state.modelsRequest) {
          state.modelsLoading = false;
          if (state.modelsPromise === promise) state.modelsPromise = null;
          renderModelStrip();
          updateComposerState();
        }
      }
    })();
    state.modelsPromise = promise;
    return promise;
  }

  /* ---------------------------------------------------------------------- */
  /* Chat list                                                             */
  /* ---------------------------------------------------------------------- */
  function chatMatchesFilter(chat) {
    const query = state.chatFilter.trim().toLocaleLowerCase('en');
    return !query || String(chat.title || '').toLocaleLowerCase('en').includes(query);
  }

  function filteredChats() {
    return state.chats.filter(chatMatchesFilter);
  }

  function dedupedArenaChats() {
    const localIds = new Set(state.chats.map((chat) => String(chat.id)));
    const localEvalIds = new Set(state.chats.map((chat) => String(chat.eval_id || '')).filter(Boolean));
    return state.cloudChats.filter((entry) => {
      if (entry.local_chat_id && localIds.has(String(entry.local_chat_id))) return false;
      if (entry.eval_id && (localIds.has(String(entry.eval_id)) || localEvalIds.has(String(entry.eval_id)))) return false;
      return true;
    });
  }

  function filteredArenaChats() {
    return dedupedArenaChats().filter(chatMatchesFilter);
  }

  function chatGroupTitle(icon, text) {
    return el('div', { class: 'chat-group-title', role: 'presentation' }, iconEl(icon), el('span', { text }));
  }

  function chatStatusEl(chatId) {
    // Fixed-width status slot: a spinning half-moon while the chat works,
    // a green check when it finished and has not been opened since.
    const slot = el('span', { class: 'chat-row-status', 'aria-hidden': 'true' });
    if (chatIsGenerating(chatId)) {
      slot.appendChild(el('span', { class: 'run-dot', title: 'Working…' }));
      slot.removeAttribute('aria-hidden');
      slot.setAttribute('role', 'status');
      slot.setAttribute('aria-label', 'Working');
    } else if (state.unreadDone.has(String(chatId))) {
      slot.appendChild(el('span', { class: 'done-dot', title: 'Finished — not opened yet' }, iconEl('check')));
      slot.removeAttribute('aria-hidden');
      slot.setAttribute('role', 'status');
      slot.setAttribute('aria-label', 'Finished, not opened yet');
    }
    return slot;
  }

  function localChatRow(chat) {
    const active = String(state.activeChatId) === String(chat.id);
    const running = chatIsGenerating(chat.id);
    const unread = !running && state.unreadDone.has(String(chat.id));
    const row = el('div', { class: `chat-row${active ? ' is-active' : ''}${running ? ' is-running' : ''}${unread ? ' is-unread' : ''}`, role: 'listitem' });
    const metaBits = [];
    if (chat.mode) metaBits.push(modeMeta(chat.mode).label);
    metaBits.push(relativeTime(chat.updated_at || chat.created_at));
    const openButton = el('button', {
      class: 'chat-row-main chat-row-open',
      type: 'button',
      'data-chat-open': chat.id,
      'aria-label': `Open chat: ${chat.title}${running ? ' (working)' : unread ? ' (finished, not opened yet)' : ''}`,
      'aria-current': active ? 'page' : false
    },
      el('span', { class: 'chat-row-title', text: chat.title }),
      el('span', { class: 'chat-row-meta', text: metaBits.filter(Boolean).join(' · ') })
    );
    const deleteButton = el('button', {
      class: 'chat-row-delete', type: 'button', 'data-chat-delete': chat.id,
      'aria-label': `Delete chat: ${chat.title}`, title: "Delete chat"
    }, iconEl('trash'));
    row.append(chatStatusEl(chat.id), openButton, deleteButton);
    return row;
  }

  function arenaChatRow(entry) {
    const localId = entry.local_chat_id || null;
    const active = localId && String(state.activeChatId) === String(localId);
    const row = el('div', { class: `chat-row${active ? ' is-active' : ''}`, role: 'listitem' });
    const metaBits = [relativeTime(entry.updated_at || entry.created_at)];
    if (entry.type === 'agentic') metaBits.push('Agent');
    else if (entry.local_mode) metaBits.push(modeMeta(entry.local_mode).label);
    else if (entry.mode) metaBits.push(modeMeta(entry.mode).label);
    const attrs = {
      class: 'chat-row-main chat-row-open',
      type: 'button',
      'aria-label': `${entry.type === 'agentic' ? 'Open Agent chat' : 'Import and open chat'}: ${entry.title}`,
      'aria-current': active ? 'page' : false
    };
    if (localId) attrs['data-chat-open'] = localId;
    else {
      attrs['data-cloud-chat-open'] = entry.eval_id || entry.id;
      attrs['data-cloud-chat-type'] = entry.type || 'evaluation';
    }
    metaBits.push('arena.ai');
    const openButton = el('button', attrs,
      el('span', { class: 'chat-row-title', text: entry.title }),
      el('span', { class: 'chat-row-meta', text: metaBits.filter(Boolean).join(' · ') }));
    const deleteButton = el('button', {
      class: 'chat-row-delete', type: 'button',
      'data-cloud-chat-delete': entry.eval_id || entry.id || '',
      'aria-label': `Delete chat on Arena: ${entry.title}`, title: "Delete (archive on Arena)"
    }, iconEl('trash'));
    row.append(chatStatusEl(localId), openButton, deleteButton);
    return row;
  }

  function renderChats() {
    const listNode = els.chatList;
    if (!listNode) return;
    const filtered = filteredChats();
    const cloudFiltered = filteredArenaChats();
    const totalVisibleKinds = state.chats.length + dedupedArenaChats().length;
    if (els.chatCount) els.chatCount.textContent = totalVisibleKinds ? String(totalVisibleKinds) : '';
    listNode.setAttribute('aria-busy', String(state.chatsLoading || state.cloudChatsLoading));
    clear(listNode);

    listNode.appendChild(chatGroupTitle('clock', "Recent"));
    if (state.chatsLoading && !state.chats.length) {
      const skeleton = el('div', { class: 'sidebar-skeleton', 'aria-label': "Loading local chats" });
      for (let index = 0; index < 3; index += 1) skeleton.appendChild(el('span', { class: `skeleton-line${index === 1 ? ' short' : ''}` }));
      listNode.appendChild(skeleton);
    } else if (state.chatsError) {
      listNode.appendChild(el('div', { class: 'sidebar-empty sidebar-error' },
        el('strong', { text: state.serverError ? "Server unavailable" : "Failed to load local chats" }),
        el('span', { class: 'inline-error', text: state.chatsError }),
        el('button', { class: 'button button-small button-quiet', type: 'button', 'data-action': state.serverError ? 'retry-connection' : 'retry-chats' },
          iconEl('refresh'), el('span', { text: "Retry" }))
      ));
    } else if (!filtered.length) {
      listNode.appendChild(el('div', { class: 'chat-group-note', text: state.chatFilter
        ? "There is nothing in the local history for this request."
        : "No local chats yet. Create the first dialogue — it will appear here." }));
    } else {
      filtered.forEach((chat) => {
        listNode.appendChild(localChatRow(chat));
        const kids = Array.isArray(chat.children) ? chat.children : [];
        if (kids.length && !state.chatFilter) {
          const wrap = el('div', { class: 'chat-children' });
          kids.forEach((kid) => wrap.appendChild(localChatRow(kid)));
          listNode.appendChild(wrap);
        }
      });
    }

    if (state.chatFilter.trim().length >= 2 && Array.isArray(state.searchResults) && state.searchResults.length) {
      listNode.appendChild(chatGroupTitle('search', "In messages"));
      state.searchResults.slice(0, 20).forEach((hit) => {
        const row = el('button', { class: 'search-hit', type: 'button', title: hit.title || '' },
          el('span', { class: 'search-hit-title', text: hit.title || 'Chat' }),
          el('span', { class: 'search-hit-snippet', text: hit.snippet || '' }));
        row.addEventListener('click', () => { void openChatAtMessage(hit.chat_id, hit.msg_index); });
        listNode.appendChild(row);
      });
    }

    listNode.appendChild(chatGroupTitle('cloud', "Only on arena.ai"));
    if (!state.authenticated) {
      listNode.appendChild(el('div', { class: 'chat-group-note', text: "Log in to Arena to see the account chats from the website. Local dialogues above are available without logging in." }));
    } else if (state.cloudChatsLoading || /still loading|waiting for a check/i.test(String(state.cloudChatsError || ''))) {
      // The arena.ai session is still starting: a loading line, not an error.
      // watchEngineUntilReady() reloads the list the moment it is ready.
      listNode.appendChild(el('div', { class: 'chat-group-note' },
        el('span', { class: 'mini-spinner', 'aria-hidden': 'true' }),
        el('span', { text: " Loading arena.ai history…" })));
    } else if (state.cloudChatsError) {
      listNode.appendChild(el('div', { class: 'sidebar-empty sidebar-error' },
        el('strong', { text: "arena.ai history is unavailable" }),
        el('span', { class: 'inline-error', text: state.cloudChatsError }),
        el('button', { class: 'button button-small button-quiet', type: 'button', 'data-action': 'retry-arena-chats' },
          iconEl('refresh'), el('span', { text: "Retry" }))
      ));
    } else if (!cloudFiltered.length) {
      listNode.appendChild(el('div', { class: 'chat-group-note', text: state.chatFilter
        ? "Nothing found on arena.ai for this request in the last 50 chats."
        : "There are no new chats only on arena.ai. Already imported ones are shown in the local list above." }));
    } else {
      cloudFiltered.forEach((entry) => listNode.appendChild(arenaChatRow(entry)));
    }
  }

  function setChatSearchVisible(visible) {
    if (!els.chatSearchWrap) return;
    if (!visible) {
      state.chatFilter = '';
      if (els.chatSearch) els.chatSearch.value = '';
      els.chatSearchWrap.hidden = true;
      els.clearChatSearch.hidden = true;
      renderChats();
      return;
    }
    els.chatSearchWrap.hidden = false;
    if (state.sidebarCollapsed) setSidebarCollapsed(false);
    if (window.matchMedia('(max-width: 900px)').matches) openMobileSidebar();
    const body = $('#recentsBody');
    if (body) body.hidden = false;
    els.recentsToggle?.setAttribute('aria-expanded', 'true');
    window.setTimeout(() => els.chatSearch?.focus(), 20);
    els.clearChatSearch.hidden = !state.chatFilter;
  }

  function openMobileSidebar() {
    document.body.classList.add('mobile-sidebar-open');
    els.app?.classList.add('mobile-sidebar-open');
    if (els.sidebarScrim) els.sidebarScrim.hidden = false;
    els.mobileMenuBtn?.setAttribute('aria-expanded', 'true');
  }

  function closeMobileSidebar() {
    document.body.classList.remove('mobile-sidebar-open');
    els.app?.classList.remove('mobile-sidebar-open');
    if (els.sidebarScrim) els.sidebarScrim.hidden = true;
    els.mobileMenuBtn?.setAttribute('aria-expanded', 'false');
  }

  function setSidebarCollapsed(collapsed) {
    state.sidebarCollapsed = Boolean(collapsed);
    els.app?.classList.toggle('sidebar-collapsed', state.sidebarCollapsed);
    els.collapseSidebar?.setAttribute('aria-expanded', String(!state.sidebarCollapsed));
    els.collapseSidebar?.setAttribute('aria-label', state.sidebarCollapsed ? "Expand the sidebar" : "Collapse the sidebar");
    if (els.collapseSidebar) els.collapseSidebar.title = state.sidebarCollapsed ? "Expand the panel" : "Collapse the panel";
    try { localStorage.setItem('arenaPersonal.sidebarCollapsed.v4', state.sidebarCollapsed ? '1' : '0'); } catch { /* storage unavailable */ }
  }

  function focusComposer() {
    if (!els.prompt) return;
    els.prompt.focus();
    try { els.prompt.setSelectionRange(els.prompt.value.length, els.prompt.value.length); } catch { /* noop */ }
  }

  /* ---------------------------------------------------------------------- */
  /* Chat rendering                                                        */
  // ═══ 07-render.js ═══
  /* ---------------------------------------------------------------------- */
  function currentViewTitle() {
    if (state.view === 'chat') return state.activeChatTitle || "Conversation";
    return "Home";
  }

  function updateTopbarTitle() {
    if (els.topbarTitle) els.topbarTitle.textContent = currentViewTitle();
    if (els.crumbTitle) els.crumbTitle.textContent = currentViewTitle();
    document.title = `${state.demo ? "Demo · " : ''}${state.view === 'chat' ? `${truncate(state.activeChatTitle || "Conversation", 32)} — ` : ''}Arena Desktop`;
  }

  function setView(view, { focus = false } = {}) {
    state.view = view === 'chat' ? 'chat' : 'welcome';
    if (els.welcomeView) els.welcomeView.hidden = state.view !== 'welcome';
    if (els.chatView) els.chatView.hidden = state.view !== 'chat';
    const mainArea = els.mainArea || document.querySelector('.main-area');
    if (mainArea) mainArea.classList.toggle('is-welcome', state.view === 'welcome');
    // One composer, two homes: centered on the welcome screen (like
    // arena.ai's home page), docked at the bottom inside a chat.
    const shell = els.composerShell || document.querySelector('.composer-shell');
    if (shell) {
      if (state.view === 'welcome' && els.welcomeComposerSlot && shell.parentNode !== els.welcomeComposerSlot) {
        els.welcomeComposerSlot.appendChild(shell);
      } else if (state.view === 'chat' && mainArea && shell.parentNode !== mainArea) {
        mainArea.appendChild(shell);
      }
    }
    updateTopbarTitle();
    if (focus) {
      window.setTimeout(() => {
        if (els.content) els.content.scrollTop = 0;
      }, 0);
    }
  }

  function renderChatHead() {
    if (!els.chatTitle) return;
    const meta = modeMeta(state.mode);
    const modality = modalityMeta(state.modality);
    els.chatTitle.textContent = state.activeChatTitle || "Conversation";
    if (els.chatEyebrow) els.chatEyebrow.textContent = meta.label;
    clear(els.chatMeta);
    els.chatMeta.append(
      el('span', { class: 'meta-chip' }, iconEl('git-branch'), el('span', { text: meta.label })),
      el('span', { class: 'meta-chip' }, iconEl(modality.icon), el('span', { text: modality.label }))
    );
    if (state.mode === 'agent') {
      els.chatMeta.append(el('span', { class: 'meta-chip' }, iconEl('spark'), el('span', { text: "Automatic model selection" })));
    } else if (state.mode !== 'battle') {
      const name = currentModelA()?.name || "No model selected";
      els.chatMeta.append(el('span', { class: 'meta-chip' }, iconEl('spark'), el('span', { text: name })));
      if (state.mode === 'side-by-side') {
        els.chatMeta.append(el('span', { class: 'meta-chip' }, iconEl('spark'), el('span', { text: currentModelB()?.name || "Model B not selected" })));
      }
    } else {
      els.chatMeta.append(el('span', { class: 'meta-chip' }, iconEl('spark'), el('span', { text: "Opponents are selected by the server" })));
    }
    if (state.workspace) {
      els.chatMeta.append(el('span', { class: 'meta-chip' }, iconEl('folder'), el('span', { text: workspaceName() })));
    }
    if (state.activeChatId && state.messages.length) {
      const activeSummary = state.chats.find((chat) => String(chat.id) === String(state.activeChatId));
      const linked = Boolean(state.activeChatEvalId || activeSummary?.eval_id);
      if (linked) {
        const refreshing = String(state.refreshingChatId || '') === String(state.activeChatId);
        const generating = chatIsGenerating(state.activeChatId);
        const refresh = el('button', {
          class: 'meta-chip meta-chip-btn', type: 'button', disabled: refreshing || generating,
          title: generating ? 'Refresh is available when this answer finishes'
            : 'Download newer turns from arena.ai into this chat',
          'aria-label': 'Refresh this chat from arena.ai'
        }, iconEl('refresh'), el('span', { text: refreshing ? 'Refreshing…' : 'Refresh from Arena' }));
        refresh.addEventListener('click', () => { void refreshActiveChat(); });
        els.chatMeta.appendChild(refresh);
      }
      const exp = el('button', { class: 'meta-chip meta-chip-btn', type: 'button', title: 'Download this chat as Markdown' },
        iconEl('download'), el('span', { text: 'Export .md' }));
      exp.addEventListener('click', () => exportChatMd());
      els.chatMeta.appendChild(exp);
    }
  }

  function renderChallenge() {
    if (!els.challengeSlot) return;
    clear(els.challengeSlot);
    if (!state.challenge) {
      els.challengeSlot.hidden = true;
      return;
    }
    const raw = state.challenge;
    const message = typeof raw === 'string' ? raw : String(raw.message ?? raw.title ?? "The server reports a manual login check.");
    const card = el('div', { class: 'challenge-card', role: 'status' },
      el('h3', {}, iconEl('shield-alert'), el('span', { text: "Login verification required" })),
      el('p', { text: `${message} Open a separate arena.ai window and complete the check manually. Automatic bypass is not performed.` }),
      el('button', { class: 'button button-small', type: 'button', 'data-action': 'engine-show' }, iconEl('panel-right'), el('span', { text: "Open window" })),
      el('button', { class: 'button button-small button-quiet', type: 'button', 'data-action': 'settings-connection' }, el('span', { text: "Login status" }))
    );
    els.challengeSlot.appendChild(card);
    els.challengeSlot.hidden = false;
  }

  let challengeModal = null;

  function showChallengeModal() {
    if (challengeModal) return;
    const content = el('div', {},
      el('p', { class: 'modal-note', text: 'Arena paused this message for a quick human check. The arena.ai window with the checkbox was brought to the front: tick the box there (solve the pictures if any) and your message is resent automatically. Nothing is sent until you finish.' }));
    challengeModal = mountModal({
      title: 'Human check needed',
      subtitle: 'arena.ai verification',
      size: 'small',
      content,
      actions: [
        { label: 'Later', variant: 'quiet', onClick: () => {} },
        {
          label: 'Show the check window', variant: 'primary', icon: 'panel-right', autofocus: true,
          onClick: () => { void showEngine(); }
        }
      ],
      onClose: () => { challengeModal = null; }
    });
  }

  function closeChallengeModal() {
    if (!challengeModal) return;
    const modal = challengeModal;
    challengeModal = null;
    modal.close();
  }

  // --- Composer QoL (v5.1.6): per-chat drafts, message queue, done sound ---
  const DRAFTS_KEY = 'arena-drafts-v1';
  const composerDrafts = (() => {
    try { return new Map(Object.entries(JSON.parse(localStorage.getItem(DRAFTS_KEY) || '{}'))); }
    catch { return new Map(); }
  })();

  function draftKey() { return state.activeChatId ? String(state.activeChatId) : '__home__'; }

  function persistDrafts() {
    try {
      const entries = [...composerDrafts.entries()].filter(([, value]) => value).slice(-60);
      localStorage.setItem(DRAFTS_KEY, JSON.stringify(Object.fromEntries(entries)));
    } catch { /* storage unavailable */ }
  }

  function saveComposerDraft() {
    if (!els.prompt) return;
    const value = els.prompt.value;
    if (value) composerDrafts.set(draftKey(), value);
    else composerDrafts.delete(draftKey());
    persistDrafts();
  }

  function restoreComposerDraft() {
    if (!els.prompt) return;
    els.prompt.value = composerDrafts.get(draftKey()) || '';
    state.draft = els.prompt.value;
    try { resizePrompt(); } catch { /* autosize unavailable */ }
    updateComposerState();
    renderQueuedBar();
  }

  const queuedMessages = new Map(); // chatId -> text to send when that chat turns idle

  function renderQueuedBar() {
    const shell = els.composerShell;
    if (!shell) return;
    const key = state.activeChatId ? String(state.activeChatId) : null;
    const queued = key ? queuedMessages.get(key) : null;
    let bar = document.getElementById('queuedBar');
    if (!queued) { bar?.remove(); return; }
    if (!bar) {
      bar = el('div', { class: 'queued-bar', id: 'queuedBar' });
      (els.composerCard || shell).before(bar);
    }
    const stamp = `${key}:${queued.length}:${queued.slice(0, 24)}`;
    if (bar.dataset.stamp === stamp) return;
    bar.dataset.stamp = stamp;
    clear(bar);
    bar.append(
      iconEl('clock'),
      el('span', {
        class: 'queued-bar-text',
        text: `Queued: ${truncate(queued, 80)}`,
        title: 'This message sends itself when the current answer finishes.'
      }),
      el('button', {
        class: 'button button-small button-quiet', type: 'button', title: 'Remove the queued message',
        onclick: () => { queuedMessages.delete(key); renderQueuedBar(); focusComposer(); }
      }, iconEl('x'), el('span', { text: 'Cancel' })));
  }

  function flushQueuedMessage(chatId) {
    const key = chatId ? String(chatId) : null;
    if (!key || String(state.activeChatId) !== key) return;
    const text = queuedMessages.get(key);
    if (!text || chatIsGenerating(key) || state.starting || state.historyLoading) return;
    queuedMessages.delete(key);
    renderQueuedBar();
    if (els.prompt) els.prompt.value = text;
    void sendMessage();
  }

  let doneAudio = null;

  function primeDoneAudio() {
    if (doneAudio) { if (doneAudio.state === 'suspended') void doneAudio.resume(); return; }
    try { doneAudio = new (window.AudioContext || window.webkitAudioContext)(); } catch { doneAudio = null; }
  }

  function maybePlayDoneSound(generation, { wasStopped = false } = {}) {
    if (!generation?.done || wasStopped || generation.hadError) return;
    if (state.appSettings?.notify_sound === false) return;
    if (!doneAudio) primeDoneAudio();
    if (!doneAudio) return;
    playChime(doneAudio);
  }

  // Soft three-note bell (C6 - E6 - G6): a sine fundamental plus a quiet
  // inharmonic partial gives a glassy, marimba-like tone instead of a beep.
  function playChime(ctx) {
    try {
      if (ctx.state === 'suspended') void ctx.resume();
      const volume = Math.min(1, Math.max(0, Number(state.appSettings?.notify_volume ?? 0.6)));
      if (!volume) return;
      const t = ctx.currentTime + 0.02;
      const master = ctx.createGain();
      master.gain.value = 0.42 * volume;
      const tone = ctx.createBiquadFilter();
      tone.type = 'lowpass';
      tone.frequency.value = 5200;
      master.connect(tone);
      tone.connect(ctx.destination);
      [[1046.5, 0], [1318.5, 0.09], [1568.0, 0.18]].forEach(([freq, offset], i) => {
        [[1, 1, 'sine'], [2.76, 0.18, 'sine'], [1, 0.22, 'triangle']].forEach(([ratio, level, type]) => {
          const osc = ctx.createOscillator();
          const gain = ctx.createGain();
          osc.type = type;
          osc.frequency.value = freq * ratio;
          const start = t + offset;
          const tail = i === 2 ? 1.1 : 0.55;
          gain.gain.setValueAtTime(0.0001, start);
          gain.gain.exponentialRampToValueAtTime(level, start + 0.012);
          gain.gain.exponentialRampToValueAtTime(0.0001, start + tail * (ratio > 1 ? 0.45 : 1));
          osc.connect(gain);
          gain.connect(master);
          osc.start(start);
          osc.stop(start + tail + 0.05);
        });
      });
    } catch { /* audio unavailable */ }
  }

  // --- Find in chat (Ctrl+F): WebView2 has no built-in page find ---
  let findHits = [];
  let findIndex = -1;

  function clearFindHighlights() {
    document.querySelectorAll('#messageList mark.find-hit').forEach((mark) => {
      mark.replaceWith(document.createTextNode(mark.textContent));
    });
    els.messageList?.normalize();
    findHits = [];
    findIndex = -1;
  }

  function runFind(query) {
    clearFindHighlights();
    const counter = document.querySelector('#findBar .find-counter');
    const needle = String(query || '').trim().toLocaleLowerCase('en');
    if (!needle || !els.messageList) { if (counter) counter.textContent = ''; return; }
    const walker = document.createTreeWalker(els.messageList, NodeFilter.SHOW_TEXT, {
      acceptNode(node) {
        if (!node.nodeValue || !node.nodeValue.toLocaleLowerCase('en').includes(needle)) return NodeFilter.FILTER_REJECT;
        const parent = node.parentElement;
        if (!parent || parent.closest('script,style,mark,button')) return NodeFilter.FILTER_REJECT;
        return NodeFilter.FILTER_ACCEPT;
      }
    });
    const targets = [];
    while (walker.nextNode()) targets.push(walker.currentNode);
    for (const node of targets) {
      const text = node.nodeValue;
      const lower = text.toLocaleLowerCase('en');
      const frag = document.createDocumentFragment();
      let at = 0;
      let hit = lower.indexOf(needle, at);
      while (hit !== -1) {
        if (hit > at) frag.appendChild(document.createTextNode(text.slice(at, hit)));
        const mark = document.createElement('mark');
        mark.className = 'find-hit';
        mark.textContent = text.slice(hit, hit + needle.length);
        frag.appendChild(mark);
        findHits.push(mark);
        at = hit + needle.length;
        hit = lower.indexOf(needle, at);
      }
      if (at < text.length) frag.appendChild(document.createTextNode(text.slice(at)));
      node.replaceWith(frag);
    }
    if (counter) counter.textContent = findHits.length ? `${findHits.length} found` : 'No matches';
    if (findHits.length) stepFind(1, true);
  }

  function stepFind(direction, fresh = false) {
    findHits = findHits.filter((mark) => mark.isConnected);
    if (!findHits.length) return;
    findIndex = fresh ? 0 : (findIndex + direction + findHits.length) % findHits.length;
    findHits.forEach((mark, i) => mark.classList.toggle('find-hit-current', i === findIndex));
    findHits[findIndex].scrollIntoView({ block: 'center', behavior: 'smooth' });
    const counter = document.querySelector('#findBar .find-counter');
    if (counter) counter.textContent = `${findIndex + 1}/${findHits.length}`;
  }

  function closeFindBar() {
    clearFindHighlights();
    document.getElementById('findBar')?.remove();
    focusComposer();
  }

  function toggleFindBar() {
    let bar = document.getElementById('findBar');
    if (bar) { closeFindBar(); return; }
    const input = el('input', { type: 'search', class: 'find-input', placeholder: 'Find in this chat', 'aria-label': 'Find in this chat' });
    input.addEventListener('input', () => runFind(input.value));
    input.addEventListener('keydown', (event) => {
      if (event.key === 'Enter') { event.preventDefault(); stepFind(event.shiftKey ? -1 : 1); }
      if (event.key === 'Escape') { event.preventDefault(); closeFindBar(); }
    });
    bar = el('div', { class: 'find-bar', id: 'findBar' },
      iconEl('search'), input,
      el('span', { class: 'find-counter', text: '' }),
      el('button', { class: 'icon-button tiny', type: 'button', 'aria-label': 'Previous match', style: { transform: 'rotate(180deg)' }, onclick: () => stepFind(-1) }, iconEl('chevron-down')),
      el('button', { class: 'icon-button tiny', type: 'button', 'aria-label': 'Next match', onclick: () => stepFind(1) }, iconEl('chevron-down')),
      el('button', { class: 'icon-button tiny', type: 'button', 'aria-label': 'Close find', onclick: () => closeFindBar() }, iconEl('x')));
    document.body.appendChild(bar);
    input.focus();
  }

  function userAttachmentsNode(message) {
    const items = normalizeUserAttachments(message?.attachments || message?.experimental_attachments);
    // Live turns carry local previews for freshly attached images.
    const live = Array.isArray(message?.attachments) ? message.attachments : [];
    if (!items.length && !live.length) return null;
    const wrap = el('div', { class: 'user-attachments' });
    const shown = live.length ? live : items;
    shown.forEach((item) => {
      const name = String(item.name || item.filename || 'File');
      const media = String(item.contentType || item.mediaType || '');
      const src = item.previewUrl || (media.startsWith('image/') ? safeUrl(item.url, { image: true }) : null);
      if (src) {
        wrap.appendChild(el('img', { class: 'user-attachment-image', src, alt: name, title: name, loading: 'lazy' }));
        return;
      }
      const href = item.url && /^https?:\/\//.test(item.url) ? safeUrl(item.url) : null;
      const chip = el(href ? 'a' : 'span', {
        class: 'user-attachment-chip',
        ...(href ? { href, target: '_blank', rel: 'noopener noreferrer' } : {})
      }, iconEl(media === 'application/pdf' ? 'file-text' : 'file'),
        el('span', { text: name }),
        item.size ? el('span', { class: 'user-attachment-size', text: formatBytes(item.size) }) : null);
      wrap.appendChild(chip);
    });
    return wrap;
  }

  function userMessageNode(message) {
    const createdAt = message?.created_at || message?.createdAt || message?.timestamp;
    return el('article', { class: 'message message-user' },
      el('div', { class: 'user-bubble' },
        el('div', { class: 'user-meta' },
          el('span', { text: "You" }),
          createdAt ? el('time', { text: formatClock(createdAt), datetime: String(createdAt) }) : null
        ),
        userAttachmentsNode(message),
        el('div', { class: 'user-text', text: textValue(message?.content ?? message?.text ?? message?.message ?? '') })
      )
    );
  }

  function renderSources(lane) {
    if (!Array.isArray(lane.sources) || !lane.sources.length) return null;
    const sourceNodes = lane.sources.map((source, index) => {
      const content = el('span', { class: 'source-copy' },
        el('span', { class: 'source-title', text: source.title || source.domain || "Source" }),
        source.url ? el('span', { class: 'source-url', text: source.domain || source.url }) : null
      );
      const indexEl = el('span', { class: 'source-index', text: String(index + 1) });
      if (source.url) {
        return el('a', {
          class: 'source-card', href: source.url, target: '_blank', rel: 'noopener noreferrer',
          title: source.url
        }, indexEl, content, iconEl('external'));
      }
      return el('div', { class: 'source-card' }, indexEl, content);
    });
    return el('div', { class: 'sources' },
      el('div', { class: 'sources-title' }, iconEl('search'), el('span', { text: lane.demo ? "Sources · demo" : "Sources" })),
      el('div', { class: 'source-list' }, sourceNodes)
    );
  }

  function renderMedia(lane) {
    if (!Array.isArray(lane.media) || !lane.media.length) return null;
    const cards = lane.media.map((media) => {
      const caption = el('div', { class: 'media-caption' },
        el('span', { class: 'media-title', title: media.title, text: media.title }),
        el('button', {
          class: 'media-save', type: 'button', 'data-save-media': media.url || media.poster || '',
          'aria-label': `Save media: ${media.title}`, title: "Save via API"
        }, iconEl('download'))
      );
      let frame;
      if (media.kind === 'audio' && media.url) {
        frame = el('div', { class: 'media-frame is-audio' },
          el('audio', { controls: true, preload: 'metadata', src: media.url, 'aria-label': media.alt }));
      } else if (media.kind === 'video' && media.url) {
        const video = el('video', {
          controls: true, preload: 'metadata', poster: media.poster || false,
          'aria-label': media.alt
        }, el('source', { src: media.url }));
        frame = el('div', { class: 'media-frame' }, video);
      } else if (media.kind === 'video') {
        frame = el('div', { class: 'media-frame is-placeholder' }, iconEl('video'), el('span', { class: 'media-video-badge' }, iconEl('play'), el('span', { text: "Video · event" })));
      } else if (media.url) {
        frame = el('div', { class: 'media-frame' }, el('img', { src: media.url, alt: media.alt, loading: 'lazy', referrerpolicy: 'no-referrer' }));
      } else {
        frame = el('div', { class: 'media-frame is-placeholder' }, iconEl('image'));
      }
      return el('figure', { class: 'media-card' }, frame, caption);
    });
    return el('div', { class: 'media-grid' }, cards);
  }

  function activityStatus(status) {
    const value = String(status || '').toLowerCase();
    if (['ok', 'done', 'success', 'complete', 'completed', 'ready', 'idle'].includes(value)) return { label: "Done", cls: 'is-ok' };
    if (['error', 'failed', 'denied', 'cancelled'].includes(value)
      || /^(denied|blocked|cancel|error|fail|stopped)/.test(value)) return { label: "Error", cls: 'is-err' };
    if (['pending', 'waiting', 'permission'].includes(value)) return { label: "Waiting", cls: 'is-wait' };
    return { label: status || "In progress", cls: '' };
  }

  function renderDiffCard(activity) {
    const raw = activity.raw || {};
    const adds = raw.add || 0;
    const dels = raw.del || 0;
    const verb = raw.verb || 'Edited';
    const path = raw.path || activity.path || '';
    const hasError = Boolean(raw.error);
    const pending = Boolean(raw.pending);
    const name = verb === 'Deleted' ? 'Delete' : verb === 'Created' || verb === 'Writing' ? 'Write' : 'Update';
    const stateCls = hasError ? 'is-err' : (pending || !activityStatus(activity.status).cls) ? 'is-run' : 'is-ok';
    const row = el('div', { class: `tool-row ${stateCls}`, 'data-activity-id': activity.id },
      el('div', { class: 'tool-head', title: path },
        el('span', { class: 'tool-dot', 'aria-hidden': 'true' }),
        el('span', { class: 'tool-name', text: name }),
        el('span', { class: 'tool-arg' }, el('span', { class: 'tool-paren', text: '(' }),
          el('span', { class: 'tool-arg-text', text: path }), el('span', { class: 'tool-paren', text: ')' }))));
    let summary;
    if (hasError) summary = String(raw.error);
    else if (verb === 'Deleted') summary = 'Deleted';
    else if (pending) summary = verb === 'Writing' ? 'Writing…' : 'Editing…';
    else if (verb === 'Created') summary = `Wrote ${plural(adds, 'line')}`;
    else summary = `Added ${plural(adds, 'line')}, removed ${plural(dels, 'line')}`;
    const content = el('div', { class: 'tool-content' }, el('div', { class: `tool-summary${hasError ? ' is-err' : ''}`, text: summary }));
    const expanded = expandedActivities.has(activity.id);
    const diffBox = raw.diff && !pending ? renderDiffLines(raw.diff, expanded ? 400 : 8) : null;
    if (diffBox) {
      content.appendChild(diffBox);
      if (!expanded && String(raw.diff).split('\n').length > 12) {
        content.appendChild(el('button', { class: 'tool-more tool-toggle', type: 'button', 'data-tool-toggle': activity.id, text: '… (click to expand)' }));
      } else if (expanded) {
        content.appendChild(el('button', { class: 'tool-more tool-toggle', type: 'button', 'data-tool-toggle': activity.id, text: 'Collapse' }));
      }
    }
    row.appendChild(el('div', { class: 'tool-body' }, el('span', { class: 'tool-elbow', 'aria-hidden': 'true', text: '⎿' }), content));
    return row;
  }

  const _livePreviewFrames = new Map();

  function renderFilePreview(filePath) {
    const fileName = filePath.split('/').pop() || filePath;
    const ext = fileName.split('.').pop().toLowerCase();
    const isHtml = ['html', 'htm'].includes(ext);
    if (!isHtml) return null;
    const card = el('div', { class: 'file-preview-card' });
    const head = el('div', { class: 'file-preview-head' },
      iconEl('layout'),
      el('span', { class: 'file-preview-name', text: fileName }),
      el('span', { class: 'file-preview-badge', text: 'Live Preview' })
    );
    card.appendChild(head);
    const iframe = document.createElement('iframe');
    iframe.className = 'file-preview-frame';
    iframe.sandbox = 'allow-scripts allow-modals allow-popups';
    iframe.loading = 'lazy';
    iframe.src = previewLink(filePath) + '?t=' + Date.now();
    iframe.title = `Preview of ${fileName}`;
    card.appendChild(iframe);
    _livePreviewFrames.set(filePath, iframe);
    const actions = el('div', { class: 'file-preview-actions' });
    const refreshBtn = el('button', { type: 'button' }, iconEl('refresh'), el('span', { text: 'Refresh' }));
    refreshBtn.addEventListener('click', () => { refreshFilePreview(filePath); });
    actions.appendChild(refreshBtn);
    const openBtn = el('button', { type: 'button' }, iconEl('external'), el('span', { text: 'Open preview' }));
    openBtn.addEventListener('click', () => openPreview(previewLink(filePath, { absolute: true }), fileName));
    actions.appendChild(openBtn);
    card.appendChild(actions);
    return card;
  }

  function refreshFilePreview(filePath) {
    const iframe = _livePreviewFrames.get(filePath);
    if (!iframe) return;
    iframe.src = previewLink(filePath) + '?t=' + Date.now();
  }

  function refreshAllHtmlPreviews() {
    for (const [path] of _livePreviewFrames) refreshFilePreview(path);
  }

  /* ---------------------------------------------------------------------- */
  /* Tool calls, Claude Code style:  ● Bash(npm install)                     */
  /*                                   ⎿  added 120 packages                 */
  /* ---------------------------------------------------------------------- */

  const TOOL_LABELS = {
    run_cmd: 'Bash', bash: 'Bash', shell: 'Bash', execute_command: 'Bash', terminal: 'Bash', run_command: 'Bash',
    read_file: 'Read', read_files: 'Read', read: 'Read', view: 'Read', cat: 'Read',
    write_file: 'Write', write: 'Write', create_file: 'Write', write_project: 'Write',
    edit_file: 'Update', edit: 'Update', str_replace: 'Update', str_replace_editor: 'Update', multi_edit: 'Update',
    ls: 'List', list_files: 'List', list_dir: 'List', list_directory: 'List',
    search: 'Search', grep: 'Search', glob: 'Search', find: 'Search',
    mkdir: 'Create folder', delete: 'Delete', stop_cmd: 'Stop',
    web_search: 'Web search', search_web: 'Web search', web_fetch: 'Fetch', fetch: 'Fetch', fetch_url: 'Fetch',
    generate_image: 'Generate image', edit_image: 'Edit image', generate_video: 'Generate video',
    ask_user: 'Question', propose_plan: 'Plan', set_todos: 'Update todos', todo_write: 'Update todos',
    delegate_task: 'Task', delete_subagent: 'Delete sub-agent', add_voice: 'Choose voice'
  };
  const ARG_KEYS = ['command', 'cmd', 'file_path', 'path', 'filePath', 'pattern', 'query', 'url', 'prompt',
    'question', 'task', 'description', 'id', 'name'];
  const COLLAPSED_LINES = 4;
  const expandedActivities = new Set();

  function toolKey(activity) {
    const raw = activity.raw || {};
    return String(raw.tool || activity.name || '').toLowerCase().replace(/^arena__/, '').replace(/^tool-/, '');
  }

  function toolLabel(activity) {
    const raw = activity.raw || {};
    if (raw.child_id) return 'Task';
    if (raw.mcp) return `${raw.server || 'MCP'} · ${raw.mcp_tool || raw.tool || 'tool'}`;
    const key = toolKey(activity);
    if (TOOL_LABELS[key]) return TOOL_LABELS[key];
    const name = String(activity.name || raw.tool || 'Tool');
    return name.length > 1 ? name.charAt(0).toUpperCase() + name.slice(1).replace(/_/g, ' ') : name;
  }

  function parseJsonObject(text) {
    const value = String(text || '').trim();
    if (!value.startsWith('{')) return null;
    try {
      const obj = JSON.parse(value);
      return obj && typeof obj === 'object' && !Array.isArray(obj) ? obj : null;
    } catch (_) {
      return null;
    }
  }

  function pickArg(obj) {
    for (const key of ARG_KEYS) {
      const value = obj[key];
      if (typeof value === 'string' && value.trim()) return value.trim();
      if (Array.isArray(value) && value.length && typeof value[0] === 'string') return value.join(', ');
    }
    if (Array.isArray(obj.questions) && obj.questions[0]) {
      const q = obj.questions[0];
      return String(typeof q === 'string' ? q : (q.question || q.text || ''));
    }
    const compact = JSON.stringify(obj);
    return compact === '{}' ? '' : compact;
  }

  function toolArg(activity) {
    const raw = activity.raw || {};
    if (raw.child_id) return raw.model_name || '';
    const key = toolKey(activity);
    if (activity.command && key !== 'stop_cmd') return activity.command;
    const input = raw.input && typeof raw.input === 'object' ? JSON.stringify(raw.input) : String(raw.input || '');
    const source = input || String(activity.path || raw.path || '');
    const obj = parseJsonObject(source);
    if (obj) return pickArg(obj);
    if (key === 'stop_cmd') return activity.command || '';
    // Local tools send an absolute path plus a folder-relative one: show the short one.
    if (raw.rel && raw.rel !== '.' && !raw.mcp) return raw.rel;
    if (['ask_user', 'propose_plan', 'set_todos'].includes(key)) return '';
    return source || (raw.rel === '.' ? '.' : '');
  }

  function toolOutput(activity) {
    const raw = activity.raw || {};
    let out = String(activity.output || '');
    if (!out) {
      const detail = String(activity.detail || '');
      const summary = String(raw.summary || '');
      if (detail && detail !== activity.path && detail !== activity.command && detail !== summary
        && detail !== String(raw.path || '') && !parseJsonObject(detail)) out = detail;
    }
    return out.replace(/\r\n/g, '\n').replace(/\s+$/, '');
  }

  function lineCount(text) {
    return text ? text.split('\n').length : 0;
  }

  function plural(n, word) {
    return `${n.toLocaleString('en-US')} ${word}${n === 1 ? '' : 's'}`;
  }

  // Turns raw tool output into what the row shows: an optional one-line
  // summary (Claude Code's "Read 120 lines") and the body text.
  function describeOutput(activity, out) {
    const key = toolKey(activity);
    const label = toolLabel(activity);
    if (!out) return { summary: '', body: '' };
    // Arena Agent's sandbox tools answer with JSON ({stdout, stderr, exitCode}, image records ...).
    const obj = parseJsonObject(out);
    if (obj) {
      const pickText = (value) => (typeof value === 'string' ? value : '');
      if (!obj.error && obj.file && typeof obj.file.content === 'string') {
        out = obj.file.content;   // Read: show the file, not the JSON wrapper
        return { summary: `Read ${plural(lineCount(out), 'line')}`, body: out, folded: true };
      }
      if (!obj.error && Array.isArray(obj.files)) {
        const names = obj.files.map((f) => (typeof f === 'string' ? f : (f && (f.path || f.name)) || '')).filter(Boolean);
        return { summary: `Listed ${plural(names.length, 'file')}`, body: names.join('\n'), folded: true };
      }
      const stdout = pickText(obj.stdout ?? obj.output ?? obj.result ?? obj.text ?? obj.content);
      const stderr = pickText(obj.stderr);
      const code = obj.exitCode ?? obj.exit_code ?? obj.returncode ?? obj.code;
      if (stdout || stderr || typeof obj.stdout === 'string') {
        out = [stdout, stderr].filter((part) => part.trim()).join('\n');
        if (label === 'Bash' && Number.isInteger(code)) out = `exit code ${code}\n${out}`;
      } else if (/^(Generate|Edit) (image|video)$/.test(label)) {
        const what = label.toLowerCase().includes('video') ? 'video' : 'image';
        return { summary: obj.error ? String(obj.error) : (typeof obj.message === 'string' && obj.message ? obj.message : `Generated ${what}`), body: '' };
      } else if (!obj.error && (obj.status === 'success' || obj.success === true || obj.ok === true)
        && Object.keys(obj).every((k) => ['status', 'success', 'ok', 'hash', 'path', 'bytes', 'size', 'message'].includes(k))) {
        // Arena Agent's file tools answer {"status":"success","hash":...}: say it plainly.
        const what = label === 'Write' ? 'Written' : label === 'Update' ? 'Updated' : label === 'Delete' ? 'Deleted' : 'Done';
        return { summary: obj.message ? String(obj.message) : what, body: '' };
      } else {
        out = JSON.stringify(obj, null, 2);
      }
    }
    if (label === 'Bash') {
      let body = out;
      let code = null;
      const head = body.match(/^exit code (-?\d+)\n?/);
      if (head) {
        code = Number(head[1]);
        body = body.slice(head[0].length);
      }
      body = body.replace(/\n?\[Process exited with code -?\d+\]\s*$/, '')
        .replace(/^\(command finished with no output\)$/, '');
      let summary = !body.trim() ? (code === null || code === 0 ? '(No output)' : `Exit code ${code}`) : '';
      let folded = false;
      if (body.trim() && (code === null || code === 0)) {
        // One line for the result people look for: "built in 1.4s", "added 4 packages ... in 3s".
        const hit = body.split('\n').map((l) => l.replace(/\x1b\[[0-9;]*m/g, '').trim())
          .reverse().find((l) => /\bbuilt in [\d.]+m?s\b|^added \d+ packages|\bDone in [\d.]+m?s\b|^\d+ passed|\btests? passed\b/i.test(l));
        if (hit) { summary = hit.replace(/^[✓✔]\s*/, ''); folded = true; }
      }
      return { summary, body, code, folded };
    }
    if (label === 'Read' && !/^(Error|FileNotFoundError|ValueError)/.test(out)) {
      const ranged = out.match(/^\[lines (\d+)-(\d+) of (\d+)\]\n?/);
      const body = ranged ? out.slice(ranged[0].length) : out;
      const n = ranged ? Number(ranged[2]) - Number(ranged[1]) + 1 : lineCount(body);
      return { summary: `Read ${plural(n, 'line')}`, body, folded: true };
    }
    if (label === 'List' && key === 'ls') {
      const n = out === '(empty folder)' ? 0 : lineCount(out);
      return { summary: `Listed ${plural(n, 'entry').replace('entrys', 'entries')}`, body: n ? out : '', folded: true };
    }
    if (label === 'Search' && key === 'search') {
      const n = out === 'no matches' ? 0 : out.split('\n').filter((l) => /:\d+:/.test(l)).length;
      return { summary: n ? `Found ${plural(n, 'match').replace('matchs', 'matches')}` : 'No matches', body: n ? out : '', folded: true };
    }
    return { summary: '', body: out };
  }

  function renderDiffLines(diffText, maxLines) {
    const lines = String(diffText || '').split('\n')
      .filter((line) => line && !line.startsWith('+++') && !line.startsWith('---') && !line.startsWith('@@'));
    if (!lines.length) return null;
    const shown = lines.slice(0, maxLines);
    const box = el('div', { class: 'tool-diff' });
    shown.forEach((line) => {
      const type = line.startsWith('+') ? ' is-add' : line.startsWith('-') ? ' is-del' : '';
      box.appendChild(el('div', { class: `tool-diff-line${type}`, text: line }));
    });
    if (lines.length > shown.length) box.appendChild(el('div', { class: 'tool-more', text: `… +${plural(lines.length - shown.length, 'line')}` }));
    return box;
  }

  function renderToolRow(activity, laneStreaming, awaitingApproval) {
    const raw = activity.raw || {};
    const status = activityStatus(activity.status);
    const label = toolLabel(activity);
    const arg = toolArg(activity);
    const out = toolOutput(activity);
    const running = !status.cls && Boolean(laneStreaming);
    const stateCls = status.cls === 'is-ok' ? 'is-ok' : status.cls === 'is-err' ? 'is-err'
      : (status.cls === 'is-wait' || (running && awaitingApproval)) ? 'is-wait' : (running ? 'is-run' : 'is-idle');
    const row = el('div', { class: `tool-row ${stateCls}`, 'data-activity-id': activity.id });

    const argText = arg.length > 400 ? arg.slice(0, 400) + '…' : arg;
    const head = el('div', { class: 'tool-head', title: arg || label },
      el('span', { class: 'tool-dot', 'aria-hidden': 'true' }),
      el('span', { class: 'tool-name', text: label }),
      argText ? el('span', { class: 'tool-arg' }, el('span', { class: 'tool-paren', text: '(' }),
        el('span', { class: 'tool-arg-text', text: argText.replace(/\s*\n\s*/g, ' ↵ ') }),
        el('span', { class: 'tool-paren', text: ')' })) : null,
      raw.background ? el('span', { class: 'tool-tag', text: 'background' }) : null
    );
    row.appendChild(head);

    const body = el('div', { class: 'tool-body' }, el('span', { class: 'tool-elbow', 'aria-hidden': 'true', text: '⎿' }));
    const content = el('div', { class: 'tool-content' });
    body.appendChild(content);

    const described = describeOutput(activity, out);
    const expanded = expandedActivities.has(activity.id);
    const diff = raw.diff && ['Write', 'Update'].includes(label) ? raw.diff : '';

    if (stateCls === 'is-wait') {
      content.appendChild(el('div', { class: 'tool-summary is-wait', text: 'Waiting for your approval…' }));
    } else if (!out && !diff) {
      if (running) content.appendChild(el('div', { class: 'tool-summary is-muted' }, el('span', { class: 'tool-spinner', 'aria-hidden': 'true' }), el('span', { text: label === 'Bash' ? 'Running…' : 'Working…' })));
      else if (stateCls === 'is-err') content.appendChild(el('div', { class: 'tool-summary is-err', text: String(raw.status && raw.status !== 'error' ? raw.status : activity.status || 'Failed') }));
      else return finishRow(row, activity);
    }

    if (described.summary) {
      content.appendChild(el('div', { class: `tool-summary${stateCls === 'is-err' ? ' is-err' : ''}`, text: described.summary }));
    }
    const text = described.body || '';
    if (text && (!described.folded || expanded)) {
      const lines = text.split('\n');
      const limit = expanded ? 400 : COLLAPSED_LINES;
      // While a command runs, follow the newest output (tail); afterwards show the head.
      const tailMode = running && label === 'Bash';
      const shown = lines.length > limit ? (tailMode ? lines.slice(-limit) : lines.slice(0, limit)) : lines;
      const exitedNormally = label === 'Bash' && described.code !== null && described.code !== undefined;
      const pre = el('pre', { class: `tool-output${stateCls === 'is-err' && !exitedNormally ? ' is-err' : ''}${expanded ? ' is-expanded' : ''}`, text: shown.join('\n') });
      if (tailMode && lines.length > limit) {
        content.appendChild(el('div', { class: 'tool-more', text: `… ${plural(lines.length - limit, 'earlier line')}` }));
      }
      content.appendChild(pre);
      if (!tailMode && lines.length > limit) {
        content.appendChild(el('button', { class: 'tool-more tool-toggle', type: 'button', 'data-tool-toggle': activity.id, text: `… +${plural(lines.length - limit, 'line')} (click to expand)` }));
      } else if (expanded) {
        content.appendChild(el('button', { class: 'tool-more tool-toggle', type: 'button', 'data-tool-toggle': activity.id, text: 'Collapse' }));
      }
    } else if (text && described.folded) {
      content.appendChild(el('button', { class: 'tool-more tool-toggle', type: 'button', 'data-tool-toggle': activity.id, text: 'Show output' }));
    }
    if (diff) {
      const diffBox = renderDiffLines(diff, expanded ? 400 : 12);
      if (diffBox) content.appendChild(diffBox);
    }
    if (label === 'Bash' && described.code && described.code !== 0 && described.body) {
      content.appendChild(el('div', { class: 'tool-summary is-err', text: `Exit code ${described.code}` }));
    }
    row.appendChild(body);
    return finishRow(row, activity);
  }

  function finishRow(row, activity) {
    const raw = activity.raw || {};
    if (activity.url) {
      row.appendChild(el('a', { class: 'tool-link', href: activity.url, target: '_blank', rel: 'noopener noreferrer', title: activity.url },
        iconEl('external'), el('span', { text: activity.url })));
    }
    if (raw.child_id) {
      const openBtn = el('button', { class: 'tool-link subagent-open', type: 'button' },
        iconEl('message'), el('span', { text: 'Open sub-agent chat' }));
      openBtn.addEventListener('click', () => { void openChat(String(raw.child_id)); });
      row.appendChild(openBtn);
    }
    return row;
  }

  function onToolToggle(event) {
    const button = event.target.closest?.('[data-tool-toggle]');
    if (!button) return;
    const id = button.getAttribute('data-tool-toggle');
    if (expandedActivities.has(id)) expandedActivities.delete(id);
    else expandedActivities.add(id);
    scheduleChatRender();
  }
  document.addEventListener('click', onToolToggle);

  function currentToolActivity(lane) {
    const list = Array.isArray(lane.activities) ? lane.activities : [];
    for (let i = list.length - 1; i >= 0; i -= 1) {
      const status = activityStatus(list[i].status);
      if (!status.cls) return list[i];
      if (status.cls === 'is-wait') return list[i];
      break;
    }
    return null;
  }

  function laneAwaitsApproval(lane) {
    return (lane.permissions || []).some((item) => !item.status || item.status === 'pending');
  }

  function renderActivities(lane, list = lane.activities, tail = null) {
    if (!Array.isArray(list) || !list.length) return null;
    const waitingId = lane.streaming && laneAwaitsApproval(lane) ? currentToolActivity(lane)?.id : null;
    const cards = list.map((activity) => {
      const raw = activity.raw || {};
      if (activity.kind === 'sandbox' && (raw.verb === 'Edited' || raw.verb === 'Created' || raw.verb === 'Deleted') && raw.path) {
        const diffCard = renderDiffCard(activity);
        const ext = (raw.path || '').split('.').pop().toLowerCase();
        if ((raw.verb === 'Created' || raw.verb === 'Edited') && ['html', 'htm'].includes(ext) && !raw.error
            && state.modality !== 'webdev' && state.modality !== 'code') {
          const preview = renderFilePreview(raw.path);
          if (preview) {
            const wrapper = el('div', { class: 'sandbox-file-group' });
            wrapper.appendChild(diffCard);
            wrapper.appendChild(preview);
            return wrapper;
          }
        }
        return diffCard;
      }
      return renderToolRow(activity, lane.streaming, activity.id === waitingId);
    });
    return el('div', { class: 'tool-list' }, cards, tail);
  }

  // Claude Code's status line while a step runs:  ✻ Reading the workspace…
  const RUNNING_VERBS = { Read: 'Reading the workspace', List: 'Reading the workspace', Search: 'Searching the workspace',
    Bash: 'Running a command', Write: 'Writing files', Update: 'Editing files', 'Generate image': 'Generating an image' };
  function renderRunningLine(lane) {
    if (!lane.streaming) return null;
    const list = lane.activities || [];
    const last = list[list.length - 1];
    const running = last && !activityStatus(last.status).cls;
    const verb = running ? (RUNNING_VERBS[toolLabel(last)] || 'Working') : 'Thinking';
    return el('div', { class: 'term-running', role: 'status' },
      el('span', { class: 'term-star', 'aria-hidden': 'true', text: '✻' }), el('span', { text: `${verb}…` }));
  }

  function renderTermHead(turn) {
    const mode = turn.modality === 'webdev' || turn.modality === 'code' || state.modality === 'webdev' ? 'code mode' : 'agent mode';
    const prompt = String(turn.user?.content || turn.user?.text || '').replace(/\s+/g, ' ').trim();
    return el('div', { class: 'term-head' },
      el('div', { class: 'term-title' },
        el('span', { class: 'term-brand', text: 'arena.ai-desktop' }),
        el('span', { class: 'term-meta', text: `${state.appVersion ? ` v${state.appVersion}` : ''} · ${mode}` })),
      prompt ? el('div', { class: 'term-prompt', title: prompt }, el('span', { class: 'term-caret', 'aria-hidden': 'true', text: '>' }), el('span', { text: prompt })) : null);
  }

  function renderSitePreviewCard(artifact) {
    const href = new URL(artifact.url, window.location.origin).href;
    const local = href.startsWith(window.location.origin);
    const host = local ? (artifact.path || artifact.name || 'Local preview') : new URL(href).host;
    const button = (label, icon, run, primary = false) => {
      const b = el('button', { type: 'button', class: `button ${primary ? '' : 'button-quiet '}site-preview-btn` }, iconEl(icon), el('span', { text: label }));
      b.addEventListener('click', run);
      return b;
    };
    return el('div', { class: 'site-preview-card' },
      el('span', { class: 'site-preview-icon' }, iconEl('globe')),
      el('div', { class: 'site-preview-copy' },
        el('span', { class: 'site-preview-title', text: local ? 'Local preview' : 'Live site' }),
        el('span', { class: 'site-preview-url', text: host, title: href })),
      el('div', { class: 'site-preview-actions' },
        button('Preview', 'panel-right', () => openPreview(href, host), true),
        button('Copy link', 'copy', async () => {
          try { await navigator.clipboard.writeText(href); toast('Link copied', 'success'); }
          catch { toast(href, 'info', 'Copy this link'); }
        }),
        local ? null : button('Browser', 'external', () => window.open(href, '_blank', 'noopener'))));
  }

  function renderArtifactsInline(lane) {
    if (!Array.isArray(lane.artifacts) || !lane.artifacts.length) return null;
    const seen = new Set();
    const unique = lane.artifacts.filter((a) => {
      const id = a.url || a.path || a.name;
      if (!id || seen.has(id)) return false;
      seen.add(id);
      return true;
    });
    const isLocalUrl = (a) => { try { return new URL(a.url, window.location.origin).origin === window.location.origin; } catch { return false; } };
    let previews = unique.filter((a) => a.url && /^(https?:)?\//.test(a.url));
    if (state.modality === 'webdev' || state.modality === 'code' || previews.some((a) => !isLocalUrl(a))) {
      previews = previews.filter((a) => !isLocalUrl(a));
    }
    const files = unique.filter((a) => !previews.includes(a) && !(a.url && isLocalUrl(a) && a.kind === 'preview'));
    const wrap = el('div', { class: 'artifact-stack' });
    previews.slice(0, 3).forEach((a) => wrap.appendChild(renderSitePreviewCard(a)));
    if (files.length) {
      const note = files.find((f) => f.note)?.note || 'Saved to your folder';
      wrap.appendChild(el('div', { class: 'saved-files' },
        el('span', { class: 'saved-files-title' }, iconEl('check'), el('span', { text: `${note} · ${files.length} ${files.length === 1 ? 'file' : 'files'}` })),
        el('span', { class: 'saved-files-list', text: files.slice(0, 12).map((f) => f.path || f.name).join(', ') + (files.length > 12 ? ` +${files.length - 12} more` : '') })));
    }
    return wrap.childNodes.length ? wrap : null;
  }

  function renderPermissionCard(permission) {
    const isDone = permission.status && permission.status !== 'pending';
    const card = el('div', { class: `permission-card${isDone ? ' is-done' : ''}`, 'data-permission-card': permission.id || '' });
    const head = el('div', { class: 'permission-head' },
      el('span', { class: 'permission-icon' }, iconEl('shield-alert')),
      el('div', { class: 'permission-heading' },
        el('p', { class: 'permission-title', text: permission.title }),
        el('p', { class: 'permission-subtitle', text: `${permission.category || "Action"} · request from backend` })
      )
    );
    const body = el('div', { class: 'permission-body' });
    if (permission.description) body.appendChild(el('p', { class: 'permission-note', text: permission.description }));
    if (permission.command) {
      body.appendChild(el('div', { class: 'permission-detail-label', text: "Command" }));
      body.appendChild(el('pre', { class: 'permission-detail', text: permission.command }));
    }
    if (permission.path) {
      body.appendChild(el('div', { class: 'permission-detail-label', text: "Full path" }));
      body.appendChild(el('pre', { class: 'permission-detail', text: permission.path }));
    }
    if (permission.cwd && permission.cwd !== permission.path) {
      body.appendChild(el('div', { class: 'permission-detail-label', text: "Working folder" }));
      body.appendChild(el('pre', { class: 'permission-detail', text: permission.cwd }));
    }
    if (!permission.command && !permission.path && !permission.cwd) {
      body.appendChild(el('div', { class: 'permission-detail-label', text: "Request details" }));
      body.appendChild(el('pre', { class: 'permission-detail', text: permissionDetail(permission) }));
    }
    if (permission.diff) {
      body.appendChild(el('div', { class: 'permission-detail-label', text: 'Diff' }));
      const diff = el('div', { class: 'diff-block' });
      String(permission.diff).split('\n').forEach((line) => {
        const type = line.startsWith('+') && !line.startsWith('+++') ? ' is-add' : line.startsWith('-') && !line.startsWith('---') ? ' is-del' : '';
        diff.appendChild(el('div', { class: `diff-line${type}` },
          el('span', { class: 'diff-marker', text: line[0] || ' ' }),
          el('span', { text: line })
        ));
      });
      body.appendChild(diff);
    }

    if (isDone) {
      const allowed = permission.status === 'allow' || permission.status === 'always' || permission.status === 'allowed';
      const unanswered = { stopped: "Not run: the reply was stopped", expired: "Not run: no answer in time" }[permission.status];
      card.append(head, body, el('div', { class: `permission-result${allowed ? '' : ' is-deny'}` },
        iconEl(allowed ? 'check' : 'x'),
        el('span', { text: allowed ? "Allowed by user" : (unanswered || "Declined by user") })
      ));
      return card;
    }

    const id = permission.id ? String(permission.id) : '';
    const disabled = state.decidingPermissions.has(String(permission.id)) || !id;
    const allow = el('button', {
      class: 'button button-allow permission-decision', type: 'button',
      'data-permission-decision': 'allow', 'data-permission-id': id, disabled
    }, el('span', { text: "Allow once" }));
    const always = el('button', {
      class: 'button button-always permission-decision', type: 'button',
      'data-permission-decision': 'always', 'data-permission-id': id, disabled
    }, el('span', { text: "Allow such actions in this session" }));
    const deny = el('button', {
      class: 'button button-deny permission-decision', type: 'button',
      'data-permission-decision': 'deny', 'data-permission-id': id, disabled
    }, el('span', { text: "Deny" }));
    const actions = el('div', { class: 'permission-actions' }, allow, always, deny,
      el('span', { class: 'permission-scope', text: "\"In this session\" allows the entire category of actions for the current session, not just this file or command. Deny can be selected at any time; there is no automatic choice." })
    );
    if (!id) {
      actions.prepend(el('div', { class: 'note-box is-warning' }, iconEl('alert'), el('span', { text: "The server did not provide a permission ID — actions are unavailable." })));
    }
    if (permission.demo) {
      actions.appendChild(el('span', { class: 'permission-scope', text: "Demo: the decision is processed locally, commands are not executed." }));
    }
    card.append(head, body, actions);
    return card;
  }

  function visibleLaneText(lane) {
    // With folder tools, the model's raw reply contains <tool> call blocks.
    // Those are rendered as tool cards; the answer text must not show the
    // markup itself (nor a half-streamed tag at the end).
    const raw = lane.text || '';
    const hadTools = (lane.activities || []).some((item) => item.kind === 'tool')
      || (lane.permissions || []).length > 0;
    if (!hadTools || !raw.includes('<')) return raw;
    let text = raw
      .replace(/<function_calls>[\s\S]*?<\/function_calls\s*>/gi, '')
      .replace(/<tool\s+name[^>]*>[\s\S]*?<\/tool\s*>/gi, '')
      .replace(/<invoke\s+name[^>]*>[\s\S]*?<\/invoke\s*>/gi, '');
    const partial = text.search(/<(tool\s+name|invoke\s+name|function_calls)[\s\S]*$/i);
    if (partial >= 0) text = text.slice(0, partial);
    return text.replace(/\n{3,}/g, '\n\n');
  }

  function answerFootNote(lane) {
    if (lane.streaming) return null;
    if (!lane.done && !lane.error) return null;
    const bits = [];
    if (lane.stopped) bits.push("Stopped");
    else if (lane.error) bits.push("Completed with errors");
    else bits.push(lane.demo ? "Demo response" : "Response received");
    const visibleLength = visibleLaneText(lane).trim().length;
    if (visibleLength) bits.push(`${visibleLength.toLocaleString('en-US')} chars`);
    return el('div', { class: 'answer-footnote' }, el('span', { class: 'status-dot is-online' }), el('span', { text: bits.join(' · ') }));
  }

  const _laneTypewriters = new WeakMap();
  const _laneStartedAt = new WeakMap();

  function dropLaneTypewriter(lane) {
    const typewriter = _laneTypewriters.get(lane);
    if (!typewriter) return;
    typewriter._destroy?.();
    _laneTypewriters.delete(lane);
    _laneStartedAt.delete(lane);
  }

  // Claude Code style status: "✻ Running Bash… 12s" / "✻ Thinking… 3s".
  function renderGeneratingLabel(lane) {
    if (!_laneStartedAt.has(lane)) _laneStartedAt.set(lane, Date.now());
    const startedAt = _laneStartedAt.get(lane);
    const active = currentToolActivity(lane);
    let text;
    if (laneAwaitsApproval(lane) || (active && activityStatus(active.status).cls === 'is-wait')) text = 'Waiting for your approval';
    else if (active) text = toolLabel(active) === 'Bash' ? 'Running command' : `Running ${toolLabel(active)}`;
    else text = visibleLaneText(lane) ? 'Writing' : 'Thinking';
    const timer = el('span', { class: 'generating-time' });
    let ticks = 0;
    const tick = () => {
      if (ticks++ > 0 && !timer.isConnected) return;
      const secs = Math.max(0, Math.round((Date.now() - startedAt) / 1000));
      timer.textContent = secs >= 60 ? `${Math.floor(secs / 60)}m ${secs % 60}s` : `${secs}s`;
      setTimeout(tick, 1000);
    };
    tick();
    return el('span', { class: 'generating-label', role: 'status' },
      el('span', { class: 'generating-star', 'aria-hidden': 'true', text: '✻' }),
      el('span', { text: `${text}…` }),
      timer
    );
  }

  function renderAssistantLane(lane, turn, key, totalLanes) {
    const card = el('article', {
      class: `message-assistant assistant-lane${lane.streaming ? ' is-streaming' : ''}`,
      'aria-label': `${lane.modelName || (key === 'b' ? "Model B" : "Model A")}, response`
    });
    const avatarColor = safeColor(lane.modelColor) || '#bdd3c1';
    const laneLogo = modelIconNode({
      name: lane.modelName, org: lane.modelOrg, color: lane.modelColor,
      icon_url: getModel(lane.modelId)?.icon_url || ''
    });
    const avatar = laneLogo
      ? el('span', { class: 'model-avatar has-logo', 'aria-hidden': 'true' }, laneLogo)
      : el('span', {
        class: 'model-avatar',
        style: { background: avatarColor, color: '#1d221e' },
        'aria-hidden': 'true',
        text: initialLetters(lane.modelName || (key === 'b' ? 'Model B' : 'Model A'))
      });
    const label = lane.modelOrg || (lane.modelName ? '' : (key === 'b' ? "Model B" : "Model A"));
    const head = el('div', { class: 'assistant-head' },
      avatar,
      el('div', { class: 'assistant-id' },
        el('span', { class: 'model-name', title: lane.modelName || '', text: lane.modelName || (key === 'b' ? "Model B" : "Model A") }),
        totalLanes > 1 ? el('span', { class: 'lane-badge', text: key.toUpperCase() }) : null,
        turn.vote === (key === 'a' ? 'model_a' : 'model_b')
          ? el('span', { class: 'lane-winner', title: "Your choice in this battle" }, iconEl('trophy'), el('span', { text: "best" }))
          : null,
        label ? el('span', { class: 'option-desc', text: label }) : null
      ),
      lane.streaming ? renderGeneratingLabel(lane) : el('span', { class: 'assistant-spacer' }),
      visibleLaneText(lane) ? el('button', {
        class: 'icon-button answer-copy-button', type: 'button', 'data-copy-answer': key,
        title: "Copy answer", 'aria-label': `Copy model response ${lane.modelName || key.toUpperCase()}`
      }, iconEl('copy')) : null
    );
    card.appendChild(head);

    if (lane.reasoning) {
      const details = el('details', { class: 'reasoning' },
        el('summary', { text: lane.demo ? "Thinking · demo" : "Thinking" }),
        el('div', { class: 'reasoning-content', text: lane.reasoning })
      );
      card.appendChild(details);
    }

    const markdown = el('div', { class: 'markdown' });
    const visibleText = visibleLaneText(lane);
    const inTypewriterWindow = lane.typewriterUntil && Date.now() < lane.typewriterUntil;
    const showTypewriter = lane.streaming && (!visibleText || inTypewriterWindow);
    if (!lane.streaming) dropLaneTypewriter(lane);
    if (showTypewriter) {
      // Reuse one typewriter per lane: every stream event re-renders the
      // card, and a fresh element would restart (and never finish) its phrase.
      let typewriter = _laneTypewriters.get(lane);
      if (!typewriter || typewriter._dead) {
        typewriter = createThinkingTypewriter();
        _laneTypewriters.set(lane, typewriter);
      }
      markdown.appendChild(typewriter);
      if (inTypewriterWindow && visibleText) {
        const remaining = lane.typewriterUntil - Date.now();
        setTimeout(() => { lane.typewriterUntil = 0; scheduleChatRender(); }, remaining);
      }
    } else {
      if (visibleText) markdown.appendChild(renderMarkdown(visibleText));
    }
    if (lane.streaming && visibleText && !showTypewriter) markdown.appendChild(el('span', { class: 'stream-cursor', 'aria-hidden': 'true' }));
    // Claude order: thinking, then the work (tool rows, approvals), then the
    // answer itself at the bottom, then what it produced (media, sources, files).
    const acts = Array.isArray(lane.activities) ? lane.activities : [];
    const termMode = acts.length > 0;
    if (termMode) card.appendChild(renderTermHead(turn));
    // Arena's own order: narration sits between the tool rows it was written between.
    const rawText = lane.text || '';
    const interleave = termMode && rawText && visibleText === rawText
      && acts.some((a) => a.kind === 'sandbox' && Number.isFinite(a.raw?.at));
    let tailNode = null;
    if (interleave) {
      let cursor = 0;
      let group = [];
      const flush = () => { if (group.length) { card.appendChild(renderActivities(lane, group)); group = []; } };
      acts.forEach((a) => {
        const at = Number.isFinite(a.raw?.at) ? Math.min(Math.max(a.raw.at, cursor), rawText.length) : cursor;
        if (at > cursor) {
          flush();
          const piece = rawText.slice(cursor, at);
          if (piece.trim()) card.appendChild(el('div', { class: 'term-say' }, el('span', { class: 'term-say-dot', 'aria-hidden': 'true', text: '●' }), el('div', { class: 'markdown' }, renderMarkdown(piece.trim()))));
          cursor = at;
        }
        group.push(a);
      });
      flush();
      const rest = rawText.slice(cursor);
      markdown.textContent = '';
      if (showTypewriter) markdown.appendChild(_laneTypewriters.get(lane));
      else if (rest.trim()) markdown.appendChild(renderMarkdown(rest.trim()));
      if (lane.streaming && rest.trim() && !showTypewriter) markdown.appendChild(el('span', { class: 'stream-cursor', 'aria-hidden': 'true' }));
      const running = renderRunningLine(lane);
      if (running) card.appendChild(running);
    } else {
      const activities = renderActivities(lane, acts, renderRunningLine(lane));
      if (activities) card.appendChild(activities);
    }
    if (Array.isArray(lane.permissions)) {
      lane.permissions.forEach((permission) => card.appendChild(renderPermissionCard(permission)));
    }
    if (termMode && markdown.childNodes.length) {
      card.appendChild(el('div', { class: 'term-say is-answer' }, el('span', { class: 'term-say-dot', 'aria-hidden': 'true', text: '●' }), markdown));
    } else {
      card.appendChild(markdown);
    }
    const media = renderMedia(lane);
    if (media) card.appendChild(media);
    const mediaChoices = renderMediaChoices(lane);
    if (mediaChoices) card.appendChild(mediaChoices);
    const sources = renderSources(lane);
    if (sources) card.appendChild(sources);
    const artifacts = renderArtifactsInline(lane);
    if (artifacts) card.appendChild(artifacts);

    if (Array.isArray(lane.notices)) {
      lane.notices.forEach((notice) => card.appendChild(el('div', { class: 'message-notice' }, iconEl('info'), el('span', { text: notice }))));
    }
    if (Array.isArray(lane.errors)) {
      lane.errors.forEach((error) => card.appendChild(el('div', { class: 'message-error', role: 'alert' }, iconEl('alert'), el('span', { text: error }))));
    }
    const note = answerFootNote(lane);
    if (note) card.appendChild(note);
    return card;
  }

  const VOTE_OPTIONS = [
    { id: 'model_a', label: "A is better", icon: 'thumbs-up' },
    { id: 'tie', label: "Both are good", icon: 'scale' },
    { id: 'both_bad', label: "Both are bad", icon: 'thumbs-down' },
    { id: 'model_b', label: "B is better", icon: 'thumbs-up' }
  ];

  function renderVoteBar(turn, pairIndex) {
    if (state.mode !== 'battle') return null;
    const laneA = turn.lanes?.a;
    const laneB = turn.lanes?.b;
    if (!laneA || !laneB || laneA.streaming || laneB.streaming || state.generating) return null;
    const hasAnswer = (lane) => Boolean(lane.text || (Array.isArray(lane.media) && lane.media.length));
    if (!hasAnswer(laneA) || !hasAnswer(laneB)) return null;
    if (turn.vote) {
      const chosen = VOTE_OPTIONS.find((option) => option.id === turn.vote);
      return el('div', { class: 'vote-bar is-done' }, iconEl('check'),
        el('span', { text: `Your vote: ${chosen?.label || turn.vote}` }),
        turn.revealed ? el('span', { class: 'vote-revealed-note', text: "· models are revealed in the headings" }) : null);
    }
    if (turn.revealed) return null;
    const bar = el('div', { class: 'vote-bar', role: 'group', 'aria-label': "Voting for the best answer" },
      el('span', { class: 'vote-title', text: "Which answer is better?" }));
    VOTE_OPTIONS.forEach((option) => {
      bar.appendChild(el('button', {
        class: `vote-btn vote-${option.id}`, type: 'button',
        disabled: Boolean(turn.voteBusy),
        title: option.id === 'model_a' ? "The answer on the left (A) is better"
          : option.id === 'model_b' ? "The answer on the right (B) is better" : option.label,
        onclick: () => { void submitVote(turn, pairIndex, option.id); }
      }, iconEl(option.icon), el('span', { text: option.label })));
    });
    bar.appendChild(el('span', { class: 'vote-hint', text: "After voting, the models will be revealed" }));
    return bar;
  }

  async function submitVote(turn, pairIndex, value) {
    if (!state.activeChatId || !turn || turn.vote || turn.voteBusy) return;
    turn.voteBusy = true;
    renderMessages();
    try {
      const result = await API.vote(state.activeChatId, {
        value,
        pair_index: pairIndex >= 0 ? pairIndex : null,
        message_a_id: turn.arenaIds?.a || null,
        message_b_id: turn.arenaIds?.b || null
      });
      turn.vote = result?.vote || value;
      const names = result?.names || {};
      if (names.a || names.b) {
        state.messages.forEach((item) => {
          if (!item || typeof item !== 'object') return;
          if (item.lanes?.a && names.a) item.lanes.a.modelName = names.a;
          if (item.lanes?.b && names.b) item.lanes.b.modelName = names.b;
          if (item.lanes?.a || item.lanes?.b) item.revealed = true;
        });
        turn.revealed = true;
      }
      toast("Vote counted on arena.ai. Models are revealed.", 'success', 'Battle');
      void loadChats({ silent: true });
    } catch (error) {
      toast(errorMessage(error), 'error', "Vote not sent");
    } finally {
      turn.voteBusy = false;
      renderMessages();
    }
  }

  function promptSummary(text) {
    if (!text || text.length < 80) return null;
    const lower = text.toLowerCase().trim();
    const verbs = ['fix', 'add', 'create', 'build', 'write', 'implement', 'make', 'update', 'change', 'remove', 'delete', 'refactor', 'test', 'debug', 'explain', 'help', 'show', 'find', 'search', 'check', 'review', 'set up', 'configure', 'deploy', 'design', 'analyze', 'compare', 'convert', 'generate', 'optimize', 'install', 'run', 'edit', 'modify', 'improve'];
    let summary = '';
    const first = text.split(/[.!?\n]/)[0].trim();
    if (first.length <= 80 && first.length >= 10) {
      summary = first;
    } else {
      for (const verb of verbs) {
        const idx = lower.indexOf(verb);
        if (idx !== -1 && idx < 100) {
          const chunk = text.slice(idx, idx + 70).split(/[.!?\n]/)[0].trim();
          if (chunk.length >= 8) { summary = chunk; break; }
        }
      }
    }
    if (!summary) summary = text.slice(0, 65).trim();
    if (summary.length > 65) summary = summary.slice(0, 62) + '...';
    return summary.charAt(0).toUpperCase() + summary.slice(1);
  }

  function renderTurn(turn, pairIndex = -1) {
    const wrapper = el('section', { class: 'message-turn', 'aria-label': "Dialogue turn" });
    if (turn.msgEnd != null) wrapper.setAttribute('data-msg-end', String(turn.msgEnd));
    if (turn.user) wrapper.appendChild(userMessageNode(turn.user));
    const userText = turn.user?.content || turn.user?.text || '';
    const summary = promptSummary(userText);
    if (summary) {
      const modLabel = turn.modality === 'webdev' ? 'Code' : turn.modality === 'search' ? 'Search' : turn.mode === 'agent' ? 'Agent' : 'Chat';
      wrapper.appendChild(el('div', { class: 'task-summary' },
        el('span', { class: 'task-summary-icon' }, iconEl('spark')),
        el('span', { class: 'task-summary-mode', text: modLabel }),
        el('span', { class: 'task-summary-text', text: summary })
      ));
    }
    const lanes = turn.lanes || {};
    const order = Object.keys(lanes).filter((key) => lanes[key]);
    if (order.length) {
      const grid = el('div', { class: `lane-grid ${order.length > 1 ? 'lanes-2' : 'lanes-1'}` });
      order.forEach((key) => grid.appendChild(renderAssistantLane(lanes[key], turn, key, order.length)));
      wrapper.appendChild(grid);
      const voteBar = renderVoteBar(turn, pairIndex);
      if (voteBar) wrapper.appendChild(voteBar);
    }
    if (Array.isArray(turn.notices)) {
      turn.notices.forEach((notice) => wrapper.appendChild(el('div', { class: 'message-notice' }, iconEl('info'), el('span', { text: notice }))));
    }
    const laneHasError = order.some((key) => lanes[key]?.errors?.length);
    if (turn.error && !laneHasError) {
      wrapper.appendChild(el('div', { class: 'message-error', role: 'alert' }, iconEl('alert'), el('span', { text: turn.error })));
    }
    const turnActions = renderTurnActions(turn);
    if (turnActions) wrapper.appendChild(turnActions);
    return wrapper;
  }

  async function loadQuestions() {
    try {
      const items = await API.getQuestions();
      state.pendingQuestions = (Array.isArray(items) ? items : []).map((q) => ({
        id: String(q.id), chatId: q.chat_id || q.chatId || null, lane: q.lane === 'b' ? 'b' : 'a',
        question: textValue(q.question),
        options: Array.isArray(q.options) ? q.options.map(textValue).filter(Boolean) : [],
        custom: q.custom !== false, subagent: q.subagent || null,
        kind: q.kind === 'plan' ? 'plan' : 'question', plan: textValue(q.plan)
      })).filter((q) => q.id && q.id !== 'undefined');
      updatePendingPermissionsBadge();
      if (state.view === 'chat') renderMessages();
    } catch { /* offline: live questions still arrive over the stream */ }
  // ═══ 08-render2.js ═══
  }

  async function answerQuestionUI(q, answer, card) {
    const text = String(answer || '').trim();
    if (!text) return;
    card?.querySelectorAll('button, input').forEach((n) => { n.disabled = true; });
    try {
      await API.answerQuestion(q.id, text);
      state.pendingQuestions = state.pendingQuestions.filter((x) => x.id !== q.id);
      updatePendingPermissionsBadge();
      renderMessages();
    } catch (error) {
      toast(errorMessage(error), 'error', 'Question');
      card?.querySelectorAll('button, input').forEach((n) => { n.disabled = false; });
    }
  }

  function renderQuestionCard(q) {
    const card = el('div', { class: 'permission-card question-card', 'data-question-card': q.id });
    const isPlan = q.kind === 'plan';
    const head = el('div', { class: 'permission-head' },
      el('span', { class: 'permission-icon' }, iconEl(isPlan ? 'check' : 'help')),
      el('div', { class: 'permission-heading' },
        el('p', { class: 'permission-title', text: isPlan ? (q.subagent ? 'Sub-agent plan' : 'Proposed plan') : (q.subagent ? 'Sub-agent asks' : 'The model asks') }),
        el('p', { class: 'permission-subtitle', text: isPlan ? 'Approve to let the model execute it' : 'Generation is paused until you answer' })));
    const body = el('div', { class: 'permission-body' },
      isPlan ? el('pre', { class: 'plan-text', text: q.plan || q.question })
             : el('p', { class: 'permission-note', text: q.question }));
    if (q.options.length) {
      const row = el('div', { class: 'question-options' });
      q.options.forEach((opt, idx) => {
        const b = el('button', { class: 'button button-small' + (isPlan && idx > 0 ? ' button-quiet' : ''), type: 'button' }, el('span', { text: opt }));
        b.addEventListener('click', () => { void answerQuestionUI(q, opt, card); });
        row.appendChild(b);
      });
      body.appendChild(row);
    }
    if (q.custom) {
      const input = el('input', { class: 'input', type: 'text', placeholder: isPlan ? 'Describe changes to the plan\u2026' : 'Your answer\u2026', 'aria-label': 'Your answer' });
      const send = el('button', { class: 'button button-small', type: 'button' }, iconEl('check'), el('span', { text: isPlan ? 'Revise' : 'Answer' }));
      send.addEventListener('click', () => { void answerQuestionUI(q, input.value, card); });
      input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') { e.preventDefault(); void answerQuestionUI(q, input.value, card); }
      });
      body.appendChild(el('div', { class: 'question-custom' }, input, send));
    }
    card.append(head, body);
    return card;
  }

  function renderUnattachedQuestions() {
    const mine = (state.pendingQuestions || []).filter(
      (q) => !q.chatId || String(q.chatId) === String(state.activeChatId));
    if (!mine.length) return null;
    const section = el('section', { class: 'message-turn', 'aria-label': 'Question from the model' });
    mine.forEach((q) => section.appendChild(renderQuestionCard(q)));
    return section;
  }

  async function loadMediaChoices() {
    try {
      const items = await API.getMediaChoices();
      state.pendingMediaChoices = (Array.isArray(items) ? items : [])
        .map((item) => normalizeMediaChoice(item))
        .filter((choice) => choice?.id && mediaChoiceIsPending(choice));
      updatePendingPermissionsBadge();
      if (state.view === 'chat') renderMessages();
    } catch { /* live choices still arrive over the stream */ }
  }

  async function answerMediaChoiceUI(choice, body, card) {
    if (!choice?.id) return;
    const id = String(choice.id);
    if (state.answeringMediaChoices.has(id)) return;
    state.answeringMediaChoices.add(id);
    card?.querySelectorAll('button').forEach((node) => { node.disabled = true; });
    try {
      const result = await API.answerMediaChoice(id, body);
      const selected = Number.isFinite(Number(result?.selected_index))
        ? Number(result.selected_index)
        : (body.skip ? Number(choice.candidates[0]?.index || 0) : Number(body.selected_index));
      const method = result?.selection_method || (body.skip ? 'skip' : 'user');
      const apply = (target) => {
        if (!target) return;
        target.selectedIndex = selected;
        target.selectionMethod = method;
        target.status = state.demo ? 'completed' : 'submitting';
      };
      apply(choice);
      Object.values(state.chatTurns || {}).forEach((turns) => {
        (turns || []).forEach((turn) => {
          Object.values(turn.lanes || {}).forEach((lane) => {
            (lane.mediaChoices || []).forEach((target) => {
              if (sameMediaChoice(target, choice)) apply(target);
            });
          });
        });
      });
      (state.pendingMediaChoices || []).forEach((target) => {
        if (sameMediaChoice(target, choice)) apply(target);
      });
      if (state.demo) {
        state.pendingMediaChoices = state.pendingMediaChoices.filter((target) => !sameMediaChoice(target, choice));
      }
      updatePendingPermissionsBadge();
      renderMessages();
    } catch (error) {
      toast(errorMessage(error), 'error', 'Image choice');
    } finally {
      state.answeringMediaChoices.delete(id);
      if (state.view === 'chat') renderMessages();
    }
  }

  function renderMediaChoiceCard(choice) {
    const pending = mediaChoiceIsPending(choice);
    const submitting = choice.status === 'submitting' || (choice.id && state.answeringMediaChoices.has(String(choice.id)));
    const cancelled = choice.status === 'cancelled';
    const failed = choice.status === 'error';
    const completed = !pending && !cancelled && !failed && choice.selectedIndex !== null;
    const card = el('section', {
      class: `permission-card media-choice-card${completed ? ' is-done' : ''}`,
      'data-media-choice-card': choice.id || choice.toolCallId || ''
    });
    const title = pending ? 'Choose an image'
      : submitting ? 'Sending your choice…'
        : cancelled ? 'Image choice cancelled'
          : failed ? 'Image choice failed' : 'Image chosen';
    const subtitle = pending ? 'Arena Agent is paused until you pick one'
      : submitting ? 'Arena Agent will continue with the selected image'
        : completed ? 'Both options stay in the transcript, with their models revealed'
          : 'This choice is no longer waiting';
    card.appendChild(el('div', { class: 'permission-head' },
      el('span', { class: 'permission-icon' }, iconEl('image')),
      el('div', { class: 'permission-heading' },
        el('p', { class: 'permission-title', text: title }),
        el('p', { class: 'permission-subtitle', text: subtitle }))));

    const body = el('div', { class: 'permission-body media-choice-body' });
    if (choice.prompt) body.appendChild(el('p', { class: 'media-choice-prompt', text: choice.prompt }));
    if (choice.filePath) body.appendChild(el('p', { class: 'media-choice-file', text: choice.filePath }));

    const grid = el('div', { class: 'media-choice-grid' });
    choice.candidates.forEach((candidate) => {
      const selected = choice.selectedIndex !== null && Number(candidate.index) === Number(choice.selectedIndex);
      const figure = el('figure', { class: `media-choice-option${selected ? ' is-selected' : ''}` });
      if (candidate.url) {
        figure.appendChild(el('a', {
          class: 'media-choice-preview', href: candidate.url, target: '_blank', rel: 'noopener noreferrer',
          title: 'Open full size', 'aria-label': `Open image option ${candidate.index + 1} full size`
        }, el('img', { src: candidate.url, alt: `Generated image option ${candidate.index + 1}`, loading: 'lazy' })));
      } else {
        figure.appendChild(el('div', { class: 'media-choice-preview is-placeholder' }, iconEl('image')));
      }
      const caption = el('figcaption', { class: 'media-choice-caption' });
      caption.appendChild(el('div', { class: 'media-choice-caption-head' },
        el('span', { class: 'media-choice-option-label', text: `Option ${candidate.index + 1}` }),
        selected ? el('span', { class: 'media-choice-selected' }, iconEl('check'), el('span', { text: 'Selected' })) : null));
      if (completed || submitting) {
        const model = candidate.model_name || (candidate.is_private ? 'Private model' : 'Model not revealed yet');
        caption.appendChild(el('div', { class: 'media-choice-model', text: candidate.organization ? `${model} · ${candidate.organization}` : model }));
      }
      const actions = el('div', { class: 'media-choice-actions' });
      if (candidate.url) {
        actions.appendChild(el('a', {
          class: 'button button-small button-quiet', href: candidate.url, target: '_blank', rel: 'noopener noreferrer'
        }, iconEl('external'), el('span', { text: 'Full size' })));
      }
      if (pending && choice.id) {
        const use = el('button', {
          class: 'button button-small', type: 'button', disabled: Boolean(submitting),
          'aria-label': `Use image option ${candidate.index + 1}`
        }, iconEl('check'), el('span', { text: 'Use this image' }));
        use.addEventListener('click', () => {
          void answerMediaChoiceUI(choice, { selected_index: candidate.index }, card);
        });
        actions.appendChild(use);
      }
      if (actions.childNodes.length) caption.appendChild(actions);
      figure.appendChild(caption);
      grid.appendChild(figure);
    });
    body.appendChild(grid);

    if (pending && choice.id) {
      const footer = el('div', { class: 'media-choice-footer' });
      const skip = el('button', { class: 'button button-small button-quiet', type: 'button', disabled: Boolean(submitting) },
        el('span', { text: 'Skip choice' }));
      skip.addEventListener('click', () => { void answerMediaChoiceUI(choice, { skip: true }, card); });
      footer.append(skip, el('span', { class: 'media-choice-note', text: 'Skip uses the first image, like Arena does when no choice is made.' }));
      body.appendChild(footer);
    } else if (pending && !choice.id) {
      body.appendChild(el('p', { class: 'media-choice-note', text: 'This saved choice is no longer waiting in the app.' }));
    } else if ((completed || submitting) && !choice.candidates.some((candidate) => candidate.model_name || candidate.is_private)) {
      body.appendChild(el('p', { class: 'media-choice-note', text: 'Waiting for Arena to reveal the models for both images…' }));
    }
    card.appendChild(body);
    return card;
  }

  function renderMediaChoices(lane) {
    if (!Array.isArray(lane.mediaChoices) || !lane.mediaChoices.length) return null;
    const wrap = el('div', { class: 'media-choice-list' });
    lane.mediaChoices.forEach((choice) => wrap.appendChild(renderMediaChoiceCard(choice)));
    return wrap;
  }

  function renderUnattachedMediaChoices() {
    const visible = [];
    (state.messages || []).forEach((turn) => {
      Object.values(turn.lanes || {}).forEach((lane) => visible.push(...(lane.mediaChoices || [])));
    });
    const mine = (state.pendingMediaChoices || []).filter((choice) => {
      if (choice.chatId && String(choice.chatId) !== String(state.activeChatId)) return false;
      return !visible.some((shown) => sameMediaChoice(shown, choice));
    });
    if (!mine.length) return null;
    const section = el('section', { class: 'message-turn', 'aria-label': 'Image choice from Arena Agent' });
    mine.forEach((choice) => section.appendChild(renderMediaChoiceCard(choice)));
    return section;
  }

  async function refreshActiveChat({ silent = false, automatic = false } = {}) {
    const chatId = state.activeChatId;
    if (!chatId || String(state.refreshingChatId || '') === String(chatId)) return;
    if (chatIsGenerating(chatId)) {
      if (!silent) toast('This chat is generating right now. Refresh it when the answer finishes.', 'warning', 'Refresh from Arena');
      return;
    }
    const now = Date.now();
    if (automatic && now - Number(state.refreshCheckedAt[String(chatId)] || 0) < 30000) return;
    state.refreshCheckedAt[String(chatId)] = now;
    state.refreshingChatId = String(chatId);
    renderChatHead();
    try {
      const result = await API.refreshChat(chatId);
      if (String(state.activeChatId) !== String(chatId)) return;
      if (result?.title) state.activeChatTitle = result.title;
      const added = Number(result?.added || 0);
      if (added > 0) {
        state.refreshingChatId = null;
        await openChat(chatId, { skipRefresh: true });
        toast(`Added ${added} newer ${added === 1 ? 'turn' : 'turns'} from arena.ai.`, 'success', 'Refresh from Arena');
      } else {
        void loadChats({ silent: true }).catch(() => undefined);
        if (!silent) toast('This chat is already up to date with arena.ai.', 'info', 'Refresh from Arena');
      }
    } catch (error) {
      if (!silent) toast(errorMessage(error), 'error', 'Refresh from Arena');
    } finally {
      if (String(state.refreshingChatId || '') === String(chatId)) state.refreshingChatId = null;
      if (String(state.activeChatId) === String(chatId)) renderChatHead();
    }
  }

  /* ------- v5: model pins / Elo / chat utilities ------- */
  const FAV_KEY = 'arenaDesktop.modelFavs';
  const HIDDEN_KEY = 'arenaDesktop.modelHidden';

  function modelPinSet(key) {
    try {
      const raw = JSON.parse(localStorage.getItem(key) || '[]');
      return new Set(Array.isArray(raw) ? raw.map(String) : []);
    } catch { return new Set(); }
  }

  function toggleModelPin(key, id) {
    const set = modelPinSet(key);
    const sid = String(id);
    if (set.has(sid)) set.delete(sid); else set.add(sid);
    try { localStorage.setItem(key, JSON.stringify([...set])); } catch { /* private mode */ }
    return set.has(sid);
  }

  function eloForModel(model) {
    const all = state.eloModels;
    if (!all || !model) return null;
    const slug = (v) => String(v || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
    return all[String(model.id || '').toLowerCase()] || all[slug(model.id)] || all[slug(model.name)] || null;
  }

  function ensureElo(rerender) {
    if (state.eloModels !== null || state._eloLoading) return;
    state._eloLoading = true;
    API.getElo().then((data) => {
      state.eloModels = (data && data.enabled !== false && data.models) ? data.models : {};
      state._eloLoading = false;
      if (typeof rerender === 'function') rerender();
    }).catch(() => { state.eloModels = {}; state._eloLoading = false; });
  }

  function exportChatMd() {
    const id = state.activeChatId;
    if (!id) return;
    if (state.demo) {
      const text = state.messages.map((turn) => {
        const parts = [];
        if (turn.user?.content) parts.push(`## User\n\n${turn.user.content}`);
        Object.values(turn.lanes || {}).forEach((lane) => { if (lane.text) parts.push(`## ${lane.modelName || 'Assistant'}\n\n${lane.text}`); });
        return parts.join('\n\n');
      }).join('\n\n');
      const blob = new Blob([`# ${state.activeChatTitle || 'Chat'}\n\n${text}`], { type: 'text/markdown' });
      const a = el('a', { href: URL.createObjectURL(blob), download: 'chat.md' });
      document.body.appendChild(a); a.click(); a.remove();
      return;
    }
    const a = el('a', { href: `/api/chats/${encodeURIComponent(id)}/export.md`, download: '' });
    document.body.appendChild(a); a.click(); a.remove();
  }

  async function openChatAtMessage(chatId, msgIndex) {
    await openChat(chatId);
    window.setTimeout(() => {
      const turns = [...(els.messageList?.querySelectorAll('[data-msg-end]') || [])];
      const target = turns.find((n) => Number(n.dataset.msgEnd) >= Number(msgIndex)) || turns[turns.length - 1];
      if (target) {
        target.scrollIntoView({ block: 'center', behavior: 'smooth' });
        target.classList.add('turn-flash');
        window.setTimeout(() => target.classList.remove('turn-flash'), 1600);
      }
    }, 350);
  }

  async function forkFromTurn(turn) {
    if (!state.activeChatId || turn.msgEnd == null) return;
    try {
      const res = await API.forkChat(state.activeChatId, turn.msgEnd);
      if (res?.chat_id) {
        await loadChats({ silent: true }).catch(() => undefined);
        await openChat(res.chat_id);
        toast('Forked into a new chat (fresh Arena session; context carried over as a summary).', 'info', 'Fork created');
      } else {
        toast('Fork is not available in the demo.', 'info');
      }
    } catch (error) { toast(errorMessage(error), 'error', 'Fork failed'); }
  }

  async function undoTurnChanges(turn, button) {
    const ids = Object.values(turn.checkpoints || {}).filter(Boolean);
    if (!ids.length) return;
    if (!button.dataset.armed) {
      button.dataset.armed = '1';
      const label = button.querySelector('span:last-child');
      if (label) label.textContent = 'Click again to undo';
      window.setTimeout(() => { delete button.dataset.armed; renderMessages(); }, 3000);
      return;
    }
    button.disabled = true;
    try {
      let restored = 0; let removed = 0;
      for (const id of ids) {
        const res = await API.restoreCheckpoint(id);
        restored += Number(res?.restored) || 0;
        removed += Number(res?.removed) || 0;
      }
      toast(`Undone: ${restored} file(s) restored, ${removed} created file(s) removed.`, 'info', 'Checkpoint restored');
      if (state.workspacePanelOpen) void loadWorkspaceTree('.', { force: true });
      renderMessages();
    } catch (error) { toast(errorMessage(error), 'error', 'Undo failed'); button.disabled = false; }
  }

  function renderTurnActions(turn) {
    const streaming = Object.values(turn.lanes || {}).some((lane) => lane?.streaming);
    const hasCk = Boolean(turn.checkpoints && Object.values(turn.checkpoints).some(Boolean));
    if (streaming || (!hasCk && turn.msgEnd == null)) return null;
    const row = el('div', { class: 'turn-actions' });
    if (hasCk) {
      const undo = el('button', { class: 'button button-small button-quiet', type: 'button', title: 'Restore the files this turn changed from the checkpoint taken beforehand' },
        iconEl('refresh'), el('span', { text: 'Undo file changes' }));
      undo.addEventListener('click', () => { void undoTurnChanges(turn, undo); });
      row.appendChild(undo);
    }
    if (turn.msgEnd != null) {
      const fork = el('button', { class: 'button button-small button-quiet', type: 'button', title: 'Continue from here in a new chat' },
        iconEl('git-branch'), el('span', { text: 'Fork from here' }));
      fork.addEventListener('click', () => { void forkFromTurn(turn); });
      row.appendChild(fork);
    }
    return row;
  }

  function openAttachMenu() {
    if (!state.workspace) { els.fileInput?.click(); return; }
    const content = el('div');
    const list = el('div', { class: 'popover-list' });
    list.appendChild(popoverOption({
      title: 'Upload files', desc: attachmentHint(), icon: 'plus',
      onClick: () => { closePopover(); els.fileInput?.click(); }
    }));
    list.appendChild(popoverOption({
      title: 'Upload folder to workspace', desc: 'Copy a folder and its contents into the workspace', icon: 'folder',
      onClick: () => { closePopover(); void uploadFolderToWorkspace(); }
    }));
    list.appendChild(popoverOption({
      title: 'Attach workspace files as text', desc: 'Insert file contents into the prompt (works in every mode)', icon: 'file',
      onClick: () => { closePopover(); void openSnapshotPicker(); }
    }));
    content.appendChild(list);
    openPopover(els.attachButton, { title: 'Attach', content });
  }

  async function uploadFolderToWorkspace() {
    const input = document.createElement('input');
    input.type = 'file';
    input.webkitdirectory = true;
    input.multiple = true;
    input.addEventListener('change', async () => {
      const files = Array.from(input.files || []);
      if (!files.length) return;
      toast(`Uploading ${files.length} files to workspace...`, 'info', 'Upload');
      try {
        const result = await API.uploadToWorkspace(files);
        toast(`Uploaded ${result.count || 0} files to workspace`, 'success', 'Upload');
        void refreshWorkspacePanel({ force: true });
      } catch (e) {
        toast(`Upload failed: ${e.message}`, 'error', 'Upload');
      }
    });
    input.click();
  }

  async function collectWorkspaceFiles() {
    const out = [];
    const walk = async (path, depth) => {
      if (depth > 3 || out.length >= 300) return;
      let data;
      try { data = await API.getWorkspaceTree(path); } catch { return; }
      const entries = Array.isArray(data?.entries) ? data.entries : (Array.isArray(data) ? data : []);
      for (const e of entries) {
        const name = String(e?.name || '');
        if (!name || name === '.arena-artifacts' || name === '.git') continue;
        const rel = String(e?.path || (path === '.' ? name : `${path}/${name}`));
        const isDir = Boolean(e?.is_dir ?? e?.dir ?? (e?.type === 'dir') ?? (e?.kind === 'folder'));
        if (isDir) await walk(rel, depth + 1);
        else out.push(rel);
        if (out.length >= 300) break;
      }
    };
    await walk('.', 0);
    return out;
  }

  async function openSnapshotPicker() {
    const content = el('div');
    content.appendChild(el('p', { class: 'modal-copy', text: 'Pick files; their contents are inserted into the prompt as one text block (up to about 40k characters).' }));
    const list = el('div', { class: 'snapshot-list' }, el('span', { class: 'loading-block' }, el('span', { class: 'mini-spinner' }), el('span', { text: 'Loading files…' })));
    content.appendChild(list);
    const addBtn = el('button', { class: 'button button-small', type: 'button', disabled: true }, el('span', { text: 'Insert selected' }));
    content.appendChild(el('div', { class: 'popover-foot' }, el('span'), addBtn));
    openPopover(els.attachButton, { title: 'Workspace files as text', content, wide: true });
    const files = await collectWorkspaceFiles();
    clear(list);
    if (!files.length) { list.appendChild(el('p', { class: 'modal-copy', text: 'No files found in the workspace.' })); return; }
    const picked = new Set();
    files.forEach((rel) => {
      const box = el('input', { type: 'checkbox' });
      box.addEventListener('change', () => {
        if (box.checked) picked.add(rel); else picked.delete(rel);
        addBtn.disabled = !picked.size;
        const label = addBtn.querySelector('span');
        if (label) label.textContent = `Insert selected (${picked.size})`;
      });
      list.appendChild(el('label', { class: 'snapshot-item' }, box, el('span', { text: rel })));
    });
    addBtn.addEventListener('click', async () => {
      addBtn.disabled = true;
      try {
        const res = await API.workspaceSnapshot([...picked]);
        if (res?.text && els.prompt) {
          els.prompt.value = `${res.text}\n\n${els.prompt.value}`;
          updateComposerState();
          focusComposer();
          toast(`Inserted ${res.files} file(s), ${res.chars} characters.`, 'info', 'Workspace snapshot');
        }
        closePopover();
      } catch (error) { toast(errorMessage(error), 'error', 'Snapshot failed'); addBtn.disabled = false; }
    });
  }

  function initJumpPill() {
    const content = els.content;
    const list = els.messageList;
    if (!content || !list || document.getElementById('jumpPill')) return;
    const pill = el('div', { class: 'jump-pill', id: 'jumpPill', hidden: true });
    const mk = (label, title, fn) => {
      const b = el('button', { class: 'jump-pill-btn', type: 'button', title, 'aria-label': title }, el('span', { text: label }));
      b.addEventListener('click', fn);
      return b;
    };
    const jump = (dir) => {
      const turns = [...list.querySelectorAll('.message-turn')].filter((n) => n.querySelector('.message-user'));
      if (!turns.length) return;
      const top = content.scrollTop + 80;
      let target = null;
      if (dir < 0) {
        for (let i = turns.length - 1; i >= 0; i -= 1) { if (turns[i].offsetTop < top - 40) { target = turns[i]; break; } }
        target = target || turns[0];
      } else {
        target = turns.find((n) => n.offsetTop > top + 40) || turns[turns.length - 1];
      }
      content.scrollTo({ top: Math.max(0, target.offsetTop - 60), behavior: 'smooth' });
    };
    pill.append(
      mk('↑', 'Previous message', () => jump(-1)),
      mk('↓', 'Next message', () => jump(1)),
      mk('⤓', 'Jump to latest', () => content.scrollTo({ top: content.scrollHeight, behavior: 'smooth' }))
    );
    // One control, sticky inside the chat column (it used to be fixed to the
    // window, floating over the side panel, next to a second "back to bottom").
    content.appendChild(pill);
    content.addEventListener('scroll', () => {
      pill.hidden = content.scrollHeight - content.scrollTop - content.clientHeight < 300;
    }, { passive: true });
  }

  let _rlSwitchBtn = null;
  function syncRateLimitAccountHint(rateLimitLeft) {
    try {
      const others = (state.status?.accounts || []).filter((a) => a && !a.current && a.id);
      const show = rateLimitLeft > 0 && others.length > 0 && !state.demo && els.composerSecondaryHint;
      if (!show) { if (_rlSwitchBtn) _rlSwitchBtn.hidden = true; return; }
      if (!_rlSwitchBtn) {
        _rlSwitchBtn = el('button', { class: 'button button-small button-quiet rl-switch', type: 'button' },
          iconEl('user'), el('span', { text: 'Switch account & resend' }));
        _rlSwitchBtn.addEventListener('click', async () => {
          const other = (state.status?.accounts || []).find((a) => a && !a.current && a.id);
          if (!other) return;
          _rlSwitchBtn.disabled = true;
          try {
            await API.switchAccount(other.id);
            state.rateLimitUntil = 0;
            toast(`Switched to ${other.email || other.name || 'the other account'} — press Send again.`, 'info', 'Account switched');
            await loadStatus().catch(() => undefined);
          } catch (error) { toast(errorMessage(error), 'error', 'Switch failed'); }
          _rlSwitchBtn.disabled = false;
          updateComposerState();
        });
        els.composerSecondaryHint.after(_rlSwitchBtn);
      }
      _rlSwitchBtn.hidden = false;
    } catch { /* decorative hint */ }
  }

  function clockText(epoch) {
    return new Date(epoch * 1000).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  }

  async function refreshPulse() {
    if (state.demo || !state.authenticated) return;
    try {
      const p = await API.getPulse();
      if (p && p.ok) state.pulse = p;
    } catch { /* keep the last reading */ }
    renderUsageBar();
    const p = state.pulse;
    if (p && p.left <= 0 && !state.limitToastShown) {
      state.limitToastShown = true;
      toast(`Arena's daily credits are used up.${p.reset ? ` They refresh at ${clockText(p.reset)}.` : ''} Replies stop until then.`, 'warning', 'Daily limit reached');
    }
    if (p && p.left > 0) state.limitToastShown = false;
  }

  // Arena's own meter (/api/me/pulse): the percent of today's credits left. Nothing here is estimated.
  function renderUsageBar() {
    if (!els.usageBarWrap || !els.usageBarFill || !els.usageBarLabel) return;
    const p = state.pulse;
    if (!p || state.demo) {
      els.usageBarWrap.hidden = true;
      return;
    }
    els.usageBarWrap.hidden = false;
    const used = Math.max(0, Math.min(100, 100 - p.left));
    let label;
    if (p.left <= 0) {
      label = `Daily limit reached${p.reset ? ` \u2014 credits refresh at ${clockText(p.reset)}` : ''}`;
    } else {
      label = `${p.left}% of today's credits left`;
      if (p.left <= 15) label += ' \u2014 running low';
      if (p.reset) {
        const diff = p.reset * 1000 - Date.now();
        if (diff > 0) {
          const h = Math.floor(diff / 3600000);
          const m = Math.floor((diff % 3600000) / 60000);
          label += h > 0 ? `, refresh in ${h}h ${m}m` : `, refresh in ${m}m`;
        }
      }
    }
    els.usageBarFill.style.width = `${used}%`;
    els.usageBarFill.classList.toggle('warn', used >= 70 && used < 90);
    els.usageBarFill.classList.toggle('danger', used >= 90);
    els.usageBarLabel.textContent = label;
  }

  function activeTodos() {
    const items = state.chatTodos[String(state.activeChatId || '')];
    return Array.isArray(items) ? items.filter((it) => it && it.text) : [];
  }

  function renderUnattachedTodos() {
    const items = activeTodos();
    if (!items.length) return null;
    const done = items.filter((it) => it.status === 'done').length;
    const section = el('section', { class: 'message-turn', 'aria-label': 'Task checklist' });
    const card = el('div', { class: 'permission-card todos-card' });
    const head = el('div', { class: 'permission-head' },
      el('span', { class: 'permission-icon' }, iconEl('check')),
      el('div', { class: 'permission-heading' },
        el('p', { class: 'permission-title', text: 'Checklist' }),
        el('p', { class: 'permission-subtitle', text: `${done}/${items.length} done` })));
    const list = el('ul', { class: 'todos-list' });
    items.forEach((it) => {
      const mark = it.status === 'done' ? '\u2713' : (it.status === 'doing' ? '\u25B8' : '\u25CB');
      list.appendChild(el('li', { class: `todo-item is-${it.status === 'done' || it.status === 'doing' ? it.status : 'pending'}` },
        el('span', { class: 'todo-mark', text: mark }),
        el('span', { class: 'todo-text', text: it.text })));
    });
    card.append(head, el('div', { class: 'permission-body' }, list));
    section.appendChild(card);
    return section;
  }

  function renderUnattachedPermissions(renderedIds) {
    // Only this chat's approvals: another chat's request waits in that chat
    // (the sidebar badge still counts it) instead of showing up here.
    const here = state.activeChatId ? String(state.activeChatId) : '';
    const remaining = state.pendingPermissions.filter((permission) => (!permission.id || !renderedIds.has(String(permission.id)))
      && (!permission.chatId || String(permission.chatId) === here));
    if (!remaining.length) return null;
    const section = el('section', { class: 'message-turn', 'aria-label': "Pending approval" });
    section.appendChild(el('div', { class: 'activity-head' },
      el('span', { class: 'activity-icon' }, iconEl('shield-alert')),
      el('span', { class: 'activity-title', text: "Awaiting your decision" }),
      el('span', { class: 'activity-status is-wait', text: String(remaining.length) })
    ));
    remaining.forEach((permission) => section.appendChild(renderPermissionCard(permission)));
    return section;
  }

  function renderMessages({ preserveScroll = true } = {}) {
    if (!els.messageList) return;
    const content = els.content;
    const previousScroll = content?.scrollTop || 0;
    const wasNearBottom = content ? content.scrollHeight - content.scrollTop - content.clientHeight < 140 : true;
    clear(els.messageList);

    if (state.historyLoading) {
      const loading = el('div', { class: 'loading-history', 'aria-label': "Loading history" });
      loading.appendChild(el('div', { class: 'skeleton-bar w-35' }));
      loading.appendChild(el('div', { class: 'skeleton-right' }));
      loading.appendChild(el('div', { class: 'message-skeleton' }, el('div', { class: 'skeleton-bar w-80' }), el('div', { class: 'skeleton-bar' }), el('div', { class: 'skeleton-bar w-55' })));
      els.messageList.appendChild(loading);
      updateArtifactCount();
      return;
    }

    if (state.historyError) {
      els.messageList.appendChild(el('div', { class: 'history-error' },
        el('div', { class: 'error-panel' },
          el('h3', { text: "Failed to load dialogue" }),
          el('p', { text: state.historyError }),
          el('button', { class: 'button button-small', type: 'button', 'data-action': 'retry-history' }, iconEl('refresh'), el('span', { text: "Retry" })),
          el('button', { class: 'button button-small button-quiet', type: 'button', 'data-action': 'new-chat' }, el('span', { text: "New chat" }))
        )
      ));
      return;
    }

    if (!state.messages.length) {
      els.messageList.appendChild(el('div', { class: 'history-empty' },
        el('span', { class: 'history-empty-icon' }, iconEl('spark')),
        el('h3', { text: state.activeChatId ? "History is currently empty" : "Start a new dialogue" }),
        el('p', { text: state.activeChatId ? "Send the first message — responses will appear here. Mode and task type settings are visible in the input field." : "Select an existing chat or create a new one." })
      ));
      return;
    }

    const renderedPermissions = new Set();
    let pairIndex = -1;
    state.messages.forEach((turn) => {
      if (turn.lanes) {
        Object.values(turn.lanes).forEach((lane) => {
          (lane.permissions || []).forEach((permission) => {
            if (permission.id) renderedPermissions.add(String(permission.id));
          });
        });
      }
      if (turn.divider) {
        els.messageList.appendChild(el('div', { class: 'chat-divider', role: 'note' },
          iconEl('compress'), el('span', { text: turn.divider })));
        return;
      }
      const isPair = Boolean(turn?.lanes?.a && turn?.lanes?.b);
      if (isPair) pairIndex += 1;
      els.messageList.appendChild(renderTurn(turn, isPair ? pairIndex : -1));
    });
    const unattached = renderUnattachedPermissions(renderedPermissions);
    if (unattached) els.messageList.appendChild(unattached);
    const questions = renderUnattachedQuestions();
    if (questions) els.messageList.appendChild(questions);
    const mediaChoices = renderUnattachedMediaChoices();
    if (mediaChoices) els.messageList.appendChild(mediaChoices);
    const todos = renderUnattachedTodos();
    if (todos) els.messageList.appendChild(todos);

    if (content) {
      if (!preserveScroll || wasNearBottom) {
        requestAnimationFrame(() => {
          if (!content) return;
          content.scrollTop = content.scrollHeight;
        });
      } else {
        content.scrollTop = previousScroll;
      }
    }
    updateArtifactCount();
  }

  function scheduleChatRender() {
    if (state._renderFrame) return;
    state._renderFrame = requestAnimationFrame(() => {
      state._renderFrame = null;
      if (state.view === 'chat') renderMessages();
    });
  }

  function renderChatArea() {
    if (!els.chatView) return;
    renderChatHead();
    renderChallenge();
    renderMessages({ preserveScroll: false });
    setView('chat');
  }

  function updateArtifactCount() {
    const count = state.artifacts.length;
    if (els.artifactCount) {
      els.artifactCount.textContent = String(count);
      els.artifactCount.hidden = !count;
    }
    if (els.artifactsButton) {
      els.artifactsButton.setAttribute('aria-label', count ? `Open dialogue artifacts: ${count}` : "Open dialogue artifacts");
    }
  }

  function renderWelcomeState() {
    setView('welcome');
  }

  /* ---------------------------------------------------------------------- */
  /* Composer and model presentation                                       */
  // ═══ 09-composer.js ═══
  /* ---------------------------------------------------------------------- */
  function setAgentKind(kind) {
    if (kind !== 'native' && kind !== 'local') return;
    state.agentKind = kind;
    try { window.localStorage.setItem('ap-agent-kind', kind); } catch { /* private mode */ }
    pruneAttachmentsForSelection();
    renderModelStrip();
    renderComposerContext();
    updateComposerState();
  }

  function syncWorkspaceSyncToggle() {
    // Workspace Sync is always in the toolbar, in every mode: it decides
    // whether chats may work in the folder selected on this computer.
    const chip = els.workspaceSyncChip;
    const input = els.workspaceSyncToggle;
    if (!chip || !input) return;
    chip.hidden = false;
    const on = state.mode === 'agent'
      ? Boolean(state.directTools)
      : Boolean(state.directTools && state.workspaceChosen);
    input.checked = on;
    input.disabled = state.generating;
    chip.classList.toggle('is-on', on);
    chip.classList.toggle('is-disabled', state.generating);
    if (state.mode === 'agent') {
      chip.title = on
        ? "Workspace Sync is on: the Local Agent works in the folder selected on this computer, and files the Arena Agent creates are downloaded into that folder."
        : "Workspace Sync is off: the Local Agent answers without touching this computer, and Arena Agent files stay in Arena's workspace.";
    } else if (state.workspaceChosen) {
      chip.title = on
        ? "Workspace Sync is on: the models can run commands and use tools in the folder selected on this computer, and the results return to them automatically. Actions follow the permission mode."
        : "Workspace Sync is off: the models only chat and cannot touch the folder selected on this computer.";
    } else {
      chip.title = "Workspace Sync: first choose a folder on this computer (the workspace chip on the left), then the models can work in it like an agent.";
    }
  }

  function setWorkspaceSync(on) {
    if (on && !state.workspaceChosen && state.mode !== 'agent') {
      state.directTools = false;
      syncWorkspaceSyncToggle();
      toast("Choose a folder on this computer first — Workspace Sync lets the models work in that folder like an agent.", 'info', "Workspace Sync");
      openWorkspacePopover(els.workspaceButton);
      return;
    }
    state.directTools = Boolean(on);
    try { window.localStorage.setItem('ap-direct-tools', state.directTools ? '1' : '0'); } catch { /* private mode */ }
    syncWorkspaceSyncToggle();
    toast(state.directTools
      ? "Workspace Sync is on: models can run commands and use tools in the folder selected on this computer, and the results return to them automatically."
      : "Workspace Sync is off: models answer with regular text and cannot touch the folder on this computer.", 'info', "Workspace Sync");
  }


  const CONTEXT_WARN_CHARS = 80000;

  function syncGatewayChip() {
    const chip = els.gatewayChip;
    if (!chip) return;
    const active = Boolean(state.gateway?.active);
    chip.hidden = !active;
    if (active) chip.title = `Agent Gateway is ON — ${state.gateway?.servers || 0} local MCP server(s) reachable by the Arena Agent. Click to manage.`;
  }

  let gatewaySetupPrompted = false;

  function maybeGatewaySetupPrompt() {
    if (gatewaySetupPrompted || state.demo) return;
    if (state.gateway?.state !== 'needs_cloudflared') return;
    if (!state.appSettings?.gateway_enabled) return;
    gatewaySetupPrompted = true;
    showCloudflaredInstallModal(() => {
      toast('cloudflared installed — the gateway starts with your next new Agent chat.', 'success', 'Agent Gateway');
    });
  }

  let gatewayWarmAttempted = false;
  let gatewayWasActive = false;

  function maybeWarmGateway() {
    const cfg = state.appSettings || {};
    const wanted = state.mode === 'agent' && state.directTools
      && cfg.gateway_enabled === true && cfg.gateway_auto === true && !state.demo;
    if (!wanted) { gatewayWarmAttempted = false; return; }
    if (state.gateway?.active) { gatewayWasActive = true; gatewayWarmAttempted = true; return; }
    // A session that was live and then stopped (Stop button, idle expiry)
    // must not strand the latch: the next Agent send warms a fresh tunnel.
    if (gatewayWasActive) { gatewayWasActive = false; gatewayWarmAttempted = false; }
    if (gatewayWarmAttempted) return;
    gatewayWarmAttempted = true;
    void API.startGateway().catch(() => undefined); // problems surface via status/JIT
  }

  function estimateHistoryChars() {
    let total = 0;
    for (const turn of state.messages || []) {
      if (!turn) continue;
      const user = turn.user;
      total += String(typeof user === 'string' ? user : (user?.text ?? user?.content ?? '')).length;
      for (const lane of Object.values(turn.lanes || {})) total += String(lane?.text || '').length;
    }
    return total;
  }

  const CONTEXT_MAX_CHARS = 800000;

  function syncCompactChip() {
    const button = els.compactButton;
    if (!button) return;
    const show = Boolean(state.activeChatId) && state.view === 'chat'
      && !['image', 'video'].includes(state.modality)
      && (state.messages || []).length > 0;
    button.hidden = !show;
    if (!show) return;
    const warn = (state.historyChars || 0) >= CONTEXT_WARN_CHARS;
    const chars = Math.max(state.historyChars || 0, estimateHistoryChars());
    const sizeLabel = button.querySelector('.chip-label');
    if (sizeLabel) sizeLabel.textContent = chars >= 1000 ? `Compact · ~${Math.round(chars / 1000)}k` : 'Compact';
    button.classList.toggle('is-warn', warn);
    button.disabled = state.generating;
    if (els.compactDot) els.compactDot.hidden = !warn;
    button.title = warn
      ? `This conversation is ~${Math.round((state.historyChars || 0) / 1000)}k characters and likely close to Arena's context limit. Compact continues it in a fresh session with a summary, so replies keep working.`
      : "Compact: continue this chat in a fresh Arena session with a summary of everything so far. Use it when a long conversation starts returning empty replies.";
    syncContextMeter(chars);
  }

  function syncContextMeter(chars) {
    let meter = document.getElementById('contextMeter');
    if (!meter) {
      meter = el('div', { class: 'context-meter', id: 'contextMeter' });
      const barWrap = el('div', { class: 'context-bar-wrap' });
      const barFill = el('div', { class: 'context-bar-fill', id: 'contextBarFill' });
      barWrap.appendChild(barFill);
      const label = el('span', { class: 'context-bar-label', id: 'contextBarLabel' });
      meter.appendChild(barWrap);
      meter.appendChild(label);
      const toolbar = document.querySelector('.composer-toolbar');
      const spacer = toolbar?.querySelector('.toolbar-spacer');
      if (spacer) spacer.before(meter);
      else if (toolbar) toolbar.appendChild(meter);
    }
    const pct = Math.min(100, Math.round((chars / CONTEXT_MAX_CHARS) * 100));
    const tokens = Math.round(chars / 4);
    const fill = document.getElementById('contextBarFill');
    const label = document.getElementById('contextBarLabel');
    if (fill) {
      fill.style.width = `${Math.max(1, pct)}%`;
      fill.className = 'context-bar-fill' + (pct >= 80 ? ' is-danger' : pct >= 50 ? ' is-warn' : '');
    }
    if (label) {
      label.textContent = tokens >= 1000 ? `~${Math.round(tokens / 1000)}k tokens` : `~${tokens} tokens`;
      label.title = `Context: ~${pct}% used (${Math.round(chars / 1000)}k chars, ~${Math.round(tokens / 1000)}k tokens of ~200k)`;
    }
    meter.hidden = chars < 500;
  }

  function confirmCompact() {
    const chatId = state.activeChatId;
    if (!chatId || state.generating) return;
    const warn = (state.historyChars || 0) >= CONTEXT_WARN_CHARS;
    const lines = [
      warn
        ? `This conversation is about ${Math.round((state.historyChars || 0) / 1000)}k characters and is likely close to Arena's context limit \u2014 that is when replies start coming back empty. Compact keeps you working in this same chat.`
        : "Compact keeps this chat going when Arena's context gets full.",
      "Your next message will open a fresh Arena session, seeded with a summary: the original task, files changed, and the most recent exchanges. The full transcript above stays here; on arena.ai the continuation appears as a new conversation."
    ];
    if (state.workspaceChosen) lines.push("The summary is also appended to MEMORY.md in the selected folder, so future chats in this project inherit it (Settings \u2192 Memory).");
    if (state.mode === 'battle' || state.mode === 'side-by-side') lines.push("Note: after compacting you can no longer vote on the last pair of replies.");
    mountModal({
      title: 'Compact conversation',
      content: el('div', {}, ...lines.map((text) => el('p', { class: 'modal-copy', text }))),
      actions: [
        { label: 'Cancel', variant: 'quiet' },
        { label: 'Compact', variant: 'primary', icon: 'compress', autofocus: true,
          onClick: async () => { await runCompact(chatId); } }
      ]
    });
  }

  async function runCompact(chatId) {
    const result = await API.compactChat(chatId);
    if (String(state.activeChatId) !== String(chatId)) return;
    state.historyChars = Number(result?.history_chars ?? result?.digest_chars ?? 0);
    const notice = result?.notice || "Context compacted \u2014 this conversation continues in a fresh Arena session with a summary of everything above.";
    state.messages.push({ user: null, lanes: {}, notices: [], error: null, round: null, divider: notice });
    renderMessages({ preserveScroll: false });
    syncCompactChip();
    toast(result?.memory_saved
      ? "Compacted. Your next message continues in a fresh session with a summary \u2014 also saved to MEMORY.md in the selected folder."
      : "Compacted. Your next message continues in a fresh session with a summary of everything so far.", 'success', "Compact");
  }

  function renderModeBars() {
    // Arena-style dropdown triggers in the composer toolbar (no segmented
    // bars). The work-type trigger is hidden while Agent Mode is selected.
    const locked = chatLocked();
    const busy = state.generating;
    if (els.modeButton) {
      const meta = modeMeta(state.mode);
      els.modeButton.disabled = busy;
      els.modeButton.title = locked ? 'Change mode' : meta.desc;
      const modeIconNode = els.modeButton.querySelector(':scope > .icon');
      if (modeIconNode) modeIconNode.innerHTML = icon(meta.icon);
    }
    if (els.modalityButton) {
      const hiddenForAgent = state.mode === 'agent';
      els.modalityButton.hidden = hiddenForAgent;
      els.modalityButton.disabled = busy || hiddenForAgent;
      els.modalityButton.title = locked
        ? 'Changing the work type starts a new chat'
        : modalityMeta(state.modality).desc;
    }
  }

  function renderModelStrip() {
    if (!els.modelStrip) return;
    clear(els.modelStrip);
    const mode = state.mode;
    if (mode === 'battle') {
      els.modelStrip.append(
        el('span', { class: 'model-pill' }, el('span', { class: 'lane-letter', text: 'A' }), el('span', { class: 'model-pill-label', text: "Model A" })),
        el('span', { class: 'model-pill' }, el('span', { class: 'lane-letter', text: 'B' }), el('span', { class: 'model-pill-label', text: "Model B" })),
        el('span', { class: 'model-strip-note', text: "Battle selects opponents randomly on the server" })
      );
      return;
    }
    if (mode === 'agent') {
      // Like arena.ai/agent: no model pill and no backend switch in the
      // composer. The Agent backend for NEW chats is chosen in Settings;
      // a started chat keeps the backend it was created with. As on
      // arena.ai, a started Agent chat shows a disabled "Auto" pill whose
      // tooltip says the selection can only change in a new chat.
      if (chatLocked()) {
        els.modelStrip.appendChild(el('span', {
          class: 'model-pill model-pill-locked', 'aria-disabled': 'true', tabindex: '0',
          title: 'Create a new chat to change the mode.'
        }, el('span', { class: 'model-pill-label', text: 'Auto' })));
      }
      return;
    }
    if (state.modelsLoading && !state.models.length) {
      els.modelStrip.appendChild(el('span', { class: 'loading-block' }, el('span', { class: 'mini-spinner' }), el('span', { text: "Loading model list…" })));
      return;
    }
    if (state.modelsError) {
      const retry = el('button', { class: 'model-pill model-pill-error', type: 'button', 'data-action': 'retry-models', title: state.modelsError },
        iconEl('alert'), el('span', { class: 'model-pill-label', text: "Models unavailable · retry" }));
      els.modelStrip.appendChild(retry);
      return;
    }

    const modelButton = (laneKey, modelId) => {
      const model = getModel(modelId);
      const label = model ? model.name : (laneKey === 'b' ? "Select model B" : "Select a model");
      const color = safeColor(model?.color) || '#b9cabd';
      return el('button', {
        class: `model-pill${model ? '' : ' model-pill-empty'}`, type: 'button',
        'data-model-picker': laneKey, 'aria-label': `Select a model ${laneKey.toUpperCase()}: ${label}`,
        disabled: state.generating
      },
        el('span', { class: 'lane-letter', text: laneKey.toUpperCase() }),
        model ? (modelIconNode(model) || el('span', { class: 'model-dot', style: { background: color } })) : el('span', { class: 'model-dot', style: { background: color } }),
        el('span', { class: 'model-pill-label', text: label }),
        iconEl('chevron-down')
      );
    };

    if (mode === 'side-by-side') {
      els.modelStrip.append(modelButton('a', state.modelAId), modelButton('b', state.modelBId));
    } else {
      els.modelStrip.appendChild(modelButton('a', state.modelAId));
    }

    if (state.modelsLoading) {
      els.modelStrip.appendChild(el('span', { class: 'model-strip-note' }, el('span', { class: 'mini-spinner' }), el('span', { text: "Refreshing" })));
    } else if (!state.models.length) {
      els.modelStrip.appendChild(el('span', { class: 'model-strip-note', text: "The server did not return models for this type." }));
    } else if (mode === 'agent') {
      els.modelStrip.appendChild(el('span', { class: 'model-strip-note', text: "Agent actions require permission" }));
    }
  }

  function renderModelsNavCount() {
    if (!els.modelsNavCount) return;
    const manual = allowsManualModels();
    els.modelsNavCount.textContent = manual && state.modelsLoading ? '…' : (manual && state.models.length ? String(state.models.length) : '—');
    if (els.modelsNavBtn) {
      els.modelsNavBtn.disabled = !manual;
      els.modelsNavBtn.title = manual ? "Select a model for the current mode and task type" : "In this mode, model selection is disabled";
      els.modelsNavBtn.setAttribute('aria-disabled', String(!manual));
    }
  }

  function renderComposerContext() {
    if (!els.contextMode) return;
    const isAgent = state.mode === 'agent';
    els.contextMode.textContent = modeMeta(state.mode).label;
    els.contextModality.textContent = modalityMeta(state.modality).label;
    // Like arena.ai, Agent Mode simply has no work-type selector (or label).
    els.contextModality.hidden = isAgent;
    if (els.contextModality.previousElementSibling) els.contextModality.previousElementSibling.hidden = isAgent;
    if (els.contextModel.previousElementSibling) els.contextModel.previousElementSibling.hidden = isAgent;
    els.contextModel.hidden = isAgent;
    if (state.mode === 'battle') {
      els.contextModel.textContent = 'Arena selects 2 models';
    } else if (state.mode === 'side-by-side') {
      els.contextModel.textContent = `${currentModelA()?.name || 'A not selected'} ↔ ${currentModelB()?.name || 'B not selected'}`;
    } else if (!isAgent) {
      els.contextModel.textContent = (state.mode === 'direct' && state.fanoutModels?.length >= 2)
        ? `${state.fanoutModels.length} models · fan-out`
        : (currentModelA()?.name || 'Select a model');
    }
    if (els.contextPending) els.contextPending.hidden = !(state.pendingChanges > 0);
  }

  function updateComposerState() {
    if (!els.prompt) return;
    const meta = modeMeta(state.mode);
    const mod = modalityMeta(state.modality);
    if (els.modeLabel) els.modeLabel.textContent = meta.label;
    if (els.modalityLabel) els.modalityLabel.textContent = mod.label;
    const modalityIconNode = els.modalityButton?.querySelector(':scope > .icon');
    if (modalityIconNode) modalityIconNode.innerHTML = icon(mod.icon);
    const permission = permissionMeta(state.permissionMode);
    if (els.permissionLabel) els.permissionLabel.textContent = permission.short;
    els.permissionButton?.classList.toggle('is-danger', state.permissionMode === 'bypassPermissions');
    els.permissionButton?.setAttribute('title', permission.desc);
    if (els.workspaceLabel) {
      els.workspaceLabel.textContent = state.workspace ? workspaceName() : "Choose folder";
      els.workspaceButton.title = state.workspace || "Working folder not selected";
    }
    renderComposerContext();
    maybeWarmGateway();
    renderModelStrip();
    renderModeBars();
    renderModelsNavCount();

    const text = els.prompt.value.trim();
    const busy = state.generating;
    const transitions = state.pendingChanges > 0;
    const noServer = Boolean(state.serverError) || state.networkOffline;
    const noAuth = state.status && state.authenticated === false;
    let disabledReason = '';
    const rateLimitLeft = Math.max(0, Math.ceil((state.rateLimitUntil - Date.now()) / 1000));
    if (busy) disabledReason = "Wait for the current generation to complete";
    else if (state.stopping) disabledReason = "Stopping generation";
    else if (transitions) disabledReason = "Applying settings";
    else if (noServer) disabledReason = "No connection to the local server";
    else if (state.historyLoading) disabledReason = "Loading dialogue history";
    else if (state.historyError) disabledReason = "History not loaded — please try again";
    else if (!isValidSelection(state.mode, state.modality)) disabledReason = selectionIssue(state.mode, state.modality);
    else if (attachmentsBusy()) disabledReason = "Uploading files…";
    else if (attachmentsFailed()) disabledReason = "Remove the failed file to send";
    else if (noAuth) disabledReason = "First, log in in a separate window or using cookies";
    else if (!text) disabledReason = "Enter a message";
    else if (!requiredModelsReady()) disabledReason = state.modelsLoading ? "Loading models"
      : state.modelsError ? "Models unavailable"
        : "Select a model";
    else if (state.pendingPermissions.some((item) => !item.chatId || String(item.chatId) === String(state.activeChatId))) disabledReason = "First, resolve the permission request in this chat";
    else if (state.generating) disabledReason = "Generation in progress";

    const send = els.sendButton;
    if (send) {
      // While this chat is generating, typed text can be queued instead:
      // Send becomes the queue button next to Stop.
      const canQueue = busy && Boolean(text) && !state.stopping && !state.starting;
      send.disabled = canQueue ? false : (Boolean(disabledReason) || state.starting);
      send.title = canQueue ? "Queue: send when the current answer finishes" : (disabledReason || "Send message");
      send.hidden = busy && !canQueue;
      send.classList.toggle('is-stopping', state.stopping);
    }
    if (els.stopButton) {
      els.stopButton.hidden = !busy;
      els.stopButton.disabled = state.stopping;
      const label = els.stopButton.querySelector('span:last-child');
      if (label) label.textContent = state.stopping ? "Stopping…" : "Stop";
    }
    if (els.attachButton) {
      const allowed = attachmentsAllowedHere();
      els.attachButton.disabled = busy || !allowed;
      els.attachButton.title = allowed ? `Attach files — ${attachmentHint()}` : 'Files cannot be attached in Web Search';
      els.attachButton.setAttribute('aria-label', allowed ? `Attach files. ${attachmentHint()}` : 'Attach files (unavailable in Web Search)');
    }
    if (els.fileInput) els.fileInput.accept = attachmentAccept();
    els.composerCard?.classList.toggle('is-generating', busy);
    els.composerCard?.setAttribute('aria-busy', String(busy));
    els.prompt.setAttribute('aria-label', `Message for models. ${meta.label}, ${mod.label}. ${disabledReason && !text ? disabledReason : ''}`);

    if (els.composerSecondaryHint) {
      if (state.demo) els.composerSecondaryHint.textContent = "Demo: no requests to arena.ai";
      else if (state.pendingChanges) els.composerSecondaryHint.textContent = "Waiting for settings to apply";
      else if (state.remoteBusy) els.composerSecondaryHint.textContent = "Server is busy with the current generation";
      else if (state.serverError) els.composerSecondaryHint.textContent = "No connection with the local server";
      else if (noAuth) els.composerSecondaryHint.textContent = "Not signed in";
      else if (!requiredModelsReady() && state.modelsError) els.composerSecondaryHint.textContent = "Models unavailable";
      else if (state.modelsLoading) els.composerSecondaryHint.textContent = "Loading models";
      else if (allowsManualModels() && !currentModelA()) els.composerSecondaryHint.textContent = "Select a model";
      else if (state.pendingPermissions.length) els.composerSecondaryHint.textContent = "Permission request exists";
      else els.composerSecondaryHint.textContent = "Attachments are not supported by the server";
    }

    syncRateLimitAccountHint(rateLimitLeft);
    renderUsageBar();
    const locked = chatLocked();
    syncWorkspaceSyncToggle();
    syncCompactChip();
    els.modeButton.disabled = busy;
    els.modalityButton.disabled = busy || state.mode === 'agent';
    els.permissionButton.disabled = busy || transitions;
    $$('[data-model-picker]', els.modelStrip || document).forEach((button) => { button.disabled = busy; });
    ensureBypassWarning();
  }

  function updatePendingPermissionsBadge() {
    if (!els.pendingPermissionsBadge) return;
    const count = Math.max(Number(state.permissionCount) || 0, state.pendingPermissions.length)
      + (state.pendingQuestions?.length || 0)
      + ((state.pendingMediaChoices || []).filter(mediaChoiceIsPending).length || 0);
    els.pendingPermissionsBadge.hidden = !count;
    els.pendingPermissionsBadge.textContent = String(count);
    els.pendingPermissionsBadge.title = `Awaiting your decision: ${count}`;
    els.pendingPermissionsBadge.setAttribute('aria-label', `Awaiting your decision: ${count}`);
  }

  function renderPendingPermissionsUI() {
    updatePendingPermissionsBadge();
    updateComposerState();
    if (state.view === 'chat') {
      scheduleChatRender();
    }
  }

  function resizePrompt() {
    if (!els.prompt) return;
    els.prompt.style.height = 'auto';
    const next = clamp(els.prompt.scrollHeight, 50, 190);
    els.prompt.style.height = `${next}px`;
    els.prompt.style.overflowY = els.prompt.scrollHeight > 190 ? 'auto' : 'hidden';
  }

  function resetPromptHeight() {
    if (!els.prompt) return;
    els.prompt.style.height = '';
    els.prompt.style.overflowY = 'hidden';
  }

  /* ---------------------------------------------------------------------- */
  /* Global UI state                                                       */
  /* ---------------------------------------------------------------------- */
  function dotState(node, tone) {
    if (!node) return;
    node.classList.remove('is-online', 'is-pending', 'is-offline', 'is-demo');
    if (tone) node.classList.add(`is-${tone}`);
  }

  function connectionPresentation() {
    if (state.demo) return { tone: 'demo', label: "Demo mode", title: "Demonstration data and events" };
    if (state.networkOffline) return { tone: 'offline', label: "Offline", title: "No network connection" };
    if (state.phase === 'loading' && !state.status) return { tone: 'pending', label: "Server check", title: "Checking local backend" };
    if (state.serverError) return { tone: 'offline', label: "Server unavailable", title: state.serverError };
    if (!state.backendReached) return { tone: 'pending', label: "No data", title: "Server status unknown" };
    if (state.loginPending) return { tone: 'pending', label: "Waiting for sign-in", title: "Complete login in a separate window" };
    if (state.status?.session_error) return { tone: 'offline', label: "Session error", title: String(textValue(state.status.session_error)) };
    if (state.status?.offline) return { tone: 'pending', label: "arena.ai offline", title: "Local backend is available, arena.ai page reports offline" };
    if (state.status && !state.authenticated) return { tone: 'pending', label: "Not signed in", title: "Log in in a separate window or using cookies" };
    return { tone: 'online', label: "Local server", title: "Local backend is available" };
  }

  function updateConnectionUI() {
    const presentation = connectionPresentation();
    const iconTone = presentation.tone === 'offline' ? 'offline' : presentation.tone === 'online' ? 'online' : presentation.tone === 'demo' ? 'demo' : 'pending';
    if (els.footerConnectionText) els.footerConnectionText.textContent = presentation.label;
    dotState(els.footerConnectionDot, iconTone);

    if (els.demoChip) els.demoChip.hidden = !state.demo;
    if (els.demoBanner) els.demoBanner.hidden = !state.demo;
    if (els.connectionBanner) {
      const show = !state.demo && (state.networkOffline || Boolean(state.serverError));
      els.connectionBanner.hidden = !show;
      if (show) {
        if (els.bannerTitle) els.bannerTitle.textContent = state.networkOffline ? "No network connection" : "Local server is unavailable";
        if (els.bannerText) {
          els.bannerText.textContent = state.networkOffline
            ? "The interface works locally, but the network is unavailable. Try again after the connection is restored."
            : (state.serverError || "Launch the Arena Desktop application and try again. Demo mode is available separately.");
        }
        if (els.bannerRetry) els.bannerRetry.disabled = state.retrying || state.networkOffline;
        if (els.bannerDemo) els.bannerDemo.hidden = state.demo;
      }
    }
    if (els.topbarTitle) els.topbarTitle.textContent = currentViewTitle();
  }

  function updateAccountUI() {
    let name;
    let sub;
    let avatarClass = '';
    if (state.demo) {
      name = state.authenticated ? (state.fullName || 'Demo User') : 'Not signed in';
      sub = state.authenticated ? 'Simulation · no tokens' : 'Demo mode';
      avatarClass = 'is-demo';
    } else if (state.authenticated) {
      // Before the arena.ai session finishes starting, show the saved account
      // and "Connecting" instead of a nameless "Connected / Signed in".
      const saved = (state.accounts || []).find((a) => a.id === state.currentAccountId || a.current) || {};
      const email = state.email || saved.email || '';
      name = state.fullName || email || 'arena.ai account';
      sub = engineStarting(state.status) ? 'Connecting to arena.ai…'
        : state.status?.session_error ? 'Session error' : state.status?.offline ? 'arena.ai offline'
        : (email && state.fullName ? email : 'Signed in');
      avatarClass = '';
    } else {
      name = state.serverError ? 'Server unavailable' : 'Not signed in';
      sub = state.serverError ? 'Check the local backend' : state.loginPending ? 'Waiting for sign-in…' : 'Sign in to continue';
      avatarClass = 'is-anonymous';
    }
    if (els.accountName) els.accountName.textContent = name;
    if (els.accountState) els.accountState.textContent = sub;
    if (els.accountAvatar) {
      els.accountAvatar.classList.toggle('is-anonymous', avatarClass === 'is-anonymous');
      els.accountAvatar.classList.toggle('is-demo', avatarClass === 'is-demo');
      if (state.demo && state.authenticated) {
        delete els.accountAvatar.dataset.avatarUrl;
        els.accountAvatar.textContent = 'D';
      } else {
        fillAvatarNode(els.accountAvatar);
      }
    }
    if (els.accountDot) {
      els.accountDot.classList.toggle('is-online', state.authenticated && !state.serverError);
      els.accountDot.classList.toggle('is-error', Boolean(state.serverError) || Boolean(state.status?.session_error));
    }
    if (els.accountButton) {
      els.accountButton.setAttribute('aria-label', `Profile: ${name}. ${sub}. Open accounts`);
      els.accountButton.setAttribute('aria-haspopup', 'menu');
    }
  }

  function updateAllUI() {
    syncWorkspacePanelVisibility();
    updateConnectionUI();
    updateAccountUI();
    updateComposerState();
    renderChats();
    renderModelsNavCount();
    updatePendingPermissionsBadge();
    updateTopbarTitle();
    if (state.view === 'chat') {
      renderChatHead();
      renderChallenge();
    }
  }

  function toast(message, kind = 'info', title = '', action = null) {
    if (!els.toastRoot) return;
    const iconName = kind === 'error' ? 'alert' : kind === 'warning' ? 'shield-alert' : kind === 'success' ? 'check' : 'info';
    const node = el('div', { class: `toast is-${kind}`, role: kind === 'error' ? 'alert' : 'status' });
    const actionButton = action && action.label ? el('button', {
      class: 'button toast-action', type: 'button',
      onclick: async () => { node.remove(); try { await action.run(); } catch (err) { toast(err?.message || String(err), 'error', title); } }
    }, el('span', { text: action.label })) : null;
    node.append(
      iconEl(iconName),
      el('div', { class: 'toast-copy' }, title ? el('strong', { text: title }) : null, el('span', { text: String(message || '') }), actionButton),
      el('button', {
        class: 'icon-button toast-close', type: 'button', 'aria-label': "Dismiss notification",
        onclick: () => node.remove()
      }, iconEl('x'))
    );
    els.toastRoot.appendChild(node);
    const items = $$('.toast', els.toastRoot);
    if (items.length > 3) items.slice(0, items.length - 3).forEach((item) => item.remove());
    window.setTimeout(() => {
      node.style.opacity = '0';
      node.style.transform = 'translateY(4px)';
      window.setTimeout(() => node.remove(), 220);
    }, action ? 20000 : (kind === 'error' ? 7500 : 5000));
  }

  // Offer to install a missing tool (Node.js, Python ...) the moment something needs it.
  const _componentPrompted = new Set();
  function promptComponentInstall(event) {
    const id = String(event?.component || '');
    if (!id || _componentPrompted.has(id)) return;
    _componentPrompted.add(id);
    const name = String(event.name || id);
    toast(`${event.reason || 'A command needs it'}. Install ${name} on this computer?`, 'warning', `${name} is not installed`, {
      label: `Install ${name}`,
      run: async () => {
        const res = await API.installComponent(id);
        if (res?.open_url) window.open(res.open_url, '_blank', 'noopener');
        toast(res?.already ? `${name} is already installed.` : `${name} installer started. Finish it, then retry the command.`, 'info', name);
        _componentPrompted.delete(id);
      }
    });
  }

  function tabNotice(message, kind = 'info', title = '') { toast(message, kind, title); }

  /* ---------------------------------------------------------------------- */
  /* History normalization                                                 */
  /* ---------------------------------------------------------------------- */
  function emptyLane(key, model = null) {
    return {
      modelId: model?.id || null,
      modelName: model?.name || (key === 'b' ? "Model B" : "Model A"),
      modelOrg: model?.org || '',
      modelColor: model?.color || '',
      text: '',
      reasoning: '',
      sources: [],
      media: [],
      mediaChoices: [],
      activities: [],
      permissions: [],
      notices: [],
      errors: [],
      artifacts: [],
      agentStages: [],
      streaming: false,
      done: false,
      stopped: false,
      error: false,
      demo: state.demo
    };
  }

  function normalizeHistory(raw) {
    const messages = Array.isArray(raw) ? raw : (Array.isArray(raw?.messages) ? raw.messages : []);
    const turns = [];
    let current = null;
    let assistantOrdinal = 0;

    const newTurn = (user = null) => {
      current = { user, lanes: {}, notices: [], error: null, round: null };
      turns.push(current);
      assistantOrdinal = 0;
      return current;
    };

    const addLane = (item, keyHint = null) => {
      if (!current) newTurn();
      let key = keyHint;
      if (!key) {
        const explicit = item.lane ?? (item.model === 'a' || item.model === 'b' ? item.model : null);
        if (explicit === 'a' || explicit === 'b') key = explicit;
        else if (state.mode === 'battle' || state.mode === 'side-by-side') key = assistantOrdinal % 2 === 0 ? 'a' : 'b';
        else key = 'a';
      }
      assistantOrdinal += 1;
      if (!current.lanes[key]) {
        const modelById = item.model_id ? getModel(item.model_id) : null;
        let providedName = item.model_name ?? item.name ?? null;
        if (!providedName && item.model && item.model !== 'a' && item.model !== 'b') providedName = item.model;
        current.lanes[key] = emptyLane(key, modelById);
        current.lanes[key].modelName = providedName || modelById?.name || (key === 'b' ? "Model B" : "Model A");
        current.lanes[key].modelOrg = modelById?.org || String(item.org_display ?? item.org ?? '');
        current.lanes[key].modelColor = modelById?.color || safeColor(item.color);
      }
      const lane = current.lanes[key];
      const text = textValue(item.content ?? item.text ?? item.message ?? '');
      if (text) lane.text += `${lane.text ? '\n\n' : ''}${text}`;
      if (item.reasoning) lane.reasoning += textValue(item.reasoning);
      if (Array.isArray(item.sources)) lane.sources.push(...item.sources.map(normalizeSource).filter(Boolean));
      if (Array.isArray(item.media)) lane.media.push(...item.media.map(normalizeMedia).filter(Boolean));
      const rawMediaChoices = item.media_choices ?? item.mediaChoices;
      if (Array.isArray(rawMediaChoices)) rawMediaChoices.forEach((choice) => upsertLaneMediaChoice(lane, choice));
      if (Array.isArray(item.tools)) item.tools.forEach((step) => {
        if (step?.media_choice || step?.mediaChoice) upsertLaneMediaChoice(lane, step.media_choice || step.mediaChoice);
      });
      if (Array.isArray(item.artifacts)) lane.artifacts.push(...item.artifacts.map((artifact) => normalizeArtifact(artifact)).filter(Boolean));
      if (Array.isArray(item.permissions)) lane.permissions.push(...item.permissions.map(normalizePermission).filter(Boolean));
      if (Array.isArray(item.notices)) lane.notices.push(...item.notices.map(textValue).filter(Boolean));
      if (Array.isArray(item.errors)) lane.errors.push(...item.errors.map(textValue).filter(Boolean));
      if (item.error) lane.errors.push(textValue(item.error));
      if (lane.errors.length) lane.error = true;
      lane.demo = lane.demo || Boolean(item.demo);
      lane.done = true;
      return lane;
    };

    for (const item of messages) {
      if (!item || typeof item !== 'object') continue;
      const role = String(item.role ?? item.type ?? '').toLowerCase();
      if (role === 'notice') {
        // Compaction marker: a divider between the old context and the
        // fresh Arena session that follows it.
        turns.push({ user: null, lanes: {}, notices: [], error: null, round: null,
                     divider: textValue(item.text ?? item.content ?? '') });
        current = null;
        assistantOrdinal = 0;
        continue;
      }
      if (role === 'user' || role === 'human') {
        const userText = textValue(item.content ?? item.text ?? item.message);
        const isSystemInjection = userText.startsWith('[Arena Desktop]') || userText.startsWith('[Arena Desktop memory');
        const isToolResult = /^Tool results:\n?\[?\d/m.test(userText);
        const isToolContinue = userText.startsWith('Continue the task.');
        if (isSystemInjection || isToolResult || isToolContinue) {
          if (!current) newTurn();
          current.notices.push(isSystemInjection ? '(system context)' : '(tool exchange)');
          continue;
        }
        newTurn({
          content: userText,
          created_at: item.created_at ?? item.createdAt ?? item.timestamp,
          attachments: normalizeUserAttachments(item.attachments || item.experimental_attachments)
        });
        continue;
      }
      if (role === 'assistant' || role === 'model' || role === 'ai' || (!role && (item.text || item.content))) {
        // The Flask backend persists both replies in a single assistant record.
        const hasBackendLanes = Object.prototype.hasOwnProperty.call(item, 'text_b');
        if (hasBackendLanes) {
          const laneErrors = item.lane_errors && typeof item.lane_errors === 'object' ? item.lane_errors : null;
          addLane({
            ...item,
            errors: Array.isArray(laneErrors?.a) ? laneErrors.a : item.errors,
            // A combined record's plain `error` is a whole-turn failure; do
            // not attribute it to Model A on reload.
            error: null,
            model_name: item.names?.a || item.model_name
          }, 'a');
          if (item.text_b || state.mode === 'battle' || state.mode === 'side-by-side') {
            addLane({
              ...item,
              content: undefined,
              text: item.text_b || '',
              reasoning: item.reasoning_b || '',
              sources: undefined,
              media: undefined,
              media_choices: undefined,
              mediaChoices: undefined,
              tools: undefined,
              artifacts: undefined,
              permissions: undefined,
              notices: undefined,
              errors: Array.isArray(laneErrors?.b) ? laneErrors.b : undefined,
              model_name: item.names?.b || null,
              error: null
            }, 'b');
          }
          if (item.error) current.error = textValue(item.error);
          current.msgEnd = messages.indexOf(item);
          if (item.checkpoints) current.checkpoints = item.checkpoints;
          current.vote = item.vote || null;
          current.arenaIds = item.arena_message_ids || null;
          current.revealed = Boolean(item.names?.a || item.names?.b);
          for (const step of (Array.isArray(item.tools) ? item.tools : [])) {
            const key = step.lane === 'b' ? 'b' : 'a';
            const lane = current.lanes[key] || (current.lanes[key] = emptyLane(key));
            const stepDetail = step.tool === 'ask_user' && step.question
              ? `${step.question}${step.answer ? `\n\u2192 ${step.answer}` : ''}`
              : (step.tool === 'propose_plan' && step.plan
                ? `${step.plan}${step.answer ? `\n\u2192 ${step.answer}` : ''}`
                : step.summary);
            const stepName = step.tool === 'ask_user' ? 'Question'
              : (step.tool === 'propose_plan' ? 'Plan'
                : (step.tool === 'generate_image' ? 'Generate image'
                  : (step.tool === 'set_todos' ? 'Checklist' : step.name)));
            const activity = normalizeActivity({ ...step, name: stepName, detail: stepDetail, status: step.status || (step.ok ? 'ok' : 'error') }, 'tool');
            if (activity) lane.activities.push(activity);
            if (step.media_choice || step.mediaChoice) {
              upsertLaneMediaChoice(lane, step.media_choice || step.mediaChoice);
            }
            if (step.tool === 'set_todos' && Array.isArray(step.todos) && step.todos.length) {
              const hid = String(raw?.chat_id || raw?.id || state.activeChatId || '');
              if (hid) state.chatTodos[hid] = step.todos;
            }
          }
          for (const step of (Array.isArray(item.sandbox) ? item.sandbox : [])) {
            const key = step.model === 'b' ? 'b' : 'a';
            const lane = current.lanes[key] || (current.lanes[key] = emptyLane(key));
            const activity = normalizeActivity({ ...step, status: step.ok === false ? 'error' : (step.ok === true ? 'done' : 'running') }, 'sandbox');
            if (activity) lane.activities.push(activity);
          }
          // Site previews (arena.site links) saved with the reply.
          if (Array.isArray(item.previews) && item.previews.length) {
            const lane = current.lanes.a || (current.lanes.a = emptyLane('a'));
            item.previews.forEach((url) => {
              const artifact = normalizeArtifact({ url, title: 'Site preview', name: 'Site preview' }, 'preview');
              if (artifact) lane.artifacts.push(artifact);
            });
          }
        } else {
          addLane(item);
          if (current) {
            current.msgEnd = messages.indexOf(item);
            if (item.checkpoints) current.checkpoints = item.checkpoints;
          }
        }
        continue;
      }
      if (role === 'system') {
        if (!current) newTurn();
        current.notices.push(textValue(item.content ?? item.text ?? item.message));
        continue;
      }
      if (role === 'tool') {
        if (!current) newTurn();
        addLane(item);
      }
    }

    const artifacts = [];
    turns.forEach((turn) => {
      Object.entries(turn.lanes).forEach(([laneKey, lane]) => {
        lane.artifacts.forEach((artifact) => {
          artifacts.push({ ...artifact, chatId: state.activeChatId, lane: laneKey });
        });
      });
    });
    state.artifacts = artifacts;
    return turns;
  }

  /* ---------------------------------------------------------------------- */
  /* Chat navigation and empty/error states                                */
  /* ---------------------------------------------------------------------- */
  async function openChat(chatId, { retry = false, skipRefresh = false } = {}) {
    if (!chatId) return;
    if (state.creatingChat) return;
    closePopover(false);
    closeMobileSidebar();
    if (String(state.activeChatId) !== String(chatId)) stashActiveTurns();
    saveComposerDraft();
    markChatSeen(chatId);
    const known = state.chats.find((chat) => chat.id === String(chatId));
    state.activeChatId = String(chatId);
    state.activeChatEvalId = known?.eval_id || null;
    state.activeChatSource = known?.source || 'local';
    restoreComposerDraft();
    syncGenerationState();
    const historyToken = (state.historyRequest || 0) + 1;
    state.historyRequest = historyToken;
    state.activeChatTitle = known?.title || (retry ? state.activeChatTitle : "Conversation");
    state.messages = [];
    state.artifacts = [];
    state.challenge = null;
    state.historyError = null;
    state.historyLoading = true;
    state.view = 'chat';
    resetChatProject();
    renderChats();
    renderChatHead();
    renderChallenge();
    renderMessages({ preserveScroll: false });
    setView('chat');
    if (els.content) els.content.scrollTop = 0;

    try {
      const chatRaw = await API.getChat(chatId);
      if (historyToken !== state.historyRequest || String(state.activeChatId) !== String(chatId)) return;
      const chat = normalizeChat(chatRaw);
      if (chat) {
        state.activeChatTitle = chat.title || state.activeChatTitle;
        state.activeChatEvalId = chat.eval_id || chat.raw?.eval_id || null;
        state.activeChatSource = chat.source || 'local';
        const selection = normalizeSelection(chat.mode || state.mode, chat.modality || state.modality);
        state.mode = selection.mode;
        state.modality = selection.modality;
        state.selectionTouched = true;
        void setupChatProject(String(chatId), String(selection.modality || ''));
        if (chat.agent_backend) state.agentKind = chat.agent_backend === 'arena' ? 'native' : 'local';
        // Each chat keeps the folder it worked in. Opening it switches back to
        // that folder, so "continue" never runs in the folder of whichever
        // chat was opened last.
        const chatFolder = typeof chat.raw?.workspace === 'string' ? chat.raw.workspace : '';
        if (chatFolder && chatFolder !== state.workspace && !chatIsGenerating(chatId)) {
          applyWorkspacePath(chatFolder)
            .then(() => toast(`Folder: ${chatFolder}`, 'info', "Switched to this chat's folder"))
            .catch(() => toast(`This chat worked in ${chatFolder}, which is not available now.`, 'warning', 'Folder missing'));
        }
        state.historyChars = Number(chat.raw?.history_chars || 0);
        // Restore manual selections saved by Flask only in modes where Arena
        // permits them.  Battle ignores ids and Agent never exposes one.
        if (allowsManualModels()) {
          if (Object.prototype.hasOwnProperty.call(chat.raw, 'model_a')) state.modelAId = chat.raw.model_a || null;
          if (Object.prototype.hasOwnProperty.call(chat.raw, 'model_b')) state.modelBId = chat.raw.model_b || null;
        } else {
          state.modelAId = null;
          state.modelBId = null;
        }
        const existing = state.chats.find((item) => item.id === chat.id);
        if (existing) Object.assign(existing, chat);
      }
      if (state.modelsMode !== state.mode || state.modelsModality !== state.modality
        || ((allowsManualModels() || state.mode === 'agent') && !state.models.length)) {
        void loadModels(state.modality, { quiet: true });
      } else {
        ensureModelSelections();
      }
      updateComposerState();
      const liveTurns = chatIsGenerating(chatId) ? state.chatTurns[String(chatId)] : null;
      if (Array.isArray(liveTurns) && liveTurns.length) {
        // This chat is generating right now: keep showing the live stream
        // instead of the server's last saved snapshot.
        state.messages = liveTurns;
      } else {
        const historyRaw = await API.getHistory();
        if (historyToken !== state.historyRequest || String(state.activeChatId) !== String(chatId)) return;
        state.messages = normalizeHistory(historyRaw);
        state.chatTurns[String(chatId)] = state.messages;
      }
      state.historyError = null;
      state.historyLoading = false;
      flushQueuedMessage(chatId);
      state.activeChatTitle = state.activeChatTitle || "Conversation";
      renderChats();
      updateTopbarTitle();
      renderChatHead();
      updateComposerState();
      renderMessages({ preserveScroll: false });
      syncGenerationState();
      void loadQuestions();
      void loadMediaChoices();
      if (!skipRefresh && state.activeChatEvalId && !chatIsGenerating(chatId)) {
        void refreshActiveChat({ silent: true, automatic: true });
      }
      announce(`Dialog “${state.activeChatTitle}” loaded.`);
    } catch (error) {
      if (historyToken !== state.historyRequest) return;
      state.historyLoading = false;
      state.historyError = errorMessage(error);
      updateComposerState();
      renderMessages({ preserveScroll: false });
      toast(state.historyError, 'error', "Dialog not loaded");
    }
  }

  async function createNewChat({ focus = true } = {}) {
    if (state.creatingChat) return null;
    if (state.serverError || state.networkOffline) {
      toast("Local server unavailable. New chat not created.", 'error', "No connection");
      return null;
    }
    state.creatingChat = true;
    els.newChatBtn?.classList.add('is-spinning');
    els.newChatBtn?.setAttribute('aria-busy', 'true');
    try {
      const raw = await API.newChat();
      const chatId = raw?.chat_id ?? raw?.id ?? raw?.chat?.id;
      if (!chatId) throw new ApiError("The server did not return the new chat ID.");
      stashActiveTurns();
      saveComposerDraft();
      state.activeChatId = String(chatId);
      state.activeChatEvalId = null;
      state.activeChatSource = 'local';
      restoreComposerDraft();
      state.activeChatTitle = String(raw?.title ?? raw?.chat?.title ?? "New chat");
      state.messages = [];
      state.artifacts = [];
      state.historyError = null;
      state.historyLoading = false;
      state.challenge = null;
      state.view = 'chat';
      renderChatArea();
      syncGenerationState();
      closeMobileSidebar();
      void loadChats({ silent: true });
      if (focus) window.setTimeout(focusComposer, 20);
      announce("New chat created.");
      return state.activeChatId;
    } catch (error) {
      toast(errorMessage(error), 'error', "New chat not created");
      return null;
    } finally {
      state.creatingChat = false;
      els.newChatBtn?.classList.remove('is-spinning');
      els.newChatBtn?.removeAttribute('aria-busy');
      updateComposerState();
      updateTopbarTitle();
    }
  }

  function confirmDeleteChat(chatId) {
    const chat = state.chats.find((item) => item.id === String(chatId));
    if (!chat) return;
    const error = el('p', { class: 'form-error', role: 'alert' });
    const result = mountModal({
      title: "Delete chat?",
      subtitle: "Action confirmation",
      size: 'small',
      content: el('div', {},
        el('p', { class: 'modal-copy', text: `Chat “${chat.title}” will be deleted here and archived on arena.ai, so it disappears from both histories. This cannot be undone here.` }),
        el('div', { class: 'note-box is-warning' }, iconEl('alert'), el('span', { text: "Archived chats can still be found under Archived on arena.ai." })),
        error),
      actions: [
        { label: "Cancel", variant: 'quiet', autofocus: true },
        {
          label: "Delete", variant: 'danger',
          onClick: async ({ button }) => {
            button.disabled = true;
            try {
              const outcome = await API.deleteChat(chatId);
              state.chats = state.chats.filter((item) => item.id !== String(chatId));
              state.cloudChats = (state.cloudChats || []).filter((item) =>
                String(item.local_chat_id || '') !== String(chatId)
                && (!chat.eval_id || String(item.eval_id || item.id || '') !== String(chat.eval_id)));
              if (String(state.activeChatId) === String(chatId)) {
                state.activeChatId = null;
                state.activeChatTitle = '';
                state.messages = [];
                state.artifacts = [];
                state.historyError = null;
                state.historyLoading = false;
                state.challenge = null;
                updateArtifactCount();
                renderWelcomeState();
                updateComposerState();
              }
              renderChats();
              if (outcome?.arena === 'archived') {
                toast(`Chat “${chat.title}” deleted and archived on Arena.`, 'success');
              } else if (outcome?.arena === 'failed' || outcome?.arena === 'skipped') {
                toast(outcome.arena_error || 'Deleted here, but it could not be archived on Arena.', 'warning', 'Deleted here only');
              } else {
                toast(`Chat “${chat.title}” deleted.`, 'success');
              }
              void loadChats({ silent: true });
              return true;
            } catch (apiError) {
              error.textContent = errorMessage(apiError);
              button.disabled = false;
              return false;
            }
          }
        }
      ]
    });
    return result;
  }

  function confirmArchiveCloudChat(entry) {
    if (!entry) return;
    const sessionId = entry.eval_id || entry.id;
    const error = el('p', { class: 'form-error', role: 'alert' });
    return mountModal({
      title: "Delete chat?",
      subtitle: "Action confirmation",
      size: 'small',
      content: el('div', {},
        el('p', { class: 'modal-copy', text: `Chat “${entry.title}” will be archived on arena.ai and disappear from the history here and on the website.` }),
        el('div', { class: 'note-box is-warning' }, iconEl('alert'), el('span', { text: "Archived chats can still be found under Archived on arena.ai." })),
        error),
      actions: [
        { label: "Cancel", variant: 'quiet', autofocus: true },
        {
          label: "Delete", variant: 'danger',
          onClick: async ({ button }) => {
            button.disabled = true;
            try {
              await API.archiveArenaChat(sessionId, entry.type || 'evaluation');
              state.cloudChats = (state.cloudChats || []).filter((item) =>
                String(item.eval_id || item.id || '') !== String(sessionId));
              renderChats();
              toast(`Chat “${entry.title}” archived on Arena.`, 'success');
              void loadChats({ silent: true });
              return true;
            } catch (apiError) {
              error.textContent = errorMessage(apiError);
              button.disabled = false;
              return false;
            }
          }
        }
      ]
    });
  }

  /* ---------------------------------------------------------------------- */
  /* Mode, modality and permission transitions                             */
  /* ---------------------------------------------------------------------- */
  function queueTransition(task) {
    state.pendingChanges += 1;
    updateComposerState();
    const run = state.transitionQueue.then(task);
    state.transitionQueue = run.then(() => undefined, () => undefined).finally(() => {
      state.pendingChanges = Math.max(0, state.pendingChanges - 1);
      updateComposerState();
    });
    return run;
  }

  async function changeMode(nextMode) {
    if (!VALID_MODES.includes(nextMode) || nextMode === state.mode) return true;
    if (state.generating) {
      toast('Stop the current generation first.', 'warning', 'Mode not changed');
      return false;
    }
    // Like arena.ai: choosing another mode inside a started chat opens a
    // new chat in that mode; the started chat stays as it was.
    if (chatLocked() && !(await createNewChat())) return false;
    // Picking a mode never requires fixing the work type first. Agent runs
    // as Text with the work-type selector hidden; leaving Agent restores
    // the work type that was selected before it.
    const beforeModality = state.modality;
    if (nextMode === 'agent' && state.mode !== 'agent') state.savedModality = state.modality;
    const desiredModality = state.mode === 'agent' && nextMode !== 'agent'
      ? (state.savedModality || state.modality)
      : state.modality;
    const pair = normalizeSelection(nextMode, desiredModality);
    try {
      await queueTransition(async () => {
        const response = await API.setMode(nextMode);
        state.mode = validMode(response?.mode) || pair.mode;
        const responseModality = validModality(response?.modality);
        state.modality = responseModality || beforeModality;
        if (pair.modality !== state.modality) {
          // The mode endpoint normalizes against the backend's current
          // modality (Text while Agent was active). Restoring the saved
          // pre-Agent work type is a second, explicit step.
          const modalityResponse = await API.setModality(pair.modality);
          state.modality = validModality(modalityResponse?.modality) || pair.modality;
        }
        state.selectionTouched = true;
        state.modelAId = null;
        state.modelBId = null;
        await loadModels(state.modality, { quiet: true });
      });
      ensureModelSelections();
      pruneAttachmentsForSelection();
      updateComposerState();
      renderChatHead();
      renderModelStrip();
      announce(`Mode: ${modeMeta(state.mode).label}`);
      return true;
    } catch (error) {
      toast(errorMessage(error), 'error', 'Could not change the mode');
      updateComposerState();
      return false;
    }
  }

  async function changeModality(nextModality) {
    if (!VALID_MODALITIES.includes(nextModality) || nextModality === state.modality) return true;
    if (state.mode === 'agent') return true; // no work-type selector in Agent Mode
    const issue = selectionIssue(state.mode, nextModality);
    if (issue) {
      toast(issue, 'warning', 'Combination not available in Arena');
      return false;
    }
    if (state.generating) {
      toast('Stop the current generation first.', 'warning', 'Work type not changed');
      return false;
    }
    if (chatLocked()) {
      // arena.ai asks first, then opens a new chat for the new modality.
      mountModal({
        title: 'Start new chat session?',
        size: 'small',
        content: el('p', { class: 'modal-copy',
          text: 'Changing modalities will start a new chat session. Your current session will be saved in your chat history.' }),
        actions: [
          { label: 'Cancel', variant: 'quiet' },
          { label: 'Continue', variant: 'primary', autofocus: true,
            onClick: async () => {
              if (await createNewChat()) await changeModality(nextModality);
            } }
        ]
      });
      return false;
    }
    const previous = state.modality;
    let serverChanged = false;
    try {
      await queueTransition(async () => {
        const response = await API.setModality(nextModality);
        serverChanged = true;
        state.modality = validModality(response?.modality) || nextModality;
        state.selectionTouched = true;
        state.modelAId = null;
        state.modelBId = null;
        await loadModels(state.modality, { quiet: true });
      });
      state.savedModality = state.modality;
      pruneAttachmentsForSelection();
      updateComposerState();
      renderChatHead();
      announce(`Work type: ${modalityMeta(state.modality).label}`);
      return true;
    } catch (error) {
      if (!serverChanged) state.modality = previous;
      updateComposerState();
      toast(errorMessage(error), 'error', 'Could not change the work type');
      return false;
    }
  }

  async function changePermissionMode(nextMode) {
    if (!VALID_PERMISSION_MODES.includes(nextMode) || nextMode === state.permissionMode) return true;
    try {
      await queueTransition(async () => {
        const response = await API.setPermissionMode(nextMode);
        state.permissionMode = validPermissionMode(response?.mode) || nextMode;
      });
      if (state.permissionMode === 'bypassPermissions') {
        toast("Permission bypass enabled. The backend can perform actions without confirmation. Use only in an isolated environment.", 'warning', "Dangerous mode");
      } else {
        toast(`Permission mode: ${permissionMeta(state.permissionMode).label}.`, 'success');
      }
      updateComposerState();
      state.settingsRerender?.();
      return true;
    } catch (error) {
      toast(errorMessage(error), 'error', "Permission mode not changed");
      state.settingsRerender?.();
      return false;
    }
  }

  /* ---------------------------------------------------------------------- */
  /* Model selection                                                       */
  /* ---------------------------------------------------------------------- */
  const RECENT_MODELS_KEY = 'arena-recent-models-v1';

  function recentModelIds() {
    try {
      const raw = JSON.parse(localStorage.getItem(RECENT_MODELS_KEY) || '[]');
      return Array.isArray(raw) ? raw.map(String) : [];
    } catch { return []; }
  }

  function noteRecentModel(id) {
    if (id == null) return;
    try {
      const ids = [String(id), ...recentModelIds().filter((x) => x !== String(id))].slice(0, 6);
      localStorage.setItem(RECENT_MODELS_KEY, JSON.stringify(ids));
    } catch { /* storage unavailable */ }
  }

  function selectModel(lane, modelId) {
    if (!allowsManualModels()) return false;
    // Direct and Side by Side may swap models between messages on arena.ai.
    const model = getModel(modelId);
    if (!model) return false;
    if (lane === 'b') {
      if (String(modelId) === String(state.modelAId)) {
        toast("For comparison, select a model different from model A.", 'warning', "Two different models required");
        return false;
      }
      state.modelBId = modelId;
    } else {
      state.modelAId = modelId;
    }
    if (state.mode === 'side-by-side' && lane === 'a' && String(state.modelBId) === String(modelId)) {
      const candidate = state.models.find((item) => String(item.id) !== String(modelId));
      state.modelBId = candidate?.id || null;
    }
    noteRecentModel(modelId);
    updateComposerState();
    renderChatHead();
    announce(`Model ${lane.toUpperCase()}: ${model.name}`);
    return true;
  }

  /* ---------------------------------------------------------------------- */
  /* Permission decisions                                                  */
  /* ---------------------------------------------------------------------- */
  function findPermissionLane(id) {
    if (!id) return null;
    for (const turn of state.messages) {
      for (const lane of Object.values(turn.lanes || {})) {
        const permission = (lane.permissions || []).find((item) => String(item.id) === String(id));
        if (permission) return { turn, lane, permission };
      }
    }
    return null;
  }

  async function decidePermission(permissionId, decision) {
    if (!permissionId) {
      toast("The server did not provide a permission ID. Action unavailable.", 'error');
      return;
    }
    if (state.decidingPermissions.has(String(permissionId))) return;
    const local = state.pendingPermissions.find((item) => String(item.id) === String(permissionId));
    const located = findPermissionLane(permissionId);
    if (!local && !located) return;
    state.decidingPermissions.add(String(permissionId));
    renderPendingPermissionsUI();
    if (state.view === 'chat') renderMessages();
    try {
      await API.decidePermission(permissionId, decision);
      const laneRecord = located || findPermissionLane(permissionId);
      if (laneRecord?.lane) {
        const permission = laneRecord.permission || laneRecord.lane.permissions.find((item) => String(item.id) === String(permissionId));
        if (permission) permission.status = decision;
      }
      state.pendingPermissions = state.pendingPermissions.filter((item) => String(item.id) !== String(permissionId));
      state.permissionCount = state.pendingPermissions.length;
      const label = decision === 'deny' ? "Action denied." : decision === 'always' ? "Category allowed for the current session." : "Allowed once.";
      toast(label, decision === 'deny' ? 'warning' : 'success', "Permission decision");
      announce(label);
    } catch (error) {
      toast(errorMessage(error), 'error', "Decision not sent");
    } finally {
      state.decidingPermissions.delete(String(permissionId));
      renderPendingPermissionsUI();
      if (state.view === 'chat') renderMessages();
      state.settingsRerender?.();
    }
  }

  /* ---------------------------------------------------------------------- */
  // ═══ 10-stream.js ═══
  /* Stream generation                                                      */
  /* ---------------------------------------------------------------------- */
  function turnLane(turn, key, event = {}) {
    if (!turn.lanes[key]) {
      const rawModel = event.model && typeof event.model === 'object' ? event.model : null;
      turn.lanes[key] = emptyLane(key, rawModel ? normalizeModel(rawModel) : null);
    }
    return turn.lanes[key];
  }

  function eventLaneKey(event) {
    return event?.model === 'b' || event?.lane === 'b' ? 'b' : 'a';
  }

  function addArtifactRecord(artifact, laneKey) {
    if (!artifact) return;
    const key = `${artifact.kind}:${artifact.path || artifact.url || artifact.name}`;
    if (state.artifacts.some((item) => `${item.kind}:${item.path || item.url || item.name}` === key)) return;
    state.artifacts.push({ ...artifact, chatId: state.activeChatId, lane: laneKey });
    updateArtifactCount();
  }

  function addActivity(turn, lane, event, kind) {
    const activity = normalizeActivity(event, kind);
    if (!activity) return null;
    const id = activity.id;
    const existing = lane.activities.find((item) => String(item.id) === String(id));
    if (existing) {
      Object.assign(existing, { status: activity.status, detail: activity.detail || existing.detail, command: activity.command || existing.command, path: activity.path || existing.path, url: activity.url || existing.url, output: activity.output || existing.output });
      // The complete call replaces the empty first one; the row keeps its place in the text.
      const at = existing.raw && Number.isFinite(existing.raw.at) ? existing.raw.at : activity.raw.at;
      existing.raw = { ...(existing.raw || {}), ...activity.raw, at };
      return existing;
    }
    lane.activities.push(activity);
    return activity;
  }

  function handleStreamEvent(event, generation) {
    if (!event || typeof event !== 'object') return;
    const type = String(event.type || '').toLowerCase();
    const turn = generation.turn;
    if (type === 'ping') return;
    if (type === 'meta') {
      const rawModels = event.models ?? event.data?.models;
      const normalizeMetaModel = (value) => {
        if (!value) return null;
        if (typeof value === 'string') {
          const known = getModel(value);
          return known || { id: value, name: value, org: '', color: '', capabilities: [] };
        }
        return normalizeModel(value);
      };
      let metaModels = {};
      if (Array.isArray(rawModels)) {
        metaModels.a = normalizeMetaModel(rawModels[0]);
        metaModels.b = normalizeMetaModel(rawModels[1]);
      } else if (rawModels && typeof rawModels === 'object') {
        metaModels.a = normalizeMetaModel(rawModels.a);
        metaModels.b = normalizeMetaModel(rawModels.b);
      } else {
        metaModels.a = normalizeMetaModel(event.model_a);
        metaModels.b = normalizeMetaModel(event.model_b);
      }
      if (event.name && metaModels.a && !metaModels.a.name) metaModels.a.name = String(event.name);
      if (event.model_name_a || event.model_name_b) {
        if (!metaModels.a) metaModels.a = { id: 'a', name: String(event.model_name_a || "Model A"), org: '', color: '', capabilities: [] };
        else if (event.model_name_a) metaModels.a.name = String(event.model_name_a);
        if (event.model_name_b) {
          if (!metaModels.b) metaModels.b = { id: 'b', name: String(event.model_name_b), org: '', color: '', capabilities: [] };
          else metaModels.b.name = String(event.model_name_b);
        }
      }
      // The existing backend emits names as {a, b}, not a models array.
      if (event.names?.a && !metaModels.a) metaModels.a = { id: 'a', name: String(event.names.a), org: '', color: '', capabilities: [] };
      if (event.names?.b && !metaModels.b) metaModels.b = { id: 'b', name: String(event.names.b), org: '', color: '', capabilities: [] };
      const activeModel = event.model_id ? normalizeModel(event.model_id) : null;
      const modelA = metaModels.a || activeModel;
      if (modelA) {
        const lane = turnLane(turn, 'a');
        lane.modelId = modelA.id;
        lane.modelName = modelA.name;
        lane.modelOrg = modelA.org;
        lane.modelColor = modelA.color;
      }
      if (metaModels.b) {
        const lane = turnLane(turn, 'b');
        lane.modelId = metaModels.b.id;
        lane.modelName = metaModels.b.name;
        lane.modelOrg = metaModels.b.org;
        lane.modelColor = metaModels.b.color;
        lane.streaming = true;
      }
      if (event.mode) turn.mode = event.mode;
      if (event.modality) turn.modality = event.modality;
      if (event.chat_id && !state.activeChatId) state.activeChatId = String(event.chat_id);
      void setupChatProject(String(event.chat_id || generation.chatId || ''), String(event.modality || turn.modality || ''));
      if (!generation._chatsReloaded) {
        // The backend has saved this chat by now (it does so before the
        // stream starts), so refresh the sidebar with the real entry.
        generation._chatsReloaded = true;
        void loadChats({ silent: true });
      }
      scheduleChatRender();
      return;
    }

    const key = eventLaneKey(event);
    const lane = turnLane(turn, key, event);

    if (type === 'text_replace') {
      // The stream broke and the server read the finished reply from
      // arena.ai's copy of the chat: it replaces what had streamed so far.
      lane.text = textValue(event.text ?? '');
      clearRetryNote(lane);
      scheduleChatRender();
      return;
    }
    if (type === 'text' || type === 'message') {
      const delta = textValue(event.text ?? event.delta ?? event.content ?? '');
      if (delta) {
        lane.text += delta;
        clearRetryNote(lane);
      }
      if (event.model_id && !lane.modelId) {
        const model = normalizeModel(event.model_id);
        if (model) {
          lane.modelId = model.id;
          lane.modelName = model.name;
          lane.modelOrg = model.org;
          lane.modelColor = model.color;
        }
      }
      scheduleChatRender();
      return;
    }
    if (type === 'reasoning') {
      const delta = textValue(event.text ?? event.delta ?? event.reasoning ?? '');
      if (delta) lane.reasoning += delta;
      scheduleChatRender();
      return;
    }
    if (type === 'source') {
      const payload = Array.isArray(event.sources) ? event.sources : [event.source ?? event.data ?? event];
      payload.forEach((item) => {
        const source = normalizeSource(item);
        if (source) lane.sources.push(source);
      });
      scheduleChatRender();
      return;
    }
    if (type === 'media') {
      const payload = Array.isArray(event.media) ? event.media : [event.media ?? event.data ?? event];
      payload.forEach((item) => {
        const media = normalizeMedia(item);
        if (media) lane.media.push(media);
      });
      scheduleChatRender();
      return;
    }
    if (type === 'media_choice') {
      const rawChoice = event.media_choice && typeof event.media_choice === 'object' ? event.media_choice : event;
      const choice = upsertLaneMediaChoice(lane, {
        ...rawChoice,
        id: event.id || rawChoice.id,
        tool_call_id: event.tool_call_id || rawChoice.tool_call_id || rawChoice.toolCallId,
        chat_id: event.chat_id || generation.chatId || rawChoice.chat_id || rawChoice.chatId
      });
      if (choice && mediaChoiceIsPending(choice)) {
        const pendingIndex = state.pendingMediaChoices.findIndex((item) => sameMediaChoice(item, choice));
        if (pendingIndex >= 0) state.pendingMediaChoices[pendingIndex] = choice;
        else state.pendingMediaChoices.push(choice);
        if (String(choice.chatId || generation.chatId) !== String(state.activeChatId)) {
          toast('Arena Agent is waiting for an image choice in another chat.', 'warning', 'Image choice');
        } else {
          announce('Arena Agent generated image options. Choose one to continue.');
        }
      }
      updatePendingPermissionsBadge();
      scheduleChatRender();
      return;
    }
    if (type === 'media_choice_done') {
      const rawChoice = event.media_choice && typeof event.media_choice === 'object' ? event.media_choice : event;
      const choice = upsertLaneMediaChoice(lane, {
        ...rawChoice,
        id: rawChoice.id || event.id,
        tool_call_id: event.tool_call_id || rawChoice.tool_call_id || rawChoice.toolCallId,
        chat_id: event.chat_id || generation.chatId || rawChoice.chat_id || rawChoice.chatId
      });
      state.pendingMediaChoices = state.pendingMediaChoices.filter((item) => !sameMediaChoice(item, choice || {
        id: event.id, toolCallId: event.tool_call_id || ''
      }));
      updatePendingPermissionsBadge();
      scheduleChatRender();
      return;
    }
    if (type === 'media_reveal') {
      applyMediaReveal(lane, event);
      scheduleChatRender();
      return;
    }
    if (type === 'tool_call') {
      addActivity(turn, lane, event, 'tool');
      scheduleChatRender();
      return;
    }
    if (type === 'tool_result') {
      if (/write|edit|patch|create|delete|remove|move|rename|mkdir|bash|shell|command|run/i.test(String(event.tool || event.name || ''))) {
        scheduleWorkspaceTreeRefresh();
      }
      const id = event.id ?? event.tool_call_id ?? event.call_id;
      // Backend tool_result has no call id: match the most recent pending call by tool.
      const existing = id ? lane.activities.find((item) => String(item.id) === String(id)) :
        [...lane.activities].reverse().find((item) => item.kind === 'tool'
          && (item.tool === event.tool || item.name === event.tool)
          && (!item.status || item.status === 'running' || item.status === 'pending'));
      const output = textValue(event.output ?? event.result ?? event.text ?? event.message ?? '');
      if (existing) {
        existing.status = event.status || 'ok';
        // Keep the call's input (command, path) and its result apart: the
        // row shows the input in its title and the result underneath.
        if (output) existing.output = output;
      } else {
        addActivity(turn, lane, { ...event, name: event.name || "Tool result", output, status: event.status || 'ok' }, 'tool');
      }
      scheduleChatRender();
      return;
    }
    if (type === 'component_missing') {
      promptComponentInstall(event);
      return;
    }
    if (type === 'tool_progress') {
      const id = event.id ?? event.tool_call_id;
      const existing = id ? lane.activities.find((item) => String(item.id) === String(id))
        : [...lane.activities].reverse().find((item) => item.kind === 'tool' && item.status === 'running');
      if (existing) {
        existing.output = textValue(event.output ?? '');
        scheduleChatRender();
      }
      return;
    }
    if (type === 'subagent') {
      const act = [...lane.activities].reverse().find((item) => item.raw?.child_id && String(item.raw.child_id) === String(event.child_id));
      if (act) {
        act.raw = { ...act.raw, model_name: event.model_name || act.raw.model_name, mode: event.mode || act.raw.mode };
        if (event.status === 'started' && event.task) act.detail = event.task;
        if (event.status === 'tool' && event.summary) {
          act.detail = `${act.detail ? act.detail + '\n' : ''}\u2022 ${event.summary}`.slice(-2400);
        }
      }
      scheduleChatRender();
      return;
    }
    if (type === 'question') {
      const q = {
        id: String(event.id), chatId: event.chat_id || generation.chatId, lane: key,
        question: textValue(event.question),
        options: Array.isArray(event.options) ? event.options.map(textValue).filter(Boolean) : [],
        custom: event.custom !== false, subagent: event.subagent || null,
        kind: event.kind === 'plan' ? 'plan' : 'question', plan: textValue(event.plan)
      };
      if (!state.pendingQuestions.some((x) => x.id === q.id)) state.pendingQuestions.push(q);
      updatePendingPermissionsBadge();
      if (String(q.chatId) !== String(state.activeChatId)) {
        toast(q.kind === 'plan' ? 'The model proposed a plan in another chat.' : 'The model is asking a question in another chat.', 'warning', q.kind === 'plan' ? 'Plan' : 'Question');
      } else {
        announce(q.kind === 'plan' ? 'The model proposed a plan. Review it to continue.' : 'The model asks a question. Your answer is needed.');
      }
      scheduleChatRender();
      return;
    }
    if (type === 'todos') {
      const tchat = String(event.chat_id || generation.chatId || '');
      if (tchat && Array.isArray(event.items)) {
        state.chatTodos[tchat] = event.items.map((it) => ({
          text: textValue(it?.text),
          status: it?.status === 'done' ? 'done' : (it?.status === 'doing' ? 'doing' : 'pending')
        })).filter((it) => it.text);
      }
      scheduleChatRender();
      return;
    }
    if (type === 'question_done') {
      state.pendingQuestions = state.pendingQuestions.filter((x) => x.id !== String(event.id));
      updatePendingPermissionsBadge();
      scheduleChatRender();
      return;
    }
    if (type === 'permission') {
      const permissionPayload = event.permission ?? event.data ?? event;
      const permission = normalizePermission(event.permission || event.data ? { ...event, ...permissionPayload } : event);
      if (!permission) return;
      permission.lane = key;
      if (!permission.chatId && generation.chatId) permission.chatId = generation.chatId;
      if (permission.id) {
        const existingGlobal = state.pendingPermissions.find((item) => String(item.id) === String(permission.id));
        if (existingGlobal) Object.assign(existingGlobal, permission);
        else state.pendingPermissions.push(permission);
        state.permissionCount = Math.max(state.permissionCount, state.pendingPermissions.length);
      }
      if (!lane.permissions.some((item) => permission.id && String(item.id) === String(permission.id))) lane.permissions.push(permission);
      updatePendingPermissionsBadge();
      announce("New permission request. Your decision is needed.");
      toast(permission.title || "Permission request", 'warning', "Decision required");
      scheduleChatRender();
      return;
    }
    if (type === 'permission_done') {
      const id = event.id ?? event.permission_id;
      const decision = String(event.decision ?? event.status ?? 'done');
      state.pendingPermissions = state.pendingPermissions.filter((item) => String(item.id) !== String(id));
      state.permissionCount = state.pendingPermissions.length;
      // The reply's own turn too: it is not in state.messages while another
      // chat is open.
      [...state.messages, turn].forEach((messageTurn) => {
        Object.values(messageTurn?.lanes || {}).forEach((messageLane) => {
          (messageLane.permissions || []).forEach((permission) => {
            if (id && String(permission.id) === String(id)) permission.status = decision;
          });
        });
      });
      updatePendingPermissionsBadge();
      scheduleChatRender();
      state.settingsRerender?.();
      return;
    }
    if (type === 'file_preview') {
      if (event.html && event.path) {
        const artifact = normalizeArtifact({
          path: event.path,
          name: event.path.split('/').pop(),
          title: event.path.split('/').pop(),
          url: previewLink(event.path),
          note: 'Live HTML preview'
        }, 'preview');
        if (artifact) {
          lane.artifacts.push(artifact);
          addArtifactRecord(artifact, key);
        }
      }
      scheduleChatRender();
      return;
    }
    if (type === 'sandbox' || type === 'sandbox_done') {
      scheduleChatProjectRefresh();
      addActivity(turn, lane, {
        ...event,
        name: event.title ?? event.name ?? (event.status === 'done' ? "Sandbox completed" : "Sandbox"),
        status: type === 'sandbox_done' ? (event.ok === false ? 'error' : 'done') : (event.status || 'running'),
        detail: event.note ?? event.message ?? event.detail ?? ''
      }, 'sandbox');
      if (type === 'sandbox' && event.path && (event.verb === 'Edited' || event.verb === 'Created')) {
        const ext = (event.path || '').split('.').pop().toLowerCase();
        if (['html', 'htm', 'css', 'js'].includes(ext)) {
          setTimeout(refreshAllHtmlPreviews, 300);
        }
      }
      scheduleChatRender();
      return;
    }
    if (type === 'webdev') {
      addActivity(turn, lane, {
        ...event,
        name: event.title ?? "Web development",
        status: event.status || 'running',
        detail: event.message ?? event.description ?? event.output ?? event.url ?? ''
      }, 'webdev');
      if (event.url) {
        const artifact = normalizeArtifact({ ...event, title: event.title ?? "Preview" }, 'preview');
        if (artifact) {
          lane.artifacts.push(artifact);
          addArtifactRecord(artifact, key);
        }
      }
      scheduleChatRender();
      return;
    }
    if (type === 'files_written' || type === 'files') {
      scheduleChatProjectRefresh();
      const list = Array.isArray(event.files) ? event.files : Array.isArray(event.data) ? event.data : Array.isArray(event.paths) ? event.paths : [];
      list.forEach((file) => {
        const artifact = normalizeArtifact(file, 'file');
        if (!artifact) return;
        lane.artifacts.push(artifact);
        addArtifactRecord(artifact, key);
      });
      if (list.length) scheduleWorkspaceTreeRefresh();
      scheduleChatRender();
      return;
    }
    if (type === 'preview') {
      const previewData = event.preview && typeof event.preview === 'object' ? event.preview : event;
      const artifact = normalizeArtifact({
        path: previewData.path ?? previewData.title ?? '',
        name: previewData.title ?? "Preview",
        title: previewData.title ?? "Preview",
        url: previewData.url ?? previewData.preview_url ?? event.url ?? '',
        note: "Link from preview event"
      }, 'preview');
      if (artifact) {
        lane.artifacts.push(artifact);
        addArtifactRecord(artifact, key);
      }
      scheduleChatRender();
      return;
    }
    if (type === 'agent') {
      const stage = textValue(event.stage ?? event.status ?? event.message ?? '');
      if (stage && !lane.agentStages.includes(stage)) lane.agentStages.push(stage);
      if (event.message && event.stage && event.message !== event.stage && !lane.notices.includes(event.message)) lane.notices.push(textValue(event.message));
      scheduleChatRender();
      return;
    }
    if (type === 'round') {
      const round = Number(event.round ?? event.n ?? event.number ?? event.value);
      if (Number.isFinite(round)) turn.round = round;
      if (event.message) lane.notices.push(textValue(event.message));
      scheduleChatRender();
      return;
    }
    if (type === 'notice') {
      const message = textValue(event.message ?? event.text ?? event.notice ?? event.data);
      if (message && !lane.notices.includes(message)) lane.notices.push(message);
      scheduleChatProjectRefresh();
      scheduleChatRender();
      return;
    }
    if (type === 'challenge') {
      state.challenge = { message: textValue(event.message ?? event.text ?? event.detail ?? "Manual verification required."), raw: event };
      renderChallenge();
      showChallengeModal();
      if (state.view === 'chat') renderMessages();
      announce("The server reports a challenge. Open a separate window and verify login manually.");
      toast("The server requires manual login verification. Automatic bypass is not performed.", 'warning', 'Challenge');
      return;
    }
    if (type === 'challenge_done') {
      const wasChallenge = state.challenge;
      state.challenge = null;
      renderChallenge();
      closeChallengeModal();
      if (wasChallenge) lane.notices.push("Login verification marked by the server as completed.");
      scheduleChatRender();
      return;
    }
    if (type === 'auto_retry') {
      // The server discarded an interrupted attempt and is continuing:
      // drop its partial text so the retry does not duplicate it.
      const dropped = event.dropped || {};
      ['a', 'b'].forEach((k) => {
        const n = Number(dropped[k]) || 0;
        if (n > 0) {
          const lobj = turnLane(turn, k);
          if (lobj.text) lobj.text = lobj.text.slice(0, Math.max(0, lobj.text.length - n));
        }
      });
      // Shown only while the retry runs: new text, done or Stop removes it,
      // so a stopped chat never claims it will continue.
      clearRetryNote(lane);
      const msg = `The reply was interrupted — retrying (${event.attempt || 1}/${event.max || 2})…`;
      lane.notices.push(msg);
      lane.retryNote = msg;
      scheduleChatRender();
      return;
    }
    if (type === 'chats_changed') {
      void loadChats({ silent: true });
      return;
    }
    if (type === 'account_switched') {
      void loadStatus({ quiet: true }).then(() => { updateAccountUI(); updateConnectionUI(); });
      return;
    }
    if (type === 'error') {
      const message = textValue(event.message ?? event.error ?? event.detail ?? 'The server reported an error.');
      generation.hadError = true;
      if (event.code === 'rate_limit' && Number(event.wait) > 0) {
        // Informational only (v5.1): drives the switch-account hint.
        // Sending is never blocked - the limit may be per-modality or
        // already reset, and the user decides when to continue.
        state.rateLimitUntil = Date.now() + Number(event.wait) * 1000;
        if (!state._rateLimitTimer) {
          state._rateLimitTimer = window.setInterval(() => {
            if (Date.now() >= state.rateLimitUntil) {
              window.clearInterval(state._rateLimitTimer);
              state._rateLimitTimer = null;
              state.rateLimitUntil = 0;
            }
            updateComposerState();
          }, 1000);
        }
      }
      if (event.model === 'a' || event.model === 'b' || event.lane === 'a' || event.lane === 'b' || event.ui_lane === 'a' || event.ui_lane === 'b') {
        // Lane-scoped error: only this model's card fails. A surviving
        // Battle lane keeps streaming to its own terminal event.
        lane.error = true;
        if (!lane.errors.includes(message)) lane.errors.push(message);
        lane.streaming = false;
        lane.done = true;
      } else if (!turn.error) {
        // Global backend error: show it once at turn level instead of
        // attributing it to Model A or pretending a card generated it.
        turn.error = message;
      }
      toast(message, 'error', 'Generation error');
      scheduleChatRender();
      return;
    }
    if (type === 'usage') {
      void refreshPulse();
      if (event.remaining != null) state.usageRemaining = Number(event.remaining);
      if (event.reset != null) state.usageReset = Number(event.reset);
      if (event.modality) state.usageModality = String(event.modality);
      if (event.sends_today != null) state.usageSendsToday = Number(event.sends_today);
      if (event.rate_limits_today != null) state.usageRateLimitsToday = Number(event.rate_limits_today);
      renderUsageBar();
      return;
    }
    if (type === 'done') {
      generation.done = true;
      if (typeof event.history_chars === 'number' && String(event.chat_id) === String(state.activeChatId)) {
        state.historyChars = event.history_chars;
      }
      if (event.arena_message_ids && typeof event.arena_message_ids === 'object') {
        turn.arenaIds = event.arena_message_ids;
      }
      if (event.checkpoints) turn.checkpoints = event.checkpoints;
      if (typeof event.msg_index === 'number') turn.msgEnd = event.msg_index;
      if (event.error) {
        generation.hadError = true;
        const message = textValue(event.error);
        const laneScoped = event.model === 'a' || event.model === 'b' || event.lane === 'a' || event.lane === 'b' || event.ui_lane === 'a' || event.ui_lane === 'b';
        if (laneScoped || Object.keys(turn.lanes).length <= 1) {
          lane.error = true;
          if (message && !lane.errors.includes(message)) lane.errors.push(message);
        } else if (message && !turn.error) {
          turn.error = message;
        }
      }
      Object.values(turn.lanes).forEach((laneItem) => {
        laneItem.streaming = false;
        laneItem.done = true;
      });
      const controller = generation.controller;
      window.setTimeout(() => {
        if (!generation.finished && controller) {
          try { controller.abort(); } catch { /* already closed */ }
        }
      }, 900);
      scheduleChatRender();
      return;
    }
    if (type === 'title' && (event.title || event.text)) {
      state.activeChatTitle = String(event.title ?? event.text);
      renderChatHead();
      updateTopbarTitle();
      return;
    }
    // Unknown event types are deliberately ignored, not guessed or rendered as HTML.
  }

  function makeGenerationTurn(message, chatId, attachments = []) {
    const mode = state.mode;
    const lanes = {};
    const laneA = emptyLane('a', mode === 'agent' ? null : currentModelA());
    if (mode === 'agent') {
      laneA.modelId = null;
      laneA.modelName = 'Agent';
      laneA.modelOrg = "Automatic model selection";
    }
    laneA.streaming = true;
    laneA.typewriterUntil = Date.now() + 1800;
    lanes.a = laneA;
    if (mode === 'battle' || mode === 'side-by-side') {
      const laneB = emptyLane('b', currentModelB());
      laneB.streaming = true;
      laneB.typewriterUntil = Date.now() + 1800;
      lanes.b = laneB;
    }
    return {
      user: { content: message, created_at: new Date().toISOString(), attachments: attachments || [] },
      lanes,
      notices: [],
      error: null,
      round: null,
      vote: null,
      arenaIds: null,
      revealed: false,
      chatId,
      mode,
      modality: state.modality
    };
  }

  function clearRetryNote(lane) {
    if (!lane || !lane.retryNote) return;
    lane.notices = (lane.notices || []).filter((note) => note !== lane.retryNote);
    lane.retryNote = null;
  }

  function markGenerationError(generation, message) {
    if (!generation || generation.finished) return;
    generation.hadError = true;
    const entries = Object.entries(generation.turn.lanes);
    // A global transport/backend error belongs to the turn, not to Model A.
    // If exactly one Battle lane already carries this same error, keep the
    // error there and let the other card simply say no answer was received.
    const matching = entries.filter(([, lane]) => message && lane.errors.includes(message));
    if (entries.length <= 1) {
      const primary = generation.turn.lanes[entries[0]?.[0]] || (generation.turn.lanes.a = emptyLane('a'));
      primary.error = true;
      if (message && !primary.errors.includes(message)) primary.errors.push(message);
    } else if (!matching.length && message && !generation.turn.error) {
      generation.turn.error = message;
    }
    entries.forEach(([, lane]) => {
      lane.streaming = false;
      lane.done = true;
      const hasReceived = lane.text || lane.errors.length || (lane.media || []).length || lane.stopped;
      if (entries.length > 1 && !hasReceived) lane.notices.push('No answer was received from this model.');
    });
  }

  function finishGeneration(generation, { aborted = false } = {}) {
    if (!generation || generation.finished) return;
    generation.finished = true;
    const wasStopped = Boolean(generation.stopRequested);
    if (generation.abortTimer) {
      clearTimeout(generation.abortTimer);
      generation.abortTimer = null;
    }
    Object.values(generation.turn.lanes || {}).forEach((lane) => {
      const wasStreaming = lane.streaming;
      lane.streaming = false;
      lane.done = true;
      if (wasStopped && wasStreaming) lane.stopped = true;
      if (!wasStopped && !generation.done && !lane.error && !generation.hadError) {
        lane.notices.push("Stream ended without a done event. The result may be incomplete.");
      }
      if (!wasStopped && aborted && !generation.hadError) lane.notices.push("Stream connection was terminated locally.");
    });
    if (aborted && wasStopped) {
      const lane = Object.values(generation.turn.lanes)[0];
      if (lane && !lane.text) lane.notices.push("Generation stopped before text was received.");
    }
    const genChatId = generation.chatId ? String(generation.chatId) : null;
    // A finished or stopped reply asks nothing any more: the server denied
    // whatever was still waiting, so its approval cards must not linger
    // (or show up in another chat).
    Object.values(generation.turn.lanes || {}).forEach((laneItem) => {
      clearRetryNote(laneItem);
      (laneItem.permissions || []).forEach((permission) => {
        if (!permission.status || permission.status === 'pending') permission.status = wasStopped ? 'stopped' : 'expired';
      });
    });
    if (genChatId) {
      state.pendingPermissions = state.pendingPermissions.filter((item) => String(item.chatId || '') !== genChatId);
      state.permissionCount = state.pendingPermissions.length;
      updatePendingPermissionsBadge();
    }
    if (genChatId) state.generations.delete(genChatId);
    if (genChatId && generation.done && !wasStopped) {
      // The backend swaps a new chat's provisional title for the summary
      // title Arena generates; pick it up without a manual refresh.
      [10, 30, 60, 100].forEach((secs) => setTimeout(() => { void loadChats({ silent: true }); }, secs * 1000));
    }
    const isOpenChat = genChatId && String(state.activeChatId) === genChatId;
    if (genChatId && !isOpenChat && !generation.hadError && !wasStopped && generation.done) {
      // Finished in the background: the sidebar shows a check until opened.
      state.unreadDone.add(genChatId);
      saveUnreadDone();
      const finishedChat = state.chats.find((item) => item.id === genChatId);
      toast(`“${truncate(finishedChat?.title || 'Chat', 40)}” is done.`, 'success', 'Generation finished');
    }
    syncGenerationState();
    maybePlayDoneSound(generation, { wasStopped });
    if (!wasStopped && !generation.hadError && generation.done) flushQueuedMessage(genChatId);
    if (isOpenChat && state.view === 'chat') renderMessages();
    announce(generation.hadError ? "Generation completed with an error." : wasStopped ? "Generation stopped." : "Generation completed.");
    window.setTimeout(() => {
      if (!state.serverError) {
        void loadChats({ silent: true });
        void loadStatus({ quiet: true });
        void loadPermissions({ quiet: true });
        if (state.workspacePanelOpen) void loadWorkspaceTree('.', { force: true });
      }
    }, 280);
  }

  /* ---------------------------------------------------------------------- */
  /* Composer attachments                                                  */
  /* ---------------------------------------------------------------------- */
  const ATTACH_EXT_MIME = {
    png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', webp: 'image/webp',
    gif: 'image/gif', pdf: 'application/pdf', txt: 'text/plain', md: 'text/markdown',
    csv: 'text/csv', html: 'text/html', htm: 'text/html', xml: 'text/xml',
    css: 'text/css', js: 'text/javascript', mjs: 'text/javascript', json: 'application/json'
  };
  const AGENT_ATTACH_MIME = ['image/png', 'image/webp', 'image/jpeg', 'image/gif', 'text/plain',
    'text/markdown', 'text/csv', 'text/html', 'text/xml', 'text/css', 'text/javascript',
    'application/json', 'application/xml', 'application/javascript', 'application/pdf'];
  const EVAL_ATTACH_MIME = ['image/png', 'image/jpeg', 'image/webp', 'application/pdf'];
  // v1.5.0 upload middleman (app.py _convert_attachment): these are converted
  // on the way up - images to PNG everywhere, code/text files to text/plain in Agent Mode.
  const CONVERT_IMAGE_EXT = ['bmp', 'dib', 'tif', 'tiff', 'ico', 'avif', 'tga', 'ppm', 'pgm', 'pbm',
    'jfif', 'pjpeg', 'gif', 'jp2', 'psd', 'pcx'];
  const TEXTLIKE_EXT = ['py', 'pyw', 'ts', 'tsx', 'jsx', 'java', 'go', 'rs', 'c', 'h', 'cpp', 'cc', 'hpp', 'cs',
    'rb', 'php', 'swift', 'kt', 'kts', 'scala', 'sh', 'bash', 'zsh', 'ps1', 'psm1', 'bat', 'cmd', 'sql', 'yaml',
    'yml', 'toml', 'ini', 'cfg', 'conf', 'log', 'r', 'lua', 'pl', 'dart', 'vue', 'svelte', 'scss', 'sass', 'less',
    'gradle', 'properties', 'tex', 'rst', 'svg', 'ipynb', 'tsv', 'srt', 'vtt', 'env', 'gitignore', 'dockerfile',
    'mk', 'asm', 's', 'm', 'jl', 'ex', 'exs', 'erl', 'hs', 'clj', 'fs', 'vb', 'zig', 'nim', 'sol', 'proto', 'graphql'];
  const fileExt = (file) => String(file?.name || '').split('.').pop()?.toLowerCase() || '';
  function convertibleHere(file, mediaType, kind) {
    const ext = fileExt(file);
    if (ext === 'heic' || ext === 'heif') return false;
    if (CONVERT_IMAGE_EXT.includes(ext) || (mediaType.startsWith('image/') && mediaType !== 'image/svg+xml')) return true;
    return kind === 'agent' && (TEXTLIKE_EXT.includes(ext) || mediaType.startsWith('text/'));
  }
  let attachmentSeq = 0;
  let uploadChain = Promise.resolve();

  function attachmentKind() {
    return state.mode === 'agent' && state.agentKind === 'native' ? 'agent' : 'evaluation';
  }
  function attachmentsAllowedHere() {
    if (attachmentKind() === 'agent') return true;
    return state.modality !== 'search';
  }
  function fileMediaType(file) {
    const ext = String(file?.name || '').split('.').pop()?.toLowerCase() || '';
    const byExt = ATTACH_EXT_MIME[ext];
    const declared = String(file?.type || '').split(';')[0].trim().toLowerCase();
    if (byExt && (!declared || declared === 'application/octet-stream' || declared === 'text/plain'
      || byExt.startsWith('text/') || byExt === 'application/json')) return byExt;
    return declared || byExt || 'application/octet-stream';
  }
  function attachmentAccept() {
    if (attachmentKind() === 'agent') {
      return '';  // anything text-like or an image: the middleman converts what Arena refuses
    }
    const images = '.png,.jpg,.jpeg,.webp,' + CONVERT_IMAGE_EXT.map((e) => '.' + e).join(',');
    if (state.modality === 'text' || state.modality === 'auto') return images + ',.pdf';
    return images;
  }
  function attachmentHint() {
    if (attachmentKind() === 'agent') {
      return 'Images, PDF, text and code files (other image types become PNG, code becomes text) · up to 25 MB per file (PDF 10 MB), 50 MB per message';
    }
    if (state.modality === 'video') return 'PNG, JPEG, WebP · up to 10 MB per file';
    if (state.modality === 'text' || state.modality === 'auto') return 'PNG, JPEG, WebP, PDF · up to 15 MB per file';
    return 'PNG, JPEG, WebP · up to 15 MB per file';
  }
  function attachmentProblem(file, mediaType, pending) {
    const kind = attachmentKind();
    const list = pending || state.attachments;
    if (!attachmentsAllowedHere()) return 'Files cannot be attached in Web Search. Switch the work type to attach files.';
    if (kind === 'agent') {
      if (!AGENT_ATTACH_MIME.includes(mediaType) && !convertibleHere(file, mediaType, kind)) return `${file.name} is not a supported file type. Agent Mode accepts PNG, WebP, JPEG, GIF, PDF, TXT, MD, CSV, HTML, XML, CSS, JS and JSON.`;
      if (mediaType === 'application/pdf' && file.size > 10 * 1024 * 1024) return `${file.name} is over the 10 MB PDF limit for Agent Mode.`;
      if (file.size > 25 * 1024 * 1024) return `${file.name} is over the 25 MB per-file limit for Agent Mode.`;
      if (list.length >= 20) return 'Agent Mode accepts up to 20 files per message.';
      const total = list.reduce((sum, item) => sum + (item.size || 0), 0) + file.size;
      if (total > 50 * 1024 * 1024) return 'Agent Mode accepts up to 50 MB of files per message.';
      return null;
    }
    if (!EVAL_ATTACH_MIME.includes(mediaType) && !convertibleHere(file, mediaType, kind)) return `${file.name} is not supported here. This mode accepts PNG, JPEG, WebP and PDF — Agent Mode accepts more types.`;
    if (mediaType === 'application/pdf' && state.modality !== 'text' && state.modality !== 'auto') {
      return 'PDF files attach in Text (and Battle Auto). Switch the work type, or use Agent Mode.';
    }
    const limit = state.modality === 'video' ? 10 * 1024 * 1024 : 15 * 1024 * 1024;
    if (file.size > limit) return `${file.name} is over the ${limit / (1024 * 1024)} MB per-file limit.`;
    if (list.length >= 10) return 'Attach up to 10 files per message.';
    return null;
  }
  function attachmentsBusy() {
    return state.attachments.some((item) => item.status === 'uploading');
  }
  function attachmentsFailed() {
    return state.attachments.some((item) => item.status === 'error');
  }
  function readyAttachments() {
    return state.attachments.filter((item) => item.status === 'ready' && item.result);
  }
  function renderAttachmentStrip() {
    const strip = els.attachmentStrip;
    if (!strip) return;
    clear(strip);
    strip.hidden = !state.attachments.length;
    state.attachments.forEach((item) => {
      const chip = el('div', { class: `attachment-chip${item.status === 'error' ? ' is-error' : ''}` });
      if (item.previewUrl) {
        chip.appendChild(el('img', { class: 'attachment-thumb', src: item.previewUrl, alt: '' }));
      } else {
        chip.appendChild(el('span', { class: 'attachment-file-icon' }, iconEl(item.mediaType === 'application/pdf' ? 'file-text' : 'file')));
      }
      chip.appendChild(el('span', { class: 'attachment-copy' },
        el('span', { class: 'attachment-name', text: item.name, title: item.name }),
        el('span', { class: 'attachment-meta', text: item.status === 'error' ? (item.error || 'Upload failed') : formatBytes(item.size) })
      ));
      if (item.status === 'uploading') chip.appendChild(el('span', { class: 'mini-spinner', 'aria-hidden': 'true' }));
      const remove = el('button', { class: 'attachment-remove', type: 'button', 'aria-label': `Remove ${item.name}`, title: 'Remove' }, iconEl('x'));
      remove.addEventListener('click', () => removeAttachment(item.id));
      chip.appendChild(remove);
      strip.appendChild(chip);
    });
  }
  function removeAttachment(id) {
    const index = state.attachments.findIndex((item) => item.id === id);
    if (index < 0) return;
    const [item] = state.attachments.splice(index, 1);
    if (item.previewUrl) { try { URL.revokeObjectURL(item.previewUrl); } catch { /* already gone */ } }
    renderAttachmentStrip();
    updateComposerState();
  }
  function clearAttachments() {
    state.attachments.forEach((item) => {
      if (item.previewUrl) { try { URL.revokeObjectURL(item.previewUrl); } catch { /* already gone */ } }
    });
    state.attachments = [];
    renderAttachmentStrip();
  }
  function pruneAttachmentsForSelection() {
    if (!state.attachments.length) return;
    const kind = attachmentKind();
    const kept = [];
    let dropped = 0;
    for (const item of state.attachments) {
      const fake = { name: item.name, size: item.size, type: item.mediaType };
      if (item.kind === kind && !attachmentProblem(fake, item.mediaType, kept)) kept.push(item);
      else {
        dropped += 1;
        if (item.previewUrl) { try { URL.revokeObjectURL(item.previewUrl); } catch { /* already gone */ } }
      }
    }
    if (dropped) {
      state.attachments = kept;
      renderAttachmentStrip();
      toast('Attached files were removed: they do not fit the new mode or work type.', 'info', 'Attachments removed');
    }
  }
  async function attachWorkspaceFile(path) {
    try {
      const blob = await API.downloadWorkspaceFile(path);
      const name = String(path || 'file').split(/[\\/]/).pop() || 'file';
      addFiles([new File([blob], name, { type: blob.type || '' })]);
    } catch (error) {
      toast(errorMessage(error), 'error', 'Could not attach the workspace file');
    }
  }

  function addFiles(fileList) {
    const files = Array.from(fileList || []).filter((file) => file && typeof file.size === 'number');
    if (!files.length) return;
    if (state.generating) {
      toast('Wait for the current answer before attaching files.', 'warning');
      return;
    }
    if (!attachmentsAllowedHere()) {
      toast('Files cannot be attached in Web Search. Switch the work type to attach files.', 'warning', 'Attachments unavailable');
      return;
    }
    let firstProblem = null;
    const kind = attachmentKind();
    for (const file of files) {
      const mediaType = fileMediaType(file);
      const problem = attachmentProblem(file, mediaType, state.attachments);
      if (problem) { if (!firstProblem) firstProblem = problem; continue; }
      const item = {
        id: `att-${++attachmentSeq}`,
        file,
        kind,
        name: file.name || (mediaType.startsWith('image/') ? 'pasted-image.png' : 'file'),
        size: file.size,
        mediaType,
        status: 'uploading',
        error: null,
        result: null,
        previewUrl: mediaType.startsWith('image/') ? URL.createObjectURL(file) : null
      };
      state.attachments.push(item);
      uploadChain = uploadChain.then(() => uploadOneAttachment(item)).catch(() => undefined);
    }
    if (firstProblem) toast(firstProblem, 'warning', 'File not attached');
    renderAttachmentStrip();
    updateComposerState();
  }
  async function uploadOneAttachment(item) {
    if (!state.attachments.includes(item)) return;
    try {
      const result = await API.uploadAttachment(item.file, item.kind, item.kind === 'evaluation' ? state.modality : '');
      item.result = result;
      item.status = 'ready';
    } catch (error) {
      item.status = 'error';
      item.error = errorMessage(error);
      toast(item.error, 'error', `Could not attach ${item.name}`);
    }
    renderAttachmentStrip();
    updateComposerState();
  }
  function turnAttachmentsFromComposer() {
    return readyAttachments().map((item) => ({
      name: item.result.name || item.result.filename || item.name,
      contentType: item.result.contentType || item.result.mediaType || item.mediaType,
      mediaType: item.result.mediaType || item.result.contentType || item.mediaType,
      url: item.result.url,
      size: item.result.size ?? item.size,
      previewUrl: item.previewUrl || null
    }));
  }
  function normalizeUserAttachments(raw) {
    if (!Array.isArray(raw)) return [];
    return raw.filter((item) => item && typeof item === 'object' && (item.url || item.name || item.filename)).map((item) => ({
      name: String(item.name || item.filename || 'File'),
      contentType: String(item.contentType || item.mediaType || ''),
      mediaType: String(item.mediaType || item.contentType || ''),
      url: typeof item.url === 'string' ? item.url : '',
      size: Number(item.size) || 0,
      previewUrl: null
    }));
  }

  function askCodeWorkspaceSync() {
    const chatKey = String(state.activeChatId || 'new');
    const hasFolder = Boolean(state.workspaceChosen);
    const resend = () => { state.codeSyncAskedFor = chatKey; window.setTimeout(() => { void sendMessage(); }, 0); };
    mountModal({
      title: 'Save the generated files on this computer?',
      subtitle: 'Workspace Sync',
      size: 'small',
      content: el('div', {},
        el('p', { class: 'modal-copy', text: 'Code chats build a project on Arena’s servers. Workspace Sync copies the files the AI writes into the folder you chose on this computer, so you can open and run them here.' }),
        el('p', { class: 'modal-copy', text: hasFolder
          ? 'Workspace Sync is off, so the files would only exist on Arena’s sandbox (you can still preview them on arena.ai).'
          : 'No folder is chosen yet, so the files would only exist on Arena’s sandbox (you can still preview them on arena.ai).' })),
      actions: [
        { label: 'Cancel', variant: 'quiet' },
        { label: 'Send without saving files', variant: 'quiet', onClick: () => { resend(); } },
        { label: hasFolder ? 'Turn on Workspace Sync' : 'Choose a folder', variant: 'primary', autofocus: true,
          onClick: () => {
            if (hasFolder) { setWorkspaceSync(true); resend(); }
            else { state.directTools = true; openWorkspacePopover(els.workspaceButton); }
          } }
      ]
    });
  }

  async function sendMessage() {
    if (state.starting) return;
    if (chatIsGenerating(state.activeChatId)) {
      const queuedText = els.prompt?.value.trim() || '';
      if (queuedText && state.activeChatId) {
        queuedMessages.set(String(state.activeChatId), queuedText);
        if (els.prompt) { els.prompt.value = ''; saveComposerDraft(); }
        updateComposerState();
        renderQueuedBar();
        toast("Queued — it sends itself when this chat finishes the current answer.", 'info', "Message queued");
      } else {
        toast("This chat is still working on the previous message. You can use other chats meanwhile.", 'warning', "Generation is already in progress");
      }
      return;
    }
    const text = els.prompt?.value.trim() || '';
    if (!text) {
      focusComposer();
      updateComposerState();
      return;
    }
    if (attachmentsBusy()) {
      toast('Files are still uploading. The message sends when they finish — try again in a moment.', 'info', 'Uploading files');
      return;
    }
    if (attachmentsFailed()) {
      toast('One file did not upload. Remove it (×) and send again.', 'warning', 'Attachment failed');
      return;
    }
    if (state.modality === 'video' && text.length > 2500) {
      toast('Video prompts can be up to 2,500 characters. Shorten the prompt and send again.', 'warning', 'Prompt too long');
      return;
    }
    if (state.historyLoading) {
      toast("Wait for the dialog history to load.", 'info');
      return;
    }
    if (state.historyError) {
      toast("Dialog history not loaded. Reload to avoid sending a request in an incomplete context.", 'warning', "History unavailable");
      return;
    }
    if (state.serverError || state.networkOffline) {
      toast(state.serverError || "No connection to the local server. Request not sent.", 'error', "Server unavailable");
      return;
    }
    if (state.status && !state.authenticated) {
      toast("Log in first in a separate window or using cookies.", 'warning', "Not signed in");
      openSettings('connection');
      return;
    }
    if (state.demo && !demoStore.authenticated) {
      toast("Logged out of the demo profile. Log in to send a demo message.", 'warning', "Not signed in");
      openSettings('connection');
      return;
    }
    state.starting = true;
    updateComposerState();
    try {
      if (state.pendingChanges > 0) {
        toast("First apply the changes to the mode and task type.", 'info', "Synchronization of settings");
        while (state.pendingChanges > 0) {
          await state.transitionQueue.catch(() => undefined);
        }
      }
      if (state.modelsPromise) await state.modelsPromise.catch(() => undefined);
      if (state.pendingChanges > 0) {
        toast("Settings are still being applied. Please resend.", 'warning', "Please wait");
        return;
      }
      if (state.serverError) {
        toast(state.serverError, 'error', "Server unavailable");
        return;
      }
      if (!requiredModelsReady()) {
        if (state.mode !== 'battle') {
          toast(state.modelsError || (state.modelsLoading ? "Wait for the models to load." : "Select a model to send."), 'warning', "Model is not ready");
          openModelPicker(state.mode === 'side-by-side' && state.modelAId ? 'b' : 'a');
        } else {
          toast("The server is not yet ready for Battle.", 'warning');
        }
        return;
      }

      // First Code message while Workspace Sync cannot save files here: the
      // generated project would stay on Arena's sandbox. Explain and ask once.
      if (state.modality === 'code' && state.mode !== 'agent' && !chatLocked()
          && !(state.directTools && state.workspaceChosen)
          && state.codeSyncAskedFor !== String(state.activeChatId || 'new')) {
        askCodeWorkspaceSync();
        return;
      }

      let chatId = state.activeChatId;
      if (!chatId) {
        const raw = await API.newChat();
        chatId = raw?.chat_id ?? raw?.id ?? raw?.chat?.id;
        if (!chatId) throw new ApiError("The server did not return a chat ID.");
        chatId = String(chatId);
        state.activeChatId = chatId;
        state.activeChatTitle = String(raw?.title ?? "New chat");
        state.messages = [];
        state.artifacts = [];
        state.historyError = null;
        state.historyLoading = false;
        state.challenge = null;
        updateArtifactCount();
        void loadChats({ silent: true });
      }

      // The visible composer selection travels with the request itself, so a
      // late status/chat response can never reroute this send to another mode.
      const body = { message: text, chat_id: chatId, mode: state.mode, modality: state.modality };
      try { body.timezone = Intl.DateTimeFormat().resolvedOptions().timeZone; } catch { /* optional */ }
      if (state.mode === 'agent') {
        // 'arena' = native Arena Agent Mode streamed in-app; 'local' = the
        // folder-tools loop.  A saved chat keeps its own backend server-side.
        body.agent_backend = state.agentKind === 'native' ? 'arena' : 'local';
      }
      // Workspace Sync: the composer switch decides whether models get the
      // automatic folder-tools loop on this computer. It applies to Direct,
      // Side by Side, Battle and the Local Agent alike.
      body.tools = Boolean(state.directTools);
      // Only Direct and Side by Side have user-chosen models.  Battle sends
      // no ids, Video is Battle-only, and Agent is always automatic.
      if (allowsManualModels()) {
        if (!state.modelAId) throw new ApiError("Model A not selected.");
        body.model_id = state.modelAId;
      }
      if (state.mode === 'side-by-side') {
        if (!state.modelBId) throw new ApiError("Model B not selected.");
        body.model_id_b = state.modelBId;
      }
      const sentAttachments = turnAttachmentsFromComposer();
      if (state.mode === 'direct' && Array.isArray(state.fanoutModels) && state.fanoutModels.length >= 2) {
        body.fanout_models = [...state.fanoutModels];
      }
      if (sentAttachments.length) body.attachments = sentAttachments;

      const turn = makeGenerationTurn(text, chatId, sentAttachments);
      if (!state.activeChatTitle || state.activeChatTitle === "New chat") {
        state.activeChatTitle = truncate(text, 52);
        const chat = state.chats.find((item) => item.id === String(chatId));
        if (chat) chat.title = state.activeChatTitle;
        else {
          state.chats.unshift({ id: String(chatId), title: state.activeChatTitle, updated_at: new Date().toISOString(), mode: state.mode, modality: state.modality });
        }
      }
      state.messages.push(turn);
      state.artifacts = state.artifacts.filter((artifact) => artifact.chatId !== null || artifact.chatId === chatId);
      if (els.prompt) els.prompt.value = '';
      state.draft = '';
      saveComposerDraft();
      // The turn keeps its own preview URLs; the composer starts clean.
      state.attachments = [];
      renderAttachmentStrip();
      resetPromptHeight();
      const controller = new AbortController();
      const generation = { turn, controller, chatId: String(chatId), hadError: false, done: false, finished: false, abortTimer: null, stopRequested: false };
      state.generations.set(generation.chatId, generation);
      state.chatTurns[generation.chatId] = state.messages;
      markChatSeen(generation.chatId);
      state.starting = false;
      syncGenerationState();
      setView('chat');
      renderChatArea();
      renderChats();
      updateComposerState();
      if (els.content) els.content.scrollTop = els.content.scrollHeight;
      announce("Request sent. Awaiting response.");
      try {
        await API.streamChat(body, (event) => handleStreamEvent(event, generation), controller.signal);
      } catch (error) {
        if (!generation.done && !(generation.stopRequested && error?.name === 'AbortError')) {
          markGenerationError(generation, errorMessage(error));
          toast(errorMessage(error), 'error', "Generation interrupted");
        } else if (generation.stopRequested) {
          Object.values(turn.lanes).forEach((lane) => { lane.stopped = true; lane.streaming = false; });
        }
      } finally {
        finishGeneration(generation, { aborted: controller.signal.aborted });
      }
    } catch (error) {
      toast(errorMessage(error), 'error', "Request not sent");
    } finally {
      state.starting = false;
      updateComposerState();
    }
  }

  async function stopGeneration() {
    if (state.stopping) return;
    const generation = state.activeGeneration;
    if (!generation && !state.remoteBusy) return;
    state.stopping = true;
    if (generation) generation.stopRequested = true;
    state.stopRequested = Boolean(generation);
    updateComposerState();
    try {
      await API.stop(generation ? generation.chatId : null);
      if (generation) {
        toast("Stop signal sent to the server. Waiting for the thread to finish.", 'info', "Stopping");
        generation.abortTimer = window.setTimeout(() => {
          if (!generation.finished) {
            try { generation.controller.abort(); } catch { /* already closed */ }
          }
        }, 4200);
      } else {
        toast("Stop signal sent to the local server.", 'info', "Stopping");
        window.setTimeout(() => { state.stopping = false; void loadStatus({ quiet: true }); }, 700);
      }
    } catch (error) {
      state.stopping = false;
      if (generation) generation.stopRequested = false;
      state.stopRequested = false;
      updateComposerState();
      toast(errorMessage(error), 'error', "Failed to stop generation");
    } finally {
      if (!state.generating) {
        state.stopping = false;
        updateComposerState();
      }
    }
  }

  async function retryPendingHistory() {
    if (state.activeChatId) await openChat(state.activeChatId, { retry: true });
  }

  /* ---------------------------------------------------------------------- */
  /* Popovers                                                              */
  // ═══ 11-ui.js ═══
  /* ---------------------------------------------------------------------- */
  let activePopover = null;

  function positionPopover(popover, trigger) {
    if (!popover || !trigger) return;
    popover.style.visibility = 'hidden';
    popover.style.left = '8px';
    popover.style.top = '8px';
    const triggerRect = trigger.getBoundingClientRect();
    const width = popover.offsetWidth || 320;
    const height = popover.offsetHeight || 280;
    const margin = 8;
    const left = clamp(triggerRect.left, margin, window.innerWidth - width - margin);
    const below = window.innerHeight - triggerRect.bottom - margin;
    const above = triggerRect.top - margin;
    let top;
    if (below < Math.min(height, 280) && above > below) {
      top = Math.max(margin, triggerRect.top - height - 7);
    } else {
      top = triggerRect.bottom + 7;
      if (top + height > window.innerHeight - margin) top = Math.max(margin, window.innerHeight - height - margin);
    }
    popover.style.left = `${left}px`;
    popover.style.top = `${top}px`;
    popover.style.visibility = 'visible';
  }

  function closePopover(restoreFocus = true) {
    if (!activePopover) return;
    const reference = activePopover;
    activePopover = null;
    document.removeEventListener('pointerdown', reference.onOutside, true);
    document.removeEventListener('keydown', reference.onKey, true);
    reference.trigger?.setAttribute('aria-expanded', 'false');
    reference.node?.remove();
    try { reference.onClose?.(); } catch { /* noop */ }
    if (restoreFocus && reference.trigger?.isConnected) {
      try { reference.trigger.focus({ preventScroll: true }); } catch { reference.trigger.focus(); }
    }
  }

  function openPopover(trigger, { title, subtitle, content, wide = false, menu = false, initialFocus = null, onClose = null, role = 'dialog' }) {
    closePopover(false);
    if (!trigger || !els.popoverRoot) return null;
    const node = el('div', {
      class: `popover${wide ? ' popover-wide' : ''}${menu ? ' popover-menu' : ''}`,
      role,
      'aria-label': title || 'Menu',
      'data-popover': '1'
    });
    if (!menu) {
      const closeButton = el('button', {
        class: 'icon-button popover-close', type: 'button', 'aria-label': 'Close menu',
        onclick: () => closePopover()
      }, iconEl('x'));
      const head = el('div', { class: 'popover-head' },
        el('div', {}, el('p', { class: 'popover-title', text: title || 'Options' }), subtitle ? el('p', { class: 'popover-subtitle', text: subtitle }) : null),
        closeButton
      );
      node.appendChild(head);
    }
    if (content) append(node, content);
    els.popoverRoot.replaceChildren(node);
    trigger.setAttribute('aria-expanded', 'true');

    let outsideTarget = null;
    const onOutside = (event) => {
      if (!activePopover || activePopover.node !== node) return;
      if (node.contains(event.target) || trigger.contains(event.target) || event.target.closest?.('.modal-backdrop')) return;
      closePopover(false);
    };
    const onKey = (event) => {
      if (!activePopover || activePopover.node !== node) return;
      if (event.key === 'Escape') {
        event.preventDefault();
        event.stopPropagation();
        closePopover();
        return;
      }
      const options = $$('[role="option"], [data-popover-action]', node).filter((item) => item.getAttribute('aria-disabled') !== 'true' && !item.disabled);
      if (!options.length) return;
      const index = options.indexOf(document.activeElement);
      if (event.key === 'ArrowDown') {
        event.preventDefault();
        const next = index < 0 || index >= options.length - 1 ? options[0] : options[index + 1];
        next.focus();
      } else if (event.key === 'ArrowUp') {
        event.preventDefault();
        const previous = index <= 0 ? options[options.length - 1] : options[index - 1];
        previous.focus();
      } else if (event.key === 'Home' && !event.target.matches('input, textarea')) {
        event.preventDefault();
        options[0].focus();
      } else if (event.key === 'End' && !event.target.matches('input, textarea')) {
        event.preventDefault();
        options[options.length - 1].focus();
      }
    };
    document.addEventListener('pointerdown', onOutside, true);
    document.addEventListener('keydown', onKey, true);
    activePopover = { node, trigger, onOutside, onKey, onClose };
    positionPopover(node, trigger);
    window.requestAnimationFrame(() => {
      if (!activePopover || activePopover.node !== node) return;
      const preferred = initialFocus && initialFocus.isConnected ? initialFocus : node.querySelector('[data-popover-autofocus]')
        || node.querySelector('[aria-selected="true"]')
        || node.querySelector('input')
        || node.querySelector('button, [tabindex="-1"]');
      if (preferred) {
        try { preferred.focus({ preventScroll: true }); } catch { preferred.focus(); }
      }
    });
    return node;
  }

  function popoverNote(text) {
    return el('p', { class: 'popover-note', text });
  }

  function popoverOption({ title, desc = '', icon = '', selected = false, disabled = false, danger = false, tag = '', meta = '', onClick = null }) {
    const button = el('button', {
      class: `popover-option${danger ? ' is-danger' : ''}`,
      type: 'button',
      role: 'option',
      'aria-selected': String(Boolean(selected)),
      'aria-disabled': disabled ? 'true' : false,
      disabled
    },
      icon ? el('span', { class: 'option-icon' }, iconEl(icon)) : null,
      el('span', { class: 'option-copy' },
        el('span', { class: 'option-title' }, el('span', { text: title }), tag ? el('span', { class: 'option-tag', text: tag }) : null),
        desc ? el('span', { class: 'option-desc', text: desc }) : null
      ),
      meta ? el('span', { class: 'model-option-meta', text: meta }) : null,
      selected ? el('span', { class: 'option-check' }, iconEl('check')) : null
    );
    if (onClick && !disabled) button.addEventListener('click', onClick);
    return button;
  }

  function openModePopover(trigger = els.modeButton) {
    if (!trigger) return;
    const list = el('div', { class: 'popover-list', role: 'listbox', 'aria-label': 'Mode' });
    MODES.forEach((mode) => {
      list.appendChild(popoverOption({
        title: mode.title,
        desc: mode.desc,
        icon: mode.icon,
        selected: state.mode === mode.id,
        onClick: () => {
          closePopover();
          void changeMode(mode.id);
        }
      }));
    });
    openPopover(trigger, {
      title: 'Mode',
      menu: true,
      role: 'listbox',
      content: list
    });
  }

  function openModalityPopover(trigger = els.modalityButton) {
    if (!trigger || state.mode === 'agent') return;
    const list = el('div', { class: 'popover-list', role: 'listbox', 'aria-label': 'Work type' });
    modalityOptionsForMode(state.mode).forEach((modality) => {
      list.appendChild(popoverOption({
        title: modality.label,
        desc: modality.desc,
        icon: modality.icon,
        selected: state.modality === modality.id,
        onClick: () => {
          closePopover();
          void changeModality(modality.id);
        }
      }));
    });
    openPopover(trigger, {
      title: 'Work type',
      menu: true,
      role: 'listbox',
      content: list
    });
  }

  function openPermissionModePopover(trigger = els.permissionButton) {
    if (!trigger) return;
    const list = el('div', { class: 'popover-list', role: 'listbox', 'aria-label': 'Permissions' });
    PERMISSION_MODES.forEach((mode) => {
      list.appendChild(popoverOption({
        title: mode.label,
        desc: mode.desc,
        icon: mode.icon,
        selected: state.permissionMode === mode.id,
        danger: mode.danger,
        tag: mode.danger ? 'Dangerous' : '',
        onClick: () => {
          closePopover();
          void changePermissionMode(mode.id);
        }
      }));
    });
    openPopover(trigger, {
      title: 'Permissions',
      menu: true,
      role: 'listbox',
      content: list
    });
  }

  function openWorkspacePopover(trigger = els.workspaceButton) {
    if (!trigger) return;
    const path = state.workspace;
    const list = el('div', { class: 'popover-list', role: 'listbox', 'aria-label': 'Workspace' });
    list.appendChild(popoverOption({
      title: path ? workspaceName() : 'No folder selected',
      desc: path || 'Choose a folder for Local Agent and saved code',
      icon: 'folder',
      selected: true,
      onClick: () => {
        closePopover(false);
        setWorkspacePanelOpen(true);
      }
    }));
    list.appendChild(popoverOption({
      title: 'Change folder…',
      desc: state.nativeReady ? 'Pick a folder on this computer' : 'Enter the path in Settings',
      icon: 'folder',
      onClick: async () => {
        closePopover(false);
        if (!state.nativeReady) {
          openSettings('workspace');
          return;
        }
        await chooseNativeFolder();
      }
    }));
    if (path) {
      list.appendChild(popoverOption({
        title: 'Open in Explorer',
        icon: 'external',
        onClick: async () => { closePopover(false); await openWorkspaceFolder(); }
      }));
      list.appendChild(popoverOption({
        title: 'Show files',
        icon: 'panel-right',
        onClick: () => { closePopover(false); setWorkspacePanelOpen(true); }
      }));
    }
    if (state.workspaceChosen) {
      list.appendChild(popoverOption({
        title: 'Use default folder',
        desc: 'ArenaProjects\\workspace',
        icon: 'x',
        onClick: async () => {
          closePopover(false);
          try {
            const result = await API.clearWorkspace();
            state.workspace = normalizeWorkspace(result?.workspace ?? result?.path) || state.workspace;
            state.workspaceChosen = false;
            state.workspacePanelRoot = '';
            resetWorkspaceTree();
            updateComposerState();
            renderWorkspaceTreePanel();
            toast('Back to the default workspace folder.', 'success');
          } catch (error) {
            toast(errorMessage(error), 'error', 'Folder not changed');
          }
        }
      }));
    }
    openPopover(trigger, {
      title: 'Workspace',
      menu: true,
      role: 'listbox',
      content: list
    });
  }

  function openModelPicker(lane = 'a', trigger = null) {
    if (!allowsManualModels()) {
      const message = state.mode === 'agent'
        ? "In Agent, the model is not selected and does not appear: it is assigned automatically."
        : state.modality === 'video'
          ? "Video is only available in Battle; both models are selected by Arena."
          : "In Battle, both models are selected by Arena.";
      toast(message, 'info', "Manual selection is disabled");
      return;
    }
    const anchor = trigger || els.modelsNavBtn || els.modeButton;
    if (!anchor) return;
    const effectiveLane = lane === 'b' && state.mode === 'side-by-side' ? 'b' : 'a';
    const content = el('div');
    const searchWrap = el('div', { class: 'popover-search' }, iconEl('search'));
    const searchInput = el('input', { type: 'search', placeholder: "Find a model or laboratory", autocomplete: 'off', 'aria-label': "Search for a model" });
    searchWrap.appendChild(searchInput);
    content.appendChild(searchWrap);
    const list = el('div', { class: 'popover-list', role: 'listbox', 'aria-label': `Model ${effectiveLane.toUpperCase()}` });
    content.appendChild(list);
    const footer = el('div', { class: 'popover-foot' },
      el('span', { class: 'modal-copy', style: { margin: '0', fontSize: '9px' }, text: `${modalityMeta(state.modality).label} · ${state.models.length} of models` }),
      (state.mode === 'direct' && state.modality === 'text' && effectiveLane === 'a')
        ? el('button', {
          class: 'button button-small button-quiet', type: 'button',
          onclick: () => { closePopover(); openFanoutPicker(anchor); }
        }, iconEl('layers'), el('span', { text: state.fanoutModels?.length >= 2 ? `Fan-out: ${state.fanoutModels.length}` : 'Ask several' }))
        : null,
      el('button', {
        class: 'icon-button tiny', type: 'button', 'aria-label': "Update the model list",
        onclick: async () => { await loadModels(state.modality, { force: true }); renderModelOptions(); }
      }, iconEl('refresh'))
    );
    content.appendChild(footer);

    const renderModelOptions = () => {
      clear(list);
      if (state.modelsLoading && !state.models.length) {
        list.appendChild(el('div', { class: 'popover-empty' }, el('span', { class: 'loading-block' }, el('span', { class: 'mini-spinner' }), el('span', { text: "Loading models…" }))));
        return;
      }
      if (state.modelsError) {
        list.appendChild(el('div', { class: 'popover-empty' }, el('span', { text: state.modelsError })));
        list.appendChild(el('div', { class: 'popover-foot' }, el('span'), el('button', {
          class: 'button button-small button-quiet', type: 'button',
          onclick: () => { void loadModels(state.modality, { force: true }).then(renderModelOptions); }
        }, iconEl('refresh'), el('span', { text: "Retry" }))));
        return;
      }
      const query = searchInput.value.trim().toLocaleLowerCase('en');
      ensureElo(renderModelOptions);
      const favs = modelPinSet(FAV_KEY);
      const hidden = modelPinSet(HIDDEN_KEY);
      const filtered = state.models.filter((model) => {
        if (hidden.has(String(model.id)) && !query) return false;
        if (!query) return true;
        return `${model.name} ${model.org} ${model.capabilities.join(' ')}`.toLocaleLowerCase('en').includes(query);
      }).sort((x, y) => (favs.has(String(y.id)) ? 1 : 0) - (favs.has(String(x.id)) ? 1 : 0));
      if (!filtered.length) {
        list.appendChild(el('div', { class: 'popover-empty', text: state.models.length ? "Models not found." : "The server did not return models for this type." }));
        return;
      }
      const selectedId = effectiveLane === 'b' ? state.modelBId : state.modelAId;
      const recentModels = (query ? [] : recentModelIds())
        .map((id) => filtered.find((model) => String(model.id) === id))
        .filter(Boolean)
        .slice(0, 4);
      const recentSet = new Set(recentModels.map((model) => String(model.id)));
      const sequence = recentModels.length
        ? [...recentModels, ...filtered.filter((model) => !recentSet.has(String(model.id)))]
        : filtered;
      sequence.forEach((model, index) => {
        if (recentModels.length && index === 0) list.appendChild(el('div', { class: 'popover-group-label', text: 'Recent' }));
        if (recentModels.length && index === recentModels.length) list.appendChild(el('div', { class: 'popover-group-label', text: 'All models' }));
        const conflicts = effectiveLane === 'b' && String(state.modelAId) === String(model.id);
        const capsText = (model.capabilities || []).join(' ').toLowerCase();
        const elo = eloForModel(model);
        const meta = [
          elo?.rank ? `Elo #${elo.rank}` : (model.rank ? `#${model.rank}` : ''),
          elo?.score ? `${elo.score}` : (model.arena_score ? `rating ${model.arena_score}` : ''),
          (capsText.includes('vision') || capsText.includes('image')) ? 'Vision' : '',
          (capsText.includes('pdf') || capsText.includes('document')) ? 'Docs' : '',
          /(mini|flash|lite|haiku|nano)/i.test(`${model.id || ''} ${model.name || ''}`) ? 'Light (saves daily balance)' : ''
        ].filter(Boolean).join(' · ');
        const option = popoverOption({
          title: model.name,
          desc: `${model.org || "Unknown organization"}${model.capabilities.length ? ` · ${model.capabilities.slice(0, 3).join(' · ')}` : ''}`,
          icon: '',
          selected: String(selectedId) === String(model.id),
          disabled: conflicts,
          tag: conflicts ? "in A" : '',
          meta,
          onClick: () => {
            if (selectModel(effectiveLane, model.id)) closePopover();
          }
        });
        const logoNode = modelIconNode(model);
        const iconWrap = logoNode
          ? el('span', { class: 'model-avatar has-logo' }, logoNode)
          : el('span', {
            class: 'model-avatar',
            style: { background: safeColor(model.color) || '#bdd3c1', color: '#1b231e' },
            text: initialLetters(model.name)
          });
        option.insertBefore(iconWrap, option.firstChild);
        const isFav = favs.has(String(model.id));
        const isHidden = hidden.has(String(model.id));
        const favBtn = el('span', { class: `model-pin${isFav ? ' is-fav' : ''}`, role: 'button', tabindex: '-1',
          title: isFav ? 'Unpin from top' : 'Pin to top', 'aria-label': isFav ? 'Unpin model' : 'Pin model' },
          el('span', { class: 'model-pin-glyph', text: isFav ? '★' : '☆' }));
        favBtn.addEventListener('click', (e) => { e.stopPropagation(); toggleModelPin(FAV_KEY, model.id); renderModelOptions(); });
        option.appendChild(favBtn);
        const hideBtn = el('span', { class: 'model-pin', role: 'button', tabindex: '-1',
          title: isHidden ? 'Unhide model' : 'Hide model', 'aria-label': isHidden ? 'Unhide model' : 'Hide model' }, iconEl('x'));
        hideBtn.addEventListener('click', (e) => { e.stopPropagation(); toggleModelPin(HIDDEN_KEY, model.id); renderModelOptions(); });
        option.appendChild(hideBtn);
        if (isHidden) option.classList.add('is-hidden-model');
        list.appendChild(option);
      });
      if (hidden.size && !query) {
        list.appendChild(el('div', { class: 'popover-empty', text: `${hidden.size} hidden model(s) — type to search to see and unhide them.` }));
      }
    };

    searchInput.addEventListener('input', renderModelOptions);
    renderModelOptions();

    openPopover(anchor, {
      title: `Select a model ${effectiveLane.toUpperCase()}`,
      subtitle: `${modeMeta(state.mode).label} · ${modalityMeta(state.modality).label} · only available in Arena`,
      content,
      wide: true,
      initialFocus: searchInput
    });
  }

  /* ---------------------------------------------------------------------- */
  /* Modal infrastructure                                                  */
  /* ---------------------------------------------------------------------- */
  function openFanoutPicker(anchor) {
    const content = el('div');
    content.appendChild(el('p', { class: 'modal-copy', text: 'The same prompt goes to 2–4 models; you get every answer plus a short comparison. Each answer also stays as its own sub-chat.' }));
    const searchWrap = el('div', { class: 'popover-search' }, iconEl('search'));
    const searchInput = el('input', { type: 'search', placeholder: 'Find a model', autocomplete: 'off', 'aria-label': 'Search for a model' });
    searchWrap.appendChild(searchInput);
    content.appendChild(searchWrap);
    const list = el('div', { class: 'popover-list', role: 'listbox', 'aria-label': 'Fan-out models' });
    content.appendChild(list);
    const chosen = new Set((state.fanoutModels || []).map(String));
    if (!chosen.size) [...modelPinSet(FAV_KEY)].slice(0, 3).forEach((id) => chosen.add(id));
    const useBtn = el('button', { class: 'button button-small', type: 'button' }, el('span', { text: 'Use these' }));
    const clearBtn = el('button', { class: 'button button-small button-quiet', type: 'button' }, el('span', { text: 'Turn off' }));
    content.appendChild(el('div', { class: 'popover-foot' }, clearBtn, useBtn));
    const renderFanout = () => {
      clear(list);
      const q = searchInput.value.trim().toLocaleLowerCase('en');
      state.models.filter((m) => !q || `${m.name} ${m.org}`.toLocaleLowerCase('en').includes(q)).forEach((model) => {
        const on = chosen.has(String(model.id));
        list.appendChild(popoverOption({
          title: model.name, desc: model.org || '', icon: '', selected: on,
          onClick: () => {
            if (on) chosen.delete(String(model.id));
            else if (chosen.size >= 4) { toast('At most 4 models per fan-out.', 'warning'); return; }
            else chosen.add(String(model.id));
            renderFanout();
          }
        }));
      });
      useBtn.disabled = chosen.size < 2;
      const label = useBtn.querySelector('span');
      if (label) label.textContent = chosen.size >= 2 ? `Use ${chosen.size} models` : 'Use these';
    };
    searchInput.addEventListener('input', renderFanout);
    renderFanout();
    useBtn.addEventListener('click', () => {
      state.fanoutModels = [...chosen];
      if (state.fanoutModels.length && !state.modelAId) selectModel('a', state.fanoutModels[0]);
      closePopover();
      renderComposerContext();
      toast(`Fan-out on: the next prompt goes to ${state.fanoutModels.length} models.`, 'info', 'Ask several models');
      focusComposer();
    });
    clearBtn.addEventListener('click', () => {
      state.fanoutModels = [];
      closePopover();
      renderComposerContext();
    });
    openPopover(anchor || els.modeButton, { title: 'Ask several models', subtitle: 'Direct · Text', content, wide: true, initialFocus: searchInput });
  }

  let modalSequence = 0;

  function mountModal({ title, subtitle = '', size = '', content, actions = [], onMount, onClose }) {
    closePopover(false);
    if (state.activeModal) state.activeModal.close();
    const previousFocus = document.activeElement;
    const titleId = `modal-title-${++modalSequence}`;
    modalSequence += 1;
    const descriptionId = subtitle ? `modal-desc-${modalSequence}` : '';
    const backdrop = el('div', { class: 'modal-backdrop' });
    const modal = el('section', {
      class: `modal${size ? ` modal-${size}` : ''}`,
      role: 'dialog',
      'aria-modal': 'true',
      'aria-labelledby': titleId,
      'aria-describedby': descriptionId || false
    });
    const closeButton = el('button', { class: 'icon-button', type: 'button', 'aria-label': "Close window" }, iconEl('x'));
    const head = el('header', { class: 'modal-head' },
      el('div', {}, el('h2', { id: titleId, text: title }), subtitle ? el('p', { id: descriptionId, text: subtitle }) : null),
      closeButton
    );
    const body = el('div', { class: 'modal-body' });
    if (content) append(body, content);
    const footer = el('footer', { class: 'modal-foot' });
    let closed = false;
    const close = () => {
      if (closed) return;
      closed = true;
      document.removeEventListener('keydown', onKey);
      backdrop.remove();
      if (state.activeModal?.backdrop === backdrop) state.activeModal = null;
      try { onClose?.(); } catch { /* noop */ }
      if (previousFocus && previousFocus.isConnected) {
        try { previousFocus.focus({ preventScroll: true }); } catch { previousFocus.focus(); }
      }
    };
    const onKey = (event) => {
      if (!backdrop.isConnected) return;
      if (event.key === 'Escape') {
        event.preventDefault();
        close();
        return;
      }
      trapFocus(event, modal);
    };
    closeButton.addEventListener('click', close);

    actions.forEach((action) => {
      const button = el('button', {
        class: `button${action.variant === 'danger' ? ' button-danger' : action.variant === 'primary' ? '' : ' button-quiet'}`,
        type: 'button',
        'data-autofocus': action.autofocus ? '' : false,
        disabled: Boolean(action.disabled)
      }, action.icon ? iconEl(action.icon) : null, el('span', { text: action.label }));
      button.addEventListener('click', async () => {
        if (action.onClick) {
          button.disabled = true;
          let keepOpen = false;
          try {
            const result = await action.onClick({ close, modal, body, footer, button });
            keepOpen = result === false;
          } catch (error) {
            keepOpen = true;
            toast(errorMessage(error), 'error');
          }
          if (closed) return;
          if (!keepOpen) close();
          else button.disabled = false;
        } else {
          close();
        }
      });
      footer.appendChild(button);
    });
    if (actions.length) modal.appendChild(head); else modal.appendChild(head);
    modal.append(body);
    if (actions.length) modal.appendChild(footer);
    backdrop.appendChild(modal);
    backdrop.addEventListener('pointerdown', (event) => {
      if (event.target === backdrop) close();
    });
    els.modalRoot.replaceChildren(backdrop);
    document.addEventListener('keydown', onKey);
    state.activeModal = { close, backdrop, modal, body };
    window.requestAnimationFrame(() => {
      if (!backdrop.isConnected) return;
      const preferred = modal.querySelector('[data-autofocus]') || modal.querySelector('button, input, textarea, [tabindex]:not([tabindex="-1"])');
      if (preferred) {
        try { preferred.focus({ preventScroll: true }); } catch { preferred.focus(); }
      }
      onMount?.({ close, modal, body, footer });
    });
    return { close, modal, body, footer };
  }

  /* ---------------------------------------------------------------------- */
  /* Engine / native pane                                                  */
  /* ---------------------------------------------------------------------- */
  function syncDock(notify = false) {
    if (!els.app || !els.dockPane) return;
    // In the Windows app Arena is a separate native window, not a docked pane.
    const showDemoPane = state.demo && state.engineOpen;
    els.app.dataset.dock = showDemoPane ? 'open' : 'closed';
    els.app.style.setProperty('--dock-share', String(state.dockShare || 0.42));
    els.dockPane.hidden = !showDemoPane;
    if (state.engineOpen) {
      if (els.dockSubtitle) els.dockSubtitle.textContent = state.demo ? "Demo panel" : (state.desktop ? "Native application window" : "Panel opened via API");
      if (els.dockDescription) {
        els.dockDescription.textContent = state.demo
          ? "In demo mode, the native arena.ai page does not open. Only the reserved area layout is shown; the real panel appears through the existing backend."
          : "The arena.ai page is opened in a separate application panel. Login and challenge verification are performed manually. The interface does not bypass protection and does not save passwords or tokens.";
      }
      if (els.dockNote) els.dockNote.textContent = state.demo
        ? "Demo: no request to arena.ai is executed."
        : "The content of the panel is displayed by the backend application, not this interface.";
      if (els.dockTitle) els.dockTitle.textContent = state.demo ? "arena.ai Panel · demo" : "arena.ai Panel";
    }
    if (notify) announce(state.engineOpen ? "arena.ai Panel is open." : "arena.ai Panel is hidden.");
  }

  async function showEngine() {
    if (state.engineBusy) return;
    // Opening Arena while signed out is also a login attempt: poll until it
    // succeeds so a user who signs in from this button is not left disconnected.
    if (!state.authenticated && !state.loginPending) return startLogin();
    if (state.serverError) {
      toast("Local server is unavailable. Panel is not open.", 'error', "No connection");
      return;
    }
    state.engineBusy = true;
    try {
      const result = await API.engineShow();
      state.engineKnown = true;
      state.engineOpen = result?.open ?? result?.engine ?? result?.shown ?? true;
      const engine = normalizeEngine(result?.engine);
      if (engine.known) state.dockShare = clamp(engine.share, 0.24, 0.7);
      syncDock(true);
      toast(state.demo ? "Demo: panel area is open. Real page is not loaded." : "arena.ai page is open in a separate window.", 'success', "Panel");
      void loadStatus({ quiet: true });
    } catch (error) {
      toast(errorMessage(error), 'error', "Panel is not open");
    } finally {
      state.engineBusy = false;
    }
  }

  async function hideEngine() {
    if (state.engineBusy) return;
    if (state.serverError) {
      toast("Local server is unavailable. Cannot hide the native panel.", 'error');
      return;
    }
    state.engineBusy = true;
    try {
      const result = await API.engineHide();
      state.engineKnown = true;
      state.engineOpen = Boolean(result?.open ?? result?.engine ?? false);
      syncDock(true);
      toast("arena.ai Panel is hidden.", 'success');
    } catch (error) {
      toast(errorMessage(error), 'error', "The panel is not hidden");
    } finally {
      state.engineBusy = false;
    }
  }

  window.arenaPane = function arenaPane(open, share) {
    state.engineOpen = Boolean(open);
    state.engineKnown = true;
    const parsedShare = Number(share);
    const normalizedShare = parsedShare > 1 ? parsedShare / 100 : parsedShare;
    if (Number.isFinite(normalizedShare) && normalizedShare > 0) state.dockShare = clamp(normalizedShare, 0.24, 0.7);
    state.dockLayoutCalled = true;
    syncDock(false);
  };

  /* ---------------------------------------------------------------------- */
  /* Workspace                                                             */
  /* ---------------------------------------------------------------------- */
  function isAbsolutePath(path) {
    if (!path) return false;
    return /^[a-zA-Z]:[\\/]/.test(path) || /^\\\\[^\\]/.test(path) || /^\//.test(path);
  }

  async function applyWorkspacePath(path) {
    const clean = String(path || '').trim();
    if (!clean) throw new ApiError("Enter the full path to the working folder.");
    if (!isAbsolutePath(clean)) throw new ApiError("Full path is required, for example C:\\Projects\\Arena.");
    if (state.serverError) throw new ApiError("Local server is unavailable.");
    const result = await API.setWorkspace(clean);
    state.workspace = normalizeWorkspace(result?.workspace ?? result?.path) || clean;
    state.workspaceChosen = true;
    state.workspacePanelRoot = '';
    resetWorkspaceTree();
    updateComposerState();
    renderWorkspaceTreePanel();
    scheduleWorkspaceTreeRefresh(0);
    return state.workspace;
  }

  /* ---------------------------------------------------------------------- */
  /* Run on this PC                                                         */
  /* ---------------------------------------------------------------------- */
  // Code mode runs projects in arena.ai's cloud sandbox; only the files come
  // here. This installs and starts the local copy and shows where it serves.
  const runLocal = { id: null, timer: null };

  function renderRunLocal(data) {
    const box = els.workspaceRunStatus;
    if (!box) return;
    clear(box);
    box.hidden = !data;
    if (!data) return;
    const url = (data.urls || [])[0] || '';
    const log = String(data.log || '').trim().split('\n').filter((line) => line.trim());
    const title = data.running
      ? (url ? `Running at ${url}` : 'Installing packages and starting…')
      : (url || data.stoppedByUser ? 'Stopped' : 'Stopped before it started serving');
    box.append(el('p', { class: 'workspace-run-title', text: title }));
    if (!url && log.length) box.append(el('pre', { class: 'workspace-run-log', text: log.slice(data.running ? -2 : -8).join('\n') }));
    const actions = el('div', { class: 'workspace-run-actions' });
    const add = (label, run) => {
      const b = el('button', { type: 'button', class: 'button button-quiet', text: label });
      b.addEventListener('click', run);
      actions.append(b);
    };
    if (data.running && url) add('Open', () => openPreview(url, 'Dev server'));
    if (data.running) add('Stop', () => { void stopRunLocal(); });
    else add('Close', () => renderRunLocal(null));
    box.append(actions);
  }

  async function pollRunLocal() {
    window.clearTimeout(runLocal.timer);
    if (!runLocal.id) return;
    try {
      const data = await API.runLocalState(runLocal.id);
      renderRunLocal(data);
      if (data.running) runLocal.timer = window.setTimeout(pollRunLocal, (data.urls || []).length ? 8000 : 1500);
      else runLocal.id = null;
    } catch {
      runLocal.id = null;
      renderRunLocal(null);
    }
  }

  async function startRunLocal() {
    const folder = state.workspacePanelRoot || state.workspace;
    if (!folder) { toast('Choose the project folder first.', 'warning', 'Run on this PC'); return; }
    if (runLocal.id) await stopRunLocal();
    els.workspaceRunButton?.setAttribute('aria-busy', 'true');
    try {
      const data = await API.runLocal(folder);
      runLocal.id = data.id;
      renderRunLocal(data);
      toast(`${data.cmd} in ${data.folder}`, 'info', 'Running on this PC');
      runLocal.timer = window.setTimeout(pollRunLocal, 1500);
    } catch (error) {
      toast(errorMessage(error), 'error', 'Could not run the project');
    } finally {
      els.workspaceRunButton?.removeAttribute('aria-busy');
    }
  }

  async function stopRunLocal() {
    const id = runLocal.id;
    if (!id) return;
    window.clearTimeout(runLocal.timer);
    runLocal.id = null;
    try { renderRunLocal({ ...(await API.stopRunLocal(id)), stoppedByUser: true }); } catch { renderRunLocal(null); }
  }

  async function chooseNativeFolder() {
    if (!state.nativeReady) {
      openSettings('workspace');
      toast("Native dialog pywebview is not available yet. Enter the full path manually.", 'info');
      return null;
    }
    if (!window.pywebview?.api?.choose_folder) {
      openSettings('workspace');
      toast("Method choose_folder is unavailable. Enter the path manually.", 'warning');
      return null;
    }
    try {
      const chosen = await window.pywebview.api.choose_folder();
      const path = typeof chosen === 'string' ? chosen : (chosen?.path ?? chosen?.folder ?? chosen?.directory ?? '');
      if (!path) {
        if (chosen?.error) toast(String(chosen.error), 'error', "No folder selected");
        return null;
      }
      const saved = await applyWorkspacePath(path);
      toast(saved, 'success', "Working folder saved");
      state.settingsRerender?.();
      return saved;
    } catch (error) {
      toast(errorMessage(error), 'error', "Working folder not changed");
      return null;
    }
  }

  async function openWorkspaceFolder(path = state.workspace) {
    if (state.demo) {
      toast("In the demo, the folder cannot be opened. Only the path is shown.", 'info', "Demo mode");
      return;
    }
    if (!path) {
      openSettings('workspace');
      return;
    }
    try {
      await API.openWorkspace(path);
      toast("Request to open folder sent to local server.", 'success');
    } catch (error) {
      toast(errorMessage(error), 'error', "Folder not opened");
    }
  }

  async function saveWorkspaceLane(lane) {
    if (!state.activeChatId) {
      toast("No active chat to save.", 'warning');
      return null;
    }
    if (state.demo) {
      const result = await API.saveWorkspace(state.activeChatId, lane);
      toast(`${result.path || "Demo path"}`, 'success', "Demo: save simulated");
      return result;
    }
    try {
      const result = await API.saveWorkspace(state.activeChatId, lane);
      toast(result?.path ? String(result.path) : "Server confirmed save.", 'success', "Saved to working folder");
      return result;
    } catch (error) {
      toast(errorMessage(error), 'error', "Server refused to save");
      return null;
    }
  }

  async function downloadWorkspaceZip() {
    if (state.demo) {
      toast("In demo, server ZIP export is not created. This is not a real working folder.", 'info', "Demo mode");
      return;
    }
    if (!state.workspace) {
      toast("First, select a working folder in the settings.", 'warning');
      openSettings('workspace');
      return;
    }
    try {
      const blob = await API.workspaceZip(state.workspace);
      downloadBlob(blob, `${baseName(state.workspace) || 'workspace'}.zip`);
      toast("ZIP archive of the working folder received from the local server.", 'success');
    } catch (error) {
      toast(errorMessage(error), 'error', "ZIP not created");
    }
  }

  async function saveMediaFromEvent(url, button) {
    if (!url) return;
    if (button) button.disabled = true;
    try {
      const result = await API.saveMedia(url);
      toast(result?.path ? String(result.path) : "Server saved media.", 'success', "Media saved");
    } catch (error) {
      toast(errorMessage(error), 'error', "Media not saved");
    } finally {
      if (button) button.disabled = false;
    }
  }

  /* ---------------------------------------------------------------------- */
  /* Login, logout (no credentials are requested or stored)                 */
  /* ---------------------------------------------------------------------- */
  async function startLogin({ addAccount = false } = {}) {
    if (state.loginPending) return;
    if (state.serverError || state.networkOffline) {
      toast("Local server unavailable. Login impossible.", 'error', "No connection");
      return;
    }
    state.loginPending = true;
    updateConnectionUI();
    updateAccountUI();
    state.settingsRerender?.();
    const previousAccountId = addAccount ? state.currentAccountId : null;
    try {
      const loginResult = addAccount ? await API.addAccount() : await API.login();
      if (loginResult?.challenge) {
        state.challenge = { message: textValue(loginResult.challenge) || "Login requires manual verification in the arena.ai panel." };
        renderChallenge();
        toast("Login requires manual verification. Open the arena.ai panel; automatic bypass is not performed.", 'warning', 'Challenge');
      }
      toast("Log in in the opened Arena window. After confirmation, it will close automatically.", 'info', "Arena Login");
      let completed = false;
      for (let attempt = 0; attempt < 600; attempt += 1) {
        await sleep(1000);
        if (!state.loginPending) return;
        const result = await API.loginPoll();
        if (result?.cancelled || result?.error) {
          throw new ApiError(extractError(result, 0));
        }
        const done = result?.done === true || result?.authenticated === true || result?.status === 'done';
        if (done) { completed = true; break; }
      }
      if (!completed && !state.demo) await API.engineHide().catch(() => {});
      await loadStatus({ quiet: true });
      if (state.authenticated) {
        toast(state.email || "Login completed.", 'success', "Arena connected");
        await Promise.allSettled([loadChats({ silent: true }), loadModels(state.modality), loadPermissions({ quiet: true }), refreshWorkspacePanel({ force: true })]);
        announce("Login completed.");
      } else {
        toast(completed ? "Backend finished login, but status has not updated yet. Check the state." : "Login timeout expired. Please try again.", 'warning');
      }
    } catch (error) {
      toast(errorMessage(error), 'error', "Not signed in");
      if (addAccount && previousAccountId) {
        // The Arena window was switched to a guest for the new sign-in;
        // restore the previous account into it.
        await API.switchAccount(previousAccountId).catch(() => undefined);
      }
    } finally {
      state.loginPending = false;
      updateConnectionUI();
      updateAccountUI();
      updateComposerState();
      state.settingsRerender?.();
      void loadStatus({ quiet: true });
    }
  }

  async function loginWithCookie(cookie) {
    if (state.demo || state.loginPending || !cookie.trim()) return;
    state.loginPending = true;
    updateConnectionUI();
    updateAccountUI();
    updateComposerState();
    try {
      const result = await API.loginCookie(cookie);
      if (!result?.ok) throw new ApiError(extractError(result, 0));
      await loadStatus({ quiet: true });
      if (!state.authenticated) throw new ApiError("Session imported, but the server has not confirmed the account. Check cookies and connection.");
      toast(state.email || "Login completed.", 'success', "Arena connected");
      await Promise.allSettled([loadChats({ silent: true }), loadModels(state.modality), loadPermissions({ quiet: true }), refreshWorkspacePanel({ force: true })]);
      announce("Login completed.");
    } catch (error) {
      toast(errorMessage(error), 'error', "Login via cookies not performed");
    } finally {
      state.loginPending = false;
      updateConnectionUI();
      updateAccountUI();
      updateComposerState();
      state.settingsRerender?.();
    }
  }


  function accountInitials(account) {
    const source = String(account?.name || account?.email || 'A').trim();
    const parts = source.split(/[\s@._-]+/).filter(Boolean);
    return ((parts[0]?.[0] || 'A') + (parts[1]?.[0] || '')).toUpperCase();
  }

  function accountAvatarEl(account) {
    const node = el('span', { class: 'avatar account-menu-avatar', 'aria-hidden': 'true' });
    if (account?.expired) {
      node.classList.add('is-expired');
      node.textContent = '?';
      return node;
    }
    const url = account?.avatar_url ? safeUrl(account.avatar_url, { image: true }) : '';
    if (url) node.appendChild(el('img', { src: url, alt: '', referrerpolicy: 'no-referrer' }));
    else node.textContent = accountInitials(account);
    return node;
  }

  function resetForAccountChange() {
    state.chats = [];
    state.cloudChats = [];
    state.cloudChatsError = null;
    state.messages = [];
    state.chatTurns = {};
    state.activeChatId = null;
    state.activeChatTitle = '';
    state.artifacts = [];
    state.challenge = null;
    updateArtifactCount();
    renderWelcomeState();
    updateAllUI();
  }

  async function switchToAccount(account) {
    if (!account || state.accountBusy) return;
    if (anyGenerationRunning() || state.remoteBusy) {
      toast('Finish or stop the running generations before switching accounts.', 'warning', 'Account not switched');
      return;
    }
    state.accountBusy = true;
    try {
      const result = await API.switchAccount(account.id);
      if (Array.isArray(result?.accounts)) state.accounts = result.accounts;
      closePopover(false);
      resetForAccountChange();
      await loadStatus({ quiet: true });
      await Promise.allSettled([loadChats({ silent: true }), loadArenaChats({ silent: true }), loadModels(state.modality, { quiet: true })]);
      toast(account.email || account.name || 'Account switched.', 'success', 'Account switched');
      state.settingsRerender?.();
    } catch (error) {
      const payload = error?.payload;
      if (Array.isArray(payload?.accounts)) state.accounts = payload.accounts;
      toast(errorMessage(error), 'error', payload?.expired ? 'Session expired — sign in again' : 'Account not switched');
      await loadStatus({ quiet: true }).catch(() => undefined);
    } finally {
      state.accountBusy = false;
    }
  }

  async function removeSavedAccount(account) {
    if (!account || state.accountBusy) return;
    state.accountBusy = true;
    try {
      const result = await API.removeAccount(account.id);
      if (Array.isArray(result?.accounts)) state.accounts = result.accounts;
      toast('The saved session for this account was removed from this app.', 'success', 'Account removed');
    } catch (error) {
      toast(errorMessage(error), 'error', 'Account not removed');
    } finally {
      state.accountBusy = false;
    }
  }

  function buildAccountMenu() {
    const content = el('div', { class: 'account-menu' });
    const render = () => {
      clear(content);
      content.appendChild(el('p', { class: 'account-menu-head', text: 'Accounts' }));
      const accounts = Array.isArray(state.accounts) ? state.accounts : [];
      if (!accounts.length) {
        content.appendChild(el('p', { class: 'account-menu-note', text: state.authenticated
          ? 'Signed in. Accounts you add will appear here for quick switching.'
          : 'Not signed in yet. Sign in, then add more accounts here to switch between them.' }));
      }
      accounts.forEach((account) => {
        if (account.expired) {
          const card = el('button', {
            class: 'account-expired-card', type: 'button', 'data-popover-action': 'account-expired',
            onclick: () => { closePopover(false); void startLogin({ addAccount: !account.current }); }
          },
            accountAvatarEl(account),
            el('span', { class: 'account-menu-copy' },
              el('span', { class: 'account-menu-email', text: account.email || account.name || 'Arena account' }),
              el('span', { class: 'account-menu-sub', text: 'Session expired: sign in' }))
          );
          content.appendChild(card);
          return;
        }
        const row = el('div', { class: `account-menu-row${account.current ? ' is-current' : ''}` });
        const main = el('button', {
          class: 'account-menu-main', type: 'button', 'data-popover-action': 'account-switch',
          'data-account-id': account.id || '',
          'aria-label': account.current ? `Current account: ${account.email || account.name}` : `Switch to ${account.email || account.name}`,
          onclick: () => { if (!account.current) void switchToAccount(account); }
        },
          accountAvatarEl(account),
          el('span', { class: 'account-menu-copy' },
            el('span', { class: 'account-menu-email', text: account.email || account.name || 'Arena account' }),
            el('span', { class: 'account-menu-sub', text: account.name && account.name !== account.email ? account.name : 'Arena account' })),
          account.current
            ? el('span', { class: 'account-current-label', text: 'Current' })
            : el('span', { class: 'account-menu-chev', 'aria-hidden': 'true' }, iconEl('chevron-right'))
        );
        row.appendChild(main);
        if (!account.current) {
          row.appendChild(el('button', {
            class: 'account-menu-remove', type: 'button', 'aria-label': `Remove saved account ${account.email || account.name}`,
            title: 'Forget this account on this device',
            onclick: (event) => { event.stopPropagation(); void removeSavedAccount(account).then(render); }
          }, iconEl('x')));
        }
        content.appendChild(row);
      });
      content.appendChild(el('div', { class: 'account-menu-divider', role: 'separator' }));
      const methods = el('div', { class: 'account-menu-methods', hidden: true },
        el('button', {
          class: 'account-menu-action', type: 'button', 'data-popover-action': 'account-add-window',
          onclick: () => { closePopover(false); void startLogin({ addAccount: accounts.length > 0 }); }
        }, iconEl('login'), el('span', { text: 'Sign-in window' })),
        el('button', {
          class: 'account-menu-action', type: 'button', 'data-popover-action': 'account-add-cookies',
          onclick: () => {
            closePopover(false);
            openSettings('connection');
            window.setTimeout(() => {
              const field = document.querySelector('.cookie-field');
              if (field) { field.focus(); field.scrollIntoView({ block: 'center', behavior: 'smooth' }); }
            }, 80);
          }
        }, iconEl('login'), el('span', { text: 'Use cookies' }))
      );
      content.appendChild(el('button', {
        class: 'account-menu-action', type: 'button', 'data-popover-action': 'account-add',
        'aria-expanded': 'false',
        onclick: (event) => {
          methods.hidden = !methods.hidden;
          event.currentTarget.setAttribute('aria-expanded', String(!methods.hidden));
        }
      }, iconEl('plus'), el('span', { text: accounts.length ? 'Add account' : 'Sign in' })));
      content.appendChild(methods);
      content.appendChild(el('button', {
        class: 'account-menu-action', type: 'button', 'data-popover-action': 'account-settings',
        onclick: () => { closePopover(false); openSettings('connection'); }
      }, iconEl('settings'), el('span', { text: 'Settings' })));
      content.appendChild(el('button', {
        class: 'account-menu-action', type: 'button', 'data-popover-action': 'account-help',
        onclick: () => { closePopover(false); document.querySelector('[data-action="help"]')?.click(); }
      }, iconEl('help'), el('span', { text: 'Help & shortcuts (F1)' })));
      if (state.authenticated || accounts.some((a) => a.current)) {
        content.appendChild(el('div', { class: 'account-menu-divider', role: 'separator' }));
        content.appendChild(el('button', {
          class: 'account-menu-action is-danger', type: 'button', 'data-popover-action': 'account-signout',
          onclick: () => {
            if (anyGenerationRunning() || state.remoteBusy) {
              toast('Finish or stop the running generations before signing out.', 'warning');
              return;
            }
            closePopover(false);
            void logoutAccount();
          }
        }, iconEl('logout'), el('span', { text: 'Sign out' })));
      }
    };
    render();
    content._rerender = render;
    return content;
  }

  function openAccountMenu() {
    if (!els.accountButton) return;
    if (activePopover && activePopover.trigger === els.accountButton) { closePopover(); return; }
    const content = buildAccountMenu();
    openPopover(els.accountButton, { title: 'Accounts', content, menu: true, role: 'menu' });
    void API.getAccounts?.().then((result) => {
      if (Array.isArray(result?.accounts)) {
        state.accounts = result.accounts;
        state.currentAccountId = result.current_id || state.currentAccountId;
        if (content.isConnected) content._rerender?.();
      }
    }).catch(() => undefined);
  }

  async function logoutAccount() {
    if (state.loginPending) return;
    try {
      await API.logout();
      state.authenticated = false;
      state.email = '';
      state.fullName = '';
      state.avatarUrl = '';
      state.modelAId = null;
      state.modelBId = null;
      state.chats = [];
      state.cloudChats = [];
      state.cloudChatsError = null;
      state.messages = [];
      state.chatTurns = {};
      state.activeChatId = null;
      state.activeChatTitle = '';
      state.artifacts = [];
      state.challenge = null;
      updateArtifactCount();
      renderWelcomeState();
      updateAllUI();
      await loadStatus({ quiet: true });
      state.settingsRerender?.();
      toast("Logout completed; local saved cookies file deleted.", 'success');
    } catch (error) {
      toast(errorMessage(error), 'error', "Logout not performed");
    }
  }

  /* ---------------------------------------------------------------------- */
  /* Artifacts                                                             */
  /* ---------------------------------------------------------------------- */

  /* ---------------------------------------------------------------------- */
  /* Help                                                                  */
  /* ---------------------------------------------------------------------- */
  function shortcutRow(name, keys) {
    return el('div', { class: 'shortcut-row' },
      el('span', { class: 'shortcut-name', text: name }),
      el('span', { class: 'kbd' }, keys.map((key) => el('kbd', { text: key })))
    );
  }

  function openHelp() {
    const content = el('div');
    content.appendChild(el('div', { class: 'account-status-card' },
      accountAvatarNode(),
      el('div', { class: 'account-status-copy' },
        el('span', { class: 'account-status-name', text: state.authenticated ? (state.email || "Connected") : "Not signed in" }),
        el('span', { class: 'account-status-email', text: state.demo ? "Demo profile: data simulated" : (state.serverError ? "Local server is unavailable" : "Status received from local backend") })
      ),
      el('span', { class: 'status-line' }, el('span', { class: `status-dot ${state.authenticated ? 'is-online' : 'is-pending'}`, 'aria-hidden': 'true' }), el('span', { text: state.authenticated ? "login active" : "login required" }))
    ));

    content.appendChild(el('h3', { class: 'modal-section-title', text: "Keyboard" }));
    const shortcuts = el('div', { class: 'shortcut-list' },
      shortcutRow("Open this window", ['F1']),
      shortcutRow("Send message", ['Enter']),
      shortcutRow("New line", ['Shift', 'Enter']),
      shortcutRow("Search in loaded chats", ['Ctrl', 'K']),
      shortcutRow("Focus in input field", ['Ctrl', '/']),
      shortcutRow("Close menu or window", ['Esc'])
    );
    content.appendChild(shortcuts);

    content.appendChild(el('h3', { class: 'modal-section-title', text: "Demo mode" }));
    content.appendChild(el('div', { class: 'note-box is-demo' }, iconEl('flask'), el('span', {},
      el('strong', { text: "?demo=1 — local simulation only. " }),
      document.createTextNode("Models, streaming events, permissions, files, and media — are test. Requests to arena.ai are not executed. Without the demo parameter, all data and actions go through the real local Flask backend.")
    )));
    const demoButton = el('button', {
      class: 'button button-small button-quiet', type: 'button', style: { marginTop: '8px' },
      onclick: () => {
        if (state.demo) window.location.href = window.location.pathname;
        else window.location.href = `${window.location.pathname}?demo=1`;
      }
    }, iconEl('flask'), el('span', { text: state.demo ? "Exit demo" : "Open ?demo=1" }));
    content.appendChild(demoButton);

    content.appendChild(el('h3', { class: 'modal-section-title', text: "Connection status" }));
    content.appendChild(el('p', { class: 'modal-copy', text: state.demo
      ? "Demo mode. The real backend is not queried."
      : state.serverError
        ? `Local server unavailable: ${state.serverError}`
        : state.status?.session_error
          ? `Backend session error: ${textValue(state.status.session_error)}`
          : "Relative requests go to the local Flask backend. Login — in a separate window or, optionally, through cookies of your account."
    }));
    content.appendChild(el('p', { class: 'modal-copy', text: "Arena Desktop is an unofficial client and is not associated with Arena.ai. Attach files with +, by dragging them onto the message box, or by pasting. Battle votes are sent to Arena and reveal both models." }));

    mountModal({
      title: "Arena Desktop Help",
      subtitle: "Unofficial local client",
      size: 'medium',
      content,
      actions: [
        { label: "Settings", variant: 'quiet', onClick: () => { openSettings('connection'); return true; } },
        { label: "Got it", variant: 'primary', autofocus: true }
      ]
    });
  }

  /* ---------------------------------------------------------------------- */
  /* Settings                                                              */
  // ═══ 12-settings.js ═══
  /* ---------------------------------------------------------------------- */

  async function loadPermissionModeFromServer({ quiet = true } = {}) {
    if (state.serverError) return null;
    try {
      const raw = await API.getPermissionMode();
      const candidate = validPermissionMode(raw?.mode ?? raw?.permission_mode ?? raw);
      if (candidate) {
        state.permissionMode = candidate;
        updateComposerState();
      }
      return state.permissionMode;
    } catch (error) {
      if (!quiet) toast(errorMessage(error), 'error', "Permission mode not obtained");
      return null;
    }
  }

  async function loadWorkspaceFromServer({ quiet = true } = {}) {
    if (state.serverError) return state.workspace;
    try {
      const raw = await API.getWorkspace();
      const path = normalizeWorkspace(raw);
      if (path && path !== state.workspace) {
        state.workspace = path;
        state.workspacePanelRoot = '';
        resetWorkspaceTree();
        updateComposerState();
        renderWorkspaceTreePanel();
        scheduleWorkspaceTreeRefresh(0);
      }
      return state.workspace;
    } catch (error) {
      if (!quiet) toast(errorMessage(error), 'error', "Working folder not received");
      return state.workspace;
    }
  }

  function settingsActionButton(label, icon, onClick, { variant = 'quiet', disabled = false, title = '' } = {}) {
    const button = el('button', {
      class: `button button-small${variant === 'quiet' ? ' button-quiet' : variant === 'danger' ? ' button-danger' : ''}`,
      type: 'button',
      disabled,
      title: title || false
    }, icon ? iconEl(icon) : null, el('span', { text: label }));
    button.addEventListener('click', async () => {
      button.disabled = true;
      try { await onClick({ button }); } catch (error) { toast(errorMessage(error), 'error'); }
      finally { if (button.isConnected) button.disabled = false; }
    });
    return button;
  }


  function openSettings(initialTab = 'connection') {
    const tabDefs = [
      { id: 'connection', label: 'Account', icon: 'user' },
      { id: 'permissions', label: 'Permissions', icon: 'shield' },
      { id: 'workspace', label: 'Folder', icon: 'folder' },
      { id: 'memory', label: 'Memory', icon: 'layers' },
      { id: 'automations', label: 'Automations', icon: 'clock' },
      { id: 'usage', label: 'Usage', icon: 'chart' },
      { id: 'gateway', label: 'Gateway', icon: 'globe' },
      { id: 'components', label: 'Components', icon: 'package' },
      { id: 'about', label: 'About', icon: 'info' }
    ];
    let currentTab = tabDefs.some((tab) => tab.id === initialTab) ? initialTab : 'connection';
    state.settingsTab = currentTab;
    const hydrated = {};
    const tabsBar = el('div', { class: 'settings-tabs', role: 'tablist', 'aria-label': 'Settings sections', 'aria-orientation': 'vertical' });
    const panel = el('div', { class: 'settings-panels', role: 'tabpanel', id: 'settings-panel' });
    const layout = el('div', { class: 'settings-layout' }, tabsBar, panel);
    const tabButtons = {};

    tabDefs.forEach((tab) => {
      const button = el('button', {
        class: 'settings-tab',
        type: 'button', role: 'tab', id: `settings-tab-${tab.id}`,
        'aria-selected': String(tab.id === currentTab), 'aria-controls': 'settings-panel',
        tabindex: tab.id === currentTab ? '0' : '-1'
      }, iconEl(tab.icon), el('span', { text: tab.label }));
      button.addEventListener('click', () => selectTab(tab.id, true));
      tabButtons[tab.id] = button;
      tabsBar.appendChild(button);
    });
    tabsBar.addEventListener('keydown', (event) => {
      if (!['ArrowDown', 'ArrowUp', 'ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
      event.preventDefault();
      const index = tabDefs.findIndex((tab) => tab.id === currentTab);
      let nextIndex = index;
      if (event.key === 'ArrowDown' || event.key === 'ArrowRight') nextIndex = (index + 1) % tabDefs.length;
      if (event.key === 'ArrowUp' || event.key === 'ArrowLeft') nextIndex = (index - 1 + tabDefs.length) % tabDefs.length;
      if (event.key === 'Home') nextIndex = 0;
      if (event.key === 'End') nextIndex = tabDefs.length - 1;
      selectTab(tabDefs[nextIndex].id, true);
    });

    function renderConnectionPanel() {
      const wrap = el('div');
      const account = el('div', { class: 'account-status-card' },
        accountAvatarNode(),
        el('div', { class: 'account-status-copy' },
          el('span', { class: 'account-status-name', text: state.authenticated ? (state.fullName || state.email || 'Signed in') : 'Not signed in' }),
          el('span', { class: 'account-status-email', text: state.loginPending ? 'Waiting for sign-in…' : state.demo ? 'Demo profile' : state.authenticated ? (state.email || 'Signed in to Arena') : 'Sign in to chat on Arena' })
        ),
        el('span', { class: 'status-dot ' + (state.authenticated ? 'is-online' : 'is-pending'), 'aria-hidden': 'true' })
      );
      wrap.appendChild(account);

      const actions = el('div', { class: 'setting-actions' });
      if (!state.authenticated) {
        actions.appendChild(settingsActionButton(
          state.loginPending ? 'Waiting for sign-in…' : 'Sign in',
          state.loginPending ? 'refresh' : 'login',
          async () => { await startLogin(); refreshPanel(); },
          { variant: 'primary', disabled: state.loginPending || Boolean(state.serverError) || state.networkOffline }
        ));
      } else {
        actions.appendChild(settingsActionButton('Log out', 'logout', async () => { await logoutAccount(); refreshPanel(); }));
      }
      actions.appendChild(settingsActionButton('Open arena.ai window', 'external', async () => {
        if (state.engineOpen) await hideEngine(); else await showEngine();
      }, { disabled: Boolean(state.serverError) }));
      wrap.appendChild(actions);
      wrap.appendChild(el('p', { class: 'setting-desc', text: 'Sign-in and human checks open in their own window and close by themselves when you are done.' }));

      if (!state.demo) {
        wrap.appendChild(el('h3', { class: 'modal-section-title', text: state.authenticated ? 'Add an account with cookies' : 'Sign in with cookies' }));
        wrap.appendChild(el('p', { class: 'modal-copy', text: 'On arena.ai in your browser: DevTools → Application → Cookies → arena.ai. Copy the arena-auth-prod-v1 lines as name=value pairs and paste them here.' + (state.authenticated ? ' The new account becomes current; your saved accounts stay in the account menu.' : '') }));
        const cookieField = el('textarea', { class: 'input mono cookie-field', rows: '3', autocomplete: 'off', autocapitalize: 'off', spellcheck: 'false',
          'aria-label': 'Arena cookies', placeholder: 'arena-auth-prod-v1.0=…; arena-auth-prod-v1.1=…' });
        const importButton = settingsActionButton(state.authenticated ? 'Add account with cookies' : 'Sign in with cookies', 'login', async () => {
          const cookie = cookieField.value.trim();
          cookieField.value = '';
          if (!cookie) { toast('Paste the cookies first.', 'warning'); return; }
          await loginWithCookie(cookie);
        }, { disabled: state.loginPending || Boolean(state.serverError) || state.networkOffline });
        wrap.append(cookieField, el('div', { class: 'setting-actions', style: { marginTop: '8px' } }, importButton));
        wrap.appendChild(el('p', { class: 'field-help', text: 'Cookies give full access to your account — never share them. They are stored only on this computer.' }));
      }
      if (state.serverError) {
        wrap.appendChild(el('div', { class: 'note-box is-danger', style: { marginTop: '10px' } }, iconEl('wifi-off'), el('span', { text: state.serverError })));
      } else if (state.status?.session_error) {
        wrap.appendChild(el('div', { class: 'note-box is-danger', style: { marginTop: '10px' } }, iconEl('alert'), el('span', { text: `Session error: ${textValue(state.status.session_error)}` })));
      }
      return wrap;
    }

    function renderPermissionsPanel() {
      const wrap = el('div');
      wrap.appendChild(el('h3', { class: 'modal-section-title', text: 'Local Agent permissions' }));
      wrap.appendChild(el('p', { class: 'modal-copy', text: 'What the Local Agent may do in your folder without asking. The same switch sits under the message box.' }));
      const controlsDisabled = anyGenerationRunning() || state.remoteBusy || state.pendingChanges > 0;
      const cards = el('div', { class: 'radio-cards' });
      PERMISSION_MODES.forEach((mode) => {
        const selected = state.permissionMode === mode.id;
        const label = el('label', { class: `radio-card${selected ? ' is-selected' : ''}${mode.danger ? ' is-danger-card' : ''}` });
        const input = el('input', {
          type: 'radio', name: 'permission-mode', value: mode.id,
          checked: selected, disabled: controlsDisabled,
          'aria-label': mode.label
        });
        input.addEventListener('change', async () => {
          if (!input.checked) return;
          input.disabled = true;
          await changePermissionMode(mode.id);
          refreshPanel();
        });
        label.append(input,
          el('span', { class: 'radio-indicator', 'aria-hidden': 'true' }),
          el('span', { class: 'radio-copy' },
            el('span', { class: 'radio-title' }, el('span', { text: mode.label }), mode.danger ? el('span', { class: 'radio-tag', text: 'Dangerous' }) : null),
            el('span', { class: 'radio-desc', text: mode.desc })
          )
        );
        cards.appendChild(label);
      });
      wrap.appendChild(cards);
      if (state.permissionMode === 'bypassPermissions') {
        wrap.appendChild(el('div', { class: 'note-box is-danger', style: { marginTop: '8px' } }, iconEl('shield-alert'),
          el('span', { text: 'Bypass is on: the Local Agent can change files and run commands in your folder without asking.' })));
      }

      wrap.appendChild(el('h3', { class: 'modal-section-title', text: 'Agent for new chats' }));
      wrap.appendChild(el('p', { class: 'modal-copy', text: 'Which agent new Agent Mode chats use. A started chat keeps its own agent.' }));
      const agentCards = el('div', { class: 'radio-cards' });
      [
        { id: 'native', label: 'Arena Agent', desc: "Arena's own agent: cloud workspace, search, files and Arena connectors. Recommended." },
        { id: 'local', label: 'Local Agent', desc: 'Works in the folder you pick, on this computer, under the permissions above.' }
      ].forEach((kind) => {
        const selected = state.agentKind === kind.id;
        const label = el('label', { class: `radio-card${selected ? ' is-selected' : ''}` });
        const input = el('input', {
          type: 'radio', name: 'agent-kind', value: kind.id,
          checked: selected, disabled: controlsDisabled, 'aria-label': kind.label
        });
        input.addEventListener('change', () => { if (input.checked) setAgentKind(kind.id); });
        label.append(input,
          el('span', { class: 'radio-indicator', 'aria-hidden': 'true' }),
          el('span', { class: 'radio-copy' },
            el('span', { class: 'radio-title' }, el('span', { text: kind.label })),
            el('span', { class: 'radio-desc', text: kind.desc })));
        agentCards.appendChild(label);
      });
      wrap.appendChild(agentCards);

      if (state.pendingPermissions.length) {
        wrap.appendChild(el('h3', { class: 'modal-section-title', text: `Waiting for your answer (${state.pendingPermissions.length})` }));
        const pendingWrap = el('div', { class: 'permissions-list' });
        state.pendingPermissions.forEach((permission) => {
          const item = el('div', { class: 'permission-mini' },
            el('div', { class: 'permission-mini-head' }, iconEl('shield-alert'), el('span', { text: permission.title || 'Permission request' })),
            el('div', { class: 'permission-mini-detail', text: permissionDetail(permission) }),
            el('div', { class: 'permission-mini-actions' },
              el('button', { class: 'button button-small button-allow', type: 'button', disabled: state.decidingPermissions.has(String(permission.id) || ''), onclick: () => decidePermission(permission.id, 'allow') }, el('span', { text: 'Allow once' })),
              el('button', { class: 'button button-small button-always', type: 'button', disabled: state.decidingPermissions.has(String(permission.id) || ''), onclick: () => decidePermission(permission.id, 'always') }, el('span', { text: 'Allow in this chat' })),
              el('button', { class: 'button button-small button-deny', type: 'button', disabled: state.decidingPermissions.has(String(permission.id) || ''), onclick: () => decidePermission(permission.id, 'deny') }, el('span', { text: 'Deny' }))
            )
          );
          pendingWrap.appendChild(item);
        });
        wrap.appendChild(pendingWrap);
      }
      return wrap;
    }

    function renderWorkspacePanel() {
      const wrap = el('div');
      wrap.appendChild(el('h3', { class: 'modal-section-title', text: 'Working folder' }));
      wrap.appendChild(el('div', { class: 'setting-value', text: state.workspace || 'No folder selected.' }));
      const actions = el('div', { class: 'setting-actions' },
        settingsActionButton('Select folder…', 'folder',
          async () => { await chooseNativeFolder(); refreshPanel(); },
          { variant: 'primary', disabled: anyGenerationRunning() || state.remoteBusy || Boolean(state.serverError) || !state.nativeReady }),
        settingsActionButton('Open', 'external', async () => { await openWorkspaceFolder(); }, { disabled: !state.workspace }),
        settingsActionButton('Download ZIP', 'archive', async () => { await downloadWorkspaceZip(); }, { disabled: !state.workspace })
      );
      if (state.workspaceChosen) {
        actions.appendChild(settingsActionButton('Use default folder', 'x', async () => {
          const result = await API.clearWorkspace();
          state.workspace = normalizeWorkspace(result?.workspace ?? result?.path) || state.workspace;
          state.workspaceChosen = false;
          state.workspacePanelRoot = '';
          resetWorkspaceTree();
          updateComposerState();
          renderWorkspaceTreePanel();
          scheduleWorkspaceTreeRefresh(0);
          refreshPanel();
        }));
      }
      wrap.appendChild(actions);
      wrap.appendChild(el('p', { class: 'setting-desc', text: 'The Local Agent reads and writes in this folder, and Code answers are saved here. Arena Agent uses its own cloud workspace.' }));

      if (!state.nativeReady) {
        wrap.appendChild(el('h3', { class: 'modal-section-title', text: 'Folder path' }));
        const form = el('form', { novalidate: true });
        const input = el('input', {
          class: 'input mono', type: 'text', value: state.workspace,
          placeholder: 'C:\\Projects\\My project', autocomplete: 'off', spellcheck: 'false',
          'aria-label': 'Full folder path'
        });
        const error = el('p', { class: 'form-error', role: 'alert' });
        const saveButton = el('button', { class: 'button button-small', type: 'submit' }, iconEl('check'), el('span', { text: 'Use this folder' }));
        form.append(input, error, el('div', { class: 'setting-actions' }, saveButton));
        form.addEventListener('submit', async (event) => {
          event.preventDefault();
          error.textContent = '';
          input.classList.remove('is-invalid');
          saveButton.disabled = true;
          try {
            await applyWorkspacePath(input.value);
            refreshPanel();
          } catch (saveError) {
            error.textContent = errorMessage(saveError);
            input.classList.add('is-invalid');
            input.focus();
          } finally {
            saveButton.disabled = false;
          }
        });
        wrap.appendChild(form);
      }
      return wrap;
    }

    function renderMemoryPanel() {
      const wrap = el('div');
      const data = state.memoryData || null;
      wrap.appendChild(el('h3', { class: 'modal-section-title', text: 'Memory across chats' }));
      wrap.appendChild(el('p', { class: 'setting-desc', text: "Short Markdown notes that travel with the first message of every new conversation, so models remember your projects between chats \u2014 like Claude Code's memory. General memory applies everywhere. Project memory lives in MEMORY.md inside the selected folder: models working there can update it, and Compact appends a session summary to it." }));
      if (!data) {
        wrap.appendChild(el('p', { class: 'setting-desc', text: 'Loading memory\u2026' }));
        return wrap;
      }
      const toggle = el('input', { type: 'checkbox', class: 'switch-input', checked: data.enabled !== false, 'aria-label': 'Use memory in chats' });
      wrap.appendChild(el('label', { class: 'setting-toggle-row' },
        el('span', { text: 'Use memory in chats' }),
        el('span', { class: 'switch' }, toggle, el('span', { class: 'switch-track', 'aria-hidden': 'true' }))));

      wrap.appendChild(el('h3', { class: 'modal-section-title', text: 'General memory (all projects)' }));
      const globalField = el('textarea', { class: 'input mono memory-field', rows: '6', spellcheck: 'false',
        'aria-label': 'General memory', placeholder: '- Prefer short, direct answers\n- Explain trade-offs before big changes' });
      globalField.value = data.global || '';
      wrap.appendChild(globalField);

      wrap.appendChild(el('h3', { class: 'modal-section-title', text: data.folder ? `Project memory \u2014 MEMORY.md in ${data.folder}` : 'Project memory (MEMORY.md)' }));
      const wsField = el('textarea', { class: 'input mono memory-field', rows: '8', spellcheck: 'false',
        'aria-label': 'Project memory', disabled: !data.folder,
        placeholder: data.folder ? '# Project memory\n- Stack: \u2026\n- Conventions: \u2026' : 'Select a folder first \u2014 project memory is stored as MEMORY.md inside it.' });
      wsField.value = data.workspace || '';
      wrap.appendChild(wsField);
      if (!data.folder) wrap.appendChild(el('p', { class: 'setting-desc', text: 'Choose a folder in the Folder tab to keep per-project memory next to the project itself.' }));

      const save = settingsActionButton('Save memory', 'check', async () => {
        const body = { global: globalField.value, enabled: toggle.checked };
        if (data.folder) body.workspace = wsField.value;
        const result = await API.saveMemory(body);
        state.memoryData = { ...data, global: globalField.value,
          workspace: data.folder ? wsField.value : data.workspace, enabled: result?.enabled !== false };
        toast('Memory saved. It applies from the next new conversation, or right away in a chat you compact.', 'success', 'Memory');
        refreshPanel();
      }, { variant: 'primary' });
      wrap.appendChild(el('div', { class: 'setting-actions' }, save));
      wrap.appendChild(el('p', { class: 'setting-desc', text: 'Tip: in any chat with Workspace Sync on, just tell the model \u201cremember this\u201d \u2014 it will write it to MEMORY.md itself.' }));
      return wrap;
    }

    function renderAutomationsPanel() {
      const wrap = el('div');
      wrap.appendChild(el('h3', { class: 'modal-section-title', text: 'Automations' }));
      wrap.appendChild(el('p', { class: 'setting-desc', text: 'Scheduled Local Agent runs. Each run becomes its own chat. Unattended runs use the permission mode picked per automation (Plan = read-only).' }));
      const listWrap = el('div', { class: 'automations-list' });
      wrap.appendChild(listWrap);

      const nameIn = el('input', { class: 'input', type: 'text', placeholder: 'Name (e.g. Morning report)' });
      const promptIn = el('textarea', { class: 'input', rows: '3', placeholder: 'Prompt for the agent…' });
      const kindSel = el('select', { class: 'input' },
        el('option', { value: 'daily', text: 'Daily at…' }),
        el('option', { value: 'hourly', text: 'Hourly' }),
        el('option', { value: 'every', text: 'Every N minutes' }));
      const timeIn = el('input', { class: 'input', type: 'time', value: '09:00' });
      const minsIn = el('input', { class: 'input', type: 'number', value: '120', min: '5' });
      const permSel = el('select', { class: 'input' },
        el('option', { value: 'plan', text: 'Plan (read-only)' }),
        el('option', { value: 'bypassPermissions', text: 'Full access (unattended)' }));
      const syncKind = () => {
        timeIn.hidden = kindSel.value !== 'daily';
        minsIn.hidden = kindSel.value !== 'every';
      };
      kindSel.addEventListener('change', syncKind);
      let editingId = null;
      const saveBtn = settingsActionButton('Add automation', 'plus', async () => {
        const schedule = kindSel.value === 'daily' ? `daily ${timeIn.value || '09:00'}`
          : kindSel.value === 'hourly' ? 'hourly' : `every ${Math.max(5, Number(minsIn.value) || 60)}m`;
        try {
          const body = { name: nameIn.value.trim(), prompt: promptIn.value.trim(), schedule, permission: permSel.value, enabled: true };
          if (editingId) body.id = editingId;
          await API.saveAutomation(body);
          nameIn.value = ''; promptIn.value = '';
          if (editingId) {
            editingId = null;
            saveBtn.querySelector('span').textContent = 'Add automation';
            formTitle.textContent = 'New automation';
          }
          toast('Automation saved.', 'info', 'Automations');
          void fill();
        } catch (error) { toast(errorMessage(error), 'error', 'Automations'); }
      }, { variant: 'primary' });
      const formTitle = el('h3', { class: 'modal-section-title', text: 'New automation' });
      wrap.appendChild(formTitle);
      wrap.appendChild(el('div', { class: 'automation-form' }, nameIn, promptIn,
        el('div', { class: 'automation-form-row' }, kindSel, timeIn, minsIn, permSel), saveBtn));
      syncKind();

      const fill = async () => {
        clear(listWrap);
        let items = [];
        try { items = (await API.getAutomations())?.items || []; } catch { /* offline */ }
        if (!items.length) {
          listWrap.appendChild(el('p', { class: 'setting-desc', text: 'No automations yet.' }));
          return;
        }
        items.forEach((item) => {
          const last = item.last_run ? new Date(Number(item.last_run) * 1000).toLocaleString() : 'never';
          const enabledBox = el('input', { type: 'checkbox', class: 'switch-input', checked: item.enabled !== false, 'aria-label': 'Enabled' });
          enabledBox.addEventListener('change', async () => {
            try { await API.saveAutomation({ ...item, enabled: enabledBox.checked }); }
            catch (error) { toast(errorMessage(error), 'error', 'Automations'); }
          });
          const row = el('div', { class: 'automation-row' },
            el('div', { class: 'automation-main' },
              el('span', { class: 'automation-name', text: item.name || 'Automation' }),
              el('span', { class: 'setting-desc', text: `${item.schedule} · ${item.permission === 'bypassPermissions' ? 'full access' : 'plan'} · last run: ${last}` }),
              el('span', { class: 'automation-prompt', text: item.prompt || '' })),
            el('label', { class: 'switch' }, enabledBox, el('span', { class: 'switch-track', 'aria-hidden': 'true' })),
            settingsActionButton('Edit', 'sliders', async () => {
              editingId = item.id;
              nameIn.value = item.name || '';
              promptIn.value = item.prompt || '';
              permSel.value = item.permission === 'bypassPermissions' ? 'bypassPermissions' : 'plan';
              const sched = String(item.schedule || '');
              if (sched.startsWith('daily')) {
                kindSel.value = 'daily';
                timeIn.value = (sched.match(/\d{2}:\d{2}/) || ['09:00'])[0];
              } else if (sched === 'hourly') kindSel.value = 'hourly';
              else { kindSel.value = 'every'; minsIn.value = (sched.match(/\d+/) || ['60'])[0]; }
              syncKind();
              saveBtn.querySelector('span').textContent = 'Save changes';
              formTitle.textContent = 'Edit automation';
              nameIn.focus();
            }),
            settingsActionButton('Run now', 'play', async () => {
              try { await API.runAutomation(item.id); toast('Automation started — its chat appears in the list shortly.', 'info', 'Automations'); }
              catch (error) { toast(errorMessage(error), 'error', 'Automations'); }
            }),
            settingsActionButton('Delete', 'trash', async () => {
              try { await API.deleteAutomation(item.id); void fill(); }
              catch (error) { toast(errorMessage(error), 'error', 'Automations'); }
            }));
          listWrap.appendChild(row);
        });
      };
      void fill();
      return wrap;
    }

    function installCardShell(title) {
    document.getElementById('installCard')?.remove();
    const body = el('div', { class: 'install-card-body' });
    const card = el('div', { class: 'install-card', id: 'installCard', role: 'status' },
      el('div', { class: 'install-card-head' },
        el('strong', { text: title }),
        el('button', {
          class: 'icon-button tiny', type: 'button', 'aria-label': 'Close',
          onclick: () => card.remove()
        }, iconEl('x'))),
      body);
    document.body.appendChild(card);
    return { card, body };
  }

  function runComponentInstall(id, name, onDone) {
    const { card, body } = installCardShell(`Installing ${name}`);
    const fillBar = el('div', { class: 'install-progress-fill' });
    const note = el('p', { class: 'modal-note', text: 'Starting…' });
    body.append(note, el('div', { class: 'install-progress' }, fillBar));
    let timer = null;
    const finish = (ok, message) => {
      if (timer) clearInterval(timer);
      note.textContent = message;
      if (ok) {
        fillBar.style.width = '100%';
        try { onDone?.(); } catch { /* noop */ }
        setTimeout(() => card.remove(), 1400);
      }
    };
    void (async () => {
      try {
        const result = await API.installComponent(id);
        if (result?.open_url) {
          window.open(result.open_url, '_blank', 'noopener');
          finish(false, 'The official download page opened in your browser. Install it there — Settings → Components detects it afterwards.');
          return;
        }
        timer = setInterval(() => {
          if (!card.isConnected) { clearInterval(timer); return; }
          void (async () => {
            try {
              const data = await API.getComponents();
              const job = data?.jobs?.[id] || {};
              if (typeof job.progress === 'number') fillBar.style.width = `${job.progress}%`;
              if (job.state === 'done') finish(true, `${name} is installed.`);
              else if (job.state === 'installer_started') finish(false, job.hint || 'Complete the installer window — Components detects it afterwards.');
              else if (job.state === 'error') finish(false, job.error || 'Installation failed.');
              else note.textContent = `Downloading… ${Math.round(job.progress || 0)}%`;
            } catch { /* keep polling */ }
          })();
        }, 700);
      } catch (error) {
        finish(false, errorMessage(error));
      }
    })();
  }

  function showCloudflaredInstallModal(onDone) {
    const { card, body } = installCardShell('Component needed: cloudflared');
    body.append(
      el('p', { class: 'modal-note', text: 'The Agent Gateway reaches this computer through a temporary Cloudflare tunnel. That needs cloudflared — a single official Cloudflare file (about 53 MB), downloaded once into the app\u2019s data folder and verified by checksum. No administrator rights, nothing else is installed.' }),
      el('div', { class: 'install-card-actions' },
        el('button', { class: 'button button-small button-quiet', type: 'button', onclick: () => card.remove() },
          el('span', { text: 'Not now' })),
        el('button', {
          class: 'button button-small', type: 'button',
          onclick: () => runComponentInstall('cloudflared', 'cloudflared', onDone)
        }, iconEl('download'), el('span', { text: 'Install cloudflared' }))));
  }

  function renderComponentsPanel() {
    const wrap = el('div', { class: 'memory-panel' });
    const listHost = el('div', {}, el('p', { class: 'modal-note', text: 'Checking components…' }));
    const fill = async () => {
      let data = null;
      try { data = await API.getComponents(); } catch (_err) { /* below */ }
      if (!wrap.isConnected) return;
      clear(listHost);
      if (!data?.components) {
        listHost.appendChild(el('p', { class: 'modal-note', text: 'Component status is unavailable right now.' }));
        return;
      }
      data.components.forEach((comp) => {
        const job = data.jobs?.[comp.id] || {};
        const installing = job.state === 'downloading';
        const status = el('span', {
          class: `component-pill${comp.installed ? ' is-on' : ''}`,
          text: comp.installed ? `Installed${comp.version ? ` · ${comp.version}` : ''}` : 'Not installed'
        });
        const action = comp.installed ? null : el('button', {
          class: 'button button-small', type: 'button', disabled: installing,
          onclick: () => runComponentInstall(comp.id, comp.name, () => { void fill(); })
        }, iconEl('download'), el('span', { text: installing ? 'Installing…' : 'Install' }));
        const details = [comp.purpose, comp.source ? `Source: ${comp.source}.` : '', comp.note || '']
          .filter(Boolean).join(' ');
        listHost.appendChild(el('div', { class: 'component-row' },
          el('div', { class: 'component-main' },
            el('div', { class: 'component-head' },
              el('span', { class: 'component-name', text: comp.name }), status),
            el('p', { class: 'modal-note', text: details })),
          action));
      });
    };
    wrap.append(
      el('h3', { class: 'modal-section-title', text: 'Components' }),
      el('p', { class: 'modal-note', text: 'Optional. Only installed when you ask.' }),
      el('div', { class: 'modal-field-row' },
        el('span', { class: 'modal-field-label', text: 'Status' }),
        el('button', { class: 'btn ghost small', type: 'button', onclick: () => { void fill(); } },
          el('span', { text: 'Check again' }))),
      listHost);
    requestAnimationFrame(() => { void fill(); });
    return wrap;
  }

  function renderGatewayPanel() {
    const wrap = el('div', { class: 'memory-panel' });
    wrap.appendChild(el('h3', { class: 'modal-section-title', text: 'Agent Gateway' }));
    wrap.appendChild(el('p', { class: 'modal-note', text: 'Connects Arena Agent to your local MCP servers and Workspace folder via a temporary Cloudflare tunnel. Off by default.' }));
    const host = el('div', {}, el('p', { class: 'modal-note', text: 'Loading gateway status…' }));
    wrap.appendChild(host);
    let poll = null;
    const stopPoll = () => { if (poll) { clearInterval(poll); poll = null; } };

    const toggleRow = (label, checked, aria, onChange, disabled = false) => {
      const input = el('input', { type: 'checkbox', class: 'switch-input', checked: Boolean(checked), disabled: Boolean(disabled), 'aria-label': aria });
      input.addEventListener('change', () => { void onChange(input); });
      return el('label', { class: 'setting-toggle-row' },
        el('span', { text: label }),
        el('span', { class: 'switch' }, input, el('span', { class: 'switch-track', 'aria-hidden': 'true' })));
    };

    const fill = async () => {
      let data = null;
      try { data = await API.getGateway(); } catch (_err) { /* below */ }
      if (!wrap.isConnected) { stopPoll(); return; }
      clear(host);
      if (!data) {
        host.appendChild(el('p', { class: 'modal-note', text: 'Gateway status is unavailable right now.' }));
        return;
      }
      const session = data.session || {};
      const cfg = state.appSettings || {};
      host.appendChild(toggleRow('Enable Agent Gateway', data.enabled, 'Enable Agent Gateway', async (input) => {
        await API.saveSettings({ gateway_enabled: input.checked });
        state.appSettings = { ...cfg, gateway_enabled: input.checked };
        if (input.checked) {
          try {
            const comps = await API.getComponents();
            const cf = (comps?.components || []).find((c) => c.id === 'cloudflared');
            if (cf && !cf.installed) showCloudflaredInstallModal(() => { void fill(); });
          } catch { /* install offer is best-effort */ }
        } else if (session.state === 'on') {
          await API.stopGateway().catch(() => undefined);
        }
        void fill();
      }));
      host.appendChild(toggleRow('Start automatically with Workspace Sync (Agent chats)', data.auto, 'Auto-start gateway', async (input) => {
        await API.saveSettings({ gateway_auto: input.checked });
        state.appSettings = { ...(state.appSettings || {}), gateway_auto: input.checked };
        if (input.checked) toast('Agent chats will start the gateway when needed and hand the address to the agent automatically while Workspace Sync is on.', 'info', 'Agent Gateway');
        void fill();
      }, !data.enabled));

      host.appendChild(el('h4', { class: 'modal-mini-title', text: 'MCP servers to expose' }));
      const available = (data.available || []).filter((s) => (s.transport || 'stdio') === 'stdio');
      if (!available.length) {
        host.appendChild(el('p', { class: 'modal-note', text: 'No local MCP servers configured yet. Add one in the Connectors panel (Local MCP), then come back here.' }));
      } else {
        const chosenSet = new Set(Array.isArray(data.chosen) ? data.chosen : available.filter((s) => s.enabled).map((s) => s.name));
        const list = el('div', { class: 'gateway-servers' });
        available.forEach((server) => {
          const box = el('input', { type: 'checkbox', checked: chosenSet.has(server.name), disabled: !server.enabled || !data.enabled });
          box.addEventListener('change', async () => {
            const picks = [...list.querySelectorAll('input[type="checkbox"]')]
              .filter((i) => i.checked).map((i) => i.dataset.server);
            await API.saveSettings({ gateway_servers: picks });
            state.appSettings = { ...(state.appSettings || {}), gateway_servers: picks };
            if (session.state === 'on') toast('Server selection applies to the next gateway session.', 'info', 'Agent Gateway');
          });
          box.dataset.server = server.name;
          list.appendChild(el('label', { class: 'gateway-server-row' }, box,
            el('span', { text: server.name }),
            server.enabled ? null : el('span', { class: 'muted', text: ' (disabled in Connectors)' })));
        });
        host.appendChild(list);
      }

      host.appendChild(el('h4', { class: 'modal-mini-title', text: 'Workspace folder' }));
      const ws = data.workspace || {};
      host.appendChild(toggleRow('Expose the picked Workspace folder (files + shell inside it)', ws.exposed !== false, 'Expose workspace folder', async (input) => {
        await API.saveSettings({ gateway_workspace: input.checked });
        state.appSettings = { ...(state.appSettings || {}), gateway_workspace: input.checked };
        if (session.state === 'on') toast('Workspace exposure applies to the next gateway session.', 'info', 'Agent Gateway');
        void fill();
      }, !data.enabled || !ws.available));
      host.appendChild(el('p', { class: 'modal-note', text: ws.available
        ? `Folder: ${ws.folder}. The agent can list, read, search, write and edit files inside it and run shell commands there — paths cannot escape the folder, and changes follow your Permissions mode.`
        : 'No folder picked yet — choose one in the composer Workspace menu, then it can be exposed here.' }));

      host.appendChild(el('h4', { class: 'modal-mini-title', text: 'Session' }));
      if (session.state === 'on') {
        const expires = session.expires_at ? new Date(session.expires_at * 1000).toLocaleTimeString() : '';
        const copyRow = (label, value) => el('div', { class: 'modal-field-row' },
          el('span', { class: 'modal-field-label', text: label }),
          el('span', { class: 'muted gateway-mono', text: value || '', title: value || '' }),
          el('button', {
            class: 'button button-small button-quiet', type: 'button',
            onclick: async () => { await copyText(value || ''); toast(`${label} copied.`, 'success'); }
          }, iconEl('copy'), el('span', { text: 'Copy' })));
        host.append(
          el('p', { class: 'modal-note', text: `Running${expires ? ` · ends by ${expires}` : ''} · ${(session.servers || []).length} server(s) exposed. Agent chats receive these automatically${data.auto ? '' : ' when auto-start is on'}; you can also paste them into an arena.ai Agent chat manually.` }),
          copyRow('Gateway URL', session.url),
          copyRow('Pairing code', session.pairing));
        const recent = (session.calls || []).slice(0, 8);
        if (recent.length) {
          host.appendChild(el('h4', { class: 'modal-mini-title', text: 'Recent calls' }));
          recent.forEach((call) => {
            host.appendChild(el('div', { class: 'modal-field-row' },
              el('span', { class: 'modal-field-label', text: call.ts ? new Date(call.ts * 1000).toLocaleTimeString() : '' }),
              el('span', { class: 'muted', text: `${call.server}:${call.tool} · ${call.ok ? 'ok' : 'failed'} · ${call.ms} ms` })));
          });
        }
        host.appendChild(el('button', {
          class: 'button button-danger', type: 'button',
          onclick: async () => { await API.stopGateway().catch(() => undefined); toast('Gateway session stopped and pairing revoked.', 'info', 'Agent Gateway'); void fill(); }
        }, iconEl('x'), el('span', { text: 'Stop & revoke' })));
      } else {
        if (session.error) host.appendChild(el('p', { class: 'modal-note', text: `Last session: ${session.error}` }));
        const startBtn = el('button', {
          class: 'button', type: 'button', disabled: !data.enabled,
          onclick: async () => {
            startBtn.disabled = true;
            startBtn.querySelector('span:last-child').textContent = 'Starting tunnel…';
            try {
              await API.startGateway();
              toast('Gateway session is live. Open an Agent chat.', 'success', 'Agent Gateway');
            } catch (error) {
              if (error?.details?.code === 'cloudflared_missing') {
                showCloudflaredInstallModal(() => { void fill(); });
              } else {
                toast(errorMessage(error), 'error', 'Agent Gateway');
              }
            }
            void fill();
          }
        }, iconEl('globe'), el('span', { text: 'Start session now' }));
        host.append(startBtn,
          el('p', { class: 'modal-note', text: data.enabled
            ? 'A session lasts until you stop it, the app closes, 45 idle minutes pass, or 8 hours elapse.'
            : 'Enable the gateway above first.' }));
      }
    };
    requestAnimationFrame(() => { void fill(); });
    poll = setInterval(() => { if (!wrap.isConnected) { stopPoll(); return; } void fill(); }, 5000);
    return wrap;
  }

  function renderUsagePanel() {
    const wrap = el('div', 'memory-panel');
    const humanWait = (w) => {
      const s = Number(w) || 0;
      if (!s) return '';
      if (s < 90) return `resets in ~${Math.round(s)}s`;
      if (s < 5400) return `resets in ~${Math.round(s / 60)}m`;
      return `resets in ~${Math.round(s / 3600)}h`;
    };
    const fill = async () => {
      const body = $('#usageBody', wrap);
      if (!body) return;
      let data = null;
      try { data = await API.getUsage(); } catch (_err) { /* shown below */ }
      if (!data || !data.days) {
        body.innerHTML = '<p class="modal-note">Usage data is unavailable right now.</p>';
        return;
      }
      const days = data.days || {};
      const todayKey = data.today || '';
      const today = days[todayKey] || {};
      const accountRow = (id, a) => {
        const models = Object.entries(a.models || {})
          .sort((x, y) => y[1] - x[1]).slice(0, 5)
          .map(([m, n]) => `${m} \u00D7${n}`).join(', ');
        const byMod = a.by_modality || {};
        const bits = [`${a.sends || 0} sends`,
          `text ${byMod.text || 0}`, `media ${byMod.media || 0}`,
          `${a.rate_limits || 0} rate limits`];
        return `<div class="modal-field-row" style="align-items:flex-start">
          <span class="modal-field-label">${esc(a.email || id)}</span>
          <span class="muted">${esc(bits.join(' \u00B7 '))}${models ? `<br>${esc(models)}` : ''}</span></div>`;
      };
      const BUCKET_NAMES = { evaluation: 'Chat, Code, Direct, Battle', agent: 'Agent' };
      const buckets = (data.buckets || {})[data.current_account] || {};
      const bucketRows = Object.entries(buckets).map(([name, b]) => {
        const left = b.remaining != null ? `<strong class="tabular">${esc(b.remaining)}</strong>${b.limit != null ? ` of ${esc(b.limit)}` : ''} left` : 'Limit reported';
        const reset = b.reset ? ` \u00B7 resets in ${esc(humanWait(b.reset - Date.now() / 1000))}` : '';
        return `<div class="modal-field-row"><span class="modal-field-label">${esc(BUCKET_NAMES[name] || name)}</span>
          <span>${left}${reset}<br><span class="muted">as of ${esc(new Date(b.ts * 1000).toLocaleTimeString())}</span></span></div>`;
      }).join('');
      const liveHtml = bucketRows
        ? bucketRows + '<p class="modal-note">Arena reports each limit with its replies, so a bucket shows after you send in that mode.</p>'
        : '<p class="modal-note">Arena reports your remaining requests with each reply. Send a message to see it here.</p>';
      const todayHtml = Object.keys(today).length
        ? Object.entries(today).map(([id, a]) => accountRow(id, a)).join('')
        : '<p class="modal-note">No sends recorded yet today.</p>';
      const past = Object.entries(days).filter(([d]) => d !== todayKey).sort((x, y) => (x[0] < y[0] ? 1 : -1));
      const pastHtml = past.map(([d, accts]) => {
        const sends = Object.values(accts).reduce((n, a) => n + (a.sends || 0), 0);
        const limits = Object.values(accts).reduce((n, a) => n + (a.rate_limits || 0), 0);
        return `<div class="modal-field-row"><span class="modal-field-label">${esc(d)}</span><span class="muted">${sends} sends \u00B7 ${limits} rate limits</span></div>`;
      }).join('');
      const eventsHtml = (data.events || []).slice(0, 10).map((ev) => {
        const when = ev.ts ? new Date(ev.ts * 1000).toLocaleString() : '';
        const what = [ev.modality, ev.model].filter(Boolean).join(' \u00B7 ');
        return `<div class="modal-field-row" style="align-items:flex-start">
          <span class="modal-field-label">${esc(when)}</span>
          <span class="muted">${esc([what, humanWait(ev.wait)].filter(Boolean).join(' \u00B7 '))}${ev.message ? `<br>${esc(String(ev.message).slice(0, 140))}` : ''}</span></div>`;
      }).join('') || '<p class="modal-note">No rate limits recorded. Nice.</p>';
      body.innerHTML = `
        <h4 class="modal-mini-title">Arena limit</h4>
        ${liveHtml}
        <h4 class="modal-mini-title">Today</h4>
        ${todayHtml}
        <h4 class="modal-mini-title">Recent rate limits</h4>
        ${eventsHtml}
        ${past.length ? `<h4 class="modal-mini-title">Previous days</h4>${pastHtml}` : ''}`;
    };
    wrap.innerHTML = `
      <h3 class="modal-section-title">Usage &amp; Arena limits</h3>
      <p class="modal-note">Arena has a daily balance per account. Heavier models cost more. Agent mode re-sends history each round.</p>
      <details class="limits-details">
        <summary class="limits-summary">Rate limit details</summary>
        <ul class="limits-list compact">
          <li><strong>Daily balance</strong> \u2014 resets every 24h. Heavy models drain faster.</li>
          <li><strong>Battle</strong> \u2014 counts as 2 sends. Votes are free.</li>
          <li><strong>Video / images</strong> \u2014 heavily limited, few per day.</li>
          <li><strong>429s</strong> \u2014 auto-retried when pacing is on.</li>
        </ul>
      </details>
      <div class="modal-field-row"><span class="modal-field-label">Send log</span>
        <button class="btn ghost small" id="usageRefresh" type="button">Refresh</button></div>
      <div id="usageBody"><p class="modal-note">Loading usage\u2026</p></div>`;
    const safeFill = () => fill().catch((err) => {
      const body = $('#usageBody', wrap);
      if (body) body.innerHTML = `<p class="modal-note">Could not show usage: ${esc(err?.message || err)}</p>`;
    });
    $('#usageRefresh', wrap)?.addEventListener('click', () => { void safeFill(); });
    requestAnimationFrame(() => { void safeFill(); });
    return wrap;
  }

  function renderAboutPanel() {
      const wrap = el('div');
      const logoMark = el('div', { class: 'about-mark' });
      logoMark.innerHTML = '<svg viewBox="0 0 512 512" width="56" height="56" style="border-radius:12px"><rect width="512" height="512" rx="96" fill="#1a1f1e"/><g transform="translate(256,180)"><rect x="-100" y="-60" width="24" height="110" rx="5" fill="#F4F0EB"/><rect x="-52" y="-100" width="24" height="150" rx="5" fill="#F4F0EB"/><rect x="-12" y="-130" width="24" height="180" rx="5" fill="#F4F0EB"/><rect x="28" y="-100" width="24" height="150" rx="5" fill="#F4F0EB"/><rect x="76" y="-60" width="24" height="110" rx="5" fill="#F4F0EB"/><line x1="-110" y1="55" x2="110" y2="55" stroke="#F4F0EB" stroke-width="6" stroke-linecap="round"/></g><rect x="244" y="310" width="14" height="14" rx="2" fill="#34d399"/><text x="256" y="356" text-anchor="middle" fill="#F4F0EB" font-family="system-ui,sans-serif" font-size="42" font-weight="700" letter-spacing="6">ARENA</text><text x="256" y="388" text-anchor="middle" fill="#9db6a0" font-family="system-ui,sans-serif" font-size="22" font-weight="500" letter-spacing="8">CLI</text></svg>';
      wrap.appendChild(logoMark);
      wrap.appendChild(el('h3', { class: 'about-title', text: 'Arena Desktop' }));
      wrap.appendChild(el('p', { class: 'about-sub', text: state.appVersion ? `Version ${state.appVersion}` : 'Desktop client' }));
      wrap.appendChild(el('p', { class: 'modal-copy', text: 'Unofficial desktop client for arena.ai. Not affiliated with Arena.' }));
      wrap.appendChild(el('div', { class: 'setting-actions' },
        settingsActionButton('GitHub', 'external', async () => { window.open('https://github.com/PlayzAe/arena.ai-desktop', '_blank', 'noopener'); }),
        settingsActionButton('Terms of Use', 'external', async () => { window.open('https://help.arena.ai/articles/5629909088-terms-of-use', '_blank', 'noopener'); }),
        settingsActionButton('Privacy Policy', 'external', async () => { window.open('https://help.arena.ai/articles/3765052346-privacy-policy', '_blank', 'noopener'); })
      ));

      wrap.appendChild(el('h3', { class: 'modal-section-title', text: 'App' }));
      const info = state.updateInfo;
      const cfg = state.appSettings || {};
      if (info?.update) {
        wrap.appendChild(el('p', { class: 'setting-desc', text: `Version ${info.latest} is available (you have ${info.current}).` }));
      }
      const updActions = el('div', { class: 'setting-actions' });
      if (info?.update && info?.url) {
        updActions.appendChild(settingsActionButton(info.can_install ? `Update to ${info.latest}` : `Get ${info.latest}`, 'download', async () => {
          if (info.can_install) openUpdateModal(info); else window.open(info.url, '_blank', 'noopener');
        }, { variant: 'primary' }));
      }
      updActions.appendChild(settingsActionButton('Check for updates', 'refresh', async () => {
        const fresh = await API.updateCheck(true);
        state.updateInfo = fresh;
        toast(fresh?.update ? `Version ${fresh.latest} is available.` : fresh?.error ? `Could not check: ${fresh.error}` : 'You are up to date.', fresh?.error ? 'warning' : 'info', 'Updates');
        refreshPanel();
      }));
      wrap.appendChild(updActions);
      const updToggle = el('input', { type: 'checkbox', class: 'switch-input', checked: cfg.update_check !== false, 'aria-label': 'Check for updates automatically' });
      updToggle.addEventListener('change', async () => {
        await API.saveSettings({ update_check: updToggle.checked });
        state.appSettings = { ...(state.appSettings || {}), update_check: updToggle.checked };
        if (state.updateInfo) state.updateInfo = { ...state.updateInfo, enabled: updToggle.checked };
      });
      wrap.appendChild(el('label', { class: 'setting-toggle-row' },
        el('span', { text: 'Check for updates automatically' }),
        el('span', { class: 'switch' }, updToggle, el('span', { class: 'switch-track', 'aria-hidden': 'true' }))));
      const betaToggle = el('input', { type: 'checkbox', class: 'switch-input', checked: Boolean(cfg.beta_updates), 'aria-label': 'Beta update channel' });
      betaToggle.addEventListener('change', async () => {
        await API.saveSettings({ beta_updates: betaToggle.checked });
        state.appSettings = { ...(state.appSettings || {}), beta_updates: betaToggle.checked };
        const fresh = await API.updateCheck(true).catch(() => null);
        if (fresh) state.updateInfo = fresh;
        toast(betaToggle.checked ? 'Beta channel on: pre-releases count as updates.' : 'Back to stable releases only.', 'info', 'Updates');
        refreshPanel();
      });
      wrap.appendChild(el('label', { class: 'setting-toggle-row' },
        el('span', { text: 'Beta update channel (include pre-releases)' }),
        el('span', { class: 'switch' }, betaToggle, el('span', { class: 'switch-track', 'aria-hidden': 'true' }))));
      const eloToggle = el('input', { type: 'checkbox', class: 'switch-input', checked: cfg.elo_enabled !== false, 'aria-label': 'Leaderboard Elo in model picker' });
      eloToggle.addEventListener('change', async () => {
        await API.saveSettings({ elo_enabled: eloToggle.checked });
        state.appSettings = { ...(state.appSettings || {}), elo_enabled: eloToggle.checked };
        state.eloModels = eloToggle.checked ? null : {};
      });
      wrap.appendChild(el('label', { class: 'setting-toggle-row' },
        el('span', { text: 'Show leaderboard Elo in the model picker' }),
        el('span', { class: 'switch' }, eloToggle, el('span', { class: 'switch-track', 'aria-hidden': 'true' }))));
      const acToggle = el('input', { type: 'checkbox', class: 'switch-input', checked: cfg.auto_continue !== false, 'aria-label': 'Auto-continue on error' });
      acToggle.addEventListener('change', async () => {
        await API.saveSettings({ auto_continue: acToggle.checked });
        state.appSettings = { ...(state.appSettings || {}), auto_continue: acToggle.checked };
      });
      wrap.appendChild(el('label', { class: 'setting-toggle-row' },
        el('span', { text: 'Auto-continue on error (up to 2 attempts)' }),
        el('span', { class: 'switch' }, acToggle, el('span', { class: 'switch-track', 'aria-hidden': 'true' }))));
      const soundToggle = el('input', { type: 'checkbox', class: 'switch-input', checked: cfg.notify_sound !== false, 'aria-label': 'Sound when a chat finishes in the background' });
      soundToggle.addEventListener('change', async () => {
        await API.saveSettings({ notify_sound: soundToggle.checked });
        state.appSettings = { ...(state.appSettings || {}), notify_sound: soundToggle.checked };
      });
      wrap.appendChild(el('label', { class: 'setting-toggle-row' },
        el('span', { text: 'Sound when a chat finishes while the window is in the background' }),
        el('span', { class: 'switch' }, soundToggle, el('span', { class: 'switch-track', 'aria-hidden': 'true' }))));
      const pacingToggle = el('input', { type: 'checkbox', class: 'switch-input', checked: cfg.pacing !== false, 'aria-label': 'Pace requests to avoid Arena rate limits' });
      const pacingPreset = el('select', { class: 'input', 'aria-label': 'Pacing strength' },
        el('option', { value: 'gentle', text: 'Gentle' }),
        el('option', { value: 'strict', text: 'Strict' }));
      pacingPreset.value = cfg.pacing_preset === 'strict' ? 'strict' : 'gentle';
      pacingPreset.disabled = cfg.pacing === false;
      pacingToggle.addEventListener('change', async () => {
        await API.saveSettings({ pacing: pacingToggle.checked });
        state.appSettings = { ...(state.appSettings || {}), pacing: pacingToggle.checked };
        pacingPreset.disabled = !pacingToggle.checked;
      });
      pacingPreset.addEventListener('change', async () => {
        await API.saveSettings({ pacing_preset: pacingPreset.value });
        state.appSettings = { ...(state.appSettings || {}), pacing_preset: pacingPreset.value };
      });
      wrap.appendChild(el('label', { class: 'setting-toggle-row' },
        el('span', { text: 'Pace requests (avoid Arena rate limits)' }),
        el('span', { class: 'switch' }, pacingToggle, el('span', { class: 'switch-track', 'aria-hidden': 'true' }))));
      wrap.appendChild(el('label', { class: 'setting-toggle-row' },
        el('span', { text: 'Pacing strength' }), pacingPreset));
      wrap.appendChild(el('p', { class: 'setting-desc', text: 'Spaces out requests and auto-retries 429s.' }));
      const cheapToggle = el('input', { type: 'checkbox', class: 'switch-input', checked: cfg.cheap_subagents !== false, 'aria-label': 'Lighter models for research subagents' });
      cheapToggle.addEventListener('change', async () => {
        await API.saveSettings({ cheap_subagents: cheapToggle.checked });
        state.appSettings = { ...(state.appSettings || {}), cheap_subagents: cheapToggle.checked };
      });
      wrap.appendChild(el('label', { class: 'setting-toggle-row' },
        el('span', { text: 'Lighter models for research subagents' }),
        el('span', { class: 'switch' }, cheapToggle, el('span', { class: 'switch-track', 'aria-hidden': 'true' }))));
      const failoverToggle = el('input', { type: 'checkbox', class: 'switch-input', checked: cfg.account_failover === true, 'aria-label': 'Continue on another account at daily limit' });
      failoverToggle.addEventListener('change', async () => {
        await API.saveSettings({ account_failover: failoverToggle.checked });
        state.appSettings = { ...(state.appSettings || {}), account_failover: failoverToggle.checked };
        if (failoverToggle.checked) toast('When a daily limit hits mid-task, the app will switch to another saved account and continue in a fresh session. Rotating accounts to work around a daily cap conflicts with Arena fair-use expectations and may flag the accounts \u2014 use only if you understand the risk.', 'info', 'Account failover');
      });
      wrap.appendChild(el('label', { class: 'setting-toggle-row' },
        el('span', { text: 'Continue on another account at daily limit' }),
        el('span', { class: 'switch' }, failoverToggle, el('span', { class: 'switch-track', 'aria-hidden': 'true' }))));
      wrap.appendChild(el('p', { class: 'setting-desc', text: 'Off by default. Same-IP accounts may share limits.' }));
      const trayToggle = el('input', { type: 'checkbox', class: 'switch-input', checked: Boolean(cfg.tray_enabled), 'aria-label': 'Keep in system tray when closed' });
      trayToggle.addEventListener('change', async () => {
        await API.saveSettings({ tray_enabled: trayToggle.checked });
        state.appSettings = { ...(state.appSettings || {}), tray_enabled: trayToggle.checked };
        toast('Tray setting saved \u2014 it takes effect on the next launch. While the tray is on, closing the window hides it and Ctrl+Alt+A shows or hides it.', 'info', 'System tray');
      });
      wrap.appendChild(el('label', { class: 'setting-toggle-row' },
        el('span', { text: 'Keep in system tray when closed' }),
        el('span', { class: 'switch' }, trayToggle, el('span', { class: 'switch-track', 'aria-hidden': 'true' }))));

      wrap.appendChild(el('h3', { class: 'modal-section-title', text: 'Quick diagnostics' }));
      const diagList = el('div', { class: 'diag-list' });
      const testNames = ['Arena.ai connection', 'Account health', 'Encryption (DPAPI)', 'Workspace access', 'Update server (GitHub)'];
      testNames.forEach(name => {
        diagList.appendChild(el('div', { class: 'diag-row diag-pending' },
          el('span', { class: 'diag-dot' }),
          el('span', { class: 'diag-name', text: name }),
          el('span', { class: 'diag-ms' })
        ));
      });
      const runBtn = settingsActionButton('Run all tests', 'play', async () => {
        runBtn.disabled = true;
        diagList.querySelectorAll('.diag-row').forEach(r => { r.className = 'diag-row diag-running'; r.querySelector('.diag-ms').textContent = ''; });
        try {
          const data = await API.diagnosticsRun();
          const rows = diagList.querySelectorAll('.diag-row');
          (data?.results || []).forEach((r, i) => {
            if (!rows[i]) return;
            rows[i].className = 'diag-row ' + (r.ok === true ? 'diag-pass' : r.ok === false ? 'diag-fail' : 'diag-skip');
            rows[i].querySelector('.diag-ms').textContent = r.ok === null ? (r.detail || '—') : r.ms + 'ms';
            if (r.detail && r.ok === false) rows[i].title = r.detail;
          });
        } catch { diagList.querySelectorAll('.diag-row').forEach(r => { r.className = 'diag-row diag-fail'; }); }
        runBtn.disabled = false;
      });
      const diagActions = el('div', { class: 'setting-actions' });
      diagActions.appendChild(runBtn);
      wrap.appendChild(diagActions);
      wrap.appendChild(diagList);

      wrap.appendChild(el('h3', { class: 'modal-section-title', text: 'Settings backup' }));
      const ioActions = el('div', { class: 'setting-actions' });
      ioActions.appendChild(settingsActionButton('Export settings', 'download', async () => { await exportSettingsFile(); }));
      const importInput = el('input', { type: 'file', accept: 'application/json,.json', hidden: true, 'aria-hidden': 'true', tabindex: '-1' });
      importInput.addEventListener('change', async () => {
        const file = importInput.files?.[0];
        importInput.value = '';
        if (file) await importSettingsFile(file);
      });
      ioActions.appendChild(settingsActionButton('Import settings\u2026', 'folder', async () => { importInput.click(); }));
      ioActions.appendChild(settingsActionButton('Copy diagnostics', 'copy', async () => {
        const data = await API.diagnostics();
        await copyDiagnosticsText(data?.text || '');
      }));
      wrap.appendChild(ioActions);
      wrap.appendChild(importInput);
      wrap.appendChild(el('p', { class: 'setting-desc', text: 'Export includes settings, memory and connectors. Never cookies.' }));
      return wrap;
    }

    function contentFor(tab) {
      if (tab === 'permissions') return renderPermissionsPanel();
      if (tab === 'workspace') return renderWorkspacePanel();
      if (tab === 'memory') return renderMemoryPanel();
      if (tab === 'automations') return renderAutomationsPanel();
      if (tab === 'usage') return renderUsagePanel();
      if (tab === 'gateway') return renderGatewayPanel();
      if (tab === 'components') return renderComponentsPanel();
      if (tab === 'about') return renderAboutPanel();
      return renderConnectionPanel();
    }

    function hydrateTab(tab) {
      if (hydrated[tab]) return;
      hydrated[tab] = true;
      if (state.serverError || state.networkOffline) return;
      if (tab === 'permissions') {
        Promise.allSettled([loadPermissionModeFromServer({ quiet: true }), loadPermissions({ quiet: true })])
          .then(() => { if (state.settingsTab === 'permissions') refreshPanel(); });
      } else if (tab === 'workspace') {
        loadWorkspaceFromServer({ quiet: true }).then(() => { if (state.settingsTab === 'workspace') refreshPanel(); });
      } else if (tab === 'memory') {
        API.getMemory().then((data) => { state.memoryData = data; if (state.settingsTab === 'memory') refreshPanel(); }).catch(() => {});
      } else if (tab === 'about') {
        API.getSettings().then((data) => { state.appSettings = data; if (state.settingsTab === 'about') refreshPanel(); }).catch(() => {});
      }
    }

    function refreshPanel() {
      if (!panel.isConnected) return;
      clear(panel);
      panel.id = 'settings-panel';
      panel.setAttribute('aria-labelledby', `settings-tab-${currentTab}`);
      panel.appendChild(contentFor(currentTab));
      tabDefs.forEach((tab) => {
        const button = tabButtons[tab.id];
        const selected = tab.id === currentTab;
        button.setAttribute('aria-selected', String(selected));
        button.tabIndex = selected ? 0 : -1;
      });
    }

    function selectTab(tabId, moveFocus = false) {
      if (!tabDefs.some((tab) => tab.id === tabId)) return;
      currentTab = tabId;
      state.settingsTab = tabId;
      refreshPanel();
      if (moveFocus) tabButtons[tabId]?.focus();
      hydrateTab(tabId);
    }

    const mounted = mountModal({
      title: 'Settings',
      size: 'large',
      content: layout,
      actions: [
        { label: 'Done', variant: 'primary' }
      ],
      onMount: () => {
        selectTab(currentTab, false);
      },
      onClose: () => {
        if (state.settingsRerender === refreshPanel) state.settingsRerender = null;
      }
    });
    state.settingsRerender = refreshPanel;
    state.settingsFetched = hydrated;
    return mounted;
  }

  /* ---------------------------------------------------------------------- */
  /* Right Workspace / Connectors panel                                    */
  // ═══ 13-connectors.js ═══
  /* ---------------------------------------------------------------------- */
  function formatBytes(bytes) {
    const value = Number(bytes);
    if (!Number.isFinite(value) || value <= 0) return '';
    if (value < 1024) return `${Math.round(value)} B`;
    if (value < 1024 * 1024) return `${(value / 1024).toFixed(value >= 10 * 1024 ? 0 : 1)} KB`;
    return `${(value / (1024 * 1024)).toFixed(1)} MB`;
  }

  function normalizeWorkspaceEntry(raw) {
    if (!raw || typeof raw !== 'object') return null;
    const path = String(raw.path ?? raw.rel_path ?? raw.name ?? '');
    if (!path) return null;
    return {
      name: String(raw.name ?? baseName(path) ?? path),
      path,
      is_dir: Boolean(raw.is_dir ?? raw.isDir ?? raw.directory),
      size: Number(raw.size ?? 0) || 0,
      modified_at: raw.modified_at ?? raw.modifiedAt ?? null,
      raw
    };
  }

  function workspaceFileIcon(entry) {
    if (entry.is_dir) return 'folder';
    const name = String(entry.name || '').toLocaleLowerCase('en');
    if (/\.(png|jpe?g|gif|webp|svg|bmp|ico)$/.test(name)) return 'image';
    if (/\.(mp4|webm|mov|mkv)$/.test(name)) return 'video';
    if (/\.(zip|7z|rar|tar|gz)$/.test(name)) return 'archive';
    if (/\.(py|js|ts|tsx|jsx|html|css|json|md|txt|yml|yaml|toml|xml|csv|rs|go|java|c|cpp|h|sh|ps1|bat)$/.test(name)) return 'file-text';
    return 'file';
  }

  function resetWorkspaceTree() {
    state.workspaceTree = [];
    state.workspaceTreeLoaded = false;
    state.workspaceTreeError = null;
    state.workspaceTreeTruncated = false;
    state.workspaceChildren = {};
    state.workspaceExpanded = new Set();
    state.workspaceLoadingPaths = new Set();
    state.workspaceRequest += 1;
  }

  // The Workspace panel follows the folder by itself: a folder being chosen or
  // changed, and files the AI writes or edits (tool results, saved files), all
  // schedule one debounced reload of the root and of every expanded folder.
  let workspaceTreeTimer = null;
  function scheduleWorkspaceTreeRefresh(delay = 350) {
    if (workspaceTreeTimer) window.clearTimeout(workspaceTreeTimer);
    workspaceTreeTimer = window.setTimeout(async () => {
      workspaceTreeTimer = null;
      if (!state.workspacePanelOpen || state.serverError) return;
      await loadWorkspaceTree('.', { force: true });
      const expanded = [...(state.workspaceExpanded || [])];
      await Promise.allSettled(expanded.map((path) => loadWorkspaceTree(path, { force: true })));
    }, delay);
  }

  function syncWorkspacePanelVisibility() {
    const open = Boolean(state.workspacePanelOpen);
    if (els.app) els.app.dataset.workspacePanel = open ? 'open' : 'closed';
    if (els.workspacePanel) els.workspacePanel.hidden = !open;
    if (els.workspacePanelTopButton) els.workspacePanelTopButton.setAttribute('aria-pressed', String(open));
    if (els.workspacePanelNavBtn) els.workspacePanelNavBtn.setAttribute('aria-pressed', String(open));
    if (els.workspacePanelRoot) {
      const label = state.workspacePanelRoot || state.workspace || "Loading folder…";
      els.workspacePanelRoot.textContent = label;
      els.workspacePanelRoot.title = label;
    }
  }

  function setWorkspacePanelOpen(open, { focusConnectors = false, persist = true, load = true } = {}) {
    state.workspacePanelOpen = Boolean(open);
    syncWorkspacePanelVisibility();
    if (persist) {
      try { localStorage.setItem('arenaPersonal.workspacePanelOpen.v4', state.workspacePanelOpen ? '1' : '0'); } catch { /* storage unavailable */ }
    }
    if (!state.workspacePanelOpen) return;
    renderWorkspaceTreePanel();
    renderConnectorsPanel();
    if (load) void refreshWorkspacePanel({ force: true });
    if (focusConnectors) {
      window.setTimeout(() => {
        els.connectorsPane?.scrollIntoView({ block: 'nearest' });
        try { els.addConnectorButton?.focus({ preventScroll: true }); } catch { els.addConnectorButton?.focus(); }
      }, 40);
    }
  }

  function restoreWorkspacePanelPreference() {
    let open = window.innerWidth >= 1180;
    try {
      const stored = localStorage.getItem('arenaPersonal.workspacePanelOpen.v4');
      if (stored === '1') open = true;
      else if (stored === '0') open = false;
    } catch { /* use width default */ }
    setWorkspacePanelOpen(open, { persist: false, load: false });
  }

  const LAYOUT_LIMITS = {
    sidebarWidth: { min: 220, max: 420, fallback: 276 },
    workspaceWidth: { min: 260, max: 560, fallback: 332 },
    connectorsShare: { min: 22, max: 68, fallback: 38 }
  };

  function clampLayoutValue(key, value) {
    const limits = LAYOUT_LIMITS[key];
    const number = Number(value);
    if (!Number.isFinite(number)) return limits.fallback;
    return Math.round(Math.min(limits.max, Math.max(limits.min, number)));
  }

  function applyLayout() {
    const layout = state.layout || {};
    state.layout = {
      sidebarWidth: clampLayoutValue('sidebarWidth', layout.sidebarWidth),
      workspaceWidth: clampLayoutValue('workspaceWidth', layout.workspaceWidth),
      connectorsShare: clampLayoutValue('connectorsShare', layout.connectorsShare)
    };
    const root = document.documentElement.style;
    // The grid reads --sidebar-w / --workspace-panel-w; setting differently
    // named variables was why dragging the handles changed nothing.
    root.setProperty('--sidebar-w', `${state.layout.sidebarWidth}px`);
    root.setProperty('--sidebar-width', `${state.layout.sidebarWidth}px`);
    root.setProperty('--workspace-panel-w', `${state.layout.workspaceWidth}px`);
    root.setProperty('--workspace-width', `${state.layout.workspaceWidth}px`);
    root.setProperty('--connectors-share', `${state.layout.connectorsShare}%`);
    const syncHandle = (node, key) => {
      if (!node) return;
      const limits = LAYOUT_LIMITS[key];
      node.setAttribute('aria-valuemin', String(limits.min));
      node.setAttribute('aria-valuemax', String(limits.max));
      node.setAttribute('aria-valuenow', String(state.layout[key]));
    };
    syncHandle(els.sidebarResize, 'sidebarWidth');
    syncHandle(els.workspaceResize, 'workspaceWidth');
    syncHandle(els.workspaceSplitResize, 'connectorsShare');
    try { localStorage.setItem('arenaDesktop.layout.v1', JSON.stringify(state.layout)); } catch { /* storage unavailable */ }
  }

  function restoreLayoutFromCache() {
    try {
      const saved = JSON.parse(localStorage.getItem('arenaDesktop.layout.v1') || 'null');
      if (saved && typeof saved === 'object') state.layout = { ...state.layout, ...saved };
    } catch { /* use defaults */ }
    applyLayout();
  }

  let layoutSaveTimer = 0;
  function persistLayout() {
    applyLayout();
    window.clearTimeout(layoutSaveTimer);
    layoutSaveTimer = window.setTimeout(() => {
      layoutSaveTimer = 0;
      API.saveSettings({ layout: { ...state.layout } }).catch(() => {});
    }, 320);
  }

  async function loadLayoutSettings() {
    try {
      const payload = await API.getSettings();
      const layout = payload?.settings?.layout || payload?.layout;
      if (layout && typeof layout === 'object') {
        state.layout = { ...state.layout, ...layout };
        applyLayout();
      }
      const off = payload?.arena_connectors_off ?? payload?.settings?.arena_connectors_off;
      if (Array.isArray(off)) {
        state.arenaConnectorsOff = new Set(off.map(String));
        refreshConnectorSurfaces();
      }
    } catch { /* cached layout remains active */ }
  }

  function setupPanelResize(handle, { key, orientation = 'vertical', valueFromEvent, label }) {
    if (!handle || handle.dataset.resizeReady === '1') return;
    handle.dataset.resizeReady = '1';
    handle.setAttribute('tabindex', '0');
    handle.setAttribute('role', 'separator');
    handle.setAttribute('aria-orientation', orientation);
    if (label) handle.setAttribute('aria-label', label);
    handle.addEventListener('pointerdown', (event) => {
      if (event.button !== undefined && event.button !== 0) return;
      event.preventDefault();
      const startX = event.clientX;
      const startY = event.clientY;
      const startValue = state.layout[key];
      const panelRect = els.workspacePanel?.getBoundingClientRect();
      document.body.classList.add('is-resizing');
      handle.classList.add('is-dragging');
      handle.setPointerCapture?.(event.pointerId);
      const move = (pointerEvent) => {
        state.layout[key] = clampLayoutValue(key, valueFromEvent({
          startValue,
          dx: pointerEvent.clientX - startX,
          dy: pointerEvent.clientY - startY,
          panelRect
        }));
        applyLayout();
      };
      const finish = () => {
        document.body.classList.remove('is-resizing');
        handle.classList.remove('is-dragging');
        handle.removeEventListener('pointermove', move);
        handle.removeEventListener('pointerup', finish);
        handle.removeEventListener('pointercancel', finish);
        persistLayout();
      };
      handle.addEventListener('pointermove', move);
      handle.addEventListener('pointerup', finish);
      handle.addEventListener('pointercancel', finish);
    });
    handle.addEventListener('keydown', (event) => {
      const step = event.shiftKey ? 16 : 6;
      let delta = 0;
      if (orientation === 'vertical') {
        if (event.key === 'ArrowLeft') delta = key === 'workspaceWidth' ? step : -step;
        if (event.key === 'ArrowRight') delta = key === 'workspaceWidth' ? -step : step;
      } else {
        if (event.key === 'ArrowUp') delta = step;
        if (event.key === 'ArrowDown') delta = -step;
      }
      if (!delta) return;
      event.preventDefault();
      state.layout[key] = clampLayoutValue(key, state.layout[key] + delta);
      persistLayout();
    });
    handle.addEventListener('dblclick', () => {
      state.layout[key] = LAYOUT_LIMITS[key].fallback;
      persistLayout();
    });
  }

  function setupLayoutResize() {
    restoreLayoutFromCache();
    setupPanelResize(els.sidebarResize, {
      key: 'sidebarWidth', label: 'Resize sidebar',
      valueFromEvent: ({ startValue, dx }) => startValue + dx
    });
    setupPanelResize(els.workspaceResize, {
      key: 'workspaceWidth', label: 'Resize workspace panel',
      valueFromEvent: ({ startValue, dx }) => startValue - dx
    });
    setupPanelResize(els.workspaceSplitResize, {
      key: 'connectorsShare', orientation: 'horizontal', label: 'Resize connectors section',
      valueFromEvent: ({ startValue, dy, panelRect }) => {
        const height = Math.max(1, panelRect?.height || els.workspacePanel?.clientHeight || 1);
        return startValue - (dy / height) * 100;
      }
    });
  }

  async function refreshWorkspacePanel({ force = false } = {}) {
    const jobs = [];
    if (force || !state.connectors) jobs.push(loadConnectors({ reload: force, silent: true }));
    if (state.authenticated && (force || !state.arenaConnectors)) jobs.push(loadArenaConnectors({ silent: true }));
    if (state.workspacePanelOpen && (force || !state.workspaceTreeLoaded)) jobs.push(loadWorkspaceTree('.', { force }));
    await Promise.allSettled(jobs);
  }

  async function loadWorkspaceTree(path = '.', { force = false } = {}) {
    const target = String(path || '.');
    if (state.serverError) {
      if (target === '.') state.workspaceTreeError = state.serverError;
      renderWorkspaceTreePanel();
      return [];
    }
    if (target !== '.') {
      if (!force && Array.isArray(state.workspaceChildren[target])) {
        renderWorkspaceTreePanel();
        return state.workspaceChildren[target];
      }
      if (state.workspaceLoadingPaths.has(target)) return state.workspaceChildren[target] || [];
      state.workspaceLoadingPaths.add(target);
      renderWorkspaceTreePanel();
      try {
        const raw = await API.getWorkspaceTree(target);
        const entries = (Array.isArray(raw?.entries) ? raw.entries : []).map(normalizeWorkspaceEntry).filter(Boolean);
        state.workspaceChildren[target] = entries;
        if (raw?.root) state.workspacePanelRoot = String(raw.root);
        return entries;
      } catch (error) {
        state.workspaceExpanded.delete(target);
        toast(errorMessage(error), 'error', "Folder not opened");
        return [];
      } finally {
        state.workspaceLoadingPaths.delete(target);
        syncWorkspacePanelVisibility();
        renderWorkspaceTreePanel();
      }
    }

    if (state.workspaceTreeLoading && !force) return state.workspaceTree;
    const requestId = ++state.workspaceRequest;
    state.workspaceTreeLoading = true;
    if (force) state.workspaceTreeError = null;
    renderWorkspaceTreePanel();
    try {
      const raw = await API.getWorkspaceTree('.');
      if (requestId !== state.workspaceRequest) return state.workspaceTree;
      const nextRoot = String(raw?.root || state.workspacePanelRoot || state.workspace || '');
      if (state.workspacePanelRoot && nextRoot && state.workspacePanelRoot !== nextRoot) {
        state.workspaceChildren = {};
        state.workspaceExpanded = new Set();
      }
      state.workspacePanelRoot = nextRoot;
      state.workspaceTree = (Array.isArray(raw?.entries) ? raw.entries : []).map(normalizeWorkspaceEntry).filter(Boolean);
      state.workspaceTreeTruncated = Boolean(raw?.truncated);
      state.workspaceTreeLoaded = true;
      state.workspaceTreeError = null;
      return state.workspaceTree;
    } catch (error) {
      if (requestId === state.workspaceRequest) state.workspaceTreeError = errorMessage(error);
      return [];
    } finally {
      if (requestId === state.workspaceRequest) state.workspaceTreeLoading = false;
      syncWorkspacePanelVisibility();
      renderWorkspaceTreePanel();
    }
  }

  function workspaceTreeNode(entry, depth = 0) {
    const fragment = document.createDocumentFragment();
    const expanded = entry.is_dir && state.workspaceExpanded.has(entry.path);
    const loading = entry.is_dir && state.workspaceLoadingPaths.has(entry.path);
    const activate = () => {
      if (entry.is_dir) void toggleWorkspaceDirectory(entry);
      else void openWorkspaceFilePreview(entry);
    };
    const row = el('div', {
      class: `workspace-tree-row${entry.is_dir ? ' is-dir' : ''}`,
      role: 'treeitem',
      tabindex: '0',
      'aria-expanded': entry.is_dir ? String(expanded) : false,
      'aria-label': `${entry.is_dir ? "Folder" : "File"}: ${entry.path}`,
      title: entry.path,
      style: { paddingLeft: `${6 + depth * 13}px` },
      onclick: activate,
      onkeydown: (event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          activate();
        }
      }
    },
      entry.is_dir
        ? el('span', { class: 'workspace-tree-caret', 'aria-hidden': 'true' }, iconEl('chevron-right'))
        : el('span', { class: 'workspace-tree-caret', 'aria-hidden': 'true' }),
      iconEl(workspaceFileIcon(entry), entry.is_dir ? 'workspace-entry-icon is-folder' : 'workspace-entry-icon is-file'),
      el('span', { class: 'workspace-tree-name', text: entry.name }),
      loading ? el('span', { class: 'mini-spinner', 'aria-hidden': 'true' }) : null
    );
    if (!entry.is_dir) {
      row.draggable = true;
      row.title = `${entry.path} — drag into the composer to attach`;
      row.addEventListener('dragstart', (event) => {
        if (!event.dataTransfer) return;
        event.dataTransfer.setData('application/x-arena-workspace-path', entry.path);
        event.dataTransfer.effectAllowed = 'copy';
      });
    }
    fragment.appendChild(row);
    if (entry.is_dir && expanded) {
      const childrenWrap = el('div', { class: 'workspace-tree-children', role: 'group' });
      const children = state.workspaceChildren[entry.path];
      if (loading && !Array.isArray(children)) {
        childrenWrap.appendChild(el('div', { class: 'workspace-tree-empty', text: "Loading…" }));
      } else if (Array.isArray(children) && children.length) {
        children.forEach((child) => childrenWrap.appendChild(workspaceTreeNode(child, depth + 1)));
      } else if (Array.isArray(children)) {
        childrenWrap.appendChild(el('div', { class: 'workspace-tree-empty', text: "Folder is empty" }));
      }
      fragment.appendChild(childrenWrap);
    }
    return fragment;
  }

  function renderWorkspaceTreePanel() {
    syncWorkspacePanelVisibility();
    const node = els.workspaceTree;
    if (!node) return;
    const scrollTop = node.scrollTop;
    clear(node);
    node.setAttribute('aria-busy', String(state.workspaceTreeLoading));
    if (state.workspaceTreeLoading && !state.workspaceTreeLoaded) {
      node.appendChild(el('div', { class: 'workspace-tree-empty' }, el('span', { class: 'mini-spinner' }), el('span', { text: " Loading files…" })));
    } else if (state.workspaceTreeError && !state.workspaceTree.length) {
      node.append(
        el('div', { class: 'workspace-tree-error', text: state.workspaceTreeError }),
        el('button', { class: 'button button-small button-quiet', type: 'button', onclick: () => void loadWorkspaceTree('.', { force: true }) },
          iconEl('refresh'), el('span', { text: "Retry" }))
      );
    } else if (!state.workspaceTree.length) {
      node.appendChild(el('div', { class: 'workspace-tree-empty', text: state.workspaceTreeLoaded ? "There are no files in this folder yet." : "Click refresh to load the file tree." }));
    } else {
      const rootName = baseName(state.workspacePanelRoot || state.workspace || '') || 'Workspace';
      node.appendChild(el('div', {
        class: 'workspace-tree-row workspace-tree-root is-dir',
        role: 'treeitem', 'aria-expanded': 'true',
        title: state.workspacePanelRoot || state.workspace || rootName
      },
        el('span', { class: 'workspace-tree-caret', 'aria-hidden': 'true' }, iconEl('chevron-right')),
        iconEl('folder', 'workspace-entry-icon is-folder'),
        el('span', { class: 'workspace-tree-name', text: rootName })));
      state.workspaceTree.forEach((entry) => node.appendChild(workspaceTreeNode(entry, 1)));
      if (state.workspaceTreeTruncated) node.appendChild(el('div', { class: 'workspace-tree-empty', text: "The first items of the folder are shown; the rest are hidden by the preview limit." }));
      if (state.workspaceTreeError) node.appendChild(el('div', { class: 'workspace-tree-error', text: state.workspaceTreeError }));
    }
    node.scrollTop = scrollTop;
  }

  async function toggleWorkspaceDirectory(entry) {
    if (!entry?.is_dir) return;
    if (state.workspaceExpanded.has(entry.path)) {
      state.workspaceExpanded.delete(entry.path);
      renderWorkspaceTreePanel();
      return;
    }
    state.workspaceExpanded.add(entry.path);
    renderWorkspaceTreePanel();
    await loadWorkspaceTree(entry.path);
  }

  const PREVIEW_KINDS = {
    image: new Set(['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg', 'avif', 'bmp', 'ico']),
    audio: new Set(['mp3', 'wav', 'ogg', 'oga', 'opus', 'm4a', 'flac', 'aac']),
    video: new Set(['mp4', 'webm', 'mov', 'm4v', 'mkv']),
    html: new Set(['html', 'htm', 'xhtml']),
    markdown: new Set(['md', 'markdown', 'mdx']),
    pdf: new Set(['pdf'])
  };

  function previewKindFor(name) {
    const ext = String(name || '').toLowerCase().split('.').pop();
    for (const [kind, set] of Object.entries(PREVIEW_KINDS)) if (set.has(ext)) return kind;
    return 'text';
  }

  function workspacePreviewUrl(path) {
    return previewLink(path);
  }

  async function openWorkspaceFilePreview(entry) {
    if (!entry || entry.is_dir) return;
    const kind = previewKindFor(entry.name || entry.path);
    const downloadAction = {
      label: 'Download', variant: 'quiet', icon: 'download',
      onClick: async () => {
        try {
          const blob = await API.downloadWorkspaceFile(entry.path);
          const url = URL.createObjectURL(blob);
          const link = el('a', { href: url, download: entry.name || 'file' });
          document.body.appendChild(link);
          link.click();
          link.remove();
          setTimeout(() => URL.revokeObjectURL(url), 4000);
        } catch (error) { toast(errorMessage(error), 'error', 'Download failed'); }
        return false;
      }
    };
    const open = (bodyNodes, actions) => mountModal({
      title: entry.name,
      subtitle: `${entry.path}${entry.size ? ` \u00B7 ${formatBytes(entry.size)}` : ''}`,
      size: 'large',
      content: el('div', {}, ...bodyNodes),
      actions: actions || [downloadAction, { label: 'Close', variant: 'primary', autofocus: true }]
    });
    try {
      if (kind === 'image') {
        const src = state.demo
          ? URL.createObjectURL(await API.downloadWorkspaceFile(entry.path))
          : workspacePreviewUrl(entry.path);
        open([el('div', { class: 'file-preview-media' }, el('img', { src, alt: entry.name }))]);
        return;
      }
      if (kind === 'audio' || kind === 'video') {
        const src = state.demo
          ? URL.createObjectURL(await API.downloadWorkspaceFile(entry.path))
          : workspacePreviewUrl(entry.path);
        const media = kind === 'audio'
          ? el('audio', { controls: true, src, preload: 'metadata' })
          : el('video', { controls: true, src, preload: 'metadata' });
        open([el('div', { class: 'file-preview-media' }, media)]);
        return;
      }
      if (kind === 'pdf' && !state.demo) {
        open([el('iframe', { class: 'file-preview-frame', src: workspacePreviewUrl(entry.path), title: entry.name })]);
        return;
      }
      if (kind === 'html') {
        if (state.demo) {
          const raw = await API.getWorkspaceFile(entry.path);
          open([el('iframe', { class: 'file-preview-frame', sandbox: 'allow-scripts', srcdoc: String(raw?.content ?? ''), title: entry.name })]);
        } else {
          open([
            el('div', { class: 'note-box' }, iconEl('shield'), el('span', { text: 'Rendered in a sandboxed frame: scripts run, but the page cannot reach the app or your Arena account.' })),
            el('iframe', { class: 'file-preview-frame', sandbox: 'allow-scripts allow-modals allow-popups', src: workspacePreviewUrl(entry.path), title: entry.name })
          ]);
        }
        return;
      }
      const raw = await API.getWorkspaceFile(entry.path);
      const content = String(raw?.content ?? '');
      if (kind === 'markdown') {
        const rendered = el('div', { class: 'markdown file-preview-markdown' });
        rendered.appendChild(renderMarkdown(content.slice(0, 250000)));
        open([
          el('div', { class: 'note-box' }, iconEl('info'), el('span', { text: 'Rendered Markdown preview (read-only).' })),
          rendered
        ], [
          {
            label: 'Copy', variant: 'quiet', icon: 'copy',
            onClick: async () => {
              const ok = await copyText(content);
              toast(ok ? 'File content copied.' : 'Failed to copy the file.', ok ? 'success' : 'error');
              return false;
            }
          },
          downloadAction,
          { label: 'Close', variant: 'primary', autofocus: true }
        ]);
        return;
      }
      const shown = content.length > 250000 ? `${content.slice(0, 250000)}\n\n… [preview truncated]` : content;
      const editAction = {
        label: 'Edit', variant: 'quiet', icon: 'code',
        onClick: async ({ body, close }) => {
          const ta = el('textarea', { class: 'file-editor', spellcheck: 'false', rows: '18', 'aria-label': `Edit ${entry.name}` });
          ta.value = content;
          const saveBtn = el('button', { class: 'button', type: 'button' }, iconEl('check'), el('span', { text: 'Save' }));
          const cancelBtn = el('button', { class: 'button button-quiet', type: 'button' }, el('span', { text: 'Cancel' }));
          cancelBtn.addEventListener('click', () => close());
          saveBtn.addEventListener('click', async () => {
            saveBtn.disabled = true;
            try {
              await API.saveWorkspaceFile(entry.path, ta.value);
              toast('Saved to disk.', 'success');
              void refreshWorkspacePanel({ force: true });
              scheduleChatProjectRefresh();
              close();
            } catch (error) {
              saveBtn.disabled = false;
              toast(errorMessage(error), 'error', 'Save failed');
            }
          });
          clear(body);
          body.append(
            el('div', { class: 'note-box' }, iconEl('info'), el('span', { text: 'Saving writes this file on your computer in the workspace folder.' })),
            ta,
            el('div', { class: 'file-editor-actions' }, saveBtn, cancelBtn)
          );
          ta.focus();
          return false;
        }
      };
      open([
        el('div', { class: 'note-box' }, iconEl('info'), el('span', { text: 'Preview shows the file as it is on disk. Use Edit to change it.' })),
        el('pre', { class: 'file-preview-pre', text: shown || '[empty file]' })
      ], [
        editAction,
        {
          label: 'Copy', variant: 'quiet', icon: 'copy',
          onClick: async () => {
            const ok = await copyText(content);
            toast(ok ? 'File content copied.' : 'Failed to copy the file.', ok ? 'success' : 'error');
            return false;
          }
        },
        downloadAction,
        { label: 'Close', variant: 'primary', autofocus: true }
      ]);
    } catch (error) {
      if (kind === 'text' || kind === 'pdf') {
        open([el('div', { class: 'note-box' }, iconEl('info'),
          el('span', { text: 'This file cannot be previewed in the app. Download it to open with another program.' }))]);
        return;
      }
      toast(errorMessage(error), 'error', 'File is not open');
    }
  }

  function connectorServersList() {
    return Array.isArray(state.connectors?.servers) ? state.connectors.servers : [];
  }

  function connectorPresetsList() {
    return Array.isArray(state.connectors?.presets) ? state.connectors.presets : [];
  }

  function applyConnectorsPayload(payload) {
    if (payload && typeof payload === 'object' && (Array.isArray(payload.servers) || Array.isArray(payload.presets))) {
      state.connectors = payload;
      state.connectorsError = payload.config_error || null;
    }
    renderConnectorsPanel();
    return state.connectors;
  }

  async function loadConnectors({ reload = false, silent = false } = {}) {
    const requestId = ++state.connectorRequest;
    state.connectorsLoading = true;
    renderConnectorsPanel();
    try {
      const raw = reload ? await API.reloadConnectors() : await API.getConnectors();
      if (requestId === state.connectorRequest) applyConnectorsPayload(raw);
      return state.connectors;
    } catch (error) {
      if (requestId === state.connectorRequest) state.connectorsError = errorMessage(error);
      if (!silent) toast(errorMessage(error), 'error', "Connectors are unavailable");
      return null;
    } finally {
      if (requestId === state.connectorRequest) state.connectorsLoading = false;
      renderConnectorsPanel();
    }
  }

  /* Official Arena account connectors (live catalog from arena.ai) */
  let addConnectorModalRender = null;

  function arenaConnectorsList() {
    return Array.isArray(state.arenaConnectors) ? state.arenaConnectors : [];
  }

  function refreshConnectorSurfaces() {
    renderConnectorsPanel();
    if (addConnectorModalRender) {
      try { addConnectorModalRender(); } catch { /* modal already gone */ }
    }
  }

  function applyArenaConnectorsPayload(payload) {
    if (payload && typeof payload === 'object' && Array.isArray(payload.connectors)) {
      state.arenaConnectors = payload.connectors;
      state.arenaConnectorsError = null;
    }
    refreshConnectorSurfaces();
    return state.arenaConnectors;
  }

  async function loadArenaConnectors({ silent = false } = {}) {
    const requestId = ++state.arenaConnectorRequest;
    state.arenaConnectorsLoading = true;
    renderConnectorsPanel();
    try {
      const raw = await API.getArenaConnectors();
      if (requestId === state.arenaConnectorRequest) applyArenaConnectorsPayload(raw);
      return state.arenaConnectors;
    } catch (error) {
      if (requestId === state.arenaConnectorRequest) state.arenaConnectorsError = errorMessage(error);
      if (!silent && error?.status !== 401) toast(errorMessage(error), 'error', "Arena connectors are unavailable");
      return null;
    } finally {
      if (requestId === state.arenaConnectorRequest) state.arenaConnectorsLoading = false;
      refreshConnectorSurfaces();
    }
  }

  function arenaConnectorStatusLabel(item) {
    if (item?.auth_status === 'connected' || item?.connected) {
      return state.arenaConnectorsOff.has(item.slug) ? "Connected to account · Off" : "Connected to account";
    }
    if (item?.auth_status === 'unusable') return "Unavailable";
    return "Not connected";
  }

  function setArenaConnectorEnabled(item, enabled) {
    if (!item?.slug) return;
    if (enabled) state.arenaConnectorsOff.delete(item.slug);
    else state.arenaConnectorsOff.add(item.slug);
    API.saveSettings({ arena_connectors_off: [...state.arenaConnectorsOff] }).catch(() => {});
    refreshConnectorSurfaces();
    toast(enabled ? `${item.name} will be available to Arena Agent.` : `${item.name} is off: Arena Agent will not use it.`, 'success');
  }

  function stopArenaConnectorPoll() {
    if (state.arenaConnectorPoll) state.arenaConnectorPoll.cancelled = true;
    state.arenaConnectorPoll = null;
  }

  /* Connecting opens Merge's hosted sign-in page in the user's default
     browser (the embedded Arena window blocks third-party cookies, which
     breaks Merge's widget with "CSRF verification failed"). The server keeps
     checking the connector status; this dialog closes by itself on success. */
  async function pollArenaConnectorFlow(slug, name, token, dialog) {
    const deadline = Date.now() + 10 * 60 * 1000;
    while (!token.cancelled && Date.now() < deadline) {
      await sleep(state.demo ? 600 : 2500);
      if (token.cancelled) return;
      let result = null;
      try {
        result = await API.pollArenaConnector(slug);
      } catch {
        continue;
      }
      if (token.cancelled) return;
      if (Array.isArray(result?.connectors)) applyArenaConnectorsPayload(result);
      if (result?.done) {
        void loadArenaConnectors({ silent: true });
        void loadStatus({ quiet: true });
        if (result.connected) {
          dialog.showSuccess();
          toast(`Connector "${name}" is connected to the Arena account.`, 'success');
          await sleep(1800);
          dialog.close();
        } else {
          dialog.close();
          toast("Timeout expired. Refresh the list to check the status.", 'warning', name);
        }
        return;
      }
    }
    if (!token.cancelled) {
      dialog.close();
      toast("Connection is not yet complete. Check the status later with the refresh button.", 'warning', name);
    }
  }

  function mountArenaConnectorDialog(name, { token, authUrl = '' } = {}) {
    const status = el('p', { class: 'modal-copy', role: 'status', 'aria-live': 'polite',
      text: "Waiting for you to finish in your browser…" });
    const content = el('div', {},
      el('p', { class: 'modal-copy', text: `The ${name} sign-in page was opened in your default browser. Finish connecting there.` }),
      el('p', { class: 'modal-copy', text: "If the page shows an error or stays blank, turn off your ad blocker or Brave Shields for it (Brave: click the lion icon in the address bar and switch Shields off), then reload the page." }),
      authUrl ? el('p', { class: 'modal-copy', text: "The browser could not be opened automatically. Copy this link into your browser:" }) : null,
      authUrl ? el('input', { class: 'input', type: 'text', readonly: true, value: authUrl, 'aria-label': "Sign-in link" }) : null,
      status
    );
    const modal = mountModal({
      title: `Connect ${name}`,
      subtitle: "Continue in your browser",
      size: 'small',
      content,
      actions: [{ label: "Cancel", variant: 'quiet' }],
      onClose: () => { token.cancelled = true; }
    });
    return {
      close: modal.close,
      showSuccess() {
        content.replaceChildren(el('p', { class: 'modal-copy', role: 'status', text: "All done, connected successfully" }));
        modal.footer.replaceChildren();
      }
    };
  }

  async function connectArenaConnectorFlow(connector) {
    const slug = String(connector?.slug || '');
    if (!slug || state.arenaConnectorBusy.has(slug)) return;
    stopArenaConnectorPoll();
    state.arenaConnectorBusy.add(slug);
    refreshConnectorSurfaces();
    try {
      const result = await API.connectArenaConnector(slug);
      if (result?.pending) {
        const name = connector.name || slug;
        const token = { slug, cancelled: false };
        state.arenaConnectorPoll = token;
        const dialog = mountArenaConnectorDialog(name, { token, authUrl: result.opened === false ? String(result.auth_url || '') : '' });
        await pollArenaConnectorFlow(slug, name, token, dialog);
      } else {
        await loadArenaConnectors({ silent: true });
      }
    } catch (error) {
      toast(errorMessage(error), 'error', connector.name || slug);
    } finally {
      state.arenaConnectorBusy.delete(slug);
      refreshConnectorSurfaces();
    }
  }

  function disconnectArenaConnectorFlow(connector) {
    const slug = String(connector?.slug || '');
    if (!slug) return;
    mountModal({
      title: "Disconnect the Arena connector?",
      subtitle: connector.name || slug,
      size: 'small',
      content: el('p', { class: 'modal-copy', text: 'The connector will be disconnected from your arena.ai account and will no longer be available to Arena Agent. You can connect it again at any time.' }),
      actions: [
        { label: "Cancel", variant: 'quiet' },
        {
          label: "Disconnect", variant: 'danger',
          onClick: async () => {
            if (state.arenaConnectorBusy.has(slug)) return;
            state.arenaConnectorBusy.add(slug);
            refreshConnectorSurfaces();
            try {
              const payload = await API.disconnectArenaConnector(slug);
              if (Array.isArray(payload?.connectors) && payload.connectors.length) applyArenaConnectorsPayload(payload);
              else await loadArenaConnectors({ silent: true });
              toast(`Connector "${connector.name || slug}" is disconnected from the Arena account.`, 'success');
            } catch (error) {
              toast(errorMessage(error), 'error', connector.name || slug);
            } finally {
              state.arenaConnectorBusy.delete(slug);
              refreshConnectorSurfaces();
            }
          }
        }
      ]
    });
  }

  function arenaConnectorRow(item) {
    const busy = state.arenaConnectorBusy.has(item.slug);
    const connected = Boolean(item.connected || item.auth_status === 'connected');
    const enabled = connected && !state.arenaConnectorsOff.has(item.slug);
    const unusable = item.auth_status === 'unusable';
    const logo = connectorLogoNode(item);
    const main = el('div', { class: 'arena-connector-main' },
      el('div', { class: 'connector-main' },
        el('span', { class: 'connector-status-dot', 'aria-hidden': 'true' }),
        el('span', { class: 'connector-name', title: item.name, text: item.name }),
        el('span', { class: 'connector-meta', text: busy ? "Connecting…" : arenaConnectorStatusLabel(item) })
      ),
      item.description ? el('p', { class: 'connector-desc', text: item.description }) : null
    );
    const actions = el('div', { class: 'connector-actions' });
    if (connected) {
      const toggle = el('input', {
        type: 'checkbox', class: 'switch-input', checked: enabled, disabled: busy,
        'aria-label': `Use ${item.name} in Agent Mode`
      });
      toggle.addEventListener('change', () => setArenaConnectorEnabled(item, toggle.checked));
      actions.appendChild(el('label', { class: 'switch-row', title: 'Available to Arena Agent in Agent Mode' },
        el('span', { class: 'switch-label', text: enabled ? 'On' : 'Off' }),
        el('span', { class: 'switch' }, toggle, el('span', { class: 'switch-track', 'aria-hidden': 'true' }))
      ));
      actions.appendChild(el('button', {
        class: 'button button-quiet', type: 'button', disabled: busy,
        onclick: () => disconnectArenaConnectorFlow(item)
      }, el('span', { text: busy ? "Turning off…" : "Disconnect" })));
    } else {
      actions.appendChild(el('button', {
        class: 'button', type: 'button', disabled: busy || unusable,
        onclick: () => void connectArenaConnectorFlow(item)
      }, el('span', { text: busy ? "Connecting…" : (unusable ? "Unavailable" : "Connect") })));
    }
    return el('article', { class: `connector-card arena-connector-row${connected ? ' is-connected' : ''}${connected && !enabled ? ' is-off' : ''}` },
      el('div', { class: 'arena-connector-head' }, logo, main),
      actions
    );
  }

  function renderArenaConnectorsInto(node) {
    node.appendChild(el('div', { class: 'connector-group-title' },
      el('span', { text: 'Arena connectors' }),
      el('span', { class: 'connector-group-hint', text: 'Cloud apps for the Arena Agent' })));
    node.appendChild(el('div', { class: 'connector-group-note', text: "Agent Mode only — these work with Arena Agent. The switch picks which connected ones it may use." }));
    if (state.arenaConnectorsLoading && !state.arenaConnectors) {
      node.appendChild(el('div', { class: 'connector-empty' }, el('span', { class: 'mini-spinner' }), el('span', { text: " Loading account connectors…" })));
      return;
    }
    if (!state.authenticated) {
      node.appendChild(el('div', { class: 'connector-empty', text: "Log in to Arena to see the official connectors of your account. New Arena connectors will appear here automatically." }));
      return;
    }
    if (!state.arenaConnectors && state.arenaConnectorsError) {
      node.append(
        el('div', { class: 'connector-empty', text: state.arenaConnectorsError }),
        el('button', { class: 'button button-small button-quiet', type: 'button', onclick: () => void loadArenaConnectors() },
          iconEl('refresh'), el('span', { text: "Retry" }))
      );
      return;
    }
    if (!state.arenaConnectors) {
      node.append(
        el('div', { class: 'connector-empty', text: "The list of official connectors is taken from your arena.ai account." }),
        el('button', { class: 'button button-small button-quiet', type: 'button', onclick: () => void loadArenaConnectors() },
          iconEl('refresh'), el('span', { text: "Load Arena list" }))
      );
      return;
    }
    const list = arenaConnectorsList();
    if (!list.length) {
      node.appendChild(el('div', { class: 'connector-empty', text: "Arena did not return a list of connectors for this account." }));
      return;
    }
    list.forEach((item) => node.appendChild(arenaConnectorRow(item)));
    node.appendChild(el('div', { class: 'connector-note', text: 'The list and statuses come from your arena.ai account: new connectors appear automatically. The Local Agent uses the MCP servers below instead.' }));
  }

  function connectorStatusLabel(server) {
    if (!server?.enabled) return "Off";
    if (server.status === 'connected' || server.running) return "Connected";
    if (server.status === 'unsupported') return "HTTP not supported.";
    if (server.status === 'error') return "Error";
    return "Not connected";
  }

  function renderConnectorsPanel() {
    const servers = connectorServersList();
    const arenaList = arenaConnectorsList();
    const connected = servers.filter((server) => server.running || server.status === 'connected').length
      + arenaList.filter((item) => item.connected || item.auth_status === 'connected').length;
    const total = servers.length + arenaList.length;
    if (els.connectorsNavCount) {
      els.connectorsNavCount.textContent = (state.connectors || state.arenaConnectors) ? `${connected}/${total}` : '—';
      els.connectorsNavCount.title = total ? `Connected connectors: ${connected} from ${total} (Arena and local MCP)` : "Connectors not added";
    }
    const node = els.connectorList;
    if (!node) return;
    const scrollTop = node.scrollTop;
    clear(node);
    node.setAttribute('aria-busy', String(state.connectorsLoading || state.arenaConnectorsLoading));
    renderArenaConnectorsInto(node);
    node.appendChild(el('div', { class: 'connector-group-title connector-group-row' },
      el('span', { class: 'connector-group-name' },
        el('span', { text: 'Local MCP servers' }),
        el('span', { class: 'connector-group-hint', text: 'Run on this computer, from mcp.json' })),
      el('span', { class: 'connector-group-actions' },
        el('button', {
          class: 'button button-small button-quiet', type: 'button', title: 'Edit mcp.json',
          onclick: () => els.openMcpJsonButton?.click()
        }, iconEl('braces'), el('span', { text: 'mcp.json' })),
        el('button', {
          class: 'button button-small', type: 'button',
          onclick: () => openAddConnectorModal('local')
        }, iconEl('plus'), el('span', { text: 'Add' })))
    ));
    if (state.connectorsLoading && !state.connectors) {
      node.appendChild(el('div', { class: 'connector-empty' }, el('span', { class: 'mini-spinner' }), el('span', { text: " Loading connectors…" })));
      return;
    }
    if (!state.connectors && state.connectorsError) {
      node.append(
        el('div', { class: 'connector-empty', text: state.connectorsError }),
        el('button', { class: 'button button-small button-quiet', type: 'button', onclick: () => void loadConnectors({ reload: true }) },
          iconEl('refresh'), el('span', { text: "Retry" }))
      );
      return;
    }
    if (state.connectors?.config_error) {
      node.appendChild(el('div', { class: 'connector-card is-error' },
        el('div', { class: 'connector-name', text: "Error in mcp.json" }),
        el('p', { class: 'connector-error', text: state.connectors.config_error }),
        el('p', { class: 'connector-desc', text: "Fix the JSON and click the reread button below." })
      ));
    }
    if (!servers.length) {
      node.appendChild(el('div', { class: 'connector-empty', text: "Local MCP not added yet. Click \"Add\": there are ready servers, a special JSON, and a CLI command." }));
      return;
    }
    servers.forEach((server) => {
      const name = String(server.name || server.id || '');
      const busy = state.connectorBusy.has(name);
      const isConnected = Boolean(server.running || server.status === 'connected');
      const tools = Array.isArray(server.tools) ? server.tools : [];
      const toolsLabel = tools.length
        ? `${tools.slice(0, 6).map((tool) => tool.name).filter(Boolean).join(', ')}${tools.length > 6 ? ` and also ${tools.length - 6}` : ''}`
        : '';
      const unsupported = server.status === 'unsupported' || server.transport === 'http';
      const card = el('article', {
        class: `connector-card${isConnected ? ' is-connected' : ''}${server.status === 'error' || server.error ? ' is-error' : ''}${!server.enabled ? ' is-disabled' : ''}`
      },
        el('div', { class: 'connector-main' },
          connectorLogoNode(server),
          el('span', { class: 'connector-status-dot', 'aria-hidden': 'true' }),
          el('span', { class: 'connector-name', title: name, text: name }),
          el('span', { class: 'connector-meta', text: `${connectorStatusLabel(server)}${isConnected ? ` · ${tools.length} tools` : ''}` })
        ),
        server.description ? el('p', { class: 'connector-desc', text: server.description }) : null,
        server.command_display ? el('div', { class: 'connector-command', title: server.command_display, text: server.command_display }) : null,
        toolsLabel ? el('div', { class: 'connector-tools', title: tools.map((tool) => tool.name).join(', '), text: `Tools: ${toolsLabel}` }) : null,
        unsupported ? el('p', { class: 'connector-error', text: "Remote HTTP/SSE MCP is not supported by this version yet. Add the same server as a local STDIO CLI command." }) : null,
        server.error ? el('p', { class: 'connector-error', text: String(server.error) }) : null
      );
      const actions = el('div', { class: 'connector-actions' });
      const addAction = (label, handler, { disabled = false, danger = false } = {}) => {
        const button = el('button', {
          class: `button${danger ? ' button-danger' : ' button-quiet'}`, type: 'button', disabled,
          onclick: () => void handler()
        }, el('span', { text: label }));
        actions.appendChild(button);
        return button;
      };
      addAction(busy ? "Connecting…" : (isConnected ? "Check" : (server.status === 'error' ? "Retry" : "Connect")),
        () => runConnectorAction(name, () => API.connectConnector(name), `Connector ${name} connected.`),
        { disabled: busy || !server.enabled || unsupported });
      if (isConnected) {
        addAction("Disconnect", () => runConnectorAction(name, () => API.disconnectConnector(name), `Connector ${name} stopped.`), { disabled: busy });
      }
      addAction(server.enabled ? "Turn off" : "Turn on",
        () => runConnectorAction(name, () => API.setConnectorEnabled(name, !server.enabled), server.enabled ? `Connector ${name} off.` : `Connector ${name} on.`),
        { disabled: busy });
      addAction("Delete", () => confirmDeleteConnector(server), { disabled: busy, danger: true });
      card.appendChild(actions);
      node.appendChild(card);
    });
    node.scrollTop = scrollTop;
  }

  async function runConnectorAction(name, action, successMessage = '') {
    if (!name || state.connectorBusy.has(name)) return null;
    state.connectorBusy.add(name);
    renderConnectorsPanel();
    try {
      const payload = await action();
      if (payload && typeof payload === 'object' && (Array.isArray(payload.servers) || payload.server)) {
        applyConnectorsPayload(payload);
      } else {
        await loadConnectors({ silent: true });
      }
      const server = payload?.server || connectorServersList().find((item) => String(item.name) === String(name));
      if (server?.status === 'error') {
        toast(server.error || "MCP server did not start. Check the command and installed dependencies.", 'warning', `Connector ${name}`);
      } else if (server?.status === 'unsupported') {
        toast("Remote HTTP/SSE MCP is not supported yet; a local STDIO server is needed.", 'warning', `Connector ${name}`);
      } else if (successMessage) {
        toast(successMessage, 'success');
      }
      return payload;
    } catch (error) {
      toast(errorMessage(error), 'error', `Connector ${name}`);
      await loadConnectors({ silent: true });
      return null;
    } finally {
      state.connectorBusy.delete(name);
      renderConnectorsPanel();
    }
  }

  function confirmDeleteConnector(server) {
    const name = String(server?.name || server?.id || '');
    if (!name) return;
    mountModal({
      title: "Delete the connector?",
      subtitle: name,
      size: 'small',
      content: el('p', { class: 'modal-copy', text: "The entry will be deleted from ~/.arena-personal/mcp.json, and the running MCP process stopped. The installed software and its files will not be deleted." }),
      actions: [
        { label: "Cancel", variant: 'quiet' },
        {
          label: "Delete", variant: 'danger', icon: 'trash',
          onClick: async () => { await runConnectorAction(name, () => API.deleteConnector(name), `Connector ${name} deleted.`); }
        }
      ]
    });
  }

  async function openConnectorConfig({ silent = false } = {}) {
    try {
      const result = await API.openConnectorConfig();
      const path = String(result?.path || state.connectors?.config_path || '~/.arena-personal/mcp.json');
      if (!silent) toast(`File opened: ${path}. After saving, click reread list.`, 'success', 'MCP JSON');
      return path;
    } catch (error) {
      toast(errorMessage(error), 'error', "MCP JSON is not open");
      return null;
    }
  }

  function parseEnvTextarea(value) {
    const env = {};
    String(value || '').split(/\r?\n/).forEach((line, index) => {
      const clean = line.trim();
      if (!clean || clean.startsWith('#')) return;
      const eq = clean.indexOf('=');
      if (eq <= 0) throw new ApiError(`env line ${index + 1}: required format NAME=value.`);
      const key = clean.slice(0, eq).trim();
      if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(key)) throw new ApiError(`env line ${index + 1}: incorrect variable name.`);
      let item = clean.slice(eq + 1).trim();
      if ((item.startsWith('"') && item.endsWith('"')) || (item.startsWith("'") && item.endsWith("'"))) item = item.slice(1, -1);
      env[key] = item;
    });
    return env;
  }

  function openConnectorJsonOpenedModal(path) {
    const content = el('div', {},
      el('div', { class: 'note-box' }, iconEl('check'), el('span', { text: "The special MCP file is already open in the system editor." })),
      el('p', { class: 'modal-copy', text: "Add servers to the mcpServers object, save the file, then come back here and click 'Reload'. Local STDIO servers with command, args, env, and cwd are supported." }),
      el('div', { class: 'permission-detail-label', text: "File path" }),
      el('pre', { class: 'permission-detail', text: path })
    );
    mountModal({
      title: "MCP JSON is open",
      subtitle: 'Arena Desktop · ~/.arena-personal/mcp.json',
      size: 'medium',
      content,
      actions: [
        { label: "Close", variant: 'quiet' },
        {
          label: "I saved it — reload", variant: 'primary', icon: 'refresh', autofocus: true,
          onClick: async () => {
            await loadConnectors({ reload: true });
            setWorkspacePanelOpen(true, { focusConnectors: true, load: false });
            toast("MCP configuration reloaded.", 'success');
          }
        }
      ]
    });
  }

  function openAddConnectorModal(section = 'all') {
    const localOnly = section === 'local';
    const wrap = el('div');
    const render = () => {
      clear(wrap);
      if (!localOnly) {
      wrap.appendChild(el('h3', { class: 'modal-section-title', text: 'Official Arena connectors' }));
      const arenaBox = el('div', { class: 'arena-connector-list' });
      if (!state.authenticated) {
        arenaBox.appendChild(el('div', { class: 'connector-empty', text: "Log in to Arena to connect official connectors to your account directly from the app." }));
      } else if (state.arenaConnectorsLoading && !state.arenaConnectors) {
        arenaBox.appendChild(el('div', { class: 'connector-empty' }, el('span', { class: 'mini-spinner' }), el('span', { text: " Loading Arena catalog…" })));
      } else if (!state.arenaConnectors && state.arenaConnectorsError) {
        arenaBox.append(
          el('div', { class: 'connector-empty', text: state.arenaConnectorsError }),
          el('button', { class: 'button button-small button-quiet', type: 'button', onclick: () => void loadArenaConnectors().then(render) },
            iconEl('refresh'), el('span', { text: "Retry" }))
        );
      } else if (!arenaConnectorsList().length) {
        arenaBox.appendChild(el('div', { class: 'connector-empty', text: "Arena did not return a list of connectors for this account." }));
      } else {
        arenaConnectorsList().forEach((item) => arenaBox.appendChild(arenaConnectorRow(item)));
      }
      wrap.appendChild(arenaBox);
      wrap.appendChild(el('p', { class: 'field-help', text: 'The catalog and statuses come live from your arena.ai account: new official connectors appear automatically. Connected connectors are available to Arena Agent here.' }));
      }

      wrap.appendChild(el('div', { class: 'note-box' }, iconEl('plug'), el('span', {
        text: "Local MCP servers run on your computer under your user rights. Their tools will appear in the local Agent; external and modifying actions still go through the permission mode."
      })));
      wrap.appendChild(el('h3', { class: 'modal-section-title', text: "Ready local MCP servers" }));
      const grid = el('div', { class: 'connector-preset-grid' });
      const presets = connectorPresetsList();
      if (!presets.length) {
        grid.appendChild(el('div', { class: 'connector-empty', text: state.connectorsLoading ? "Loading MCP list…" : (state.connectorsError || "MCP preset list not available.") }));
      }
      presets.forEach((preset) => {
        const installed = Boolean(preset.installed || connectorServersList().some((server) => server.preset_id === preset.id || server.name === preset.id));
        const docs = safeUrl(preset.docs || '');
        const main = el('div', { class: 'connector-preset-main' },
          el('div', { class: 'connector-preset-title', text: `${preset.name}${preset.vendor ? ` · ${preset.vendor}` : ''}` }),
          el('p', { class: 'connector-preset-desc', text: preset.description || '' }),
          preset.requirements ? el('p', { class: 'connector-preset-desc', text: `Required: ${preset.requirements}` }) : null,
          docs ? el('a', { href: docs, target: '_blank', rel: 'noopener noreferrer', text: "Documentation" }) : null
        );
        const button = el('button', {
          class: 'button button-small', type: 'button', disabled: installed,
          onclick: () => openPresetConnectorModal(preset)
        }, el('span', { text: installed ? "Added" : "Connect" }));
        grid.appendChild(el('div', { class: `connector-preset${installed ? ' is-configured' : ''}` }, main, button));
      });
      wrap.appendChild(grid);

      wrap.appendChild(el('h3', { class: 'modal-section-title', text: "Add MCP" }));
      const methods = el('div', { class: 'connector-method-cards' },
        el('button', {
          class: 'connector-method-card', type: 'button',
          onclick: async () => {
            const path = await openConnectorConfig({ silent: true });
            if (path) openConnectorJsonOpenedModal(path);
          }
        }, iconEl('braces'), el('span', {},
          el('strong', { text: "Special JSON file" }),
          el('span', { text: "~/.arena-personal/mcp.json will open automatically. Add mcpServers and save." }))),
        el('button', {
          class: 'connector-method-card', type: 'button',
          onclick: () => openCliConnectorModal()
        }, iconEl('terminal'), el('span', {},
          el('strong', { text: "CLI command" }),
          el('span', { text: "For example: npx -y @modelcontextprotocol/server-filesystem C:\\Projects or uvx mcp-server-fetch." })))
      );
      wrap.appendChild(methods);
      if (state.connectors?.config_path) {
        wrap.appendChild(el('p', { class: 'field-help', text: `Configuration file: ${state.connectors.config_path}` }));
      }
      const reloadRow = el('div', { class: 'setting-actions' },
        el('button', {
          class: 'button button-small button-quiet', type: 'button',
          onclick: async () => { await loadConnectors({ reload: true }); render(); toast("MCP configuration reloaded.", 'success'); }
        }, iconEl('refresh'), el('span', { text: "Reload mcp.json" }))
      );
      wrap.appendChild(reloadRow);
    };
    addConnectorModalRender = render;
    render();
    mountModal({
      title: localOnly ? 'Add MCP server' : 'Add connector',
      subtitle: localOnly ? 'Ready-made presets, JSON config or a CLI command' : 'Official Arena connectors and local MCP servers',
      size: 'large',
      content: wrap,
      actions: [{ label: 'Close', variant: 'primary', autofocus: true }]
    });
    if (!state.connectors) void loadConnectors({ silent: true }).then(render);
    if (!localOnly && state.authenticated && !state.arenaConnectors) void loadArenaConnectors({ silent: true }).then(render);
  }

  function connectorFieldInput(field) {
    const type = String(field?.type || 'text');
    if (type === 'checkbox') {
      return el('input', { type: 'checkbox', checked: field.default !== false });
    }
    return el('input', {
      class: `input${type === 'password' || field.key === 'path' ? ' mono' : ''}`,
      type: type === 'password' ? 'password' : 'text',
      value: field.default ?? '',
      autocomplete: type === 'password' ? 'new-password' : 'off',
      spellcheck: 'false'
    });
  }

  function openPresetConnectorModal(preset) {
    const Fields = Array.isArray(preset.Fields) ? preset.Fields : (Array.isArray(preset.fields) ? preset.fields : []);
    const refs = {};
    const wrap = el('div', {},
      el('p', { class: 'modal-copy', text: preset.description || '' }),
      preset.requirements ? el('div', { class: 'note-box' }, iconEl('info'), el('span', { text: `Before connecting, the following must be installed: ${preset.requirements}. Arena Desktop does not install Node.js, uv, or Docker automatically.` })) : null
    );
    Fields.forEach((field) => {
      const input = connectorFieldInput(field);
      refs[field.key] = { field, input };
      const id = `connector-field-${preset.id}-${field.key}`;
      input.id = id;
      if (field.type === 'checkbox') {
        wrap.appendChild(el('label', { class: 'field-label', for: id }, input, el('span', { text: ` ${field.label || field.key}` })));
      } else {
        wrap.append(
          el('label', { class: 'field-label', for: id, text: field.label || field.key }),
          input,
          field.help ? el('p', { class: 'field-help', text: field.help }) : null
        );
      }
    });
    if (preset.id === 'github') {
      wrap.appendChild(el('div', { class: 'note-box is-warning' }, iconEl('lock'), el('span', {
        text: "If you insert the token here, it will be saved locally in ~/.arena-personal/mcp.json in plain text. It is safer to leave the field blank and set the system variable GITHUB_PERSONAL_ACCESS_TOKEN."
      })));
    }
    const connectNow = el('input', { type: 'checkbox', checked: true, id: `connector-connect-${preset.id}` });
    wrap.appendChild(el('label', { class: 'field-label', for: connectNow.id }, connectNow, el('span', { text: " Connect and check immediately" })));
    mountModal({
      title: preset.name,
      subtitle: preset.vendor ? `Ready local MCP · ${preset.vendor}` : "Ready local MCP",
      size: 'medium',
      content: wrap,
      actions: [
        { label: "Cancel", variant: 'quiet' },
        {
          label: "Add", variant: 'primary', icon: 'plug', autofocus: !Fields.length,
          onClick: async () => {
            const values = {};
            for (const [key, ref] of Object.entries(refs)) {
              const value = ref.field.type === 'checkbox' ? Boolean(ref.input.checked) : String(ref.input.value || '').trim();
              if (ref.field.required && !value) throw new ApiError(`Fill in the field "${ref.field.label || key}».`);
              values[key] = value;
            }
            const payload = await API.installConnectorPreset(preset.id, values, Boolean(connectNow.checked));
            applyConnectorsPayload(payload);
            setWorkspacePanelOpen(true, { focusConnectors: true, load: false });
            const server = payload?.server;
            if (connectNow.checked && server?.status === 'error') toast(server.error || "Server added, but did not start.", 'warning', preset.name);
            else if (connectNow.checked) toast(`Connector ${preset.name} connected.`, 'success');
            else toast(`Connector ${preset.name} added. Click 'Connect' when you are ready.`, 'success');
          }
        }
      ]
    });
  }

  function openCliConnectorModal() {
    const nameInput = el('input', { class: 'input mono', type: 'text', placeholder: 'my-server', autocomplete: 'off', spellcheck: 'false' });
    const commandInput = el('textarea', { class: 'input mono', rows: '3', placeholder: 'npx -y @modelcontextprotocol/server-filesystem C:\\Projects', spellcheck: 'false' });
    const cwdInput = el('input', { class: 'input mono', type: 'text', placeholder: "Optional — default Workspace", autocomplete: 'off', spellcheck: 'false' });
    const envInput = el('textarea', { class: 'input mono', rows: '4', placeholder: 'API_KEY=${MY_API_KEY}\nDEBUG=0', spellcheck: 'false' });
    const descInput = el('input', { class: 'input', type: 'text', placeholder: "What this server does (optional)", autocomplete: 'off' });
    const connectNow = el('input', { type: 'checkbox', checked: true });
    const wrap = el('div', {},
      el('div', { class: 'note-box is-warning' }, iconEl('shield-alert'), el('span', {
        text: "This command will run locally when connected and when using the Agent. Add only MCP servers you trust."
      })),
      el('label', { class: 'field-label', text: "Name" }), nameInput,
      el('p', { class: 'field-help', text: "Latin letters, numbers, period, hyphen, and underscore." }),
      el('label', { class: 'field-label', text: "MCP STDIO CLI command" }), commandInput,
      el('p', { class: 'field-help', text: "The command must communicate via MCP through stdin/stdout. Remote URL is not suitable here." }),
      el('label', { class: 'field-label', text: "Working folder (optional)" }), cwdInput,
      el('label', { class: 'field-label', text: "Environment variables (one per line)" }), envInput,
      el('p', { class: 'field-help', text: "For secrets, links of the form ${VARIABLE_NAME} are preferable: the value will be taken from the system environment and will not appear in mcp.json." }),
      el('label', { class: 'field-label', text: "Description" }), descInput,
      el('label', { class: 'field-label' }, connectNow, el('span', { text: " Connect and check immediately" }))
    );
    mountModal({
      title: "Add MCP via CLI",
      subtitle: "Local STDIO server in ~/.arena-personal/mcp.json",
      size: 'large',
      content: wrap,
      actions: [
        { label: "Cancel", variant: 'quiet' },
        {
          label: "Add", variant: 'primary', icon: 'plug',
          onClick: async () => {
            const name = nameInput.value.trim();
            const command = commandInput.value.trim();
            if (!name) throw new ApiError("Enter the connector name.");
            if (!command) throw new ApiError("Enter the CLI command.");
            const payload = await API.addConnectorCli({
              name,
              command,
              cwd: cwdInput.value.trim(),
              env: parseEnvTextarea(envInput.value),
              description: descInput.value.trim(),
              connect: Boolean(connectNow.checked)
            });
            applyConnectorsPayload(payload);
            setWorkspacePanelOpen(true, { focusConnectors: true, load: false });
            const server = payload?.server;
            if (connectNow.checked && server?.status === 'error') toast(server.error || "Server added, but did not start.", 'warning', name);
            else if (connectNow.checked) toast(`Connector ${name} connected.`, 'success');
            else toast(`Connector ${name} added.`, 'success');
          }
        }
      ]
    });
    window.setTimeout(() => nameInput.focus(), 30);
  }

  /* ---------------------------------------------------------------------- */
  /* Elements and event wiring                                             */
  // ═══ 14-boot.js ═══
  /* ---------------------------------------------------------------------- */
  function cacheElements() {
    els.app = $('#app');
    els.sidebar = $('#sidebar');
    els.collapseSidebar = $('#collapseSidebar');
    els.newChatBtn = $('#newChatBtn');
    els.modelsNavBtn = $('#modelsNavBtn');
    els.modelsNavCount = $('#modelsNavCount');
    els.searchNavBtn = $('#searchNavBtn');
    els.workspacePanelNavBtn = $('#workspacePanelNavBtn');
    els.connectorsNavBtn = $('#connectorsNavBtn');
    els.connectorsNavCount = $('#connectorsNavCount');
    els.recentsToggle = $('#recentsToggle');
    els.recentsBody = $('#recentsBody');
    els.chatCount = $('#chatCount');
    els.refreshChats = $('#refreshChats');
    els.chatSearchWrap = $('#chatSearchWrap');
    els.chatSearch = $('#chatSearch');
    els.clearChatSearch = $('#clearChatSearch');
    els.chatList = $('#chatList');
    els.accountButton = $('#accountButton');
    els.accountAvatar = $('#accountAvatar');
    els.accountName = $('#accountName');
    els.accountState = $('#accountState');
    els.accountDot = $('#accountDot');
    els.sidebarScrim = $('#sidebarScrim');
    els.mobileMenuBtn = $('#mobileMenuBtn');
    els.topbarTitle = $('#topbarTitle');
    els.crumbTitle = $('.crumb-title');
    els.demoChip = $('#demoChip');
    els.workspacePanelTopButton = $('#workspacePanelTopButton');
    els.engineTopButton = $('#engineTopButton');
    els.connectionBanner = $('#connectionBanner');
    els.bannerTitle = $('#bannerTitle');
    els.bannerText = $('#bannerText');
    els.bannerRetry = $('#bannerRetry');
    els.bannerDemo = $('#bannerDemo');
    els.demoBanner = $('#demoBanner');
    els.demoExitBtn = $('#demoExitBtn');
    els.footerConnectionDot = $('#footerConnectionDot');
    els.footerConnectionText = $('#footerConnectionText');
    els.content = $('#content');
    els.welcomeView = $('#welcomeView');
    els.chatView = $('#chatView');
    els.chatEyebrow = $('#chatEyebrow');
    els.chatTitle = $('#chatTitle');
    els.chatMeta = $('#chatMeta');
    els.chatSettingsButton = $('#chatSettingsButton');
    els.challengeSlot = $('#challengeSlot');
    els.messageList = $('#messageList');
    els.composerForm = $('#composerForm');
    els.composerCard = $('.composer-card');
    els.usageBarWrap = $('#usageBarWrap');
    els.usageBarFill = $('#usageBarFill');
    els.usageBarLabel = $('#usageBarLabel');
    els.composerShell = $('.composer-shell');
    els.welcomeComposerSlot = $('#welcomeComposerSlot');
    els.mainArea = $('.main-area');
    els.prompt = $('#prompt');
    els.attachButton = $('#attachButton');
    els.fileInput = $('#fileInput');
    els.attachmentStrip = $('#attachmentStrip');
    els.dropOverlay = $('#dropOverlay');
    els.modelStrip = $('#modelStrip');
    els.modeBar = $('#modeBar');
    els.modalityBar = $('#modalityBar');
    els.composerContext = $('#composerContext');
    els.contextMode = $('#contextMode');
    els.contextModality = $('#contextModality');
    els.contextModel = $('#contextModel');
    els.contextPending = $('#contextPending');
    els.workspaceButton = $('#workspaceButton');
    els.workspaceLabel = $('#workspaceLabel');
    els.modeButton = $('#modeButton');
    els.modeLabel = $('#modeLabel');
    els.modalityButton = $('#modalityButton');
    els.modalityLabel = $('#modalityLabel');
    els.sidebarResize = $('#sidebarResize');
    els.workspaceResize = $('#workspaceResize');
    els.workspaceSplitResize = $('#workspaceSplitResize');
    els.permissionButton = $('#permissionButton');
    els.workspaceSyncChip = $('#workspaceSyncChip');
    els.workspaceSyncToggle = $('#workspaceSyncToggle');
    els.compactButton = $('#compactButton');
    els.gatewayChip = $('#gatewayChip');
    els.compactDot = $('#compactDot');
    els.permissionLabel = $('#permissionLabel');
    els.pendingPermissionsBadge = $('#pendingPermissionsBadge');
    els.sendButton = $('#sendButton');
    els.stopButton = $('#stopButton');
    els.composerHint = $('#composerHint');
    els.composerSecondaryHint = $('#composerSecondaryHint');
    els.workspacePanel = $('#workspacePanel');
    els.workspacePanelRoot = $('#workspacePanelRoot');
    els.workspacePanelClose = $('#workspacePanelClose');
    els.workspaceTree = $('#workspaceTree');
    els.workspaceOpenButton = $('#workspaceOpenButton');
    els.workspaceRunButton = $('#workspaceRunButton');
    els.workspaceRunStatus = $('#workspaceRunStatus');
    els.workspaceRefreshButton = $('#workspaceRefreshButton');
    els.connectorsPane = $('#connectorsPane');
    els.connectorList = $('#connectorList');
    els.addConnectorButton = $('#addConnectorButton');
    els.openMcpJsonButton = $('#openMcpJsonButton');
    els.reloadConnectorsButton = $('#reloadConnectorsButton');
    els.dockPane = $('#dockPane');
    els.dockTitle = $('#dockTitle');
    els.dockSubtitle = $('#dockSubtitle');
    els.dockCloseButton = $('#dockCloseButton');
    els.dockRefreshButton = $('#dockRefreshButton');
    els.dockHideButton = $('#dockHideButton');
    els.dockDescription = $('#dockDescription');
    els.dockNote = $('#dockNote');
    els.popoverRoot = $('#popoverRoot');
    els.modalRoot = $('#modalRoot');
    els.toastRoot = $('#toastRoot');
    els.liveRegion = $('#liveRegion');
    els.helpButton = $('#helpTopButton');
  }

  function ensureBypassWarning() {
    if (!els.composerContext || !els.composerContext.parentNode) return null;
    let warning = $('#permissionDangerBanner');
    if (!warning) {
      warning = el('div', { class: 'composer-warning', id: 'permissionDangerBanner', role: 'alert', hidden: true });
      warning.append(iconEl('shield-alert'), el('span', { text: "Permission bypass enabled: backend can perform actions without confirmation. This is dangerous outside an isolated environment." }));
      els.composerContext.insertAdjacentElement('afterend', warning);
    }
    warning.hidden = state.permissionMode !== 'bypassPermissions';
    return warning;
  }

  function restoreSidebarPreference() {
    try {
      const stored = localStorage.getItem('arenaPersonal.sidebarCollapsed.v4');
      if (stored === '1') setSidebarCollapsed(true);
      else setSidebarCollapsed(false);
    } catch {
      setSidebarCollapsed(false);
    }
  }

  function setupNativeBridge() {
    const markReady = () => {
      const api = window.pywebview?.api;
      if (!api) return;
      if (state.nativeReady) return;
      state.nativeReady = true;
      if (state.settingsTab === 'workspace') state.settingsRerender?.();
      announce("Native pywebview integration is ready. Folder selection is available.");
    };
    window.addEventListener('pywebviewready', markReady);
    document.addEventListener('pywebviewready', markReady);
    if (window.pywebview?.api) window.setTimeout(markReady, 0);
  }

  function bindEvents() {
    els.composerForm?.addEventListener('submit', (event) => {
      event.preventDefault();
      void sendMessage();
    });
    els.prompt?.addEventListener('input', () => {
      state.draft = els.prompt.value;
      saveComposerDraft();
      resizePrompt();
      updateComposerState();
    });
    document.addEventListener('pointerdown', primeDoneAudio);
    document.addEventListener('keydown', primeDoneAudio);
    document.addEventListener('keydown', (event) => {
      if ((event.ctrlKey || event.metaKey) && !event.shiftKey && !event.altKey
        && event.key.toLowerCase() === 'f' && state.view === 'chat') {
        event.preventDefault();
        toggleFindBar();
      }
    });
    els.prompt?.addEventListener('keydown', (event) => {
      if (event.key !== 'Enter' || event.shiftKey || event.isComposing || event.keyCode === 229) return;
      event.preventDefault();
      void sendMessage();
    });
    els.prompt?.addEventListener('focus', () => {
      els.prompt?.parentElement?.classList.add('is-focused');
    });
    els.prompt?.addEventListener('blur', () => {
      els.prompt?.parentElement?.classList.remove('is-focused');
    });

    els.newChatBtn?.addEventListener('click', () => { void createNewChat(); });
    els.collapseSidebar?.addEventListener('click', () => setSidebarCollapsed(!state.sidebarCollapsed));
    els.mobileMenuBtn?.addEventListener('click', () => {
      if (els.app?.classList.contains('mobile-sidebar-open')) closeMobileSidebar();
      else openMobileSidebar();
    });
    els.sidebarScrim?.addEventListener('click', closeMobileSidebar);
    els.refreshChats?.addEventListener('click', async () => {
      if (state.chatsLoading) return;
      els.refreshChats.classList.add('is-spinning');
      await loadChats();
      els.refreshChats.classList.remove('is-spinning');
    });
    els.recentsToggle?.addEventListener('click', () => {
      const expanded = els.recentsToggle.getAttribute('aria-expanded') !== 'false';
      els.recentsToggle.setAttribute('aria-expanded', String(!expanded));
      els.recentsBody.hidden = expanded;
    });
    els.searchNavBtn?.addEventListener('click', () => {
      setChatSearchVisible(true);
      if (els.recentsToggle.getAttribute('aria-expanded') === 'false') {
        els.recentsToggle.setAttribute('aria-expanded', 'true');
        els.recentsBody.hidden = false;
      }
    });
    els.modelsNavBtn?.addEventListener('click', () => {
      if (!allowsManualModels()) {
        toast("In this mode, model selection is disabled.", 'info');
        return;
      }
      if (state.generating) {
        toast("Models can be changed after generation is complete.", 'info');
        return;
      }
      openModelPicker('a', els.modelsNavBtn);
    });
    els.chatSearch?.addEventListener('input', () => {
      state.chatFilter = els.chatSearch.value;
      els.clearChatSearch.hidden = !state.chatFilter;
      renderChats();
      window.clearTimeout(state._searchTimer);
      const q = state.chatFilter.trim();
      if (q.length >= 2) {
        state._searchTimer = window.setTimeout(async () => {
          try {
            const hits = await API.searchChats(q);
            if (state.chatFilter.trim() === q) {
              state.searchResults = Array.isArray(hits) ? hits : [];
              renderChats();
            }
          } catch { /* server offline: title filter still works */ }
        }, 300);
      } else if (state.searchResults.length) {
        state.searchResults = [];
      }
    });
    initJumpPill();
    window.__quickAsk = (text) => {
      const t = String(text || '').trim();
      if (!t) return;
      const begin = () => {
        if (els.prompt) { els.prompt.value = t; updateComposerState(); void sendMessage(); }
      };
      Promise.resolve(createNewChat({ focus: false })).then(begin).catch(begin);
    };
    els.clearChatSearch?.addEventListener('click', () => {
      if (!els.chatSearch) return;
      els.chatSearch.value = '';
      state.chatFilter = '';
      els.clearChatSearch.hidden = true;
      els.chatSearch.focus();
      renderChats();
    });
    els.accountButton?.addEventListener('click', () => openAccountMenu());
    els.bannerRetry?.addEventListener('click', () => { void retryConnection(); });
    els.demoExitBtn?.addEventListener('click', () => { window.location.href = window.location.pathname; });
    els.bannerDemo?.addEventListener('click', () => { /* Navigation to ?demo=1 is the explicit opt-in. */ });

    els.workspaceButton?.addEventListener('click', () => openWorkspacePopover(els.workspaceButton));
    els.workspaceOpenButton?.addEventListener('click', () => { void openWorkspaceFolder(state.workspacePanelRoot || state.workspace); });
    els.workspaceRunButton?.addEventListener('click', () => { void startRunLocal(); });
    els.workspaceRefreshButton?.addEventListener('click', async () => {
      els.workspaceRefreshButton.classList.add('is-spinning');
      try { await loadWorkspaceTree('.', { force: true }); }
      finally { els.workspaceRefreshButton.classList.remove('is-spinning'); }
    });
    els.addConnectorButton?.addEventListener('click', () => openAddConnectorModal());
    els.openMcpJsonButton?.addEventListener('click', async () => {
      const path = await openConnectorConfig({ silent: true });
      if (path) openConnectorJsonOpenedModal(path);
    });
    els.reloadConnectorsButton?.addEventListener('click', async () => {
      els.reloadConnectorsButton.classList.add('is-spinning');
      try {
        await Promise.allSettled([
          loadConnectors({ reload: true }),
          state.authenticated ? loadArenaConnectors({ silent: true }) : Promise.resolve()
        ]);
        toast("Connectors updated: MCP reread, Arena list pulled from the account.", 'success');
      } finally {
        els.reloadConnectorsButton.classList.remove('is-spinning');
      }
    });
    els.modeButton?.addEventListener('click', () => {
      if (!els.modeButton.disabled) openModePopover();
    });
    els.modalityButton?.addEventListener('click', () => {
      if (!els.modalityButton.disabled) openModalityPopover();
    });
    els.permissionButton?.addEventListener('click', () => {
      if (!els.permissionButton.disabled) openPermissionModePopover();
    });
    els.workspaceSyncToggle?.addEventListener('change', () => setWorkspaceSync(els.workspaceSyncToggle.checked));
    els.compactButton?.addEventListener('click', confirmCompact);
    els.gatewayChip?.addEventListener('click', () => openSettings('gateway'));
    els.sendButton?.setAttribute('type', 'submit');
    els.stopButton?.addEventListener('click', () => { void stopGeneration(); });
    els.chatSettingsButton?.addEventListener('click', () => openSettings('permissions'));

    /* Attachments: +, file picker, paste, drag & drop */
    els.attachButton?.addEventListener('click', () => {
      if (!els.attachButton.disabled) openAttachMenu();
    });
    els.fileInput?.addEventListener('change', () => {
      addFiles(els.fileInput.files);
      els.fileInput.value = '';
      focusComposer();
    });
    els.prompt?.addEventListener('paste', (event) => {
      const files = event.clipboardData?.files;
      if (files && files.length) {
        event.preventDefault();
        addFiles(files);
      }
    });
    const dropCard = els.composerCard;
    if (dropCard) {
      const hasFiles = (event) => Array.from(event.dataTransfer?.types || [])
        .some((t) => t === 'Files' || String(t).toLowerCase() === 'application/x-arena-workspace-path');
      const showOverlay = () => { if (els.dropOverlay) els.dropOverlay.hidden = false; };
      const hideOverlay = () => { if (els.dropOverlay) els.dropOverlay.hidden = true; };
      dropCard.addEventListener('dragenter', (event) => {
        if (!hasFiles(event)) return;
        event.preventDefault();
        showOverlay();
      });
      dropCard.addEventListener('dragover', (event) => {
        if (!hasFiles(event)) return;
        event.preventDefault();
        event.dataTransfer.dropEffect = 'copy';
        showOverlay();
      });
      dropCard.addEventListener('dragleave', (event) => {
        if (event.currentTarget === dropCard && !dropCard.contains(event.relatedTarget)) hideOverlay();
      });
      dropCard.addEventListener('drop', (event) => {
        event.preventDefault();
        hideOverlay();
        const workspacePath = event.dataTransfer?.getData('application/x-arena-workspace-path');
        if (workspacePath) { void attachWorkspaceFile(workspacePath); return; }
        addFiles(event.dataTransfer?.files);
      });
    }
    window.addEventListener('dragover', (event) => event.preventDefault());
    window.addEventListener('drop', (event) => event.preventDefault());

    els.dockCloseButton?.addEventListener('click', () => { void hideEngine(); });
    els.dockHideButton?.addEventListener('click', () => { void hideEngine(); });
    els.dockRefreshButton?.addEventListener('click', () => { void showEngine(); });

    document.addEventListener('click', handleDelegatedClick);
    document.addEventListener('keydown', handleGlobalKeydown);
    window.addEventListener('resize', () => {
      closePopover(false);
      if (!window.matchMedia('(max-width: 900px)').matches) closeMobileSidebar();
    });
    window.addEventListener('offline', () => {
      state.networkOffline = true;
      updateConnectionUI();
      updateComposerState();
      toast("Network unavailable. Local interface remains open, but sending is blocked.", 'warning', "Offline");
    });
    window.addEventListener('online', () => {
      state.networkOffline = false;
      updateConnectionUI();
      updateComposerState();
      toast("Connection to the network restored. Check the local server.", 'info');
    });
    window.addEventListener('beforeunload', (event) => {
      if (!anyGenerationRunning()) return;
      event.preventDefault();
      event.returnValue = "Generation is still in progress.";
      return event.returnValue;
    });
  }

  function handleDelegatedClick(event) {
    const target = event.target instanceof Element ? event.target : null;
    if (!target) return;

    const actionNode = target.closest('[data-action]');
    if (actionNode) {
      const action = actionNode.dataset.action;
      if (action) event.preventDefault();
      switch (action) {
        case 'home':
          if (state.generating) {
            toast("Stop generation before going to the main page.", 'warning');
          } else {
            state.historyRequest = (state.historyRequest || 0) + 1;
            state.activeChatId = null;
            state.activeChatTitle = '';
            state.messages = [];
            state.artifacts = [];
            state.historyError = null;
            state.historyLoading = false;
            state.challenge = null;
            updateArtifactCount();
            updateComposerState();
            renderChats();
            renderWelcomeState();
            closeMobileSidebar();
          }
          break;
        case 'new-chat':
          void createNewChat();
          break;
        case 'models':
          openModelPicker('a', actionNode);
          break;
        case 'workspace':
          openWorkspacePopover(els.workspaceButton || actionNode);
          break;
        case 'workspace-panel':
          setWorkspacePanelOpen(!state.workspacePanelOpen);
          closeMobileSidebar();
          break;
        case 'connectors-panel':
          setWorkspacePanelOpen(true, { focusConnectors: true });
          closeMobileSidebar();
          break;
        case 'workspace-panel-close':
          setWorkspacePanelOpen(false);
          break;
        case 'settings':
        case 'account':
        case 'settings-connection':
          openSettings('connection');
          break;
        case 'help':
          openHelp();
          break;
        case 'about':
        case 'limits':
        case 'transfer':
          openSettings('about');
          break;
        case 'engine-show':
          void showEngine();
          break;
        case 'engine-hide':
          void hideEngine();
          break;
        case 'retry-connection':
          void retryConnection();
          break;
        case 'retry-chats':
          void loadChats();
          break;
        case 'retry-arena-chats':
          void loadArenaChats();
          break;
        case 'retry-models':
          void loadModels(state.modality);
          break;
        case 'retry-history':
          void retryPendingHistory();
          break;
        default:
          break;
      }
      return;
    }

    const cloudChatDelete = target.closest('[data-cloud-chat-delete]');
    if (cloudChatDelete) {
      event.preventDefault();
      event.stopPropagation();
      const id = cloudChatDelete.dataset.cloudChatDelete;
      const entry = (state.cloudChats || []).find((item) => String(item.eval_id || item.id || '') === String(id));
      if (entry) confirmArchiveCloudChat(entry);
      return;
    }

    const cloudChatOpen = target.closest('[data-cloud-chat-open]');
    if (cloudChatOpen) {
      const id = cloudChatOpen.dataset.cloudChatOpen;
      const entry = state.cloudChats.find((item) => String(item.eval_id || item.id) === String(id))
        || { eval_id: id, id, type: cloudChatOpen.dataset.cloudChatType || 'evaluation' };
      void openArenaChat(entry);
      return;
    }
    const chatOpen = target.closest('[data-chat-open]');
    if (chatOpen) {
      void openChat(chatOpen.dataset.chatOpen);
      return;
    }
    const chatDelete = target.closest('[data-chat-delete]');
    if (chatDelete) {
      event.preventDefault();
      event.stopPropagation();
      if (chatIsGenerating(chatDelete.dataset.chatDelete)) {
        toast("First stop generation in this chat.", 'warning');
        return;
      }
      confirmDeleteChat(chatDelete.dataset.chatDelete);
      return;
    }

    const codeCopy = target.closest('[data-copy-code]');
    if (codeCopy) {
      const pre = codeCopy.closest('.code-block')?.querySelector('pre');
      if (!pre) return;
      void copyText(pre.textContent || '').then((ok) => {
        if (!ok) {
          toast("Failed to copy code.", 'error');
          return;
        }
        const label = codeCopy.querySelector('span:last-child');
        if (label) {
          const previous = label.textContent;
          label.textContent = "Copied and copied";
          window.setTimeout(() => { if (label.isConnected) label.textContent = previous; }, 1500);
        }
        announce("Code copied.");
      });
      return;
    }

    const answerCopy = target.closest('[data-copy-answer]');
    if (answerCopy) {
      const lane = answerCopy.closest('.assistant-lane');
      const answerText = lane?.querySelector('.markdown')?.textContent || '';
      if (!answerText) return;
      void copyText(answerText).then((ok) => {
        toast(ok ? "Response text copied to clipboard." : "Failed to copy the response.", ok ? 'success' : 'error');
      });
      return;
    }

    const modelPicker = target.closest('[data-model-picker]');
    if (modelPicker) {
      openModelPicker(modelPicker.dataset.modelPicker || 'a', modelPicker);
      return;
    }

    const permissionButton = target.closest('[data-permission-decision]');
    if (permissionButton) {
      const id = permissionButton.dataset.permissionId;
      const decision = permissionButton.dataset.permissionDecision;
      if (id && decision) void decidePermission(id, decision);
      return;
    }

    const mediaSave = target.closest('[data-save-media]');
    if (mediaSave) {
      void saveMediaFromEvent(mediaSave.dataset.saveMedia, mediaSave);
    }
  }

  function handleGlobalKeydown(event) {
    if (event.key === 'F1') {
      event.preventDefault();
      openHelp();
      return;
    }
    if (event.key === 'Escape') {
      if (state.activeModal) return;
      if (activePopover) {
        closePopover();
        return;
      }
      if (window.matchMedia('(max-width: 900px)').matches) closeMobileSidebar();
      if (!els.chatSearchWrap?.hidden) setChatSearchVisible(false);
      return;
    }
    if (state.activeModal) return;
    const modifier = event.ctrlKey || event.metaKey;
    if (!modifier || event.altKey) return;
    const key = event.key.toLowerCase();
    if (key === 'k') {
      event.preventDefault();
      setChatSearchVisible(true);
      if (els.recentsToggle.getAttribute('aria-expanded') === 'false') {
        els.recentsToggle.setAttribute('aria-expanded', 'true');
        els.recentsBody.hidden = false;
      }
    } else if (key === 'n') {
      event.preventDefault();
      void createNewChat();
    } else if (event.key === '/') {
      event.preventDefault();
      focusComposer();
    }
  }

  /* ---------------------------------------------------------------------- */
  /* Boot                                                                  */
  /* ---------------------------------------------------------------------- */
  /* ---------------------------------------------------------------------- */
  /* One-time first-run setup: checks what the app needs, offers installs.  */
  /* ---------------------------------------------------------------------- */
  async function runFirstRunSetup() {
    let settings = {};
    try { settings = await API.getSettings(); } catch { return; }
    if (settings?.setup_done || navigator.webdriver) return; // automated browsers (tests) never see the one-time overlay

    const overlay = el('div', { class: 'setup-overlay', role: 'dialog', 'aria-modal': 'true', 'aria-labelledby': 'setupTitle' });
    const list = el('ol', { class: 'setup-steps' });
    const finish = el('button', { class: 'button setup-finish', type: 'button', disabled: true }, el('span', { text: 'Checking…' }));
    overlay.appendChild(el('div', { class: 'setup-panel' },
      el('h2', { class: 'setup-title', id: 'setupTitle', text: 'Setting up Arena Desktop' }),
      el('p', { class: 'setup-sub', text: 'A one-time check of what this computer has. Optional tools can be installed now or later in Settings → Components.' }),
      list,
      el('div', { class: 'setup-actions' }, finish)));
    document.body.appendChild(overlay);

    const addStep = (label) => {
      const status = el('span', { class: 'setup-status is-run' }, el('span', { class: 'tool-spinner', 'aria-hidden': 'true' }));
      const detail = el('span', { class: 'setup-detail', text: '' });
      const row = el('li', { class: 'setup-step' }, status, el('div', { class: 'setup-copy' }, el('span', { class: 'setup-label', text: label }), detail));
      list.appendChild(row);
      return {
        row,
        done(text, kind = 'ok') {
          status.className = `setup-status is-${kind}`;
          status.replaceChildren(iconEl(kind === 'ok' ? 'check' : kind === 'warn' ? 'alert' : 'x'));
          detail.textContent = text || '';
        }
      };
    };
    const pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

    const app = addStep('App settings and data folder');
    await pause(250);
    app.done(state.appVersion ? `Version ${state.appVersion}` : 'Ready');

    const folder = addStep('Workspace folder');
    await pause(200);
    const ws = typeof state.workspace === 'string' ? state.workspace : '';
    folder.done(ws ? `${ws}${state.workspaceChosen ? '' : ' (default — change it from the folder menu)'}` : 'Pick one from the folder menu when you need it', ws ? 'ok' : 'warn');

    let components = [];
    try { components = (await API.getComponents())?.components || []; } catch { components = []; }
    const find = (id) => components.find((c) => c.id === id);
    const offer = (id, label, why) => {
      const step = addStep(label);
      const comp = find(id);
      if (!comp) { step.done('Could not check', 'warn'); return; }
      if (comp.installed) { step.done(comp.version ? `Installed · ${comp.version}` : 'Installed'); return; }
      step.done(`Not installed — ${why}`, 'warn');
      const install = el('button', { class: 'button button-quiet setup-install', type: 'button' }, el('span', { text: 'Install' }));
      install.addEventListener('click', async () => {
        install.disabled = true;
        install.firstChild.textContent = 'Starting…';
        try {
          const res = await API.installComponent(id);
          if (res?.open_url) window.open(res.open_url, '_blank', 'noopener');
          install.firstChild.textContent = res?.open_url ? 'Opened download page' : 'Installer started';
        } catch (err) {
          install.disabled = false;
          install.firstChild.textContent = 'Retry';
          toast(errorMessage(err), 'error', label);
        }
      });
      step.row.appendChild(install);
    };
    await pause(150);
    offer('webview2', 'Window engine (WebView2)', 'needed to draw the app window');
    offer('node', 'Node.js', 'needed for npm / npx commands and most MCP servers');
    offer('python', 'Python', 'needed for Python scripts the agent runs');

    // Battle mode (the default) has no model list by design, so ask for the
    // Direct-chat list to prove the arena.ai connection really works.
    const account = addStep('Arena account');
    for (let i = 0; i < 40 && engineStarting(state.status); i += 1) {
      await pause(500);
      await loadStatus({ quiet: true }).catch(() => null);
    }
    if (!state.authenticated) {
      account.done('Not signed in yet. Use Sign in at the bottom left.', 'warn');
    } else {
      let count = 0;
      try { count = modelArray(await API.getModels('text', 'direct')).length; } catch { count = 0; }
      const who = state.email ? `Signed in as ${state.email}` : 'Signed in';
      account.done(count ? `${who} · ${count} models available` : `${who} · model list did not load, it retries when you pick a model`, count ? 'ok' : 'warn');
    }

    finish.disabled = false;
    finish.firstChild.textContent = 'Get started';
    playChime(doneAudio || (primeDoneAudio(), doneAudio) || { state: 'closed' });
    finish.focus();
    await new Promise((resolve) => finish.addEventListener('click', resolve, { once: true }));
    try { await API.saveSettings({ setup_done: true }); } catch { /* shown again next launch */ }
    overlay.classList.add('is-leaving');
    setTimeout(() => overlay.remove(), 180);
  }

  function engineStarting(status) {
    const engine = status?.engine;
    return Boolean(status && (status.loading || status.engine_loading
      || (engine && typeof engine === 'object' && (engine.ready === false || engine.challenge))));
  }

  // Cold start: the arena.ai session loads in the background for a few
  // seconds. Poll until it is ready, then load account, history and models,
  // so nobody has to press Refresh after launching the app.
  function watchEngineUntilReady() {
    let tries = 0;
    const tick = async () => {
      tries += 1;
      const status = await loadStatus({ quiet: true }).catch(() => null);
      if (status && !engineStarting(status)) {
        await Promise.allSettled([loadChats({ silent: true }), loadModels(state.modality, { quiet: true })]);
        updateAccountUI();
        renderChats();
        return;
      }
      if (tries < 120) window.setTimeout(tick, 1500);
    };
    window.setTimeout(tick, 1200);
  }

  async function boot() {
    loadUnreadDone();
    cacheElements();
    hydrateIcons();
    ensureBypassWarning();
    setupNativeBridge();
    restoreSidebarPreference();
    restoreWorkspacePanelPreference();
    setupLayoutResize();
    bindEvents();
    state.view = 'welcome';
    if (state.engineOpen) syncDock(false);
    if (state.demo) {
      document.documentElement.dataset.demo = 'true';
      document.body.classList.add('demo-mode');
      document.title = "Demo · Arena Desktop";
      if (els.demoChip) els.demoChip.hidden = false;
      if (els.demoBanner) els.demoBanner.hidden = false;
    }
    updateConnectionUI();
    updateAccountUI();
    renderChats();
    renderWorkspaceTreePanel();
    renderConnectorsPanel();
    renderModelStrip();
    renderModelsNavCount();
    updatePendingPermissionsBadge();
    updateComposerState();
    setView('welcome');
    resizePrompt();

    try {
      const status = await loadStatus({ initial: true });
      if (status) {
        await Promise.allSettled([
          loadChats(),
          loadModels(state.modality, { quiet: true }),
          refreshWorkspacePanel(),
          loadLayoutSettings()
        ]);
        await loadPermissions({ quiet: true });
        if (status.engine && normalizeEngine(status.engine).open) syncDock(false);
        updateComposerState();
        if (!state.demo && (engineStarting(status) || state.cloudChatsError)) watchEngineUntilReady();
        if (!state.demo) void runFirstRunSetup().catch(() => { document.querySelector('.setup-overlay')?.remove(); });
      } else {
        state.chatsLoading = false;
        state.chatsError = state.serverError || "Local server is unavailable.";
        state.modelsLoading = false;
        state.modelsError = state.serverError || "Model list unavailable.";
        state.chats = [];
        state.models = [];
        renderChats();
        renderModelStrip();
        renderModelsNavCount();
        updateComposerState();
        updateConnectionUI();
      }
    } catch (error) {
      state.serverError = errorMessage(error);
      state.phase = 'offline';
      state.chatsLoading = false;
      state.modelsLoading = false;
      state.chatsError = state.serverError;
      state.modelsError = state.serverError;
      updateAllUI();
    } finally {
      state.booted = true;
      state.phase = state.serverError ? 'offline' : 'ready';
      ensureBypassWarning();
      updateAllUI();
      if (!state.demo) {
        document.documentElement.classList.remove('demo-mode');
      }
      // Nothing fake is inserted when status/API loading failed.
      if (state.serverError) {
        announce("Local server unavailable. The interface shows the actual status and offers demo separately.");
      }
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => { void boot(); }, { once: true });
  } else {
    void boot();
  }
  // ═══ 15-project.js ═══
  /* ---------------------------------------------------------------------- */
  /* Code-mode project files: a small tree of the chat's own project folder, */
  /* shown above the composer and refreshed while the sandbox writes files.  */
  /* Clicking a file opens the same preview/editor as the workspace panel.   */
  /* ---------------------------------------------------------------------- */

  const chatProject = {
    chatId: null,
    rel: '',
    name: '',
    open: true,
    ready: false,
    loading: false,
    error: '',
    expanded: new Set(),
    dirs: new Map()
  };
  let chatProjectTimer = null;

  function chatProjectPanelEl() {
    return document.getElementById('chatProjectPanel');
  }

  function resetChatProject() {
    chatProject.chatId = null;
    chatProject.rel = '';
    chatProject.name = '';
    chatProject.ready = false;
    chatProject.loading = false;
    chatProject.error = '';
    chatProject.expanded = new Set();
    chatProject.dirs = new Map();
    const panel = chatProjectPanelEl();
    if (panel) panel.hidden = true;
    clear(panel || document.createElement('div'));
  }

  async function setupChatProject(chatId, modality) {
    resetChatProject();
    const canonical = ({ chat: 'text', webdev: 'code' })[modality] || modality;
    if (!chatId || canonical !== 'code') return;
    const panel = chatProjectPanelEl();
    if (!panel) return;
    chatProject.chatId = String(chatId);
    chatProject.loading = true;
    panel.hidden = false;
    renderChatProjectPanel();
    try {
      const info = await API.getChatProject(chatId);
      if (String(chatProject.chatId) !== String(chatId)) return;
      if (!info || info.demo || typeof info.rel === 'string') {
        chatProject.rel = String(info?.rel ?? '.');
        chatProject.name = String(info?.name || 'Project');
        chatProject.ready = true;
        await loadChatProjectDir(chatProject.rel);
      } else {
        chatProject.error = 'The project folder for this chat is not available.';
      }
    } catch (error) {
      if (String(chatProject.chatId) !== String(chatId)) return;
      chatProject.error = errorMessage(error);
    }
    chatProject.loading = false;
    renderChatProjectPanel();
  }

  async function loadChatProjectDir(path) {
    try {
      const data = await API.getWorkspaceTree(path);
      chatProject.dirs.set(path, Array.isArray(data?.entries) ? data.entries : []);
      chatProject.error = '';
    } catch (error) {
      chatProject.error = errorMessage(error);
    }
    renderChatProjectPanel();
  }

  function scheduleChatProjectRefresh() {
    if (!chatProject.ready || !chatProject.chatId) return;
    if (chatProjectTimer) return;
    chatProjectTimer = setTimeout(() => {
      chatProjectTimer = null;
      void refreshChatProject();
    }, 600);
  }

  async function refreshChatProject() {
    if (!chatProject.ready || !chatProject.chatId) return;
    const paths = [chatProject.rel, ...Array.from(chatProject.expanded)];
    await Promise.all(paths.map((path) => loadChatProjectDir(path).catch(() => {})));
    renderChatProjectPanel();
  }

  function chatProjectRow(entry, depth) {
    const row = el('div', {
      class: `chat-project-row${entry.is_dir ? ' is-dir' : ''}`,
      role: 'treeitem',
      'data-path': entry.path,
      style: `padding-left:${depth * 14}px`,
      title: entry.path
    });
    row.appendChild(el('span', { class: 'chat-project-caret', 'aria-hidden': 'true' },
      entry.is_dir ? iconEl('chevron-right') : iconEl('file')));
    row.appendChild(el('span', { class: 'chat-project-name', text: entry.name }));
    if (entry.is_dir) {
      row.addEventListener('click', () => {
        if (chatProject.expanded.has(entry.path)) {
          chatProject.expanded.delete(entry.path);
          renderChatProjectPanel();
        } else {
          chatProject.expanded.add(entry.path);
          renderChatProjectPanel();
          if (!chatProject.dirs.has(entry.path)) void loadChatProjectDir(entry.path);
        }
      });
    } else {
      row.addEventListener('click', () => {
        void openWorkspaceFilePreview(entry);
      });
    }
    return row;
  }

  function chatProjectChildren(path, depth, out) {
    const entries = chatProject.dirs.get(path) || [];
    for (const entry of entries) {
      out.push(chatProjectRow(entry, depth));
      if (entry.is_dir && chatProject.expanded.has(entry.path)) {
        chatProjectChildren(entry.path, depth + 1, out);
      }
    }
  }

  function renderChatProjectPanel() {
    const panel = chatProjectPanelEl();
    if (!panel) return;
    if (!chatProject.chatId) {
      panel.hidden = true;
      return;
    }
    panel.hidden = false;
    clear(panel);
    const head = el('button', {
      class: 'chat-project-head',
      type: 'button',
      'aria-expanded': String(chatProject.open)
    });
    head.appendChild(iconEl('folder', 'chat-project-icon'));
    head.appendChild(el('span', { class: 'chat-project-title', text: chatProject.name || 'Project files' }));
    if (chatProject.loading) head.appendChild(el('span', { class: 'mini-spinner' }));
    head.addEventListener('click', () => {
      chatProject.open = !chatProject.open;
      renderChatProjectPanel();
    });
    const refresh = el('button', {
      class: 'button button-small button-quiet chat-project-refresh',
      type: 'button',
      title: 'Refresh the file tree'
    }, iconEl('refresh'), el('span', { text: 'Refresh' }));
    refresh.addEventListener('click', (event) => {
      event.stopPropagation();
      void refreshChatProject();
    });
    head.appendChild(refresh);
    panel.appendChild(head);
    if (!chatProject.open) return;
    const body = el('div', { class: 'chat-project-body', role: 'tree' });
    if (chatProject.error && !chatProject.dirs.size) {
      body.appendChild(el('div', { class: 'workspace-tree-error', text: chatProject.error }));
    } else {
      const rows = [];
      chatProjectChildren(chatProject.rel, 1, rows);
      if (!rows.length) {
        body.appendChild(el('div', { class: 'workspace-tree-empty',
          text: chatProject.loading ? 'Loading files…' : 'No files yet - they appear here as the AI writes them.' }));
      }
      rows.forEach((row) => body.appendChild(row));
      if (chatProject.error) body.appendChild(el('div', { class: 'workspace-tree-error', text: chatProject.error }));
    }
    panel.appendChild(body);
  }

})();
