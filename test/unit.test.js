'use strict';

const test = require('node:test');
const assert = require('node:assert');

const { PERTURBATIONS, IDS, envFor, reproFor, CLEAN_ENV_KEEP, byId } = require('../src/perturbations');
const { parseArgs, selectPerturbations, unknownId } = require('../src/cli');
const { humanReport, jsonReport, listText, wrap } = require('../src/report');
const { tail } = require('../src/run');

const ctx = { tempDir: (name) => `/tmp/fake/${name}` };

test('every perturbation declares an id, a title and what it catches', () => {
  assert.ok(PERTURBATIONS.length >= 8);
  for (const p of PERTURBATIONS) {
    assert.match(p.id, /^[a-z][a-z-]*$/, `${p.id} is a plain id`);
    assert.ok(p.title && p.title.length > 3, `${p.id} has a title`);
    assert.ok(p.catches && p.catches.length > 30, `${p.id} says what it catches`);
    assert.equal(typeof p.plan, 'function');
  }
  assert.equal(new Set(IDS).size, IDS.length, 'ids are unique');
});

test('a plan changes only what it names, and never mutates the base env', () => {
  const base = Object.freeze({ PATH: '/bin', KEEP: 'yes', CI: '' });
  for (const p of PERTURBATIONS) {
    const plan = p.plan(base, ctx);
    const env = envFor(plan, base);
    assert.notStrictEqual(env, base);
    assert.equal(base.KEEP, 'yes');
    const touched = new Set([...Object.keys(plan.set), ...plan.unset]);
    for (const key of Object.keys(base)) {
      if (!touched.has(key)) assert.equal(env[key], base[key], `${p.id} left ${key} alone`);
    }
    assert.ok(env.PATH === '/bin' || touched.has('PATH'), `${p.id} keeps PATH unless it says otherwise`);
  }
});

test('tz, locale, colour and width set exactly the variable they are named for', () => {
  const base = {};
  assert.deepEqual(byId('tz').plan(base, ctx).set, { TZ: 'Pacific/Kiritimati' });
  assert.equal(byId('locale').plan(base, ctx).set.LC_ALL, 'tr_TR.UTF-8');
  assert.deepEqual(byId('narrow').plan(base, ctx).set, { COLUMNS: '40' });
  assert.equal(byId('color').plan(base, ctx).set.FORCE_COLOR, '3');
  assert.deepEqual(byId('color').plan(base, ctx).unset, ['NO_COLOR']);
});

test('ci flips whichever way the current environment is not', () => {
  assert.deepEqual(byId('ci').plan({}, ctx), { set: { CI: '1' }, unset: [] });
  assert.deepEqual(byId('ci').plan({ CI: 'true' }, ctx), { set: {}, unset: ['CI'] });
});

test('clean-env drops your shell but keeps what a process needs to start', () => {
  const base = { PATH: '/bin', HOME: '/home/me', NODE_ENV: 'development', AWS_SECRET: 'x', npm_config_registry: 'y' };
  const plan = byId('clean-env').plan(base, ctx);
  const env = envFor(plan, base);
  assert.equal(env.PATH, '/bin');
  assert.equal(env.HOME, '/home/me');
  assert.equal(env.NODE_ENV, undefined);
  assert.equal(env.AWS_SECRET, undefined);
  assert.equal(env.npm_config_registry, undefined);
  for (const key of CLEAN_ENV_KEEP) assert.ok(!plan.unset.includes(key), `${key} is kept`);
});

test('home and spacey-tmp ask for real directories, and spacey-tmp really has a space', () => {
  const home = byId('home').plan({}, ctx);
  assert.equal(home.set.HOME, '/tmp/fake/empty-home');
  assert.equal(home.set.USERPROFILE, home.set.HOME);
  const tmp = byId('spacey-tmp').plan({}, ctx);
  assert.match(tmp.set.TMPDIR, / /);
  assert.equal(tmp.set.TMP, tmp.set.TMPDIR);
  assert.equal(tmp.set.TEMP, tmp.set.TMPDIR);
});

test('the reproduce line is a command you can paste', () => {
  assert.equal(reproFor(byId('tz').plan({}, ctx), ['npm', 'test']), 'TZ=Pacific/Kiritimati npm test');
  assert.equal(reproFor(byId('ci').plan({ CI: '1' }, ctx), ['npm', 'test']), 'env -u CI npm test');
  const spacey = reproFor(byId('spacey-tmp').plan({}, ctx), ['npm', 'test']);
  assert.match(spacey, /TMPDIR='\/tmp\/fake\/a temp dir'/, 'a path with a space is quoted');
  const clean = reproFor(byId('clean-env').plan({ A: '1', B: '2', C: '3', D: '4', E: '5' }, ctx), ['npm', 'test']);
  assert.match(clean, /^env -i /, 'many unsets collapse into env -i rather than a wall of -u');
  assert.match(clean, /npm test$/);
});

test('parseArgs defaults to npm test and takes a command after -- or bare', () => {
  assert.deepEqual(parseArgs([]).command, ['npm', 'test']);
  assert.deepEqual(parseArgs(['--', 'yarn', 'test', '--ci']).command, ['yarn', 'test', '--ci']);
  assert.deepEqual(parseArgs(['node', '--test']).command, ['node', '--test']);
  assert.deepEqual(parseArgs(['--json', 'make', 'check']).command, ['make', 'check']);
  assert.equal(parseArgs(['--json', 'make', 'check']).json, true);
});

