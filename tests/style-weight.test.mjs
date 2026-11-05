// Scoring tests for RULES.style: edits to existing style files score less than logic; new files are never discounted.
// Run with: node --test tests/style-weight.test.mjs
import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';

const { RULES, computeBoard, styleShare, styleFactor } = vm.runInNewContext(
  `${fs.readFileSync(new URL('../engine.js', import.meta.url), 'utf8')}\n;({ RULES, computeBoard, styleShare, styleFactor })`,
);
const NOW = Date.parse('2026-11-04T12:00:00Z');
const author = { login: 'author', __typename: 'User' };
const empty = { totalCount: 0, nodes: [] };
const file = (path, additions, deletions = 0, changeType = 'MODIFIED') => ({ path, additions, deletions, changeType });
const added = (path, additions) => file(path, additions, 0, 'ADDED');
const pr = (number, files, extra = {}) => {
  const lines = files ? files.reduce((n, f) => n + f.additions + f.deletions, 0) : 40;
  return {
    number, author, createdAt: '2026-11-02T01:00:00Z', mergedAt: '2026-11-02T02:00:00Z', closedAt: null,
    mergedBy: author, additions: lines, deletions: 0, commits: { totalCount: 1, nodes: [] },
    reviews: empty, comments: empty, ...(files ? { files: { nodes: files } } : {}), ...extra,
  };
};
const bonusOf = (prs, rules = RULES) => computeBoard({ org: 'o', members: [], repos: [{ name: 'r', prs, issues: [] }] }, rules, NOW).people[0].bonusPr;

test('style share counts style file lines over PR lines', () => {
  assert.equal(styleShare(pr(1, [file('src/a.css', 30), file('src/b.scss', 10)]), RULES), 1);
  assert.equal(styleShare(pr(1, [file('src/a.css', 10), file('src/app.js', 30)]), RULES), 0.25);
  assert.equal(styleShare(pr(1, [file('tailwind.config.ts', 4), file('web/tailwind.config.cjs', 4)]), RULES), 1);
  assert.equal(styleShare(pr(1, [file('src/app.ts', 40)]), RULES), 0);
  assert.equal(styleShare(pr(1, [file('docs/css-guide.md', 40), file('src/scss.js', 1)]), RULES), 0);
});

test('missing file list or truncated list never raises the share', () => {
  assert.equal(styleShare(pr(1, null), RULES), 0);
  // Only part of the files fetched: the unseen lines count as non-style.
  assert.equal(styleShare(pr(1, [file('a.css', 10)], { additions: 40 }), RULES), 0.25);
});

test('style factor is weight for style-only PRs and scales linearly with style share', () => {
  const w = RULES.style.weight;
  assert.equal(styleFactor(pr(1, [file('src/app.js', 40)]), RULES), 1);
  assert.equal(styleFactor(pr(1, [file('src/app.css', 40)]), RULES), w);
  assert.equal(styleFactor(pr(1, [file('src/app.css', 10), file('src/app.js', 30)]), RULES), 1 - 0.25 * (1 - w));
});

test('same-size PRs score style-only < mixed < logic', () => {
  const logic = bonusOf([pr(1, [file('src/app.js', 40)])]);
  const mixed = bonusOf([pr(1, [file('src/app.css', 10), file('src/app.js', 30)])]);
  const style = bonusOf([pr(1, [file('src/app.css', 40)])]);
  assert.ok(style < mixed && mixed < logic, `${style} < ${mixed} < ${logic}`);
});

test('weight 1 disables the reduction', () => {
  const rules = { ...RULES, style: { ...RULES.style, weight: 1 } };
  assert.equal(bonusOf([pr(1, [file('src/app.css', 40)])], rules), bonusOf([pr(1, [file('src/app.js', 40)])], rules));
});

test('newly added style files are not discounted', () => {
  assert.equal(styleShare(pr(1, [added('src/a.css', 30), added('src/b.css', 10)]), RULES), 0);
  assert.equal(styleShare(pr(1, [file('src/a.css', 10, 0, 'COPIED')]), RULES), 0);
  assert.equal(bonusOf([pr(1, [added('src/a.css', 40)])]), bonusOf([pr(1, [file('src/app.js', 40)])]));
});

test('new component + new css + edit of an old css: only the old css share is discounted', () => {
  const files = [added('src/Card.tsx', 50), added('src/Card.css', 30), file('src/theme.css', 15, 5)];
  assert.equal(styleShare(pr(1, files), RULES), 0.2);
  assert.equal(styleFactor(pr(1, files), RULES), 1 - 0.2 * (1 - RULES.style.weight));
});

test('renamed and deleted style lines still count as style', () => {
  assert.equal(styleShare(pr(1, [file('src/a.css', 10, 0, 'RENAMED'), file('src/old.scss', 0, 10, 'DELETED'), file('src/app.js', 20)]), RULES), 0.5);
});
