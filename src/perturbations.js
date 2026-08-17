'use strict';

// Every perturbation changes exactly ONE thing about the environment a command
// runs in — the kind of thing that differs between your laptop and someone
// else's, or between your laptop and CI. Nothing else moves. If the command
// passes at baseline and fails here, the one thing named is the reason.

const CLEAN_ENV_KEEP = [
  // The minimum a process needs to be able to run at all, plus what the OS
  // itself owns. Everything else your shell provides is deliberately dropped.
  'PATH',
  'HOME',
  'TMPDIR',
  'TMP',
  'TEMP',
  'SHELL',
  'USER',
  'LOGNAME',
  'PWD',
  'TERM',
  'LANG',
  // Windows cannot start a process without these.
  'SystemRoot',
  'SYSTEMROOT',
  'SystemDrive',
  'ComSpec',
  'COMSPEC',
  'PATHEXT',
  'WINDIR',
  'USERPROFILE',
  'NUMBER_OF_PROCESSORS',
  'PROCESSOR_ARCHITECTURE',
];

const PERTURBATIONS = [
  {
    id: 'tz',
    title: 'a clock that is not yours',
    catches:
      'dates formatted, parsed or compared in whatever timezone the machine happens to be in. ' +
      'Pacific/Kiritimati is UTC+14, so for most of your working day it is already tomorrow there.',
    plan() {
      return { set: { TZ: 'Pacific/Kiritimati' }, unset: [] };
    },
  },
  {
    id: 'locale',
    title: 'a language that is not yours',
    catches:
      'Intl date and number formatting, localeCompare sort order, and toLocaleUpperCase. ' +
      'Turkish is the classic: "i".toLocaleUpperCase() is "\u0130", and sorting moves.',
    plan() {
      return {
        set: { LANG: 'tr_TR.UTF-8', LANGUAGE: 'tr_TR', LC_ALL: 'tr_TR.UTF-8' },
        unset: [],
      };
    },
  },
  {
    id: 'home',
    title: 'a home directory with nothing in it',
    catches:
      'anything read out of your home directory that a fresh machine would not have: ' +
      '~/.gitconfig, ~/.npmrc, credentials, a warm cache, a tool you configured once and forgot.',
    plan(env, ctx) {
      const dir = ctx.tempDir('empty-home');
      return { set: { HOME: dir, USERPROFILE: dir }, unset: [] };
    },
  },
  {
    id: 'color',
    title: 'a terminal that wants colour',
    catches:
      'output compared as plain text while ANSI escapes are switched on \u2014 assertions and ' +
      'snapshots that only match because the pipe your tests run through stripped the colour.',
    plan() {
      return { set: { FORCE_COLOR: '3' }, unset: ['NO_COLOR'] };
    },
  },
  {
    id: 'narrow',
    title: 'a narrow terminal',
    catches:
      'output wrapped, padded or truncated to the width of the window that ran it. ' +
      'Eighty columns is an assumption, not a fact.',
    plan() {
      return { set: { COLUMNS: '40' }, unset: [] };
    },
  },
  {
    id: 'ci',
    title: 'the other side of the CI branch',
    catches:
      'code and tests that behave differently when CI is set \u2014 the branch you never take ' +
      'on the machine where you actually look at the output.',
    plan(env) {
      return env.CI ? { set: {}, unset: ['CI'] } : { set: { CI: '1' }, unset: [] };
    },
  },
  {
    id: 'clean-env',
    title: 'none of your shell',
    catches:
      'everything your shell is quietly handing the suite: NODE_ENV, npm_config_*, proxies, ' +
      'a token in your profile that makes a network test pass on your box and nowhere else.',
    plan(env) {
      const keep = new Set(CLEAN_ENV_KEEP);
      return { set: {}, unset: Object.keys(env).filter((k) => !keep.has(k)) };
    },
  },
  {
    id: 'spacey-tmp',
    title: 'a temp path with a space in it',
    catches:
      'paths interpolated into a shell command without quotes, and anything that assumes a ' +
      'temporary directory is one unbroken word.',
    plan(env, ctx) {
      const dir = ctx.tempDir('a temp dir');
      return { set: { TMPDIR: dir, TMP: dir, TEMP: dir }, unset: [] };
    },
  },
];

const IDS = PERTURBATIONS.map((p) => p.id);

function byId(id) {
  return PERTURBATIONS.find((p) => p.id === id);
}

// Applies a plan to a base environment. Pure: returns a new object.
function envFor(plan, baseEnv) {
  const env = { ...baseEnv };
  for (const key of plan.unset) delete env[key];
  for (const [key, value] of Object.entries(plan.set)) env[key] = value;
  return env;
}

function quote(value) {
  return /^[A-Za-z0-9_./:@%+=-]+$/.test(value) ? value : `'${String(value).replace(/'/g, `'\\''`)}'`;
}

// The line a human can paste to see the same failure themselves.
function reproFor(plan, command) {
  const parts = [];
  const unset = plan.unset;
  const set = Object.entries(plan.set);
  if (unset.length > 3) {
    // Too many to list one by one; env -i with an allowlist says it in one line.
    parts.push('env -i ' + ['PATH', 'HOME', 'TMPDIR'].map((k) => `${k}="${k}"`).join(' '));
  } else if (unset.length > 0) {
    parts.push('env ' + unset.map((key) => `-u ${key}`).join(' '));
  }
  for (const [key, value] of set) parts.push(`${key}=${quote(value)}`);
  return [...parts, ...command].join(' ');
}

module.exports = { PERTURBATIONS, IDS, byId, envFor, reproFor, CLEAN_ENV_KEEP, quote };
