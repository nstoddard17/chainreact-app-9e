/**
 * Trigger-smoke harness — Trello WEBHOOK trigger dispatch path (Lane C, direct-seed).
 *
 * Second DIRECT-SEEDED HMAC webhook smoke (after github:new_commit). Certifies the
 * real RECEIPT/DISPATCH path for `trello:new_card` (eventType `new_card`) with a
 * fully synthetic, HMAC-signed Trello board webhook.
 *
 * DIRECT-SEED CONTRACT (honest scope — same boundary as the GitHub smoke):
 *   Trello's real `registerWorkflowTriggers` runs an activation hook that calls the
 *   Trello API (`POST /1/webhooks`) to CREATE a board webhook (needs a connected
 *   integration + a real board). That is out of scope and unsafe for a smoke. So
 *   this harness DIRECT-SEEDS the minimum `trigger_resources` row the receive route
 *   + dispatcher look up — provider `trello`, eventType `new_card`, keyed by
 *   workflowId+nodeId, with config `{ callbackURL, eventType, boardId }` (the
 *   receive route reads `config.callbackURL` to verify the HMAC and `config.eventType`
 *   to filter) — WITHOUT running the activation hook and WITHOUT any Trello API call.
 *   Cleanup deletes that row directly (no deactivation hook → no Trello API).
 *
 *   THIS CERTIFIES: receive → HMAC verify (over rawBody + the seeded callbackURL) →
 *   classify → event-type filter → normalize → dispatchTriggerEvent → dedup →
 *   durable enqueue → drain → terminal run. THIS DOES NOT CERTIFY Trello
 *   provider-side subscription activation (webhook create/delete via the Trello API).
 *
 * Trello callbackURL caveat (the load-bearing detail): Trello's HMAC is computed over
 *   `${rawBody}${callbackURL}`, and the receive route verifies against the EXACT
 *   `config.callbackURL` stored on the trigger row. The harness controls BOTH — it
 *   seeds a known callbackURL into the row config AND signs with that same string —
 *   so verification passes WITHOUT a real Trello-registered URL and WITHOUT weakening
 *   production verification (the route's verifier is unchanged; only the payload +
 *   the seeded callbackURL are synthetic).
 *
 * WHY trello:new_card:
 *   - non-commerce, HMAC-signed (`X-Trello-Webhook` base64 HMAC-SHA1, keyed with the
 *     global `TRELLO_CLIENT_SECRET`),
 *   - the board webhook payload is self-contained (normalize does NO provider fetch),
 *     and fully smoke-minted (synthetic board / card / list ids + a smoke card name),
 *   - lifecycle "card created" event (the Trello analog of github:new_commit /
 *     slack:channel_created) — no comment text, no member data, no raw bytes,
 *   - deterministic Trello `action.id` → dedup is provable.
 *   (comment_added carries comment text + member_changed carries member identity →
 *    both stay Lane-D excluded; card_moved / card_archived / card_updated are
 *    same-route follow-ons with a different updateCard body shape.)
 *
 * Every DB / route / dispatch touchpoint is behind injected `TrelloWebhookSmokeDeps`
 * so this orchestrator is fully unit-testable with fakes; real wiring lives in
 * trelloWebhookSmokeDeps.ts and only runs in the gated dev integration test.
 */
import {
  WorkflowDefinitionSchema,
  type WorkflowDefinition,
} from "@/contracts/workflowDefinition";

export const TRELLO_WEBHOOK_SMOKE_TRIGGER_NODE_ID = "smoke-trello-webhook-trigger";
export const TRELLO_WEBHOOK_SMOKE_ACTION_NODE_ID = "smoke-noop-action";

/** Canonical dispatch event type for trello:new_card (the V2 short form). */
export const TRELLO_NEW_CARD_EVENT_TYPE = "new_card";

export interface TrelloWebhookSmokeWorkflow {
  readonly definition: WorkflowDefinition;
  readonly triggerNodeId: string;
  readonly actionNodeId: string;
  readonly name: string;
}

