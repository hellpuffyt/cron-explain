import { describe, expect, it } from "vitest";

import { CronExplainError } from "../src/errors.js";
import { DAY_OF_WEEK, HOUR, MINUTE, MONTH } from "../src/fields.js";
import { parseField } from "../src/parse.js";

describe("parseField: literals", () => {
  it("parses a single numeric value", () => {
    expect(parseField("5", MINUTE)).toEqual(new Set([5]));
  });

  it("parses a wildcard as the full range", () => {
    const result = parseField("*", HOUR);
    expect(result.size).toBe(24);
    expect(result.has(0)).toBe(true);
    expect(result.has(23)).toBe(true);
  });

  it("parses a comma-separated list", () => {
    expect(parseField("1,5,9", MINUTE)).toEqual(new Set([1, 5, 9]));
  });

  it("rejects a value below the field minimum", () => {
    expect(() => parseField("-1", MINUTE)).toThrow(CronExplainError);
  });

  it("rejects a value above the field maximum", () => {
    expect(() => parseField("60", MINUTE)).toThrow(/out of range/);
  });

  it("rejects a non-numeric, non-name token", () => {
    expect(() => parseField("banana", MINUTE)).toThrow(/not a valid value/);
  });

  it("rejects an empty field", () => {
    expect(() => parseField("", MINUTE)).toThrow(/empty/);
  });

  it("rejects an empty item between commas", () => {
    expect(() => parseField("1,,3", MINUTE)).toThrow(/empty item/);
  });
});

describe("parseField: ranges", () => {
  it("parses a-b as an inclusive range", () => {
    expect(parseField("9-12", HOUR)).toEqual(new Set([9, 10, 11, 12]));
  });

  it("rejects a range that starts after it ends", () => {
    expect(() => parseField("12-9", HOUR)).toThrow(/wrap-around/);
  });

  it("rejects a malformed range with more than one hyphen", () => {
    expect(() => parseField("1-2-3", MINUTE)).toThrow(/not a valid range/);
  });
});

describe("parseField: steps", () => {
  it("*/n means every n-th value from the field minimum", () => {
    expect(parseField("*/15", MINUTE)).toEqual(new Set([0, 15, 30, 45]));
  });

  it("a-b/n steps within the range", () => {
    expect(parseField("0-10/5", MINUTE)).toEqual(new Set([0, 5, 10]));
  });

  it("n/step means starting at n, every step, up to the field max", () => {
    expect(parseField("5/15", MINUTE)).toEqual(new Set([5, 20, 35, 50]));
  });

  it("rejects a step of zero", () => {
    expect(() => parseField("*/0", MINUTE)).toThrow(/positive integer/);
  });

  it("rejects a non-numeric step", () => {
    expect(() => parseField("*/x", MINUTE)).toThrow(/positive integer/);
  });

  it("rejects more than one slash", () => {
    expect(() => parseField("1/2/3", MINUTE)).toThrow(/more than one/);
  });
});

describe("parseField: names", () => {
  it("accepts 3-letter month names, case-insensitively", () => {
    expect(parseField("jan", MONTH)).toEqual(new Set([1]));
    expect(parseField("DEC", MONTH)).toEqual(new Set([12]));
  });

  it("accepts month name ranges", () => {
    expect(parseField("JAN-MAR", MONTH)).toEqual(new Set([1, 2, 3]));
  });

  it("accepts 3-letter day names, case-insensitively", () => {
    expect(parseField("mon", DAY_OF_WEEK)).toEqual(new Set([1]));
  });

  it("accepts day name ranges", () => {
    expect(parseField("MON-FRI", DAY_OF_WEEK)).toEqual(new Set([1, 2, 3, 4, 5]));
  });
});

describe("parseField: day-of-week 0/7 alias", () => {
  it("treats both 0 and 7 as Sunday", () => {
    expect(parseField("0", DAY_OF_WEEK)).toEqual(new Set([0]));
    expect(parseField("7", DAY_OF_WEEK)).toEqual(new Set([0]));
  });

  it("0 and 7 in the same list collapse to one value", () => {
    expect(parseField("0,7", DAY_OF_WEEK)).toEqual(new Set([0]));
  });
});
