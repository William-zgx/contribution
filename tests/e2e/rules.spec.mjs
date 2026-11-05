// 规则页：八个小节齐全，手写说明在场，明细表可展开、可排序。
import { test, expect, open, BOARD } from './fixtures.mjs';

const SECTIONS = ['贡献度公式', '计分因子', '合入 PR 的模型分布', '合入率与警告线', '活力与掉队', 'M-Team 规则对照', '名词解释', '完整明细表', '口径与盲区'];

test('九个小节与目录 @mobile', async ({ page }) => {
  await open(page, '/rules.html');
  await expect(page.locator('main h2, h2')).toContainText(SECTIONS);
  await expect(page.locator('#toc a')).toHaveCount(SECTIONS.length);
  // 手写说明（修改 RULES 时要同步检查的部分）
  await expect(page.locator('#mapping')).toContainText('分享率');
  await expect(page.locator('#blindList li').first()).not.toBeEmpty();
  await expect(page.locator('#vitCard .vt-cases tbody tr')).toHaveCount(8);
});

test('明细表展开后列出所有人，点表头排序', async ({ page }) => {
  await open(page, '/rules.html');
  const toggle = page.locator('#dtToggle');
  await toggle.click();
  await expect(toggle).toHaveAttribute('aria-expanded', 'true');
  const rows = page.locator('#table tbody tr');
  await expect(rows).toHaveCount(BOARD.people.length);
  // 按协作排序：第一行应是协作最多的人
  const top = [...BOARD.people].sort((a, b) => b.collab - a.collab)[0];
  // 排序后表头会重绘、按钮名带上箭头，用 data-key 定位
  const btn = page.locator('#table thead button[data-key="collab"]');
  const header = page.locator('#table thead th:has(button[data-key="collab"])');
  await btn.click();
  await expect(header).not.toHaveAttribute('aria-sort', 'none');
  if ((await header.getAttribute('aria-sort')) === 'ascending') await btn.click();
  await expect(rows.first()).toContainText(top.login);
});

test('合入率散点每个有已收尾 PR 的人一个点，点击进入档案', async ({ page }) => {
  await open(page, '/rules.html');
  const withResolved = BOARD.people.filter((p) => p.resolved > 0).length;
  const dots = page.locator('#scatter [data-person]');
  await expect(dots).toHaveCount(withResolved);
  // 点重叠时后画的在上面，点最后一个保证可点到
  const login = await dots.last().getAttribute('data-person');
  await dots.last().click();
  await expect(page).toHaveURL(new RegExp(`profile\\.html.*#u=${login}`));
});

test('新公式页显示独立的 PR 与协作递减曲线', async ({ page }) => {
  await open(page, '/rules.html');
  const formula = page.locator('#formulaCard');
  await expect(formula).toContainText('30P ÷ (30 + P)');
  await expect(formula).toContainText('10C ÷ (10 + C)');
  await expect(formula).toContainText('10×3/(10+3) = 2.3');
  await expect(formula).toContainText('原始 PR 分');
});

test('排行榜 PR 计算器随 PR 数增加而单调增加', async ({ page }) => {
  await open(page, '/ranking.html');
  const setN = async (value) => page.evaluate((v) => {
    const el = document.querySelector('#fxN');
    el.value = String(v);
    el.dispatchEvent(new Event('input', { bubbles: true }));
  }, value);
  const total = async () => Number((await page.locator('#fxWeek b').last().textContent()).replace(',', ''));
  await setN(1);
  const one = await total();
  await setN(24);
  const many = await total();
  expect(many).toBeGreaterThan(one);
  await expect(page.locator('#fxCapNote')).toContainText('PR 递减额度 30');
  await expect(page.locator('#fxCapNote')).toContainText('协作另有 10');
});

test('排行榜计算器按已知 PR 输入得到递减后的数值', async ({ page }) => {
  await open(page, '/ranking.html');
  const setValue = async (selector, value) => page.evaluate(([s, v]) => {
    const el = document.querySelector(s);
    el.value = String(v);
    el.dispatchEvent(new Event('input', { bubbles: true }));
  }, [selector, value]);
  await setValue('#fxLines', 0);
  await setValue('#fxCommits', 1);
  await page.locator('#fxModels .chip').filter({ hasText: 'Claude Opus' }).click();
  await setValue('#fxN', 10);
  const values = await page.locator('#fxWeek b').allTextContents();
  const prScore = Number(values[0].replace(',', '.'));
  const total = Number(values.at(-1).replace(',', '.'));
  // 每个 PR 的原始分为 (1 + 0.15·log₂2)×1.3 = 1.495；
  // 10 个 PR 的 P=14.95，30P/(30+P)≈9.98，页面显示 10.0。
  expect(prScore).toBeCloseTo(10, 1);
  expect(total).toBeCloseTo(10, 1);
});
