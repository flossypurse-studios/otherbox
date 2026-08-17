'use strict';

// What a pass in each environment actually proves — and, the half that matters,
// what it says nothing about.
//
// otherbox's whole claim is that a green run means something specific: your
// command survived one named change. That claim is only worth having if the
// reader can find out how narrow it is without reading the source. `--why <id>`
// prints it: two lists per environment, one of things a pass establishes and one
// of things a pass is silent about.
//
// The wording here is deliberately the same wording as README's "What this does
// not do" — one truth, said in the terminal as well as on the page. The map is
// keyed by the perturbation ids and a test asserts every id has a non-empty
// `cannot`, so a new environment cannot ship without someone writing down what
// it fails to prove.
//
// Pure data and string building: reads no files, spawns nothing, needs no
// project. It answers in an empty directory.

const { PERTURBATIONS, IDS, byId } = require('./perturbations');
const { wrap } = require('./report');

/**
 * One entry per environment.
 *
 * `proves` — what a pass establishes, stated as narrowly as it is true.
 * `cannot` — what a pass says nothing about. Never softened: if one zone is one
 *            sample, or the variable is only a convention, that belongs here in
 *            those words.
 */
const WHY = {
  tz: {
    proves: [
      'your command passes with TZ set to a zone fourteen hours ahead of UTC, where the local date is already tomorrow for most of your working day',
      'that nothing under test turns the process timezone into a different date, ordering or format that an assertion then rejects',
    ],
    cannot: [
      'prove the code is timezone-correct. One zone is one sample: a negative offset, a half-hour offset (Asia/Kolkata is +05:30) and a DST boundary are all unexercised — Kiritimati has no DST',
      'see a timezone that comes from anywhere but TZ — a config file, a database session, a hard-coded "America/New_York", a browser',
      'move the clock. Only the zone changed; the instant is still now, so nothing here tests a date in the past or the future',
    ],
  },
  locale: {
    proves: [
      'your command passes with LANG, LANGUAGE and LC_ALL set to tr_TR.UTF-8 — the locale that breaks case conversion ("i".toLocaleUpperCase() is "\u0130") and moves sort order',
      'that no assertion depends on your locale happening to be the one the strings were written in',
    ],
    cannot: [
      'prove the process actually switched locale. If the machine has no tr_TR locale installed, or the runtime was built without full ICU, the change can be quietly ignored and the environment passes for the wrong reason',
      'speak for right-to-left scripts, non-Latin digits or non-Gregorian calendars. One locale is one sample',
      'catch a locale chosen by your application rather than the environment — a request header, a user setting, an explicit "en-US" argument',
    ],
  },
  home: {
    proves: [
      'your command passes with HOME (and USERPROFILE) pointing at a directory that is empty: no ~/.gitconfig, no ~/.npmrc, no credentials, no cache you warmed months ago',
      'that nothing under test needs a file in your home directory that a fresh machine would not have',
    ],
    cannot: [
      'be a fresh machine. Your PATH, your installed toolchain, your node_modules and your global npm prefix are all untouched — the home directory is empty, the box is not',
      'empty a cache that lives somewhere else: an XDG directory pointed outside HOME, /tmp, node_modules/.cache',
      'catch a credential handed over by the environment rather than by a dotfile. That is what clean-env removes',
    ],
  },
  color: {
    proves: [
      'your command passes with FORCE_COLOR=3 set and NO_COLOR removed, so libraries that honour the convention emit ANSI escapes',
      'that no assertion or snapshot only matches because the colour happened to be stripped on the way to it',
    ],
    cannot: [
      'force colour on. FORCE_COLOR is a convention — chalk and supports-color honour it, and anything doing its own tty detection, or writing escapes unconditionally, does not',
      'say anything about how the output looks: contrast, readability, or whether the colours mean what you think',
      'prove the reverse, that your output is coloured when a user asks for colour. Nothing here checks that NO_COLOR is respected',
    ],
  },
  narrow: {
    proves: [
      'your command passes with COLUMNS=40, a window half the width most output is written for',
      'that nothing under test wraps, pads or truncates to a width it read from the environment and then compares as a fixed string',
    ],
    cannot: [
      'resize a terminal. The command is spawned without a tty, so process.stdout.columns stays undefined and only code that reads COLUMNS — or a library that falls back to it — sees the narrow width',
      'catch wrapping done by the terminal itself. If your program writes long lines and the window folds them, that happens after your program is done and no test sees it',
      'say anything about very wide terminals, or about a window resized while the command runs',
    ],
  },
  ci: {
    changes: "CI=1 if you do not have CI set, and CI removed if you do",
    proves: [
      'your command passes on the other side of every `if (process.env.CI)` branch — CI set if yours is unset, removed if yours is set',
      'that the path you never look at, because you always run on the machine where CI is not set, is at least taken once',
    ],
    cannot: [
      'be a CI run. Nothing else about a CI machine is reproduced: no clean checkout, no different operating system or Node version, no missing display, no network policy, no time limit',
      'know which other CI variable your code reads. Only CI is flipped; GITHUB_ACTIONS, JENKINS_URL, BUILDKITE and the rest keep whatever value they already had',
      'tell you which side is the real one. It proves both sides run, not that both sides are right',
    ],
  },
  'clean-env': {
    changes: 'every variable your shell contributed is removed; only PATH, HOME, TMPDIR, TERM, LANG and the few the OS needs survive',
    proves: [
      'your command passes with every variable your shell contributed removed, keeping only the small allowlist a process needs to start (PATH, HOME, TMPDIR, TERM and the Windows equivalents)',
      'that nothing under test quietly depends on NODE_ENV, an npm_config_*, a proxy setting, or a token that lives in your shell profile and nowhere else',
    ],
    cannot: [
      'remove PATH. It is kept, so the tools it points at — including the Node and npm you are running — are still yours. This is a clean environment on your machine, not a clean machine',
      'tell you which dropped variable mattered when it fails, only that something in the set did. Put one back and re-run with --only clean-env',
      'touch a secret that is read from a file. A token in ~/.npmrc survives this environment; it does not survive home',
    ],
  },
  'spacey-tmp': {
    proves: [
      'your command passes with TMPDIR, TMP and TEMP pointing at a directory whose path contains a space',
      'that nothing under test interpolates the temp path into a shell command without quoting it, or assumes a temporary directory is one unbroken word',
    ],
    cannot: [
      'move the rest of your paths. Only the temp directory has a space: your project directory, your home directory and everything on PATH are wherever they already were',
      'speak for other hostile paths — quotes, non-ASCII, emoji, a very long path, a backslash on Windows. One space is one sample',
      'catch code that ignores TMPDIR and writes to a hard-coded /tmp, which is most of the code that gets this wrong on Windows',
    ],
  },
  node: {
    changes:
      'PATH is prepended with the bin directory of a second Node found on this machine, if any \u2014 the rest of the environment is untouched',
    proves: [
      'your command passes under a Node that is not the one otherbox itself is running on, if this machine happens to have one installed already (found on PATH, in nvm, or under n)',
      'that nothing under test hard-codes a syntax feature, a Buffer or Intl default, or a native module build that only the other Node happens to have',
    ],
    cannot: [
      'be a version matrix. It runs whatever second Node is already installed nearby \u2014 one sample of one other version, not the range in your engines field, and not a version it can download or invent',
      'run at all on a machine with only one Node. There is nothing to compare against, so this environment is skipped and says so by name \u2014 a skip is not a pass, and otherbox never reports one as if it were',
      'tell you which Node it found, or that it is a newer one rather than an older one, without you reading the reproduce line \u2014 the version otherbox picks is whichever it finds first, not the one you would have chosen',
    ],
  },
};

