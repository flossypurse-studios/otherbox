# Changelog

## 0.1.0 — 2026-08-17
First release. Runs a command once at baseline, then once per environment that differs by
exactly one thing, and names the change that turned it red.

- Eight environments: `tz`, `locale`, `home`, `color`, `narrow`, `ci`, `clean-env`, `spacey-tmp`.
- Every failure reports what the environment catches, the last lines of output, and a
  paste-able reproduce line.
- `--only` / `--skip` / `--list` / `--json` / `--timeout`.
- A baseline that already fails is refused with exit 2 rather than perturbed.
- Zero dependencies, Node 18.17+.
