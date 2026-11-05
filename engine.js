// 贡献度计算引擎：页面（index.html）与上传脚本（scripts/upload.mjs）共用。
// 只依赖输入数据、规则与时间，不访问网络和 DOM。
'use strict';

// 规则常量：所有阈值与系数集中在这里，页面上的规则说明也由它生成。
const RULES = {
  // 周的切分时区（UTC+8，周一 00:00 开始）
  tzOffsetHours: 8,
  // PR（含模型系数）与协作分别递减计分，单周得分趋近各自上限。
  weeklyScoreCaps: { pr: 30, collab: 10 },
  score: {
    // 单个合入 PR：1 + lines × log10(1 + 改动行) + commits × log2(1 + commit 数)，再乘模型系数
    lines: 0.25,
    commits: 0.15,
    // 每参与一个他人的 PR 或 issue
    collab: 1,
  },
  // 按 commit 作者与共同作者（Co-Authored-By）的名字识别模型，PR 分乘以 weight。
  // 系数按组织偏好整体定档，不区分版本：Claude 强于 GPT；DeepSeek 胜在速度、Gemini 胜在成本，系数低于前两家。
  // 没有署名的 PR 绝大多数也由 agent 编写，署名与否主要取决于工具配置，所以各档与「无 AI 标注」只拉开小幅差距。
  // 同一个署名按列表顺序取第一个匹配，所以扣分工具与更具体的代号排在前面。
  // 一个 PR 出现多个模型时取系数最高的；出现系数低于 1 的扣分工具时按扣分计。
  models: [
    { key: 'trae', family: '其他', short: 'TRAE CLI', label: 'TRAE CLI', weight: 0.94, pattern: /\btrae\b/i },
    { key: 'opus', family: 'Claude', short: 'Opus', label: 'Claude Opus', weight: 1.18, pattern: /\bopus\b/i },
    { key: 'fable', family: 'Claude', short: 'Fable', label: 'Claude Fable', weight: 1.15, pattern: /\bfable\b/i },
    { key: 'sonnet', family: 'Claude', short: 'Sonnet', label: 'Claude Sonnet', weight: 1.12, pattern: /\bsonnet\b/i },
    { key: 'haiku', family: 'Claude', short: 'Haiku', label: 'Claude Haiku', weight: 1.06, pattern: /\bhaiku\b/i },
    { key: 'claude', family: 'Claude', short: '未注明型号', label: 'Claude 未注明型号', weight: 1.06, pattern: /\bclaude\b/i },
    { key: 'gptTop', family: 'GPT', short: 'Astra、Pro', label: 'GPT Astra / Pro', weight: 1.12, pattern: /\bgpt\b[\w. -]*?\b(astra|pro)\b/i },
    { key: 'gptSol', family: 'GPT', short: 'Sol', label: 'GPT Sol', weight: 1.09, pattern: /\bgpt\b[\w. -]*?\bsol\b/i },
    { key: 'gpt', family: 'GPT', short: 'Terra、Luna、mini 等，Codex 默认署名', label: 'GPT 其他', weight: 1.03, pattern: /\b(gpt|codex|openai|chatgpt)\b/i },
    { key: 'geminiPro', family: 'Gemini', short: 'Carbon、Argon、Pro', label: 'Gemini Carbon / Argon', weight: 1.06, pattern: /\bgemini\b[\w. -]*?\b(carbon|argon|ultra|pro)\b/i },
    { key: 'gemini', family: 'Gemini', short: 'Flash 等', label: 'Gemini 其他', weight: 1.03, pattern: /\bgemini\b/i },
    { key: 'deepseekPro', family: 'DeepSeek', short: 'Pro、Reasoner', label: 'DeepSeek Pro', weight: 1.06, pattern: /\bdeepseek\b[\w. -]*?\b(pro|reasoner|r\d)\b/i },
    { key: 'deepseek', family: 'DeepSeek', short: 'Flash 等', label: 'DeepSeek 其他', weight: 1.03, pattern: /\bdeepseek\b/i },
    { key: 'cursor', family: '其他', short: 'Cursor', label: 'Cursor', weight: 1, pattern: /\bcursor\b/i },
    { key: 'copilot', family: '其他', short: 'Copilot', label: 'Copilot', weight: 1, pattern: /\bcopilot\b/i },
  ],
  modelNone: { key: 'none', family: '其他', short: '无 AI 标注', label: '无 AI 标注', weight: 1 },
  // PR 打开超过这么多天仍未合入也未关闭，算作「未收尾」
  staleOpenDays: 14,
  // 样式改动减分：已有样式文件的改动行占 PR 改动行的比例为 s 时，PR 分（含模型系数）乘 1 − s × (1 − weight)。
  // 只改已有样式文件的 PR 乘 weight，不改已有样式文件的 PR 不变。样式文件按路径识别：pattern 匹配的扩展名与 Tailwind 配置。
  // 新增的文件（changeType 在 newFileTypes 里）按非样式计：新写页面、组件连同它的样式是新功能，不打折；
  // 修改、重命名、删除已有样式文件的行计入 s。
  // 改动文件超过上传脚本读取上限时，未读到的文件按非样式计，所以比例是下限。
  style: {
    weight: 0.5,
    newFileTypes: ['ADDED', 'COPIED'],
    pattern: /(\.(css|scss|sass|less|styl|stylus|pcss|postcss)|(^|\/)tailwind\.config\.[cm]?[jt]s)$/i,
  },
  newbie: {
    days: 30,
    merged: 3,
    activeWeeks: 2,
    // 考核期内开 PR 数达到 opened、合入比低于 rate，标记为「新手异常」；最近 graceHours 内开的 PR 不计
    anomaly: { opened: 10, rate: 0.3, graceHours: 48 },
  },
  // 合入率警告线：已收尾 PR 数超过 resolved 时，合入率需不低于 rate
  warnLines: [
    { resolved: 10, rate: 0.6 },
    { resolved: 50, rate: 0.7 },
    { resolved: 100, rate: 0.8 },
    { resolved: 200, rate: 0.9 },
  ],
  // 等级只看当前魔力，不设降级线。通过新手考核即为蝌蚪；没通过的人魔力达到第二级门槛也直接孵化
  levels: [
    { name: '蝌蚪', icon: 'tadpole', tagline: '通过新手考核，游进奶蛙宇宙', bonus: 0 },
    { name: '小奶蛙', icon: 'froglet', tagline: '长出脚蹼，能自己蹦了', bonus: 50 },
    { name: '奶蛙', icon: 'frog', tagline: '睁开洞悉一切的绿色大眼睛', bonus: 150 },
    { name: '大笑奶蛙', icon: 'laugh', tagline: '哟齁齁齁，秒开战斗脸', bonus: 400 },
    { name: '宇宙奶蛙', icon: 'cosmic', tagline: '技能超模，什么场合都能笑着收尾', bonus: 1000 },
  ],
  dormantDays: 40,
  // 达到该等级下标及以上免于冬眠标记
  dormantExemptLevel: 2,
  // 活力：综合近期产出、持续度、历史贡献与最近动作，0–100 分，用于找出不再贡献的人。只用于页面展示，不影响魔力与形态。
  // 活力 = 100 ×（recent × 近期产出 + steady × 持续度 + history × 历史信用 + action × 最近动作），四项各 0–1：
  //   近期产出 = min(1, 最近 weeks 周按周衰减（每 halfLife 周减半）的加权周均魔力 ÷ pace)
  //   持续度   = 最近 weeks 周里有魔力的周数占比（在组不满 weeks 周按实际周数）
  //   历史信用 = min(1, ln(1 + 累计魔力) ÷ ln(1 + historyRef)) × 0.5 ^ (连续无魔力周数 ÷ creditHalfLife)
  //   最近动作 = max(0, 1 − 距上次任何动作的天数 ÷ dormantDays)
  // 首次贡献未满 newbie.days 天的人不评。活力低于 laggard 记为掉队，低于 watch 记为观察。
  vitality: {
    weeks: 8,
    halfLife: 2,
    pace: 4,
    historyRef: 150,
    creditHalfLife: 10,
    weights: { recent: 0.35, steady: 0.25, history: 0.25, action: 0.15 },
    laggard: 20,
    watch: 40,
  },
  // 不计为有效 issue 的关闭原因
  invalidIssueReasons: ['NOT_PLANNED', 'DUPLICATE'],
  // GitHub 类型为 User、但实际是自动化的账号
  ignoreLogins: [],
  includeArchived: false,
  includeForks: false,
  // 不参与统计的仓库：看板仓库本身的 PR、issue 与数据提交都不算贡献
  excludeRepos: ['contribution'],
};

