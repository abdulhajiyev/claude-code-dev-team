#!/usr/bin/env node
// dev-team guard: PreToolUse hook for Edit|Write|MultiEdit|NotebookEdit.
//
// Reads the run phase from .dev-team/phase and the calling subagent from the
// hook input (agent_type). It blocks file edits that break the TDD role split:
//
//   lead (main session)  only .dev-team/ files, and it alone sets .dev-team/phase
//   dev-tester           test files, in phase red
//   dev-implementer      non-test files in green; any file in refactor
//   dev-context          documentation files, in phase context or docs
//   dev-reviewer,
//   dev-brainstormer     nothing (they are read-only anyway)
//
// Every role may write .dev-team/ (evidence, notes) and graphify-out/.
// Missing phase file or "off" = guard disabled, so normal Claude Code use is
// unaffected. Paths outside the project are not guarded.
//
// Exit 2 blocks the call; stderr goes back to the model as the reason.
// This guards the Edit/Write tools only. Shell redirection in Bash bypasses
// it: it is a guardrail, not a security boundary.
import { readFileSync } from 'node:fs';
import path from 'node:path';

const PHASES = new Set(['context', 'design', 'red', 'green', 'refactor', 'verify', 'review', 'docs']);

const TEST = new RegExp(
  process.env.DEV_TEAM_TEST_PATTERN ||
    String.raw`(^|/)(tests?|__tests__|spec|specs|e2e)/|[._-](test|spec)\.[^/]+$|(^|/)test_[^/]+\.py$|_test\.(go|py|rs|exs?)$|(^|/)conftest\.py$`,
);
const DOC = /(^|\/)docs?\/|(^|\/)(README|CHANGELOG|CONTRIBUTING)[^/]*$|\.(md|mdx|rst|adoc)$/i;

function decide(phase, agent, rel) {
  if (rel === '.dev-team/phase') return agent ? 'Only the lead (main session) sets .dev-team/phase.' : null;
  if (rel.startsWith('.dev-team/') || rel.startsWith('graphify-out/')) return null;

  const isTest = TEST.test(rel);
  switch (agent) {
    case '':
      return `The lead does not edit repository files during a /dev-team run (phase "${phase}"). Delegate to the right specialist, or write "off" to .dev-team/phase to end the run.`;
    case 'dev-tester':
      if (phase === 'red' && isTest) return null;
      return phase === 'red'
        ? `"${rel}" is not a test file. In RED, dev-tester writes tests only; production code belongs to dev-implementer. (Override the test pattern with DEV_TEAM_TEST_PATTERN if your layout differs.)`
        : `dev-tester may edit test files only in phase red (current: "${phase}"). Report to the lead instead.`;
    case 'dev-implementer':
      if (phase === 'refactor') return null;
      if (phase === 'green' && !isTest) return null;
      return phase === 'green'
        ? `"${rel}" is a test file and is frozen in GREEN. Make the existing test pass with production code; if the test is wrong, report to the lead.`
        : `dev-implementer may edit files only in phase green or refactor (current: "${phase}").`;
    case 'dev-context':
      if ((phase === 'context' || phase === 'docs') && DOC.test(rel)) return null;
      return `dev-context may write only .dev-team/ files and documentation, in phase context or docs (current: "${phase}", file: "${rel}").`;
    default:
      return `"${agent}" may not edit repository files during a /dev-team run (phase "${phase}").`;
  }
}

function main() {
  const root = path.resolve(process.env.CLAUDE_PROJECT_DIR || process.cwd());
  let phase;
  try {
    phase = readFileSync(path.join(root, '.dev-team', 'phase'), 'utf8').trim().toLowerCase();
  } catch {
    return 0; // no run in progress
  }
  if (phase === '' || phase === 'off') return 0;

  let input;
  try {
    input = JSON.parse(readFileSync(0, 'utf8') || '{}');
  } catch {
    console.error('dev-team guard: unreadable hook input; blocking while a run is active.');
    return 2;
  }
  if (!PHASES.has(phase)) {
    console.error(`dev-team guard: unknown phase "${phase}" in .dev-team/phase. Use one of: ${[...PHASES].join(', ')}, off.`);
    return 2;
  }

  const target = input?.tool_input?.file_path ?? input?.tool_input?.notebook_path;
  if (!target) return 0;
  const rel = path.relative(root, path.resolve(root, target)).split(path.sep).join('/');
  if (rel.startsWith('../') || rel === '..' || path.isAbsolute(rel)) return 0; // outside the project

  // Plugin-scoped agents arrive as "plugin:name"; compare the bare name.
  const agent = String(input.agent_type ?? '').split(':').pop().trim();
  const reason = decide(phase, agent, rel);
  if (!reason) return 0;
  console.error(`dev-team guard [${phase}]: ${reason}`);
  return 2;
}

process.exitCode = main();
