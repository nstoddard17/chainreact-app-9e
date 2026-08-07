import { z } from "zod";

/**
 * Resolved-config schema for the Gmail `reply_to_email` action.
 *
 * Inputs match `create_draft_reply` exactly — the only difference at
 * the handler level is the terminal API call (`users.messages.send`
 * with threadId instead of `users.drafts.create` with threadId).
 *
 *   - `originalMessageId` (required) — Gmail message id being
 *     replied to. Headers + threadId derived from a metadata lookup.
 *   - `subject` (optional) — when non-empty, overrides the
 *     auto-generated "Re: " prefix. Otherwise the handler uses
 *     "Re: <original-subject>".
 *   - Body fields (`textBody` / `htmlBody`) — at least one must be
 *     present and non-empty. No body auto-detect (G-R6).
 *   - `cc` / `bcc` — additional recipients on top of the derived
 *     reply-to-sender address. `string | string[]` (P-G2).
 *   - `replyTo` — populates the `Reply-To:` header.
 *   - `signature` — appended with V1-faithful separators.
 *
 * V1 fields intentionally dropped:
 *   - `threadId` override — V2 always uses the lookup result.
 *   - `replyAll` — V1 logic was unclean (no self-dedupe, no address
 *     parsing). Deferred until an explicit replyAll design lands.
 *   - `attachments` — DEFERRED to Gmail 2.3 (P-S3 FileRef contract).
 *     `.strict()` rejects.
 *
 * Scope requirement: covered by `gmail.modify` (the manifest's sole
 * scope — it authorizes both messages.send and the messages.get lookup).
 */
export const ReplyToEmailConfigSchema = z
  .object({
    originalMessageId: z
      .string()
      .min(1, "originalMessageId is required."),
    subject: z.string().optional(),
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

export type ReplyToEmailConfig = z.infer<typeof ReplyToEmailConfigSchema>;
