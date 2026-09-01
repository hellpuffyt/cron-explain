import { describe, expect, it } from "vitest";

import { CronExplainError } from "../src/errors.js";
import {
  createFormatter,
  matches,
  nextRuns,
  parseCron,
  wallClockAt,
  type WallClock,
} from "../src/schedule.js";

describe("parseCron", () => {
  it("parses a standard 5-field expression", () => {
    const cron = parseCron("*/15 9-17 * * MON-FRI");
    expect(cron.minute).toEqual(new Set([0, 15, 30, 45]));
    expect(cron.dayOfWeek).toEqual(new Set([1, 2, 3, 4, 5]));
  });

  it("rejects too few fields", () => {
    expect(() => parseCron("* * *")).toThrow(/expected 5 fields/);
  });

  it("rejects too many fields", () => {
    expect(() => parseCron("* * * * * *")).toThrow(/expected 5 fields/);
  });

  it("tolerates extra whitespace between fields", () => {
    const cron = parseCron("  0   9  *   *   *  ");
    expect(cron.minute).toEqual(new Set([0]));
  });

  it("records whether dom/dow were literally '*'", () => {
    expect(parseCron("0 9 * * *").domIsWildcard).toBe(true);
    expect(parseCron("0 9 1 * *").domIsWildcard).toBe(false);
    expect(parseCron("0 9 * * MON").dowIsWildcard).toBe(false);
  });

  it("propagates a field-level parse error", () => {
    expect(() => parseCron("60 9 * * *")).toThrow(CronExplainError);
  });
});

describe("matches: day-of-month / day-of-week union rule", () => {
  const wall = (day: number, dayOfWeek: number): WallClock => ({
    year: 2026, month: 1, day, hour: 0, minute: 0, dayOfWeek,
  });

  it("both wildcard: every day matches", () => {
    const cron = parseCron("0 0 * * *");
    expect(matches(cron, wall(15, 3))).toBe(true);
  });

  it("only day-of-month restricted: day-of-week is ignored", () => {
    const cron = parseCron("0 0 15 * *");
    expect(matches(cron, wall(15, 0))).toBe(true);
    expect(matches(cron, wall(16, 0))).toBe(false);
  });

  it("only day-of-week restricted: day-of-month is ignored", () => {
    const cron = parseCron("0 0 * * MON");
    expect(matches(cron, wall(1, 1))).toBe(true);
    expect(matches(cron, wall(1, 2))).toBe(false);
  });

  it("both restricted: union, not intersection", () => {
    const cron = parseCron("0 0 1 * MON");
    // The 1st of the month, on a Wednesday - qualifies via day-of-month alone.
    expect(matches(cron, wall(1, 3))).toBe(true);
    // A Monday that is not the 1st - qualifies via day-of-week alone.
    expect(matches(cron, wall(2, 1))).toBe(true);
    // Neither condition holds.
    expect(matches(cron, wall(3, 2))).toBe(false);
  });
});

describe("matches: minute/hour/month", () => {
  it("all three must hold", () => {
    const cron = parseCron("30 9 * 6 *");
    expect(matches(cron, { year: 2026, month: 6, day: 1, hour: 9, minute: 30, dayOfWeek: 1 })).toBe(
      true,
    );
    expect(matches(cron, { year: 2026, month: 6, day: 1, hour: 9, minute: 31, dayOfWeek: 1 })).toBe(
      false,
    );
    expect(matches(cron, { year: 2026, month: 6, day: 1, hour: 10, minute: 30, dayOfWeek: 1 })).toBe(
      false,
    );
    expect(matches(cron, { year: 2026, month: 7, day: 1, hour: 9, minute: 30, dayOfWeek: 1 })).toBe(
      false,
    );
  });
});

describe("createFormatter", () => {
  it("accepts a real IANA timezone", () => {
    expect(() => createFormatter("America/New_York")).not.toThrow();
  });

  it("rejects a bogus timezone name", () => {
    expect(() => createFormatter("Not/A_Zone")).toThrow(CronExplainError);
  });
});

