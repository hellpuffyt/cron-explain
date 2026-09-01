/** The five standard cron fields and what values each accepts. */

export interface FieldSpec {
  readonly name: "minute" | "hour" | "dayOfMonth" | "month" | "dayOfWeek";
  readonly min: number;
  readonly max: number;
  /** Name -> numeric value, for fields that accept names (JAN, MON, ...). */
  readonly names: Readonly<Record<string, number>>;
}

const MONTH_NAMES: Record<string, number> = {
  jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6,
  jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12,
};

const DAY_NAMES: Record<string, number> = {
  sun: 0, mon: 1, tue: 2, wed: 3, thu: 4, fri: 5, sat: 6,
};

export const MINUTE: FieldSpec = { name: "minute", min: 0, max: 59, names: {} };
export const HOUR: FieldSpec = { name: "hour", min: 0, max: 23, names: {} };
export const DAY_OF_MONTH: FieldSpec = { name: "dayOfMonth", min: 1, max: 31, names: {} };
export const MONTH: FieldSpec = { name: "month", min: 1, max: 12, names: MONTH_NAMES };
// 0 and 7 both mean Sunday, per POSIX cron; 7 is normalised to 0 during parsing.
export const DAY_OF_WEEK: FieldSpec = { name: "dayOfWeek", min: 0, max: 7, names: DAY_NAMES };

export const FIELD_ORDER: readonly FieldSpec[] = [MINUTE, HOUR, DAY_OF_MONTH, MONTH, DAY_OF_WEEK];

export const MONTH_LABEL = [
  "", "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

export const DAY_LABEL = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
