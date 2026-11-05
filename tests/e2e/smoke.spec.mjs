// 六个页面都能启动：无报错、导航正确、启动无布局偏移、主题参数生效、只请求本站资源、启动脚本与数据并行下载。
import { test, expect, open, PAGES, NAV } from './fixtures.mjs';

for (const pg of PAGES) {
  test(`${pg.label}页能加载 @mobile`, async ({ page, external, isMobile }) => {
    await open(page, `/${pg.file}`);
    await expect(page.locator('.boot-error')).toHaveCount(0);
    await expect(page.locator('h1, h2').first()).not.toBeEmpty();
    // 桌面看顶栏，手机看底部标签栏；当前页高亮
    const nav = isMobile ? page.locator('.tabbar') : page.locator('#appbar .nav');
    await expect(nav).toBeVisible();
    await expect(nav.locator('a')).toHaveCount(NAV.length);
    for (const other of NAV) await expect(nav.locator(`a[data-screen="${other.id}"]`)).toHaveAttribute('href', other.file);
    if (pg.nav === false) await expect(nav.locator('[aria-current="page"]')).toHaveCount(0);
    else await expect(nav.locator('[aria-current="page"]')).toHaveAttribute('data-screen', pg.id);
    // 外部请求只允许 GitHub 头像（已被拦截）；不允许调用 GitHub API
    expect(external.filter((u) => !/^https:\/\/github\.com\/[^/]+\.png/.test(u))).toEqual([]);
  });
}

// 启动期间顶栏占住高度、正文隐藏到页面脚本填好再显示，所以首屏没有布局偏移（CLS 按 web-vitals 口径应低于 0.1）
for (const pg of PAGES) {
  test(`${pg.label}页启动时没有布局偏移 @mobile`, async ({ page }) => {
    await page.addInitScript(() => {
      window.__cls = 0;
      new PerformanceObserver((list) => {
        for (const e of list.getEntries()) if (!e.hadRecentInput) window.__cls += e.value;
      }).observe({ type: 'layout-shift', buffered: true });
    });
    await open(page, `/${pg.file}`);
    await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
    expect(await page.evaluate(() => window.__cls)).toBeLessThan(0.1);
  });
}

test('?theme=dark 切到暗色，导航时保留', async ({ page }) => {
  await open(page, '/index.html?theme=dark');
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await page.locator('#appbar .nav a[data-screen="c2"]').click();
  await expect(page).toHaveURL(/ranking\.html\?theme=dark/);
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
});

test('derive.js 与 kit.js 和 data/board.json 并行下载，且各只请求一次', async ({ page }) => {
  await open(page, '/index.html');
  const res = await page.evaluate(() => performance.getEntriesByType('resource')
    .map((e) => ({ path: new URL(e.name).pathname, start: e.startTime, end: e.responseEnd })));
  const board = res.find((r) => r.path === '/data/board.json');
  for (const path of ['/assets/derive.js', '/assets/kit.js']) {
    const hits = res.filter((r) => r.path === path);
    expect(hits, `${path} 只应请求一次（preload 被 load() 复用）`).toHaveLength(1);
    expect(hits[0].start, `${path} 不应等 board.json 返回才开始下载`).toBeLessThan(board.end);
  }
});

test('数据读取失败时给出提示与重新加载按钮', async ({ page, errors }) => {
  await page.route('**/data/board.json', (r) => r.fulfill({ status: 500, body: 'oops' }));
  await page.goto('/index.html');
  const box = page.locator('.boot-error');
  await expect(box).toBeVisible();
  await expect(box).toContainText('HTTP 500');
  await expect(box.getByRole('button', { name: '重新加载' })).toBeVisible();
  errors.length = 0; // 这个用例故意制造失败，boot.js 会 console.error
});

test('⌘K 搜索贡献者并打开档案', async ({ page }) => {
  await open(page, '/index.html');
  await page.keyboard.press('ControlOrMeta+k');
  const box = page.locator('.cmdk.on input');
  await expect(box).toBeFocused();
  await box.fill('frog-07');
  await page.keyboard.press('Enter');
  await expect(page).toHaveURL(/profile\.html.*#u=frog-07/);
});
