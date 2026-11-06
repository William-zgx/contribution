// Synthetic GitHub responses for the upload CLI. No network request may leave this process.
const issue = (number, login, createdAt) => ({
  __typename: 'Issue', number, state: 'OPEN', stateReason: null, createdAt, closedAt: null,
  author: { login, __typename: 'User' }, comments: { totalCount: 0, nodes: [] },
});
const recent = issue(1, 'fixture-recent', '2026-11-01T00:00:00Z');
const transferred = issue(150, 'fixture-transferred', '2026-01-01T00:00:00Z');
const scenario = process.env.UPLOAD_FIXTURE_SCENARIO || 'gap';
const end = { hasNextPage: false, endCursor: null };

globalThis.fetch = async (url, init) => {
  if (url !== 'https://api.github.com/graphql' || init?.method !== 'POST') {
    throw new Error('Fixture refuses network requests or publication');
  }
  const { query, variables } = JSON.parse(init.body);
  let data;
  if (query.includes('organization(login:')) {
    data = { organization: {
      membersWithRole: { pageInfo: end, nodes: [] },
      repositories: { pageInfo: end, nodes: [{
        name: 'fixture-project', isArchived: false, isFork: false,
        pullRequests: { totalCount: 0, nodes: [] },
        // Creation order leads with #1; the older transferred issue received #150 on arrival.
        issues: { totalCount: scenario === 'complete' ? 1 : 2, nodes: [{ number: 1 }] },
      }] },
    } };
  } else if (query.includes('issueOrPullRequest')) {
    const entries = [...query.matchAll(/(n\d+): issueOrPullRequest\(number: (\d+)\)/g)];
    data = { repository: Object.fromEntries(entries.map(([, alias, raw]) => {
      const number = Number(raw);
      return [alias, number === 1 ? recent : scenario !== 'complete' && number === 150 ? transferred : null];
    })) };
  } else if (query.includes('issues(first:')) {
    if (scenario === 'complete') throw new Error('Complete issue scans should not need a fallback');
    // Two pages test both following endCursor and deduplicating an issue already read by number.
    data = { repository: { issues: variables.cursor
      ? { pageInfo: end, nodes: [transferred] }
      : { pageInfo: { hasNextPage: true, endCursor: 'fixture-next' }, nodes: [recent] },
    } };
  } else {
    throw new Error('Unexpected fixture query');
  }
  return Response.json({ data });
};
