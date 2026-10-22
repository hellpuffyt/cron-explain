# Changelog

## Unreleased

### Fixed

- Next-run search skipped matches right after a spring-forward day: the
  day-skip jumped a full 24h past a 23h local day, so e.g. `30 0 * * MON`
  after a Sunday DST change (New York, London, Sydney) missed Monday 00:30 and
  reported the following week. Jumps now stop short and re-read the clock;
  `test/reference.test.ts` checks every result against an exhaustive scan.
- `1-7` / `MON-SUN` were rejected as wrap-around ranges; 7 is Sunday.
- `constructor`, `toString` etc. were accepted as month/day names.
- The bin launcher is committed with its executable bit.
- Dev dependencies updated with `npm audit fix`.

### Documentation

- README install section: not on npm (the npm `cron-explain` is unrelated).

## 0.1.0 — 2026-09-01

Initial release.

- 5-field cron parsing: literals, `*`, ranges, steps (`*/n`, `a-b/n`,
  `n/step`), comma lists, month/day names, and the POSIX day-of-month
  **or** day-of-week union rule.
- Next-run search over real UTC instants using `Intl.DateTimeFormat`
  (real IANA tz data, not a hand-rolled approximation): a wall-clock time
  skipped by a spring-forward is never matched, and one repeated by a
  fall-back is matched twice, at its two real instants. A day/hour
  fast-forward skips whole disqualified calendar days/hours in one jump
  instead of scanning every minute inside them — a sparse or
  unsatisfiable schedule (e.g. day 30 in February) resolves in
  milliseconds instead of walking a multi-year horizon minute by minute.
- Prose explanation of common patterns (fixed daily time, every-N-minutes,
  weekday/month ranges and lists) with a precise structural fallback for
  combinations that don't fit an idiomatic phrase.
- `cron-explain "<expr>"` CLI: `--timezone`, `--count`, `--from`,
  `--format text|json`. Exit `0` on a successful parse (a truncated
  result is an honest fact about the expression, not a failure), `1` on
  a parse/usage error.
- Zero runtime dependencies; Node 20+.
