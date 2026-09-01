/**
 * Render a cron expression's fields as prose.
 *
 * Coverage is deliberately bounded rather than exhaustive: the common,
 * everyday patterns (a fixed daily time, "every N minutes/hours", a
 * weekday/month list, a range) each get an idiomatic phrase. A field that
 * does not match one of those shapes — say `7,13,42` with no arithmetic
 * relationship — still gets a precise, correct description (the plain
 * value list); it just reads less like a sentence a person would write.
 * A tool that tried to force every possible field combination into
 * natural prose would eventually paper over cases it does not actually
 * understand, and a wrong-sounding-confident explanation of a schedule
 * is worse than a plain one.
 */

import {
  DAY_LABEL,
  DAY_OF_WEEK,
  MONTH,
  MONTH_LABEL,
  type FieldSpec,
} from "./fields.js";
import type { CronExpression } from "./schedule.js";

type FieldShape =
  | { readonly kind: "every" }
  | { readonly kind: "single"; readonly value: number }
  | { readonly kind: "step"; readonly start: number; readonly step: number }
  | { readonly kind: "range"; readonly from: number; readonly to: number }
  | { readonly kind: "list"; readonly values: readonly number[] };

function commonDifference(sorted: readonly number[]): number | undefined {
  if (sorted.length < 2) return undefined;
  const step = (sorted[1] as number) - (sorted[0] as number);
  if (step <= 0) return undefined;
  for (let i = 1; i < sorted.length; i += 1) {
    if ((sorted[i] as number) - (sorted[i - 1] as number) !== step) return undefined;
  }
  return step;
}

/**
 * Detects a `*\/n` or `n/step`-shaped set: an arithmetic run that extends
 * as far as it can toward the field's own maximum. A plain contiguous
 * range (`9-17`) is *not* required to reach the maximum — that
 * distinction is what separates "step" phrasing ("every 15 minutes")
 * from "range" phrasing ("hours 9 through 17"), and conflating them
 * would describe an ordinary range as if it never stopped.
 */
function detectStepPattern(
  sorted: readonly number[],
  spec: FieldSpec,
): { start: number; step: number } | undefined {
  const step = commonDifference(sorted);
  if (step === undefined || step <= 1) return undefined;
  const start = sorted[0] as number;
  const last = sorted[sorted.length - 1] as number;
  const expectedLast = start + step * Math.floor((spec.max - start) / step);
  if (last !== expectedLast) return undefined;
  return { start, step };
}

export function shapeOf(values: ReadonlySet<number>, spec: FieldSpec): FieldShape {
  const sorted = [...values].sort((a, b) => a - b);
  if (sorted.length === spec.max - spec.min + 1) return { kind: "every" };
  if (sorted.length === 1) return { kind: "single", value: sorted[0] as number };

  const step = detectStepPattern(sorted, spec);
  if (step) return { kind: "step", start: step.start, step: step.step };

  if (commonDifference(sorted) === 1) {
    return { kind: "range", from: sorted[0] as number, to: sorted[sorted.length - 1] as number };
  }
  return { kind: "list", values: sorted };
}

function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

function monthName(n: number): string {
  return MONTH_LABEL[n] ?? String(n);
}

function dayName(n: number): string {
  return DAY_LABEL[n] ?? String(n);
}

function ordinal(n: number): string {
  const suffix =
    n % 10 === 1 && n % 100 !== 11
      ? "st"
      : n % 10 === 2 && n % 100 !== 12
        ? "nd"
        : n % 10 === 3 && n % 100 !== 13
          ? "rd"
          : "th";
  return `${n}${suffix}`;
}

function listPhrase(items: readonly string[]): string {
  if (items.length === 1) return items[0] as string;
  if (items.length === 2) return `${items[0]} and ${items[1]}`;
  return `${items.slice(0, -1).join(", ")}, and ${items[items.length - 1]}`;
}

