/**
 * Write smoke harness deps — Gmail smoke read-back seam + self-address discovery.
 *
 * Gmail draft/label write fixtures need an INDEPENDENT read of a message's current label
 * set (proves add_label / remove_label landed, and proves a created draft is a persisted
 * DRAFT). `message_labels` reads `users.messages.get` and returns ONLY the sanitized
 * `{ found, labelIds, subject }` a verify needs — never the body / snippet / headers /
 * PII beyond the marker-bearing subject.
 *
 * `discoverGmailSelfAddress` reads the connected account's own email via
 * `users.getProfile` so a create_draft fixture can address a draft to SELF (never sent;
 * a draft addressed to the smoke account's own inbox is the smallest safe smoke artifact).
 *
 * Every provider call runs inside `refreshAndRetry` (Gmail is OAuth-with-refresh), same
 * as every Gmail action handler and the other smoke seams (seam-refresh-guard).
 */
import { getActiveForExecution } from "@/repositories/integrations";
import { refreshAndRetry } from "@/services/oauth/refreshAndRetry";
import { usersMessagesGet } from "@/integrations/gmail/api/usersMessagesGet";
import { usersGetProfile } from "@/integrations/gmail/api/usersGetProfile";
import { usersMessagesSend } from "@/integrations/gmail/api/usersMessagesSend";
import { usersMessagesTrash } from "@/integrations/gmail/api/usersMessagesTrash";
import { encodeBase64Url } from "@/integrations/gmail/utils/rfc5322";
import { extractAttachmentMetadata } from "@/integrations/gmail/triggers/newAttachment/extractAttachmentMetadata";
import type { StepRunOutcome } from "../writeHarness";
import type { SmokeReaderContext, SmokeReaderInput } from "./context";

export interface GmailSelfAddress {
  readonly email: string;
}

/**
 * Extract the sanitized label state of ONE Gmail message. Returns whether it was found,
 * its `threadId` (proves a reply / draft-reply joined the seed's thread), its `labelIds`
 * (proves add/remove label + DRAFT / SENT membership), and its `Subject` header (carries
 * the smoke marker). NEVER the body / snippet / other headers. Pure.
 */
export function extractGmailMessageLabels(
  result: {
    threadId?: string;
    labelIds?: readonly string[];
    payload?: { headers?: readonly { name: string; value: string }[] };
  } | null,
): { found: boolean; threadId: string; labelIds: string[]; subject: string } {
  if (!result) return { found: false, threadId: "", labelIds: [], subject: "" };
  const headers = result.payload?.headers ?? [];
  const subjectHeader = headers.find((h) => h.name.toLowerCase() === "subject");
  return {
    found: true,
    threadId: String(result.threadId ?? ""),
    labelIds: [...(result.labelIds ?? [])],
    subject: String(subjectHeader?.value ?? ""),
  };
}

/**
 * Discover the connected Gmail account's own email address (users.getProfile). Used to
 * address a smoke draft to SELF. READ-ONLY. Returns null when Gmail is not connected or
 * the profile lacks an address -> caller reports BLOCKED_ENV.
 */
export async function discoverGmailSelfAddress(
  accountId: string,
  _userId: string,
): Promise<GmailSelfAddress | null> {
  const integration = await getActiveForExecution(accountId, "gmail", null);
  if (!integration) return null;
  try {
    const profile = await refreshAndRetry({
      accountId,
      provider: "gmail",
      providerAccountId: integration.providerAccountId,
      apiCall: (accessToken) => usersGetProfile({ accessToken }),
    });
    const email = String((profile as { emailAddress?: string }).emailAddress ?? "");
    return email.length > 0 ? { email } : null;
  } catch {
    return null;
  }
}

export interface StagedGmailAttachment {
  readonly messageId: string;
  readonly attachmentId: string;
  readonly fileName: string;
  /** Trash the smoke seed message (the attachment goes with it). */
  readonly remove: () => Promise<void>;
}

/**
 * Self-send a SMOKE seed email that carries ONE tiny text attachment, then read it back
 * (format=full) to resolve the Gmail-assigned attachmentId. `send_email` has no
 * attachments field, so this smoke-only helper hand-builds a `multipart/mixed` RFC 5322
 * message (a text part + one attachment part) and sends it via users.messages.send. The
 * attachment filename carries `markerPrefix` (`crsmoke-<runToken>-`) so a get_attachment
 * fixture can prove it fetched OUR attachment. Returns the message id + attachmentId +
 * filename + a `remove` that trashes the seed. READ-only after the send. Returns null on
 * failure (caller reports BLOCKED_ENV).
 */
