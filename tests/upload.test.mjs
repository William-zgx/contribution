import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const fixture = fileURLToPath(new URL('./fixtures/upload-github.mjs', import.meta.url));

function dryRun(t, scenario) {
  const dir = mkdtempSync(path.join(tmpdir(), 'contribution-upload-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  mkdirSync(path.join(dir, 'scripts'));
  copyFileSync(path.join(root, 'scripts/upload.mjs'), path.join(dir, 'scripts/upload.mjs'));
  copyFileSync(path.join(root, 'engine.js'), path.join(dir, 'engine.js'));
  // The real CLI runs against mocked fetch, with a synthetic token, in an isolated output directory.
  execFileSync(process.execPath, ['--import', fixture, path.join(dir, 'scripts/upload.mjs'), '--dry-run'], {
    cwd: dir, timeout: 10_000,
    env: { PATH: process.env.PATH, GITHUB_TOKEN: 'fixture-only', ORG: 'fixture-org', UPLOAD_FIXTURE_SCENARIO: scenario },
  });
  return JSON.parse(readFileSync(path.join(dir, 'dist/board.json'), 'utf8'));
}

test('upload includes older transferred issues beyond an empty number batch exactly once', t => {
  const board = dryRun(t, 'gap');
  assert.equal(board.summary.issues, 2);
  assert.deepEqual(board.people.map(person => person.login).sort(), ['fixture-recent', 'fixture-transferred']);
  assert.ok(board.people.every(person => person.issuesFiled === 1 && person.collab === 1));
});

test('upload keeps the batched scan when every issue was already found', t => {
  const board = dryRun(t, 'complete');
  assert.equal(board.summary.issues, 1);
  assert.deepEqual(board.people.map(person => person.login), ['fixture-recent']);
});
