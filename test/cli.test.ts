import { describe, expect, it } from "vitest";

import { main, parseArgs } from "../src/cli.js";
import { CronExplainError } from "../src/errors.js";
import { VERSION } from "../src/version.js";
import { fakeIo } from "./helpers.js";

describe("parseArgs", () => {
  it("defaults to UTC, count 5, text format", () => {
    const options = parseArgs(["0 9 * * *"]);
    expect(options).toMatchObject({
      expression: "0 9 * * *",
      timeZone: "UTC",
      count: 5,
      format: "text",
    });
  });

  it("accepts --timezone, --count and --format", () => {
    const options = parseArgs([
      "0 9 * * *", "--timezone", "Europe/London", "--count", "10", "--format", "json",
    ]);
    expect(options).toMatchObject({ timeZone: "Europe/London", count: 10, format: "json" });
  });

  it("accepts --from as an ISO datetime", () => {
    const options = parseArgs(["0 9 * * *", "--from", "2027-01-01T00:00:00Z"]);
    if (options === "help" || options === "version") throw new Error("unexpected");
    expect(options.from.toISOString()).toBe("2027-01-01T00:00:00.000Z");
  });

  it("rejects a missing expression", () => {
    expect(() => parseArgs([])).toThrow(/expected a cron expression/);
  });

  it("rejects a second positional argument", () => {
    expect(() => parseArgs(["a", "b"])).toThrow(/exactly one expression/);
  });

  it("rejects an unknown flag", () => {
    expect(() => parseArgs(["0 9 * * *", "--nope"])).toThrow(/--nope/);
  });

  it("rejects a non-numeric --count", () => {
    expect(() => parseArgs(["0 9 * * *", "--count", "x"])).toThrow(/positive integer/);
  });

  it("rejects a zero --count", () => {
    expect(() => parseArgs(["0 9 * * *", "--count", "0"])).toThrow(/positive integer/);
  });

  it("rejects an invalid --from value", () => {
    expect(() => parseArgs(["0 9 * * *", "--from", "not-a-date"])).toThrow(CronExplainError);
  });

  it("rejects a bad --format value", () => {
    expect(() => parseArgs(["0 9 * * *", "--format", "yaml"])).toThrow(/yaml/);
  });
});

describe("main", () => {
  it("exits 0 and prints the explanation and runs", () => {
    const { io, out } = fakeIo();
    const code = main(["0 9 * * *", "--from", "2026-01-01T00:00:00Z"], io);
    expect(code).toBe(0);
    expect(out()).toContain("At 09:00.");
    expect(out()).toContain("timezone: UTC");
  });

  it("exits 0 even when the result is truncated (an honest fact, not a failure)", () => {
    const { io, out } = fakeIo();
    const code = main(["0 0 30 2 *", "--from", "2026-01-01T00:00:00Z"], io);
    expect(code).toBe(0);
    expect(out()).toContain("no matching run found");
  });

  it("exits 1 when argument parsing itself fails, before any cron parsing", () => {
    const { io, err } = fakeIo();
    const code = main(["--nope"], io);
    expect(code).toBe(1);
    expect(err()).toMatch(/error: unknown option --nope/);
  });

  it("exits 1 on a parse error, with a message on stderr", () => {
    const { io, err, out } = fakeIo();
    const code = main(["not a valid cron"], io);
    expect(code).toBe(1);
    expect(err()).toMatch(/error:/);
    expect(out()).toBe("");
  });

  it("exits 1 on an unknown timezone", () => {
    const { io, err } = fakeIo();
    const code = main(["0 9 * * *", "--timezone", "Not/AZone"], io);
    expect(code).toBe(1);
    expect(err()).toMatch(/IANA timezone/);
  });

  it("--format json emits parseable JSON", () => {
    const { io, out } = fakeIo();
    main(["0 9 * * *", "--from", "2026-01-01T00:00:00Z", "--format", "json"], io);
    const payload = JSON.parse(out()) as { expression: string };
    expect(payload.expression).toBe("0 9 * * *");
  });

  it("--help exits 0 with usage on stdout", () => {
    const { io, out } = fakeIo();
    expect(main(["--help"], io)).toBe(0);
    expect(out()).toContain("usage:");
  });

  it("--version prints the single-source version", () => {
    const { io, out } = fakeIo();
    expect(main(["--version"], io)).toBe(0);
    expect(out()).toContain(VERSION);
  });

  it("respects --count", () => {
    const { io, out } = fakeIo();
    main(["*/10 * * * *", "--from", "2026-01-01T00:00:00Z", "--count", "2", "--format", "json"], io);
    const payload = JSON.parse(out()) as { runs: string[] };
    expect(payload.runs).toHaveLength(2);
  });
});
