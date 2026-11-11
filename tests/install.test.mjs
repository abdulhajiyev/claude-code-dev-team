import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const installer = fileURLToPath(new URL('../install.mjs', import.meta.url));
const install = (dir, ...flags) => spawnSync(process.execPath, [installer, dir, ...flags], { encoding: 'utf8' });
const json = (file) => JSON.parse(readFileSync(file, 'utf8'));

test('fresh install creates agents, skill, hook, settings and gitignore entry', () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'dev-team-install-'));
  try {
    const r = install(dir);
    assert.equal(r.status, 0, r.stderr);
    for (const f of ['dev-context', 'dev-brainstormer', 'dev-tester', 'dev-implementer', 'dev-reviewer']) {
      assert.ok(existsSync(path.join(dir, '.claude', 'agents', f + '.md')), f);
    }
    assert.ok(existsSync(path.join(dir, '.claude', 'skills', 'dev-team', 'SKILL.md')));
    assert.ok(existsSync(path.join(dir, '.claude', 'hooks', 'dev-team-guard.mjs')));
    const s = json(path.join(dir, '.claude', 'settings.json'));
    assert.equal(s.enabledPlugins['superpowers@claude-plugins-official'], true);
    assert.equal(s.hooks.PreToolUse.length, 1);
    assert.match(readFileSync(path.join(dir, '.gitignore'), 'utf8'), /^\.dev-team\/$/m);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('install merges into existing settings, keeps user values, and is idempotent', () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'dev-team-install-'));
  try {
    mkdirSync(path.join(dir, '.claude', 'agents'), { recursive: true });
    const mine = {
      env: { PONYTAIL_SUBAGENT_MATCHER: 'mine' },
      permissions: { allow: ['Bash(npm test)'] },
      hooks: { PreToolUse: [{ matcher: 'Bash', hooks: [{ type: 'command', command: 'echo hi' }] }] },
    };
    writeFileSync(path.join(dir, '.claude', 'settings.json'), JSON.stringify(mine));
    writeFileSync(path.join(dir, '.claude', 'agents', 'dev-tester.md'), 'my own tester\n');
    writeFileSync(path.join(dir, '.gitignore'), 'node_modules');

    assert.equal(install(dir).status, 0);
    const once = readFileSync(path.join(dir, '.claude', 'settings.json'), 'utf8');
    const s = JSON.parse(once);
    assert.equal(s.env.PONYTAIL_SUBAGENT_MATCHER, 'mine');
    assert.equal(s.env.GRAPHIFY_HOOK_STRICT, '0');
    assert.deepEqual(s.permissions, mine.permissions);
    assert.equal(s.hooks.PreToolUse.length, 2);
    assert.equal(readFileSync(path.join(dir, '.claude', 'agents', 'dev-tester.md'), 'utf8'), 'my own tester\n');
    assert.equal(readFileSync(path.join(dir, '.gitignore'), 'utf8'), 'node_modules\n# dev-team run state\n.dev-team/\n');

    const again = install(dir);
    assert.equal(again.status, 0);
    assert.equal(readFileSync(path.join(dir, '.claude', 'settings.json'), 'utf8'), once);
    assert.match(again.stdout, /unchanged {2}\.gitignore/);

    assert.equal(install(dir, '--force').status, 0);
    assert.notEqual(readFileSync(path.join(dir, '.claude', 'agents', 'dev-tester.md'), 'utf8'), 'my own tester\n');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('dry run writes nothing', () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'dev-team-install-'));
  try {
    const r = install(dir, '--dry-run');
    assert.equal(r.status, 0, r.stderr);
    assert.match(r.stdout, /\[dry-run\] created/);
    assert.ok(!existsSync(path.join(dir, '.claude')));
    assert.ok(!existsSync(path.join(dir, '.gitignore')));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
