# Changelog

## 0.3.0 — 2026-08-17
`--why <id>`: what a pass in an environment actually proves, and what it does not.

- `otherbox --why <id>` prints two lists for one environment — what a pass establishes,
  stated as narrowly as it is true, and what it says nothing about. `tz` cannot prove your
  code is timezone-correct (one zone is one sample); `clean-env` cannot remove `PATH`;
  `narrow` cannot resize a terminal. The wording is the README's wording, so there is one
  truth about this rather than a page version and a terminal version.
- `--why` on its own lists the environments; `--why all` prints every one; `--why --json`
  (or `--why <id> --json`) is the same content as data.
- An unknown id is refused with exit 2 and the same near-miss hint `--only` gives.
- `--why` reads nothing and runs nothing: no project, no command, no temp directory. It
  answers in an empty directory.
- A test fails if any environment lacks a non-empty `cannot` list, so a new environment
  cannot ship without its limits written down.

## 0.2.0 — 2026-08-17
`--repeat <n>`: run each environment n times and tell a flake from a finding.

- An environment that fails **every** run is a finding, and now says so:
  `failed all 3 runs — consistent, not a flake.`
- An environment that fails **some** runs is reported as `flaky` and is no longer counted
  as a finding: it is listed in a new `flaky` array in `--json` rather than in `failed`,
  because a test that fails at random fails under whichever change it landed on.
- A **baseline** that fails some runs and passes others is refused with exit 2, the same as
  a baseline that fails outright: a command that cannot agree with itself cannot be
  attributed to anything.
- `--json` gains `repeat`, per-environment `runs`/`failures`/`flaky`, baseline
  `runs`/`failures`, and the `flaky` id list.
- `--repeat` accepts 1–20 and rejects anything else before running your command.

## 0.1.0 — 2026-08-17
First release. Runs a command once at baseline, then once per environment that differs by
exactly one thing, and names the change that turned it red.

- Eight environments: `tz`, `locale`, `home`, `color`, `narrow`, `ci`, `clean-env`, `spacey-tmp`.
- Every failure reports what the environment catches, the last lines of output, and a
  paste-able reproduce line.
- `--only` / `--skip` / `--list` / `--json` / `--timeout`.
- A baseline that already fails is refused with exit 2 rather than perturbed.
- Zero dependencies, Node 18.17+.
