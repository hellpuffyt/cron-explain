# Production readiness — cron-explain

Audit of the `audit/production-readiness` branch. This document records evidence; it does not
award a production-ready label.

## Scope and architecture

Zero-dependency 5-field cron parser (`parse.ts`, `fields.ts`), prose explanation (`explain.ts`),
next-run search in an IANA timezone using `Intl.DateTimeFormat` wall-clock reads over real UTC
minutes with day/hour skipping (`schedule.ts`), text/JSON report and CLI.

## Platforms and prerequisites

Node.js >= 20 with full ICU (default Node builds). Verified on macOS (Apple Silicon): full gate on
Node 24.19.0, tests on Node 20 and 22. Results depend on the tz database shipped with Node's ICU.
CI matrix (default branch): ubuntu / windows / macOS x Node 20 / 22 / 24; Windows not run locally.

## Clean-clone setup (README "Install")

`git clone`, `npm ci`, tests (120 passed), typecheck, lint, `npm run build`, `npm link` (throwaway
prefix): all 0. The linked CLI printed the README example and found Monday 2026-03-09 00:30 EDT for
`30 0 * * MON` after the Sunday DST change. Tree clean afterwards.

Baseline README example was not real output: it labelled 2026-09-01 "Mon" (it is a Tuesday) and
showed different prose; it now shows a real run with `--from`. The npm `cron-explain` package is a
different author's project; the README now installs from source.

## Commands executed (CI-equivalent, local)

| Command | Baseline (main @ 72e31fd) | Audit branch |
|---|---|---|
| `npm ci` | 0 | 0 |
| `npm test` | 0 — 104 passed, 0 failed, 0 skipped | 0 — 120 passed, 0 failed, 0 skipped (Node 24, 20, 22) |
| `npm run typecheck` / `npm run lint` | 0 / 0 | 0 / 0 |
| `npm run coverage` (lines / branches) | 96.95 % / 91.3 % | 97 % / 91.95 % |
| `npm run build && node bin/cron-explain.js "0 9 * * *" --count 1` | 0 | 0 |
| CI inline scripts (run locally) | — | 0 |
| `npm audit --omit=dev` | 0 (no runtime deps) | 0 |
| `npm audit` (dev) | 7 (2 critical, 3 high, 2 moderate) | 4 (2 critical, 2 moderate) — vitest major needed |

## Reference comparison

`test/reference.test.ts` compares `nextRuns` with an exhaustive reference (wall clock read at every
UTC minute, same match rule) for 11 expressions x 13 DST windows (New York, London, Santiago and
Havana midnight transitions, Lord Howe 30-minute DST, Chatham :45 offset, Sydney, Kolkata) over 10
days each. On the baseline, with the `1-7` expression removed (it did not parse there), 3 windows
disagreed — every spring-forward window in a zone whose transition is not at midnight
(New York, London, Sydney). A comparison against an external cron implementation was not done:
real cron daemons differ on DST (e.g. vixie-cron runs a repeated fall-back time once), and this
tool documents returning both instants.

## Bugs fixed (tests in `test/reference.test.ts`; all 16 fail on baseline)

| Bug | Impact | Fix |
|---|---|---|
| Day-skip jumped a full 24h past a 23h spring-forward day | early runs on the next day silently skipped — `30 0 * * MON` after a Sunday DST change reported the next week | jump stops 3h short, hour steps finish |
| `1-7`, `MON-SUN` rejected | valid cron rejected | 7 kept as range end, mapped to Sunday |
| `in` name lookup | `constructor`/`toString` accepted as values | own-key lookup |
| bin without `+x` | dirty clone after npm install | mode committed |

## Security review

No file or network I/O beyond stdout; input is one expression; search bounded by a 4-year horizon
with skipping. Prototype-name lookup fixed. Workflow permissions already declared. 1 commit scanned,
no secrets.

## Acceptance checklist

| Item | Expected | Test | Result |
|---|---|---|---|
| Parse supported syntax, reject unsupported | as README | `test/parse.test.ts`, regressions | pass |
| Prose explanation | as README | `test/explain.test.ts` | pass |
| DST-correct next runs | equals exhaustive reference | `test/reference.test.ts` | pass |
| POSIX DOM/DOW union | either matches | `test/schedule.test.ts` | pass |
| CLI / JSON / exit codes | as README | `test/cli.test.ts`, `test/report.test.ts` | pass |

## CI status

Default branch (`main` @ 72e31fd): last run `success`. Audit branch: pending until pushed.

## Limitations

`L`, `W`, `#`, seconds and wrap-around ranges unsupported (documented); results follow Node's ICU
tz data; reference test covers 2026 transitions only.

## Tested commit

`9a34bb1c08043cc09cbded9c0960c9e974e136cc` (clean clone) plus README-only `d980c16`, 2026-10-22.

## Classification proposal

**Partially Verified** — verified locally on Node 20/22/24 and from a clean clone with a
differential DST reference; audit-branch CI (incl. Windows) not yet run.
