import { z } from "zod";

/**
 * Runtime config schema for `fleetio:create_meter_entry` (FLEETIO-4).
 *
 * `.strict()` — the authoritative validation of the RESOLVED config (the engine
 * pre-resolves `{{...}}` before the handler runs, so every value here is
 * concrete). Narrow by design: exactly the four fields Fleetio's
 * `POST /meter_entries` needs, no raw-body passthrough, no arbitrary provider
 * fields.
 *
 * Field-by-field rationale (all derived from the 2025-05-05 OpenAPI schema):
 *
 *   - `vehicleId` — Fleetio's `vehicle_id` is the `Id` wire type (integer ≥ 1)
 *     and travels in the BODY, so a positive-integer id is enforced HERE, before
 *     any provider call, and converted to a number only inside the API layer.
 *     Accepts a number as well as a string because the canonical resolver
 *     preserves an upstream value's real type — a mapped id may legitimately
 *     arrive as `42` rather than `"42"`.
 *   - `value` — Fleetio's `value` is `number`/`format: float`. Accepts a number
 *     or a numeric string (again: mapped upstream values keep their real type,
 *     and a Motive odometer output is a `number`). Decimals are preserved.
 *     Explicit `0` is VALID (a brand-new vehicle really can read zero) and is
 *     never treated as missing. `NaN`, `±Infinity`, empty strings and
 *     non-numeric strings are rejected before the provider is called.
 *     Negative values are rejected: Fleetio's schema does not permit them and
 *     its sequence validation would reject them anyway.
 *     `MAX_METER_VALUE` is derived from the wire type — `format: float` is
 *     single precision, whose exact-integer ceiling is 2^24 (16,777,216), so
 *     10,000,000 is the largest round bound that is still exactly representable
 *     and is far above any real odometer or hour meter.
 *   - `meterType` — Fleetio expresses primary-vs-secondary ONLY via
 *     `meter_type` (nullable, sole enum member `"secondary"`). Choosing wrongly
 *     writes the reading to the wrong meter and therefore changes preventive-
 *     maintenance scheduling, so per Q11 it is REQUIRED with NO silent default.
 *     ChainReact surfaces the honest two-way choice; the API layer maps
 *     `primary` → omit the key, `secondary` → `"secondary"`.
 *   - `readingDate` — Fleetio lists `date` in the endpoint's `required` array
 *     and does NOT default it server-side, so it is required here too. (The
 *     original plan assumed it was optional-with-a-server-default; the schema
 *     says otherwise — see the plan doc's discrepancy table.) ISO-8601 with an
 *     offset or a trailing `Z`, matching the builder's `datetime-utc` field.
 */

/** Largest accepted reading — see the module note on `format: float` precision. */
export const MAX_METER_VALUE = 10_000_000;

/**
 * A Fleetio `Id` supplied as either a string or a number, normalized to a
 * positive-integer STRING. Rejects blanks, decimals, zero, negatives and
 * anything non-numeric before a provider call is ever made.
 */
const FleetioIdInput = z
  .union([z.string(), z.number()])
  .transform((raw, ctx) => {
    const text = typeof raw === "number" ? String(raw) : raw.trim();
    if (!/^[1-9][0-9]*$/.test(text)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "The vehicle id must be a positive whole number.",
      });
      return z.NEVER;
    }
    return text;
  });

/**
 * A meter reading supplied as either a number or a numeric string, normalized to
 * a finite non-negative number within `MAX_METER_VALUE`.
 */
const MeterReadingInput = z
  .union([z.number(), z.string()])
  .transform((raw, ctx) => {
    if (typeof raw === "number") return raw;
    const text = raw.trim();
    if (text === "") {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "A meter reading is required.",
      });
      return z.NEVER;
    }
    const parsed = Number(text);
    if (!Number.isFinite(parsed)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "The meter reading must be a number.",
      });
      return z.NEVER;
    }
    return parsed;
  })
  // `.finite()` rejects ±Infinity; `z.number()` itself rejects NaN. `0` passes.
  .pipe(
    z
      .number()
      .finite("The meter reading must be a number.")
      .min(0, "The meter reading cannot be negative.")
      .max(MAX_METER_VALUE, "That meter reading is too large."),
  );

export const CreateMeterEntryConfigSchema = z
  .object({
    vehicleId: FleetioIdInput,
    value: MeterReadingInput,
    meterType: z.enum(["primary", "secondary"], {
      errorMap: () => ({ message: "Choose the primary or the secondary meter." }),
    }),
    readingDate: z
      .string()
      .trim()
      .min(1, "A reading date is required.")
      .datetime({ offset: true, message: "The reading date must be a valid date and time." }),
  })
  .strict();

export type CreateMeterEntryConfig = z.infer<typeof CreateMeterEntryConfigSchema>;
