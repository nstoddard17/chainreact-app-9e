import { z } from "zod";

/**
 * Resolved-config schema for `typeform:list_responses` — TYPEFORM-2.
 *
 *   - `formId` (required) — the form whose responses are listed.
 *   - `pageSize` — 1..100 (V2 bound, well under Typeform's 1000 max);
 *     handler defaults to 25 (the API default) when omitted.
 *   - `since` / `until` — ISO 8601 UTC instants ("YYYY-MM-DDTHH:MM:SSZ",
 *     the `datetime-utc` builder field shape). "" (builder-cleared) =
 *     not sent.
 *   - `query` — server-side search across answers/hidden fields. "" =
 *     not sent.
 *   - `before` — Typeform's cursor: the `token` of the last response on
 *     the previous page (a prior run's `nextBefore` output). "" = first
 *     (newest) page.
 */
export const ListResponsesConfigSchema = z
  .object({
    formId: z
      .string({ required_error: "formId is required." })
      .min(1, "formId is required."),
    pageSize: z.number().int().min(1).max(100).optional(),
    since: z.string().optional(),
    until: z.string().optional(),
    query: z.string().optional(),
    before: z.string().optional(),
  })
  .strict();

export type ListResponsesConfig = z.infer<typeof ListResponsesConfigSchema>;
