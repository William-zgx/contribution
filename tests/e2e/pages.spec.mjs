// 各页主要交互，数字与测试数据逐一核对。
import { test, expect, open, BOARD, RULES, LAST, THIS_WEEK, weekValue, mag } from './fixtures.mjs';

const P = BOARD.people;
const byLogin = new Map(P.map((p) => [p.login, p]));

test.describe('本周', () => {
  test('KPI 显示本周值，周选择器可切到前一周再回来 @mobile', async ({ page }) => {
    await open(page, '/index.html');
    const kpis = page.locator('#heroKpis');
    await expect(kpis).toContainText(String(BOARD.weeks[LAST].active));
    await expect(kpis).toContainText(String(BOARD.weeks[LAST].merged));
    const head = await page.locator('#headline').textContent();
    await page.locator('#wk').focus();
    await page.keyboard.press('ArrowLeft');
    await expect(page).toHaveURL(/[?&]week=/);
    await expect(kpis).toContainText(String(BOARD.weeks[LAST - 1].merged));
    await expect(page.locator('#headline')).not.toHaveText(head);
    await page.keyboard.press('t');
    await expect(page).not.toHaveURL(/[?&]week=/);
    await expect(kpis).toContainText(String(BOARD.weeks[LAST].merged));
  });

  test('本周魔力榜按本周魔力排序，名字可进入档案', async ({ page }) => {
    const top = [...P].map((p) => ({ p, v: weekValue(p, THIS_WEEK) })).filter((x) => x.v > 0).sort((a, b) => b.v - a.v)[0];
    await open(page, '/index.html');
    const first = page.locator('#board .lrow').first();
    await expect(first).toContainText(top.p.login);
    await expect(first).toContainText(mag(top.v));
    await first.click();
    await expect(page).toHaveURL(new RegExp(`profile\\.html.*#u=${top.p.login}`));
  });
});

