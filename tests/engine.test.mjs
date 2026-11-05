import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import test from 'node:test';

const { RULES, computeBoard, weeklyScore } = vm.runInNewContext(
  `${fs.readFileSync(new URL('../engine.js', import.meta.url), 'utf8')}\n;({ RULES, computeBoard, weeklyScore })`,
);
const close = (actual, expected) => assert.ok(Math.abs(actual - expected) < 1e-10, `${actual} != ${expected}`);
const TIME = '2026-11-03T00:00:00Z';
const author = { login: 'contributor', __typename: 'User' };
const empty = () => ({ totalCount: 0, nodes: [] });
function pr(number, time = TIME, model = '') {
  return {
    number, author, createdAt: time, mergedAt: time, closedAt: time,
    additions: 999, deletions: 0, reviews: empty(), comments: empty(),
    commits: { totalCount: 1, nodes: [{ commit: { authors: { nodes: [{ name: model }] } } }] },
  };
}
function issue(number, time = TIME) {
  return { number, author, createdAt: time, stateReason: null, comments: empty() };
}
function person(prs, issues = [], now = Date.parse(TIME)) {
  return computeBoard({ org: 'example', members: [], repos: [{ name: 'project', prs, issues }] }, RULES, now).people[0];
}

test('independent curves match the agreed examples and handle empty categories', () => {
  const cases = [[0, 0, 0], [20, 0, 12], [0, 10, 5], [10, 10, 12.5], [20, 10, 17],
    [20, 100, 12 + 100 / 11], [40, 10, 120 / 7 + 5], [40, 100, 120 / 7 + 100 / 11]];
  for (const [p, c, expected] of cases) close(weeklyScore(p, 0, c).bonus, expected);
});

test('more PRs or collaborations increase totals with diminishing returns and separate bounds', () => {
  for (const field of ['pr', 'collab']) {
    let previous = weeklyScore(field === 'pr' ? 0 : 20, 0, field === 'collab' ? 0 : 10);
    let previousGain = Infinity;
    for (let n = 1; n <= 200; n++) {
      const score = weeklyScore(field === 'pr' ? n : 20, 0, field === 'collab' ? n : 10);
      const gain = score.bonus - previous.bonus;
      assert.ok(gain > 0 && gain < previousGain);
      close(score[field === 'pr' ? 'collab' : 'pr'], previous[field === 'pr' ? 'collab' : 'pr']);
      assert.ok(score.pr + score.model < 30 && score.collab < 10 && score.bonus < 40);
      previous = score;
      previousGain = gain;
    }
  }
});

test('computeBoard no longer dilutes six merged PRs when collaboration increases', () => {
  const prs = Array.from({ length: 6 }, (_, i) => pr(i + 1));
  const before = person(prs);
  const after = person(prs, Array.from({ length: 46 }, (_, i) => issue(i + 1)));
  assert.equal(after.merged, 6);
  assert.equal(after.collab, 46);
  close(before.bonusPr, 30 * 11.4 / 41.4);
  close(after.bonusPr, before.bonusPr);
  close(after.bonusCollab, 460 / 56);
  assert.ok(after.bonus > before.bonus);
  const more = person([...prs, pr(7)], Array.from({ length: 46 }, (_, i) => issue(i + 1)));
  assert.ok(more.bonus > after.bonus);
  close(more.bonusCollab, after.bonusCollab);
});

test('positive and negative model adjustments stay in the PR curve and reconcile with the total', () => {
  for (const [model, weight] of [['Claude Opus', 1.3], ['TRAE', 0.9], ['', 1]]) {
    const p = person([pr(1, TIME, model)], [issue(1)]);
    close(p.bonusPr + p.bonusModel, 30 * (1.9 * weight) / (30 + 1.9 * weight));
    close(p.bonusModel, p.bonusPr * (weight - 1));
    close(p.bonus, p.bonusPr + p.bonusModel + p.bonusCollab);
    close([...p.weekly.values()][0], p.bonus);
  }
  const mixed = person([pr(1, TIME, 'Claude Opus'), pr(2, TIME, 'TRAE')]);
  close(mixed.bonus, 30 * (1.9 * 2.2) / (30 + 1.9 * 2.2));
});

test('weeks reset at Monday 00:00 UTC+8 and future actions do not contribute', () => {
  const sunday = '2026-11-08T15:59:59Z';
  const monday = '2026-11-08T16:00:00Z';
  const prs = [pr(1, sunday), pr(2, monday)];
  const issues = [issue(1, sunday), issue(2, monday)];
  const before = person(prs, issues, Date.parse(sunday));
  const after = person(prs, issues, Date.parse(monday));
  const oneWeek = 30 * 1.9 / 31.9 + 10 / 11;
  close(before.bonus, oneWeek);
  close(after.bonus, 2 * oneWeek);
  assert.equal(after.weekly.size, 2);
  for (const [, value] of after.weekly) close(value, oneWeek);
});

test('repeated comments on one thread still count as one collaboration', () => {
  const thread = issue(1);
  thread.author = { login: 'other', __typename: 'User' };
  thread.comments = { totalCount: 2, nodes: [{ author, createdAt: TIME }, { author, createdAt: TIME }] };
  const p = person([pr(1)], [thread]);
  assert.equal(p.collab, 1);
  close(p.bonusCollab, 10 / 11);
});

test('curve budgets come from the supplied rules', () => {
  const rules = { ...RULES, weeklyScoreCaps: { pr: 20, collab: 5 } };
  const score = weeklyScore(20, 0, 5, rules);
  close(score.pr, 10);
  close(score.collab, 2.5);
});
