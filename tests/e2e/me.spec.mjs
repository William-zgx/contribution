// 「我」：这个浏览器记住的账号。只存 localStorage，不是登录；浏览、搜索、分享都不改变它。
import { test, expect, open, BOARD, LAST, THIS_WEEK, weekValue, mag } from './fixtures.mjs';

const KEY = 'nwverse:contribution:me';
const P = BOARD.people;
const byLogin = new Map(P.map((p) => [p.login, p]));
const tw = (p) => weekValue(p, THIS_WEEK);
// 演示账号：前 20 名里本周有魔力的人；20 名外本周有魔力的人；本周 0 魔力的人
const inTop = P.find((p) => p.rank <= 20 && tw(p) > 0.005);
const outside = P.find((p) => p.rank > 25 && tw(p) > 0.005);
const zero = P.find((p) => p.rank > 20 && tw(p) <= 0.005 && p.level !== null);
const stored = (page) => page.evaluate((k) => localStorage.getItem(k), KEY);
const remember = (page, login) => page.addInitScript(([k, l]) => localStorage.setItem(k, JSON.stringify({ v: 1, login: l })), [KEY, login]);

test('顶栏「找到我」：搜账号、确认、记住；刷新仍在；撤销可回退', async ({ page }) => {
  await open(page, '/index.html');
  const btn = page.locator('#appbar .me-btn');
  await expect(btn).toContainText('找到我');
  await expect(page.locator('#meStrip')).toContainText('找到我');
  await btn.click();
  const pk = page.locator('.me-picker.on');
  await expect(pk.locator('input')).toBeFocused();
  await expect(pk).toContainText('输入账号查找');
  await pk.locator('input').fill('no-such-frog');
  await expect(pk).toContainText('当前公开快照未找到');
  await pk.locator('input').fill(outside.login);
  // 完全匹配排第一；回车只进确认区，不直接保存
  await expect(pk.locator('.cmdk-item').first()).toContainText(outside.login);
  await page.keyboard.press('Enter');
  await expect(pk.locator('.pk-confirm')).toContainText(`@${outside.login}`);
  await expect(pk.locator('.pk-confirm')).toContainText(`总榜 #${outside.rank}`);
  expect(await stored(page)).toBeNull();
  await pk.locator('[data-pk="save"]').click();
  await expect(page.locator('.me-picker.on')).toHaveCount(0);
  await expect(btn).toContainText(`我 · @${outside.login}`);
  expect(JSON.parse(await stored(page))).toEqual({ v: 1, login: outside.login });
  // 首页摘要：本周魔力按所选周取值
  const strip = page.locator('#meStrip');
  await expect(strip).toContainText(`@${outside.login}`);
  await expect(strip).toContainText(`+${mag(tw(outside))}`);
  const weekBoard = P.filter((p) => tw(p) > 0).sort((a, b) => tw(b) - tw(a) || a.login.localeCompare(b.login));
  await expect(page.locator('#board .lrow.is-me')).toHaveCount(weekBoard.findIndex((p) => p.login === outside.login) < 10 ? 1 : 0);
  // 撤销回到未设置
  await page.locator('.toast.on .toast-act').click();
  await expect(btn).toContainText('找到我');
  expect(await stored(page)).toBeNull();
  // 再记一次，刷新后还在
  await page.evaluate(([k, l]) => localStorage.setItem(k, JSON.stringify({ v: 1, login: l })), [KEY, outside.login]);
  await page.reload();
  await expect(page.locator('html')).not.toHaveClass(/is-booting/);
  await expect(page.locator('#appbar .me-btn')).toContainText(`我 · @${outside.login}`);
});

