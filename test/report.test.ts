import { describe, expect, it } from "vitest";

import { buildReport, renderJson, renderText } from "../src/report.js";
import { nextRuns, parseCron } from "../src/schedule.js";

function reportFor(expression: string, from: string, count = 2) {
  const cron = parseCron(expression);
  const result = nextRuns(cron, new Date(from), "UTC", count);
  return buildReport(cron, "UTC", result);
}

describe("renderText", () => {
  it("includes the explanation, timezone, and formatted runs", () => {
    const text = renderText(reportFor("0 9 * * *", "2026-01-01T00:00:00Z"));
    expect(text).toContain("At 09:00.");
    expect(text).toContain("timezone: UTC");
    expect(text).toMatch(/2026/);
  });

  it("reports plainly when nothing is found within the horizon", () => {
    const cron = parseCron("0 0 30 2 *");
    const result = nextRuns(cron, new Date("2026-01-01T00:00:00Z"), "UTC", 1, 30 * 24 * 60);
    const text = renderText(buildReport(cron, "UTC", result));
    expect(text).toContain("no matching run found");
  });

  it("notes when nothing was found at all within the horizon", () => {
    const cron = parseCron("0 0 30 2 *"); // Feb 30 never exists
    const result = nextRuns(cron, new Date("2026-01-01T00:00:00Z"), "UTC", 2, 400 * 24 * 60);
    const text = renderText(buildReport(cron, "UTC", result));
    expect(text).toContain("no matching run found");
  });

  it("notes when some (but not all requested) runs were found", () => {
    // Feb 29 only exists in leap years; 2028 is the next one after
    // 2027-01-01, and the horizon stops just short of the next (2032),
    // so exactly one of the two requested runs is found.
    const cron = parseCron("0 0 29 2 *");
    const horizonMinutes = 3 * 366 * 24 * 60;
    const result = nextRuns(cron, new Date("2027-01-01T00:00:00Z"), "UTC", 2, horizonMinutes);
    expect(result.runs).toHaveLength(1);
    expect(result.truncated).toBe(true);
    const text = renderText(buildReport(cron, "UTC", result));
    expect(text).toContain("2028");
    expect(text).toContain("search horizon exhausted");
  });
});

describe("renderJson", () => {
  it("round-trips expression, explanation, timezone and ISO runs", () => {
    const payload = JSON.parse(renderJson(reportFor("0 9 * * *", "2026-01-01T00:00:00Z"))) as {
      expression: string;
      explanation: string;
      timeZone: string;
      runs: string[];
      truncated: boolean;
    };
    expect(payload.expression).toBe("0 9 * * *");
    expect(payload.explanation).toBe("At 09:00.");
    expect(payload.timeZone).toBe("UTC");
    expect(payload.runs).toHaveLength(2);
    expect(new Date(payload.runs[0] as string).toISOString()).toBe(payload.runs[0]);
    expect(payload.truncated).toBe(false);
  });
});
