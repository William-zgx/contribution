// 奶蛙宇宙看板 · 交互层（window.NWK）
// 依赖：assets/boot.js 读取 data/board.json → engine.js（RULES）→ assets/derive.js（window.NW）→ assets/icons.js（window.frogIcon）→ tokens.css
// 只读 NW；所有数字都来自 NW。可放在 <head> 里同步加载：主题在此刻就写到 <html>，不闪烁。
(function () {
  'use strict';
  const NW = window.NW;
  if (!NW || !window.frogIcon) { console.warn('[NWK] 需要先引入 data.js、derive.js、icons.js'); }
  const root = document.documentElement;
  const qs = new URLSearchParams(location.search);
  const inFrame = false; // 正式站点不嵌在原型外壳里，跳转一律走普通链接
  const mqReduce = matchMedia('(prefers-reduced-motion: reduce)');
  const mqDark = matchMedia('(prefers-color-scheme: dark)');
  const mqHover = matchMedia('(hover: hover) and (pointer: fine)');
  const reduced = () => mqReduce.matches;
  const canHover = () => mqHover.matches;
  const isMac = /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent);
  const DAY = 86400000;
  const WEEK = 7 * DAY;
  const TZ = 8 * 3600000;

  // ───────────────────────── 工具 ─────────────────────────
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
  const ready = (fn) => (document.readyState === 'loading' ? document.addEventListener('DOMContentLoaded', fn, { once: true }) : fn());
  const rng = (seed = 7) => () => ((seed = (seed * 16807) % 2147483647) - 1) / 2147483646;
  const hue = (s) => { let h = 7; for (const c of String(s)) h = (h * 31 + c.charCodeAt(0)) >>> 0; return h % 360; };
  const cssVar = (name) => getComputedStyle(root).getPropertyValue(name).trim();
  const typing = (t) => t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.isContentEditable);
  const visible = (el) => !!(el && el.isConnected && el.getClientRects().length);
  function springEasing() {
    const v = cssVar('--ease-spring');
    try { document.createElement('div').animate([{ opacity: 1 }], { easing: v }); return v; } catch (e) { return 'cubic-bezier(.3,1.25,.5,1)'; }
  }

  // ───────────────────────── 格式（全站口径） ─────────────────────────
  // 魔力：任何地方都保留一位小数（87.0 而不是 87），列内对齐、正文口径一致
  const mag = (x) => (Math.round((x || 0) * 10) / 10).toLocaleString('zh-CN', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
  const fmt = {
    mag,
    f1: mag,
    int: (x) => Math.round(x || 0).toLocaleString('zh-CN'),
    pct: (x, d = 0) => `${((x || 0) * 100).toFixed(d)}%`,
    // 带符号；负号用真正的减号 −
    signed: (d, f = fmt.int) => (d > 0 ? '+' : d < 0 ? '−' : '±') + f(Math.abs(d)),
    md: (t) => { const d = new Date(t + TZ); return `${d.getUTCMonth() + 1}月${d.getUTCDate()}日`; },
    hm: (t) => new Date(t + TZ).toISOString().slice(11, 16),
    week: (t) => new Date(t + TZ).toISOString().slice(5, 10),
    date: (t) => new Date(t + TZ).toISOString().slice(0, 10),
    datetime: (t) => new Date(t + TZ).toISOString().slice(0, 16).replace('T', ' '),
    ago: (days) => (days <= 0 ? '今天' : days === 1 ? '昨天' : `${days} 天前`),
  };

  // ───────────────────────── 图标（Lucide 风格，手写，24 网格 1.75 描边） ─────────────────────────
  const P = {
    search: '<circle cx="11" cy="11" r="7"/><path d="m20 20-3.6-3.6"/>',
    'arrow-up': '<path d="M12 19V5"/><path d="m5.5 11.5 6.5-6.5 6.5 6.5"/>',
    'arrow-down': '<path d="M12 5v14"/><path d="m18.5 12.5-6.5 6.5-6.5-6.5"/>',
    'arrow-right': '<path d="M5 12h14"/><path d="m12.5 5.5 6.5 6.5-6.5 6.5"/>',
    'arrow-left': '<path d="M19 12H5"/><path d="m11.5 18.5-6.5-6.5 6.5-6.5"/>',
    'arrow-up-right': '<path d="M7 17 17 7"/><path d="M8 7h9v9"/>',
    'chevron-left': '<path d="m15 18-6-6 6-6"/>',
    'chevron-right': '<path d="m9 18 6-6-6-6"/>',
    'chevron-down': '<path d="m6 9 6 6 6-6"/>',
    'chevron-up': '<path d="m18 15-6-6-6 6"/>',
    play: '<path d="M7.5 5.2v13.6a1 1 0 0 0 1.53.85l10.6-6.8a1 1 0 0 0 0-1.7l-10.6-6.8A1 1 0 0 0 7.5 5.2Z"/>',
    pause: '<rect x="6.5" y="5" width="3.8" height="14" rx="1"/><rect x="13.7" y="5" width="3.8" height="14" rx="1"/>',
    x: '<path d="M18 6 6 18"/><path d="m6 6 12 12"/>',
    check: '<path d="M20 6.5 9.5 17 4 11.5"/>',
    plus: '<path d="M12 5v14M5 12h14"/>',
    minus: '<path d="M5 12h14"/>',
    filter: '<path d="M3.5 5h17l-6.5 7.6V19l-4 1.8v-8.2Z"/>',
    sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2.5v2M12 19.5v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2.5 12h2M19.5 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>',
    moon: '<path d="M20.5 14.2A8.5 8.5 0 1 1 9.8 3.5a6.6 6.6 0 0 0 10.7 10.7Z"/>',
    info: '<circle cx="12" cy="12" r="9"/><path d="M12 16.5v-5"/><path d="M12 8h.01"/>',
    clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3.2 2"/>',
    hourglass: '<path d="M6 2.5h12M6 21.5h12"/><path d="M7.5 2.5v3.3a4.5 4.5 0 0 0 1.6 3.4L12 12l2.9-2.8a4.5 4.5 0 0 0 1.6-3.4V2.5"/><path d="M7.5 21.5v-3.3a4.5 4.5 0 0 1 1.6-3.4L12 12l2.9 2.8a4.5 4.5 0 0 1 1.6 3.4v3.3"/>',
    calendar: '<rect x="3.5" y="5" width="17" height="15.5" rx="2.5"/><path d="M8 3v4M16 3v4M3.5 10h17"/>',
    sparkles: '<path d="M10 3.5 11.7 8.3a2 2 0 0 0 1.2 1.2L17.5 11l-4.6 1.6a2 2 0 0 0-1.2 1.2L10 18.5l-1.7-4.7a2 2 0 0 0-1.2-1.2L2.5 11l4.6-1.5a2 2 0 0 0 1.2-1.2Z"/><path d="M18.5 3v4M16.5 5h4"/><path d="M19 16.5v3M17.5 18h3"/>',
    sparkle: '<path d="M12 3 13.9 9.2a1.5 1.5 0 0 0 .9.9L21 12l-6.2 1.9a1.5 1.5 0 0 0-.9.9L12 21l-1.9-6.2a1.5 1.5 0 0 0-.9-.9L3 12l6.2-1.9a1.5 1.5 0 0 0 .9-.9Z"/>',
    users: '<path d="M16 20.5v-1.8a3.7 3.7 0 0 0-3.7-3.7H6.2a3.7 3.7 0 0 0-3.7 3.7v1.8"/><circle cx="9.25" cy="7.8" r="3.7"/><path d="M21.5 20.5v-1.8a3.7 3.7 0 0 0-2.7-3.55"/><path d="M15.8 4.3a3.7 3.7 0 0 1 0 7"/>',
    user: '<circle cx="12" cy="8" r="4"/><path d="M4.5 21v-1A5.5 5.5 0 0 1 10 14.5h4a5.5 5.5 0 0 1 5.5 5.5v1"/>',
    'user-plus': '<path d="M15 20.5v-1.8a3.7 3.7 0 0 0-3.7-3.7H6.2a3.7 3.7 0 0 0-3.7 3.7v1.8"/><circle cx="8.75" cy="7.8" r="3.7"/><path d="M19 8v6M22 11h-6"/>',
    'git-merge': '<circle cx="6" cy="5.5" r="2.5"/><circle cx="18" cy="18.5" r="2.5"/><path d="M6 8v13"/><path d="M6 8a10.5 10.5 0 0 0 9.5 10.5"/>',
    'git-pull-request': '<circle cx="6" cy="5.5" r="2.5"/><circle cx="18" cy="18.5" r="2.5"/><path d="M6 8v13"/><path d="M13 5.5h2.5A2.5 2.5 0 0 1 18 8v8"/><path d="m15.5 3 -2.5 2.5 2.5 2.5"/>',
    message: '<path d="M20.5 11.6a8.4 8.4 0 0 1-12.2 7.5L3.5 20.5l1.4-4.6A8.4 8.4 0 1 1 20.5 11.6Z"/>',
    flame: '<path d="M12 21.5c3.9 0 6.8-2.7 6.8-6.5 0-3.3-2-5.6-3.6-7.3-.5 1.9-1.6 3.1-2.9 3.6.4-3.4-1-6.6-3.8-8.8.1 3.6-1.6 5.7-3.2 7.7-1.2 1.5-2.1 3.1-2.1 4.8 0 3.8 2.9 6.5 6.8 6.5Z"/><path d="M12 21.5c-1.7 0-2.9-1.2-2.9-2.9 0-1.7 1.6-2.9 2.3-4.5 1.6 1.2 3.5 2.6 3.5 4.5 0 1.7-1.2 2.9-2.9 2.9Z"/>',
    trophy: '<path d="M7 4h10v5a5 5 0 0 1-10 0Z"/><path d="M7 6H4.5v1A3 3 0 0 0 7.5 10"/><path d="M17 6h2.5v1a3 3 0 0 1-3 3"/><path d="M12 14v3.5"/><path d="M8 20.5h8"/><path d="M9.5 20.5c0-1.7 1.1-3 2.5-3s2.5 1.3 2.5 3"/>',
    keyboard: '<rect x="2.5" y="5.5" width="19" height="13" rx="2.5"/><path d="M6.5 9.5h.01M10 9.5h.01M14 9.5h.01M17.5 9.5h.01M6.5 13h.01M17.5 13h.01M8.5 15.5h7"/>',
    'external-link': '<path d="M14 4h6v6"/><path d="M20 4 11 13"/><path d="M18 14v4.5a1.5 1.5 0 0 1-1.5 1.5h-11A1.5 1.5 0 0 1 4 18.5v-11A1.5 1.5 0 0 1 5.5 6H10"/>',
    egg: '<path d="M12 21.5c-3.9 0-6.5-2.8-6.5-6.9C5.5 9.2 8.4 2.5 12 2.5s6.5 6.7 6.5 12.1c0 4.1-2.6 6.9-6.5 6.9Z"/>',
    layers: '<path d="m12 3 9 5-9 5-9-5Z"/><path d="m3 12.5 9 5 9-5"/><path d="m3 17 9 5 9-5"/>',
    list: '<path d="M8.5 6h12M8.5 12h12M8.5 18h12"/><path d="M3.5 6h.01M3.5 12h.01M3.5 18h.01"/>',
    command: '<path d="M9 6.5A2.5 2.5 0 1 0 6.5 9H9Zm0 0v11m0-11h6m-6 11A2.5 2.5 0 1 1 6.5 15H9Zm0 0h6m0 0v-11m0 11A2.5 2.5 0 1 0 17.5 15H15Zm0-11A2.5 2.5 0 1 1 17.5 9H15Z"/>',
    enter: '<path d="M20 4.5v7a4 4 0 0 1-4 4H4.5"/><path d="m9 10.5-5 5 5 5"/>',
    'rotate-ccw': '<path d="M3.5 12a8.5 8.5 0 1 0 2.6-6.1L3.5 8.5"/><path d="M3.5 3.5v5h5"/>',
    'alert-triangle': '<path d="M10.3 4.2 2.9 17.2A2 2 0 0 0 4.6 20h14.8a2 2 0 0 0 1.7-2.8L13.7 4.2a2 2 0 0 0-3.4 0Z"/><path d="M12 9.5v4"/><path d="M12 17h.01"/>',
    'trending-up': '<path d="m3 17 6-6 4 4 8-8"/><path d="M15 7h6v6"/>',
    'trending-down': '<path d="m3 7 6 6 4-4 8 8"/><path d="M15 17h6v-6"/>',
    zap: '<path d="M13 2.5 4 13.5h7.5l-1 8 9-11H12Z"/>',
    target: '<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5"/><circle cx="12" cy="12" r="1"/>',
    eye: '<path d="M2.5 12S6 5 12 5s9.5 7 9.5 7-3.5 7-9.5 7-9.5-7-9.5-7Z"/><circle cx="12" cy="12" r="3"/>',
    hash: '<path d="M5 9h15M4 15h15M10 3.5 8 20.5M16 3.5l-2 17"/>',
    'moon-z': '<path d="M19 14.6A7.5 7.5 0 1 1 9.4 5a5.8 5.8 0 0 0 9.6 9.6Z"/><path d="M15 3.5h4l-4 4h4"/>',
    grid: '<rect x="3.5" y="3.5" width="7" height="7" rx="1.5"/><rect x="13.5" y="3.5" width="7" height="7" rx="1.5"/><rect x="3.5" y="13.5" width="7" height="7" rx="1.5"/><rect x="13.5" y="13.5" width="7" height="7" rx="1.5"/>',
    'message-square': '<path d="M20.5 15a2 2 0 0 1-2 2H8l-4.5 4V5.5a2 2 0 0 1 2-2h13a2 2 0 0 1 2 2Z"/>',
    pin: '<path d="M12 21.5s-6.5-6.2-6.5-11.3a6.5 6.5 0 0 1 13 0c0 5.1-6.5 11.3-6.5 11.3Z"/><circle cx="12" cy="10" r="2.4"/>',
    'book-open': '<path d="M12 6.5C10.3 5 7.9 4.5 3.5 4.5v14c4.4 0 6.8.5 8.5 2 1.7-1.5 4.1-2 8.5-2v-14c-4.4 0-6.8.5-8.5 2Z"/><path d="M12 6.5v14"/>',
    activity: '<path d="M21.5 12h-3.8l-2.8 8.5L9.1 3.5 6.3 12H2.5"/>',
    repeat: '<path d="m17 2.5 4 4-4 4"/><path d="M3 11.5v-1a4 4 0 0 1 4-4h14"/><path d="m7 21.5-4-4 4-4"/><path d="M21 12.5v1a4 4 0 0 1-4 4H3"/>',
    'log-out': '<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><path d="m16 17 5-5-5-5"/><path d="M21 12H9"/>',
    link: '<path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/>',
  };
  const icon = (name, size = 16, cls = '') => `<svg class="ic ${cls}" width="${size}" height="${size}" viewBox="0 0 24 24" aria-hidden="true">${P[name] || ''}</svg>`;
  const TRI_UP = '<svg viewBox="0 0 8 8" aria-hidden="true"><path d="M4 1 7.5 6.5h-7Z"/></svg>';
  const TRI_DN = '<svg viewBox="0 0 8 8" aria-hidden="true"><path d="M4 7 .5 1.5h7Z"/></svg>';

  // ───────────────────────── 形态 ─────────────────────────
  const frog = (kind, size = 20, cls = '') => `<span class="frog ${cls}" style="width:${size}px;height:${size}px">${window.frogIcon ? window.frogIcon(kind, size) : ''}</span>`;
  // 第 i 周末的形态。未孵化时按「当时」是否仍在 30 天考核期内区分蛙卵 / 未孵化（不用当前 status 反推历史）
  function formOf(p, i = NW.last) {
    const l = p.levels[i];
    if (l !== null && l !== undefined) return { level: l, kind: NW.LV[l].icon, name: NW.LV[l].name, hatched: true };
    const t = i === NW.last ? NW.now : NW.W[i] + WEEK;
    const egg = i === NW.last ? p.newbie.status === 'pending' : t < p.newbie.end;
    return egg ? { level: null, kind: 'egg', name: '蛙卵', hatched: false, egg: true } : { level: null, kind: 'unhatched', name: '未孵化', hatched: false, unhatched: true };
  }
  const frogOf = (p, size = 20, { i = NW.last, cls = '' } = {}) => frog(formOf(p, i).kind, size, `${p.dormant && i === NW.last ? 'sleep ' : ''}${cls}`);
  // 形态徽章：level 可传 0–4 / null / 'egg' / 'unhatched' / 人对象
  function levelBadge(level, { size = 18, pill = false, i = NW.last, suffix = '' } = {}) {
    let f;
    if (level && typeof level === 'object' && level.login) f = formOf(level, i);
    else if (level === 'egg' || level === null || level === undefined) f = { kind: 'egg', name: '蛙卵', egg: true };
    else if (level === 'unhatched') f = { kind: 'unhatched', name: '未孵化', unhatched: true };
    else f = { kind: NW.LV[level].icon, name: NW.LV[level].name };
    const cls = f.egg ? 'is-egg' : f.unhatched ? 'is-unhatched' : '';
    return `<span class="lvl ${pill ? 'lvl-pill' : ''} ${cls}">${frog(f.kind, size)}<span>${f.name}${suffix}</span></span>`;
  }
  // 到下一级：{ name, kind, gap, eta, pace, hatch }
  function nextInfo(p) {
    if (p.level === null) {
      const gap = Math.max(0, NW.RULES.hatchBonus - p.bonus);
      return { name: '孵化', kind: 'tadpole', gap, pace: p.pace, eta: p.pace > 0 ? Math.ceil(gap / p.pace) : null, hatch: true };
    }
    if (!p.next) return null;
    const L = NW.LV[p.next.level];
    return { name: L.name, kind: L.icon, gap: p.gap, pace: p.pace, eta: p.eta };
  }
  const etaText = (eta) => (eta === null || eta === undefined ? '近 4 周没有新魔力' : eta <= 1 ? '约 1 周' : `约 ${eta} 周`);

  // 孵化提示：只差一项时给一句能照做的话（活跃周 = 有合入或协作的不同自然周）
  function hatchHint(p) {
    if (p.level !== null) return null;
    const nb = p.newbie;
    const R = NW.RULES.newbie;
    const needM = Math.max(0, R.merged - nb.merged);
    const needW = Math.max(0, R.activeWeeks - nb.activeWeeks);
    const toMagic = Math.max(0, NW.RULES.hatchBonus - p.bonus);
    if (nb.status !== 'pending') {
      return { status: 'failed', missing: [], oneLeft: false, text: `考核期已过；魔力再攒 ${mag(toMagic)}（到 50）就能直接孵化` };
    }
    const activeNow = p.tw > 0; // 本周已有合入或协作 = 本周已算一个活跃周
    const nextWeek = NW.W[NW.last] + WEEK;
    const missing = [];
    if (needM) missing.push(`合入 ${needM} 个 PR`);
    if (needW) missing.push(`${needW} 个活跃周`);
    let text;
    if (!missing.length) text = '条件已满足，等下一次数据更新就会孵化';
    else if (needW === 0) text = `${nb.daysLeft} 天内再合入 ${needM} 个 PR 就能孵化`;
    else if (needW === 1 && !activeNow && needM <= 1) text = needM ? '这周合入 1 个 PR，就能同时补齐两项' : '这周有一次合入或协作，就能孵化';
    else if (needW === 1 && activeNow) {
      text = nextWeek <= nb.end
        ? `${fmt.md(nextWeek)}起的那一周再有一次合入或协作${needM ? `，并再合入 ${needM} 个 PR` : ''}，就能孵化`
        : `考核期内已来不及再补一个活跃周；魔力攒到 50 也能孵化（还差 ${mag(toMagic)}）`;
    } else text = `还差${missing.join('、')}，剩 ${nb.daysLeft} 天`;
    return { status: 'pending', missing, oneLeft: missing.length === 1, needM, needW, toMagic, daysLeft: nb.daysLeft, text };
  }

  // ───────────────────────── 头像（失败回退首字母；加载前就显示首字母，不出现空圈） ─────────────────────────
  const initial = (login) => esc((String(login).replace(/[^a-z0-9]/gi, '')[0] || String(login)[0] || '?').toUpperCase());
  function avatar(login, size = 28, { progress = null, dim = false, ring = null, cls = '', stroke } = {}) {
    const px = size <= 24 ? 48 : size <= 48 ? 96 : 160;
    const src = NW ? NW.avatar(login, px) : '';
    const av = `<span class="av ${dim ? 'dim' : ''} ${cls}" style="--size:${size}px;--av-h:${hue(login)}"><span class="av-i" aria-hidden="true">${initial(login)}</span>`
      + `<img alt="" src="${esc(src)}" loading="lazy" decoding="async" onload="this.classList.add('ok')" onerror="this.remove()"></span>`;
    if (progress === null || progress === undefined) return av;
    const sw = stroke || (size <= 32 ? 2.5 : 3);
    const gap = size <= 32 ? 2 : 3;
    const R = size + (gap + sw) * 2;
    const r = (R - sw) / 2;
    const c = 2 * Math.PI * r;
    const pr = clamp(progress, 0, 1);
    return `<span class="avr ${ring === 'egg' ? 'is-egg' : ''} ${dim ? 'dim' : ''}" style="--ring:${R}px" role="img" aria-label="到下一级进度 ${Math.round(pr * 100)}%">`
      + `<svg width="${R}" height="${R}" viewBox="0 0 ${R} ${R}" aria-hidden="true"><circle class="tr" cx="${R / 2}" cy="${R / 2}" r="${r}" stroke-width="${sw}"/>`
      + `<circle class="pg" cx="${R / 2}" cy="${R / 2}" r="${r}" stroke-width="${sw}" stroke-dasharray="${c.toFixed(2)}" stroke-dashoffset="${(c * (1 - pr)).toFixed(2)}"/></svg>${av}</span>`;
  }
  // 人物触发器：头像 + 名字（+ 副行），悬停出人物卡，点击进档案
  function who(p, { size = 28, sub = '', tags = '', progress = false } = {}) {
    if (typeof p === 'string') p = NW.byLogin.get(p) || { login: p };
    const av = avatar(p.login, size, { dim: !!p.dormant, progress: progress ? p.progress : null, ring: p.level === null ? 'egg' : null });
    const meTag = me.is(p.login) ? '<span class="tag tag-live me-tag">我</span>' : '';
    return `<span class="who" data-person="${esc(p.login)}" tabindex="0" role="button" aria-label="${esc(p.login)}，查看档案">${av}`
      + `<span class="who-txt"><span class="l1"><span class="nm">${esc(p.login)}</span>${meTag}${tags}</span>${sub ? `<span class="sub">${sub}</span>` : ''}</span></span>`;
  }
  // 正文里的人名：与正文同字号、同基线、同墨色
  const pname = (login, { avatar: withAv = true } = {}) => `<span class="pname" data-person="${esc(login)}" tabindex="0" role="button">${withAv ? avatar(login, 16) : ''}${esc(login)}</span>`;
  // 多个人名：「、」与前一个名字绑在一起不折行（避头尾）；最后一个用「和」
  function people(logins, { max = 3, and = ' 和 ', more = (n) => ` 等 ${n} 人` } = {}) {
    const list = logins.map((x) => (typeof x === 'string' ? x : x.login));
    const shown = list.slice(0, max);
    const rest = list.length - shown.length;
    if (!shown.length) return '';
    if (rest > 0) return shown.map((l, k) => `<span class="nowrap">${pname(l)}${k < shown.length - 1 ? '、' : ''}</span>`).join('') + more(list.length);
    if (shown.length === 1) return pname(shown[0]);
    return shown.slice(0, -1).map((l, k, a) => `<span class="nowrap">${pname(l)}${k < a.length - 1 ? '、' : ''}</span>`).join('') + `${and}${pname(shown[shown.length - 1])}`;
  }

  // ───────────────────────── 名次 / 数值变化 ─────────────────────────
  // move：正数 = 上升；0 = 名次不变；null = 新面孔（上周还没开始贡献）；undefined = 上期不在这张榜上（如上周 0 魔力）
  function delta(move, { pill = false, newLabel = '新', enterLabel = '上榜' } = {}) {
    const pc = pill ? ' pill' : '';
    if (move === null) return `<span class="delta new" title="新面孔：第一次出现在榜上" aria-label="新面孔">${newLabel}</span>`;
    if (move === undefined || Number.isNaN(move)) return `<span class="delta enter" title="上期不在这张榜上" aria-label="上期未上榜">${enterLabel}</span>`;
    if (move > 0) return `<span class="delta up${pc}" aria-label="上升 ${move} 名">${TRI_UP}${move}</span>`;
    if (move < 0) return `<span class="delta down${pc}" aria-label="下降 ${-move} 名">${TRI_DN}${-move}</span>`;
    return `<span class="delta flat${pc}" title="名次不变" aria-label="名次不变">—</span>`;
  }
  // 数值较前一期：cur、prev 是数值；默认 pill 样式
  function change(cur, prev, { f = fmt.int, unit = '', pill = true, flatLabel = '持平' } = {}) {
    const d = Math.round((cur - prev) * 10) / 10;
    const pc = pill ? ' pill' : '';
    if (Math.abs(d) < 0.05 || f(Math.abs(d)) === f(0)) return `<span class="delta flat${pc}" aria-label="持平">${flatLabel}</span>`;
    const up = d > 0;
    return `<span class="delta ${up ? 'up' : 'down'}${pc}" aria-label="${up ? '增加' : '减少'} ${f(Math.abs(d))}${unit}">${up ? TRI_UP : TRI_DN}${f(Math.abs(d))}${unit}</span>`;
  }

  // ───────────────────────── 图表小件（返回字符串） ─────────────────────────
  // 迷你图：bar（默认，近 12 周柱）或 line；hi = 高亮下标（默认最后一个 = 本周）
  function sparkline(vals, { w = 96, h = 24, gap = 2, type = 'bar', hi = vals.length - 1, max, label = '近 12 周每周魔力', color } = {}) {
    const n = vals.length;
    const m = max ?? Math.max(1e-9, ...vals);
    const st = color ? ` style="--leaf:${color}"` : '';
    let s = `<svg class="spark" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" role="img" aria-label="${esc(label)}：${vals.map((v) => mag(v)).join('、')}"${st}>`;
    if (type === 'line') {
      const x = (i) => (n === 1 ? w / 2 : (i / (n - 1)) * (w - 4) + 2);
      const y = (v) => h - 2 - (v / m) * (h - 4);
      const d = vals.map((v, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)} ${y(v).toFixed(1)}`).join('');
      s += `<path class="ar" d="${d}L${x(n - 1).toFixed(1)} ${h}L${x(0).toFixed(1)} ${h}Z"/><path class="ln" d="${d}"/>`;
      if (hi !== null && hi >= 0) s += `<circle class="dt" cx="${x(hi).toFixed(1)}" cy="${y(vals[hi]).toFixed(1)}" r="3"/>`;
      return s + '</svg>';
    }
    const bw = (w - gap * (n - 1)) / n;
    vals.forEach((v, i) => {
      const x = i * (bw + gap);
      if (v <= 0) { s += `<rect class="z" x="${x.toFixed(2)}" y="${h - 1.5}" width="${bw.toFixed(2)}" height="1.5" rx=".75"/>`; return; }
      const bh = Math.max(2, (v / m) * h);
      const r = Math.min(1.5, bw / 2, bh / 2);
      const y = h - bh;
      s += `<path class="b ${i === hi ? 'hi' : ''}" d="M${x.toFixed(2)} ${h}V${(y + r).toFixed(2)}Q${x.toFixed(2)} ${y.toFixed(2)} ${(x + r).toFixed(2)} ${y.toFixed(2)}H${(x + bw - r).toFixed(2)}Q${(x + bw).toFixed(2)} ${y.toFixed(2)} ${(x + bw).toFixed(2)} ${(y + r).toFixed(2)}V${h}Z"/>`;
    });
    return s + '</svg>';
  }
  // 进度环：progress 0–1；label 是放在环心的 HTML
  function ring(progress, { size = 40, stroke = 3.5, color = 'var(--leaf)', label = '', title = '' } = {}) {
    const r = (size - stroke) / 2;
    const c = 2 * Math.PI * r;
    const pr = clamp(progress || 0, 0, 1);
    return `<span class="ring" style="--size:${size}px;--c:${color}" role="img" aria-label="${esc(title || `${Math.round(pr * 100)}%`)}">`
      + `<svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}" aria-hidden="true"><circle class="tr" cx="${size / 2}" cy="${size / 2}" r="${r}" stroke-width="${stroke}"/>`
      + `<circle class="pg" cx="${size / 2}" cy="${size / 2}" r="${r}" stroke-width="${stroke}" stroke-dasharray="${c.toFixed(2)}" stroke-dashoffset="${(c * (1 - pr)).toFixed(2)}"/></svg>`
      + `${label ? `<span class="ring-label">${label}</span>` : ''}</span>`;
  }
  // 考核倒计时环：剩余天数 / 30；≤10 天变锈红
  const countdown = (daysLeft, { total = NW ? NW.RULES.newbie.days : 30, size = 48 } = {}) => ring(daysLeft / total, {
    size, stroke: size >= 48 ? 4 : 3, color: daysLeft <= 10 ? 'var(--rust)' : 'var(--leaf)',
    label: `<b>${daysLeft}</b><small>天</small>`, title: `考核还剩 ${daysLeft} 天`,
  });
  // 堆叠构成条：parts = [{label, value, color}]；scale = 整条宽度占比（多行对比时按最大值缩放）
  function stackedBar(parts, { h = 8, scale = 1, label = '', total, f = mag } = {}) {
    const pos = parts.filter((x) => x.value > 0.005);
    const sum = total ?? parts.reduce((s, x) => s + Math.max(0, x.value), 0);
    const aria = `${label ? `${label}：` : ''}${parts.map((x) => `${x.label} ${f(x.value)}`).join('，')}`;
    if (!pos.length) return `<div class="sbar is-empty" style="width:${(scale * 100).toFixed(2)}%" role="img" aria-label="${esc(aria)}"></div>`;
    return `<div class="sbar" style="--h:${h}px;width:${(clamp(scale, 0, 1) * 100).toFixed(2)}%" role="img" aria-label="${esc(aria)}">`
      + pos.map((x) => `<i style="--c:${x.color};flex-grow:${x.value}" data-tip-html="${esc(`<div class='t-row'><span class='t-key box' style='--k:${x.color}'></span><span class='t-v'>${f(x.value)}</span><span class='t-l'>${esc(x.label)}${sum > 0 ? ` · ${fmt.pct(x.value / sum)}` : ''}</span></div>${x.note ? `<div class='t-l'>${esc(x.note)}</div>` : ''}`)}"></i>`).join('')
      + '</div>';
  }
  // 魔力构成：PR 分 / 模型加成 / 协作。模型系数扣分（如 ×0.9）时，PR 段画净值并在提示里说明
  function compParts(p) {
    const neg = p.bonusModel < 0;
    return [
      { key: 'pr', label: 'PR 分', value: neg ? p.bonusPr + p.bonusModel : p.bonusPr, color: 'var(--series-pr)', note: neg ? `已扣模型系数 ${mag(-p.bonusModel)}` : '' },
      { key: 'model', label: '模型加成', value: p.bonusModel, color: 'var(--series-model)' },
      { key: 'collab', label: '协作', value: p.bonusCollab, color: 'var(--series-collab)' },
    ];
  }
  const comp = (p, { scale = 1, h = 8 } = {}) => stackedBar(compParts(p), { scale, h, label: '魔力构成', total: p.bonus });
  // ───────── 活力（RULES.vitality，由 derive.js 算好放在 p.vit）─────────
  const VIT_PARTS = [
    { key: 'recent', label: '近期产出', color: 'var(--series-pr)' },
    { key: 'steady', label: '持续度', color: 'var(--series-collab)' },
    { key: 'history', label: '历史信用', color: 'var(--violet)' },
    { key: 'action', label: '最近动作', color: 'var(--series-model)' },
  ];
  const VIT_STATUS = {
    laggard: { label: '掉队', cls: 'tag-warn', icon: 'trending-down', next: '观察' },
    watch: { label: '观察', cls: 'tag-watch', icon: 'eye', next: '正常' },
    ok: { label: '正常', cls: 'tag-leaf', icon: 'check', next: null },
  };
  const vitNum = (v) => (Math.round(v * 10) / 10).toFixed(1);
  // 回到上一档要做什么：拿到任意魔力本身也是一次动作，所以掉队的人常常一次合入或协作就能回到观察
  function vitNeed(vit) {
    if (!vit || vit.need === null) return '';
    const next = VIT_STATUS[vit.status].next;
    return vit.need <= 1 ? `本周有 1 次合入或协作就能回到「${next}」` : `本周再拿 ${mag(vit.need)} 魔力能回到「${next}」`;
  }
  function vitTip(p) {
    const v = p.vit;
    if (!v) return `首次贡献未满 ${NW.RULES.newbie.days} 天，不评活力`;
    const parts = VIT_PARTS.map((x) => `${x.label} ${vitNum(v.parts[x.key])}`).join(' + ');
    const need = vitNeed(v);
    return `活力 ${vitNum(v.v)}（${VIT_STATUS[v.status].label}）= ${parts}${need ? `。${need}` : ''}`;
  }
  // 活力条：整条 = 100 分，四段按得分着色，掉队线与观察线两条刻度
  function vitBar(vit, { h = 6 } = {}) {
    const V = NW.RULES.vitality;
    if (!vit) return '';
    const bar = stackedBar(VIT_PARTS.map((x) => ({ label: x.label, value: vit.parts[x.key], color: x.color })), { h, scale: clamp(vit.v / 100, 0, 1), label: '活力', total: vit.v, f: vitNum });
    return `<div class="vbar" style="--h:${h}px">${bar}<i class="vmark" style="left:${V.laggard}%" aria-hidden="true"></i><i class="vmark" style="left:${V.watch}%" aria-hidden="true"></i></div>`;
  }
  const vitTag = (p, { score = true } = {}) => {
    if (!p.vit) return '';
    const s = VIT_STATUS[p.vit.status];
    return `<span class="tag ${s.cls}" data-tip="${esc(vitTip(p))}">${icon(s.icon, 11)}${s.label}${score ? ` ${vitNum(p.vit.v)}` : ''}</span>`;
  };

  // 名次哑铃：上周 ○ —— ● 本周；#n 在左、#1 在右（向右 = 上升）
  function dotRange(prev, cur, { n = NW ? NW.people.length : 100, ends = true } = {}) {
    const x = (r) => ((n - r) / Math.max(1, n - 1)) * 100;
    if (prev === null || prev === undefined) {
      return `<div class="drange" role="img" aria-label="首次上榜 #${cur}"><i class="d1" style="left:${x(cur).toFixed(2)}%"></i>${ends ? `<span class="ends"><span>#${n}</span><span>#1</span></span>` : ''}</div>`;
    }
    const a = x(prev), b = x(cur);
    const down = cur > prev;
    return `<div class="drange ${down ? 'down' : ''}" role="img" aria-label="上周 #${prev}，现在 #${cur}">`
      + `<i class="seg-l" style="left:${Math.min(a, b).toFixed(2)}%;width:${Math.abs(b - a).toFixed(2)}%"></i>`
      + `<i class="d0" style="left:${a.toFixed(2)}%"></i><i class="d1" style="left:${b.toFixed(2)}%"></i>`
      + `${ends ? `<span class="ends"><span>#${n}</span><span>#1</span></span>` : ''}</div>`;
  }
  // 空状态（带奶蛙插画）
  function empty({ art = 'tadpole', title = '这里还很安静', body = '', action = '', sleep = true } = {}) {
    const pad = '<svg class="empty-pad pad" viewBox="0 0 80 18" aria-hidden="true"><ellipse class="s" cx="40" cy="11" rx="40" ry="7"/><ellipse class="l" cx="40" cy="9" rx="34" ry="7"/><path class="v" d="M40 9 L40 2.5 M40 9 L26 6 M40 9 L54 6 M40 9 L30 14 M40 9 L50 14"/></svg>';
    return `<div class="empty"><div class="empty-art">${frog(art, 64, sleep ? 'sleep' : '')}${pad}${sleep ? '<span class="zz" aria-hidden="true">z z</span>' : ''}</div>`
      + `<h4>${esc(title)}</h4>${body ? `<p>${body}</p>` : ''}${action}</div>`;
  }
  // 骨架行
  const skeletonRows = (n = 5, { avatar: withAv = true } = {}) => Array.from({ length: n }, (_, k) => `<div class="lrow" aria-hidden="true" style="--cols:28px ${withAv ? '28px ' : ''}minmax(0,1fr) 80px">`
    + `<span class="skel skel-line" style="width:18px"></span>${withAv ? '<span class="skel skel-circle" style="width:28px;height:28px"></span>' : ''}`
    + `<span><span class="skel skel-line" style="width:${[46, 62, 38, 54, 44][k % 5]}%"></span><span class="skel skel-line" style="width:${[28, 22, 34, 26, 30][k % 5]}%;height:8px"></span></span>`
    + '<span class="skel skel-line" style="width:56px;justify-self:end"></span></div>').join('');

  // ───────────────────────── 周 ─────────────────────────
  const week = {
    get last() { return NW.last; },
    isCurrent: (i) => i === NW.last,
    short: (i) => fmt.week(NW.W[i]), // 11-02
    range(i) { // 11月2日 – 8日；跨月 10月26日 – 11月1日
      const a = new Date(NW.W[i] + TZ), b = new Date(NW.W[i] + 6 * DAY + TZ);
      return a.getUTCMonth() === b.getUTCMonth() ? `${a.getUTCMonth() + 1}月${a.getUTCDate()}日 – ${b.getUTCDate()}日` : `${fmt.md(NW.W[i])} – ${fmt.md(NW.W[i] + 6 * DAY)}`;
    },
    // 被选中的这一周怎么称呼：本周 / 上周 / 10-19 这一周
    name: (i) => (i === NW.last ? '本周' : i === NW.last - 1 ? '上周' : `${fmt.week(NW.W[i])} 这一周`),
    // 对比的那一周怎么称呼：选本周时是「上周」，其余一律「前一周」
    prevName: (i) => (i === NW.last ? '上周' : '前一周'),
    day: () => Math.floor((NW.now - NW.W[NW.last]) / DAY) + 1, // 本周第几天（1–7）
    asOf: () => `截至 ${fmt.md(NW.now)} ${fmt.hm(NW.now)}`,
    status(i) {
      return i === NW.last
        ? `<span class="status live"><i class="live-dot"></i>进行中 · 第 ${week.day()} 天</span>`
        : '<span class="status done">已结束</span>';
    },
    note: (i) => (i === NW.last ? '本周还没结束，数字会继续增长；「较上周」对比的是上周全周。' : ''),
    // ?week=MM-DD（C 的可分享周）：读 / 写（replaceState，不进历史）
    fromURL() {
      const v = new URLSearchParams(location.search).get('week');
      const k = v ? NW.W.findIndex((t) => fmt.week(t) === v) : -1;
      return k >= 0 ? k : NW.last;
    },
    toURL(i) {
      const u = new URL(location.href);
      if (i === NW.last) u.searchParams.delete('week'); else u.searchParams.set('week', fmt.week(NW.W[i]));
      history.replaceState(history.state, '', u);
    },
  };
  // weekLabel(i, form)：'full'（默认）= 本周 · 11月2日 – 8日；'name' / 'range' / 'short' / 'prev'
  function weekLabel(i, form = 'full') {
    if (form === 'name') return week.name(i);
    if (form === 'range') return week.range(i);
    if (form === 'short') return week.short(i);
    if (form === 'prev') return week.prevName(i);
    return i >= NW.last - 1 ? `${week.name(i)} · ${week.range(i)}` : week.range(i);
  }

  // ───────────────────────── 主题 ─────────────────────────
  const theme = (() => {
    const p = qs.get('theme');
    const forced = p === 'light' || p === 'dark' ? p : null;
    let source = forced ? 'param' : 'system';
    root.dataset.theme = forced || (mqDark.matches ? 'dark' : 'light');
    const get = () => root.dataset.theme;
    function sync() {
      const t = get();
      $$('[data-theme-toggle]').forEach((b) => {
        b.setAttribute('aria-pressed', String(t === 'dark'));
        b.setAttribute('aria-label', t === 'dark' ? '切换到白天' : '切换到夜晚');
        b.dataset.tip = t === 'dark' ? '切换到白天' : '切换到夜晚';
      });
      $$('[data-theme-set]').forEach((b) => b.setAttribute('aria-checked', String(b.dataset.themeSet === t)));
    }
    function apply(t) {
      root.dataset.theme = t;
      sync();
      document.dispatchEvent(new CustomEvent('nwk:theme', { detail: t }));
    }
    // origin = {x, y} 时用圆形扩散（View Transitions）；否则直接切换
    function set(t, { origin = null, from = 'user' } = {}) {
      if (t !== 'light' && t !== 'dark') return;
      if (from !== 'system') source = from;
      if (t === get()) { sync(); return; }
      if (!origin || !document.startViewTransition || reduced()) { apply(t); return; }
      const { x, y } = origin;
      const rad = Math.hypot(Math.max(x, innerWidth - x), Math.max(y, innerHeight - y));
      const vt = document.startViewTransition(() => apply(t));
      vt.ready.then(() => root.animate(
        { clipPath: [`circle(0px at ${x}px ${y}px)`, `circle(${rad}px at ${x}px ${y}px)`] },
        { duration: 600, easing: 'cubic-bezier(.65,0,.35,1)', pseudoElement: '::view-transition-new(root)' },
      )).catch(() => {});
    }
    function toggle(origin) {
      const t = get() === 'dark' ? 'light' : 'dark';
      set(t, { origin, from: 'user' });
      if (inFrame) { try { window.parent.postMessage({ type: 'nw:theme-changed', theme: t }, '*'); } catch (e) { /* 忽略 */ } }
      else if (forced || qs.has('theme')) { const u = new URL(location.href); u.searchParams.set('theme', t); history.replaceState(history.state, '', u); }
    }
    mqDark.addEventListener('change', (e) => { if (source === 'system') set(e.matches ? 'dark' : 'light', { from: 'system' }); });
    document.addEventListener('click', (e) => {
      const b = e.target.closest('[data-theme-toggle]');
      if (b) { const r = b.getBoundingClientRect(); toggle({ x: r.left + r.width / 2, y: r.top + r.height / 2 }); return; }
      const s = e.target.closest('[data-theme-set]');
      if (s) { const r = s.getBoundingClientRect(); set(s.dataset.themeSet, { origin: { x: r.left + r.width / 2, y: r.top + r.height / 2 } }); }
    });
    ready(sync);
    return { get, set, toggle, sync, get source() { return source; } };
  })();
  const themeToggleHTML = () => `<button type="button" class="btn btn-ghost btn-icon theme-tg" data-theme-toggle aria-pressed="false" aria-label="切换主题"><span class="tg-sun">${icon('sun', 18)}</span><span class="tg-moon">${icon('moon', 18)}</span></button>`;

  // ───────────────────────── 浮层栈（Esc 关最上层）与共享遮罩 ─────────────────────────
  const layers = [];
  let scrimEl = null;
  function scrimSync() {
    const need = layers.some((l) => l.scrim);
    if (need && !scrimEl) {
      scrimEl = document.createElement('div');
      scrimEl.className = 'scrim';
      scrimEl.addEventListener('click', () => { const top = layers[layers.length - 1]; if (top && top.close) top.close(); });
      document.body.appendChild(scrimEl);
      void scrimEl.offsetWidth;
    }
    if (scrimEl) scrimEl.classList.toggle('on', need);
    root.style.overflow = layers.some((l) => l.lock) ? 'hidden' : '';
  }
  const pushLayer = (l) => { if (!layers.includes(l)) layers.push(l); scrimSync(); };
  const popLayer = (l) => { const k = layers.indexOf(l); if (k >= 0) layers.splice(k, 1); scrimSync(); };
  function trapTab(container, e) {
    const f = $$('a[href],button:not([disabled]),input,select,textarea,[tabindex]:not([tabindex="-1"])', container).filter(visible);
    if (!f.length) { e.preventDefault(); return; }
    const a = f[0], z = f[f.length - 1];
    if (e.shiftKey && (document.activeElement === a || !container.contains(document.activeElement))) { e.preventDefault(); z.focus(); }
    else if (!e.shiftKey && document.activeElement === z) { e.preventDefault(); a.focus(); }
  }
  // 关闭后把焦点还回触发元素；触发元素已不在屏幕上时还给 [data-focus-fallback] 或页面
  function restoreFocus(el) {
    const ok = el && visible(el) && (() => { const r = el.getBoundingClientRect(); return r.right > 0 && r.left < innerWidth && r.bottom > 0 && r.top < innerHeight; })();
    const target = ok ? el : $('[data-focus-fallback]');
    if (target && target.focus) target.focus({ preventScroll: true });
    else if (document.activeElement && document.activeElement.blur) document.activeElement.blur();
  }

  // ───────────────────────── Tooltip ─────────────────────────
  const tip = (() => {
    let el = null, cur = null;
    function node() {
      if (!el) { el = document.createElement('div'); el.className = 'tip'; el.setAttribute('role', 'tooltip'); el.id = 'nwk-tip'; document.body.appendChild(el); }
      return el;
    }
    // target：元素（锚在其上沿中点）、PointerEvent/MouseEvent 或 {x, y}（跟随指针）
    function show(html, target, { side = 'top', offset = 8 } = {}) {
      const t = node();
      t.innerHTML = html;
      let ax, ay, top, ar = null;
      const tw = t.offsetWidth, th = t.offsetHeight;
      if (target && target.getBoundingClientRect) {
        const r = target.getBoundingClientRect();
        ax = r.left + r.width / 2;
        const roomTop = r.top - th - offset > 6;
        if (side === 'bottom' || !roomTop) { top = r.bottom + offset; t.dataset.side = 'bottom'; } else { top = r.top - th - offset; t.dataset.side = 'top'; }
        ar = target;
      } else {
        ax = target ? target.clientX ?? target.x : innerWidth / 2;
        ay = target ? target.clientY ?? target.y : innerHeight / 2;
        top = ay - th - 14;
        t.dataset.side = 'pointer';
        if (top < 6) top = ay + 18;
      }
      let left = clamp(ax - tw / 2, 8, innerWidth - tw - 8);
      top = clamp(top, 6, innerHeight - th - 6);
      t.style.setProperty('--x', `${left}px`);
      t.style.setProperty('--y', `${top}px`);
      t.style.setProperty('--ax', `${clamp(ax - left, 10, tw - 10)}px`);
      t.style.setProperty('--ox', `${clamp(ax - left, 0, tw)}px`);
      t.style.setProperty('--oy', t.dataset.side === 'bottom' ? '0%' : '100%');
      t.classList.add('on');
      cur = ar;
    }
    function hide() { if (el) el.classList.remove('on'); cur = null; }
    function from(elm) {
      const html = elm.getAttribute('data-tip-html');
      const txt = elm.getAttribute('data-tip');
      if (!html && !txt) return false;
      show(html || esc(txt), elm, { side: elm.dataset.tipSide || 'top' });
      return true;
    }
    document.addEventListener('pointerover', (e) => {
      const elm = e.target.closest && e.target.closest('[data-tip],[data-tip-html]');
      if (!elm || elm === cur) return;
      if (elm.closest('[data-person]') && elm.matches('[data-person]')) return;
      from(elm);
    });
    document.addEventListener('pointerout', (e) => {
      const elm = e.target.closest && e.target.closest('[data-tip],[data-tip-html]');
      if (elm && !elm.contains(e.relatedTarget)) hide();
    });
    document.addEventListener('focusin', (e) => { const elm = e.target.closest && e.target.closest('[data-tip],[data-tip-html]'); if (elm && e.target.matches(':focus-visible')) from(elm); });
    document.addEventListener('focusout', () => hide());
    addEventListener('scroll', hide, { passive: true, capture: true });
    return { show, hide };
  })();

  // ───────────────────────── 打开档案 / 跨页跳转 ─────────────────────────
  let personHandler = null;
  // 页面 id → 文件名（站点根目录下的静态页面）
  const PAGE_FILES = { c1: 'index.html', c2: 'ranking.html', c3: 'profile.html', c4: 'hatchery.html', c5: 'pond.html', rules: 'rules.html' };
  const pageFile = (id) => PAGE_FILES[id] || 'index.html';
  // 跨页只带公共显示参数（theme）；榜单的 win / flag、首页的 week 只属于本页，不带到别的页面
  const keepSearch = () => { const t = new URLSearchParams(location.search).get('theme'); return t === 'light' || t === 'dark' ? `?theme=${t}` : ''; };
  function navigate(screen, hash = '') {
    if (inFrame) { window.parent.postMessage({ type: 'nw:navigate', screen, hash }, '*'); return; }
    location.href = `${pageFile(screen)}${keepSearch()}${hash ? `#${hash}` : ''}`;
  }
  function openPerson(login) {
    if (!login) return;
    personCard.hide();
    tip.hide();
    if (personHandler) { personHandler(login); return; }
    navigate('c3', `u=${login}`);
  }
  // c3 自己处理打开档案（例如在本页抽屉里换人）时注册
  const setPersonHandler = (fn) => { personHandler = fn; };
  document.addEventListener('click', (e) => {
    const a = e.target.closest('a[data-screen]');
    if (!a || e.metaKey || e.ctrlKey || e.shiftKey) return;
    if (inFrame) { e.preventDefault(); navigate(a.dataset.screen, a.dataset.hash || ''); }
  });

  // ───────────────────────── 人物卡 ─────────────────────────
  function personCardHTML(p) {
    const f = formOf(p);
    const nx = nextInfo(p);
    const tags = [p.member ? '<span class="tag tag-member">组织成员</span>' : '<span class="tag tag-out">组织外</span>'];
    if (me.is(p.login)) tags.unshift('<span class="tag tag-live me-tag">我</span>');
    if (p.dormant) tags.push(`<span class="tag tag-sleep">${icon('moon-z', 11)}冬眠</span>`);
    let formBody;
    if (f.egg) {
      const nb = p.newbie;
      const m = Math.min(nb.merged, 3), w = Math.min(nb.activeWeeks, 2);
      const pips = (n, of) => `<span class="pips">${Array.from({ length: of }, (_, k) => `<i class="${k < n ? 'on' : ''}"></i>`).join('')}</span>`;
      formBody = `<div class="pc-fname">蛙卵<span>考核剩 ${nb.daysLeft} 天</span></div>`
        + `<div class="pc-req"><span>合入 ${pips(m, 3)}<b>${m}/3</b></span><span>活跃周 ${pips(w, 2)}<b>${w}/2</b></span></div>`;
    } else if (f.unhatched) {
      formBody = `<div class="pc-fname">未孵化<span>考核期已过</span></div><div class="meter yolk"><i style="width:${(p.progress * 100).toFixed(1)}%"></i></div>`
        + `<div class="pc-fnext">魔力 <b>${mag(p.bonus)}</b> / 50，攒满直接孵化</div>`;
    } else {
      formBody = `<div class="pc-fname">${f.name}${nx ? `<span>→ ${nx.name}</span>` : ''}</div><div class="meter"><i style="width:${(p.progress * 100).toFixed(1)}%"></i></div>`
        + `<div class="pc-fnext">${nx ? `差 <b>${mag(nx.gap)}</b> · ${etaText(nx.eta)}` : '已是最高形态'}</div>`;
    }
    const parts = compParts(p);
    const last = p.dormant ? `冬眠 · ${p.daysSinceLast} 天无动作` : `${fmt.ago(p.daysSinceLast)}有动作`;
    return `<div class="pc-top"><div class="pc-id">${avatar(p.login, 42, { progress: f.hatched ? p.progress : null, dim: p.dormant })}`
      + `<div style="min-width:0"><div class="pc-name ellipsis">${esc(p.login)}</div><div class="pc-tags">${tags.join('')}</div></div>`
      + `<div class="pc-rank"><b>#${p.rank}</b>${delta(p.move)}</div></div>`
      + `<div class="pc-form">${frogOf(p, 36, { cls: 'hop' })}<div style="min-width:0">${formBody}</div><div class="pc-fval"><b>${mag(p.bonus)}</b><span>魔力</span></div></div></div>`
      + `<div class="pc-body"><div>${comp(p)}<div class="legend" style="margin-top:7px">${parts.map((x) => `<span class="key" style="--k:${x.color}">${x.label} <b>${x.value < 0 ? '−' : ''}${mag(Math.abs(x.value))}</b></span>`).join('')}</div></div>`
      + `<div class="pc-row"><div><div class="label">近 12 周</div><div style="margin-top:5px">${sparkline(p.spark, { w: 168, h: 26, max: Math.max(5, ...p.spark) })}</div></div>`
      + `<div style="text-align:right"><div class="label" style="justify-content:flex-end">本周</div><div class="num strong" style="font-size:var(--fs-lg)">+${mag(p.tw)}</div></div></div></div>`
      + `<div class="pc-foot"><span>${last}</span><span class="go">查看档案${icon('arrow-right', 13)}</span></div>`;
  }
  const personCard = (() => {
    let el = null, forLogin = null, anchor = null, showT = 0, hideT = 0;
    function node() {
      if (el) return el;
      el = document.createElement('div');
      el.className = 'pcard';
      el.setAttribute('role', 'dialog');
      el.setAttribute('aria-label', '贡献者概览');
      el.addEventListener('pointerenter', () => clearTimeout(hideT));
      el.addEventListener('pointerleave', () => scheduleHide());
      el.addEventListener('click', () => { if (forLogin) openPerson(forLogin); });
      document.body.appendChild(el);
      return el;
    }
    function place(a) {
      const c = node();
      const r = a.getBoundingClientRect();
      const cw = c.offsetWidth || 320, ch = c.offsetHeight || 340;
      let left = r.left, top = r.bottom + 8, oy = '0%';
      if (top + ch > innerHeight - 8) { top = r.top - ch - 8; oy = '100%'; }
      if (top < 8) {
        top = clamp(r.top + r.height / 2 - ch / 2, 8, innerHeight - ch - 8);
        left = r.right + 10;
        if (left + cw > innerWidth - 8) left = r.left - cw - 10;
        oy = '50%';
      }
      left = clamp(left, 8, innerWidth - cw - 8);
      c.style.setProperty('--x', `${left}px`);
      c.style.setProperty('--y', `${top}px`);
      c.style.setProperty('--ox', `${clamp(r.left + Math.min(r.width, 40) / 2 - left, 0, cw)}px`);
      c.style.setProperty('--oy', oy);
    }
    function show(a, login) {
      const p = NW.byLogin.get(login);
      if (!p || !a.isConnected) return;
      const c = node();
      if (forLogin !== login) { c.innerHTML = personCardHTML(p); forLogin = login; }
      anchor = a;
      place(a);
      c.classList.add('on');
      tip.hide();
    }
    function hide() { clearTimeout(showT); clearTimeout(hideT); if (el) el.classList.remove('on'); anchor = null; }
    function scheduleHide() { clearTimeout(showT); clearTimeout(hideT); hideT = setTimeout(hide, 160); }
    document.addEventListener('pointerover', (e) => {
      if (e.pointerType !== 'mouse') return;
      const a = e.target.closest && e.target.closest('[data-person]');
      if (!a || (el && el.contains(a))) return;
      if (a === anchor) { clearTimeout(hideT); return; }
      clearTimeout(hideT);
      clearTimeout(showT);
      const open = el && el.classList.contains('on');
      showT = setTimeout(() => show(a, a.dataset.person), open ? 80 : 380);
    });
    document.addEventListener('pointerout', (e) => {
      const a = e.target.closest && e.target.closest('[data-person]');
      if (a && !a.contains(e.relatedTarget)) scheduleHide();
    });
    document.addEventListener('click', (e) => {
      const a = e.target.closest('[data-person]');
      if (!a || (el && el.contains(a)) || a.hasAttribute('data-person-noclick')) return;
      e.preventDefault();
      openPerson(a.dataset.person);
    });
    document.addEventListener('keydown', (e) => {
      const a = e.target.closest && e.target.closest('[data-person]');
      if (a && a === e.target && (e.key === 'Enter' || e.key === ' ') && !a.hasAttribute('data-person-noclick')) { e.preventDefault(); openPerson(a.dataset.person); }
    });
    document.addEventListener('focusin', (e) => {
      const a = e.target.closest && e.target.closest('[data-person]');
      if (a && a === e.target && e.target.matches(':focus-visible')) show(a, a.dataset.person);
    });
    document.addEventListener('focusout', (e) => { if (e.target.closest && e.target.closest('[data-person]')) scheduleHide(); });
    addEventListener('scroll', () => { if (el && el.classList.contains('on')) hide(); }, { passive: true, capture: true });
    return { show: (a, login) => show(a, login || a.dataset.person), hide, html: personCardHTML };
  })();

  // ───────────────────────── 标注（?annot=1 / nw:annot） ─────────────────────────
  const annot = (() => {
    let on = false; // 设计标注只用于原型评审，正式站点不开启
    let layer = null, hl = null, pop = null, dots = [], openK = -1, pinned = false, raf = 0, mo = null, ro = null, refreshT = 0, hideT = 0;
    function build() {
      if (layer) return;
      layer = document.createElement('div');
      layer.className = 'annot-layer';
      layer.setAttribute('aria-label', '设计标注');
      hl = document.createElement('div'); hl.className = 'annot-hl';
      pop = document.createElement('div'); pop.className = 'annot-pop'; pop.setAttribute('role', 'dialog');
      pop.addEventListener('pointerenter', () => clearTimeout(hideT));
      pop.addEventListener('pointerleave', () => { if (!pinned) scheduleClose(); });
      layer.append(hl, pop);
      document.body.appendChild(layer);
    }
    function collect() {
      dots.forEach((d) => d.btn.remove());
      dots = $$('[data-annot]').filter((el) => !layer.contains(el))
        .map((el) => ({ el, n: el.getAttribute('data-annot'), title: el.getAttribute('data-annot-title') || '', body: el.getAttribute('data-annot-body') || '' }))
        .sort((a, b) => (parseFloat(a.n) || 0) - (parseFloat(b.n) || 0));
      dots.forEach((d, k) => {
        const b = document.createElement('button');
        b.type = 'button';
        b.className = 'annot-dot';
        b.textContent = d.n;
        b.setAttribute('aria-label', `标注 ${d.n}：${d.title}`);
        b.setAttribute('aria-expanded', 'false');
        b.addEventListener('pointerenter', (e) => { if (e.pointerType === 'mouse' && !pinned) open(k, false); });
        b.addEventListener('pointerleave', (e) => { if (e.pointerType === 'mouse' && !pinned) scheduleClose(); });
        b.addEventListener('click', () => { if (openK === k && pinned) close(); else open(k, true); });
        b.addEventListener('focus', () => { if (b.matches(':focus-visible') && !pinned) open(k, false); });
        layer.insertBefore(b, pop);
        d.btn = b;
      });
      if (ro) { ro.disconnect(); dots.forEach((d) => ro.observe(d.el)); }
      position();
    }
    function position() {
      raf = 0;
      if (!on || !layer) return;
      const taken = [];
      dots.forEach((d) => {
        const r = d.el.getBoundingClientRect();
        const show = visible(d.el) && r.width + r.height > 0 && !d.el.closest('[hidden],[aria-hidden="true"]');
        d.btn.style.display = show ? '' : 'none';
        if (!show) return;
        let x = clamp(r.right - 4, 14, innerWidth - 14);
        let y = r.top + 4;
        // 元素部分可见时，圆点贴在视口内（向上滚出时吸附在顶部）
        if (r.bottom > 14 && r.top < innerHeight) y = clamp(y, 14, Math.min(innerHeight - 14, r.bottom - 4));
        // 与已放置的圆点重叠时向左错开
        for (let guard = 0; guard < 6 && taken.some((t) => Math.abs(t.x - x) < 24 && Math.abs(t.y - y) < 24); guard++) x -= 28;
        taken.push({ x, y });
        d.x = x; d.y = y; d.r = r;
        d.btn.style.setProperty('--x', `${x}px`);
        d.btn.style.setProperty('--y', `${y}px`);
      });
      if (openK >= 0) placePop();
    }
    const schedule = () => { if (on && !raf) raf = requestAnimationFrame(position); };
    function placePop() {
      const d = dots[openK];
      if (!d || !d.r) return;
      const r = d.r;
      hl.style.cssText = `transform:translate3d(${r.left}px,${r.top}px,0);width:${r.width}px;height:${r.height}px`;
      const pw = pop.offsetWidth, ph = pop.offsetHeight;
      let x = d.x + 16, y = d.y + 14, ox = '0', oy = '0';
      if (x + pw > innerWidth - 10) { x = d.x - pw - 16; ox = '100%'; }
      if (x < 10) x = clamp(d.x - pw / 2, 10, innerWidth - pw - 10);
      if (y + ph > innerHeight - 10) { y = d.y - ph - 14; oy = '100%'; }
      y = clamp(y, 10, Math.max(10, innerHeight - ph - 10));
      pop.style.setProperty('--x', `${x}px`);
      pop.style.setProperty('--y', `${y}px`);
      pop.style.setProperty('--ox', ox);
      pop.style.setProperty('--oy', oy);
    }
    function open(k, pin) {
      clearTimeout(hideT);
      const d = dots[k];
      if (!d) return;
      if (openK >= 0 && dots[openK]) dots[openK].btn.setAttribute('aria-expanded', 'false');
      openK = k;
      pinned = !!pin;
      d.btn.setAttribute('aria-expanded', 'true');
      pop.innerHTML = `<h4><i>${esc(d.n)}</i>${esc(d.title)}</h4>${d.body ? `<p>${esc(d.body)}</p>` : ''}`;
      position();
      pop.classList.add('on');
      hl.classList.add('on');
    }
    function close() {
      clearTimeout(hideT);
      if (openK >= 0 && dots[openK]) dots[openK].btn.setAttribute('aria-expanded', 'false');
      openK = -1;
      pinned = false;
      if (pop) pop.classList.remove('on');
      if (hl) hl.classList.remove('on');
    }
    function scheduleClose() { clearTimeout(hideT); hideT = setTimeout(close, 180); }
    function set(v) {
      on = !!v;
      root.toggleAttribute('data-annot-on', on);
      if (!document.body) return;
      if (on) {
        build();
        layer.hidden = false;
        if (!ro) ro = new ResizeObserver(schedule);
        if (!mo) {
          mo = new MutationObserver((list) => {
            if (list.every((m) => layer.contains(m.target))) return;
            clearTimeout(refreshT);
            refreshT = setTimeout(() => { if (on) collect(); }, 120);
          });
          mo.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['data-annot', 'data-annot-title', 'data-annot-body', 'hidden'] });
        }
        collect();
      } else {
        close();
        if (layer) layer.hidden = true;
        if (mo) { mo.disconnect(); mo = null; }
        if (ro) { ro.disconnect(); ro = null; }
      }
      $$('[data-annot-toggle]').forEach((b) => { if ('checked' in b) b.checked = on; else b.setAttribute('aria-pressed', String(on)); });
      document.dispatchEvent(new CustomEvent('nwk:annot', { detail: on }));
    }
    addEventListener('scroll', schedule, { passive: true, capture: true });
    addEventListener('resize', schedule, { passive: true });
    document.addEventListener('pointerdown', (e) => { if (pinned && layer && !layer.contains(e.target)) close(); });
    document.addEventListener('change', (e) => { if (e.target.matches && e.target.matches('input[data-annot-toggle]')) set(e.target.checked); });
    document.addEventListener('click', (e) => { const b = e.target.closest && e.target.closest('button[data-annot-toggle]'); if (b) set(!on); });
    ready(() => set(on));
    return { get on() { return on; }, set, toggle: () => set(!on), refresh: () => { if (on) collect(); }, close, isOpen: () => openK >= 0 };
  })();

  // ───────────────────────── 行为助手 ─────────────────────────
  // 数字滚动：从当前值（或 opts.from）缓动到 to；减少动效时直接落位。format 默认魔力一位小数 / 整数
  function countUp(el, to, { from, dur = 800, delay = 0, format } = {}) {
    if (!el) return;
    const f = format || (Number.isInteger(to) ? fmt.int : mag);
    const start = from ?? (typeof el.__nwkv === 'number' ? el.__nwkv : 0);
    el.__nwkv = to;
    el.setAttribute('aria-label', f(to));
    cancelAnimationFrame(el.__nwkraf || 0);
    if (reduced() || start === to || dur <= 0) { el.textContent = f(to); return; }
    const t0 = performance.now() + delay;
    const ease = (t) => 1 - Math.pow(2, -10 * t); // expo out
    const step = (now) => {
      const t = clamp((now - t0) / dur, 0, 1);
      const v = start + (to - start) * (t >= 1 ? 1 : ease(t));
      el.textContent = f(Number.isInteger(to) && Number.isInteger(start) ? Math.round(v) : v);
      if (t < 1) el.__nwkraf = requestAnimationFrame(step);
    };
    el.textContent = f(start);
    el.__nwkraf = requestAnimationFrame(step);
  }

  // FLIP 重排：按子元素的 data-key 匹配（innerHTML 重绘也能动）。新出现的淡入，消失的原地淡出（容器需非 static 定位）
  function flip(container, mutate, { duration = 560, selector = ':scope > [data-key]', stagger = 0 } = {}) {
    const keyOf = (el) => el.getAttribute('data-key');
    const before = new Map();
    $$(selector, container).forEach((el) => before.set(keyOf(el), { el, r: el.getBoundingClientRect() }));
    mutate();
    if (reduced()) return;
    const easing = springEasing();
    const after = $$(selector, container);
    const seen = new Set();
    after.forEach((el, k) => {
      const key = keyOf(el);
      seen.add(key);
      const b = before.get(key);
      const r = el.getBoundingClientRect();
      if (!b) {
        el.animate([{ opacity: 0, transform: 'translateY(6px) scale(.985)' }, { opacity: 1, transform: 'none' }], { duration: 280, delay: 140 + k * stagger, easing: 'cubic-bezier(.16,1,.3,1)', fill: 'backwards' });
        return;
      }
      const dx = b.r.left - r.left, dy = b.r.top - r.top;
      if (Math.abs(dx) < 0.5 && Math.abs(dy) < 0.5) return;
      el.animate([{ transform: `translate(${dx}px, ${dy}px)` }, { transform: 'none' }], { duration, delay: k * stagger, easing, composite: 'replace' });
    });
    const cs = getComputedStyle(container);
    if (cs.position === 'static') return;
    if (cs.isolation !== 'isolate') container.style.isolation = 'isolate'; // 让淡出的残影垫在行下面
    const cr1 = container.getBoundingClientRect();
    before.forEach((b, key) => {
      if (seen.has(key)) return;
      const g = b.el.cloneNode(true);
      g.removeAttribute('data-key');
      g.setAttribute('aria-hidden', 'true');
      Object.assign(g.style, { position: 'absolute', left: `${b.r.left - cr1.left}px`, top: `${b.r.top - cr1.top}px`, width: `${b.r.width}px`, height: `${b.r.height}px`, margin: '0', pointerEvents: 'none', zIndex: '-1' });
      container.appendChild(g);
      g.animate([{ opacity: 1, transform: 'none' }, { opacity: 0, transform: 'scale(.98)' }], { duration: 160, easing: 'ease-out', fill: 'forwards' }).onfinish = () => g.remove();
    });
  }

  // 分段控件：options = [{value, label, icon?, count?}]；省略 options 时沿用 el 内已有的 button[data-value]
  function segmented(el, options, onChange, { value, size } = {}) {
    if (typeof options === 'function') { onChange = options; options = null; }
    el.classList.add('seg');
    if (size === 'sm') el.classList.add('seg-sm');
    el.setAttribute('role', 'radiogroup');
    if (options) {
      el.innerHTML = options.map((o) => `<button type="button" role="radio" data-value="${esc(o.value)}" aria-checked="false"${o.aria ? ` aria-label="${esc(o.aria)}"` : ''}>${o.icon ? icon(o.icon, 14) : ''}${o.label !== undefined ? `<span>${esc(o.label)}</span>` : ''}${o.count !== undefined ? `<span class="n">${esc(o.count)}</span>` : ''}</button>`).join('');
    }
    const btns = $$('button', el);
    btns.forEach((b) => { b.type = 'button'; b.setAttribute('role', 'radio'); if (!b.dataset.value) b.dataset.value = b.dataset.v || b.textContent.trim(); });
    let ind = $('.seg-ind', el);
    if (!ind) { ind = document.createElement('i'); ind.className = 'seg-ind'; ind.setAttribute('aria-hidden', 'true'); el.prepend(ind); }
    let cur = value ?? (btns.find((b) => b.getAttribute('aria-checked') === 'true') || btns[0]).dataset.value;
    function place(anim) {
      const b = btns.find((x) => x.dataset.value === cur) || btns[0];
      if (!b || !b.offsetWidth) return;
      if (!anim) el.classList.add('no-anim');
      ind.style.width = `${b.offsetWidth}px`;
      ind.style.transform = `translateX(${b.offsetLeft}px)`;
      if (!anim) { void ind.offsetWidth; requestAnimationFrame(() => el.classList.remove('no-anim')); }
    }
    function mark() {
      btns.forEach((b) => { const on = b.dataset.value === cur; b.setAttribute('aria-checked', String(on)); b.tabIndex = on ? 0 : -1; });
    }
    function set(v, { silent = false, anim = true } = {}) {
      v = String(v);
      if (!btns.some((b) => b.dataset.value === v)) return;
      const changed = v !== cur;
      cur = v;
      mark();
      place(anim);
      if (changed && !silent && onChange) onChange(v);
    }
    btns.forEach((b) => b.addEventListener('click', () => set(b.dataset.value)));
    el.addEventListener('keydown', (e) => {
      const k = btns.indexOf(document.activeElement);
      if (k < 0) return;
      let n = null;
      if (e.key === 'ArrowRight' || e.key === 'ArrowDown') n = (k + 1) % btns.length;
      if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') n = (k - 1 + btns.length) % btns.length;
      if (e.key === 'Home') n = 0;
      if (e.key === 'End') n = btns.length - 1;
      if (n === null) return;
      e.preventDefault();
      e.stopPropagation();
      btns[n].focus();
      set(btns[n].dataset.value);
    });
    mark();
    place(false);
    new ResizeObserver(() => place(false)).observe(el);
    if (document.fonts) document.fonts.ready.then(() => place(false));
    return { get value() { return cur; }, set, el, refresh: () => place(false) };
  }

  // ───────────────────────── 我：这个浏览器记住的账号 ─────────────────────────
  // 只在 localStorage 存一个账号名，不是登录，也不验证归属；页面无法知道访客是谁，只能由访客自己选。
  // 三种状态：unset（没选过）/ set（选了且快照里有这个人）/ missing（选了但当前快照没有：改名、尚未更新）。
  // 浏览、搜索、分享、点人都不会改变它；只有明确的「记为我的账号」才写入。
  const me = (() => {
    const KEY = 'nwverse:contribution:me';
    let pref = null, person = null;
    const subs = new Set();
    function read() {
      try {
        const v = JSON.parse(localStorage.getItem(KEY) || 'null');
        pref = v && v.v === 1 && typeof v.login === 'string' && v.login.trim() ? { login: v.login.trim() } : null;
      } catch (e) { pref = null; }
      person = pref ? NW.byLogin.get(pref.login) || NW.people.find((p) => p.login.toLowerCase() === pref.login.toLowerCase()) || null : null;
    }
    function emit() { subs.forEach((fn) => { try { fn(api.state()); } catch (e) { console.error(e); } }); }
    function set(login) {
      try { localStorage.setItem(KEY, JSON.stringify({ v: 1, login })); } catch (e) { return false; }
      read();
      emit();
      return true;
    }
    function clear() {
      try { localStorage.removeItem(KEY); } catch (e) { /* 清不掉也按未设置展示 */ }
      pref = null; person = null;
      emit();
    }
    // 其他标签页改了偏好、或从 bfcache 回来时，重新读取
    addEventListener('storage', (e) => { if (e.key === KEY || e.key === null) { read(); emit(); } });
    addEventListener('pageshow', (e) => { if (e.persisted) { read(); emit(); } });
    const api = {
      KEY,
      get pref() { return pref; },
      get person() { return person; },
      state: () => (!pref ? 'unset' : person ? 'set' : 'missing'),
      is: (p) => !!person && (typeof p === 'string' ? p === person.login : p === person),
      set, clear,
      subscribe(fn) { subs.add(fn); return () => subs.delete(fn); },
      // 记住（带撤销）：写入失败时不假装成功
      remember(login) {
        const p = NW.byLogin.get(login);
        if (!p) return false;
        const prev = pref ? pref.login : null;
        if (!set(p.login)) { toast('这个浏览器暂时无法记住账号，可先查看档案或复制链接', { icon: 'alert-triangle', ms: 4200 }); return false; }
        toast(`已在这个浏览器记住 <b>@${esc(p.login)}</b>`, { icon: 'check', ms: 8000, action: { label: '撤销', run: () => { if (prev) set(prev); else clear(); toast('已撤销', { icon: 'rotate-ccw' }); } } });
        return true;
      },
      forget() { clear(); toast('已不再记住这个账号', { icon: 'log-out' }); },
    };
    read();
    return api;
  })();

  // 顶栏入口：未设置「找到我」；已设置「我 · @账号」+ 菜单（我的档案 / 我的总榜名次 / 更换 / 不再记住）
  const meEntry = (() => {
    let host = null, menuOpen = false;
    const menuApi = { scrim: false, lock: false, isOpen: () => menuOpen, close: () => setMenu(false), key(e) { if (e.key === 'Escape') { setMenu(false); return true; } return false; } };
    function buttonHTML() {
      const s = me.state();
      if (s === 'unset') return `<button type="button" class="btn me-btn" data-action="me-pick" aria-label="找到我：选择我的账号" data-tip="选一次账号，这个浏览器会记住">${icon('user-plus', 15)}<span class="lbl">找到我</span></button>`;
      if (s === 'missing') return `<button type="button" class="btn me-btn is-miss" data-action="me-menu" aria-haspopup="menu" aria-expanded="false" aria-label="我 · @${esc(me.pref.login)}，当前快照未找到，打开菜单">${icon('alert-triangle', 15)}<span class="lbl">我 · @${esc(me.pref.login)}</span>${icon('chevron-down', 14)}</button>`;
      const p = me.person;
      return `<button type="button" class="btn me-btn is-set" data-action="me-menu" aria-haspopup="menu" aria-expanded="false" aria-label="我 · @${esc(p.login)}，打开菜单">${avatar(p.login, 20)}<span class="lbl">我 · @${esc(p.login)}</span>${icon('chevron-down', 14)}</button>`;
    }
    function menuHTML() {
      const s = me.state();
      if (s === 'unset') return '';
      const item = (action, ic, label, end = '', cls = '') => `<button type="button" class="mi ${cls}" role="menuitem" data-action="${action}">${icon(ic, 16)}<span>${label}</span>${end ? `<span class="end num">${end}</span>` : ''}</button>`;
      if (s === 'missing') {
        return `<div class="me-menu card" role="menu" aria-label="我的账号"><div class="mm-head is-miss">${icon('alert-triangle', 22)}<div><b>当前快照未找到 @${esc(me.pref.login)}</b><small>可能是改名或数据尚未更新；不是零分</small></div></div>`
          + `${item('me-pick', 'repeat', '重新选择账号')}${item('me-forget', 'log-out', '不再记住', '', 'danger')}</div>`;
      }
      const p = me.person;
      return `<div class="me-menu card" role="menu" aria-label="我的账号"><div class="mm-head">${avatar(p.login, 28)}<div><b>@${esc(p.login)}</b><small>仅此浏览器记住</small></div></div>`
        + `${item('me-go', 'user', '我的档案')}${item('me-rank', 'trophy', '我的总榜名次', `#${p.rank}`)}<hr>${item('me-pick', 'repeat', '更换账号')}${item('me-forget', 'log-out', '不再记住', '', 'danger')}</div>`;
    }
    function render() { if (host) host.innerHTML = buttonHTML() + menuHTML(); }
    function setMenu(on) {
      if (!host) return;
      const m = $('.me-menu', host), b = $('.me-btn', host);
      if (!m) on = false;
      menuOpen = on;
      if (m) m.classList.toggle('on', on);
      if (b) b.setAttribute('aria-expanded', String(on));
      if (on) { pushLayer(menuApi); tip.hide(); const f = $('.mi', m); if (f) f.focus({ preventScroll: true }); }
      else popLayer(menuApi);
    }
    document.addEventListener('pointerdown', (e) => { if (menuOpen && host && !host.contains(e.target)) setMenu(false); });
    me.subscribe(() => { if (menuOpen) popLayer(menuApi); menuOpen = false; render(); });
    return { mount(el) { host = el; render(); }, toggle: () => setMenu(!menuOpen), close: () => setMenu(false), isOpen: () => menuOpen };
  })();

  // ───────────────────────── 应用顶栏 + 手机底部标签栏 ─────────────────────────
  // 档案（profile.html）不单独占导航：点任意贡献者进入
  const SCREENS = [
    { id: 'c1', label: '本周', icon: 'sparkles', desc: '这周发生了什么' },
    { id: 'c2', label: '排行榜', icon: 'trophy', desc: '谁最近在发力' },
    { id: 'c4', label: '孵化台', icon: 'egg', desc: '新人卡在哪一步' },
    { id: 'c5', label: '形态池', icon: 'layers', desc: '大家都进化到哪了' },
    { id: 'rules', label: '规则', icon: 'book-open', desc: '魔力怎么算、数据口径' },
  ];
  function appHeader(el, { active = null, sub = '贡献度看板' } = {}) {
    if (!el) return null;
    const href = (id) => `${pageFile(id)}${keepSearch()}`;
    const mod = isMac ? '⌘' : 'Ctrl';
    el.classList.add('appbar');
    el.setAttribute('role', 'banner');
    el.innerHTML = `<div class="appbar-in">
      <a class="brand" href="${href('c1')}" data-screen="c1" aria-label="奶蛙宇宙 · 回到本周"><span class="brand-mark">${frog('face', 24)}</span><span class="brand-txt"><span class="brand-name">奶蛙宇宙</span><span class="brand-sub">${esc(sub)}</span></span></a>
      <nav class="nav" aria-label="主导航">${SCREENS.map((s) => `<a href="${href(s.id)}" data-screen="${s.id}"${s.id === active ? ' aria-current="page"' : ''}>${icon(s.icon, 15)}${s.label}</a>`).join('')}</nav>
      <div class="appbar-r">
        <span class="fresh" data-tip="数据快照生成于 ${esc(fmt.datetime(NW.now))}（UTC+8）"><i class="live-dot"></i><span class="fresh-label">数据更新于</span>${fmt.week(NW.now)} ${fmt.hm(NW.now)}</span>
        <button type="button" class="btn search-btn" data-action="cmdk" aria-label="搜索贡献者（${mod}K）">${icon('search', 15)}<span class="lbl">搜索贡献者</span><span class="kbds only-kbd"><kbd>${mod}</kbd><kbd>K</kbd></span></button>
        <div class="me-wrap" data-me-wrap></div>
        <button type="button" class="btn btn-ghost btn-icon only-kbd hide-sm" data-action="keys" aria-label="键盘快捷键" data-tip="键盘快捷键  ?">${icon('keyboard', 18)}</button>
        ${themeToggleHTML()}
      </div></div>`;
    meEntry.mount($('[data-me-wrap]', el));
    let tb = $('.tabbar');
    if (!tb) { tb = document.createElement('nav'); tb.className = 'tabbar'; tb.setAttribute('aria-label', '页面导航'); document.body.appendChild(tb); }
    tb.innerHTML = SCREENS.map((s) => `<a href="${href(s.id)}" data-screen="${s.id}"${s.id === active ? ' aria-current="page"' : ''}>${icon(s.icon, 21)}<span>${s.label}</span></a>`).join('');
    const onScroll = () => el.classList.toggle('is-scrolled', scrollY > 4);
    addEventListener('scroll', onScroll, { passive: true });
    onScroll();
    theme.sync();
    return el;
  }
  document.addEventListener('click', (e) => {
    const a = e.target.closest('[data-action]');
    if (!a) return;
    const act = a.dataset.action;
    if (act === 'cmdk') cmdk.open();
    else if (act === 'keys') keys.open();
    else if (act === 'me-pick') { meEntry.close(); mePicker.open(a); }
    else if (act === 'me-menu') meEntry.toggle();
    else if (act === 'me-forget') { meEntry.close(); me.forget(); }
    else if (act === 'me-go') { meEntry.close(); if (me.person) openPerson(me.person.login); }
    else if (act === 'me-rank') { meEntry.close(); navigate('c2', 'me'); }
  });

  // ───────────────────────── 抽屉 ─────────────────────────
  // const d = NWK.drawer({ label: '贡献者档案', width: 540 }); d.el.innerHTML = ...; d.open(triggerEl)
  function drawer({ label = '详情', width = 540, onClose = null } = {}) {
    const el = document.createElement('aside');
    el.className = 'drawer';
    el.setAttribute('role', 'dialog');
    el.setAttribute('aria-modal', 'true');
    el.setAttribute('aria-label', label);
    el.tabIndex = -1;
    el.style.setProperty('--drawer-w', `${width}px`);
    let trigger = null, isOpen = false;
    const api = {
      el,
      scrim: true,
      lock: true,
      isOpen: () => isOpen,
      open(t) {
        if (!el.isConnected) document.body.appendChild(el);
        if (!isOpen) trigger = t || document.activeElement;
        isOpen = true;
        personCard.hide();
        tip.hide();
        pushLayer(api);
        void el.offsetWidth;
        el.classList.add('on');
        requestAnimationFrame(() => { if (!el.contains(document.activeElement)) el.focus({ preventScroll: true }); });
      },
      close() {
        if (!isOpen) return;
        isOpen = false;
        el.classList.remove('on');
        popLayer(api);
        tip.hide();
        restoreFocus(trigger);
        if (onClose) onClose();
      },
      key(e) {
        if (e.key === 'Escape') { api.close(); return true; }
        if (e.key === 'Tab') { trapTab(el, e); return false; }
        return api.onKey ? api.onKey(e) : false;
      },
      onKey: null,
    };
    el.addEventListener('click', (e) => { if (e.target.closest('[data-drawer-close]')) api.close(); });
    return api;
  }

  // ───────────────────────── 命令面板（⌘K / /） ─────────────────────────
  const cmdk = (() => {
    let el, input, list, items = [], sel = 0, isOpen = false, trigger = null;
    const extra = [];
    const byTw = () => [...NW.people].sort((a, b) => b.tw - a.tw || a.rank - b.rank);
    function build() {
      el = document.createElement('div');
      el.className = 'cmdk';
      el.setAttribute('role', 'dialog');
      el.setAttribute('aria-modal', 'true');
      el.setAttribute('aria-label', '搜索贡献者与命令');
      el.innerHTML = `<div class="cmdk-in">${icon('search', 18)}<input type="text" placeholder="搜索贡献者，或输入命令…" aria-label="搜索贡献者或命令" role="combobox" aria-expanded="true" aria-controls="nwk-cmdk-list" aria-autocomplete="list" autocomplete="off" spellcheck="false"><kbd>esc</kbd></div>`
        + '<div class="cmdk-list" id="nwk-cmdk-list" role="listbox" aria-label="结果"></div>'
        + `<div class="cmdk-ft"><span><kbd>↑</kbd><kbd>↓</kbd>选择</span><span><kbd>↵</kbd>打开</span><span><kbd>esc</kbd>关闭</span><span style="margin-left:auto">共 ${NW.people.length} 位贡献者</span></div>`;
      document.body.appendChild(el);
      input = $('input', el);
      list = $('.cmdk-list', el);
      input.addEventListener('input', () => { sel = 0; render(); });
      input.addEventListener('keydown', (e) => {
        if (e.key === 'ArrowDown' || e.key === 'ArrowUp') { e.preventDefault(); move(e.key === 'ArrowDown' ? 1 : -1); }
        else if (e.key === 'Enter') { e.preventDefault(); run(items[sel]); }
      });
      list.addEventListener('pointermove', (e) => { const b = e.target.closest('.cmdk-item'); if (b && +b.dataset.i !== sel) { sel = +b.dataset.i; mark(); } });
      list.addEventListener('click', (e) => { const b = e.target.closest('.cmdk-item'); if (b) run(items[+b.dataset.i]); });
    }
    const hl = (s, q) => {
      if (!q) return esc(s);
      const k = s.toLowerCase().indexOf(q);
      if (k < 0) return esc(s);
      return `${esc(s.slice(0, k))}<mark>${esc(s.slice(k, k + q.length))}</mark>${esc(s.slice(k + q.length))}`;
    };
    function builtins() {
      return [
        ...SCREENS.map((s) => ({ group: '前往', label: `${s.label} · ${s.desc}`, icon: s.icon, run: () => navigate(s.id) })),
        { group: '操作', label: theme.get() === 'dark' ? '切换到白天' : '切换到夜晚', icon: theme.get() === 'dark' ? 'sun' : 'moon', run: () => theme.toggle() },
        { group: '操作', label: '键盘快捷键', icon: 'keyboard', kbd: '?', run: () => keys.open() },
      ];
    }
    // 「我的」分组：按本地记住的账号给出命令。「不再记住」永远不是默认选中项
    function mine() {
      const s = me.state();
      if (s === 'unset') return [{ group: '我的', label: '选择我的账号', icon: 'user-plus', run: () => mePicker.open() }];
      if (s === 'missing') {
        return [
          { group: '我的', label: `重新选择我的账号（当前快照未找到 @${me.pref.login}）`, icon: 'alert-triangle', run: () => mePicker.open() },
          { group: '我的', label: '不再记住我的账号', icon: 'log-out', run: () => me.forget() },
        ];
      }
      const p = me.person;
      return [
        { group: '我的', label: `我的档案 · @${p.login}`, icon: 'user', run: () => openPerson(p.login) },
        { group: '我的', label: '我的总榜名次', icon: 'trophy', end: `#${p.rank}`, run: () => navigate('c2', 'me') },
        { group: '我的', label: '更换我的账号', icon: 'repeat', run: () => mePicker.open() },
        { group: '我的', label: '不再记住我的账号', icon: 'log-out', run: () => me.forget() },
      ];
    }
    function render() {
      const q = input.value.trim().toLowerCase();
      const ppl = q
        ? NW.people.filter((p) => p.login.toLowerCase().includes(q)).sort((a, b) => (b.login.toLowerCase().startsWith(q) - a.login.toLowerCase().startsWith(q)) || a.rank - b.rank).slice(0, 8)
        : byTw().slice(0, 6);
      const my = mine().filter((c) => !q || c.label.toLowerCase().includes(q));
      const cmds = [...extra, ...builtins()].filter((c) => !q || c.label.toLowerCase().includes(q)).slice(0, q ? 8 : 12);
      items = [...my.map((c) => ({ type: 'c', c })), ...ppl.map((p) => ({ type: 'p', p })), ...cmds.map((c) => ({ type: 'c', c }))];
      const cmdItem = (c, k) => `<button type="button" class="cmdk-item" role="option" id="nwk-ck-${k}" data-i="${k}">${icon(c.icon || 'arrow-right', 16)}<span>${hl(c.label, q)}</span><span class="end">${c.kbd ? `<kbd>${esc(c.kbd)}</kbd>` : ''}${c.end ? `<span class="num">${esc(c.end)}</span>` : ''}</span></button>`;
      let h = '', k = 0;
      if (my.length) {
        h += '<div class="cmdk-group">我的</div>';
        for (const c of my) h += cmdItem(c, k++);
      }
      if (ppl.length) {
        h += `<div class="cmdk-group">${q ? '贡献者' : '本周最活跃'}</div>`;
        for (const p of ppl) {
          h += `<button type="button" class="cmdk-item" role="option" id="nwk-ck-${k}" data-i="${k++}">${avatar(p.login, 22, { dim: p.dormant })}<span>${hl(p.login, q)}</span>${me.is(p.login) ? '<span class="tag tag-live me-tag">我</span>' : ''}${p.member ? '' : '<span class="tag tag-out">组织外</span>'}`
            + `<span class="end">${levelBadge(p, { size: 16 })}<span class="num">#${p.rank}</span><span class="num" style="min-width:44px;text-align:right">${mag(p.bonus)}</span></span></button>`;
        }
      }
      let g = '';
      for (const c of cmds) {
        if (c.group !== g) { g = c.group; h += `<div class="cmdk-group">${esc(g)}</div>`; }
        h += cmdItem(c, k++);
      }
      if (!items.length) h = `<div class="cmdk-empty">没有找到「${esc(input.value.trim())}」<br><span style="font-size:12px">只有有贡献记录的人会出现在这里</span></div>`;
      list.innerHTML = h;
      sel = clamp(sel, 0, Math.max(0, items.length - 1));
      mark();
    }
    function mark() {
      $$('.cmdk-item', list).forEach((b) => b.setAttribute('aria-selected', String(+b.dataset.i === sel)));
      const a = $(`.cmdk-item[data-i="${sel}"]`, list);
      if (a) { a.scrollIntoView({ block: 'nearest' }); input.setAttribute('aria-activedescendant', a.id); }
    }
    function move(d) { if (!items.length) return; sel = (sel + d + items.length) % items.length; mark(); }
    function run(it) {
      if (!it) return;
      api.close(true);
      if (it.type === 'p') openPerson(it.p.login); else it.c.run();
    }
    const api = {
      scrim: true,
      lock: false,
      isOpen: () => isOpen,
      add(cmds) { extra.push(...(Array.isArray(cmds) ? cmds : [cmds]).map((c) => ({ group: '本页', ...c }))); },
      open(q = '') {
        if (isOpen) return;
        if (!el) build();
        isOpen = true;
        trigger = document.activeElement;
        personCard.hide();
        tip.hide();
        input.value = q;
        sel = 0;
        render();
        pushLayer(api);
        void el.offsetWidth;
        el.classList.add('on');
        setTimeout(() => input.focus(), 10);
      },
      close(silent) {
        if (!isOpen) return;
        isOpen = false;
        el.classList.remove('on');
        popLayer(api);
        if (!silent) restoreFocus(trigger);
      },
      key(e) { if (e.key === 'Escape') { api.close(); return true; } if (e.key === 'Tab') { e.preventDefault(); return false; } return false; },
    };
    return api;
  })();

  // ───────────────────────── 选择我的账号 ─────────────────────────
  // 搜全部有贡献记录的人（不受榜单筛选影响），完全匹配优先；选中后先进确认区，再按「记为我的账号」才写入。
  // 「只查看档案」只打开档案，不记住。账号不在快照里时明确说「未找到」，不列成员名单，也不创建零分账号。
  const mePicker = (() => {
    let el, input, list, searchEl, confirmEl, sub, items = [], sel = 0, isOpen = false, trigger = null, confirm = null;
    const norm = (q) => q.trim().replace(/^@/, '').toLowerCase();
    const match = (q) => {
      const t = norm(q);
      if (!t) return [];
      const lc = (p) => p.login.toLowerCase();
      return NW.people.filter((p) => lc(p).includes(t))
        .sort((a, b) => (lc(b) === t) - (lc(a) === t) || (lc(b).startsWith(t) - lc(a).startsWith(t)) || a.rank - b.rank)
        .slice(0, 8);
    };
    const hl = (s, t) => { if (!t) return esc(s); const k = s.toLowerCase().indexOf(t); return k < 0 ? esc(s) : `${esc(s.slice(0, k))}<mark>${esc(s.slice(k, k + t.length))}</mark>${esc(s.slice(k + t.length))}`; };
    function build() {
      el = document.createElement('div');
      el.className = 'cmdk me-picker';
      el.setAttribute('role', 'dialog');
      el.setAttribute('aria-modal', 'true');
      el.setAttribute('aria-label', '选择我的账号');
      el.tabIndex = -1;
      el.innerHTML = `<div class="pk-head"><div><b>选择我的账号</b><p class="pk-sub"></p></div><button type="button" class="btn btn-ghost btn-icon btn-sm" data-pk="close" aria-label="关闭">${icon('x', 16)}</button></div>`
        + `<div class="pk-search"><div class="cmdk-in">${icon('search', 18)}<input type="text" placeholder="输入 GitHub 账号" aria-label="输入 GitHub 账号" role="combobox" aria-expanded="true" aria-controls="nwk-pk-list" aria-autocomplete="list" autocomplete="off" spellcheck="false"><kbd>esc</kbd></div>`
        + '<div class="cmdk-list" id="nwk-pk-list" role="listbox" aria-label="匹配的贡献者"></div>'
        + `<div class="cmdk-ft"><span><kbd>↑</kbd><kbd>↓</kbd>选择</span><span><kbd>↵</kbd>选中</span><span><kbd>esc</kbd>关闭</span><span style="margin-left:auto">选中后还要确认，不会直接保存</span></div></div>`
        + '<div class="pk-confirm" hidden></div>';
      document.body.appendChild(el);
      input = $('input', el);
      list = $('.cmdk-list', el);
      searchEl = $('.pk-search', el);
      confirmEl = $('.pk-confirm', el);
      sub = $('.pk-sub', el);
      input.addEventListener('input', () => { sel = 0; render(); });
      input.addEventListener('keydown', (e) => {
        if (e.key === 'ArrowDown' || e.key === 'ArrowUp') { e.preventDefault(); if (items.length) { sel = (sel + (e.key === 'ArrowDown' ? 1 : items.length - 1)) % items.length; mark(); } }
        else if (e.key === 'Enter') { e.preventDefault(); if (items[sel]) pick(items[sel]); }
      });
      list.addEventListener('pointermove', (e) => { const b = e.target.closest('.cmdk-item'); if (b && +b.dataset.i !== sel) { sel = +b.dataset.i; mark(); } });
      el.addEventListener('click', (e) => {
        const it = e.target.closest('.cmdk-item');
        if (it) { pick(items[+it.dataset.i]); return; }
        const b = e.target.closest('[data-pk]');
        if (!b) return;
        const a = b.dataset.pk;
        if (a === 'close') api.close();
        else if (a === 'clear') { input.value = ''; sel = 0; render(); input.focus(); }
        else if (a === 'rules') { api.close(true); navigate('rules'); }
        else if (a === 'back') back();
        else if (a === 'save') { const p = confirm; api.close(true); me.remember(p.login); }
        else if (a === 'view') { const p = confirm; api.close(true); openPerson(p.login); }
      });
    }
    function render() {
      const raw = input.value.trim(), t = norm(input.value);
      items = match(input.value);
      let h;
      if (!t) h = `<div class="cmdk-empty">输入账号查找。搜索全部 ${NW.people.length} 位有贡献记录的人，不受榜单筛选影响。</div>`;
      else if (!items.length) h = `<div class="cmdk-empty"><b>当前公开快照未找到「${esc(raw)}」</b><p>请核对账号；新贡献或改名可能尚未更新。看板只收录有贡献记录的人，不会列出成员名单。</p><div class="row"><button type="button" class="btn btn-sm" data-pk="clear">${icon('rotate-ccw', 14)}清空重搜</button><button type="button" class="btn btn-sm btn-ghost" data-pk="rules">查看统计口径</button></div></div>`;
      else {
        h = `<div class="cmdk-group">贡献者 · ${items.length}</div>` + items.map((p, k) => `<button type="button" class="cmdk-item" role="option" id="nwk-pk-${k}" data-i="${k}">${avatar(p.login, 22, { dim: p.dormant })}<span class="ellipsis">${hl(p.login, t)}</span>${me.is(p.login) ? '<span class="tag tag-live me-tag">我</span>' : ''}${p.member ? '' : '<span class="tag tag-out">组织外</span>'}`
          + `<span class="end">${levelBadge(p, { size: 16 })}<span class="num">总榜 #${p.rank}</span><span class="num" style="min-width:44px;text-align:right">${mag(p.bonus)}</span></span></button>`).join('');
      }
      list.innerHTML = h;
      sel = clamp(sel, 0, Math.max(0, items.length - 1));
      mark();
    }
    function mark() {
      $$('.cmdk-item', list).forEach((b) => b.setAttribute('aria-selected', String(+b.dataset.i === sel)));
      const a = $(`.cmdk-item[data-i="${sel}"]`, list);
      if (a) { a.scrollIntoView({ block: 'nearest' }); input.setAttribute('aria-activedescendant', a.id); } else input.removeAttribute('aria-activedescendant');
    }
    function pick(p) {
      if (!p) return;
      confirm = p;
      const cur = me.pref;
      const swap = cur && cur.login.toLowerCase() !== p.login.toLowerCase() ? `<div class="pc-swap">${icon('repeat', 12)}将替换当前记住的 @${esc(cur.login)}</div>` : '';
      confirmEl.innerHTML = `<div class="pc-row">${avatar(p.login, 56, { dim: p.dormant })}<div class="pc-txt"><b>@${esc(p.login)}</b><div class="pc-meta">${levelBadge(p, { size: 16 })}<span>总榜 #${p.rank} · 累计魔力 ${mag(p.bonus)}</span>${p.member ? '' : '<span class="tag tag-out">组织外</span>'}</div>${swap}</div></div>`
        + `<div class="pc-act"><button type="button" class="btn btn-primary" data-pk="save">${icon('check', 15)}记为我的账号</button><button type="button" class="btn" data-pk="view">只查看档案</button><button type="button" class="btn btn-ghost" data-pk="back">${icon('arrow-left', 14)}换一个</button></div>`
        + `<p class="footnote">${icon('info', 13)}记忆仅保存在这个浏览器。公用电脑请选「只查看档案」。</p>`;
      sub.textContent = '确认后，首页和排行榜会直接显示你的魔力与名次。';
      searchEl.hidden = true;
      confirmEl.hidden = false;
      $('[data-pk="save"]', confirmEl).focus();
    }
    function back() {
      confirm = null;
      confirmEl.hidden = true;
      searchEl.hidden = false;
      sub.textContent = '从已有贡献记录中选择。记住后，下次打开即可看到自己的名次。';
      input.focus();
    }
    const api = {
      scrim: true,
      lock: false,
      isOpen: () => isOpen,
      open(t) {
        if (isOpen) return;
        if (!el) build();
        isOpen = true;
        trigger = t && t.focus ? t : document.activeElement;
        personCard.hide();
        tip.hide();
        if (cmdk.isOpen()) cmdk.close(true);
        confirm = null;
        input.value = '';
        sel = 0;
        confirmEl.hidden = true;
        searchEl.hidden = false;
        sub.textContent = '从已有贡献记录中选择。记住后，下次打开即可看到自己的名次。';
        render();
        pushLayer(api);
        void el.offsetWidth;
        el.classList.add('on');
        setTimeout(() => input.focus(), 10);
      },
      close(silent) {
        if (!isOpen) return;
        isOpen = false;
        el.classList.remove('on');
        popLayer(api);
        if (!silent) restoreFocus(trigger);
      },
      key(e) {
        if (e.key === 'Escape') { if (confirm) back(); else api.close(); return true; }
        if (e.key === 'Tab') { trapTab(el, e); return false; }
        return false;
      },
    };
    return api;
  })();

  // ───────────────────────── 键盘：快捷键注册 + ? 面板 ─────────────────────────
  const keys = (() => {
    const defs = []; // { key, label, group, handler, display, when }
    let el = null, isOpen = false, trigger = null;
    const norm = (k) => (k.length === 1 ? k.toLowerCase() : k);
    const nice = (k) => ({ ArrowLeft: '←', ArrowRight: '→', ArrowUp: '↑', ArrowDown: '↓', Enter: '↵', Escape: 'esc', ' ': 'Space' }[k] || k);
    function add(def) {
      const list = Array.isArray(def) ? def : [def];
      list.forEach((d) => defs.push({ group: '本页', ...d, keys: [].concat(d.key) }));
      return () => list.forEach((d) => { const k = defs.findIndex((x) => x.label === d.label && x.handler === d.handler); if (k >= 0) defs.splice(k, 1); });
    }
    function sheetHTML() {
      const mod = isMac ? '⌘' : 'Ctrl';
      const groups = [{ name: '全局', rows: [[`${mod} K`, '搜索贡献者 / 命令'], ['/', '搜索'], ['?', '显示这张表'], ['esc', '关闭浮层']] }];
      const byG = new Map();
      defs.forEach((d) => { if (!d.label) return; if (!byG.has(d.group)) byG.set(d.group, []); byG.get(d.group).push([d.display || d.keys.map(nice).join(' '), d.label]); });
      byG.forEach((rows, name) => groups.push({ name, rows }));
      return `<div class="cmdk-in" style="color:var(--ink);font-weight:650;font-size:var(--fs-md)">${icon('keyboard', 18)}<span style="flex:1">键盘快捷键</span><kbd>esc</kbd></div>`
        + `<div style="padding:4px 16px 14px;max-height:60vh;overflow:auto">${groups.map((g) => `<div class="keys-grp">${esc(g.name)}</div>${g.rows.map(([k, d]) => `<div class="keys-row"><span>${esc(d)}</span><span class="k">${k.split(' ').map((x) => `<kbd class="kbd-lg">${esc(x)}</kbd>`).join('')}</span></div>`).join('')}`).join('')}</div>`;
    }
    const api = {
      scrim: true,
      lock: false,
      add,
      list: () => defs.slice(),
      isOpen: () => isOpen,
      open() {
        if (isOpen) return;
        if (!el) { el = document.createElement('div'); el.className = 'cmdk'; el.style.width = 'min(440px, calc(100vw - 24px))'; el.setAttribute('role', 'dialog'); el.setAttribute('aria-modal', 'true'); el.setAttribute('aria-label', '键盘快捷键'); el.tabIndex = -1; document.body.appendChild(el); }
        el.innerHTML = sheetHTML();
        trigger = document.activeElement;
        isOpen = true;
        pushLayer(api);
        void el.offsetWidth;
        el.classList.add('on');
        el.focus({ preventScroll: true });
      },
      close() { if (!isOpen) return; isOpen = false; el.classList.remove('on'); popLayer(api); restoreFocus(trigger); },
      key(e) { if (e.key === 'Escape' || e.key === '?') { api.close(); return true; } return false; },
    };
    document.addEventListener('keydown', (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); if (cmdk.isOpen()) cmdk.close(); else cmdk.open(); return; }
      const top = layers[layers.length - 1];
      if (top) { if (top.key && top.key(e)) e.preventDefault(); return; }
      if (e.key === 'Escape') { personCard.hide(); tip.hide(); if (annot.isOpen()) annot.close(); return; }
      if (typing(e.target) || e.metaKey || e.ctrlKey || e.altKey) return;
      for (let k = defs.length - 1; k >= 0; k--) {
        const d = defs[k];
        if (d.keys.some((x) => norm(x) === norm(e.key)) && (!d.when || d.when(e))) {
          if (d.handler(e) !== false) { e.preventDefault(); return; }
        }
      }
      if (e.key === '/') { e.preventDefault(); cmdk.open(); return; }
      if (e.key === '?') { e.preventDefault(); api.open(); }
    });
    return api;
  })();

  // ───────────────────────── 吐司 / 撒花 / 萤火 ─────────────────────────
  let toastEl = null, toastT = 0, toastAction = null;
  // action = { label, run }：吐司右侧一个按钮（如「撤销」），点了就收起
  function toast(html, { ms = 2600, icon: ic = null, action = null } = {}) {
    if (!toastEl) {
      toastEl = document.createElement('div'); toastEl.className = 'toast'; toastEl.setAttribute('role', 'status'); toastEl.setAttribute('aria-live', 'polite'); document.body.appendChild(toastEl);
      toastEl.addEventListener('click', (e) => { if (!e.target.closest('.toast-act')) return; clearTimeout(toastT); toastEl.classList.remove('on'); const run = toastAction; toastAction = null; if (run) run(); });
    }
    toastAction = action ? action.run : null;
    toastEl.innerHTML = `${ic ? icon(ic, 16) : ''}<span>${html}</span>${action ? `<button type="button" class="btn btn-sm toast-act">${esc(action.label)}</button>` : ''}`;
    void toastEl.offsetWidth;
    toastEl.classList.add('on');
    clearTimeout(toastT);
    toastT = setTimeout(() => toastEl.classList.remove('on'), ms);
  }
  // 奶蛙黄只用于庆祝：孵化、进化、创纪录
  function confetti(x, y, { count = 28, power = 1 } = {}) {
    if (reduced()) return;
    if (x && x.getBoundingClientRect) { const r = x.getBoundingClientRect(); y = r.top + r.height / 2; x = r.left + r.width / 2; }
    const host = document.createElement('div');
    host.className = 'confetti';
    host.style.transform = `translate(${x}px, ${y}px)`;
    document.body.appendChild(host);
    const colors = ['#f6c23e', '#ffe27a', '#e1a02a', '#86c472', '#3f84c8', '#a594f2', '#fff3c4'];
    const r = Math.random;
    for (let k = 0; k < count; k++) {
      const s = document.createElement('i');
      s.style.background = colors[k % colors.length];
      const shape = k % 4;
      if (shape === 0) Object.assign(s.style, { width: '6px', height: '6px', borderRadius: '50%' });
      if (shape === 1) Object.assign(s.style, { width: '9px', height: '9px', clipPath: 'polygon(50% 0,62% 38%,100% 50%,62% 62%,50% 100%,38% 62%,0 50%,38% 38%)' });
      if (shape === 2) Object.assign(s.style, { width: '4px', height: '11px' });
      host.appendChild(s);
      const a = (-90 + (r() - 0.5) * 150) * (Math.PI / 180);
      const v = (70 + r() * 90) * power;
      const dx = Math.cos(a) * v, dy = Math.sin(a) * v, rot = (r() - 0.5) * 720;
      s.animate([
        { transform: 'translate(-50%,-50%) rotate(0) scale(.4)', opacity: 1 },
        { transform: `translate(${dx}px, ${dy}px) rotate(${rot * 0.6}deg) scale(1)`, opacity: 1, offset: 0.45 },
        { transform: `translate(${dx * 1.25}px, ${dy + 90 + r() * 50}px) rotate(${rot}deg) scale(.9)`, opacity: 0 },
      ], { duration: 1000 + r() * 500, easing: 'cubic-bezier(.15,.7,.35,1)', fill: 'forwards' });
    }
    setTimeout(() => host.remove(), 1700);
  }
  // 夜间萤火：固定种子（截图稳定）；<body data-fireflies="off"> 关闭
  function fireflies(n = 20) {
    if (!document.body || document.body.dataset.fireflies === 'off' || $('.fireflies')) return;
    const host = document.createElement('div');
    host.className = 'fireflies';
    host.setAttribute('aria-hidden', 'true');
    const r = rng(11);
    for (let k = 0; k < n; k++) {
      const f = document.createElement('i');
      f.style.cssText = `--fx:${(r() * 100).toFixed(1)}%;--fy:${(6 + r() * 90).toFixed(1)}%;--fz:${(2 + r() * 2.2).toFixed(1)}px;--fd:${(10 + r() * 14).toFixed(1)}s;--fg:${(2.2 + r() * 3).toFixed(1)}s;--fdl:${(-r() * 12).toFixed(1)}s;--fdx:${((r() - 0.5) * 120).toFixed(0)}px;--fdy:${((r() - 0.5) * 90).toFixed(0)}px`;
      host.appendChild(f);
    }
    document.body.prepend(host);
  }
  ready(() => fireflies());

  // ───────────────────────── 柱图（周序列）：悬停、键盘、均线、图上标注 ─────────────────────────
  // NWK.columns(host, { data:[{label, v, t?}], hi, avg, color, dim, height, fmt, unit, tip, annotations, onSelect, ariaLabel })
  function niceStep(raw) { const p = Math.pow(10, Math.floor(Math.log10(raw || 1))); const m = raw / p; return (m <= 1 ? 1 : m <= 2 ? 2 : m <= 2.5 ? 2.5 : m <= 5 ? 5 : 10) * p; }
  function columns(host, opts) {
    let o = { data: [], hi: null, avg: null, color: 'var(--leaf)', dim: 'var(--viz-dim)', height: 168, padL: 30, padR: 6, padT: 22, padB: 22, ticks: 4, f: mag, unit: '', tip: null, annotations: [], onSelect: null, ariaLabel: '每周柱图', xLabel: null, valueLabel: true, ...opts };
    host.classList.add('chart');
    host.tabIndex = 0;
    host.setAttribute('role', 'img');
    let hov = -1, G = null;
    const tw = (s) => [...String(s)].reduce((n, c) => n + (/[　-鿿＀-￯]/.test(c) ? 11 : 6.2), 0);
    function render() {
      const W = host.clientWidth || 480;
      const H = o.height;
      const n = o.data.length;
      const vals = o.data.map((d) => d.v);
      const maxV = Math.max(1e-9, ...vals, ...(o.avg || []));
      const step = niceStep(maxV / o.ticks);
      const top = Math.ceil(maxV / step) * step;
      const iw = W - o.padL - o.padR, ih = H - o.padT - o.padB;
      const band = iw / Math.max(1, n);
      const bw = Math.min(24, Math.max(3, band * 0.58));
      const y = (v) => o.padT + ih - (v / top) * ih;
      const cx = (k) => o.padL + k * band + band / 2;
      G = { W, H, band, bw, y, cx, n, top };
      let s = `<svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" aria-hidden="true">`;
      for (let t = 0; t <= top + 1e-9; t += step) {
        const yy = Math.round(y(t)) + 0.5;
        s += `<line class="${t === 0 ? 'bl' : 'gl'}" x1="${o.padL}" x2="${W - o.padR}" y1="${yy}" y2="${yy}"/><text class="ax" x="${o.padL - 8}" y="${yy + 3.5}" text-anchor="end">${step < 1 ? t.toFixed(1) : Math.round(t).toLocaleString('zh-CN')}</text>`;
      }
      s += `<rect class="band" x="0" y="${o.padT - 6}" width="${band}" height="${ih + 6}" rx="6"/>`;
      o.data.forEach((d, k) => {
        const x = cx(k) - bw / 2;
        const isHi = o.hi === null || o.hi === undefined || k === o.hi;
        const fill = d.color || (isHi ? o.color : o.dim);
        if (d.v <= 0) { s += `<rect class="col" x="${x.toFixed(2)}" y="${(y(0) - 1.5).toFixed(2)}" width="${bw.toFixed(2)}" height="1.5" rx=".75" fill="var(--viz-muted)"/>`; return; }
        const y0 = y(d.v), r = Math.min(4, bw / 2, (y(0) - y0) / 2);
        s += `<path class="col" data-k="${k}" fill="${fill}" d="M${x.toFixed(2)} ${y(0)}V${(y0 + r).toFixed(2)}Q${x.toFixed(2)} ${y0.toFixed(2)} ${(x + r).toFixed(2)} ${y0.toFixed(2)}H${(x + bw - r).toFixed(2)}Q${(x + bw).toFixed(2)} ${y0.toFixed(2)} ${(x + bw).toFixed(2)} ${(y0 + r).toFixed(2)}V${y(0)}Z"/>`;
      });
      if (o.avg) {
        s += `<path class="avg" d="${o.avg.map((v, k) => `${k ? 'L' : 'M'}${cx(k).toFixed(1)} ${y(v).toFixed(1)}`).join('')}"/><circle class="avg-dot" r="4" cx="0" cy="0"/>`;
      }
      // 选中柱的数值标签（柱顶外侧）
      if (o.valueLabel && o.hi !== null && o.hi !== undefined && o.data[o.hi]) {
        const d = o.data[o.hi];
        s += `<text class="val-l" x="${clamp(cx(o.hi), o.padL + 12, W - o.padR - 12)}" y="${(y(Math.max(0, d.v)) - 6).toFixed(1)}" text-anchor="middle">${o.f(d.v)}</text>`;
      }
      // x 轴标签：有 t 时在每月第一周标「N月」，否则用 xLabel(d, k)
      let lastM = -1, lastX = -99;
      o.data.forEach((d, k) => {
        let lab = null;
        if (o.xLabel) lab = o.xLabel(d, k);
        else if (d.t !== undefined) { const m = new Date(d.t + TZ).getUTCMonth(); if (m !== lastM) { lab = `${m + 1}月`; lastM = m; } }
        if (lab && cx(k) - lastX > tw(lab) + 6) { s += `<text class="ax" x="${cx(k)}" y="${H - 6}" text-anchor="middle">${esc(lab)}</text>`; lastX = cx(k); }
      });
      // 图上标注：bracket = 区间括号；note = 引线指向某一柱
      (o.annotations || []).forEach((a) => {
        if (a.type === 'bracket') {
          const x1 = cx(a.from) - bw / 2, x2 = cx(a.to) + bw / 2;
          let m = 0; for (let k = a.from; k <= a.to; k++) m = Math.max(m, o.data[k].v);
          const yy = Math.min(y(m) - 10, y(0) - 14);
          const mid = (x1 + x2) / 2;
          s += `<path class="anno-ln" d="M${x1} ${yy + 5}V${yy}H${x2}V${yy + 5}"/><text class="anno-tx" x="${clamp(mid, o.padL + tw(a.text) / 2, W - o.padR - tw(a.text) / 2)}" y="${yy - 5}" text-anchor="middle">${esc(a.text)}</text>`;
        }
        if (a.type === 'note') {
          const px = cx(a.at), py = y(o.data[a.at].v) - 3;
          const side = a.side || 'left';
          const ty = Math.max(o.padT - 8, py - (a.dy ?? 26));
          const tx = side === 'left' ? px - (a.dx ?? 18) : px + (a.dx ?? 18);
          const wtx = tw(a.text);
          const anchorX = side === 'left' ? clamp(tx, o.padL + wtx, W) : clamp(tx, 0, W - o.padR - wtx);
          s += `<path class="anno-ln" d="M${px} ${py - 2}L${px} ${ty + 4}L${anchorX + (side === 'left' ? 4 : -4)} ${ty + 4}"/><circle class="anno-dot" cx="${px}" cy="${py - 2}" r="2"/>`
            + `<text class="anno-tx" x="${anchorX}" y="${ty + 8}" text-anchor="${side === 'left' ? 'end' : 'start'}" dx="${side === 'left' ? -2 : 2}">${esc(a.text)}</text>`;
        }
      });
      s += `<line class="xh" x1="0" x2="0" y1="${o.padT - 6}" y2="${y(0)}"/></svg>`;
      host.innerHTML = s;
      host.setAttribute('aria-label', o.ariaLabel);
      if (hov >= 0) hover(hov, false);
    }
    function hover(k, withTip = true) {
      const svg = host.querySelector('svg');
      if (!svg || !G) return;
      hov = k;
      const band = svg.querySelector('.band');
      const dot = svg.querySelector('.avg-dot');
      if (k < 0) { band.style.opacity = 0; if (dot) dot.style.opacity = 0; tip.hide(); return; }
      band.setAttribute('x', o.padL + k * G.band);
      band.style.opacity = 1;
      if (dot && o.avg) { dot.setAttribute('cx', G.cx(k)); dot.setAttribute('cy', G.y(o.avg[k])); dot.style.opacity = 1; }
      if (!withTip) return;
      const d = o.data[k];
      const html = o.tip ? o.tip(d, k) : `<div class="t-h">${esc(d.label)}</div><div class="t-row"><span class="t-key box" style="--k:${k === o.hi ? o.color : o.dim}"></span><span class="t-v">${o.f(d.v)}</span><span class="t-l">${esc(o.unit)}</span></div>${o.avg ? `<div class="t-row"><span class="t-key" style="--k:var(--viz-avg)"></span><span class="t-v">${o.f(o.avg[k])}</span><span class="t-l">近 4 周均值</span></div>` : ''}`;
      const r = host.getBoundingClientRect();
      const yTop = G.y(Math.max(d.v, o.avg ? o.avg[k] : 0));
      tip.show(html, { getBoundingClientRect: () => ({ left: r.left + G.cx(k) - 1, width: 2, top: r.top + yTop - 4, bottom: r.top + yTop, height: 4 }) });
    }
    const idxAt = (clientX) => { const r = host.getBoundingClientRect(); return clamp(Math.floor((clientX - r.left - o.padL) / G.band), 0, o.data.length - 1); };
    host.addEventListener('pointermove', (e) => { if (!G) return; const k = idxAt(e.clientX); if (k !== hov || !document.querySelector('.tip.on')) hover(k); });
    host.addEventListener('pointerleave', () => hover(-1));
    host.addEventListener('click', (e) => { if (o.onSelect && G) o.onSelect(idxAt(e.clientX)); });
    host.addEventListener('keydown', (e) => {
      if (!['ArrowLeft', 'ArrowRight', 'Home', 'End', 'Enter'].includes(e.key)) return;
      e.preventDefault();
      e.stopPropagation();
      const n = o.data.length;
      let k = hov < 0 ? (o.hi ?? n - 1) : hov;
      if (e.key === 'ArrowLeft') k = Math.max(0, k - 1);
      if (e.key === 'ArrowRight') k = Math.min(n - 1, k + 1);
      if (e.key === 'Home') k = 0;
      if (e.key === 'End') k = n - 1;
      if (e.key === 'Enter' && o.onSelect) { o.onSelect(k); return; }
      hover(k);
    });
    host.addEventListener('blur', () => hover(-1));
    const ro = new ResizeObserver(() => render());
    ro.observe(host);
    render();
    return { el: host, update(next) { o = { ...o, ...next }; render(); }, destroy() { ro.disconnect(); host.innerHTML = ''; } };
  }

  // ───────────────────────── 池塘形态站（某一周末的形态分布） ─────────────────────────
  function pondData(i = NW.last) {
    const s = NW.weekSnapshot(i);
    const ppl = NW.people.filter((p) => p.started[i]);
    const forms = new Map(ppl.map((p) => [p.login, formOf(p, i)]));
    const eggs = ppl.filter((p) => forms.get(p.login).egg);
    const failed = ppl.filter((p) => forms.get(p.login).unhatched);
    const members = [eggs, ...NW.LV.map((_, k) => ppl.filter((p) => p.levels[i] === k))];
    // 这一周新到某一级的人（孵化或进化而来）
    const arrivals = [ppl.filter((p) => forms.get(p.login).egg && !(i > 0 && p.started[i - 1])),
      ...NW.LV.map((_, k) => ppl.filter((p) => p.levels[i] === k && (i === 0 || p.levels[i - 1] !== k)))];
    return { i, counts: members.map((m) => m.length), members, arrivals, failed: failed.length, hatched: s.hatched, contributors: s.contributors };
  }
  const PAD = '<svg class="pad" viewBox="0 0 52 15" aria-hidden="true"><ellipse class="s" cx="26" cy="9.5" rx="26" ry="5.5"/><ellipse class="l" cx="26" cy="7.5" rx="23" ry="6"/><path class="v" d="M26 7.5 L26 1.8 M26 7.5 L14.5 5.2 M26 7.5 L37.5 5.2 M26 7.5 L17.5 11.8 M26 7.5 L34.5 11.8"/></svg>';
  function pond(i = NW.last, { title = '池塘里的形态', sizes = [30, 32, 36, 42, 46, 50] } = {}) {
    const d = pondData(i);
    const meta = [{ name: '蛙卵', icon: 'egg', th: '考核中' }, ...NW.LV.map((L, k) => ({ name: L.name, icon: L.icon, th: k ? `≥${L.bonus}` : '孵化即得' }))];
    const when = i === NW.last ? '截至此刻' : `${fmt.week(NW.W[i])} 这一周结束时`;
    const st = meta.map((m, k) => {
      const c = d.counts[k];
      const arr = d.arrivals[k].length;
      const emptyTop = c === 0 && k > 0;
      const names = d.members[k].map((p) => p.login);
      const tipTxt = k === 0
        ? `蛙卵 ${c} 人：首次贡献 30 天内、还在新手考核期`
        : emptyTop ? `${m.name}：虚位以待（魔力 ${m.th}）` : `${m.name} ${c} 人${names.length <= 4 ? `：${names.join('、')}` : ''}${arr && k > 0 ? `；${i === NW.last ? '本周' : '这一周'}新到 ${arr} 人` : ''}`;
      const screen = k === 0 ? 'c4' : 'c5';
      return `<a class="st hop-host ${emptyTop ? 'is-vacant' : ''}" href="${pageFile(screen)}${keepSearch()}${k ? `#lv=${k - 1}` : ''}" data-screen="${screen}" data-hash="${k ? `lv=${k - 1}` : ''}" data-tip="${esc(tipTxt)}" aria-label="${esc(tipTxt)}">`
        + `<span class="st-n">${emptyTop ? '<span class="st-vac">虚位以待</span>' : `<span class="cnt">${c}</span>`}${arr && k > 0 && c > 0 ? `<span class="st-d">+${arr}</span>` : ''}</span>`
        + `<span class="st-fig">${frog(m.icon, sizes[k], emptyTop ? 'ghost' : '')}${PAD}</span>`
        + `<span class="st-nm">${m.name}</span><span class="st-th">${m.th}</span></a>`;
    }).join('');
    return `<div class="pond" role="group" aria-label="${esc(title)}">`
      + '<svg class="pond-ripples" viewBox="0 0 260 200" aria-hidden="true"><circle cx="200" cy="170" r="30"/><circle cx="200" cy="170" r="56" opacity=".55"/><circle cx="200" cy="170" r="84" opacity=".28"/></svg>'
      + `<div class="pond-head"><h3>${esc(title)}</h3><span>${when}</span></div><div class="stations">${st}</div>`
      + `<div class="pond-foot"><span>另有 <b>${d.failed}</b> 人考核期满未孵化</span><span>已孵化 <b>${d.hatched}</b> / ${d.contributors}</span></div></div>`;
  }

  // ───────────────────────── 进化进度轴：蛙卵 + 五级；头像骑在当前位置 ─────────────────────────
  function evoAxis(p, { play = true } = {}) {
    const f = formOf(p);
    const L = p.level;
    const N = NW.LV.length; // 5
    const nodes = [{ name: f.unhatched ? '未孵化' : '蛙卵', icon: f.unhatched ? 'unhatched' : 'egg', th: f.unhatched ? '考核期已过' : '考核 30 天' }, ...NW.LV.map((x, k) => ({ name: x.name, icon: x.icon, th: k ? `≥${x.bonus.toLocaleString('zh-CN')}` : '孵化即得' }))];
    const nb = p.newbie;
    let pos, curK, call, checks = '';
    if (L === null) {
      curK = 0;
      const route = Math.min(1, p.bonus / NW.RULES.hatchBonus);
      const test = f.egg ? (Math.min(nb.merged, 3) / 3 + Math.min(nb.activeWeeks, 2) / 2) / 2 : 0;
      pos = Math.max(route, test) * (1 / N) * 0.88;
      const h = hatchHint(p);
      if (f.egg) {
        const ok = (a, b) => (a >= b ? ' ok' : '');
        checks = `<div class="evo-checks">`
          + `<div class="evo-check${ok(nb.merged, 3)}"><b>${Math.min(nb.merged, 3)}/3</b>合入 PR<div class="pips" style="margin-top:6px">${[0, 1, 2].map((k) => `<i class="${k < nb.merged ? 'on' : ''}"></i>`).join('')}</div></div>`
          + `<div class="evo-check${ok(nb.activeWeeks, 2)}"><b>${Math.min(nb.activeWeeks, 2)}/2</b>活跃周<div class="pips" style="margin-top:6px">${[0, 1].map((k) => `<i class="${k < nb.activeWeeks ? 'on' : ''}"></i>`).join('')}</div></div>`
          + `<div class="evo-check"><b>${nb.daysLeft} 天</b>考核剩余<div class="meter ${nb.daysLeft <= 10 ? 'rust' : 'yolk'} sm" style="margin-top:7px"><i style="width:${(nb.daysLeft / NW.RULES.newbie.days * 100).toFixed(1)}%"></i></div></div></div>`;
        call = `<b>新手考核中</b> · ${esc(h.text)}；或魔力攒到 50（现在 ${mag(p.bonus)}）直接孵化`;
      } else {
        call = `<b>考核期已过</b> · 魔力 ${mag(p.bonus)} / 50，攒满直接孵化${p.pace > 0 ? `，按近 4 周均速${etaText(Math.ceil((NW.RULES.hatchBonus - p.bonus) / p.pace))}` : ''}`;
      }
    } else {
      curK = L + 1;
      pos = p.next ? (curK + p.progress) / N : 1;
      const nx = nextInfo(p);
      call = nx ? `距<b>${nx.name}</b>还差 <b class="num">${mag(nx.gap)}</b> 魔力 · 按近 4 周均速 ${mag(p.pace)}/周，${etaText(nx.eta)}` : '<b>已是最高形态</b>';
    }
    const st = nodes.map((nd, k) => {
      const state = k < curK ? 'done' : k === curK ? 'cur' : k === curK + 1 ? 'next' : 'todo';
      const size = state === 'cur' ? 48 : state === 'next' ? 38 : 32;
      const cls = state === 'todo' ? 'ghost' : '';
      return `<div class="evo-st is-${state}" style="--x:${(k / N) * 100}%"><div class="evo-fr">${frog(nd.icon, size, cls)}</div>`
        + `<i class="evo-dot">${state === 'done' || (state === 'cur' && L !== null) ? icon('check', 9) : ''}</i>`
        + `<div class="evo-nm">${nd.name}</div><div class="evo-th">${nd.th}</div></div>`;
    }).join('');
    return `<div class="evo ${play ? 'play' : ''}" style="--pos:${(clamp(pos, 0, 1) * 100).toFixed(2)}%" role="img" aria-label="${esc(`${p.login}：${f.name}，${call.replace(/<[^>]+>/g, '')}`)}">`
      + `<div class="evo-rail" aria-hidden="true"><i class="evo-fill"></i>${st}<div class="evo-me">${avatar(p.login, 24)}</div></div>`
      + `${checks}<div class="callout evo-call">${icon('target', 15)}<span>${call}</span></div></div>`;
  }

  // KPI 统计块：值较前一期 + 参照值「上周 583」
  function kpi({ icon: ic, label, value, prev = null, f, unit = '', ref = null, sub = '', key = '' } = {}) {
    const ff = f || (Number.isInteger(value) ? fmt.int : mag);
    return `<div class="kpi"${key ? ` data-kpi="${esc(key)}"` : ''}><div class="kpi-l">${ic ? icon(ic, 15) : ''}<span>${esc(label)}</span>${ref ? `<span class="kpi-ref">${esc(ref)}</span>` : ''}</div>`
      + `<div class="kpi-v"><span class="val">${ff(value)}</span>${unit ? `<span class="unit">${esc(unit)}</span>` : ''}${prev !== null ? change(value, prev, { f: ff }) : ''}</div>`
      + `<div class="kpi-s">${sub}</div></div>`;
  }

  window.NWK = {
    version: '2.0.0',
    // 环境
    inFrame, reduced, canHover, isMac, ready,
    // 工具与格式
    $, $$, esc, clamp, hue, rng, fmt, mag,
    // 协议能力
    theme, annot, tip, personCard, openPerson, setPersonHandler, navigate, SCREENS,
    // 我：本地记住的账号
    me, mePicker, meEntry,
    // 渲染助手（返回字符串）
    icon, frog, frogOf, formOf, levelBadge, nextInfo, etaText, hatchHint,
    avatar, who, pname, people, delta, change,
    sparkline, ring, countdown, stackedBar, compParts, comp, dotRange, empty, skeletonRows,
    pond, pondData, evoAxis, kpi, themeToggleHTML,
    // 活力
    VIT_PARTS, VIT_STATUS, vitNum, vitNeed, vitTip, vitBar, vitTag,
    // 周
    week, weekLabel,
    // 行为助手
    countUp, flip, segmented, appHeader, drawer, cmdk, keys, toast, confetti, fireflies, columns,
  };
})();
