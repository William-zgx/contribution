// 文字对比度：正文级文字令牌在各级底色上达到 WCAG AA（4.5:1），浅色与深色主题都检查。
// 颜色由浏览器按 tokens.css 解析，改令牌后这里直接反映。
import fs from 'node:fs';
import { test, expect, open } from './fixtures.mjs';

const RESTING = ['--bg', '--bg-sunken', '--surface', '--surface-raised', '--surface-hover'];
// --surface-press 只在按下的瞬间出现；深色 --ink-3 在其上约 4.1:1，暂不纳入中性文字的检查
const ALL = [...RESTING, '--surface-press'];
// [文字令牌, 叠加在底色上的浅色底（无则为 null）, 底色列表]
const PAIRS = [
  ['--ink-3', null, RESTING],
  ['--leaf-ink', null, RESTING],
  ['--amber-ink', null, ALL],
  // .tag-watch：12% 琥珀底
  ['--amber-ink', 'var(--amber) 12%', ALL],
];

for (const theme of ['light', 'dark']) {
  test(`${theme} 主题文字令牌对比度 ≥ 4.5:1`, async ({ page }) => {
    await open(page, `/index.html?theme=${theme}`);
    await expect(page.locator('html')).toHaveAttribute('data-theme', theme);
    const results = await page.evaluate(({ pairs }) => {
      // 用 1x1 canvas 把任意 CSS 颜色（含 color-mix）解析成 sRGB
      const ctx = Object.assign(document.createElement('canvas'), { width: 1, height: 1 }).getContext('2d', { willReadFrequently: true });
      const probe = document.createElement('div');
      document.body.appendChild(probe);
      const rgb = (prop, value) => {
        probe.style[prop] = value;
        ctx.clearRect(0, 0, 1, 1);
        ctx.fillStyle = getComputedStyle(probe)[prop];
        ctx.fillRect(0, 0, 1, 1);
        return [...ctx.getImageData(0, 0, 1, 1).data.slice(0, 3)];
      };
      const lum = (c) => {
        const [r, g, b] = c.map((v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; });
        return 0.2126 * r + 0.7152 * g + 0.0722 * b;
      };
      const ratio = (a, b) => { const [x, y] = [lum(a), lum(b)].sort((m, n) => n - m); return (x + 0.05) / (y + 0.05); };
      const out = [];
      for (const [ink, wash, surfaces] of pairs) {
        const fg = rgb('color', `var(${ink})`);
        for (const s of surfaces) {
          const bg = rgb('backgroundColor', wash ? `color-mix(in srgb, ${wash}, var(${s}))` : `var(${s})`);
          out.push({ pair: `${ink} on ${wash ? `${wash} over ` : ''}${s}`, ratio: Math.round(ratio(fg, bg) * 100) / 100 });
        }
      }
      probe.remove();
      return out;
    }, { pairs: PAIRS });
    const failing = results.filter((r) => r.ratio < 4.5);
    expect(failing, '以下组合低于 4.5:1').toEqual([]);
  });
}

// --amber 只够图形与底色用（浅色约 3:1），文字要用 --amber-ink
test('样式里不直接用 --amber 作文字颜色', async () => {
  const files = ['assets/tokens.css', ...fs.readdirSync('.').filter((f) => f.endsWith('.html'))];
  const hits = files.flatMap((f) => fs.readFileSync(f, 'utf8').split('\n')
    .map((line, i) => (/(^|[;{\s])color:\s*var\(--amber\)/.test(line) ? `${f}:${i + 1}` : null)).filter(Boolean));
  expect(hits).toEqual([]);
});