function timeClause(minuteValues: ReadonlySet<number>, hourValues: ReadonlySet<number>): string {
  const minute = shapeOf(minuteValues, { name: "minute", min: 0, max: 59, names: {} });
  const hour = shapeOf(hourValues, { name: "hour", min: 0, max: 23, names: {} });

  if (minute.kind === "every" && hour.kind === "every") return "Every minute";
  if (minute.kind === "single" && hour.kind === "single") {
    return `At ${pad2(hour.value)}:${pad2(minute.value)}`;
  }
  if (minute.kind === "single" && hour.kind === "every") {
    return `At minute ${minute.value} of every hour`;
  }
  if (minute.kind === "step" && hour.kind === "every") {
    const from = minute.start === 0 ? "" : `, starting at minute ${minute.start}`;
    return `Every ${minute.step} minutes${from}`;
  }
  if (minute.kind === "every" && hour.kind === "single") {
    return `Every minute during the ${pad2(hour.value)}:00 hour`;
  }
  // Fallback: two precise, independently correct clauses.
  return `${minuteClausePlain(minute)}, ${hourClausePlain(hour)}`;
}

function minuteClausePlain(shape: FieldShape): string {
  switch (shape.kind) {
    case "every":
      return "every minute";
    case "single":
      return `at minute ${shape.value}`;
    case "step":
      return `every ${shape.step} minutes` + (shape.start === 0 ? "" : ` from minute ${shape.start}`);
    case "range":
      return `every minute from ${shape.from} through ${shape.to}`;
    case "list":
      return `at minutes ${listPhrase(shape.values.map(String))}`;
  }
}

function hourClausePlain(shape: FieldShape): string {
  switch (shape.kind) {
    case "every":
      return "every hour";
    case "single":
      return `during hour ${pad2(shape.value)}`;
    case "step":
      return `every ${shape.step} hours` + (shape.start === 0 ? "" : ` from hour ${shape.start}`);
    case "range":
      return `every hour from ${pad2(shape.from)} through ${pad2(shape.to)}`;
    case "list":
      return `during hours ${listPhrase(shape.values.map(pad2))}`;
  }
}

function dayOfMonthClause(shape: FieldShape): string {
  switch (shape.kind) {
    case "every":
      return "";
    case "single":
      return `on the ${ordinal(shape.value)}`;
    case "step":
      return `every ${shape.step} day(s) of the month, starting the ${ordinal(shape.start)}`;
    case "range":
      return `on the ${ordinal(shape.from)} through the ${ordinal(shape.to)}`;
    case "list":
      return `on the ${listPhrase(shape.values.map(ordinal))}`;
  }
}

function dayOfWeekClause(shape: FieldShape): string {
  switch (shape.kind) {
    case "every":
      return "";
    case "single":
      return `on ${dayName(shape.value)}`;
    case "step":
      return `every ${shape.step} day(s) of the week, starting ${dayName(shape.start)}`;
    case "range":
      return `${dayName(shape.from)} through ${dayName(shape.to)}`;
    case "list":
      return `on ${listPhrase(shape.values.map(dayName))}`;
  }
}

function monthClause(shape: FieldShape): string {
  switch (shape.kind) {
    case "every":
      return "";
    case "single":
      return `in ${monthName(shape.value)}`;
    case "step":
      return `every ${shape.step} month(s), starting ${monthName(shape.start)}`;
    case "range":
      return `${monthName(shape.from)} through ${monthName(shape.to)}`;
    case "list":
      return `in ${listPhrase(shape.values.map(monthName))}`;
  }
}

export function explain(cron: CronExpression): string {
  const parts: string[] = [timeClause(cron.minute, cron.hour)];

  const domShape = shapeOf(cron.dayOfMonth, { name: "dayOfMonth", min: 1, max: 31, names: {} });
  const dowShape = shapeOf(cron.dayOfWeek, DAY_OF_WEEK);
  const domText = cron.domIsWildcard ? "" : dayOfMonthClause(domShape);
  const dowText = cron.dowIsWildcard ? "" : dayOfWeekClause(dowShape);

  if (domText && dowText) {
    // POSIX union: either condition qualifies the day - say so plainly
    // rather than implying both must hold at once.
    parts.push(`${domText}, or ${dowText}`);
  } else if (domText) {
    parts.push(domText);
  } else if (dowText) {
    parts.push(dowText);
  }

  const monthShape = shapeOf(cron.month, MONTH);
  const monthText = monthClause(monthShape);
  if (monthText) parts.push(monthText);

  return `${parts.join(", ")}.`;
}
