import { describe, expect, it } from "vitest";

import { explain, shapeOf } from "../src/explain.js";
import { HOUR, MINUTE } from "../src/fields.js";
import { parseCron } from "../src/schedule.js";

describe("shapeOf", () => {
  it("recognises the full range as 'every'", () => {
    expect(shapeOf(new Set(Array.from({ length: 60 }, (_, i) => i)), MINUTE)).toEqual({
      kind: "every",
    });
  });

  it("recognises a single value", () => {
    expect(shapeOf(new Set([5]), MINUTE)).toEqual({ kind: "single", value: 5 });
  });

  it("recognises a plain contiguous range without requiring it to reach the max", () => {
    expect(shapeOf(new Set([9, 10, 11, 12]), HOUR)).toEqual({ kind: "range", from: 9, to: 12 });
  });

  it("recognises a step pattern that extends to the field maximum", () => {
    expect(shapeOf(new Set([0, 15, 30, 45]), MINUTE)).toEqual({
      kind: "step",
      start: 0,
      step: 15,
    });
  });

  it("does not classify an arithmetic list that stops short of the max as a step", () => {
    // 0, 15, 30 has the shape of "every 15" but does not reach 45/59 -
    // treating it as a step would silently claim it continues further
    // than the set the user actually wrote.
    expect(shapeOf(new Set([0, 15, 30]), MINUTE)).toEqual({
      kind: "list",
      values: [0, 15, 30],
    });
  });

  it("falls back to a plain list for a non-arithmetic set", () => {
    expect(shapeOf(new Set([1, 7, 42]), MINUTE)).toEqual({ kind: "list", values: [1, 7, 42] });
  });

  it("a two-element set with an interval of 1 is a range, not a step", () => {
    expect(shapeOf(new Set([5, 6]), MINUTE)).toEqual({ kind: "range", from: 5, to: 6 });
  });
});

describe("explain: common patterns", () => {
  it("a fixed daily time", () => {
    expect(explain(parseCron("30 9 * * *"))).toBe("At 09:30.");
  });

  it("every minute", () => {
    expect(explain(parseCron("* * * * *"))).toBe("Every minute.");
  });

  it("every N minutes", () => {
    expect(explain(parseCron("*/15 * * * *"))).toBe("Every 15 minutes.");
  });

  it("every N minutes starting from a non-zero minute", () => {
    expect(explain(parseCron("5/15 * * * *"))).toContain("starting at minute 5");
  });

  it("a single minute every hour", () => {
    expect(explain(parseCron("15 * * * *"))).toBe("At minute 15 of every hour.");
  });

  it("names weekdays with MON-FRI", () => {
    expect(explain(parseCron("0 9 * * MON-FRI"))).toContain("Monday through Friday");
  });

  it("names months", () => {
    expect(explain(parseCron("0 0 1 JAN *"))).toContain("in January");
  });

  it("describes the day-of-month/day-of-week union with 'or'", () => {
    const text = explain(parseCron("0 0 1 * MON"));
    expect(text).toMatch(/or/);
  });

  it("omits the day clause entirely when both dom and dow are wildcards", () => {
    const text = explain(parseCron("0 9 * * *"));
    expect(text).toBe("At 09:00.");
  });

  it("every sentence ends with a period", () => {
    expect(explain(parseCron("*/5 9-17 * * MON-FRI"))).toMatch(/\.$/);
  });

  it("a minute range with hour=every falls back to two plain clauses", () => {
    const text = explain(parseCron("10-20 * * * *"));
    expect(text).toContain("every minute from 10 through 20");
    expect(text).toContain("every hour");
  });

  it("a non-arithmetic minute list with an hour range falls back to two plain clauses", () => {
    const text = explain(parseCron("7,23,41 9-17 * * *"));
    expect(text).toContain("at minutes 7, 23, and 41");
    expect(text).toContain("every hour from 09 through 17");
  });

  it("an hour list falls back to two plain clauses", () => {
    const text = explain(parseCron("0 9,14,20 * * *"));
    expect(text).toContain("during hours 09, 14, and 20");
  });
});

describe("explain: day-of-month clause shapes", () => {
  it("a single day", () => {
    expect(explain(parseCron("0 0 1 * *"))).toContain("on the 1st");
  });

  it("a step (every N days of the month)", () => {
    expect(explain(parseCron("0 0 */10 * *"))).toContain("every 10 day(s) of the month");
  });

  it("a list of specific days", () => {
    const text = explain(parseCron("0 0 1,15 * *"));
    expect(text).toContain("on the 1st and 15th");
  });

  it("a plain range", () => {
    expect(explain(parseCron("0 0 5-10 * *"))).toContain("on the 5th through the 10th");
  });

  it("ordinal suffixes: 2nd, 3rd, 11th-13th (the -teens exception), 21st", () => {
    expect(explain(parseCron("0 0 2 * *"))).toContain("2nd");
    expect(explain(parseCron("0 0 3 * *"))).toContain("3rd");
    expect(explain(parseCron("0 0 11 * *"))).toContain("11th");
    expect(explain(parseCron("0 0 12 * *"))).toContain("12th");
    expect(explain(parseCron("0 0 13 * *"))).toContain("13th");
    expect(explain(parseCron("0 0 21 * *"))).toContain("21st");
  });
});

describe("explain: day-of-week clause shapes", () => {
  it("a single day", () => {
    expect(explain(parseCron("0 0 * * MON"))).toContain("on Monday");
  });

  it("a step", () => {
    const text = explain(parseCron("0 0 * * 0/2"));
    expect(text).toContain("every 2 day(s) of the week");
  });

  it("a list of specific days", () => {
    const text = explain(parseCron("0 0 * * MON,WED,FRI"));
    expect(text).toContain("on Monday, Wednesday, and Friday");
  });
});

describe("explain: month clause shapes", () => {
  it("a single month", () => {
    expect(explain(parseCron("0 0 1 6 *"))).toContain("in June");
  });

  it("a range of months", () => {
    expect(explain(parseCron("0 0 1 6-8 *"))).toContain("June through August");
  });

  it("a step of months", () => {
    const text = explain(parseCron("0 0 1 */4 *"));
    expect(text).toContain("every 4 month(s)");
  });

  it("a list of months with no arithmetic relationship", () => {
    const text = explain(parseCron("0 0 1 1,6,12 *"));
    expect(text).toContain("in January, June, and December");
  });

  it("an evenly-spaced list of months is recognised as a step (quarterly)", () => {
    // 3,6,9,12 is arithmetic (every 3, extending to the max) - the more
    // useful "every 3 month(s)" phrasing is correct here, not a list.
    const text = explain(parseCron("0 0 1 3,6,9,12 *"));
    expect(text).toContain("every 3 month(s), starting March");
  });
});
