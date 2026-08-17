# otherbox

**Your tests pass. On your machine.**

[Site](https://otherbox-site.vercel.app) · [npm](https://www.npmjs.com/package/otherbox) · [Changelog](CHANGELOG.md)

`otherbox` runs your test command once as-is, then once per environment that differs from
yours by exactly one thing — a timezone, a locale, an empty home directory, a temp path with
a space in it — and tells you which single change turned it red, with the line to reproduce it.

```
$ npx otherbox
otherbox — one thing different at a time
  command: npm test

  baseline    pass    6.1s    your environment, unchanged
  tz          FAIL    6.3s    a clock that is not yours
  locale      pass    6.0s    a language that is not yours
  home        pass    7.4s    a home directory with nothing in it
  color       pass    6.1s    a terminal that wants colour
  narrow      pass    6.0s    a narrow terminal
  ci          pass    6.2s    the other side of the CI branch
  clean-env   FAIL    6.0s    none of your shell
  spacey-tmp  pass    6.1s    a temp path with a space in it

2 of 8 environments failed. Your suite passes here and would not pass there.

tz — a clock that is not yours
  catches: dates formatted, parsed or compared in whatever timezone the machine
  happens to be in. Pacific/Kiritimati is UTC+14, so for most of your working day
  it is already tomorrow there.
  reproduce: TZ=Pacific/Kiritimati npm test
  last lines:
    AssertionError: expected '2026-08-17' to equal '2026-08-16'
```

No config, no plugin, no framework integration: it spawns your command, so it works with
`npm test`, `pytest`, `go test`, `make check`, anything.

## Install

```sh
npx otherbox              # runs npm test in eight environments
npm i -D otherbox         # or keep it in the project
```

Requires Node 18.17+. Zero dependencies.

## Use

```sh
otherbox                                  # default command: npm test
otherbox -- npm run test:unit             # any command, after --
otherbox --only tz,locale                 # just these
otherbox --skip home,clean-env            # all but these
otherbox --json                           # machine-readable, for CI
otherbox --repeat 3                       # run each environment 3 times: flake or finding?
otherbox --list                           # what each environment is and catches
otherbox --why clean-env                  # what a pass there proves — and what it does not
otherbox --timeout 120                    # seconds per run (default 600)
```

Exit codes: **0** every environment passed · **1** at least one failed or was flaky · **2** the
command was wrong, or your suite already failed — or failed only sometimes — before anything
was changed.

## The environments

Each one changes **one** thing. Nothing else moves, so a failure has exactly one suspect.

| id | one thing different | what it catches |
| --- | --- | --- |
| `tz` | `TZ=Pacific/Kiritimati` | dates formatted, parsed or compared in the machine's local time. UTC+14 is already tomorrow for most of your day. |
| `locale` | `LC_ALL=tr_TR.UTF-8` | `Intl` formatting, `localeCompare` sort order, `toLocaleUpperCase` — Turkish is the classic (`i` → `İ`). |
| `home` | `HOME` = a fresh empty directory | anything read out of your home that a new machine has not got: `~/.gitconfig`, `~/.npmrc`, credentials, a warm cache. |
| `color` | `FORCE_COLOR=3`, no `NO_COLOR` | output compared as plain text with ANSI escapes switched on — snapshots that match only because the pipe stripped colour. |
| `narrow` | `COLUMNS=40` | output wrapped, padded or truncated to the width of the window that ran it. |
| `ci` | `CI` flipped to whichever it is not | code and tests that branch on `CI` — the branch you never take where you can see the output. |
| `clean-env` | everything but a small allowlist removed | what your shell quietly hands the suite: `NODE_ENV`, `npm_config_*`, proxies, a token in your profile. |
| `spacey-tmp` | `TMPDIR` = a path containing a space | paths interpolated into shell commands without quotes; anything assuming a temp path is one word. |

`clean-env` keeps only `PATH`, `HOME`, `TMPDIR`/`TMP`/`TEMP`, `SHELL`, `USER`, `LOGNAME`,
`PWD`, `TERM`, `LANG` and the handful of variables Windows needs to start a process.

## Flake or finding? `--repeat`

A single red environment has two explanations: the change broke your suite, or your suite is
unreliable and this run is where the coin came up tails. `--repeat <n>` runs each environment
`n` times and separates them:

```
$ otherbox --repeat 3 --only tz,clean-env
  baseline   pass    6.1s    your environment, unchanged
  tz         FAIL    6.3s    a clock that is not yours
  clean-env  flaky   6.0s    none of your shell

1 of 2 environments failed every run. Your suite passes here and would not pass there. 1
more was flaky — failed some runs, passed others — which says nothing about the change.
```

- **fails every run** → a finding. `failed all 3 runs — consistent, not a flake.`
- **fails some runs** → `flaky`, and it is **not** listed under `failed` in `--json`; it gets its
  own `flaky` array. The environment is not the suspect; your suite is.
- **the baseline itself is not deterministic** → exit 2 before any environment runs. If your
  command cannot agree with itself twice, nothing done to it could be attributed.

The exit code still counts a flake as something to look at (1), because it is. The report just
refuses to blame a timezone for it. Maximum `--repeat` is 20; use `--only` to keep the wall
clock honest.

## What a pass is worth: `--why`

A green environment is a specific, narrow claim. `--why <id>` prints the claim and its
limits, in the same words as **Honest limitations** below — so the terminal and the README
cannot drift apart:

```
$ otherbox --why tz
tz — a clock that is not yours

  changes: TZ=Pacific/Kiritimati

  A passing tz proves
    - your command passes with TZ set to a zone fourteen hours ahead of UTC,
      where the local date is already tomorrow for most of your working day
    ...

  It cannot
    - prove the code is timezone-correct. One zone is one sample: a negative
      offset, a half-hour offset (Asia/Kolkata is +05:30) and a DST boundary are
      all unexercised — Kiritimati has no DST
    ...
```

`otherbox --why` on its own lists the eight environments, `--why all` prints every one in
full, and `--why --json` is the same content as data. It reads no files and starts no
processes: it answers in an empty directory, before there is a project to test.

Every environment must have a non-empty **It cannot** list — a test fails if one does not, so
a ninth environment cannot ship without someone writing down what it fails to prove.

## In CI

```yaml
- run: npx otherbox --json > otherbox.json
  continue-on-error: true      # while you work through what it finds
```

Or gate on a subset you have already cleaned: `npx otherbox --only tz,clean-env`.

## Honest limitations

- **It is not a flake detector, but it will not pretend a flake is a finding.** Each run is
  deterministic and one-variable-at-a-time, so without `--repeat` a test that fails at random
  looks like a failure of whichever environment it landed on. `--repeat <n>` is the answer to
  that question, not a way of hunting flakes generally.
- **It only changes the environment.** Not the OS, not the filesystem case-sensitivity, not
  the CPU architecture, not the Node version, not the network. A green `otherbox` does not
  mean your suite passes everywhere — it means it does not depend on these eight things.
- **A failure is not always a bug in the test.** `clean-env` failing may mean your suite
  genuinely needs a secret. Then the finding is "this suite cannot run on a clean checkout",
  which is worth knowing and worth writing down.
- **It runs your command N+1 times.** On a slow suite that is real wall-clock time; use
  `--only` on the ones you care about, or run it nightly rather than per-commit.
- **`locale` sets the variables, not the OS locale data.** Node's `Intl` follows `LC_ALL`
  regardless, which is what most JavaScript locale bugs turn on; a program that shells out to
  a C library may need that locale installed to show the same behaviour.

## Why

A test suite is green on the machine that wrote it. That is the one machine whose agreement
proves nothing. Everything above is a thing that has actually broken someone's build the
first time it ran somewhere else.

MIT © flossy-studio