export async function stageGmailAttachmentMessage(
  accountId: string,
  _userId: string,
  markerPrefix: string,
): Promise<StagedGmailAttachment | null> {
  const integration = await getActiveForExecution(accountId, "gmail", null);
  if (!integration) return null;
  const call = <T>(fn: (t: string) => Promise<T>): Promise<T> =>
    refreshAndRetry({ accountId, provider: "gmail", providerAccountId: integration.providerAccountId, apiCall: fn });
  try {
    const profile = await call((t) => usersGetProfile({ accessToken: t }));
    const self = String((profile as { emailAddress?: string }).emailAddress ?? "");
    if (!self) return null;

    const fileName = `${markerPrefix}attach.txt`;
    const boundary = `crsmoke_b_${markerPrefix.replace(/[^A-Za-z0-9]/g, "")}`;
    // A minimal multipart/mixed message: a plain text body + one text attachment. The
    // attachment content is a fixed marker string (its bytes are what get_attachment stages).
    const attachmentB64 = Buffer.from(`${markerPrefix}attachment content - safe to ignore`, "utf8").toString("base64");
    const mime = [
      `To: ${self}`,
      `Subject: ${markerPrefix}attachseed ChainReact action-smoke - safe to ignore`,
      "MIME-Version: 1.0",
      `Content-Type: multipart/mixed; boundary="${boundary}"`,
      "",
      `--${boundary}`,
      'Content-Type: text/plain; charset="UTF-8"',
      "",
      `${markerPrefix}attachseed body - safe to ignore`,
      `--${boundary}`,
      `Content-Type: text/plain; charset="UTF-8"; name="${fileName}"`,
      `Content-Disposition: attachment; filename="${fileName}"`,
      "Content-Transfer-Encoding: base64",
      "",
      attachmentB64,
      `--${boundary}--`,
      "",
    ].join("\r\n");

    const sent = await call((t) => usersMessagesSend({ accessToken: t, rawMessage: encodeBase64Url(mime) }));
    const full = await call((t) => usersMessagesGet({ accessToken: t, messageId: sent.id, format: "full" }));
    const att = extractAttachmentMetadata(full).find((a) => a.filename === fileName);
    if (!att) return null;
    return {
      messageId: sent.id,
      attachmentId: att.attachmentId,
      fileName,
      remove: async () => {
        await call((t) => usersMessagesTrash({ accessToken: t, messageId: sent.id })).catch(() => {});
      },
    };
  } catch {
    return null;
  }
}

/** Read ONE message's sanitized label state via `users.messages.get`. */
async function readGmailMessageLabels(
  ctx: SmokeReaderContext,
  input: SmokeReaderInput,
): Promise<StepRunOutcome> {
  const messageId = typeof input.config.messageId === "string" ? input.config.messageId : "";
  if (!messageId) return { ok: false, output: null, reason: "gmail message_labels: missing messageId" };
  const integration = await getActiveForExecution(ctx.accountId, "gmail", null);
  if (!integration) return { ok: false, output: null, reason: "gmail not connected" };
  const res = await refreshAndRetry({
    accountId: ctx.accountId,
    provider: "gmail",
    providerAccountId: integration.providerAccountId,
    apiCall: (accessToken) => usersMessagesGet({ accessToken, messageId }),
  });
  return { ok: true, output: extractGmailMessageLabels(res), reason: null };
}

/**
 * Gmail smoke read-back seam. Owns one smoke-only read action:
 *   - `message_labels` — ONE message's sanitized { found, labelIds, subject } via
 *     users.messages.get (proves create_draft / add_label / remove_label side effects).
 * Returns null for any other (provider, action). Bounded + sanitized.
 */
export async function gmailSmokeReadBack(
  ctx: SmokeReaderContext,
  input: SmokeReaderInput,
): Promise<StepRunOutcome | null> {
  if (input.provider !== "gmail") return null;
  if (input.action === "message_labels") return readGmailMessageLabels(ctx, input);
  return null;
}
