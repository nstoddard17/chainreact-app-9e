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
