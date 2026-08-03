/** @jest-environment node */
/**
 * CONFIG-UX-SETUP-ADVANCED-1 — cron preset ↔ string mapping.
 *
 * The stored value is ALWAYS the runtime-validated 5-field UTC cron
 * string; presets are a pure UI projection. Round-trips must be exact,
 * and anything the builder didn't emit must classify as `custom` so an
 * unfamiliar saved expression is never rewritten.
 */
import {
  buildCronExpression,
  parseCronPreset,
} from "@/features/workflow-builder/config-modal/fields/_cronPresets";

describe("parseCronPreset — recognizes exactly the builder-emitted shapes", () => {
  it.each([
    ["0 * * * *", { kind: "hourly", minute: 0 }],
    ["30 * * * *", { kind: "hourly", minute: 30 }],
    ["0 9 * * *", { kind: "daily", hour: 9, minute: 0 }],
    ["15 17 * * *", { kind: "daily", hour: 17, minute: 15 }],
    ["0 9 * * 1-5", { kind: "weekdays", hour: 9, minute: 0 }],
    ["0 9 * * 1", { kind: "weekly", dayOfWeek: 1, hour: 9, minute: 0 }],
    ["45 6 * * 0", { kind: "weekly", dayOfWeek: 0, hour: 6, minute: 45 }],
    ["0 9 1 * *", { kind: "monthly", dayOfMonth: 1, hour: 9, minute: 0 }],
    ["0 9 31 * *", { kind: "monthly", dayOfMonth: 31, hour: 9, minute: 0 }],
  ])("%s", (expr, expected) => {
    expect(parseCronPreset(expr)).toEqual(expected);
  });

  it.each([
    "*/15 * * * *", // step — power syntax
    "0 9,17 * * *", // list
    "0 9 * * 2-4", // non-weekday range
    "0 9 1 1 *", // specific month
    "0 9 * * 1-5 extra", // 6 fields
    "@hourly", // macro (runtime rejects too)
    "", // empty
    "60 * * * *", // out-of-range minute
    "0 24 * * *", // out-of-range hour
  ])("'%s' is custom (never rewritten)", (expr) => {
    expect(parseCronPreset(expr)).toEqual({ kind: "custom" });
  });
});

describe("buildCronExpression ↔ parseCronPreset round-trip", () => {
  it.each([
    [{ kind: "hourly", minute: 5 } as const, "5 * * * *"],
    [{ kind: "daily", hour: 0, minute: 0 } as const, "0 0 * * *"],
    [{ kind: "weekdays", hour: 8, minute: 30 } as const, "30 8 * * 1-5"],
    [{ kind: "weekly", dayOfWeek: 6, hour: 12, minute: 0 } as const, "0 12 * * 6"],
    [{ kind: "monthly", dayOfMonth: 15, hour: 23, minute: 59 } as const, "59 23 15 * *"],
  ])("%o → %s → back", (preset, expected) => {
    const expr = buildCronExpression(preset);
    expect(expr).toBe(expected);
    expect(parseCronPreset(expr)).toEqual(preset);
  });
});
