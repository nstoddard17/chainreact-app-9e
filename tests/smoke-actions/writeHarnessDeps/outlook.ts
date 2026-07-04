/**
 * Write smoke harness deps — Microsoft Outlook smoke read-back seam + self-address
 * discovery + mail-seed staging.
 *
 * Outlook's Graph send/reply/forward endpoints return 202 with NO message id, so the
 * mail write fixtures cannot capture their created resource from the execute output.
 * The seam owns the two bounded reads that close that gap:
 *   - `find_messages` — poll one or more folders (well-known names OK) for messages
 *     whose subject contains a token-resolved marker string (optionally requiring an
 *     "re"/"fw" prefix), returning ONLY { found, count, matches:[{id}], subjects }.
 *     The internal poll is BOUNDED (attempts x interval) and absorbs Graph transport
 *     lag for self-sent mail. Captured ids let cleanupEach delete exactly the smoke
 *     copies (inbox + sent items) — the run-unique marker guarantees only OUR
 *     messages ever match.
 *   - `message_state` — GET one message and return ONLY { found, subject, categories,
 *     isRead }. The typed NotFoundError maps to found:false; any OTHER error rethrows
 *     so a permission/API failure can never read as "deleted" (context.ts invariant).
 *
 * `discoverOutlookSelfAddress` reads the connected mailbox's own address (Graph /me)
 * so send/forward fixtures can self-address — mail never leaves the throwaway account.
 *
 * `stageOutlookSeedMessage` self-sends a marker-subjected seed (reply/forward need a
 * REAL received message — Graph cannot reply to a draft), resolves the INBOX copy id
 * by bounded polling, and returns a `remove` that permanently deletes both the inbox
 * and Sent Items copies. Runs in the dev test, outside the harness (Gmail
 * attachment-seed precedent).
 *
 * Every provider read runs inside `refreshAndRetry` (seam-refresh-guard); the staging
 * mutators (sendMail / deleteMessage) go through the same local `call` helper, like
 * the Gmail staging helper.
 */
import { getActiveForExecution } from "@/repositories/integrations";
import { refreshAndRetry } from "@/services/oauth/refreshAndRetry";
import { listMessages } from "@/integrations/microsoft-outlook/api/listMessages";
import { getMessage } from "@/integrations/microsoft-outlook/api/getMessage";
import { getMailboxProfile } from "@/integrations/microsoft-outlook/api/getMailboxProfile";
import {
  sendMail,
  type GraphFileAttachment,
} from "@/integrations/microsoft-outlook/api/sendMail";
import { deleteMessage } from "@/integrations/microsoft-outlook/api/deleteMessage";
import { NotFoundError } from "@/integrations/_shared/microsoft/api/errors";
import type { StepRunOutcome } from "../writeHarness";
import type { SmokeReaderContext, SmokeReaderInput } from "./context";

const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

/** Bounded find_messages poll: 8 attempts x 4s ≈ 32s worst case per verify. */
const FIND_ATTEMPTS = 8;
const FIND_INTERVAL_MS = 4000;

export interface OutlookSelfAddress {
  readonly email: string;
}

/**
 * Discover the connected Outlook mailbox's own address (Graph /me). READ-ONLY.
 * Returns null when Outlook is not connected or the profile has no address ->
 * caller reports BLOCKED_ENV.
 */
export async function discoverOutlookSelfAddress(
  accountId: string,
  _userId: string,
): Promise<OutlookSelfAddress | null> {
  const integration = await getActiveForExecution(accountId, "microsoft-outlook", null);
  if (!integration) return null;
  try {
    const profile = await refreshAndRetry({
      accountId,
      provider: "microsoft-outlook",
      providerAccountId: integration.providerAccountId,
      apiCall: (accessToken) => getMailboxProfile({ accessToken }),
    });
    const email = String(profile.mail ?? profile.userPrincipalName ?? "");
    return email.length > 0 ? { email } : null;
  } catch {
    return null;
  }
}

export interface StagedOutlookSeed {
  /** Graph id of the INBOX copy (the message fixtures act on). */
  readonly messageId: string;
  /** Permanently delete the inbox + Sent Items copies (best-effort). */
  readonly remove: () => Promise<void>;
}

