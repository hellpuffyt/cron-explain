/**
 * The command line.
 *
 * Exit codes: 0 on success (including a truncated result - the search
 * horizon simply ran out, which is a fact about the expression, not a
 * failure of the tool), 1 on a usage or parse error.
 */

import { CronExplainError } from "./errors.js";
import { buildReport, renderJson, renderText } from "./report.js";
import { nextRuns, parseCron } from "./schedule.js";
import { VERSION } from "./version.js";

export interface Io {
  stdout(text: string): void;
  stderr(text: string): void;
}

const USAGE = `usage: cron-explain "<expression>" [options]

Parse a 5-field cron expression, explain it in prose, and preview the
next runs in a chosen timezone, including DST edges.

  expression              e.g. "*/15 9-17 * * MON-FRI"

options:
  --timezone TZ            IANA timezone (default: UTC)
  --count N                how many upcoming runs to show (default: 5)
  --from ISO_DATETIME       search starting after this instant (default: now)
  --format text|json       output format (default: text)
  --version                print the version
  --help                   this text
`;

interface Options {
  expression: string;
  timeZone: string;
  count: number;
  from: Date;
  format: "text" | "json";
}

export function parseArgs(argv: readonly string[]): Options | "help" | "version" {
  let expression: string | undefined;
  let timeZone = "UTC";
  let count = 5;
  let from = new Date();
  let format: "text" | "json" = "text";

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i] as string;
    switch (arg) {
      case "--help":
        return "help";
      case "--version":
        return "version";
      case "--timezone": {
        const value = argv[++i];
        if (value === undefined) throw new CronExplainError("--timezone expects a value");
        timeZone = value;
        break;
      }
      case "--count": {
        const value = argv[++i];
        if (value === undefined || !/^\d+$/.test(value) || Number(value) < 1) {
          throw new CronExplainError(`--count expects a positive integer, got ${value ?? "nothing"}`);
        }
        count = Number(value);
        break;
      }
      case "--from": {
        const value = argv[++i];
        if (value === undefined) throw new CronExplainError("--from expects an ISO datetime");
        const parsed = new Date(value);
        if (Number.isNaN(parsed.getTime())) {
          throw new CronExplainError(`--from: "${value}" is not a valid date/time`);
        }
        from = parsed;
        break;
      }
      case "--format": {
        const value = argv[++i];
        if (value !== "text" && value !== "json") {
          throw new CronExplainError(`--format expects text or json, got ${value ?? "nothing"}`);
        }
        format = value;
        break;
      }
      default:
        if (arg.startsWith("-")) throw new CronExplainError(`unknown option ${arg}`);
        if (expression !== undefined) throw new CronExplainError("expected exactly one expression");
        expression = arg;
    }
  }
  if (expression === undefined) throw new CronExplainError("expected a cron expression");
  return { expression, timeZone, count, from, format };
}

export function main(argv: readonly string[], io: Io): number {
  let options: Options | "help" | "version";
  try {
    options = parseArgs(argv);
  } catch (err) {
    io.stderr(`error: ${err instanceof Error ? err.message : String(err)}\n`);
    io.stderr(USAGE);
    return 1;
  }
  if (options === "help") {
    io.stdout(USAGE);
    return 0;
  }
  if (options === "version") {
    io.stdout(`cron-explain ${VERSION}\n`);
    return 0;
  }

  try {
    const cron = parseCron(options.expression);
    const result = nextRuns(cron, options.from, options.timeZone, options.count);
    const report = buildReport(cron, options.timeZone, result);
    io.stdout((options.format === "json" ? renderJson(report) : renderText(report)) + "\n");
    return 0;
  } catch (err) {
    if (err instanceof CronExplainError) {
      io.stderr(`error: ${err.message}\n`);
      return 1;
    }
    /* v8 ignore next -- defensive: every thrown error in this path is a CronExplainError */
    throw err;
  }
}