const DAY = 86400000;
const WEEK = 7 * DAY;

function weekStart(t, tzHours) {
  const offset = tzHours * 3600000;
  const days = Math.floor((t + offset) / DAY);
  // 1970-01-01 是周四，按周一为 0 计算
  const dow = (days + 3) % 7;
  return (days - dow) * DAY - offset;
}

function toTime(s) {
  return s ? Date.parse(s) : null;
}

// 已有样式文件的改动行 ÷ PR 改动行，0–1。新增的样式文件按非样式计；没有文件明细（旧数据、测试快照）时按 0 计
function styleShare(pr, rules) {
  const total = pr.additions + pr.deletions;
  if (!total || !pr.files?.nodes) return 0;
  let style = 0;
  for (const f of pr.files.nodes) {
    if (rules.style.newFileTypes.includes(f.changeType)) continue;
    if (rules.style.pattern.test(f.path)) style += f.additions + f.deletions;
  }
  return Math.min(1, style / total);
}

function styleFactor(pr, rules) {
  return 1 - styleShare(pr, rules) * (1 - rules.style.weight);
}

function countUpTo(sorted, t) {
  let n = 0;
  for (const x of sorted) {
    if (x > t) break;
    n++;
  }
  return n;
}

function prRawScore(lines, commits, rules) {
  return 1 + rules.score.lines * Math.log10(1 + lines) + rules.score.commits * Math.log2(1 + commits);
}

