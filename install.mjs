#!/usr/bin/env node
// Installs the dev team into a project's .claude/ folder.
//
//   node install.mjs <project-dir> [--dry-run] [--force]
//
// - Copies agents, the /dev-team skill and the guard hook. Existing files that
//   differ are skipped unless --force.
// - Merges settings into <project>/.claude/settings.json without removing or
//   overriding anything already there.
// - Adds .dev-team/ to the project's .gitignore.
import { readFile, writeFile, mkdir, readdir, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const templateRoot = path.join(here, 'template', '.claude');
const GUARD = 'dev-team-guard.mjs';

const args = process.argv.slice(2);
const dryRun = args.includes('--dry-run');
const force = args.includes('--force');
const positional = args.filter(a => !a.startsWith('--'));
if (positional.length !== 1 || args.includes('--help')) {
  console.log('Usage: node install.mjs <project-dir> [--dry-run] [--force]');
  process.exit(positional.length === 1 ? 0 : 1);
}
const target = path.resolve(positional[0]);
if (!(await stat(target).catch(() => null))?.isDirectory()) {
  console.error(`Not a directory: ${target}`);
  process.exit(1);
}
const prefix = dryRun ? '[dry-run] ' : '';
const log = (msg) => console.log(prefix + msg);

async function readText(file) {
  try { return await readFile(file, 'utf8'); } catch (e) { if (e.code === 'ENOENT') return null; throw e; }
}
async function put(file, content) {
  if (dryRun) return;
  await mkdir(path.dirname(file), { recursive: true });
  await writeFile(file, content);
}
async function* walk(dir) {
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) yield* walk(full);
    else yield full;
  }
}

// 1. Copy files (everything in the template except settings.json).
for await (const source of walk(templateRoot)) {
  const rel = path.relative(templateRoot, source);
  if (rel === 'settings.json') continue;
  const dest = path.join(target, '.claude', rel);
  const shown = path.join('.claude', rel);
  const content = await readFile(source, 'utf8');
  const existing = await readText(dest);
  if (existing === content) { log(`unchanged  ${shown}`); continue; }
  if (existing !== null && !force) { log(`SKIPPED    ${shown} (exists and differs; use --force to overwrite)`); continue; }
  await put(dest, content);
  log(`${existing === null ? 'created ' : 'replaced'}   ${shown}`);
}

// 2. Merge settings.json.
const settingsPath = path.join(target, '.claude', 'settings.json');
const template = JSON.parse(await readFile(path.join(templateRoot, 'settings.json'), 'utf8'));
const currentText = await readText(settingsPath);
let settings;
try { settings = currentText ? JSON.parse(currentText) : {}; } catch {
  console.error(`${settingsPath} is not valid JSON (comments are not supported). Merge template/.claude/settings.json by hand.`);
  process.exit(1);
}
for (const key of ['env', 'extraKnownMarketplaces', 'enabledPlugins']) {
  settings[key] ??= {};
  for (const [k, v] of Object.entries(template[key])) {
    if (!(k in settings[key])) settings[key][k] = v;
    else if (JSON.stringify(settings[key][k]) !== JSON.stringify(v)) log(`kept your  settings.${key}.${k} (template value: ${JSON.stringify(v)})`);
  }
}
settings.hooks ??= {};
settings.hooks.PreToolUse ??= [];
const hasGuard = JSON.stringify(settings.hooks.PreToolUse).includes(GUARD);
if (!hasGuard) settings.hooks.PreToolUse.push(...template.hooks.PreToolUse);
const nextText = JSON.stringify(settings, null, 2) + '\n';
if (nextText === currentText) log('unchanged  .claude/settings.json');
else { await put(settingsPath, nextText); log(`${currentText ? 'merged ' : 'created'}    .claude/settings.json`); }

// 3. Ignore run state.
const ignorePath = path.join(target, '.gitignore');
const ignore = (await readText(ignorePath)) ?? '';
if (ignore.split(/\r?\n/).some(line => ['.dev-team', '.dev-team/', '/.dev-team/'].includes(line.trim()))) {
  log('unchanged  .gitignore');
} else {
  await put(ignorePath, ignore + (ignore && !ignore.endsWith('\n') ? '\n' : '') + '# dev-team run state\n.dev-team/\n');
  log('updated    .gitignore (+ .dev-team/)');
}

console.log(`
Next steps (see docs/SETUP.md):
  1. Install plugins (inside Claude Code, in ${target}):
       /plugin install superpowers@claude-plugins-official
       /plugin marketplace add DietrichGebert/ponytail
       /plugin install ponytail@ponytail
       /plugin marketplace add JuliusBrussee/caveman
       /plugin install caveman@caveman
  2. Optional code graph:  uv tool install graphifyy && graphify install --project
     then run  /graphify .  once inside Claude Code
  3. Restart Claude Code in the project, check /agents, then:  /dev-team <task>`);
