import { z } from "zod";

/**
 * Discriminated-union Zod schema for `TypedFieldInput` — shared by
 * `create_record` + `update_record` schemas.
 *
 * Each variant aligns with a `SupportedFieldType` from
 * `_shared/airtable/fields.ts`. The 17 deferred field types are NOT
 * present here — workflows that try to write a deferred type fail
 * Zod validation at the schema layer (with a discriminator-mismatch
 * error) before hitting `formatFieldValue` (which would also throw
 * `UnsupportedFieldTypeError`). Defense in depth.
 *
 * Date / dateTime values accept strings (ISO 8601 / `YYYY-MM-DD`)
 * here; the `formatFieldValue` helper handles the runtime coercion
 * to the wire shape. We don't accept `Date` objects in the resolved
 * config because the engine pre-resolves config via JSON serialization
 * before dispatch — `Date` instances never survive the wire boundary
 * to a handler. (V1 accepts both; V2's pre-resolved config means
 * strings only at the schema layer.)
 *
 * `attachment` (Airtable 2.1 Commit 1) — typed `[{url, filename?}]`
 * write shape. URL must be a valid URL; `filename`, when present, is
 * a non-empty string. Empty array allowed and forwarded (Airtable
 * clears the field — same semantic as `multipleSelects`). NPD-A2 /
 * NPD-A3 (Airtable 2.1): no FileRef at this layer; FileRef-aware byte
 * ingestion lives in the dedicated `add_attachment` action.
 */
export const TypedFieldInputSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("singleLineText"), value: z.string() }),
  z.object({ type: z.literal("longText"), value: z.string() }),
  z.object({ type: z.literal("number"), value: z.number().nullable() }),
  z.object({ type: z.literal("currency"), value: z.number().nullable() }),
  z.object({ type: z.literal("percent"), value: z.number().nullable() }),
  z.object({ type: z.literal("singleSelect"), value: z.string().nullable() }),
  z.object({
    type: z.literal("multipleSelects"),
    value: z.array(z.string()),
  }),
  z.object({ type: z.literal("checkbox"), value: z.boolean() }),
  z.object({
    type: z.literal("date"),
    value: z.string().nullable(),
  }),
  z.object({
    type: z.literal("dateTime"),
    value: z.string().nullable(),
  }),
  z.object({ type: z.literal("email"), value: z.string().nullable() }),
  z.object({ type: z.literal("url"), value: z.string().nullable() }),
  z.object({
    type: z.literal("phoneNumber"),
    value: z.string().nullable(),
  }),
  z.object({
    type: z.literal("multipleRecordLinks"),
    value: z.union([z.array(z.string()), z.string()]),
  }),
  z.object({
    type: z.literal("attachment"),
    value: z.array(
      z
        .object({
          url: z.string().url("attachment url must be a valid URL"),
          filename: z.string().min(1, "attachment filename cannot be empty").optional(),
        })
        .strict(),
    ),
  }),
]);

export type TypedFieldInputZod = z.infer<typeof TypedFieldInputSchema>;
