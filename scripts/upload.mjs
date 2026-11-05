#!/usr/bin/env node
// 拉取 GitHub 组织数据，计算人维度的贡献度，把页面、资源、引擎与 data/board.json 一次提交到发布分支。
// 用法：node scripts/upload.mjs [--dry-run]
//   --dry-run  只拉取和计算，结果写到 dist/board.json，不发布
// 环境变量见 README.md。依赖 Node.js 18 及以上，无第三方依赖。
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const ORG = process.env.ORG || 'nwverse';
const PAGES_REPO = process.env.PAGES_REPO || 'nwverse/contribution';
const PAGES_BRANCH = process.env.PAGES_BRANCH || 'gh-pages';
const DRY_RUN = process.argv.includes('--dry-run');
// 随数据一起发布的站点文件，保证页面与生成数据的引擎是同一版本
const SITE_FILES = [
  'index.html', 'ranking.html', 'profile.html', 'hatchery.html', 'pond.html', 'rules.html',
  'engine.js',
  'assets/boot.js', 'assets/derive.js', 'assets/icons.js', 'assets/kit.js', 'assets/tokens.css',
  '.nojekyll', 'favicon.svg', 'favicon-32.png', 'apple-touch-icon.png',
];

const engineSource = fs.readFileSync(path.join(ROOT, 'engine.js'), 'utf8');
const { RULES, computeBoard } = vm.runInNewContext(`${engineSource}\n;({ RULES, computeBoard })`);

const log = (msg) => console.log(`[${new Date().toISOString()}] ${msg}`);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ---------- GitHub GraphQL ----------

const GRAPHQL = 'https://api.github.com/graphql';

// GitHub 按查询中的嵌套连接计点：连接总数 ÷ 100 后四舍五入，最少 1 点。
// PR 有 review、评论、commit 3 个嵌套连接，每批 48 个编号约 145 个连接，只计 1 点。
// commit 读提交说明再解析 Co-Authored-By：若用 authors 连接，每个 commit 多 1 个连接，点数约为 4 倍。
const NESTED_LIMIT = 20;
const COMMIT_LIMIT = 5;
const BATCH_SIZE = 48;
const CONCURRENCY = 16;
const MAX_ATTEMPTS = 4;

const PR_FIELDS = `
  id number state createdAt mergedAt closedAt additions deletions
  author { login __typename }
  mergedBy { login __typename }
  reviews(first: ${NESTED_LIMIT}) { totalCount nodes { author { login __typename } submittedAt } }
  comments(first: ${NESTED_LIMIT}) { totalCount nodes { author { login __typename } createdAt } }
  commits(last: ${COMMIT_LIMIT}) { totalCount nodes { commit { author { name } message } } }`;
const ISSUE_FIELDS = `
  number state stateReason createdAt closedAt
  author { login __typename }
  comments(first: ${NESTED_LIMIT}) { totalCount nodes { author { login __typename } createdAt } }`;

// 成员、仓库与各仓库最新的 PR / issue 编号一次取回
const META_QUERY = `query($org: String!, $memberCursor: String, $repoCursor: String, $needMembers: Boolean!, $needRepos: Boolean!) {
  organization(login: $org) {
    membersWithRole(first: 100, after: $memberCursor) @include(if: $needMembers) {
      pageInfo { hasNextPage endCursor }
      nodes { login }
    }
    repositories(first: 100, after: $repoCursor, orderBy: {field: NAME, direction: ASC}) @include(if: $needRepos) {
      pageInfo { hasNextPage endCursor }
      nodes {
        name isArchived isFork
        pullRequests(first: 1, orderBy: {field: CREATED_AT, direction: DESC}) { totalCount nodes { number } }
        issues(first: 1, orderBy: {field: CREATED_AT, direction: DESC}) { totalCount nodes { number } }
      }
    }
  }
}`;

