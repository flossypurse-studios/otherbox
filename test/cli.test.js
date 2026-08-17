'use strict';

const test = require('node:test');
const assert = require('node:assert');
const path = require('node:path');
const { execFile } = require('node:child_process');

const BIN = path.join(__dirname, '..', 'bin', 'otherbox.js');
const FIX = path.join(__dirname, 'fixtures');

// The tests below pin the environment they start from, so that this suite says
// the same thing on every machine — which is, after all, the point of the tool.
const BASE = {
  PATH: process.env.PATH,
  HOME: process.env.HOME || '/tmp',
  TMPDIR: process.env.TMPDIR || '/tmp',
  TZ: 'UTC',
};

function otherbox(args, env = {}) {
  return new Promise((resolve) => {
    execFile(process.execPath, [BIN, ...args], { env: { ...BASE, ...env }, timeout: 90000 }, (err, stdout, stderr) => {
      resolve({ code: err && typeof err.code === 'number' ? err.code : err ? 1 : 0, stdout, stderr });
    });
  });
}

const fixture = (name) => ['node', path.join(FIX, name)];

test('--version and --help exit 0 and say what the tool is', async () => {
  const v = await otherbox(['--version']);
  assert.equal(v.code, 0);
  assert.match(v.stdout, /^\d+\.\d+\.\d+/);
  const h = await otherbox(['--help']);
  assert.equal(h.code, 0);
  assert.match(h.stdout, /one thing different|box that isn't yours/);
});

test('--list works without running anything at all', async () => {
  const r = await otherbox(['--list']);
  assert.equal(r.code, 0);
  assert.match(r.stdout, /spacey-tmp/);
  assert.match(r.stdout, /clean-env/);
});

test('a command that survives every environment exits 0', async () => {
  const r = await otherbox(['--', ...fixture('always-pass.js')]);
  assert.equal(r.code, 0, r.stdout + r.stderr);
  assert.match(r.stdout, /environments pass/);
});

test('a suite that already fails is refused with exit 2, not perturbed', async () => {
  const r = await otherbox(['--', ...fixture('always-fail.js')]);
  assert.equal(r.code, 2);
  assert.match(r.stderr, /failed before anything was changed/);
  assert.match(r.stderr, /broken before anything changed/);
  assert.ok(!r.stdout.includes('reproduce:'), 'no report when the baseline is red');
});

test('a test that only passes in your timezone is caught, named and reproducible', async () => {
  const r = await otherbox(['--only', 'tz', '--', ...fixture('utc-hours.js')]);
  assert.equal(r.code, 1);
  assert.match(r.stdout, /tz\s+FAIL/);
  assert.match(r.stdout, /reproduce: TZ=Pacific\/Kiritimati node /);
  assert.match(r.stdout, /expected hour 12, got/);
});

test('a test that only passes because of your shell is caught by clean-env', async () => {
  const r = await otherbox(['--only', 'clean-env', '--', ...fixture('needs-secret.js')], {
    OTHERBOX_FIXTURE_SECRET: 'hunter2',
  });
  assert.equal(r.code, 1);
  assert.match(r.stdout, /clean-env\s+FAIL/);
  assert.match(r.stdout, /OTHERBOX_FIXTURE_SECRET is missing/);
  assert.match(r.stdout, /reproduce: env -[iu] /);
});

test('--json is parseable and carries the same verdict as the exit code', async () => {
  const r = await otherbox(['--json', '--only', 'tz,ci', '--', ...fixture('utc-hours.js')]);
  assert.equal(r.code, 1);
  const data = JSON.parse(r.stdout);
  assert.equal(data.tool, 'otherbox');
  assert.equal(data.ok, false);
  assert.deepEqual(data.failed, ['tz']);
  assert.equal(data.environments.length, 2);
  assert.equal(data.environments.find((e) => e.id === 'ci').ok, true);
  assert.deepEqual(data.environments.find((e) => e.id === 'ci').tail, [], 'a passing run carries no output');
});

test('--timeout kills a run that never finishes and reports it as that', async () => {
  const r = await otherbox(['--only', 'ci', '--timeout', '2', '--', ...fixture('slow.js')]);
  assert.equal(r.code, 2, 'the baseline hangs too, so the baseline is what fails');
  assert.match(r.stderr, /failed before anything was changed/);
});

test('an unknown environment is refused with exit 2 before anything runs', async () => {
  const r = await otherbox(['--only', 'timezone', '--', ...fixture('always-pass.js')]);
  assert.equal(r.code, 2);
  assert.match(r.stderr, /unknown environment "timezone"/);
});

test('a command that does not exist fails at the baseline, honestly', async () => {
  const r = await otherbox(['--', 'this-command-does-not-exist-otherbox']);
  assert.equal(r.code, 2);
  assert.match(r.stderr, /failed before anything was changed/);
});
