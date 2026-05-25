import { z } from "zod";

/**
 * Resolved-config schema for `google-analytics:send_event` — Slice
 * 3.GOOGLE-ANALYTICS-2.
 *
 * Sends a GA4 event via the Measurement Protocol. The Measurement Protocol
 * authenticates with `apiSecret` + `measurementId` (NOT the OAuth bearer),
 * so those are required config inputs.
 *
 * **Secret handling:** `apiSecret` is a sensitive INPUT — the handler uses it
 * only to build the `mp/collect` URL and NEVER outputs or logs it. (Runtime
 * treats it as a normal required string, matching V1; a Builder-side
 * password/credential field type is a GA-4 meta follow-up, not a runtime
 * blocker.) `clientId` / `userId` / `eventParams` are also sensitive inputs
 * and are NEVER echoed in the output.
 *
 * `accountId` / `propertyId` are optional UI-scope fields (D-GA4) — the
 * Builder uses them to scope the future measurementId picker (GA-3); the
 * runtime ignores them. Field names preserved from V1.
 */
export const SendEventConfigSchema = z
  .object({
    accountId: z.string().optional(),
    propertyId: z.string().optional(),
    measurementId: z.string().min(1, "measurementId is required."),
    apiSecret: z.string().min(1, "apiSecret is required."),
    clientId: z.string().min(1, "clientId is required."),
    eventName: z.string().min(1, "eventName is required."),
    /** JSON object (keyvalue field) OR a JSON string (textarea) — both accepted. */
    eventParams: z
      .union([z.string(), z.record(z.string(), z.unknown())])
      .optional(),
    userId: z.string().optional(),
  })
  .strict();

export type SendEventConfig = z.infer<typeof SendEventConfigSchema>;
