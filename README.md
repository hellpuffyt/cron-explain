# cron-explain

Parse a 5-field cron expression, explain it in prose, and preview the next
runs in a chosen timezone — **correctly across DST edges**, because the
search works in real instants and only ever asks a timezone what its own
wall clock said, rather than approximating the transition by hand. Zero
runtime dependencies.

<img src="docs/assets/overview.svg" width="100%" alt="Data flow diagram: argv is parsed by cli.ts parseArgs, parseCron builds a CronExpression, explain() writes the prose and nextRuns() steps real UTC minutes reading the wall clock through Intl, then report.ts renders text or JSON; test/reference.test.ts checks nextRuns against an exhaustive scan.">

**Status:** v0.1.0, CLI and library working and tested (121 tests, CI on
Linux, macOS and Windows with Node 20, 22 and 24). Not published to npm.

```console
$ cron-explain "*/15 9-17 * * MON-FRI" --timezone America/New_York --from 2026-09-01T12:00:00Z --count 3
every 15 minutes, every hour from 09 through 17, Monday through Friday.

timezone: America/New_York

  Tue, Sep 01, 2026, 09:00  (2026-09-01T13:00:00.000Z)
  Tue, Sep 01, 2026, 09:15  (2026-09-01T13:15:00.000Z)
  Tue, Sep 01, 2026, 09:30  (2026-09-01T13:30:00.000Z)
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

## Requirements

- Node.js 20 or newer (`engines.node` is `>=20`).
- Timezone data comes from the IANA database built into your Node/ICU
  build, so results for a zone are only as current as that data.

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
to now. Runs are always strictly after `--from`. Run `cron-explain --help`
for the full option list and `--version` for the version.

Exit codes: `0` on a successful parse, `1` on a usage error, an invalid
expression or an unknown timezone (the message goes to stderr). A truncated
result is still `0`: the search horizon (about four years of minutes) ran
out before finding `--count` runs, which can happen for a genuinely rare or
self-contradictory schedule like day 31 in February. That is an honest fact
about the expression, not a tool failure:

```console
$ cron-explain "0 0 31 2 *" --count 2
At 00:00, on the 31st, in February.

timezone: UTC

no matching run found within the search horizon
```

`--format json` prints `expression`, `explanation`, `timeZone`, `runs`
(ISO-8601 UTC instants) and `truncated`. The fall-back case, where 01:30
happens twice, returns both real instants:

```console
$ cron-explain "30 1 1 11 *" --timezone America/New_York --from 2026-10-31T00:00:00Z --count 2
At 01:30, on the 1st, in November.

timezone: America/New_York

  Sun, Nov 01, 2026, 01:30  (2026-11-01T05:30:00.000Z)
  Sun, Nov 01, 2026, 01:30  (2026-11-01T06:30:00.000Z)
```

## Library use

The built package (`dist/`, from `npm run build`) exports the same pieces
the CLI uses, from `src/index.ts`: `parseCron`, `explain`, `nextRuns`,
`buildReport`, `renderText`, `renderJson`, `matches`, `wallClockAt`,
`createFormatter`, the field specs, and `CronExplainError`.

```ts
import { explain, nextRuns, parseCron } from "cron-explain";

const cron = parseCron("0 9 * * MON-FRI");
explain(cron); // "At 09:00, Monday through Friday."
nextRuns(cron, new Date(), "Europe/London", 3); // { runs: Date[], truncated: boolean }
```

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

`npm run coverage` runs the tests with V8 coverage, as CI does. See
[CONTRIBUTING.md](CONTRIBUTING.md) before opening a pull request.

## License

MIT, see [LICENSE](LICENSE).