test('flags after the command belong to the command, not to otherbox', () => {
  const opts = parseArgs(['--', 'npm', 'test', '--json']);
  assert.equal(opts.json, false);
  assert.deepEqual(opts.command, ['npm', 'test', '--json']);
});

test('--only and --skip accept lists, and refuse an unknown id by name', () => {
  assert.deepEqual(parseArgs(['--only', 'tz,locale']).only, ['tz', 'locale']);
  assert.deepEqual(parseArgs(['--skip=home']).skip, ['home']);
  const bad = parseArgs(['--only', 'timezone']);
  assert.match(bad.error, /unknown environment "timezone"/);
  assert.match(bad.error, /Did you mean "tz"|Known:/);
  assert.match(parseArgs(['--only']).error, /needs a value/);
});

test('--only and --skip together is refused rather than guessed at', () => {
  assert.match(parseArgs(['--only', 'tz', '--skip', 'ci']).error, /not both/);
});

test('--timeout wants a positive number of seconds', () => {
  assert.equal(parseArgs(['--timeout', '30']).timeoutMs, 30000);
  assert.match(parseArgs(['--timeout', 'soon']).error, /positive number/);
  assert.match(parseArgs(['--timeout', '-5']).error, /positive number/);
});

test('an unknown option is an error naming the option', () => {
  assert.match(parseArgs(['--fast']).error, /unknown option "--fast"/);
});

test('selection honours --only and --skip', () => {
  assert.deepEqual(selectPerturbations({ only: ['tz'], skip: [] }).map((p) => p.id), ['tz']);
  assert.ok(!selectPerturbations({ only: [], skip: ['tz'] }).map((p) => p.id).includes('tz'));
  assert.equal(selectPerturbations({ only: [], skip: [] }).length, PERTURBATIONS.length);
});

test('unknownId always lists the real ids', () => {
  assert.match(unknownId('zzzzzzzz'), /Known: tz, locale/);
});

test('--list prints every id and what it catches', () => {
  const text = listText();
  for (const p of PERTURBATIONS) assert.ok(text.includes(p.id), `${p.id} listed`);
  assert.ok(text.includes('catches:'));
});

test('the human report names the failing environment and how to reproduce it', () => {
  const result = {
    version: '0.0.0',
    command: ['npm', 'test'],
    baseline: { ok: true, ms: 1000, code: 0 },
    results: [
      { id: 'tz', title: 'a clock that is not yours', catches: 'dates in local time', set: {}, unset: [], repro: 'TZ=X npm test', ok: false, ms: 900, code: 1, timedOut: false, tail: ['expected 12, got 2'] },
      { id: 'ci', title: 'the other side', catches: 'branching on CI', set: {}, unset: [], repro: 'CI=1 npm test', ok: true, ms: 800, code: 0, timedOut: false, tail: [] },
    ],
  };
  const text = humanReport(result);
  assert.match(text, /1 of 2 environments failed/);
  assert.match(text, /reproduce: TZ=X npm test/);
  assert.match(text, /expected 12, got 2/);
  assert.ok(!text.includes('CI=1 npm test'), 'a passing environment does not get a repro block');
});

test('a clean run says so without ceremony', () => {
  const text = humanReport({
    version: '0.0.0',
    command: ['npm', 'test'],
    baseline: { ok: true, ms: 10, code: 0 },
    results: [{ id: 'tz', title: 't', catches: 'c', set: {}, unset: [], repro: 'r', ok: true, ms: 10, code: 0, timedOut: false, tail: [] }],
  });
  assert.match(text, /All 1 environments pass/);
});

test('the json report is parseable and carries the failing ids', () => {
  const data = JSON.parse(
    jsonReport({
      version: '9.9.9',
      command: ['npm', 'test'],
      baseline: { ok: true, ms: 5, code: 0 },
      results: [{ id: 'tz', title: 't', catches: 'c', set: { TZ: 'X' }, unset: [], repro: 'r', ok: false, ms: 5, code: 1, timedOut: false, tail: ['boom'] }],
    })
  );
  assert.equal(data.tool, 'otherbox');
  assert.equal(data.version, '9.9.9');
  assert.deepEqual(data.failed, ['tz']);
  assert.equal(data.ok, false);
  assert.deepEqual(data.environments[0].set, { TZ: 'X' });
  assert.deepEqual(data.environments[0].tail, ['boom']);
});

test('tail keeps the end of the output', () => {
  const lines = Array.from({ length: 40 }, (_, i) => `line ${i}`).join('\n');
  const got = tail(lines, 3);
  assert.deepEqual(got, ['line 37', 'line 38', 'line 39']);
});

test('wrap does not split a word or lose one', () => {
  const text = wrap('one two three four five six seven', 12, '  ');
  assert.equal(text.split('\n').every((l) => l.startsWith('  ')), true);
  assert.equal(text.replace(/\s+/g, ' ').trim(), 'one two three four five six seven');
});