describe("wallClockAt", () => {
  it("reads UTC fields correctly for a known instant", () => {
    const formatter = createFormatter("UTC");
    const wall = wallClockAt(formatter, new Date("2026-06-15T14:30:00.000Z"));
    expect(wall).toEqual({ year: 2026, month: 6, day: 15, hour: 14, minute: 30, dayOfWeek: 1 });
  });

  it("converts to a non-UTC offset correctly", () => {
    const formatter = createFormatter("America/New_York");
    // 2026-06-15T14:30:00Z is 10:30 EDT (UTC-4 in summer).
    const wall = wallClockAt(formatter, new Date("2026-06-15T14:30:00.000Z"));
    expect(wall.hour).toBe(10);
    expect(wall.minute).toBe(30);
  });

  it("normalises a midnight hour label of '24' to 0", () => {
    const formatter = createFormatter("UTC");
    const wall = wallClockAt(formatter, new Date("2026-06-15T00:00:00.000Z"));
    expect(wall.hour).toBe(0);
  });
});

describe("nextRuns: basics", () => {
  it("finds the requested number of runs", () => {
    const cron = parseCron("0 * * * *");
    const result = nextRuns(cron, new Date("2026-01-01T00:00:00Z"), "UTC", 3);
    expect(result.runs).toHaveLength(3);
    expect(result.truncated).toBe(false);
  });

  it("runs are strictly after `from`, even when `from` is itself a match", () => {
    const cron = parseCron("0 * * * *");
    const from = new Date("2026-01-01T00:00:00Z"); // itself matches "0 * * * *"
    const result = nextRuns(cron, from, "UTC", 1);
    expect(result.runs[0]!.getTime()).toBe(new Date("2026-01-01T01:00:00Z").getTime());
  });

  it("runs are in chronological order", () => {
    const cron = parseCron("*/20 * * * *");
    const result = nextRuns(cron, new Date("2026-01-01T00:00:00Z"), "UTC", 4);
    const times = result.runs.map((r) => r.getTime());
    expect(times).toEqual([...times].sort((a, b) => a - b));
  });

  it("rejects a non-positive count", () => {
    const cron = parseCron("0 * * * *");
    expect(() => nextRuns(cron, new Date(), "UTC", 0)).toThrow(/count must be at least 1/);
  });

  it("reports truncated when the horizon is exhausted first", () => {
    // Feb 30th never exists - genuinely unsatisfiable within any horizon.
    const cron = parseCron("0 0 30 2 *");
    const result = nextRuns(cron, new Date("2026-01-01T00:00:00Z"), "UTC", 1, 40 * 24 * 60);
    expect(result.runs).toHaveLength(0);
    expect(result.truncated).toBe(true);
  });
});

describe("nextRuns: DST correctness (America/New_York)", () => {
  it("a wall-clock time skipped by spring-forward is never matched", () => {
    // US DST begins the second Sunday of March; 2:00-3:00 AM local does
    // not exist that day. Search only within that one day.
    const cron = parseCron("30 2 * 3 *");
    const from = new Date("2027-03-13T12:00:00Z");
    const result = nextRuns(cron, from, "America/New_York", 1, 2 * 24 * 60);
    // If 02:30 existed on the transition day it would be found within
    // this narrow window; it must not be.
    for (const run of result.runs) {
      expect(run.getUTCDate()).not.toBe(14);
    }
  });

  it("a wall-clock time repeated by fall-back is matched twice", () => {
    // US DST ends the first Sunday of November; 1:00-2:00 AM local
    // happens twice. 2026-11-01 is that Sunday.
    const cron = parseCron("30 1 1 11 *");
    const from = new Date("2026-10-31T00:00:00Z");
    const result = nextRuns(cron, from, "America/New_York", 2, 3 * 24 * 60);
    expect(result.runs).toHaveLength(2);
    const [first, second] = result.runs as [Date, Date];
    // Same wall-clock reading, one hour apart in real time.
    expect(second.getTime() - first.getTime()).toBe(60 * 60 * 1000);
  });

  it("both fall-back instants format to the same local wall clock", () => {
    const formatter = createFormatter("America/New_York");
    const cron = parseCron("30 1 1 11 *");
    const result = nextRuns(cron, new Date("2026-10-31T00:00:00Z"), "America/New_York", 2, 3 * 24 * 60);
    const [first, second] = result.runs as [Date, Date];
    const wallFirst = wallClockAt(formatter, first);
    const wallSecond = wallClockAt(formatter, second);
    expect(wallFirst.hour).toBe(1);
    expect(wallFirst.minute).toBe(30);
    expect(wallSecond.hour).toBe(1);
    expect(wallSecond.minute).toBe(30);
  });
});
