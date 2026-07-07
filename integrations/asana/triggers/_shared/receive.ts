import type { TriggerEvent } from "@/contracts/triggerEvent";
import { InvalidSignatureError } from "@/core/triggers/errors";
import { decryptToken, encryptToken } from "@/core/encryption/tokens";
import * as triggerResourcesRepo from "@/repositories/triggerResources";
import type { TriggerResourceRecord } from "@/repositories/triggerResources";
import { getActiveForExecution } from "@/repositories/integrations";
import {
  IntegrationActionRequiredError,
  refreshAndRetry,
} from "@/services/oauth/refreshAndRetry";
import { NotFoundError } from "@/integrations/_shared/asana/errors";
import { verifyAsanaSignature } from "@/integrations/_shared/asana/webhooks/signature";
import { tasksGet } from "@/integrations/_shared/asana/api/tasks";
import { storiesGet } from "@/integrations/_shared/asana/api/stories";
import {
  ASANA_TRIGGER_TYPES,
  eventMatchesTriggerType,
  type AsanaEventObject,
  type AsanaTriggerType,
} from "./eventMap";
import { normalizeNewTaskInProject } from "../newTaskInProject/normalize";
import { normalizeTaskUpdatedInProject } from "../taskUpdatedInProject/normalize";
import { normalizeTaskCompleted } from "../taskCompleted/normalize";
import { normalizeTaskAssigned } from "../taskAssigned/normalize";
import { normalizeCommentAddedToTask } from "../commentAddedToTask/normalize";

/**
 * Shared receive helper for Asana project webhooks — Slice 5.ASANA-1 +
 * ASANA-2.
 *
 * Single route at `/api/webhooks/asana` handles all 5 V2 Asana trigger
 * types. Strict-direct-lookup: the URL carries `?workflowId=X&nodeId=Y`
 * (set at activation) so the trigger row resolves without parsing the
 * body first.
 *
 * TWO inbound shapes:
 *
 * **1. X-Hook-Secret handshake** (webhook creation, mid-activation).
 *    Asana POSTs with an `X-Hook-Secret` header; the response must echo
 *    the header with 200/204 for `POST /webhooks` to succeed. V2 accepts
 *    the handshake ONLY when the resolved row is in the activation
 *    window (`handshakePending: true`, no stored secret): the secret is
 *    encrypted (`encryptToken`) into `config.hookSecretEncrypted`. Any
 *    other handshake-shaped request is REJECTED without an echo —
 *    an unauthenticated caller can never rotate an armed row's secret
 *    (fail closed; the rejected echo fails the provider-side creation).
 *
 * **2. Event delivery.** `X-Hook-Signature` = HMAC-SHA256 hex over the
 *    raw body, keyed with THAT webhook's secret (per-webhook, unlike
 *    Monday's app-level env secret — so verification happens AFTER row
 *    resolution, and there is no missing-env 503 mode):
 *      1. Resolve row via query params. Missing/foreign → 200 quiet ack.
 *      2. Row without a stored secret (aborted activation) →
 *         `unverifiable` quiet ack — never dispatch what we can't verify.
 *      3. Verify signature over the RAW bytes (route captures them
 *         before any parse). Fail → InvalidSignatureError (route 401).
 *      4. Heartbeat (`events: []`, sent ~8h) → ack — Asana deletes
 *         webhooks whose heartbeats fail for 24h.
 *      5. Match each event against THE ROW's trigger type
 *         (`eventMatchesTriggerType` — ASANA-2: the three task+changed
 *         signatures overlap, so classification is per-row, not global);
 *         drop non-matching events (a filtered webhook should only
 *         deliver its own signature, but defense-in-depth mirrors
 *         Monday).
 *      6. ASANA-2 enrichment: `task_completed` / `task_assigned`
 *         post-fetch the task (compact events carry no field values) and
 *         gate on the authoritative state (completed===true / has an
 *         assignee); `comment_added_to_task` post-fetches the story
 *         detail (scope stories:read) for text + author. Post-fetch 404
 *         → drop quietly (resource gone between event and fetch); dead
 *         credential → drop with a warn (can't verify state); other
 *         errors propagate so the route 5xxes and Asana redelivers.
 *      7. Normalize → TriggerEvent[]. `projectGid` comes from the ROW's
 *         configured project (the webhook is project-scoped, so the row
 *         is the authoritative attribution; compact events don't
 *         reliably carry the project).
 */