/** The one-line description of an environment, reused from its perturbation. */
function summary(id) {
  const p = byId(id);
  return p ? p.title : '';
}

/**
 * Look up one environment. Unknown ids are refused the way --only refuses them:
 * name the real ids, never guess silently.
 */
function whyFor(id) {
  const wanted = String(id === undefined || id === null ? '' : id).trim();
  if (!WHY[wanted] || !byId(wanted)) {
    return { ok: false, error: `unknown environment "${wanted}" in --why. Known: ${IDS.join(', ')}.` };
  }
  return { ok: true, id: wanted, entry: WHY[wanted] };
}

function bullets(lines) {
  return lines.map((line) => '    - ' + wrap(line, 74, '      ').slice(6)).join('\n');
}

/** The full text for one environment: what a pass proves, then what it cannot. */
function whyText(id) {
  const found = whyFor(id);
  if (!found.ok) return found;
  const p = byId(found.id);
  const plan = p.plan({}, { tempDir: (name) => `/tmp/…/${name}` });
  const set = Object.entries(plan.set || {}).map(([k, v]) => `${k}=${v}`);
  const changes = found.entry.changes
    ? found.entry.changes
    : set.length
    ? set.join(' ')
    : (plan.unset || []).length
      ? `unsets ${plan.unset.join(', ')}`
      : 'depends on your environment';
  const text =
    `${found.id} — ${summary(found.id)}\n\n` +
    `${wrap(`changes: ${changes}`, 78, '  ')}\n\n` +
    `  A passing ${found.id} proves\n${bullets(found.entry.proves)}\n\n` +
    `  It cannot\n${bullets(found.entry.cannot)}\n`;
  return { ok: true, id: found.id, text };
}

/** Every environment, one line each, plus how to read the rest. */
function whyIndex() {
  const width = Math.max(...IDS.map((id) => id.length)) + 2;
  const lines = IDS.map((id) => `  ${id}${' '.repeat(width - id.length)}${summary(id)}`);
  return (
    'otherbox environments, and what a pass in each one is worth\n\n' +
    lines.join('\n') +
    '\n\n' +
    '  otherbox --why <id>    what a pass there proves, and what it does not\n' +
    '  otherbox --why all     every environment, in full\n\n' +
    '  A green run is only worth the specific claims it makes. These are the\n' +
    '  claims, and their limits, in the same words as the README.\n'
  );
}

/** Every environment in full, in run order — `--why all`. */
function whyAll() {
  return IDS.map((id) => whyText(id).text).join('\n');
}

/**
 * The same content as data, for `--why --json`: a docs page or a reviewer's
 * script should not have to scrape terminal output to get it.
 */
function whyJson(ids = IDS) {
  return {
    tool: 'otherbox',
    environments: [].concat(ids).map((id) => ({
      id,
      title: summary(id),
      catches: byId(id).catches,
      proves: WHY[id].proves.slice(),
      cannot: WHY[id].cannot.slice(),
    })),
  };
}

module.exports = { WHY, whyFor, whyText, whyIndex, whyAll, whyJson, summary, PERTURBATIONS };
