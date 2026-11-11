# Claude Code Dev Team

A test-driven development team that runs **locally in Claude Code**. Your main session acts as an Opus lead and delegates each phase to a specialist subagent on the model best suited to it. A hook keeps every role in its lane: tests are written first, production code only after a real failing test, and the reviewer never touches the code it reviews.

It builds on four Claude Code tools, each with one job: [Superpowers](https://github.com/obra/superpowers) for the TDD method, [Ponytail](https://github.com/DietrichGebert/ponytail) to keep solutions small, [Caveman](https://github.com/JuliusBrussee/caveman) for terse handoffs, and [Graphify](https://github.com/Graphify-Labs/graphify) for code navigation.

No API key and no cloud sandbox: everything runs on your machine under your Claude Code login.

## The team

| Role | Subagent | Model | Job |
|---|---|---|---|
| Lead | main session (`/dev-team`) | Opus 5.5 | Scope, acceptance criteria, phase transitions, final judgment |
| Context and docs | `dev-context` | Haiku 5.5 | Context packet (with Graphify), final docs |
| Brainstorming | `dev-brainstormer` | Fable 5.2 | 2-3 design options, only for real design uncertainty |
| Test author | `dev-tester` | Sonnet 5.5 | One failing test per behavior (RED), full checks (VERIFY) |
| Implementer | `dev-implementer` | Sonnet 5.5 | Minimal code to pass (GREEN), cleanup (REFACTOR) |
| Independent reviewer | `dev-reviewer` | Opus 5.5 | Read-only review of the diff, criteria and TDD evidence |

Opus spends its tokens on decisions and review, Sonnet on the bulk of the coding, Haiku on reading and docs. Fable is kept off the routine path.

## How a run works

```
/dev-team "Add formatDuration(minutes) -> HH:mm ..."

 PREFLIGHT   lead: git status, branch, refresh Graphify graph
 CONTEXT     dev-context ........ .dev-team/context.md
 DESIGN      dev-brainstormer ... options + criteria        (optional)
 PLAN        lead ............... .dev-team/plan.md: criteria + behavior slices
 per slice:
   RED       dev-tester ......... failing test   -> evidence/NN-red.log    (exit != 0)
   GREEN     dev-implementer .... minimal code   -> evidence/NN-green.log  (exit 0)
   REFACTOR  dev-implementer .... cleanup        -> evidence/NN-refactor.log
 VERIFY      dev-tester ......... full suite, typecheck, lint, build
 REVIEW      dev-reviewer ....... findings -> new RED/GREEN slice (max 2 rounds)
 DOCS        dev-context ........ docs from verified behavior   (if needed)
 FINISH      lead ............... .dev-team/report.md, offers a commit
```

The lead writes the current phase to `.dev-team/phase`. The guard hook (`.claude/hooks/dev-team-guard.mjs`) checks every Edit or Write against the phase and the calling subagent:

| Phase | Who may edit | What |
|---|---|---|
| `red` | `dev-tester` | test files only |
| `green` | `dev-implementer` | production files only (tests frozen) |
| `refactor` | `dev-implementer` | any file |
| `context`, `docs` | `dev-context` | documentation only |
| any | any role | `.dev-team/` evidence and notes, `graphify-out/` |
| any | lead | `.dev-team/` only (the lead alone sets the phase) |

With no phase file, or phase `off`, the guard does nothing, so normal Claude Code use is unaffected. Details in [docs/WORKFLOW.md](docs/WORKFLOW.md).

## Quick start

```bash
git clone https://github.com/abdulhajiyev/claude-code-dev-team.git
node claude-code-dev-team/install.mjs /path/to/your/project
```

Then, in Claude Code inside your project:

```text
/plugin install superpowers@claude-plugins-official
/plugin marketplace add DietrichGebert/ponytail
/plugin install ponytail@ponytail
/plugin marketplace add JuliusBrussee/caveman
/plugin install caveman@caveman
```

Restart Claude Code in the project, then:

```text
/dev-team Add a pure helper formatDuration(minutes) that returns HH:mm. Accept only finite nonnegative integers; 0 -> 00:00, 65 -> 01:05, 1500 -> 25:00.
```

or point it at a task file: `/dev-team tasks/duration.md` (see [examples/task.example.md](examples/task.example.md)).

Full prerequisites, Graphify setup, verification and uninstall: [docs/SETUP.md](docs/SETUP.md).

## What gets installed

```
your-project/
├── .claude/
│   ├── agents/
│   │   ├── dev-context.md        Haiku 5.5
│   │   ├── dev-brainstormer.md   Fable 5.2
│   │   ├── dev-tester.md         Sonnet 5.5  + Superpowers TDD, verification
│   │   ├── dev-implementer.md    Sonnet 5.5  + Superpowers TDD, debugging, verification
│   │   └── dev-reviewer.md       Opus 5.5
│   ├── skills/dev-team/SKILL.md  /dev-team: the lead's protocol (Opus 5.5)
│   ├── hooks/dev-team-guard.mjs  phase and role guard
│   └── settings.json             plugins, hook, env (merged, never overwritten)
├── .gitignore                    + .dev-team/
└── .dev-team/                    run state, created during a run
    ├── phase  plan.md  state.md  context.md  review.diff  report.md
    └── evidence/  NN-red.log  NN-green.log  NN-refactor.log  verify-*.log
```

The installer never overwrites a file that differs from the template unless you pass `--force`, and it merges `settings.json` key by key, keeping your values.

## How the plugins fit

| Plugin | Where it acts | Boundary |
|---|---|---|
| Superpowers | TDD, debugging and verification skills preloaded into tester and implementer; lead uses brainstorming, plans, code-review handling, branch finishing | `/dev-team` is the only orchestrator: the lead does not also run `subagent-driven-development` or `executing-plans` |
| Ponytail | Ruleset injected into brainstormer, implementer and reviewer (`PONYTAIL_SUBAGENT_MATCHER`) | Smallest complete solution; never cuts tests, validation, security or accessibility. Tester and context agents are excluded |
| Caveman | Terse lead status and specialist reports | Code, commands, errors, logs, test names and docs stay exact and normal. `cavecrew` agents are not used |
| Graphify | `dev-context` queries the graph; lead refreshes it at preflight | Graph edges are hints; claims are checked against source. Strict mode is off so read-only agents are not blocked |

Why each choice was made, and how to change it: [docs/INTEGRATIONS.md](docs/INTEGRATIONS.md).

## Customizing

- **Models:** change `model:` in `.claude/agents/*.md` (aliases `opus`, `sonnet`, `haiku`, `fable` or full IDs). The lead's model is `model:` in `.claude/skills/dev-team/SKILL.md`.
- **Effort:** `effort:` per agent. Defaults: context `low`, tester and implementer `medium`, brainstormer and reviewer `high`.
- **Test file layout:** set `DEV_TEAM_TEST_PATTERN` (a JavaScript regex matched against the project-relative path) in `.claude/settings.json` under `env` if the default pattern does not recognize your tests.
- **Prompts:** edit the agent files and the skill directly; they are plain Markdown.

## Limits

- **Prompt-directed, partly enforced.** The hook enforces who may use Edit/Write in which phase. Shell redirection through Bash is not intercepted, and the RED-before-GREEN order is checked by the lead reading the logs, not by a deterministic controller. Treat it as a strong guardrail, not a security boundary.
- **Your working tree is edited directly.** Run on a branch or worktree; the lead offers one at preflight. Nothing is committed or pushed unless you ask.
- **Model access.** Every model in the table must be available to your Claude Code account. If one is not, change that agent's `model:`.
- **Usage.** A full run uses several subagents. It counts against your plan's usage like any other Claude Code work.

## Development

```bash
npm test     # guard and installer tests (Node 20+, no dependencies)
```

## Related

This repository is the local counterpart of a Claude Managed Agents setup (same roles, run in Anthropic's cloud through the API). See the [Managed Agents multiagent docs](https://platform.claude.com/docs/en/managed-agents/multiagent-orchestration) if you want the hosted version.

## License

[MIT](LICENSE)