export type ReceiveResult =
  | { kind: "handshake"; secret: string }
  | { kind: "handshake_rejected"; reason: string }
  | { kind: "unknown_workflow" }
  | { kind: "unverifiable" }
  | { kind: "heartbeat" }
  | { kind: "events"; events: TriggerEvent[] };

const HOOK_SECRET_HEADER = "x-hook-secret";
const HOOK_SIGNATURE_HEADER = "x-hook-signature";

interface QueryDescriptor {
  workflowId: string;
  nodeId: string;
}

function parseQuery(url: string): QueryDescriptor | null {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return null;
  }
  const workflowId = parsed.searchParams.get("workflowId");
  const nodeId = parsed.searchParams.get("nodeId");
  if (!workflowId || !nodeId) return null;
  return { workflowId, nodeId };
}

function isAsanaTriggerType(value: string): value is AsanaTriggerType {
  return (ASANA_TRIGGER_TYPES as readonly string[]).includes(value);
}

export interface ReceiveAsanaWebhookInput {
  request: Request;
  /** Raw body — the receive ROUTE captures this BEFORE any parse. */
  rawBody: string;
}

export async function receiveAsanaWebhook(
  input: ReceiveAsanaWebhookInput,
): Promise<ReceiveResult> {
  const { request, rawBody } = input;

  const query = parseQuery(request.url);

  // ── 1. Handshake path ──────────────────────────────────────────────────
  const hookSecret = request.headers.get(HOOK_SECRET_HEADER);
  if (hookSecret !== null) {
    if (hookSecret.length === 0 || hookSecret.length > 256) {
      return { kind: "handshake_rejected", reason: "malformed_secret" };
    }
    if (!query) {
      return { kind: "handshake_rejected", reason: "missing_query" };
    }
    const row = await triggerResourcesRepo.findByWorkflowAndNode(
      query.workflowId,
      query.nodeId,
    );
    if (!row || row.provider !== "asana") {
      return { kind: "handshake_rejected", reason: "unknown_trigger" };
    }
    const config = row.config as {
      handshakePending?: unknown;
      hookSecretEncrypted?: unknown;
    };
    if (
      config.handshakePending !== true ||
      typeof config.hookSecretEncrypted === "string"
    ) {
      // Not in the activation window — an armed (or never-activated) row.
      // Refusing the echo fails the provider-side creation, so a spoofed
      // handshake can neither rotate the secret nor complete a webhook.
      return { kind: "handshake_rejected", reason: "not_pending" };
    }
    await triggerResourcesRepo.updateConfig(row.id, {
      ...row.config,
      hookSecretEncrypted: encryptToken(hookSecret),
    });
    return { kind: "handshake", secret: hookSecret };
  }

  // ── 2. Event-delivery path ─────────────────────────────────────────────
  if (!query) return { kind: "unknown_workflow" };

  const row = await triggerResourcesRepo.findByWorkflowAndNode(
    query.workflowId,
    query.nodeId,
  );
  if (!row || row.provider !== "asana") {
    return { kind: "unknown_workflow" };
  }

  const config = row.config as {
    hookSecretEncrypted?: unknown;
    projectId?: unknown;
  };
  if (
    typeof config.hookSecretEncrypted !== "string" ||
    config.hookSecretEncrypted.length === 0
  ) {
    // Aborted activation left a secretless row — nothing deliverable to
    // this row can be verified, so nothing is dispatched.
    return { kind: "unverifiable" };
  }

  const secret = decryptToken(config.hookSecretEncrypted);
  const signatureHeader = request.headers.get(HOOK_SIGNATURE_HEADER);
  const verifyResult = verifyAsanaSignature(rawBody, signatureHeader, secret);
  if (!verifyResult.valid) {
    throw new InvalidSignatureError(
      `Asana webhook: signature verification failed (${verifyResult.reason}).`,
    );
  }

  // Parse AFTER verification — a verified non-JSON body is malformed.
  let parsedBody: Record<string, unknown>;
  try {
    const candidate = JSON.parse(rawBody) as unknown;
    if (!candidate || typeof candidate !== "object" || Array.isArray(candidate)) {
      throw new Error("not an object");
    }
    parsedBody = candidate as Record<string, unknown>;
  } catch {
    throw new InvalidSignatureError(
      "Asana webhook: body is not a JSON object despite a verified signature.",
    );
  }

  const events = Array.isArray(parsedBody.events)
    ? (parsedBody.events as AsanaEventObject[])
    : [];
  if (events.length === 0) {
    // Heartbeat (Asana sends one ~every 8h). MUST be acked — failed
    // heartbeats for 24h get the webhook deleted provider-side.
    return { kind: "heartbeat" };
  }

  if (!isAsanaTriggerType(row.eventType)) {
    // A row with an eventType this deployment doesn't know (skewed
    // deploy) — nothing dispatchable; ack quietly like unknown rows.
    return { kind: "events", events: [] };
  }
  const triggerType = row.eventType;

  const projectId =
    typeof config.projectId === "string" && config.projectId.length > 0
      ? config.projectId
      : null;

  const normalized: TriggerEvent[] = [];
  for (const ev of events) {
    if (!eventMatchesTriggerType(ev, triggerType)) continue;

    switch (triggerType) {
      case "new_task_in_project":
        normalized.push(normalizeNewTaskInProject(ev, { projectId }));
        break;
      case "task_updated_in_project":
        normalized.push(normalizeTaskUpdatedInProject(ev, { projectId }));
        break;
      case "task_completed": {
        const taskGid = ev.resource?.gid;
        if (!taskGid) continue;
        const task = await postFetch(row, (accessToken) =>
          tasksGet({ accessToken, taskGid }),
        );
        // Post-fetch failed (gone / dead credential) or the task is not
        // actually complete — a merely-updated task never dispatches.
        if (!task || task.completed !== true) continue;
        normalized.push(normalizeTaskCompleted(ev, { projectId, task }));
        break;
      }
      case "task_assigned": {
        const taskGid = ev.resource?.gid;
        if (!taskGid) continue;
        const task = await postFetch(row, (accessToken) =>
          tasksGet({ accessToken, taskGid }),
        );
        const assigneeGid = task?.assignee?.gid;
        // Unassignment (or a raced unassign before the fetch) → no fire.
        if (!task || !assigneeGid) continue;
        normalized.push(
          normalizeTaskAssigned(ev, { projectId, task, assigneeGid }),
        );
        break;
      }
      case "comment_added_to_task": {
        const storyGid = ev.resource?.gid;
        if (!storyGid) continue;
        const story = await postFetch(row, (accessToken) =>
          storiesGet({ accessToken, storyGid }),
        );
        // Defense-in-depth: only dispatch confirmed comment stories.
        if (!story || story.resource_subtype !== "comment_added") continue;
        normalized.push(normalizeCommentAddedToTask(ev, { projectId, story }));
        break;
      }
    }
  }

  return { kind: "events", events: normalized };
}

