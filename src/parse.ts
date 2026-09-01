/**
 * Parse one cron field's text into the set of values it matches.
 *
 * Supported syntax: `*`, a literal value (numeric or a name where the
 * field allows names), a range `a-b`, a step `*\/n` or `a-b/n`, and a
 * comma-separated list of any of the above. `n/step` with no range means
 * "starting at n, every step" up through the field's maximum — the same
 * reading cron(8) uses.
 *
 * Deliberately unsupported: `L`, `W`, `#`, and wrap-around ranges like
 * `22-2`. These are real vixie-cron/Quartz extensions with genuinely
 * different semantics between implementations; silently picking one
 * reading would misrepresent what the field means. See the README.
 */

import { CronExplainError } from "./errors.js";
import type { FieldSpec } from "./fields.js";

function parseValue(token: string, spec: FieldSpec): number {
  const lower = token.toLowerCase();
  if (lower in spec.names) return spec.names[lower] as number;
  if (!/^\d+$/.test(token)) {
    throw new CronExplainError(`${spec.name}: "${token}" is not a valid value`);
  }
  let n = Number(token);
  // POSIX cron: both 0 and 7 mean Sunday in the day-of-week field.
  if (spec.name === "dayOfWeek" && n === 7) n = 0;
  if (n < spec.min || n > spec.max) {
    throw new CronExplainError(
      `${spec.name}: ${token} is out of range (${spec.min}-${spec.max})`,
    );
  }
  return n;
}

function parseStep(text: string, spec: FieldSpec): number[] {
  const slashParts = text.split("/");
  if (slashParts.length > 2) {
    throw new CronExplainError(`${spec.name}: "${text}" has more than one '/'`);
  }
  const [base, stepText] = slashParts as [string, string | undefined];

  let step = 1;
  if (stepText !== undefined) {
    if (!/^\d+$/.test(stepText) || Number(stepText) === 0) {
      throw new CronExplainError(`${spec.name}: step "${stepText}" must be a positive integer`);
    }
    step = Number(stepText);
  }

  let low: number;
  let high: number;
  if (base === "*") {
    low = spec.min;
    high = spec.max;
  } else if (base.includes("-")) {
    const rangeParts = base.split("-");
    if (rangeParts.length !== 2) {
      throw new CronExplainError(`${spec.name}: "${base}" is not a valid range`);
    }
    const [fromText, toText] = rangeParts as [string, string];
    low = parseValue(fromText, spec);
    high = parseValue(toText, spec);
    if (low > high) {
      throw new CronExplainError(
        `${spec.name}: range "${base}" starts after it ends (wrap-around ranges are not supported)`,
      );
    }
  } else {
    const value = parseValue(base, spec);
    if (stepText === undefined) return [value];
    low = value;
    high = spec.max;
  }

  const values: number[] = [];
  for (let v = low; v <= high; v += step) values.push(v);
  return values;
}

export function parseField(text: string, spec: FieldSpec): Set<number> {
  if (text.trim() === "") {
    throw new CronExplainError(`${spec.name}: field is empty`);
  }
  const values = new Set<number>();
  for (const rawPart of text.split(",")) {
    const part = rawPart.trim();
    if (part === "") {
      throw new CronExplainError(`${spec.name}: empty item between commas`);
    }
    for (const value of parseStep(part, spec)) values.add(value);
  }
  return values;
}