// 输入为当周原始分；PR 与模型加减使用同一系数，保留页面的分项展示。
function weeklyScore(pr, model, collab, rules = RULES) {
  const caps = rules.weeklyScoreCaps;
  const k = caps.pr / (caps.pr + pr + model);
  const result = {
    pr: k * pr,
    model: k * model,
    collab: caps.collab * collab / (caps.collab + collab),
  };
  result.bonus = result.pr + result.model + result.collab;
  return result;
}

function modelOf(text, rules) {
  return rules.models.find((x) => x.pattern.test(text)) || rules.modelNone;
}

// PR 内所有 commit 作者与共同作者的模型：有扣分工具（系数低于 1）时按它计，否则取系数最高的，系数相同取先出现的
function detectModel(pr, rules) {
  let best = null;
  for (const c of pr.commits?.nodes || []) {
    for (const a of c.commit?.authors?.nodes || []) {
      const m = modelOf(`${a.name || ''} ${a.email || ''}`, rules);
      if (m === rules.modelNone) continue;
      if (m.weight < 1) return m;
      if (!best || m.weight > best.weight) best = m;
    }
  }
  return best || rules.modelNone;
}

// data: { org, members: [login], repos: [{ name, prs: [PR node], issues: [Issue node] }] }
// 节点字段与页面 GraphQL 查询一致。返回值只依赖 data、rules、now。
function computeBoard(data, rules, now) {
  const tz = rules.tzOffsetHours;
  const ignore = new Set(rules.ignoreLogins);
  const members = new Set(data.members);
  const people = new Map();
  const weekActive = new Map();
  const weekMerged = new Map();
  // 合入 PR 按模型计数：key → { label, weight, count }
  const modelCounts = new Map();

  const human = (actor) => {
    if (!actor) return null;
    if (actor.__typename === 'Bot' || /\[bot\]$/i.test(actor.login) || ignore.has(actor.login)) return null;
    return actor.login;
  };
  const get = (login) => {
    let p = people.get(login);
    if (!p) {
      p = { login, member: members.has(login), prs: [], threads: new Map(), activityTimes: [], issuesFiled: 0 };
      people.set(login, p);
    }
    return p;
  };
  // 记录一次「参与他人工作」：同一个 PR 或 issue 只算一次，取最早时间
  const touch = (actor, t, key, owner) => {
    const login = human(actor);
    if (!login || login === owner || t == null) return;
    const p = get(login);
    // 每次有效协作都更新活动时间；线程去重只影响计分。
    p.activityTimes.push(t);
    const prev = p.threads.get(key);
    if (prev === undefined || t < prev) p.threads.set(key, t);
  };

  const stats = { prs: 0, merged: 0, mergedReviewed: 0, mergedSelf: 0, mergedAi: 0, truncated: 0, issues: 0 };

  for (const repo of data.repos) {
    for (const pr of repo.prs) {
      stats.prs++;
      if (pr.reviews.totalCount > pr.reviews.nodes.length || pr.comments.totalCount > pr.comments.nodes.length) {
        stats.truncated++;
      }
      const owner = human(pr.author);
      const key = `${repo.name}#${pr.number}`;
      const merged = toTime(pr.mergedAt);
      const closed = merged ? null : toTime(pr.closedAt);
      const lines = pr.additions + pr.deletions;
      const commits = pr.commits?.totalCount ?? 1;
      const model = detectModel(pr, rules);
      if (owner) {
        get(owner).prs.push({
          created: toTime(pr.createdAt),
          merged,
          closed,
          // 作者自己关闭视为撤回；closedBy 缺失（未查到关闭人）时按被他人关闭计
          withdrawn: closed !== null && human(pr.closedBy) === owner,
          lines,
          commits,
          model,
          // 样式系数乘在原始分上，模型加减随之按比例缩放
          raw: prRawScore(lines, commits, rules) * styleFactor(pr, rules),
        });
      }
      let reviewed = false;
      for (const r of pr.reviews.nodes) {
        const login = human(r.author);
        if (login && login !== owner) reviewed = true;
        touch(r.author, toTime(r.submittedAt), key, owner);
      }
      for (const c of pr.comments.nodes) touch(c.author, toTime(c.createdAt), key, owner);
      if (merged) {
        stats.merged++;
        if (reviewed) stats.mergedReviewed++;
        if (owner && human(pr.mergedBy) === owner) stats.mergedSelf++;
        if (model !== rules.modelNone) stats.mergedAi++;
        const mc = modelCounts.get(model.key) || { label: model.label, weight: model.weight, count: 0 };
        mc.count++;
        modelCounts.set(model.key, mc);
        touch(pr.mergedBy, merged, key, owner);
        const w = weekStart(merged, tz);
        weekMerged.set(w, (weekMerged.get(w) || 0) + 1);
      }
    }
    for (const issue of repo.issues) {
      stats.issues++;
      const owner = human(issue.author);
      const key = `${repo.name}!${issue.number}`;
      if (owner && !rules.invalidIssueReasons.includes(issue.stateReason)) {
        const p = get(owner);
        p.threads.set(key, toTime(issue.createdAt));
        p.activityTimes.push(toTime(issue.createdAt));
        p.issuesFiled++;
      }
      for (const c of issue.comments.nodes) touch(c.author, toTime(c.createdAt), key, owner);
    }
  }

  const levels = rules.levels;
  const nb = rules.newbie;
  const result = [];

  for (const p of people.values()) {
    const mergedPrs = p.prs.filter((x) => x.merged);
    const mergedTimes = mergedPrs.map((x) => x.merged).sort((a, b) => a - b);
    const threadTimes = [...p.threads.values()].sort((a, b) => a - b);
    // 动作：合入 PR 得分拆成规模部分 pr 与模型加减 model（扣分工具为负）；协作得分 collab
    const acts = [
      ...mergedPrs.map((x) => ({ t: x.merged, pr: x.raw, model: x.raw * (x.model.weight - 1), collab: 0 })),
      ...threadTimes.map((t) => ({ t, pr: 0, model: 0, collab: rules.score.collab })),
    ].sort((a, b) => a.t - b.t);
    const allTimes = [...p.prs.map((x) => x.created), ...acts.map((a) => a.t), ...p.activityTimes];
    const firstAt = Math.min(...allTimes);
    const lastAt = Math.max(...allTimes);
    for (const t of allTimes) {
      const w = weekStart(t, tz);
      if (!weekActive.has(w)) weekActive.set(w, new Set());
      weekActive.get(w).add(p.login);
    }

    // 截至 t 的魔力：逐周汇总后，PR 与协作分别递减计分。
    const scoreAt = (t) => {
      const weeks = new Map();
      for (const a of acts) {
        if (a.t > t) break;
        const w = weekStart(a.t, tz);
        let s = weeks.get(w);
        if (!s) weeks.set(w, (s = { pr: 0, model: 0, collab: 0 }));
        s.pr += a.pr;
        s.model += a.model;
        s.collab += a.collab;
      }
      const total = { pr: 0, model: 0, collab: 0, bonus: 0, weekly: new Map() };
      for (const [w, s] of weeks) {
        const score = weeklyScore(s.pr, s.model, s.collab, rules);
        total.pr += score.pr;
        total.model += score.model;
        total.collab += score.collab;
        total.weekly.set(w, score.bonus);
      }
      total.bonus = total.pr + total.model + total.collab;
      return total;
    };
    // 合入率 = 合入 ÷ 已收尾；已收尾 = 合入 + 被他人关闭 + 超期未合，作者自己关闭的（撤回）不计入
    const prStatsAt = (t) => {
      let merged = 0;
      let closed = 0;
      let withdrawn = 0;
      let stale = 0;
      let inflight = 0;
      for (const pr of p.prs) {
        if (pr.created > t) continue;
        if (pr.merged && pr.merged <= t) merged++;
        else if (pr.closed && pr.closed <= t) {
          if (pr.withdrawn) withdrawn++;
          else closed++;
        } else if (t - pr.created > rules.staleOpenDays * DAY) stale++;
        else inflight++;
      }
      const resolved = merged + closed + stale;
      return { merged, closed, withdrawn, stale, inflight, resolved, rate: resolved ? merged / resolved : null };
    };

    // 新手考核：首次贡献起 nb.days 天内，各项全部达标即通过
    const end = firstAt + nb.days * DAY;
    const evalAt = Math.min(now, end);
    let passAt = null;
    const windowWeeks = new Set();
    let windowMerged = 0;
    const events = [...mergedTimes.map((t) => [t, true]), ...p.activityTimes.map((t) => [t, false])].sort((x, y) => x[0] - y[0]);
    for (const [t, isMerge] of events) {
      if (t > evalAt) break;
      windowWeeks.add(weekStart(t, tz));
      if (isMerge) windowMerged++;
      if (passAt === null && windowMerged >= nb.merged && windowWeeks.size >= nb.activeWeeks) passAt = t;
    }
    const openedCutoff = Math.min(evalAt - nb.anomaly.graceHours * 3600000, end);
    const opened = p.prs.filter((x) => x.created <= openedCutoff);
    const openedMerged = opened.filter((x) => x.merged && x.merged <= evalAt).length;
    const anomaly = opened.length >= nb.anomaly.opened && openedMerged / opened.length < nb.anomaly.rate;
    const newbie = {
      status: passAt ? 'passed' : now < end ? 'pending' : 'failed',
      end,
      passAt,
      passDay: passAt ? Math.floor((passAt - firstAt) / DAY) + 1 : null,
      merged: countUpTo(mergedTimes, evalAt),
      activeWeeks: windowWeeks.size,
      daysLeft: Math.max(0, Math.ceil((end - now) / DAY)),
      anomaly,
      anomalyOpened: opened.length,
      anomalyMerged: openedMerged,
    };

    const cur = prStatsAt(now);
    const score = scoreAt(now);
    const collab = threadTimes.length;
    const weeksIn = (now - firstAt) / WEEK;
    // 形态只看当前魔力：通过新手考核，或魔力达到第二级门槛，即孵化；孵化后取魔力达到的最高一级
    let level = null;
    if (passAt !== null || score.bonus >= levels[1].bonus) {
      level = 0;
      while (level + 1 < levels.length && score.bonus >= levels[level + 1].bonus) level++;
    }
    const next = level !== null && level + 1 < levels.length ? { level: level + 1, bonus: levels[level + 1].bonus } : null;
    let warnLine = null;
    for (const line of rules.warnLines) if (cur.resolved > line.resolved) warnLine = line;
    const warn = warnLine !== null && cur.rate < warnLine.rate;
    const dormant = now - lastAt > rules.dormantDays * DAY && !(level !== null && level >= rules.dormantExemptLevel);

    // key → { label, count }
    const modelMix = new Map();
    for (const x of mergedPrs) {
      const mm = modelMix.get(x.model.key) || { label: x.model.label, count: 0 };
      mm.count++;
      modelMix.set(x.model.key, mm);
    }

    result.push({
      login: p.login,
      member: p.member,
      firstAt,
      lastAt,
      weeksIn,
      merged: mergedTimes.length,
      opened: p.prs.length,
      closedUnmerged: cur.closed,
      withdrawn: cur.withdrawn,
      stale: cur.stale,
      inflight: cur.inflight,
      resolved: cur.resolved,
      rate: cur.rate,
      collab,
      issuesFiled: p.issuesFiled,
      bonus: score.bonus,
      bonusPr: score.pr,
      bonusModel: score.model,
      bonusCollab: score.collab,
      weekly: score.weekly,
      activeWeeks: new Set([...mergedTimes, ...p.activityTimes].map((t) => weekStart(t, tz))).size,
      lines: mergedPrs.reduce((n, x) => n + x.lines, 0),
      commits: mergedPrs.reduce((n, x) => n + x.commits, 0),
      modelMix,
      newbie,
      level,
      next,
      warn,
      warnLine,
      dormant,
    });
  }

  result.sort((a, b) => b.bonus - a.bonus || b.merged - a.merged || a.login.localeCompare(b.login));
  result.forEach((p, i) => { p.rank = i + 1; });

  const allWeeks = [...weekActive.keys()];
  const weeks = [];
  if (allWeeks.length) {
    for (let w = Math.min(...allWeeks); w <= weekStart(now, tz); w += WEEK) {
      weeks.push({ start: w, active: weekActive.get(w)?.size || 0, merged: weekMerged.get(w) || 0 });
    }
  }

  const count = (f) => result.filter(f).length;
  return {
    org: data.org,
    repos: data.repos.map((r) => r.name),
    now,
    people: result,
    weeks,
    inactiveMembers: [...members].filter((m) => !people.has(m)).sort((a, b) => a.localeCompare(b)),
    summary: {
      ...stats,
      models: [...modelCounts.values()].sort((a, b) => b.count - a.count),
      contributors: result.length,
      members: members.size,
      memberContributors: count((p) => p.member),
      outsiders: count((p) => !p.member),
      // 孵化阶段：已孵化（含魔力补孵化）、蛙卵（考核中未孵化）、未孵化（考核未通过且魔力不够）
      hatched: count((p) => p.level !== null),
      pending: count((p) => p.level === null && p.newbie.status === 'pending'),
      failed: count((p) => p.level === null && p.newbie.status === 'failed'),
      anomaly: count((p) => p.newbie.anomaly),
      warn: count((p) => p.warn),
      dormant: count((p) => p.dormant),
      levelCounts: levels.map((_, i) => count((p) => p.level === i)),
    },
  };
}