// 关闭未合入的 PR 由谁关闭：timelineItems 是嵌套连接，只对这类 PR 单独查询，主查询每批仍是 1 点
const CLOSER_BATCH = 100;
const CLOSER_QUERY = `query($ids: [ID!]!) {
  nodes(ids: $ids) {
    ... on PullRequest { id timelineItems(itemTypes: [CLOSED_EVENT], last: 1) { nodes { ... on ClosedEvent { actor { login __typename } } } } }
  }
}`;

// 合入 PR 的改动文件，供引擎按已有样式文件占比计分（changeType 区分新增与修改）：files 是嵌套连接，同样只对合入 PR 单独查询，每批 100 个 PR 计 1 点。
// 文件路径只在内存中参与计算，不写入 board.json。
const FILES_LIMIT = 100;
const FILES_BATCH = 100;
const FILES_QUERY = `query($ids: [ID!]!) {
  nodes(ids: $ids) {
    ... on PullRequest { id files(first: ${FILES_LIMIT}) { nodes { path additions deletions changeType } } }
  }
}`;

function batchQuery(numbers) {
  const items = numbers.map((n) => `n${n}: issueOrPullRequest(number: ${n}) { __typename ... on PullRequest { ${PR_FIELDS} } ... on Issue { ${ISSUE_FIELDS} } }`).join('\n');
  return `query($org: String!, $repo: String!) { repository(owner: $org, name: $repo) { ${items} } }`;
}

// 把提交说明里的 Co-Authored-By 转成引擎使用的 commit.authors 结构，并丢弃说明正文
const CO_AUTHOR = /^co-authored-by:\s*(.+?)\s*(?:<[^>]*>)?\s*$/gim;
function normalizeItem(item) {
  if (item.__typename !== 'PullRequest' || !item.commits) return item;
  const nodes = item.commits.nodes.map(({ commit }) => {
    const names = commit.author?.name ? [commit.author.name] : [];
    for (const m of (commit.message || '').matchAll(CO_AUTHOR)) names.push(m[1]);
    return { commit: { authors: { nodes: names.map((name) => ({ name })) } } };
  });
  return { ...item, commits: { totalCount: item.commits.totalCount, nodes } };
}

