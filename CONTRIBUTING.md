# Contributing

Thanks for looking into cron-explain.

## Setup

```console
npm ci
npm test          # vitest
npm run typecheck # tsc --noEmit, strict
npm run lint      # eslint
npm run build     # emits dist/, which the bin entry point imports
```

## Ground rules

- **Zero runtime dependencies.** Timezone correctness comes from Node's
  built-in `Intl.DateTimeFormat` (backed by the system's IANA tz
  database) — never a hand-rolled UTC-offset table.
- **DST correctness is the point.** Any change to `nextRuns` needs a test
  against a real transition (`test/schedule.test.ts`'s DST section) —
  proving a skipped local time is never matched and a repeated one is
  matched twice as two real instants.
- **The day/hour fast-forward must stay an optimisation, never a
  correctness shortcut.** It may only skip a day/hour it has proven
  (from the parsed field sets alone) cannot contain any match; the jump
  distance may be approximate (self-correcting on the next read), but
  the *decision* to skip may never be.
- **Explanation coverage is deliberately bounded**, not exhaustive — see
  the docstring in `explain.ts`. A field combination outside the common
  shapes gets a plain, correct fallback description, not a guess.
