/**
 * A parsed 5-field cron expression: matching, and computing real next-run
 * instants in a given IANA timezone.
 *
 * Next-run search works entirely in real UTC instants, one minute at a
 * time: each candidate instant is formatted into the target timezone's
 * wall-clock fields (via `Intl.DateTimeFormat`, so the real IANA rules —
 * including historical and future DST changes — apply, not a hand-rolled
 * approximation), and checked against the parsed fields. This is what
 * makes DST edges come out *correct* rather than merely handled: a
 * wall-clock time skipped by a spring-forward can never be the local
 * representation of any real instant, so it is naturally never matched;
 * a wall-clock time repeated by a fall-back is the local representation
 * of two distinct instants, and both are found and returned as two
 * separate runs.
 */

import { CronExplainError } from "./errors.js";
import { DAY_OF_MONTH, DAY_OF_WEEK, HOUR, MINUTE, MONTH } from "./fields.js";
import { parseField } from "./parse.js";

export interface CronExpression {
  readonly raw: string;
  readonly minute: ReadonlySet<number>;
  readonly hour: ReadonlySet<number>;
  readonly dayOfMonth: ReadonlySet<number>;
  readonly month: ReadonlySet<number>;
  readonly dayOfWeek: ReadonlySet<number>;
  /** Whether the day-of-month field's literal text was exactly `*`. */
  readonly domIsWildcard: boolean;
  /** Whether the day-of-week field's literal text was exactly `*`. */
  readonly dowIsWildcard: boolean;
}

export function parseCron(expression: string): CronExpression {
  const fields = expression.trim().split(/\s+/).filter((f) => f !== "");
  if (fields.length !== 5) {
    throw new CronExplainError(
      `expected 5 fields (minute hour day-of-month month day-of-week), got ${fields.length}: "${expression}"`,
    );
  }
  const [minuteText, hourText, domText, monthText, dowText] = fields as [
    string, string, string, string, string,
  ];
  return {
    raw: expression.trim(),
    minute: parseField(minuteText, MINUTE),
    hour: parseField(hourText, HOUR),
    dayOfMonth: parseField(domText, DAY_OF_MONTH),
    month: parseField(monthText, MONTH),
    dayOfWeek: parseField(dowText, DAY_OF_WEEK),
    domIsWildcard: domText === "*",
    dowIsWildcard: dowText === "*",
  };
}

export interface WallClock {
  readonly year: number;
  readonly month: number;
  readonly day: number;
  readonly hour: number;
  readonly minute: number;
  readonly dayOfWeek: number;
}

const WEEKDAY_INDEX: Record<string, number> = {
  Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6,
};

export function createFormatter(timeZone: string): Intl.DateTimeFormat {
  try {
    return new Intl.DateTimeFormat("en-US", {
      timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      weekday: "short",
      hourCycle: "h23",
    });
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err);
    throw new CronExplainError(`"${timeZone}" is not a recognised IANA timezone: ${detail}`);
  }
}

export function wallClockAt(formatter: Intl.DateTimeFormat, instant: Date): WallClock {
  const parts = formatter.formatToParts(instant);
  const get = (type: Intl.DateTimeFormatPartTypes): string => {
    const part = parts.find((p) => p.type === type);
    /* v8 ignore next 3 -- defensive: Intl.DateTimeFormat always returns every requested field */
    if (!part) throw new CronExplainError(`Intl did not return a "${type}" field`);
    return part.value;
  };
  const weekday = get("weekday");
  const dayOfWeek = WEEKDAY_INDEX[weekday];
  /* v8 ignore next 3 -- defensive: "en-US" "short" weekday is always one of Sun..Sat */
  if (dayOfWeek === undefined) {
    throw new CronExplainError(`unrecognised weekday name from Intl: "${weekday}"`);
  }
  // hourCycle "h23" still reports midnight as "24" on some ICU builds;
  // normalise it rather than trust the label literally.
  const hour = Number(get("hour")) % 24;
  return {
    year: Number(get("year")),
    month: Number(get("month")),
    day: Number(get("day")),
    hour,
    minute: Number(get("minute")),
    dayOfWeek,
  };
}

