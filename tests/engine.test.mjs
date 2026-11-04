import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';

const { RULES, computeBoard } = vm.runInNewContext(
  `${fs.readFileSync(new URL('../engine.js', import.meta.url), 'utf8')}\n;({ RULES, computeBoard })`,
);
const FIRST = '2026-08-01T12:00:00Z';
const LATEST = '2026-11-04T10:00:00Z';
const NOW = Date.parse('2026-11-04T12:00:00Z');
const author = { login: 'author', __typename: 'User' };
const collaborator = { login: 'collaborator', __typename: 'User' };
const comment = (createdAt, actor = collaborator) => ({ author: actor, createdAt });
const review = (submittedAt, actor = collaborator) => ({ author: actor, submittedAt });
const connection = (nodes) => ({ totalCount: nodes.length, nodes });
const pr = ({ reviews = [], comments = [], mergedAt = null, mergedBy = null } = {}) => ({
  number: 1, author, createdAt: FIRST, mergedAt, mergedBy, closedAt: null,
  additions: 1, deletions: 0, commits: { totalCount: 1, nodes: [] },
  reviews: connection(reviews), comments: connection(comments),
});
const issue = (comments) => ({
  number: 1, author, createdAt: FIRST, stateReason: null, comments: connection(comments),
});
const data = ({ prs = [], issues = [] }) => ({
  org: 'example', members: ['author', 'collaborator'], repos: [{ name: 'project', prs, issues }],
});

for (const scenario of [
  { name: 'PR reviews', prs: [pr({ reviews: [review(FIRST), review(LATEST)] })] },
  { name: 'PR comments', prs: [pr({ comments: [comment(FIRST), comment(LATEST)] })] },
  { name: 'merging a previously reviewed PR', prs: [pr({ reviews: [review(FIRST)], mergedAt: LATEST, mergedBy: collaborator })], currentActive: 2 },
  { name: 'issue comments', issues: [issue([comment(FIRST), comment(LATEST)])] },
]) {
  test(`repeated collaboration updates activity without repeating credit: ${scenario.name}`, () => {
    const board = computeBoard(data(scenario), RULES, NOW);
    const person = board.people.find((p) => p.login === collaborator.login);
    const currentWeek = board.weeks.at(-1);
    assert.equal(person.firstAt, Date.parse(FIRST));
    assert.equal(person.lastAt, Date.parse(LATEST));
    assert.equal(person.dormant, false);
    assert.equal(currentWeek.active, scenario.currentActive || 1);
    assert.equal(person.collab, 1);
    assert.equal(person.bonus, RULES.score.collab);
    assert.equal(person.weekly.size, 1);
    assert.equal(person.weekly.has(currentWeek.start), false);
  });
}

test('self, bot, ignored and undated collaboration do not update activity', () => {
  const ignored = { login: 'ignored', __typename: 'User' };
  const bot = { login: 'helper[bot]', __typename: 'Bot' };
  const board = computeBoard(data({ prs: [pr({
    reviews: [review(FIRST), review(null)],
    comments: [comment(LATEST, author), comment(LATEST, bot), comment(LATEST, ignored)],
  })] }), { ...RULES, ignoreLogins: [ignored.login] }, NOW);
  const person = board.people.find((p) => p.login === collaborator.login);
  assert.equal(person.lastAt, Date.parse(FIRST));
  assert.equal(person.dormant, true);
  assert.equal(board.people.find((p) => p.login === author.login).lastAt, Date.parse(FIRST));
  assert.equal(board.weeks.at(-1).active, 0);
  assert.equal(board.people.length, 2);
});
