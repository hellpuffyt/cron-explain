# cron-explain

Parse a 5-field cron expression, explain it in prose, and preview the next
runs in a chosen timezone — **correctly across DST edges**, because the
search works in real instants and only ever asks a timezone what its own
wall clock said, rather than approximating the transition by hand. Zero
runtime dependencies.

```console
$ cron-explain "*/15 9-17 * * MON-FRI" --timezone America/New_York --count 3
Every 15 minutes, starting at minute 0, during hour 09 through 17, on Monday
through Friday.

timezone: America/New_York

  Mon, Sep 01, 2026, 09:00  (2026-09-01T13:00:00.000Z)
  Mon, Sep 01, 2026, 09:15  (2026-09-01T13:15:00.000Z)
  Mon, Sep 01, 2026, 09:30  (2026-09-01T13:30:00.000Z)
```

## Why DST correctness is the actual point

The search never does timezone arithmetic itself. It steps forward one
real UTC minute at a time and asks `Intl.DateTimeFormat` (backed by your
system's IANA tz database) what that instant's wall clock reads in the
target zone — the same source of truth every correct scheduler uses. That
gets both DST edges right *by construction*, not by a special case:

- **Spring forward** (a wall-clock time is skipped, e.g. 2:30 AM never
  happens): that time is simply never the local reading of any real
  instant, so the search naturally never matches it — no job silently
  fires at the wrong moment.
- **Fall back** (a wall-clock time happens twice, e.g. 1:30 AM occurs at
  two different instants): both instants format to that same wall-clock
  reading, so both are found and returned as two separate runs — matching
  what actually happens on the clock, not hiding the repeat.

## Install

This tool is **not published to npm**. The `cron-explain` package on the npm
registry is an unrelated project by another author — do not `npm install`
or `npx` that name expecting this tool. Install from a clone:

```console
git clone https://github.com/hellpuffyt/cron-explain
cd cron-explain
npm ci && npm run build
npm link        # puts `cron-explain` on your PATH (or: node bin/cron-explain.js)
```

## How the DST claim is tested

`test/reference.test.ts` compares `nextRuns` against an exhaustive reference
that reads the wall clock at *every* UTC minute, for 11 expressions across 13
spring-forward/fall-back windows (hour-aligned, midnight transitions in
Santiago and Havana, Lord Howe's 30-minute DST, Chatham's :45 offset, the
southern hemisphere, and a no-DST zone). The search skips ahead for speed and
must never disagree with the exhaustive scan.

## Cron syntax supported

Standard 5-field cron: minute, hour, day-of-month, month, day-of-week.
`*`, literal values, ranges (`a-b`), steps (`*/n`, `a-b/n`, `n/step`), and
comma-separated lists of any of those. Month and day-of-week accept
3-letter names (`JAN`, `MON`, case-insensitive). Day-of-week `0` and `7`
both mean Sunday, including as the end of a range (`1-7`, `MON-SUN`). The classic day-of-month
**or** day-of-week union rule applies when both are restricted (neither
is a bare `*`) — matching real cron(8) behaviour, not the "AND" a naive
reading would suggest.

**Deliberately unsupported**: `L`, `W`, `#`, seconds, and wrap-around
ranges like `22-2`. These are real extensions (vixie-cron, Quartz) with
genuinely different semantics between implementations; guessing one
reading would misrepresent the schedule.

## Usage

```console
cron-explain "0 9 * * MON-FRI"
cron-explain "0 9 * * MON-FRI" --timezone Europe/London --count 10
cron-explain "0 9 * * MON-FRI" --from 2027-01-01T00:00:00Z --format json
```

`--count` defaults to 5, `--timezone` defaults to `UTC`, `--from` defaults
to now. Exit code is always `0` on a successful parse — a truncated result
(the search horizon ran out before finding `--count` runs, which can
happen for a genuinely rare or self-contradictory schedule like day 31 in
February) is an honest fact about the expression, not a tool failure.

## Security

cron-explain parses one expression and formats dates; it reads no files and
makes no network calls. Please report vulnerabilities privately as described
in [SECURITY.md](SECURITY.md).

## Development

```console
npm ci
npm test
npm run typecheck
npm run lint
npm run build
```

MIT licensed.
