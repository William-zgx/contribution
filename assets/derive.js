// 派生指标：所有页面共用，保证口径一致。只依赖 window.BOARD（data/board.json）与 engine.js 的 RULES。
// 只做展示用的派生（逐周累计、历史名次、预计升级时间等），不改计算口径。
// engine.js 的 RULES 是经典脚本顶层 const，不挂在 window 上；在这里接出来供 IIFE 内与其他脚本使用
window.RULES = window.RULES || RULES;
(function () {
  const B = window.BOARD;
  const DAY = 86400000;
  const WEEK = 7 * DAY;
  const TZ = window.RULES.tzOffsetHours * 3600000;

  // 规则全部取自 engine.js 的 RULES（页面与上传脚本共用），这里不另存常量
  const R = window.RULES;
  const LV = R.levels.map((l, i) => ({ i, name: l.name, icon: l.icon, bonus: l.bonus, tagline: l.tagline }));
  const RULES = {
    weeklyScoreCaps: R.weeklyScoreCaps,
    score: R.score,
    newbie: R.newbie,
    hatchBonus: LV[1].bonus,
    dormantDays: R.dormantDays,
    dormantExemptLevel: R.dormantExemptLevel,
    staleOpenDays: R.staleOpenDays,
    warnLines: R.warnLines,
    models: R.models,
    modelNone: R.modelNone,
    tzOffsetHours: R.tzOffsetHours,
    vitality: R.vitality,
  };

  // 孵化后取魔力达到的最高一级；未孵化返回 null
  function levelOf(bonus, hatched) {
    if (!hatched && bonus < RULES.hatchBonus) return null;
    let l = 0;
    while (l + 1 < LV.length && bonus >= LV[l + 1].bonus) l++;
    return l;
  }

  const weeks = B.weeks; // [{ start, active, merged }]，按周升序，最后一项是本周（未结束）
  const W = weeks.map((w) => w.start);
  const last = W.length - 1;
  const people = B.people;

  for (const p of people) {
    p.wk = new Map(p.weekly); // weekStart → 当周魔力（PR 与协作分别按递减曲线计算）
    // 每周末累计魔力；魔力 = 各周得分之和，所以任意一周的历史魔力都能精确还原
    let s = 0;
    p.cum = W.map((w) => (s += p.wk.get(w) || 0));
    p.cum[last] = p.bonus; // 与线上展示值完全一致（避免四舍五入误差）
    const passAt = p.newbie.passAt;
    p.levels = W.map((w, i) => levelOf(p.cum[i], passAt !== null && passAt < w + WEEK));
    p.levels[last] = p.level;
    p.started = W.map((w) => p.firstAt < w + WEEK); // 该周结束前是否已有首次贡献
    p.tw = p.wk.get(W[last]) || 0; // 本周魔力
    p.lw = p.wk.get(W[last - 1]) || 0; // 上周魔力
    p.l4 = W.slice(-4).reduce((n, w) => n + (p.wk.get(w) || 0), 0); // 近 4 周魔力（含本周）
    p.pace = p.l4 / 4; // 近 4 周周均
    p.prev = p.cum[last - 1]; // 上周末魔力
    p.prevLevel = p.levels[last - 1];
    p.gap = p.next ? p.next.bonus - p.bonus : null; // 距下一级还差
    p.eta = p.next && p.pace > 0 ? Math.ceil(p.gap / p.pace) : null; // 按近 4 周均速预计周数
    // 到下一级的进度 0–1；未孵化时为到「魔力补孵化（50）」的进度
    p.progress = p.level === null
      ? Math.min(1, p.bonus / RULES.hatchBonus)
      : p.next ? (p.bonus - LV[p.level].bonus) / (p.next.bonus - LV[p.level].bonus) : 1;
    p.spark = W.slice(-12).map((w) => p.wk.get(w) || 0); // 近 12 周每周魔力
    p.daysSinceLast = Math.floor((B.now - p.lastAt) / DAY);
  }

  // ───────── 活力（RULES.vitality）─────────
  // 输入：最近若干周每周魔力（k=0 为本周）、在组周数、累计魔力、距上次任何动作天数。返回总分与四项分（已乘权重，合计即总分）。
  function vitalityScore({ weekly, tenure, bonus, days }) {
    const V = RULES.vitality, w = V.weights;
    const n = Math.max(1, Math.min(V.weeks, tenure));
    let sum = 0, norm = 0, active = 0;
    for (let k = 0; k < n; k++) {
      const m = weekly[k] || 0, wt = Math.pow(2, -k / V.halfLife);
      sum += m * wt;
      norm += wt;
      if (m > 0) active++;
    }
    let quiet = weekly.findIndex((m) => m > 0);
    if (quiet < 0) quiet = Infinity;
    const f = {
      recent: Math.min(1, sum / (V.pace * norm)),
      steady: active / n,
      history: Math.min(1, Math.log1p(bonus) / Math.log1p(V.historyRef)) * Math.pow(2, -quiet / V.creditHalfLife),
      action: Math.max(0, 1 - days / RULES.dormantDays),
    };
    const parts = { recent: 100 * w.recent * f.recent, steady: 100 * w.steady * f.steady, history: 100 * w.history * f.history, action: 100 * w.action * f.action };
    const v = parts.recent + parts.steady + parts.history + parts.action;
    return { v, parts, f, quiet, status: v < V.laggard ? 'laggard' : v < V.watch ? 'watch' : 'ok' };
  }
  for (const p of people) {
    const tenure = Math.ceil((B.now - p.firstAt) / WEEK);
    if (B.now - p.firstAt < RULES.newbie.days * DAY) { p.vit = null; continue; } // 新手考核期内不评
    const weekly = W.map((_, k) => p.wk.get(W[last - k]) || 0);
    const input = { weekly, tenure, bonus: p.bonus, days: p.daysSinceLast };
    const r = vitalityScore(input);
    // 本周再拿多少魔力能升一档（掉队 → 观察 → 正常）：拿到魔力本身也是一次动作
    const target = r.status === 'laggard' ? RULES.vitality.laggard : r.status === 'watch' ? RULES.vitality.watch : null;
    let need = null;
    if (target !== null) {
      const at = (m) => vitalityScore({ ...input, weekly: [weekly[0] + m, ...weekly.slice(1)], bonus: p.bonus + m, days: 0 }).v;
      if (at(400) >= target) {
        let lo = 0, hi = 400;
        for (let t = 0; t < 30; t++) { const mid = (lo + hi) / 2; if (at(mid) >= target) hi = mid; else lo = mid; }
        need = Math.ceil(hi * 10) / 10;
      }
    }
    p.vit = { ...r, need };
  }

  // 第 i 周末的排名（1 起）：只排该周结束前已有首次贡献的人。
  // 最后一周直接用线上排名；历史周按累计魔力降序、账号名升序。
  const rankCache = new Map();
  function ranksAt(i) {
    if (rankCache.has(i)) return rankCache.get(i);
    const m = new Map();
    if (i === last) for (const p of people) m.set(p.login, p.rank);
    else {
      people.filter((p) => p.started[i])
        .sort((a, b) => b.cum[i] - a.cum[i] || a.login.localeCompare(b.login))
        .forEach((p, k) => m.set(p.login, k + 1));
    }
    rankCache.set(i, m);
    return m;
  }
  for (const p of people) {
    p.prank = ranksAt(last - 1).get(p.login) ?? null; // 上周名次；上周还没开始贡献则为 null
    p.move = p.prank === null ? null : p.prank - p.rank; // 正数 = 上升
  }

  // 第 i 周的组织快照
  function weekSnapshot(i) {
    const ppl = people.filter((p) => p.started[i]);
    const lv = (p, k) => (k < 0 ? null : p.levels[k]);
    return {
      i,
      start: W[i],
      isCurrent: i === last,
      active: weeks[i].active,
      merged: weeks[i].merged,
      contributors: ppl.length,
      hatched: ppl.filter((p) => lv(p, i) !== null).length,
      levelCounts: LV.map((_, k) => ppl.filter((p) => lv(p, i) === k).length),
      newlyHatched: ppl.filter((p) => lv(p, i) !== null && lv(p, i - 1) === null),
      upgraded: ppl.filter((p) => lv(p, i) !== null && lv(p, i - 1) !== null && lv(p, i) > lv(p, i - 1)),
      top: ppl.map((p) => ({ p, v: p.wk.get(W[i]) || 0 })).filter((x) => x.v > 0).sort((a, b) => b.v - a.v),
    };
  }

  const fmt = {
    f1: (x) => (Math.round(x * 10) / 10).toLocaleString('zh-CN'),
    int: (x) => Math.round(x).toLocaleString('zh-CN'),
    pct: (x, d = 0) => `${(x * 100).toFixed(d)}%`,
    // 周一日期 MM-DD（UTC+8）
    week: (start) => new Date(start + TZ).toISOString().slice(5, 10),
    date: (t) => new Date(t + TZ).toISOString().slice(0, 10),
    datetime: (t) => new Date(t + TZ).toISOString().slice(0, 16).replace('T', ' '),
  };

  window.NW = {
    B, LV, RULES, DAY, WEEK,
    weeks, W, last, people,
    byLogin: new Map(people.map((p) => [p.login, p])),
    levelOf, ranksAt, weekSnapshot, vitalityScore, fmt,
    // 当前活力不达标的人：掉队在前，同档按活力升序
    lowVitality: () => people.filter((p) => p.vit && p.vit.status !== 'ok').sort((a, b) => (a.vit.status === b.vit.status ? 0 : a.vit.status === 'laggard' ? -1 : 1) || a.vit.v - b.vit.v),
    avatar: (login, size = 64) => `https://github.com/${encodeURIComponent(login)}.png?size=${size}`,
    summary: B.summary,
    now: B.now,
  };
})();
