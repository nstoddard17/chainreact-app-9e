import { z } from "zod";

/**
 * Resolved-config schema for the Gmail `create_draft` action.
 *
 * Mirrors `sendEmail.schema.ts` minus the Q11-clean expansion fields
 * that don't apply to draft creation:
 *   - `labels` is intentionally omitted — V1's `createGmailDraft` did
 *     not apply labels (labels-on-send was a send-side concern). If
 *     workflow authors want a draft tagged with a label, they create
 *     the draft, then add the label via a dedicated `add_label`
 *     action against the resulting `messageId`. (`addLabel` action
 *     lands in Gmail 2.2.)
 *
 * Carried over from `sendEmail.schema.ts`:
 *   - `to` / `cc` / `bcc` accept `string | string[]` (P-G2).
 *   - `subject` may be empty string (per Slice 2d additional decision).
 *   - At least one of `textBody` / `htmlBody` must be present and
 *     non-empty. No body auto-detect (G-R6).
 *   - `replyTo` populates the RFC 5322 `Reply-To:` header verbatim.
 *   - `signature` is appended to whichever bodies are present:
 *     `textBody` → "\n\n<sig>", `htmlBody` → "<br><br><sig>".
 *
 * Q11 — fields dropped at port time (matches `send_email`):
 *   `scheduleSend`, `trackOpens`, `trackClicks`, V1's single `body`
 *   field with auto-detect, V1's `(No Subject)` fallback. All rejected
 *   by `.strict()`.
 *
 * Attachments — DEFERRED to Gmail 2.3 (P-S3). `.strict()` rejects an
 * `attachments` key with a clean Zod error.
 *
 * Scope requirement: covered by `gmail.modify` (the manifest's sole scope).
 */
export const CreateDraftConfigSchema = z
  .object({
    to: z.union([
      z.string().min(1, "Recipient is required (CSV or array)."),
      z.array(z.string()).min(1, "Recipient is required (CSV or array)."),
    ]),
    subject: z.string(),
    textBody: z.string().optional(),
    htmlBody: z.string().optional(),
    cc: z.union([z.string(), z.array(z.string())]).optional(),
    bcc: z.union([z.string(), z.array(z.string())]).optional(),
    replyTo: z.string().min(1).optional(),
    signature: z.string().min(1).optional(),
  })
  .strict()
  .refine(
    (val) => Boolean(val.textBody) || Boolean(val.htmlBody),
    { message: "At least one of textBody or htmlBody must be provided." },
  );

export type CreateDraftConfig = z.infer<typeof CreateDraftConfigSchema>;