interface SubjectMatch {
  readonly id: string;
  readonly subject: string;
}

/** One bounded folder scan: newest 50 messages whose subject passes the filters. */
async function scanFolder(
  accountId: string,
  providerAccountId: string | null,
  folderId: string,
  contains: string,
  prefix: string | null,
): Promise<SubjectMatch[]> {
  const result = await refreshAndRetry({
    accountId,
    provider: "microsoft-outlook",
    providerAccountId,
    apiCall: (accessToken) =>
      listMessages({ accessToken, folderId, maxResults: 50 }),
  });
  const needle = contains.toLowerCase();
  return result.value
    .map((m) => ({ id: m.id, subject: String(m.subject ?? "") }))
    .filter((m) => {
      const s = m.subject.trim().toLowerCase();
      if (!s.includes(needle)) return false;
      if (prefix && !s.startsWith(prefix.toLowerCase())) return false;
      return true;
    });
}

/**
 * Self-send a marker-subjected SMOKE seed message and resolve its INBOX copy id by
 * bounded polling. `withAttachment` adds one tiny marker-named text fileAttachment
 * (for the get_attachment fixture). Returns null on any failure (caller reports
 * BLOCKED_ENV; a marked message may remain — harmless, crsmoke- subject).
 */
export async function stageOutlookSeedMessage(
  accountId: string,
  _userId: string,
  markerPrefix: string,
  role: string,
  opts?: { withAttachment?: boolean },
): Promise<StagedOutlookSeed | null> {
  const integration = await getActiveForExecution(accountId, "microsoft-outlook", null);
  if (!integration) return null;
  const providerAccountId = integration.providerAccountId;
  const call = <T>(fn: (t: string) => Promise<T>): Promise<T> =>
    refreshAndRetry({ accountId, provider: "microsoft-outlook", providerAccountId, apiCall: fn });
  try {
    const profile = await call((t) => getMailboxProfile({ accessToken: t }));
    const self = String(profile.mail ?? profile.userPrincipalName ?? "");
    if (!self) return null;

    const subject = `${markerPrefix}${role} ChainReact action-smoke - safe to ignore`;
    const attachments: GraphFileAttachment[] | undefined = opts?.withAttachment
      ? [
          {
            "@odata.type": "#microsoft.graph.fileAttachment",
            name: `${markerPrefix}attach.txt`,
            contentType: "text/plain",
            contentBytes: Buffer.from(
              `${markerPrefix}attachment content - safe to ignore`,
              "utf8",
            ).toString("base64"),
          },
        ]
      : undefined;

    await call((t) =>
      sendMail({
        accessToken: t,
        message: {
          subject,
          body: { contentType: "Text", content: `${markerPrefix}${role} body - safe to ignore` },
          toRecipients: [{ emailAddress: { address: self } }],
          importance: "normal",
          ...(attachments && { attachments }),
        },
        saveToSentItems: true,
      }),
    );

    // Resolve the INBOX copy (Graph transport lag: bounded poll).
    let inboxId: string | null = null;
    for (let i = 0; i < FIND_ATTEMPTS && !inboxId; i += 1) {
      const hits = await scanFolder(accountId, providerAccountId, "inbox", subject, null);
      if (hits.length > 0) inboxId = hits[0]!.id;
      else await sleep(FIND_INTERVAL_MS);
    }
    if (!inboxId) return null;

    // Best-effort: also resolve the Sent Items copy so remove() erases both.
    const sentHits = await scanFolder(accountId, providerAccountId, "sentitems", subject, null);
    const sentId = sentHits[0]?.id ?? null;

    const seedInboxId = inboxId;
    return {
      messageId: seedInboxId,
      remove: async () => {
        await call((t) => deleteMessage({ accessToken: t, messageId: seedInboxId })).catch(() => {});
        if (sentId) {
          await call((t) => deleteMessage({ accessToken: t, messageId: sentId })).catch(() => {});
        }
      },
    };
  } catch {
    return null;
  }
}

