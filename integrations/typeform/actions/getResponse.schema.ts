import { z } from "zod";

/**
 * Resolved-config schema for `typeform:get_response` — TYPEFORM-2.
 *
 *   - `formId` (required) — the form the response belongs to.
 *   - `responseToken` (required) — Typeform's unique response id (the
 *     trigger's `{{trigger.responseToken}}` maps here directly).
 *
 * Returns `{ found: false, … }` when no completed response matches the
 * token — does NOT throw (Stripe find_* precedent). A 404 on the FORM
 * itself still surfaces as a config-shaped provider error.
 */
export const GetResponseConfigSchema = z
  .object({
    formId: z
      .string({ required_error: "formId is required." })
      .min(1, "formId is required."),
    responseToken: z
      .string({ required_error: "responseToken is required." })
      .min(1, "responseToken is required."),
  })
  .strict();

export type GetResponseConfig = z.infer<typeof GetResponseConfigSchema>;
