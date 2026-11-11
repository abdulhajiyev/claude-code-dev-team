# Setup

Step by step, from nothing to a first `/dev-team` run.

## 1. Prerequisites

| Requirement | Why | Check |
|---|---|---|
| Claude Code 2.1.295 or later | `onFailure` on the guard hook; subagent `skills`, `effort` fields | `claude --version` |
| Node.js 20 or later | Installer, guard hook, Ponytail hooks | `node --version` |
| Git | Branches, diffs for review | `git --version` |
| Access to Opus 5.5, Sonnet 5.5, Haiku 5.5, Fable 5.2 | One model per role | `/model` in Claude Code |
| Optional: Python 3.10+ and [uv](https://docs.astral.sh/uv/) | Graphify | `uv --version` |

Your target project should already have a working test command. The team uses the project's own runner; it does not add one.

## 2. Install the team into a project

```bash
git clone https://github.com/abdulhajiyev/claude-code-dev-team.git
cd claude-code-dev-team
node install.mjs /path/to/your/project --dry-run   # preview
node install.mjs /path/to/your/project
```

The installer:

1. Copies `template/.claude/{agents,skills,hooks}` into `<project>/.claude/`. A file that already exists and differs is **skipped** unless you pass `--force`.
2. Merges `template/.claude/settings.json` into `<project>/.claude/settings.json`: adds missing `env`, `extraKnownMarketplaces` and `enabledPlugins` entries, and appends the guard hook if it is not there yet. Your existing values always win; conflicts are printed.
3. Adds `.dev-team/` to `<project>/.gitignore`.

Running it again is safe: unchanged files are reported as `unchanged`.

If your `settings.json` contains comments (JSONC), the installer refuses to parse it. Merge `template/.claude/settings.json` by hand in that case.

Commit `.claude/` to the project so teammates get the same team. `.dev-team/` stays local.

## 3. Install the plugins

Inside Claude Code, opened in the project, run each line as its own prompt:

```text
/plugin install superpowers@claude-plugins-official
/plugin marketplace add DietrichGebert/ponytail
/plugin install ponytail@ponytail
/plugin marketplace add JuliusBrussee/caveman
/plugin install caveman@caveman
```

The project's `settings.json` already lists these under `enabledPlugins` and registers the Ponytail and Caveman marketplaces once you trust the folder. Each person still installs the plugins once; `enabledPlugins` alone does not install them.

Optional settings:

- `/ponytail lite|full|ultra` sets Ponytail's level (default `full`).
- `/caveman lite` makes the lead's chat summaries a little less compressed, if you prefer.

## 4. Optional: Graphify code graph

```bash
uv tool install graphifyy          # PyPI name has two y's; the command is `graphify`
cd /path/to/your/project
graphify install --project         # adds .claude/skills/graphify and its search hook
```

Then, once, inside Claude Code: `/graphify .`

This writes `graphify-out/` (`GRAPH_REPORT.md`, `graph.json`, `graph.html`). Code is parsed locally with tree-sitter; only the optional docs/media pass calls a model. The lead runs `graphify update .` at the start of every `/dev-team` run to pick up changed files. Optionally, `graphify hook install` rebuilds the graph on commit and checkout.

Decide whether to commit `graphify-out/`. Large `graph.html` or cache files are usually better left in `.gitignore`.

Do **not** enable Graphify's strict mode (`--strict` or `GRAPHIFY_HOOK_STRICT=1`): it denies Read and Grep until a graph query has been made, and `dev-reviewer` and `dev-brainstormer` have no shell to query with. The template sets `GRAPHIFY_HOOK_STRICT=0`.

## 5. Verify the installation

Restart Claude Code in the project, then:

1. `/agents` lists `dev-context`, `dev-brainstormer`, `dev-tester`, `dev-implementer` and `dev-reviewer` with their models.
2. `/dev-team` appears in the slash command list.
3. `/hooks` shows the `PreToolUse` guard for `Edit|Write|MultiEdit|NotebookEdit`.
4. Ask: `Use dev-tester to list the skills preloaded into your context, then stop.` It should name `superpowers:test-driven-development` and `superpowers:verification-before-completion`. If it does not, check that Superpowers is installed (`/plugin`).
5. Guard check, from a shell in the project:

   ```bash
   mkdir -p .dev-team && echo red > .dev-team/phase
   echo '{"agent_type":"dev-implementer","tool_input":{"file_path":"src/x.ts"}}' \
     | CLAUDE_PROJECT_DIR=$PWD node .claude/hooks/dev-team-guard.mjs; echo "exit=$?"
   # expect a "dev-team guard [red]" message and exit=2
   echo off > .dev-team/phase
   ```

## 6. First run

Use a throwaway branch and a small task first, such as [examples/task.example.md](../examples/task.example.md) adapted to your project:

```text
/dev-team examples/task.example.md
```

Watch the phases in the terminal. When it finishes, read `.dev-team/report.md` and the logs in `.dev-team/evidence/`, review `git diff`, then decide whether to commit.

To stop a run midway: press Esc, then tell the lead to stop, or write `off` to `.dev-team/phase` yourself so normal edits work again.

## Uninstall

From the project:

```bash
rm -r .claude/agents/dev-*.md .claude/skills/dev-team .claude/hooks/dev-team-guard.mjs .dev-team
```

Then remove the `dev-team-guard.mjs` entry from `hooks.PreToolUse` in `.claude/settings.json`, and the `env`, `enabledPlugins` and `extraKnownMarketplaces` entries if you no longer want them. Remove plugins with `/plugin`, and Graphify with `graphify uninstall` (add `--purge` to delete `graphify-out/`).

## Troubleshooting

| Symptom | Cause and fix |
|---|---|
| `dev-team guard [...]` blocks a normal edit after a run | The run did not reach FINISH. Write `off` to `.dev-team/phase`. |
| Tester is blocked from writing its test | The test path does not match the default pattern. Set `DEV_TEAM_TEST_PATTERN` in `settings.json` `env`. |
| Every Edit is blocked with a hook error | `node` is not on Claude Code's PATH, or the hook file is missing. The hook fails closed by design. |
| An agent runs on the wrong model, or errors on its model | Your account lacks that model. Change `model:` in the agent file, for example to an alias. |
| Ponytail rules reach the tester | Your own `PONYTAIL_SUBAGENT_MATCHER` overrides the template value. Check `settings.json` `env`. |
| `node: command not found` from Ponytail hooks | Ponytail's hooks need Node on PATH. |