export function matches(cron: CronExpression, wall: WallClock): boolean {
  if (!cron.minute.has(wall.minute)) return false;
  if (!cron.hour.has(wall.hour)) return false;
  if (!cron.month.has(wall.month)) return false;

  const domMatch = cron.dayOfMonth.has(wall.day);
  const dowMatch = cron.dayOfWeek.has(wall.dayOfWeek);

  // POSIX cron's day rule: when BOTH day-of-month and day-of-week are
  // restricted (neither is a literal '*'), a day qualifies if EITHER
  // matches - not both. When only one is restricted, only that one
  // decides. Most schedules leave one of the two as '*', where this
  // reduces to the field that was actually written.
  if (cron.domIsWildcard && cron.dowIsWildcard) return true;
  if (cron.domIsWildcard) return dowMatch;
  if (cron.dowIsWildcard) return domMatch;
  return domMatch || dowMatch;
}

/**
 * Largest real-world UTC-offset change in one transition is 2h (historical
 * double summer time, and some zones that changed standard offset); jumping
 * this far short of the estimated end of day can never overshoot it.
 */
const DST_SAFETY_MINUTES = 180;

export const DEFAULT_HORIZON_MINUTES = 4 * 366 * 24 * 60;

export interface NextRunsResult {
  readonly runs: Date[];
  /** True when the search horizon was exhausted before finding `count` runs. */
  readonly truncated: boolean;
}

/** Whether some minute of `wall`'s calendar day could possibly match,
 * ignoring hour and minute (which do not affect which days qualify). */
function dayQualifies(cron: CronExpression, wall: WallClock): boolean {
  if (!cron.month.has(wall.month)) return false;
  const domMatch = cron.dayOfMonth.has(wall.day);
  const dowMatch = cron.dayOfWeek.has(wall.dayOfWeek);
  if (cron.domIsWildcard && cron.dowIsWildcard) return true;
  if (cron.domIsWildcard) return dowMatch;
  if (cron.dowIsWildcard) return domMatch;
  return domMatch || dowMatch;
}

export function nextRuns(
  cron: CronExpression,
  from: Date,
  timeZone: string,
  count: number,
  horizonMinutes: number = DEFAULT_HORIZON_MINUTES,
): NextRunsResult {
  if (count < 1) throw new CronExplainError(`count must be at least 1, got ${count}`);
  const formatter = createFormatter(timeZone);

  // Always strictly after `from`, even if `from` itself lands exactly on
  // a matching minute - "next" means after, not "at or after".
  let candidate = new Date(Math.floor(from.getTime() / 60000) * 60000 + 60000);
  const runs: Date[] = [];
  let budget = horizonMinutes;

  // A naive minute-by-minute scan is correct but, for a sparse schedule
  // (or an unsatisfiable one - Feb 30 never happens), can mean walking
  // the entire multi-year horizon one minute at a time. Day- and
  // hour-level mismatches are skipped in one jump instead: since minute
  // and hour never affect which *days* qualify, and minute never affects
  // which *hours* qualify, a disqualified day or hour can be skipped to
  // its approximate end in a single step. The jump target is only ever
  // approximate around a DST transition (real elapsed time to the next
  // local midnight/hour is not always exactly 24h/1h); that is fine
  // because the wall clock is re-read after every jump; a landing that
  // is still short of the boundary just triggers another jump.
  while (runs.length < count && budget > 0) {
    const wall = wallClockAt(formatter, candidate);

    if (!dayQualifies(cron, wall)) {
      // Never jump all the way to the computed midnight: on a spring-forward
      // day the local day is shorter than 24h, so a full jump lands past the
      // next midnight and silently skips the start of the next day (e.g.
      // "30 0 * * MON" after a Sunday DST change missed Monday 00:30). Jump to
      // DST_SAFETY_MINUTES before the estimated midnight, then finish with
      // hour-sized steps, which re-read the wall clock at every boundary.
      const minutesLeftInDay = Math.max((24 - wall.hour) * 60 - wall.minute, 1);
      const safe =
        minutesLeftInDay > DST_SAFETY_MINUTES
          ? minutesLeftInDay - DST_SAFETY_MINUTES
          : Math.max(60 - wall.minute, 1);
      const jump = Math.min(safe, budget);
      candidate = new Date(candidate.getTime() + jump * 60000);
      budget -= jump;
      continue;
    }
    if (!cron.hour.has(wall.hour)) {
      const minutesLeftInHour = Math.max(60 - wall.minute, 1);
      const jump = Math.min(minutesLeftInHour, budget);
      candidate = new Date(candidate.getTime() + jump * 60000);
      budget -= jump;
      continue;
    }

    if (matches(cron, wall)) runs.push(new Date(candidate));
    candidate = new Date(candidate.getTime() + 60000);
    budget -= 1;
  }
  return { runs, truncated: runs.length < count };
}