/**
 * ASANA-2 post-fetch: run one bounded provider read with the receiving
 * row's integration credentials. Returns null when the event should be
 * DROPPED quietly (no integration, resource gone, dead credential);
 * rethrows anything else so the route 5xxes and Asana redelivers.
 *
 * Wrapped in `refreshAndRetry` — Asana access tokens expire hourly, so
 * receive-time reads must tolerate a stale stored token (same posture as
 * activation/deactivation and the Outlook receive-time fetch).
 */
async function postFetch<T>(
  row: TriggerResourceRecord,
  apiCall: (accessToken: string) => Promise<T>,
): Promise<T | null> {
  if (!row.workflowAccountId) {
    console.warn(
      JSON.stringify({
        event: "webhook.asana.post_fetch_no_account",
        eventType: row.eventType,
      }),
    );
    return null;
  }
  const integration = await getActiveForExecution(
    row.workflowAccountId,
    "asana",
    row.providerAccountId ?? null,
  );
  if (!integration) {
    console.warn(
      JSON.stringify({
        event: "webhook.asana.post_fetch_no_integration",
        eventType: row.eventType,
      }),
    );
    return null;
  }
  try {
    return await refreshAndRetry({
      accountId: integration.accountId,
      provider: "asana",
      providerAccountId: integration.providerAccountId,
      apiCall,
    });
  } catch (err) {
    if (err instanceof NotFoundError) {
      // Resource deleted between the event and the fetch — nothing to
      // verify, nothing to dispatch.
      return null;
    }
    if (err instanceof IntegrationActionRequiredError) {
      // Credential is dead even after a refresh attempt. We can't read
      // the authoritative state, so we don't dispatch — same "never
      // dispatch what we can't verify" posture as the unverifiable row.
      console.warn(
        JSON.stringify({
          event: "webhook.asana.post_fetch_credential_dead",
          eventType: row.eventType,
        }),
      );
      return null;
    }
    throw err;
  }
}
