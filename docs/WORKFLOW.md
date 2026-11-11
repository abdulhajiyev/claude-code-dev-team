# Workflow

The full protocol lives in [`template/.claude/skills/dev-team/SKILL.md`](../template/.claude/skills/dev-team/SKILL.md); this page explains it.

## Why this shape

- **Separate tester and implementer.** The agent that writes the test does not write the code that passes it, so a test is not quietly shaped around an implementation.
- **Evidence, not claims.** Each RED and GREEN step writes the raw output plus `exit=<code>` to a log. The lead reads the logs before advancing; the reviewer reads them again.
- **One writer at a time.** Subagents share your working tree. Only one is allowed to edit at any moment, and the phase file says which.
- **Independent review.** The reviewer is a separate Opus context with read-only tools. It never sees the lead's reasoning, only the diff, plan and evidence.
- **Each role on a suitable model.** Opus decides and reviews, Sonnet codes, Haiku reads and writes docs, Fable is used for real design questions only.

## Phases

| # | Phase | Agent | Output | Advance when |
|---|---|---|---|---|
| 0 | preflight | lead | start commit in `plan.md`, branch, refreshed graph | tree state is understood |
| 1 | `context` | dev-context | `.dev-team/context.md` | lead has spot-checked the key claims |
| 2 | `design` | dev-brainstormer | options, recommendation, criteria | lead has decided (optional phase) |
| 3 | plan | lead | `.dev-team/plan.md`: criteria and slices | user has seen it |
| 4a | `red` | dev-tester | test, `evidence/NN-red.log` | nonzero exit, failing for the missing behavior |
| 4b | `green` | dev-implementer | code, `evidence/NN-green.log` | exit 0, test file hash unchanged since RED |
| 4c | `refactor` | dev-implementer | `evidence/NN-refactor.log` | exit 0 |
| 5 | `verify` | dev-tester | `evidence/verify-*.log` | full suite, typecheck, lint, build pass, or blockers recorded |
| 6 | `review` | dev-reviewer | findings | none confirmed, or two rounds done |
| 7 | `docs` | dev-context | updated docs | docs match verified behavior (optional phase) |
| 8 | finish (`off`) | lead | `.dev-team/report.md` | user decides on commit |

Steps 4a-4c repeat for each behavior slice. Confirmed review findings become new slices.

### What counts as RED

A valid RED fails **because the behavior is missing**: an assertion failure, or "not defined" for the new function. These are not RED:

- syntax errors in the test, missing packages, broken config, a crashing runner: **setup blockers**, fixed first;
- a test that passes immediately: investigated before continuing, never weakened to force a failure.

### What counts as GREEN

The same command as RED exits 0, and the test file is byte-identical to its RED version. The lead records `sha256sum` of the test after RED and compares it after GREEN.

## Guard hook

`dev-team-guard.mjs` runs before every `Edit`, `Write`, `MultiEdit` and `NotebookEdit`. Claude Code passes it the tool input and, for subagents, `agent_type` (the subagent's name). It reads `.dev-team/phase` and exits 2 with a reason when the edit breaks the rules below; Claude Code then blocks the call and shows the reason to the model.

| Caller | Allowed |
|---|---|
| lead (no `agent_type`) | `.dev-team/**`, including `phase` |
| `dev-tester` | test files in `red` |
| `dev-implementer` | non-test files in `green`; anything in `refactor` |
| `dev-context` | docs (`docs/`, `README*`, `CHANGELOG*`, `*.md`, `*.mdx`, `*.rst`, `*.adoc`) in `context` and `docs` |
| `dev-reviewer`, `dev-brainstormer`, any other agent | nothing |
| everyone | `.dev-team/**` except `phase`, and `graphify-out/**` |

Always allowed: everything when the phase file is missing or says `off`, and paths outside the project directory. An unknown phase word blocks everything until fixed (fail closed).

Default test-file pattern: paths under `test/`, `tests/`, `__tests__/`, `spec/`, `specs/`, `e2e/`; names like `*.test.*`, `*.spec.*`, `*_test.*`, `*-test.*`, `test_*.py`, `*_test.go|py|rs|ex|exs`; and `conftest.py`. Override with `DEV_TEAM_TEST_PATTERN`.

**Not covered:** writes through Bash (`echo > file`, `sed -i`, code generators). The agents are instructed not to do this, and the reviewer checks the diff, but the hook does not see it.

## Handoff format

Subagents see none of the lead's conversation. Every delegation carries what it needs:

```
Phase: RED  Slice: 02
Objective: formatDuration rejects negative input
Criteria: formatDuration(-1) throws RangeError
Paths: read src/duration.ts, tests/duration.test.ts; write tests/duration.test.ts
Command: node --test tests/duration.test.ts
Evidence: .dev-team/evidence/02-red.log
Done when: log ends in a nonzero exit caused by the missing check
```

Reports come back terse (Caveman style) but with commands, paths, exit codes and error lines verbatim.

## Run state

`.dev-team/` is gitignored and overwritten by the next run. Copy `report.md` and `evidence/` somewhere else, or attach them to the PR, if you need them later.

| File | Written by | Content |
|---|---|---|
| `phase` | lead | current phase word |
| `plan.md` | lead | start commit, criteria, slices |
| `state.md` | lead | ledger: `NN red exit=1 <reason> \| green exit=0 \| refactor exit=0`, test hashes |
| `context.md` | dev-context | context packet |
| `evidence/*.log` | tester, implementer | raw output ending in `exit=<code>` |
| `review.diff` | lead | `git diff --binary <start-commit>` |
| `report.md` | lead | outcome, criteria status, commands, findings, skipped validation |
