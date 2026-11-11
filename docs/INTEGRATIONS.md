# Integrations

One tool per concern, so they do not fight:

| Concern | Owner |
|---|---|
| Orchestration and model routing | `/dev-team` skill and the agent files in this repo |
| Development method (TDD, debugging, verification) | Superpowers |
| Solution size | Ponytail |
| Prose compression in status and handoffs | Caveman |
| Code navigation | Graphify |

None of the plugins is allowed to become a second orchestrator or model router.

## Superpowers

[obra/superpowers](https://github.com/obra/superpowers), from the official marketplace: `superpowers@claude-plugins-official`.

| Skill | Used by | How |
|---|---|---|
| `test-driven-development` | dev-tester, dev-implementer | preloaded through `skills:` in the agent file |
| `verification-before-completion` | dev-tester, dev-implementer | preloaded |
| `systematic-debugging` | dev-implementer | preloaded, for GREEN steps that do not pass |
| `brainstorming` | lead | with the user, when requirements are unclear |
| `writing-plans` | lead | slice plan for tasks over three behaviors |
| `using-git-worktrees` | lead | optional isolation at preflight |
| `receiving-code-review` | lead | checking reviewer findings before acting |
| `finishing-a-development-branch` | lead | after the run |

**Not used:** `subagent-driven-development`, `executing-plans` and `dispatching-parallel-agents`. They orchestrate subagents themselves and would compete with `/dev-team`. The lead's protocol says so explicitly.

The tester's prompt narrows the TDD skill to its part of the cycle (RED and VERIFY); the implementer owns GREEN and REFACTOR.

`superpowers:brainstorming` is not preloaded into `dev-brainstormer`: that skill is an interactive dialogue with the user, and a subagent cannot talk to the user. The Fable brainstormer instead returns options to the lead.

## Ponytail

[DietrichGebert/ponytail](https://github.com/DietrichGebert/ponytail): `ponytail@ponytail`.

Ponytail's `SubagentStart` hook injects its "smallest solution that works" ruleset into subagents. The template sets:

```json
"PONYTAIL_SUBAGENT_MATCHER": "^dev-(brainstormer|implementer|reviewer)$"
```

so it reaches:

- **dev-brainstormer:** prefer existing capabilities and the smallest viable design;
- **dev-implementer:** minimal GREEN code, no speculative abstractions;
- **dev-reviewer:** flag over-engineering and unrequested scope.

It deliberately does **not** reach `dev-tester`, where "do less" could mean fewer tests, or `dev-context`, which only reads and documents. Ponytail itself keeps validation, error handling, security and accessibility, and every prompt here repeats that tests and validation are never cut.

Ponytail also runs in the main session (the lead), which keeps scope decisions tight. `/ponytail-review` and `/ponytail-audit` are useful extra checks after a run, outside the protocol.

Ponytail's task board writes a local CSV per project (`~/.config/ponytail/band/`); the optional webhook is empty by default, so nothing leaves your machine.

## Caveman

[JuliusBrussee/caveman](https://github.com/JuliusBrussee/caveman): `caveman@caveman`.

- The plugin's session hook makes the lead's chat terse. That is where most of the conversational tokens are.
- Specialist reports to the lead use the same terse style through their prompts ("no filler, fragments fine"), with commands, paths, exit codes and error lines kept verbatim.
- Caveman's own rules already keep code, commits and error strings exact. Documentation written by `dev-context` is explicitly normal prose.
- `caveman:caveman-commit` can write the final commit message.
- **Not used:** the `cavecrew` subagents. They are a second set of delegates and would bypass the roles and the guard.

Measure before assuming savings: shorter messages do not automatically mean fewer total tokens for a run.

## Graphify

[Graphify-Labs/graphify](https://github.com/Graphify-Labs/graphify): Python package `graphifyy`, command `graphify`. Not a Claude Code plugin; installed per project with `graphify install --project`.

- **Build:** `/graphify .` once. Code is parsed locally with tree-sitter (no model); docs and media go through an optional semantic pass.
- **Refresh:** the lead runs `graphify update .` at preflight when `graphify-out/graph.json` exists.
- **Use:** `dev-context` (the only specialist with both a shell and a navigation job) runs `graphify query`, `graphify path` and `graphify explain`, reads `graphify-out/GRAPH_REPORT.md`, checks the graph's age against the latest commit, and verifies claims in source. Specialists get the relevant paths in their handoff instead of querying the graph themselves.
- **Strict mode off:** Graphify's optional strict hook denies Read/Grep until a graph query is made. `dev-reviewer` and `dev-brainstormer` have no shell and could get stuck, so the template sets `GRAPHIFY_HOOK_STRICT=0`. The default soft nudge stays.
- **Guard:** every role may write `graphify-out/`, so graph updates are never blocked mid-run.

A graph edge is a navigation hint, not proof of runtime behavior.

## Changing the mix

- **Drop a plugin:** set its `enabledPlugins` entry to `false`. For Superpowers, also remove the `skills:` lines from `dev-tester.md` and `dev-implementer.md`.
- **Ponytail everywhere:** remove `PONYTAIL_SUBAGENT_MATCHER` from `env`.
- **No Graphify:** nothing to change; `dev-context` falls back to Grep and Glob when `graphify-out/` is absent.