/** Build the smoke workflow: trello:new_card webhook trigger → native no-op. */
export function buildTrelloNewCardSmokeWorkflow(
  boardId: string,
): TrelloWebhookSmokeWorkflow {
  const definition = WorkflowDefinitionSchema.parse({
    nodes: [
      {
        id: TRELLO_WEBHOOK_SMOKE_TRIGGER_NODE_ID,
        kind: "trigger",
        provider: "trello",
        type: TRELLO_NEW_CARD_EVENT_TYPE,
        // `boardId` is a REQUIRED builder field — a synthetic value satisfies the
        // pre-execution readiness gate (MISSING_REQUIRED_FIELDS). It is NOT a real
        // board. (The receive route's board check reads the SEEDED row config, not
        // this node config; we keep them equal for consistency.)
        config: { boardId },
        position: { x: 0, y: 0 },
      },
      {
        id: TRELLO_WEBHOOK_SMOKE_ACTION_NODE_ID,
        kind: "action",
        provider: "native",
        // Unary is_falsy on a truthy literal with onFalse:"skip" → evaluates false →
        // engine takes the NULL branch → terminal 'succeeded', zero external effect.
        type: "if_then_condition",
        config: { input: "smoke", operator: "is_falsy", onFalse: "skip" },
        position: { x: 0, y: 160 },
      },
    ],
    edges: [
      {
        id: "smoke-trello-webhook-edge",
        from: TRELLO_WEBHOOK_SMOKE_TRIGGER_NODE_ID,
        to: TRELLO_WEBHOOK_SMOKE_ACTION_NODE_ID,
      },
    ],
  });
  return {
    definition,
    triggerNodeId: TRELLO_WEBHOOK_SMOKE_TRIGGER_NODE_ID,
    actionNodeId: TRELLO_WEBHOOK_SMOKE_ACTION_NODE_ID,
    name: "trigger-smoke:trello:new_card",
  };
}

/** Synthetic Trello card-created identity — fully smoke-minted, no real board/card. */
export interface TrelloWebhookSmokeIdentity {
  /** Trello `action.id` — deterministic dedup key + TriggerEvent.eventId. */
  readonly actionId: string;
  /** Synthetic board id (also the providerAccountId). */
  readonly boardId: string;
  /** Synthetic card id — carries the run marker. */
  readonly cardId: string;
  /** Synthetic card name — smoke marker, no real content. */
  readonly cardName: string;
  /** Synthetic list id. */
  readonly listId: string;
}

export interface TrelloWebhookSmokeRun {
  readonly runId: string;
  readonly status: "succeeded" | "failed" | "running" | "queued" | null;
  /** The run's persisted trigger event payload (normalized Trello action). */
  readonly triggerPayload: Readonly<Record<string, unknown>> | null;
  /** The run's persisted TriggerEvent.eventId (= Trello action id). */
  readonly eventId: string | null;
  /** The run's persisted TriggerEvent.eventType. */
  readonly eventType: string | null;
}

/** Does the fired run's persisted trigger event identify the synthetic card-created? */
function identityMatches(
  run: TrelloWebhookSmokeRun,
  identity: TrelloWebhookSmokeIdentity,
): boolean {
  if (run.eventId !== identity.actionId) return false;
  if (run.eventType !== TRELLO_NEW_CARD_EVENT_TYPE) return false;
  const payload = run.triggerPayload;
  if (!payload) return false;
  if (payload.actionType !== "createCard") return false;
  return payload.cardId === identity.cardId && payload.boardId === identity.boardId;
}

export interface TrelloWebhookSmokeDeps {
  /** Mint a fresh, unique synthetic identity (unique action id per run for dedup). */
  mintIdentity(): TrelloWebhookSmokeIdentity;
  createActiveSmokeWorkflow(
    workflow: TrelloWebhookSmokeWorkflow,
  ): Promise<{ workflowId: string }>;
  /**
   * DIRECT-SEED the minimum trigger_resources row (provider `trello`, eventType
   * `new_card`, keyed by workflowId+nodeId, config `{ callbackURL, eventType,
   * boardId }`). Does NOT run the activation hook → NO Trello API call, NO real
   * webhook created. Returns the stored event_type so the smoke proves it equals
   * the dispatch key.
   */
  seedTriggerResource(input: {
    workflowId: string;
    triggerNodeId: string;
    boardId: string;
  }): Promise<{ seededEventType: string | null }>;
  /**
   * Build a synthetic `createCard` board-webhook body, sign it with the REAL
   * `TRELLO_CLIENT_SECRET` (`X-Trello-Webhook` = base64 HMAC-SHA1 over
   * `rawBody + callbackURL`, using the SAME callbackURL seeded on the row), and POST
   * it through the REAL `POST /api/webhooks/trello?workflowId=&nodeId=` route.
   * Returns the route's HTTP status.
   */
  deliverSyntheticEvent(input: {
    identity: TrelloWebhookSmokeIdentity;
    workflowId: string;
    triggerNodeId: string;
  }): Promise<{ httpStatus: number }>;
  listRuns(workflowId: string): Promise<readonly TrelloWebhookSmokeRun[]>;
  drainRun(runId: string): Promise<void>;
  readRun(runId: string): Promise<TrelloWebhookSmokeRun | null>;
  /** Soft-delete the smoke workflow + DELETE the seeded trigger_resources row
   * directly (no deactivation hook → no Trello API). */
  cleanupWorkflow(workflowId: string): Promise<void>;
  /** Delete the synthetic dedup row (provider=trello, event_id) — hygiene. */
  cleanupDedup(eventId: string): Promise<void>;
  sleep(ms: number): Promise<void>;
}

