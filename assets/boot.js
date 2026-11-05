// 页面启动：读取 data/board.json，按顺序加载计分规则、派生指标、图标与组件库，最后执行页面脚本。
// 页面脚本写在 <script type="text/x-nw-page"> 里，数据就绪后才执行，所以可以直接使用 NW / NWK。
(function () {
  'use strict';
  const root = document.documentElement;

  // 主题在第一帧前写到 <html>，避免闪烁；规则与 kit.js 一致：?theme 参数优先，否则跟随系统
  const forced = new URLSearchParams(location.search).get('theme');
  root.dataset.theme = forced === 'light' || forced === 'dark' ? forced
    : matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  root.classList.add('is-booting');

  // 动态插入的脚本设 async=false：并行下载、按插入顺序执行
  const load = (src) => new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = src;
    s.async = false;
    s.onload = resolve;
    s.onerror = () => reject(new Error(`脚本加载失败：${src}`));
    document.head.appendChild(s);
  });
  const domReady = () => new Promise((r) => (document.readyState === 'loading' ? document.addEventListener('DOMContentLoaded', r, { once: true }) : r()));

  async function readBoard() {
    const r = await fetch('data/board.json', { cache: 'no-cache' });
    if (!r.ok) throw new Error(`读取 data/board.json 失败（HTTP ${r.status}）`);
    return r.json();
  }

  // derive.js 与 kit.js 要等 BOARD 写好才能执行，但下载不必等：先 preload，和 board.json 并行下载。
  // 执行顺序仍由下面的 load()（async=false）决定；preload 只提前下载，路径须与 load() 完全一致才会复用。
  for (const src of ['assets/derive.js', 'assets/kit.js']) {
    const l = document.createElement('link');
    l.rel = 'preload';
    l.as = 'script';
    l.href = src;
    document.head.appendChild(l);
  }

  async function start() {
    const [board] = await Promise.all([readBoard(), load('engine.js'), load('assets/icons.js')]);
    window.BOARD = board;
    await Promise.all([load('assets/derive.js'), load('assets/kit.js')]);
    await domReady();
    for (const old of document.querySelectorAll('script[type="text/x-nw-page"]')) {
      const s = document.createElement('script');
      s.textContent = old.textContent;
      old.replaceWith(s);
    }
    root.classList.remove('is-booting');
  }

  function fail(err) {
    console.error(err);
    root.classList.remove('is-booting');
    const show = () => {
      const box = document.createElement('div');
      box.className = 'boot-error';
      box.setAttribute('role', 'alert');
      box.innerHTML = '<b>页面没能加载出来</b><span></span><button type="button">重新加载</button>';
      box.querySelector('span').textContent = err && err.message ? err.message : String(err);
      box.querySelector('button').addEventListener('click', () => location.reload());
      document.body.prepend(box);
    };
    domReady().then(show);
  }

  start().catch(fail);
})();