test.describe('排行榜', () => {
  test('总榜 / 本周 / 近 4 周切换改变排序', async ({ page }) => {
    await open(page, '/ranking.html');
    const rows = page.locator('#lbCard [data-key]');
    await expect(rows.first()).toHaveAttribute('data-key', 'frog-01');
    const weekTop = [...P].sort((a, b) => weekValue(b, THIS_WEEK) - weekValue(a, THIS_WEEK))[0];
    await page.locator('#lbCard').getByRole('radio', { name: '本周' }).or(page.locator('#lbCard').getByRole('tab', { name: '本周' })).or(page.locator('#lbCard button', { hasText: /^本周$/ })).first().click();
    await expect(rows.first()).toHaveAttribute('data-key', weekTop.login);
  });

  test('筛选组织外、搜索、点击打开档案', async ({ page }) => {
    await open(page, '/ranking.html');
    await page.locator('.chip[data-g="mem"][data-v="o"]').click();
    await expect(page.locator('#lbMeta')).toContainText(String(BOARD.summary.outsiders));
    await page.locator('.chip[data-g="mem"][data-v="all"]').click();
    await page.keyboard.press('/');
    await expect(page.locator('#q')).toBeFocused();
    await page.locator('#q').fill('frog-07');
    await expect(page.locator('#lbCard [data-key]')).toHaveCount(1);
    await page.locator('#lbCard [data-key="frog-07"]').click();
    await expect(page).toHaveURL(/profile\.html.*#u=frog-07/);
  });

  test('新手异常筛选可用', async ({ page }) => {
    await open(page, '/ranking.html');
    const chip = page.locator('.chip[data-g="flags"][data-v="a"]');
    await expect(chip).toContainText(String(BOARD.summary.anomaly));
    await chip.click();
    await expect(chip).toHaveAttribute('aria-pressed', 'true');
  });
});

test.describe('档案', () => {
  test('按 #u= 打开，←/→ 按名次换人，Esc 关闭 @mobile', async ({ page }) => {
    const p = byLogin.get('frog-03');
    await open(page, '/profile.html#u=frog-03');
    const head = page.locator('.drawer.on #pfBody');
    await expect(head).toContainText('frog-03');
    await expect(page.locator('#pfMag')).toContainText(mag(p.bonus));
    await page.keyboard.press('ArrowRight');
    await expect(page).toHaveURL(/#u=frog-04/);
    await expect(head).toContainText('frog-04');
    await page.keyboard.press('ArrowLeft');
    await expect(head).toContainText('frog-03');
    await page.keyboard.press('Escape');
    await expect(page.locator('.drawer.on')).toHaveCount(0);
  });
});

test.describe('孵化台', () => {
  test('零贡献者看板显示空图表且仍可交互 @mobile', async ({ page }) => {
    const board = structuredClone(BOARD);
    board.people = [];
    board.weeks = [];
    for (const [key, value] of Object.entries(board.summary)) {
      board.summary[key] = Array.isArray(value) ? (key === 'levelCounts' ? value.map(() => 0) : []) : 0;
    }
    await page.route('**/data/board.json', (route) => route.fulfill({ json: board }));
    await open(page, '/hatchery.html');
    await expect(page.locator('.boot-error')).toHaveCount(0);
    await expect(page.locator('#headline')).toContainText('0 人在孵化');
    await expect(page.locator('#funnel')).toContainText('暂无贡献记录');
    await expect(page.locator('#cohort')).toContainText('暂无贡献记录');
    await expect(page.locator('#coPanel')).toBeHidden();
    await expect(page.locator('#rules h4')).toHaveCount(3);
    await page.locator('#coSeg').getByText('占比', { exact: true }).click();
    await expect(page.locator('#cohort')).toContainText('暂无贡献记录');
    await page.keyboard.press('u');
    await expect(page.locator('#foldBtn')).toHaveAttribute('aria-expanded', 'true');
    await expect(page.locator('#foldIn .rows .lrow')).toHaveCount(0);
  });

  test('没有考核中的蛙卵时显示空状态，历史贡献与交互仍可用 @mobile', async ({ page }) => {
    const board = structuredClone(BOARD);
    board.people = board.people.filter((p) => p.newbie.status !== 'pending' || p.level !== null);
    Object.assign(board.summary, {
      contributors: board.people.length,
      memberContributors: board.people.filter((p) => p.member).length,
      outsiders: board.people.filter((p) => !p.member).length,
      pending: 0,
    });
    await page.route('**/data/board.json', (route) => route.fulfill({ json: board }));

    await open(page, '/hatchery.html');
    await expect(page.locator('.boot-error')).toHaveCount(0);
    await expect(page.locator('#headline')).toContainText('0 人在孵化');
    await expect(page.locator('#heroSide')).toContainText('当前没有考核中的蛙卵');
    await expect(page.locator('#soonGo')).toHaveCount(0);
    await expect(page.locator('#board .lane-empty')).toHaveCount(3);
    await expect(page.locator('#rules h4')).toHaveCount(3);
    await expect(page.locator('#lede')).toContainText(`${board.people.length} 位贡献者`);
    const failed = board.people.filter((p) => p.newbie.status === 'failed' && p.level === null).length;
    await page.keyboard.press('u');
    await expect(page.locator('#foldBtn')).toHaveAttribute('aria-expanded', 'true');
    await expect(page.locator('#foldIn .rows .lrow')).toHaveCount(failed);
  });

  test('蛙卵逐个列出，三组人数之和等于考核中人数', async ({ page }) => {
    const pending = P.filter((p) => p.newbie.status === 'pending' && p.level === null).length;
    await open(page, '/hatchery.html');
    await expect(page.locator('#headline')).toContainText(String(pending));
    await expect(page.locator('#board article.egg')).toHaveCount(pending);
  });
});

test.describe('形态池', () => {
  test('每级人数与数据一致，空等级显示虚位以待', async ({ page }) => {
    await open(page, '/pond.html');
    await expect(page.locator('#headline')).toContainText(String(BOARD.summary.hatched));
    const vacant = BOARD.summary.levelCounts.filter((n) => n === 0).length;
    if (vacant) await expect(page.locator('#ladder')).toContainText('虚位以待');
  });
});

test('档案页不带 #u= 且没记住账号时停在落地页，不打开任何人', async ({ page }) => {
  await open(page, '/profile.html');
  await expect(page.locator('.drawer.on')).toHaveCount(0);
  await expect(page.locator('#pfMe')).toContainText('找到我的档案');
  await expect(page.locator('h2').first()).toContainText('贡献者档案');
});

// 活力：按 RULES.vitality 在测试里独立重算一遍，与页面对照
const DAY = 86400000, WEEK = 7 * DAY;
function vitality(p) {
  const V = RULES.vitality, w = V.weights;
  if (BOARD.now - p.firstAt < RULES.newbie.days * DAY) return null;
  const weekly = BOARD.weeks.map((_, k) => weekValue(p, BOARD.weeks[LAST - k].start));
  const n = Math.max(1, Math.min(V.weeks, Math.ceil((BOARD.now - p.firstAt) / WEEK)));
  let sum = 0, norm = 0, active = 0;
  for (let k = 0; k < n; k++) { const wt = 2 ** (-k / V.halfLife); sum += weekly[k] * wt; norm += wt; if (weekly[k] > 0) active++; }
  const quiet = weekly.findIndex((m) => m > 0);
  const days = Math.floor((BOARD.now - p.lastAt) / DAY);
  const v = 100 * (w.recent * Math.min(1, sum / (V.pace * norm))
    + w.steady * active / n
    + w.history * Math.min(1, Math.log1p(p.bonus) / Math.log1p(V.historyRef)) * 2 ** (-(quiet < 0 ? Infinity : quiet) / V.creditHalfLife)
    + w.action * Math.max(0, 1 - days / RULES.dormantDays));
  return { v, status: v < V.laggard ? 'laggard' : v < V.watch ? 'watch' : 'ok' };
}
const VIT = P.map((p) => ({ p, r: vitality(p) })).filter((x) => x.r);
const lagN = VIT.filter((x) => x.r.status === 'laggard').length;
const watchN = VIT.filter((x) => x.r.status === 'watch').length;

test('首页活力预警：人数与独立重算一致，掉队在前，链接带筛选进入排行榜', async ({ page }) => {
  await open(page, '/index.html');
  const evo = page.locator('#evo');
  await expect(evo).toContainText(`活力预警 ${lagN + watchN}`);
  await expect(evo).toContainText(`掉队 ${lagN} · 观察 ${watchN}`);
  const rows = evo.locator('.upc.lag');
  await expect(rows).toHaveCount(Math.min(6, lagN + watchN));
  const lowest = VIT.filter((x) => x.r.status === 'laggard').sort((a, b) => a.r.v - b.r.v)[0];
  if (lowest) await expect(rows.first()).toHaveAttribute('data-login', lowest.p.login);
  const never = BOARD.summary.members - BOARD.summary.memberContributors;
  if (never > 0) await expect(evo.locator('.never')).toContainText(String(never));
  if (lagN) {
    await evo.locator('.lag-links a', { hasText: '掉队' }).click();
    await expect(page).toHaveURL(/ranking\.html\?flag=lag/);
    await expect(page.locator('.chip[data-v="lag"]')).toHaveAttribute('aria-pressed', 'true');
    await expect(page.locator('#lbCard [data-key]')).toHaveCount(lagN);
  }
});

test('排行榜观察筛选人数与独立重算一致', async ({ page }) => {
  await open(page, '/ranking.html?flag=watch');
  await expect(page.locator('#lbCard [data-key]')).toHaveCount(watchN);
});

test('档案页显示活力分与四项构成', async ({ page }) => {
  const x = VIT.sort((a, b) => a.r.v - b.r.v)[0];
  await open(page, `/profile.html#u=${x.p.login}`);
  const sec = page.locator('.drawer.on section[aria-label="活力"]');
  await expect(sec.locator('.vit-score')).toHaveText((Math.round(x.r.v * 10) / 10).toFixed(1));
  await expect(sec.locator('.vit-row')).toHaveCount(4);
});
