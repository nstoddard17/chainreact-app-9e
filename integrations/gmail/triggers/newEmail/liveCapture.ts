import { z } from "zod";
import { refreshAndRetry } from "@/services/oauth/refreshAndRetry";
import { getActiveForExecution } from "@/repositories/integrations";
import type {
  CaptureAttemptResult,
  LiveCaptureContext,
  LiveTriggerCaptureAdapter,
  TriggerBaseline,
} from "@/services/triggers/liveCapture/types";
import {
  HistoryListStaleCursorError,
  usersHistoryList,
} from "../../api/usersHistoryList";
import { usersGetProfile } from "../../api/usersGetProfile";
import { usersMessagesGet } from "../../api/usersMessagesGet";
import { extractMessageEvents } from "./extractMessageEvents";
import { matchesFilters } from "./filters";
import { buildTriggerEvent } from "./messageHydration";
import { GmailNewEmailConfigSchema } from "./schema";

/**
 * Gmail `new_email` live-capture adapter (WORKFLOW-LIVE-TEST-4 §1) — the first production
 * registration of the WORKFLOW-LIVE-TEST-3 §6 contract.
 *
 * It reuses the production trigger's own building blocks — the SAME config schema, filter
 * matcher, and canonical TriggerEvent hydration the polling handler uses — so a captured event
 * is byte-for-byte what an activated `gmail:new_email` trigger would have emitted. What it very
 * deliberately does NOT reuse is the production trigger's STATE:
 *
 *   - No `trigger_resources` row is read or written; the cursor lives on the SESSION.
 *   - No `webhook_event_dedup` insert or read (poll.ts's `checkAndMarkSeen` is not called) —
 *     a live test must never consume a production dedup slot for a message the real trigger
 *     may later need to process.
 *   - Non-matching messages are inspected and IGNORED — not consumed, not recorded.
 *
 * Baseline: the mailbox `historyId` at the moment listening starts (users.getProfile — the same
 * baseline-first activation rule the production trigger follows). Only mail that arrives AFTER
 * that point can be captured, so pre-existing inbox content is never replayed as "new".
 *
 * Bounded inspection: each `captureNext` walks a capped number of history pages and hydrates a
 * capped number of candidate messages (metadata format only — never the body). The waiting
 * contract cannot persist cursor progress, so a busy inbox re-inspects the same non-matching
 * candidates next attempt; the caps keep that re-walk cheap and the orchestrator owns pacing.
 */

const MAX_HISTORY_PAGES_PER_ATTEMPT = 10;
const MAX_HYDRATIONS_PER_ATTEMPT = 25;

/** Serializable session baseline. `providerAccountId` pins the mailbox listening started on. */
const GmailLiveCaptureBaselineSchema = z.object({
  historyId: z.string().min(1),
  providerAccountId: z.string().min(1),
  capturedAt: z.string().min(1),
});

async function resolveIntegration(accountId: string) {
  const integration = await getActiveForExecution(accountId, "gmail", null);
  if (!integration) {
    // Thrown, not swallowed: at start time this surfaces as the typed retryable
    // `baseline_failed`; mid-listen the orchestrator reports a transient capture problem.
    throw new Error("No active Gmail connection is available for this account.");
  }
  return integration;
}

async function establishBaseline(context: LiveCaptureContext): Promise<TriggerBaseline> {
  const integration = await resolveIntegration(context.accountId);
  const profile = await refreshAndRetry({
    accountId: context.accountId,
    provider: "gmail",
    providerAccountId: integration.providerAccountId,
    apiCall: async (accessToken) => usersGetProfile({ accessToken }),
  });
  return {
    historyId: profile.historyId,
    providerAccountId: integration.providerAccountId,
    capturedAt: new Date().toISOString(),
  };
}

async function captureNext(
  context: LiveCaptureContext,
  baseline: TriggerBaseline,
): Promise<CaptureAttemptResult> {
  const parsedBaseline = GmailLiveCaptureBaselineSchema.parse(baseline);
  const config = GmailNewEmailConfigSchema.parse(context.triggerConfig);
  const integration = await resolveIntegration(context.accountId);

  // The mailbox listening started on is the mailbox we keep watching. If the account's Gmail
  // connection was swapped mid-listen, the session-service fingerprint/bindings checks own the
  // refusal — here we only refuse to silently capture from a different inbox.
  if (integration.providerAccountId !== parsedBaseline.providerAccountId) {
    return { status: "waiting" };
  }

  const collectedIds: string[] = [];
  let latestApiHistoryId = parsedBaseline.historyId;
  let pageToken: string | undefined;

  for (let page = 0; page < MAX_HISTORY_PAGES_PER_ATTEMPT; page += 1) {
    let result;
    try {
      result = await refreshAndRetry({
        accountId: context.accountId,
        provider: "gmail",
        providerAccountId: parsedBaseline.providerAccountId,
        apiCall: async (accessToken) =>
          usersHistoryList({
            accessToken,
            startHistoryId: parsedBaseline.historyId,
            pageToken,
          }),
      });
    } catch (err) {
      if (err instanceof HistoryListStaleCursorError) {
        // A cursor minted minutes ago going stale is rare (mailbox migration). The waiting
        // contract cannot persist a re-snapshot, so log and keep waiting — the session's own
        // TTL bounds the worst case as an honest timeout, never a wrong capture.
        console.warn(
          JSON.stringify({
            event: "gmail.live_capture.stale_baseline",
            sessionId: context.sessionId,
            workflowId: context.workflowId,
          }),
        );
        return { status: "waiting" };
      }
      throw err;
    }

    latestApiHistoryId = result.historyId;
    for (const ev of extractMessageEvents(result.history)) {
      collectedIds.push(ev.id);
    }
    if (!result.nextPageToken) break;
    pageToken = result.nextPageToken;
  }

  const uniqueIds = Array.from(new Set(collectedIds));

  // Oldest-first: the FIRST matching arrival after the baseline is the captured event.
  for (const messageId of uniqueIds.slice(0, MAX_HYDRATIONS_PER_ATTEMPT)) {
    let message;
    try {
      message = await refreshAndRetry({
        accountId: context.accountId,
        provider: "gmail",
        providerAccountId: parsedBaseline.providerAccountId,
        apiCall: async (accessToken) => usersMessagesGet({ accessToken, messageId }),
      });
    } catch (err) {
      // One unreadable message (deleted mid-walk, transient 5xx) never aborts the attempt.
      console.warn(
        JSON.stringify({
          event: "gmail.live_capture.message_failed",
          sessionId: context.sessionId,
          messageId,
          error: (err as Error).message,
        }),
      );
      continue;
    }
    if (!matchesFilters(message, config)) continue;

    const payload = buildTriggerEvent({
      emailAddress: parsedBaseline.providerAccountId,
      message,
    });
    return {
      status: "captured",
      payload,
      // Sender / subject / received time only — the owner-visible confirmation line. The raw
      // payload (snippet, ids, full headers) stays server-side on the session row.
      preview: {
        from: (payload.payload.from as string) || null,
        subject: (payload.payload.subject as string) || null,
        receivedAt: (payload.payload.receivedAt as string) || null,
      },
      baseline: {
        ...parsedBaseline,
        historyId: latestApiHistoryId,
      },
    };
  }

  return { status: "waiting" };
}

export const gmailNewEmailLiveCaptureAdapter: LiveTriggerCaptureAdapter = {
  providerId: "gmail",
  eventType: "new_email",
  establishBaseline,
  captureNext,
};