test('排行榜：摘要显示名次，20 名外「定位我」展开并高亮，筛选排除时说明', async ({ page }) => {
  await remember(page, outside.login);
  await open(page, '/ranking.html');
  const sum = page.locator('#meSum');
  await expect(sum).toContainText(`#${outside.rank}`);
  await expect(sum).toContainText('未在当前前 20 条中');
  await expect(page.locator('#lbCard [data-key]')).toHaveCount(20);
  await sum.locator('[data-me="locate"]').click();
  const row = page.locator('#lbCard .lrow.is-me');
  await expect(row).toHaveCount(1);
  await expect(row).toHaveAttribute('data-key', outside.login);
  await expect(row).toContainText('我');
  await expect(page.locator('#lbCard [data-key]').first()).toHaveAttribute('data-key', 'frog-01'); // 排序不变
  // 本周榜：按本周名次
  const weekRank = P.filter((p) => tw(p) > 0.005).sort((a, b) => tw(b) - tw(a) || a.login.localeCompare(b.login)).findIndex((p) => p.login === outside.login) + 1;
  await page.locator('#lbCard button', { hasText: /^本周$/ }).first().click();
  await expect(sum).toContainText(`#${weekRank}`);
  await expect(sum).toContainText('我的本周名次');
  // 一个把我排除掉的筛选：摘要不插行、不冒充
  await page.locator('#lbCard button', { hasText: /^总榜$/ }).first().click();
  await page.locator('#q').fill('frog-01');
  await expect(sum).toContainText('当前筛选未包含你');
  await sum.locator('[data-me="clear"]').click();
  await expect(page.locator('#q')).toHaveValue('');
  await expect(page.locator('#lbCard .lrow.is-me')).toHaveCount(1);
});

test('排行榜：本周没有魔力就没有本周名次，不拿总榜名次冒充', async ({ page }) => {
  test.skip(!zero, '测试数据里没有本周 0 魔力的人');
  await remember(page, zero.login);
  await open(page, '/ranking.html?win=week');
  const sum = page.locator('#meSum');
  await expect(sum).toContainText('暂无本周名次');
  await sum.locator('[data-me="all"]').click();
  await expect(page).not.toHaveURL(/win=/);
  await expect(sum).toContainText(`#${zero.rank}`);
  await expect(page.locator('#lbCard .lrow.is-me')).toHaveCount(1);
});

test('状态筛选写回地址，清除后刷新不再带回来', async ({ page }) => {
  await open(page, '/ranking.html?flag=lag');
  await expect(page.locator('.chip[data-v="lag"]')).toHaveAttribute('aria-pressed', 'true');
  await page.locator('.chip[data-v="lag"]').click();
  await expect(page).not.toHaveURL(/flag=/);
  await page.reload();
  await expect(page.locator('html')).not.toHaveClass(/is-booting/);
  await expect(page.locator('.chip[data-v="lag"]')).toHaveAttribute('aria-pressed', 'false');
  // 跨页导航不带榜单参数
  await page.locator('.chip[data-v="watch"]').click();
  await expect(page).toHaveURL(/flag=watch/);
  await page.locator('#appbar .nav a[data-screen="c1"]').click();
  await expect(page).toHaveURL(/index\.html$/);
});

test('档案页：没带 #u= 时打开我的档案；#u= 永远优先；看别人不换「我」', async ({ page }) => {
  await remember(page, inTop.login);
  await open(page, '/profile.html');
  const body = page.locator('.drawer.on #pfBody');
  await expect(body).toContainText(inTop.login);
  await expect(body.locator('.me-tag')).toContainText('我');
  await expect(body).toContainText('不再记住');
  await expect(page.locator('#pfMe')).toBeEmpty();
  await expect(page).toHaveURL(new RegExp(`#u=${inTop.login}`));
  // 明确指定别人
  await page.goto('/profile.html#u=frog-03');
  await expect(body).toContainText('frog-03');
  await expect(body).toContainText('记为我的账号');
  await expect(body).toContainText(`将替换当前记住的 @${inTop.login}`);
  await expect(page.locator('#appbar .me-btn')).toContainText(`我 · @${inTop.login}`);
  expect(JSON.parse(await stored(page)).login).toBe(inTop.login);
  // 「返回我的档案」
  await body.locator('[data-action="me-go"]').click();
  await expect(body).toContainText(inTop.login);
  // 关闭抽屉：不自动重开，入口变成「我的档案」
  await page.keyboard.press('Escape');
  await expect(page.locator('.drawer.on')).toHaveCount(0);
  await expect(page.locator('#pfMe')).toContainText('我的档案');
});

