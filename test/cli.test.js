'use strict';

const test = require('node:test');
const assert = require('node:assert');
const path = require('node:path');
const os = require('node:os');
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

// --repeat: telling a flake from a real dependency on the environment.

function counterFile() {
  return path.join(os.tmpdir(), `otherbox-counter-${process.pid}-${Math.random().toString(36).slice(2)}`);
}

test('--repeat names an environment that fails only sometimes as flaky, not as a finding', async () => {
  const r = await otherbox(['--repeat', '2', '--only', 'tz', '--', ...fixture('flaky-under-tz.js')], {
    OTHERBOX_TEST_COUNTER: counterFile(),
  });
  assert.equal(r.code, 1, r.stdout + r.stderr);
  assert.match(r.stdout, /tz\s+flaky/);
  assert.match(r.stdout, /failed 1 of 2 runs/);
  assert.match(r.stdout, /unreliable, not the environment/);
});

test('--repeat says out loud when a failure was consistent', async () => {
  const r = await otherbox(['--repeat', '2', '--only', 'tz', '--', ...fixture('utc-hours.js')]);
  assert.equal(r.code, 1);
  assert.match(r.stdout, /tz\s+FAIL/);
  assert.match(r.stdout, /failed all 2 runs — consistent, not a flake/);
});

test('--repeat refuses a baseline that is not deterministic, with exit 2', async () => {
  const r = await otherbox(['--repeat', '2', '--only', 'ci', '--', ...fixture('flaky-always.js')], {
    OTHERBOX_TEST_COUNTER: counterFile(),
  });
  assert.equal(r.code, 2);
  assert.match(r.stderr, /failed 1 of 2 times before anything was changed/);
  assert.match(r.stderr, /not deterministic here/);
  assert.ok(!r.stdout.includes('reproduce:'), 'no report from an unreliable baseline');
});

test('--repeat carries run counts into --json', async () => {
  const r = await otherbox(['--json', '--repeat', '2', '--only', 'tz,ci', '--', ...fixture('flaky-under-tz.js')], {
    OTHERBOX_TEST_COUNTER: counterFile(),
  });
  assert.equal(r.code, 1);
  const data = JSON.parse(r.stdout);
  assert.equal(data.repeat, 2);
  assert.deepEqual(data.failed, [], 'a flake is not a finding');
  assert.deepEqual(data.flaky, ['tz']);
  const tz = data.environments.find((e) => e.id === 'tz');
  assert.equal(tz.runs, 2);
  assert.equal(tz.failures, 1);
  assert.equal(tz.flaky, true);
  assert.equal(data.baseline.runs, 2);
  assert.equal(data.baseline.failures, 0);
});

test('--repeat rejects nonsense before running anything', async () => {
  for (const bad of ['0', '-1', '2.5', 'twice']) {
    const r = await otherbox(['--repeat', bad, '--', ...fixture('always-pass.js')]);
    assert.equal(r.code, 2, `--repeat ${bad}`);
    assert.match(r.stderr, /--repeat needs a whole number/);
  }
  const tooMany = await otherbox(['--repeat', '50', '--', ...fixture('always-pass.js')]);
  assert.equal(tooMany.code, 2);
  assert.match(tooMany.stderr, /The limit is 20/);
});