export interface TrelloWebhookSmokeOptions {
  readonly afterDeliverAttempts?: number;
  readonly afterDeliverSleepMs?: number;
  readonly dedupSettleMs?: number;
}

export interface TrelloWebhookSmokeResult {
  readonly outcome: "pass" | "fail" | "skip";
  readonly reason: string | null;
  readonly triggerLabel: string;
  readonly seededEventType: string | null;
  readonly baselineRunCount: number;
  readonly deliverHttpStatus: number | null;
  readonly afterRunCount: number;
  readonly identityMatched: boolean;
  readonly terminalStatus: TrelloWebhookSmokeRun["status"] | null;
  readonly afterRedeliverRunCount: number | null;
  readonly dedupProven: boolean;
  readonly eventId: string | null;
  readonly workflowId: string | null;
  readonly cleaned: boolean;
}

const LABEL = "trello:new_card";

export async function runTrelloWebhookSmoke(
  deps: TrelloWebhookSmokeDeps,
  opts: TrelloWebhookSmokeOptions = {},
): Promise<TrelloWebhookSmokeResult> {
  const ref: { workflowId: string | null; eventId: string | null } = {
    workflowId: null,
    eventId: null,
  };
  let result: TrelloWebhookSmokeResult;
  try {
    result = await runCore(deps, opts, ref);
  } catch (err) {
    result = base(ref, { outcome: "fail", reason: (err as Error).message });
  } finally {
    // Cleanup ALWAYS runs and is NOT masked. No provider-side resource exists (no
    // real Trello webhook was created) — only smoke-owned DB rows (workflow,
    // direct-seeded trigger_resources, runs, dedup row).
    let cleaned = true;
    if (ref.workflowId) {
      cleaned =
        (await deps.cleanupWorkflow(ref.workflowId).then(() => true).catch(() => false)) &&
        cleaned;
    }
    if (ref.eventId) {
      cleaned =
        (await deps.cleanupDedup(ref.eventId).then(() => true).catch(() => false)) &&
        cleaned;
    }
    result = { ...result!, cleaned };
  }
  return result!;
}

function base(
  ref: { workflowId: string | null; eventId: string | null },
  over: Partial<TrelloWebhookSmokeResult> & { outcome: TrelloWebhookSmokeResult["outcome"] },
): TrelloWebhookSmokeResult {
  return {
    reason: null,
    triggerLabel: LABEL,
    seededEventType: null,
    baselineRunCount: 0,
    deliverHttpStatus: null,
    afterRunCount: 0,
    identityMatched: false,
    terminalStatus: null,
    afterRedeliverRunCount: null,
    dedupProven: false,
    eventId: ref.eventId,
    workflowId: ref.workflowId,
    cleaned: false,
    ...over,
  };
}