/** find_messages — bounded marker-subject poll across folders; ids stay in memory. */
async function readOutlookFindMessages(
  ctx: SmokeReaderContext,
  input: SmokeReaderInput,
): Promise<StepRunOutcome> {
  const contains = typeof input.config.contains === "string" ? input.config.contains : "";
  if (!contains || !contains.includes("crsmoke-")) {
    // The needle must be a resolved run marker — an unresolved token or free-text
    // needle could match REAL mail; refuse instead.
    return { ok: false, output: null, reason: "outlook find_messages: contains must be a resolved crsmoke- marker" };
  }
  const foldersCsv = typeof input.config.folders === "string" ? input.config.folders : "inbox";
  const folders = foldersCsv.split(",").map((f) => f.trim()).filter((f) => f.length > 0);
  const prefix = typeof input.config.prefix === "string" && input.config.prefix.length > 0 ? input.config.prefix : null;
  const minCountRaw = input.config.minCount;
  const minCount =
    typeof minCountRaw === "number"
      ? minCountRaw
      : typeof minCountRaw === "string" && /^\d+$/.test(minCountRaw)
        ? Number(minCountRaw)
        : 1;

  const integration = await getActiveForExecution(ctx.accountId, "microsoft-outlook", null);
  if (!integration) return { ok: false, output: null, reason: "microsoft-outlook not connected" };

  let matches: SubjectMatch[] = [];
  for (let attempt = 0; attempt < FIND_ATTEMPTS; attempt += 1) {
    const perFolder = await Promise.all(
      folders.map((f) => scanFolder(ctx.accountId, integration.providerAccountId, f, contains, prefix)),
    );
    matches = perFolder.flat();
    if (matches.length >= minCount) break;
    await sleep(FIND_INTERVAL_MS);
  }

  return {
    ok: true,
    output: {
      found: matches.length >= minCount,
      count: matches.length,
      // ids ride in memory for ledger capture (idsPath "matches") — never printed.
      matches: matches.map((m) => ({ id: m.id })),
      subjects: matches.map((m) => m.subject),
    },
    reason: null,
  };
}

/** message_state — ONE message's sanitized { found, subject, categories, isRead }. */
async function readOutlookMessageState(
  ctx: SmokeReaderContext,
  input: SmokeReaderInput,
): Promise<StepRunOutcome> {
  const messageId = typeof input.config.messageId === "string" ? input.config.messageId : "";
  if (!messageId) return { ok: false, output: null, reason: "outlook message_state: missing messageId" };
  const integration = await getActiveForExecution(ctx.accountId, "microsoft-outlook", null);
  if (!integration) return { ok: false, output: null, reason: "microsoft-outlook not connected" };
  try {
    const msg = await refreshAndRetry({
      accountId: ctx.accountId,
      provider: "microsoft-outlook",
      providerAccountId: integration.providerAccountId,
      apiCall: (accessToken) => getMessage({ accessToken, messageId }),
    });
    const full = msg as { subject?: string | null; categories?: string[] | null; isRead?: boolean | null };
    return {
      ok: true,
      output: {
        found: true,
        subject: String(full.subject ?? ""),
        categories: [...(full.categories ?? [])],
        isRead: full.isRead ?? null,
      },
      reason: null,
    };
  } catch (err) {
    // ONLY the typed NotFoundError maps to found:false (context.ts invariant).
    if (err instanceof NotFoundError) {
      return { ok: true, output: { found: false, subject: "", categories: [], isRead: null }, reason: null };
    }
    throw err;
  }
}

/**
 * Microsoft Outlook smoke read-back seam. Owns two smoke-only reads:
 *   - `find_messages` — marker-subject folder poll (send/reply/forward/move/delete proofs).
 *   - `message_state` — one message's categories/subject/isRead (add_categories proof).
 * Returns null for any other (provider, action). Bounded + sanitized.
 */
export async function outlookSmokeReadBack(
  ctx: SmokeReaderContext,
  input: SmokeReaderInput,
): Promise<StepRunOutcome | null> {
  if (input.provider !== "microsoft-outlook") return null;
  if (input.action === "find_messages") return readOutlookFindMessages(ctx, input);
  if (input.action === "message_state") return readOutlookMessageState(ctx, input);
  return null;
}