test('在别人的档案里「记为我的账号」会替换；「不再记住」清掉本地偏好', async ({ page }) => {
  await remember(page, inTop.login);
  await open(page, '/profile.html#u=frog-03');
  const body = page.locator('.drawer.on #pfBody');
  await body.locator('[data-me-remember="frog-03"]').click();
  expect(JSON.parse(await stored(page)).login).toBe('frog-03');
  await expect(page.locator('#appbar .me-btn')).toContainText('我 · @frog-03');
  await expect(body.locator('.me-tag')).toContainText('我');
  await expect(page.locator('#rows .lrow.is-me')).toHaveAttribute('data-login', 'frog-03');
  await body.locator('[data-action="me-forget"]').click();
  expect(await stored(page)).toBeNull();
  await expect(page.locator('#appbar .me-btn')).toContainText('找到我');
  await expect(body).toContainText('记为我的账号');
  await expect(body).toContainText(`frog-03`); // 清除偏好不等于关闭档案
  await expect(page.locator('#rows .lrow.is-me')).toHaveCount(0);
});

test('⌘K：「我的」分组在最前；搜人只打开档案，不改变记住的账号', async ({ page }) => {
  await remember(page, inTop.login);
  await open(page, '/index.html');
  await page.keyboard.press('ControlOrMeta+k');
  const box = page.locator('.cmdk.on:not(.me-picker)');
  await expect(box.locator('.cmdk-group').first()).toHaveText('我的');
  await expect(box.locator('.cmdk-item').first()).toContainText(`我的档案 · @${inTop.login}`);
  await expect(box.locator('.cmdk-item[aria-selected="true"]')).not.toContainText('不再记住');
  await box.locator('input').fill('frog-07');
  await page.keyboard.press('Enter');
  await expect(page).toHaveURL(/profile\.html.*#u=frog-07/);
  expect(JSON.parse(await stored(page)).login).toBe(inTop.login);
  // 「我的总榜名次」跳到排行榜并定位
  await page.goto('/index.html');
  await expect(page.locator('html')).not.toHaveClass(/is-booting/);
  await page.locator('#appbar .me-btn').click();
  await page.locator('#appbar .me-menu.on [data-action="me-rank"]').click();
  await expect(page).toHaveURL(/ranking\.html/);
  await expect(page.locator('#lbCard .lrow.is-me')).toHaveAttribute('data-key', inTop.login);
});

test('记住的账号不在快照里：说明未找到，不显示零分，可重新选择', async ({ page }) => {
  await remember(page, 'old-login');
  await open(page, '/index.html');
  await expect(page.locator('#appbar .me-btn')).toContainText('@old-login');
  await expect(page.locator('#meStrip')).toContainText('未找到你记住的 @old-login');
  await expect(page.locator('#meStrip')).not.toContainText('0.0');
  await page.goto('/profile.html');
  await expect(page.locator('html')).not.toHaveClass(/is-booting/);
  await expect(page.locator('.drawer.on')).toHaveCount(0);
  await expect(page.locator('#pfMe')).toContainText('未找到');
  await page.locator('#pfMe [data-action="me-pick"]').click();
  await expect(page.locator('.me-picker.on input')).toBeFocused();
});

test('坏掉的本地记录按未设置处理，页面照常加载', async ({ page }) => {
  await page.addInitScript((k) => localStorage.setItem(k, '{not json'), KEY);
  await open(page, '/ranking.html');
  await expect(page.locator('#appbar .me-btn')).toContainText('找到我');
  await expect(page.locator('#meSum')).toContainText('找到我');
});
