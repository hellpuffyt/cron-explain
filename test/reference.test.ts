/**
 * Differential test against a reference: a brute-force scan that reads the
 * wall clock at *every* real UTC minute (no day/hour skipping) and applies
 * the same match rule. `nextRuns` skips ahead for speed; it must never
 * disagree with the exhaustive scan, especially around DST transitions.
 */
import { describe, expect, it } from "vitest";

import { createFormatter, matches, nextRuns, parseCron, wallClockAt } from "../src/schedule.js";

function bruteForce(expr: string, from: Date, timeZone: string, count: number, horizon: number): number[] {
  const cron = parseCron(expr);
  const fmt = createFormatter(timeZone);
  const out: number[] = [];
  let t = Math.floor(from.getTime() / 60000) * 60000 + 60000;
  for (let i = 0; i < horizon && out.length < count; i++, t += 60000) {
    if (matches(cron, wallClockAt(fmt, new Date(t)))) out.push(t);
  }
  return out;
}

// [zone, an instant ~1.5 days before a transition] — spring-forward and fall-back,
// hour-aligned, midnight transitions (Santiago, Havana), 30-minute DST (Lord Howe),
// a :45 offset (Chatham), southern hemisphere, and a zone with no DST.
const TRANSITIONS: [string, string][] = [
  ["America/New_York", "2026-03-07T00:00:00Z"],
  ["America/New_York", "2026-10-31T00:00:00Z"],
  ["Europe/London", "2026-03-28T00:00:00Z"],
  ["Europe/London", "2026-10-24T00:00:00Z"],
  ["America/Santiago", "2026-04-03T00:00:00Z"],
  ["America/Santiago", "2026-09-04T00:00:00Z"],
  ["America/Havana", "2026-03-06T00:00:00Z"],
  ["America/Havana", "2026-10-30T00:00:00Z"],
  ["Australia/Lord_Howe", "2026-04-03T00:00:00Z"],
  ["Australia/Lord_Howe", "2026-10-02T00:00:00Z"],
  ["Pacific/Chatham", "2026-04-03T00:00:00Z"],
  ["Australia/Sydney", "2026-10-02T00:00:00Z"],
  ["Asia/Kolkata", "2026-03-07T00:00:00Z"],
];

const EXPRESSIONS = [
  "30 0 * * *",
  "30 0 * * MON",
  "0 0 * * SUN",
  "15 2 * * *",
  "30 1 * * *",
  "0 */3 * * *",
  "45 23 * * *",
  "0,30 0-3 * * *",
  "0 0 1,8,15 * *",
  "0 12 * * 1-7",
  "*/20 1-2 * * SAT,SUN",
];

const HORIZON = 10 * 24 * 60;

describe("nextRuns agrees with an exhaustive minute-by-minute reference scan", () => {
  for (const [zone, start] of TRANSITIONS) {
    it(`${zone} from ${start}`, () => {
      const from = new Date(start);
      for (const expr of EXPRESSIONS) {
        const expected = bruteForce(expr, from, zone, 12, HORIZON);
        const actual = nextRuns(parseCron(expr), from, zone, 12, HORIZON).runs.map((d) => d.getTime());
        expect(actual.map((t) => new Date(t).toISOString()), `${expr} in ${zone}`).toEqual(
          expected.map((t) => new Date(t).toISOString()),
        );
      }
    });
  }
});

describe("regressions", () => {
  it("does not skip Monday 00:30 after a Sunday spring-forward (America/New_York)", () => {
    const { runs } = nextRuns(parseCron("30 0 * * MON"), new Date("2026-03-07T12:00:00Z"), "America/New_York", 1);
    expect(runs[0]?.toISOString()).toBe("2026-03-09T04:30:00.000Z");
  });

  it("accepts 7 (Sunday) as the end of a day-of-week range", () => {
    expect([...parseCron("0 0 * * 1-7").dayOfWeek].sort()).toEqual([0, 1, 2, 3, 4, 5, 6]);
    expect([...parseCron("0 0 * * MON-SUN").dayOfWeek].sort()).toEqual([0, 1, 2, 3, 4, 5, 6]);
    expect([...parseCron("0 0 * * 5-7").dayOfWeek].sort()).toEqual([0, 5, 6]);
  });

  it("rejects Object.prototype names instead of treating them as values", () => {
    expect(() => parseCron("0 0 * * constructor")).toThrow(/not a valid value/);
    expect(() => parseCron("0 0 * toString *")).toThrow(/not a valid value/);
  });
});
