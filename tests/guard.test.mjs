import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const guard = fileURLToPath(new URL('../template/.claude/hooks/dev-team-guard.mjs', import.meta.url));

function project(phase) {
  const dir = mkdtempSync(path.join(tmpdir(), 'dev-team-guard-'));
  if (phase !== undefined) {
    mkdirSync(path.join(dir, '.dev-team'));
    writeFileSync(path.join(dir, '.dev-team', 'phase'), phase + '\n');
  }
  return dir;
}

function run(dir, { agent, file, tool = 'Edit' }) {
  const input = { hook_event_name: 'PreToolUse', tool_name: tool, tool_input: { file_path: file } };
  if (agent !== undefined) input.agent_type = agent;
  const r = spawnSync(process.execPath, [guard], {
    input: JSON.stringify(input),
    env: { ...process.env, CLAUDE_PROJECT_DIR: dir, DEV_TEAM_TEST_PATTERN: '' },
    encoding: 'utf8',
  });
  return { code: r.status, err: r.stderr };
}

function expect(phase, cases) {
  const dir = project(phase);
  try {
    for (const [agent, file, code] of cases) {
      const r = run(dir, { agent, file });
      assert.equal(r.code, code, `phase=${phase} agent=${agent || 'lead'} file=${file}: ${r.err}`);
      if (code === 2) assert.match(r.err, /dev-team guard/);
    }
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

test('no phase file or phase off: guard allows everything', () => {
  expect(undefined, [['', 'src/app.ts', 0], ['dev-tester', 'src/app.ts', 0]]);
  expect('off', [['', 'src/app.ts', 0], ['dev-reviewer', 'src/app.ts', 0]]);
});

test('red: tester writes tests only; implementer and lead are blocked', () => {
  expect('red', [
    ['dev-tester', 'tests/duration.test.ts', 0],
    ['dev-tester', 'src/duration.test.ts', 0],
    ['dev-tester', 'pkg/duration_test.go', 0],
    ['dev-tester', 'tests/test_duration.py', 0],
    ['dev-tester', 'src/duration.ts', 2],
    ['dev-implementer', 'src/duration.ts', 2],
    ['', 'src/duration.ts', 2],
    ['dev-tester', '.dev-team/evidence/01-red.log', 0],
  ]);
});

test('green: implementer writes production code; tests are frozen', () => {
  expect('green', [
    ['dev-implementer', 'src/duration.ts', 0],
    ['dev-implementer', 'tests/duration.test.ts', 2],
    ['dev-tester', 'tests/duration.test.ts', 2],
    ['dev-implementer', '.dev-team/evidence/01-green.log', 0],
  ]);
});

test('refactor: implementer may touch any repository file', () => {
  expect('refactor', [
    ['dev-implementer', 'src/duration.ts', 0],
    ['dev-implementer', 'tests/duration.test.ts', 0],
    ['dev-tester', 'tests/duration.test.ts', 2],
  ]);
});

test('context and docs: dev-context writes docs only', () => {
  expect('context', [['dev-context', '.dev-team/context.md', 0], ['dev-context', 'src/app.ts', 2]]);
  expect('docs', [
    ['dev-context', 'README.md', 0],
    ['dev-context', 'docs/usage.txt', 0],
    ['dev-context', 'src/app.ts', 2],
  ]);
  expect('green', [['dev-context', 'README.md', 2]]);
});

test('read-only roles and unknown agents are blocked; plugin prefixes are stripped', () => {
  expect('review', [
    ['dev-reviewer', 'src/app.ts', 2],
    ['dev-brainstormer', 'src/app.ts', 2],
    ['general-purpose', 'src/app.ts', 2],
    ['general-purpose', 'graphify-out/graph.json', 0],
  ]);
  expect('green', [['my-plugin:dev-implementer', 'src/app.ts', 0]]);
});

test('only the lead may set the phase', () => {
  expect('red', [['', '.dev-team/phase', 0], ['dev-tester', '.dev-team/phase', 2], ['dev-implementer', '.dev-team/phase', 2]]);
});

test('paths outside the project are not guarded; absolute paths inside are', () => {
  const dir = project('red');
  try {
    assert.equal(run(dir, { agent: '', file: path.join(tmpdir(), 'elsewhere.md') }).code, 0);
    assert.equal(run(dir, { agent: '', file: path.join(dir, 'src', 'app.ts') }).code, 2);
    assert.equal(run(dir, { agent: 'dev-tester', file: path.join(dir, 'tests', 'a.test.ts') }).code, 0);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('unknown phase fails closed', () => {
  expect('gren', [['dev-implementer', 'src/app.ts', 2]]);
});