async function runCore(
  deps: TrelloWebhookSmokeDeps,
  opts: TrelloWebhookSmokeOptions,
  ref: { workflowId: string | null; eventId: string | null },
): Promise<TrelloWebhookSmokeResult> {
  const identity = deps.mintIdentity();
  ref.eventId = identity.actionId;

  // 1. Active smoke workflow watching trello:new_card.
  const workflow = buildTrelloNewCardSmokeWorkflow(identity.boardId);
  const { workflowId } = await deps.createActiveSmokeWorkflow(workflow);
  ref.workflowId = workflowId;

  // 2. DIRECT-SEED the trigger_resources row (no activation hook, no Trello API).
  const { seededEventType } = await deps.seedTriggerResource({
    workflowId,
    triggerNodeId: workflow.triggerNodeId,
    boardId: identity.boardId,
  });
  if (seededEventType !== TRELLO_NEW_CARD_EVENT_TYPE) {
    return base(ref, {
      outcome: "fail",
      reason: `seeded trigger_resources event_type '${seededEventType ?? "null"}', expected '${TRELLO_NEW_CARD_EVENT_TYPE}'`,
      seededEventType,
    });
  }

  // 3. BASELINE — no event delivered yet ⇒ no runs.
  const baselineRuns = await deps.listRuns(workflowId);
  if (baselineRuns.length !== 0) {
    return base(ref, {
      outcome: "fail",
      reason: `baseline violation: ${baselineRuns.length} run(s) before any event delivery`,
      seededEventType,
      baselineRunCount: baselineRuns.length,
    });
  }

  // 4. Deliver the synthetic signed createCard webhook through the REAL route.
  const { httpStatus } = await deps.deliverSyntheticEvent({
    identity,
    workflowId,
    triggerNodeId: workflow.triggerNodeId,
  });
  if (httpStatus !== 200) {
    return base(ref, {
      outcome: "fail",
      reason: `webhook route returned HTTP ${httpStatus}, expected 200`,
      seededEventType,
      deliverHttpStatus: httpStatus,
    });
  }

  // 5. Exactly one run, bounded re-list for DB read settle.
  const attempts = Math.max(1, opts.afterDeliverAttempts ?? 5);
  const sleepMs = Math.max(0, opts.afterDeliverSleepMs ?? 200);
  let afterRuns: readonly TrelloWebhookSmokeRun[] = [];
  for (let i = 0; i < attempts; i += 1) {
    afterRuns = await deps.listRuns(workflowId);
    if (afterRuns.length >= 1) break;
    if (i < attempts - 1 && sleepMs > 0) await deps.sleep(sleepMs);
  }
  if (afterRuns.length !== 1) {
    return base(ref, {
      outcome: "fail",
      reason: `expected exactly 1 run after delivery, got ${afterRuns.length}`,
      seededEventType,
      deliverHttpStatus: httpStatus,
      afterRunCount: afterRuns.length,
    });
  }

  // 6. The fired run must identify the synthetic card-created (actionId + card + board).
  const fired = afterRuns[0]!;
  if (!identityMatches(fired, identity)) {
    return base(ref, {
      outcome: "fail",
      reason: `fired run did not identify the synthetic card-created (eventId=${fired.eventId ?? "null"}, eventType=${fired.eventType ?? "null"})`,
      seededEventType,
      deliverHttpStatus: httpStatus,
      afterRunCount: 1,
    });
  }

  // 7. Drain → terminal 'succeeded'.
  await deps.drainRun(fired.runId);
  const terminal = await deps.readRun(fired.runId);
  const terminalStatus = terminal?.status ?? null;
  if (terminalStatus !== "succeeded") {
    return base(ref, {
      outcome: "fail",
      reason: `fired run did not reach terminal 'succeeded' (got ${terminalStatus ?? "null"})`,
      seededEventType,
      deliverHttpStatus: httpStatus,
      afterRunCount: 1,
      identityMatched: true,
      terminalStatus,
    });
  }

  // 8. DEDUP — re-send the SAME action id; dispatcher must drop it (stays 1 run).
  const redeliver = await deps.deliverSyntheticEvent({
    identity,
    workflowId,
    triggerNodeId: workflow.triggerNodeId,
  });
  if (redeliver.httpStatus !== 200) {
    return base(ref, {
      outcome: "fail",
      reason: `redeliver returned HTTP ${redeliver.httpStatus}, expected 200`,
      seededEventType,
      deliverHttpStatus: httpStatus,
      afterRunCount: 1,
      identityMatched: true,
      terminalStatus,
    });
  }
  const settleMs = Math.max(0, opts.dedupSettleMs ?? 500);
  if (settleMs > 0) await deps.sleep(settleMs);
  const afterRedeliver = await deps.listRuns(workflowId);
  const dedupProven = afterRedeliver.length === 1;
  if (!dedupProven) {
    return base(ref, {
      outcome: "fail",
      reason: `dedup failed: ${afterRedeliver.length} run(s) after re-sending the same action id (expected 1)`,
      seededEventType,
      deliverHttpStatus: httpStatus,
      afterRunCount: 1,
      identityMatched: true,
      terminalStatus,
      afterRedeliverRunCount: afterRedeliver.length,
    });
  }

  return base(ref, {
    outcome: "pass",
    seededEventType,
    deliverHttpStatus: httpStatus,
    afterRunCount: 1,
    identityMatched: true,
    terminalStatus: "succeeded",
    afterRedeliverRunCount: afterRedeliver.length,
    dedupProven: true,
  });
}
