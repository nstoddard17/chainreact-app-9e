import { z } from "zod";

/**
 * Resolved-config schema for the Gmail `create_draft_reply` action.
 *
 * Inputs:
 *   - `originalMessageId` (required) — Gmail message id of the email
 *     being replied to. The handler fetches its headers via
 *     `users.messages.get?format=metadata` to derive `To`, `Subject`,
 *     `In-Reply-To`, `References`, and `threadId`.
 *   - `subject` (optional) — when provided non-empty, OVERRIDES the
 *     auto-generated "Re: " prefix. When omitted or whitespace-only,
 *     the handler uses "Re: <original-subject>" (V1 parity).
 *   - Body fields (`textBody` / `htmlBody`) — same rules as
 *     `send_email` / `create_draft`. At least one must be present and
 *     non-empty.
 *   - `cc` / `bcc` — additional recipients ON TOP OF the derived
 *     reply-to-sender address. Accept `string | string[]` (P-G2).
 *   - `replyTo` — populates the `Reply-To:` header on the draft.
 *   - `signature` — appended to body fields with the V1-faithful
 *     `\n\n` (text) / `<br><br>` (html) separators.
 *
 * V1 fields intentionally dropped:
 *   - `threadId` override — V1 accepted a `threadId` config field as
 *     a fallback when the original-message lookup didn't return one.
 *     V2 always uses the lookup result; if the original lookup
 *     fails, the handler fails fast rather than silently sending to
 *     a caller-supplied threadId that may not match the actual
 *     thread.
 *   - `replyAll` — see `buildReplyContext.ts` notes. V1's replyAll
 *     was unclean (no self-dedupe, no email-address parsing). Defer
 *     to a future slice with an explicit design.
 *   - `attachments` — DEFERRED to Gmail 2.3 (P-S3 FileRef contract).
 *     `.strict()` rejects unknown keys including `attachments`.
 *
 * Scope requirement: covered by `gmail.modify` (the manifest's sole
 * scope — it authorizes both drafts.create and the messages.get lookup).
 */
export const CreateDraftReplyConfigSchema = z
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

export type CreateDraftReplyConfig = z.infer<
  typeof CreateDraftReplyConfigSchema
>;
