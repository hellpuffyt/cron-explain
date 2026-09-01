import { explain } from "./explain.js";
import type { CronExpression, NextRunsResult } from "./schedule.js";

export interface Report {
  readonly expression: string;
  readonly explanation: string;
  readonly timeZone: string;
  readonly runs: Date[];
  readonly truncated: boolean;
}

export function buildReport(
  cron: CronExpression,
  timeZone: string,
  result: NextRunsResult,
): Report {
  return {
    expression: cron.raw,
    explanation: explain(cron),
    timeZone,
    runs: result.runs,
    truncated: result.truncated,
  };
}

const RUN_FORMAT_CACHE = new Map<string, Intl.DateTimeFormat>();

function runFormatter(timeZone: string): Intl.DateTimeFormat {
  let formatter = RUN_FORMAT_CACHE.get(timeZone);
  if (!formatter) {
    formatter = new Intl.DateTimeFormat("en-US", {
      timeZone,
      weekday: "short",
      year: "numeric",
      month: "short",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    });
    RUN_FORMAT_CACHE.set(timeZone, formatter);
  }
  return formatter;
}

export function renderText(report: Report): string {
  const lines = [report.explanation, "", `timezone: ${report.timeZone}`, ""];
  if (report.runs.length === 0) {
    lines.push("no matching run found within the search horizon");
  } else {
    const formatter = runFormatter(report.timeZone);
    for (const run of report.runs) {
      lines.push(`  ${formatter.format(run)}  (${run.toISOString()})`);
    }
    if (report.truncated) {
      lines.push("  ... search horizon exhausted before finding more runs");
    }
  }
  return lines.join("\n");
}

export function renderJson(report: Report): string {
  return JSON.stringify(
    {
      expression: report.expression,
      explanation: report.explanation,
      timeZone: report.timeZone,
      runs: report.runs.map((run) => run.toISOString()),
      truncated: report.truncated,
    },
    null,
    2,
  );
}