// allowMissing：编号空缺（已删除、转移或属于 discussion）时 GitHub 返回 NOT_FOUND，保留其余数据。
// 网络中断、5xx、499、二级限流（403/429）、GraphQL 超时或 RATE_LIMITED 会等待后重试。
async function gql(token, query, variables, { allowMissing = false } = {}) {
  for (let attempt = 1; ; attempt++) {
    const retry = async (seconds, why) => {
      log(`${why}，${seconds} 秒后重试（第 ${attempt} 次）`);
      await sleep(seconds * 1000);
    };
    let res;
    try {
      res = await fetch(GRAPHQL, {
        method: 'POST',
        headers: { Authorization: `bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ query, variables }),
      });
    } catch (err) {
      if (attempt >= MAX_ATTEMPTS) throw new Error(`网络请求失败：${err.message}`);
      await retry(3 * attempt, `网络请求失败：${err.message}`);
      continue;
    }
    if (res.status === 401) throw new Error('token 无效或已过期（HTTP 401）');
    const text = await res.text();
    const limited = (res.status === 403 || res.status === 429) && /rate limit/i.test(text);
    if ((limited || res.status >= 500 || res.status === 499) && attempt < MAX_ATTEMPTS) {
      await retry(limited ? Number(res.headers.get('Retry-After') || 60) : 3 * attempt, `HTTP ${res.status}`);
      continue;
    }
    if (!res.ok) throw new Error(`GitHub API 返回 HTTP ${res.status}：${text.slice(0, 200)}`);
    const body = JSON.parse(text);
    const errors = body.errors || [];
    const transient = errors.some((e) => e.type === 'RATE_LIMITED' || /timeout|timed out|something went wrong/i.test(e.message));
    if (transient && attempt < MAX_ATTEMPTS) {
      await retry(5 * attempt, errors[0].message);
      continue;
    }
    const fatal = errors.filter((e) => !(allowMissing && e.type === 'NOT_FOUND'));
    if (fatal.length || !body.data) throw new Error((fatal.length ? fatal : errors).map((e) => e.message).join('；'));
    return body.data;
  }
}

// 任一任务失败后不再领取新任务；等进行中的任务结束再抛出第一个错误
async function runPool(tasks, limit) {
  let next = 0;
  let failure = null;
  const worker = async () => {
    while (next < tasks.length && !failure) {
      const i = next++;
      try {
        await tasks[i]();
      } catch (err) {
        failure ??= err;
      }
    }
  };
  await Promise.all(Array.from({ length: Math.min(limit, tasks.length) }, worker));
  if (failure) throw failure;
}

// 成员与参与统计的仓库；超过 100 时只对还没取完的那一项继续翻页
async function fetchMeta(token, org) {
  const members = [];
  const repos = [];
  const vars = { org, memberCursor: null, repoCursor: null, needMembers: true, needRepos: true };
  while (vars.needMembers || vars.needRepos) {
    const d = (await gql(token, META_QUERY, vars)).organization;
    if (!d) throw new Error('找不到组织，或 token 没有访问权限');
    if (vars.needMembers) {
      members.push(...d.membersWithRole.nodes.map((m) => m.login));
      vars.needMembers = d.membersWithRole.pageInfo.hasNextPage;
      vars.memberCursor = d.membersWithRole.pageInfo.endCursor;
    }
    if (vars.needRepos) {
      repos.push(...d.repositories.nodes);
      vars.needRepos = d.repositories.pageInfo.hasNextPage;
      vars.repoCursor = d.repositories.pageInfo.endCursor;
    }
  }
  const included = repos.filter((r) => (RULES.includeArchived || !r.isArchived)
    && (RULES.includeForks || !r.isFork)
    && !RULES.excludeRepos.includes(r.name));
  return { members, repos: included };
}

// 按编号分批并发取回所有 PR 与 issue（PR 与 issue 共用编号，各批可以并发）
async function fetchAll(token, org) {
  const meta = await fetchMeta(token, org);
  const loaded = meta.repos.map((r) => ({
    name: r.name,
    prTotal: r.pullRequests.totalCount,
    issueTotal: r.issues.totalCount,
    maxNumber: Math.max(0, r.pullRequests.nodes[0]?.number || 0, r.issues.nodes[0]?.number || 0),
    prs: [],
    issues: [],
  }));
  let done = 0;
  const fetchBatch = (repo, from) => async () => {
    const numbers = Array.from({ length: BATCH_SIZE }, (_, k) => from + k);
    const d = (await gql(token, batchQuery(numbers), { org, repo: repo.name }, { allowMissing: true })).repository;
    let found = 0;
    for (const raw of Object.values(d)) {
      if (!raw) continue;
      const item = normalizeItem(raw);
      (item.__typename === 'PullRequest' ? repo.prs : repo.issues).push(item);
      found++;
    }
    done++;
    return found;
  };
  const tasks = loaded.flatMap((repo) => Array.from({ length: Math.ceil(repo.maxNumber / BATCH_SIZE) }, (_, k) => fetchBatch(repo, 1 + k * BATCH_SIZE)));
  log(`${meta.repos.length} 个仓库、${meta.members.length} 名成员，分 ${tasks.length} 批拉取`);
  const timer = setInterval(() => log(`已完成 ${done}/${tasks.length} 批`), 5000);
  try {
    await runPool(tasks, CONCURRENCY);
  } finally {
    clearInterval(timer);
  }
  // 转移进来的 issue 可能编号更大但创建时间更早：数量不够时继续向后探测，直到整批为空
  for (const repo of loaded) {
    let from = Math.ceil(repo.maxNumber / BATCH_SIZE) * BATCH_SIZE + 1;
    while (repo.prs.length < repo.prTotal || repo.issues.length < repo.issueTotal) {
      if (!(await fetchBatch(repo, from)())) break;
      from += BATCH_SIZE;
    }
  }
  await fetchClosers(token, loaded.flatMap((r) => r.prs.filter((p) => p.state === 'CLOSED')));
  await fetchFiles(token, loaded.flatMap((r) => r.prs.filter((p) => p.mergedAt)));
  return { org, members: meta.members, repos: loaded.map(({ name, prs, issues }) => ({ name, prs, issues })) };
}

// 给关闭未合入的 PR 补上关闭人 closedBy（{ login, __typename }）；查不到时保持缺失，引擎按被他人关闭计
async function fetchClosers(token, prs) {
  const byId = new Map(prs.map((p) => [p.id, p]));
  const ids = [...byId.keys()];
  const tasks = [];
  for (let i = 0; i < ids.length; i += CLOSER_BATCH) {
    const chunk = ids.slice(i, i + CLOSER_BATCH);
    tasks.push(async () => {
      const d = await gql(token, CLOSER_QUERY, { ids: chunk }, { allowMissing: true });
      for (const n of d.nodes) {
        const actor = n?.timelineItems.nodes[0]?.actor;
        if (actor) byId.get(n.id).closedBy = actor;
      }
    });
  }
  await runPool(tasks, CONCURRENCY);
  log(`查询了 ${ids.length} 个关闭未合入 PR 的关闭人，共 ${tasks.length} 批`);
}

// 给合入 PR 补上改动文件 files（{ nodes: [{ path, additions, deletions, changeType }] }）；查不到时保持缺失，引擎按非样式计
async function fetchFiles(token, prs) {
  const byId = new Map(prs.map((p) => [p.id, p]));
  const ids = [...byId.keys()];
  const tasks = [];
  for (let i = 0; i < ids.length; i += FILES_BATCH) {
    const chunk = ids.slice(i, i + FILES_BATCH);
    tasks.push(async () => {
      const d = await gql(token, FILES_QUERY, { ids: chunk }, { allowMissing: true });
      for (const n of d.nodes) if (n?.files) byId.get(n.id).files = n.files;
    });
  }
  await runPool(tasks, CONCURRENCY);
  log(`查询了 ${ids.length} 个合入 PR 的改动文件，共 ${tasks.length} 批`);
}

// ---------- 输出 ----------

const round = (x, digits = 2) => (typeof x === 'number' ? Math.round(x * 10 ** digits) / 10 ** digits : x);

// 只输出人维度与组织汇总；不含仓库名、PR 编号与标题、成员名单（见 AGENTS.md）
function serialize(board) {
  return {
    schema: 1,
    org: board.org,
    now: board.now,
    generatedAt: new Date(board.now).toISOString(),
    limits: { nested: NESTED_LIMIT, commits: COMMIT_LIMIT, files: FILES_LIMIT },
    summary: board.summary,
    weeks: board.weeks,
    people: board.people.map((p) => ({
      ...p,
      bonus: round(p.bonus),
      bonusPr: round(p.bonusPr),
      bonusModel: round(p.bonusModel),
      bonusCollab: round(p.bonusCollab),
      weeksIn: round(p.weeksIn),
      rate: round(p.rate, 4),
      weekly: [...p.weekly].map(([week, score]) => [week, round(score)]),
      modelMix: [...p.modelMix.values()],
    })),
  };
}

// ---------- 发布 ----------

async function rest(token, method, url, body) {
  for (let attempt = 1; ; attempt++) {
    let res;
    try {
      res = await fetch(`https://api.github.com${url}`, {
        method,
        headers: {
          Authorization: `bearer ${token}`,
          Accept: 'application/vnd.github+json',
          'X-GitHub-Api-Version': '2022-11-28',
          'Content-Type': 'application/json',
        },
        body: body === undefined ? undefined : JSON.stringify(body),
      });
    } catch (err) {
      if (attempt >= MAX_ATTEMPTS) throw new Error(`网络请求失败：${err.message}`);
      await sleep(3000 * attempt);
      continue;
    }
    if (res.status >= 500 && attempt < MAX_ATTEMPTS) {
      await sleep(3000 * attempt);
      continue;
    }
    const text = await res.text();
    if (!res.ok) {
      const err = new Error(`${method} ${url} 返回 HTTP ${res.status}：${text.slice(0, 300)}`);
      err.status = res.status;
      throw err;
    }
    return text ? JSON.parse(text) : null;
  }
}

// 在发布分支上做一次快进提交；内容没变时不提交，返回 null
async function publish(token, files, message) {
  const base = `/repos/${PAGES_REPO}`;
  const ref = await rest(token, 'GET', `${base}/git/ref/heads/${PAGES_BRANCH}`);
  const parent = await rest(token, 'GET', `${base}/git/commits/${ref.object.sha}`);
  const entries = [];
  // 一律按 base64 上传，PNG 等二进制文件才能原样提交
  for (const f of files) {
    const blob = await rest(token, 'POST', `${base}/git/blobs`, { content: f.content.toString('base64'), encoding: 'base64' });
    entries.push({ path: f.path, mode: '100644', type: 'blob', sha: blob.sha });
  }
  const tree = await rest(token, 'POST', `${base}/git/trees`, { base_tree: parent.tree.sha, tree: entries });
  if (tree.sha === parent.tree.sha) return null;
  const commit = await rest(token, 'POST', `${base}/git/commits`, { message, tree: tree.sha, parents: [ref.object.sha] });
  await rest(token, 'PATCH', `${base}/git/refs/heads/${PAGES_BRANCH}`, { sha: commit.sha, force: false });
  return commit.sha;
}

// ---------- 主流程 ----------

function resolveToken() {
  if (process.env.GITHUB_TOKEN) return process.env.GITHUB_TOKEN;
  try {
    return execFileSync('gh', ['auth', 'token'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
  } catch {
    throw new Error('未设置 GITHUB_TOKEN，且无法通过 `gh auth token` 获取 token');
  }
}

async function main() {
  const started = Date.now();
  const token = resolveToken();
  log(`开始拉取 ${ORG}`);
  const data = await fetchAll(token, ORG);
  const board = computeBoard(data, RULES, Date.now());
  const json = `${JSON.stringify(serialize(board))}\n`;
  log(`计算完成：${board.people.length} 名贡献者，合入 PR ${board.summary.merged} 个，数据 ${(json.length / 1024).toFixed(0)} KB`);

  if (DRY_RUN) {
    const out = path.join(ROOT, 'dist', 'board.json');
    fs.mkdirSync(path.dirname(out), { recursive: true });
    fs.writeFileSync(out, json);
    log(`--dry-run：已写入 ${path.relative(ROOT, out)}，未发布`);
    return;
  }

  const files = [
    ...SITE_FILES.map((f) => ({ path: f, content: fs.readFileSync(path.join(ROOT, f)) })),
    { path: 'data/board.json', content: Buffer.from(json) },
  ];
  const stamp = new Date(board.now + RULES.tzOffsetHours * 3600000).toISOString().slice(0, 16).replace('T', ' ');
  const message = `更新贡献度数据 ${stamp}（UTC+${RULES.tzOffsetHours}）`;
  const publishToken = process.env.PUBLISH_TOKEN || token;
  let sha;
  try {
    sha = await publish(publishToken, files, message);
  } catch (err) {
    // 422：发布分支在本次提交期间被更新，基于最新提交重试一次
    if (err.status !== 422) throw err;
    log('发布分支已被更新，重试一次');
    sha = await publish(publishToken, files, message);
  }
  const secs = ((Date.now() - started) / 1000).toFixed(0);
  log(sha ? `已发布到 ${PAGES_REPO}@${PAGES_BRANCH}（${sha.slice(0, 7)}），耗时 ${secs} 秒` : `内容没有变化，未提交，耗时 ${secs} 秒`);
}

main().catch((err) => {
  log(`失败：${err.message}`);
  process.exit(1);
});
