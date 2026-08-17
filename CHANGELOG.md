# Changelog

## 0.4.0 — 2026-08-17
A ninth environment: `node`, a second Node if this machine happens to have one.

- New environment `node`: prepends `PATH` with the bin directory of a second Node found on
  PATH, in nvm, or under `/usr/local/n/versions/node` — the machine can have more than one
  Node installed without ever putting the other one first, and this runs your command under
  it. This is the exact bug that started otherbox (see 0.1.0): a GitHub Actions runner keeps
  a second Node under `/usr/local/n` that a test on a single-Node box never sees.
- **It is deliberately not a version matrix.** It runs whichever second Node it finds first
  — one sample, not the range in `engines.node` — and it never downloads or invents one.
- **Honest skip, not a silent pass.** On a machine with only one Node (this box has exactly
  one), `node` is reported as `skip` with the reason named, counted in neither `failed` nor
  `pass`, and excluded from the "N environments tested" total. `--json` gets a top-level
  `skipped` array and a `skipped: true` entry per environment; a skip never sets the exit
  code to 1 on its own.
- README's "Honest limitations" no longer claims otherbox does not touch the Node version —
  that was true through 0.3.0 and is not true now. It says instead what `node` can and
  cannot do, in the same words `otherbox --why node` prints.
- `src/node-finder.js` is a new, fully-injectable module (env, execPath, platform, fs, exec
  are all parameters) so its tests never touch this machine's real filesystem or PATH — the
  skip path and the found path are both exercised without assuming which one a given machine
  is in. One additional test does touch the real machine, and only asserts the *shape* of
  the answer (`null`, or a real path and a `vX.Y.Z` version), never which one it is.

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
