'use strict';

const { PERTURBATIONS, IDS, envFor, reproFor } = require('./perturbations');
const { runCommand, tail, makeTempFactory } = require('./run');
const { humanReport, jsonReport, listText } = require('./report');

const VERSION = require('../package.json').version;

const USAGE = `otherbox \u2014 runs your tests on a box that isn't yours.

  otherbox [options] [--] <command...>

Runs <command> once in your environment, then once per environment below with
exactly one thing different, and names the one thing that turned it red.
Default command: npm test

Options:
  --only <ids>        run only these environments (comma separated)
  --skip <ids>        run all but these
  --list              list the environments and what each one catches
  --json              machine-readable report on stdout
  --timeout <seconds> kill a run that takes longer (default 600)
  -h, --help          this
  -v, --version       version

Exit codes: 0 every environment passed, 1 at least one failed,
2 the command was wrong or your suite already failed before anything changed.
`;

function distance(a, b) {
  const rows = [];
  for (let i = 0; i <= a.length; i += 1) rows.push([i, ...new Array(b.length).fill(0)]);
  for (let j = 0; j <= b.length; j += 1) rows[0][j] = j;
  for (let i = 1; i <= a.length; i += 1) {
    for (let j = 1; j <= b.length; j += 1) {
      rows[i][j] = Math.min(
        rows[i - 1][j] + 1,
        rows[i][j - 1] + 1,
        rows[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1)
      );
    }
  }
  return rows[a.length][b.length];
}

function unknownId(id) {
  const near = IDS.map((known) => [known, distance(id, known)])
    .filter(([, d]) => d <= 3)
    .sort((x, y) => x[1] - y[1])[0];
  const hint = near ? ` Did you mean "${near[0]}"?` : '';
  return `unknown environment "${id}".${hint} Known: ${IDS.join(', ')}.`;
}

function splitIds(value) {
  return String(value)
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}

// Pure. Returns { error } or a settled set of options.
function parseArgs(argv) {
  const opts = { command: [], only: [], skip: [], json: false, list: false, help: false, version: false, timeoutMs: 600000 };
  let i = 0;
  while (i < argv.length) {
    const arg = argv[i];
    if (arg === '--') {
      opts.command = argv.slice(i + 1);
      break;
    }
    if (!arg.startsWith('-')) {
      opts.command = argv.slice(i);
      break;
    }
    const eq = arg.indexOf('=');
    const flag = eq === -1 ? arg : arg.slice(0, eq);
    const inline = eq === -1 ? null : arg.slice(eq + 1);
    const takeValue = () => {
      if (inline !== null) return inline;
      i += 1;
      return argv[i];
    };
    if (flag === '-h' || flag === '--help') opts.help = true;
    else if (flag === '-v' || flag === '--version') opts.version = true;
    else if (flag === '--list') opts.list = true;
    else if (flag === '--json') opts.json = true;
    else if (flag === '--only' || flag === '--skip') {
      const value = takeValue();
      if (value === undefined) return { error: `${flag} needs a value. Known: ${IDS.join(', ')}.` };
      const ids = splitIds(value);
      if (ids.length === 0) return { error: `${flag} needs at least one environment. Known: ${IDS.join(', ')}.` };
      for (const id of ids) if (!IDS.includes(id)) return { error: unknownId(id) };
      if (flag === '--only') opts.only.push(...ids);
      else opts.skip.push(...ids);
    } else if (flag === '--timeout') {
      const value = takeValue();
      const secs = Number(value);
      if (!Number.isFinite(secs) || secs <= 0) return { error: `--timeout needs a positive number of seconds, got "${value}".` };
      opts.timeoutMs = Math.round(secs * 1000);
    } else {
      return { error: `unknown option "${flag}". Run otherbox --help.` };
    }
    i += 1;
  }
  if (opts.command.length === 0) opts.command = ['npm', 'test'];
  if (opts.only.length && opts.skip.length) {
    return { error: 'use --only or --skip, not both: together they say the same thing twice and disagree.' };
  }
  return opts;
}

function selectPerturbations(opts) {
  if (opts.only.length) return PERTURBATIONS.filter((p) => opts.only.includes(p.id));
  if (opts.skip.length) return PERTURBATIONS.filter((p) => !opts.skip.includes(p.id));
  return PERTURBATIONS.slice();
}

async function main(argv, io = {}) {
  const out = io.out || ((s) => process.stdout.write(s));
  const err = io.err || ((s) => process.stderr.write(s));
  const baseEnv = io.env || process.env;
  const cwd = io.cwd || process.cwd();
  const run = io.run || runCommand;

  const opts = parseArgs(argv);
  if (opts.error) {
    err(`otherbox: ${opts.error}\n`);
    return 2;
  }
  if (opts.help) {
    out(USAGE);
    return 0;
  }
  if (opts.version) {
    out(`${VERSION}\n`);
    return 0;
  }
  if (opts.list) {
    out(listText());
    return 0;
  }

  const chosen = selectPerturbations(opts);
  const temp = (io.temp || makeTempFactory)();
  const results = [];
  let exitCode = 0;
  try {
    if (!opts.json) err(`otherbox: ${opts.command.join(' ')} \u2014 baseline first, then ${chosen.length} environment${chosen.length === 1 ? '' : 's'}.\n`);

    const baseline = await run(opts.command, { ...baseEnv }, { cwd, timeoutMs: opts.timeoutMs });
    if (!baseline.ok) {
      err(
        `otherbox: your command failed before anything was changed \u2014 nothing to learn from ` +
          `perturbing it. Fix the baseline first.\n\n${tail(baseline.output, 20).join('\n')}\n`
      );
      return 2;
    }

    for (const p of chosen) {
      const plan = p.plan(baseEnv, temp);
      const env = envFor(plan, baseEnv);
      const result = await run(opts.command, env, { cwd, timeoutMs: opts.timeoutMs });
      results.push({
        id: p.id,
        title: p.title,
        catches: p.catches,
        set: plan.set,
        unset: plan.unset,
        repro: reproFor(plan, opts.command),
        ok: result.ok,
        ms: result.ms,
        code: result.code,
        timedOut: result.timedOut,
        tail: result.ok ? [] : tail(result.output),
      });
      if (!result.ok) exitCode = 1;
      if (!opts.json) err(`  ${result.ok ? 'pass' : 'FAIL'}  ${p.id}\n`);
    }

    const report = { version: VERSION, command: opts.command, baseline, results };
    out(opts.json ? `${jsonReport(report)}\n` : `\n${humanReport(report)}`);
    return exitCode;
  } finally {
    temp.cleanup();
  }
}

module.exports = { main, parseArgs, selectPerturbations, unknownId, USAGE, VERSION };
