/**
 * CONFIG-UX-SETUP-ADVANCED-1 — pure preset ↔ cron-string mapping for the
 * CronField schedule builder.
 *
 * The stored value is ALWAYS the same 5-field UTC cron string the runtime
 * schema validated before this feature existed — presets are a pure UI
 * projection over it, so saved workflows hydrate unchanged and the
 * runtime contract is untouched.
 *
 * `parseCronPreset` recognizes exactly the shapes `buildCronExpression`
 * emits; anything else (steps, ranges beyond weekdays, lists, multi-field
 * combinations) parses as `custom` and keeps the raw-input experience —
 * an unfamiliar saved expression is never rewritten or lost.
 */

export type CronPreset =
  | { kind: "hourly"; minute: number }
  | { kind: "daily"; hour: number; minute: number }
  | { kind: "weekdays"; hour: number; minute: number }
  | { kind: "weekly"; dayOfWeek: number; hour: number; minute: number }
  | { kind: "monthly"; dayOfMonth: number; hour: number; minute: number }
  | { kind: "custom" };

export type CronPresetKind = CronPreset["kind"];

const INT = /^\d{1,2}$/;

function toInt(field: string, max: number): number | null {
  if (!INT.test(field)) return null;
  const n = Number(field);
  return n >= 0 && n <= max ? n : null;
}

/**
 * Classify a cron string into the preset it represents, or `custom` when
 * it isn't one of the exact builder-emitted shapes (including empty /
 * unparseable strings — the caller decides how to treat empty).
 */
export function parseCronPreset(expression: string): CronPreset {
  const parts = expression.trim().split(/\s+/);
  if (parts.length !== 5) return { kind: "custom" };
  const [m, h, dom, mon, dow] = parts as [string, string, string, string, string];
  const minute = toInt(m, 59);
  if (minute === null) return { kind: "custom" };

  if (h === "*" && dom === "*" && mon === "*" && dow === "*") {
    return { kind: "hourly", minute };
  }

  const hour = toInt(h, 23);
  if (hour === null) return { kind: "custom" };

  if (dom === "*" && mon === "*") {
    if (dow === "*") return { kind: "daily", hour, minute };
    if (dow === "1-5") return { kind: "weekdays", hour, minute };
    const dayOfWeek = toInt(dow, 6);
    if (dayOfWeek !== null) return { kind: "weekly", dayOfWeek, hour, minute };
    return { kind: "custom" };
  }

  if (mon === "*" && dow === "*") {
    const dayOfMonth = dom === "0" ? null : toInt(dom, 31);
    if (dayOfMonth !== null && dayOfMonth >= 1) {
      return { kind: "monthly", dayOfMonth, hour, minute };
    }
  }

  return { kind: "custom" };
}

/** Emit the 5-field UTC cron string for a (non-custom) preset. */
export function buildCronExpression(preset: Exclude<CronPreset, { kind: "custom" }>): string {
  switch (preset.kind) {
    case "hourly":
      return `${preset.minute} * * * *`;
    case "daily":
      return `${preset.minute} ${preset.hour} * * *`;
    case "weekdays":
      return `${preset.minute} ${preset.hour} * * 1-5`;
    case "weekly":
      return `${preset.minute} ${preset.hour} * * ${preset.dayOfWeek}`;
    case "monthly":
      return `${preset.minute} ${preset.hour} ${preset.dayOfMonth} * *`;
  }
}

export const WEEKDAY_OPTIONS: ReadonlyArray<{ value: number; label: string }> = [
  { value: 1, label: "Monday" },
  { value: 2, label: "Tuesday" },
  { value: 3, label: "Wednesday" },
  { value: 4, label: "Thursday" },
  { value: 5, label: "Friday" },
  { value: 6, label: "Saturday" },
  { value: 0, label: "Sunday" },
];
