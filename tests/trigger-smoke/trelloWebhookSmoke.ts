/**
 * Trigger-smoke harness — Trello WEBHOOK trigger dispatch path (Lane C, direct-seed).
 *
 * Spec-driven DIRECT-SEEDED HMAC webhook smoke for the safe Trello lifecycle triggers:
 *
 *   trello:new_card       (eventType `new_card`,      action createCard)
 *   trello:card_moved     (eventType `card_moved`,    action updateCard + listBefore!=listAfter)
 *   trello:card_archived  (eventType `card_archived`, action updateCard + data.old.closed)
 *   trello:card_updated   (eventType `card_updated`,  action updateCard + generic data.old change)
 *
 * EXCLUDED (Lane D, NOT certified): `comment_added` (carries user comment text) and
 * `member_changed` (carries member identity) — fabricating those synthetically is not
 * product-safe.
 *
 * DIRECT-SEED CONTRACT (honest scope — same boundary as the GitHub smoke):
 *   Trello's real `registerWorkflowTriggers` runs an activation hook that calls the
 *   Trello API (`POST /1/webhooks`) to CREATE a board webhook (needs a connected
 *   integration + a real board). That is out of scope and unsafe for a smoke. So this
 *   harness DIRECT-SEEDS the minimum `trigger_resources` row the receive route +
 *   dispatcher look up — provider `trello`, eventType `<spec>`, keyed by
 *   workflowId+nodeId, config `{ callbackURL, eventType, boardId }` — WITHOUT running
 *   the activation hook and WITHOUT any Trello API call. Cleanup deletes that row
 *   directly (no deactivation hook → no Trello API).
 *
 *   THIS CERTIFIES: receive → HMAC verify (over rawBody + the seeded callbackURL) →
 *   classify → event-type filter → normalize → dispatchTriggerEvent → dedup →
 *   durable enqueue → drain → terminal run. THIS DOES NOT CERTIFY Trello
 *   provider-side subscription activation (webhook create/delete via the Trello API).
 *
 * Trello callbackURL caveat: Trello's HMAC is over `${rawBody}${callbackURL}`, and the
 * receive route verifies against the EXACT `config.callbackURL` stored on the row. The
 * harness controls BOTH — it seeds a known callbackURL into the row config AND signs
 * with that same string — so verification passes WITHOUT a real Trello-registered URL
 * and WITHOUT weakening production verification.
 *
 * Single pattern: `runTrelloWebhookSmoke(deps, spec, opts)` runs the shared flow; a
 * `TrelloWebhookTriggerSpec` plugs in the eventType, the workflow builder, the
 * synthetic Trello action shape, and the identity matcher. The deps own the envelope
 * (`{ action, model }`) + signing + real-route POST (shared); each spec owns the
 * action shape (per trigger). All values are smoke-minted (no real board/card/user,
 * no comment text, no member identity, no raw bytes, no provider fetch).
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

export interface TrelloWebhookSmokeWorkflow {
  readonly definition: WorkflowDefinition;
  readonly triggerNodeId: string;
  readonly actionNodeId: string;
  readonly name: string;
}

/** Build a smoke workflow: one Trello webhook trigger (V2 short type) → native no-op. */
export function buildTrelloSmokeWorkflow(
  eventType: string,
  label: string,
  boardId: string,
): TrelloWebhookSmokeWorkflow {
  const definition = WorkflowDefinitionSchema.parse({
    nodes: [
      {
        id: TRELLO_WEBHOOK_SMOKE_TRIGGER_NODE_ID,
        kind: "trigger",
        provider: "trello",
        type: eventType,
        // `boardId` is a REQUIRED builder field on every Trello card trigger — a
        // synthetic value satisfies the pre-execution readiness gate
        // (MISSING_REQUIRED_FIELDS). It is NOT a real board. (The receive route's
        // board check reads the SEEDED row config, not this node config; we keep
        // them equal for consistency.)
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
    name: `trigger-smoke:${label}`,
  };
}

/** Synthetic Trello identity — fully smoke-minted, no real board/card/user data. */
export interface TrelloWebhookSmokeIdentity {
  /** Trello `action.id` — deterministic dedup key + TriggerEvent.eventId. */
  readonly actionId: string;
  /** Synthetic board id (also the providerAccountId). */
  readonly boardId: string;
  /** Synthetic card id — carries the run marker. */
  readonly cardId: string;
  /** Synthetic card name — smoke marker, no real content. */
  readonly cardName: string;
  /** Synthetic list id (current list; new_card / archived / updated). */
  readonly listId: string;
  /** Synthetic source list id (card_moved). */
  readonly listFromId: string;
  /** Synthetic destination list id (card_moved). */
  readonly listToId: string;
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

/**
 * Per-trigger plug-in: V2 eventType + workflow builder + synthetic Trello action
 * shape + identity matcher. Pure — no I/O. The deps wrap the action in the
 * `{ action, model }` envelope, sign it, and POST it through the real route.
 */
export interface TrelloWebhookTriggerSpec {
  readonly label: string;
  readonly eventType: string;
  readonly classifiedType: string;
  buildWorkflow(boardId: string): TrelloWebhookSmokeWorkflow;
  /** The Trello `action` object for this trigger (smoke-minted; drives classify). */
  buildSyntheticAction(identity: TrelloWebhookSmokeIdentity): Record<string, unknown>;
  identityMatches(run: TrelloWebhookSmokeRun, identity: TrelloWebhookSmokeIdentity): boolean;
}

const SYNTHETIC_DATE = "2026-06-29T00:00:00.000Z";

function memberCreator(): Record<string, unknown> {
  // Synthetic actor — not a real Trello user; no PII.
  return { id: "crsmoke-member", username: "crsmoke", fullName: "CR Smoke" };
}

/** Common identity floor: action id + canonical eventType + card/board + classified. */
function baseMatch(
  run: TrelloWebhookSmokeRun,
  identity: TrelloWebhookSmokeIdentity,
  spec: { eventType: string; classifiedType: string; actionType: string },
): boolean {
  if (run.eventId !== identity.actionId) return false;
  if (run.eventType !== spec.eventType) return false;
  const p = run.triggerPayload;
  if (!p) return false;
  return (
    p.actionType === spec.actionType &&
    p.classifiedType === spec.classifiedType &&
    p.cardId === identity.cardId &&
    p.boardId === identity.boardId
  );
}

export const NEW_CARD_SPEC: TrelloWebhookTriggerSpec = {
  label: "trello:new_card",
  eventType: "new_card",
  classifiedType: "trello.card.created",
  buildWorkflow: (boardId) => buildTrelloSmokeWorkflow("new_card", "trello:new_card", boardId),
  buildSyntheticAction: (id) => ({
    id: id.actionId,
    type: "createCard",
    date: SYNTHETIC_DATE,
    data: {
      card: { id: id.cardId, name: id.cardName, shortLink: "crsmoke0" },
      list: { id: id.listId, name: "crsmoke-list" },
      board: { id: id.boardId, name: "crsmoke-board" },
    },
    memberCreator: memberCreator(),
  }),
  identityMatches: (run, id) =>
    baseMatch(run, id, { eventType: "new_card", classifiedType: "trello.card.created", actionType: "createCard" }),
};

export const CARD_MOVED_SPEC: TrelloWebhookTriggerSpec = {
  label: "trello:card_moved",
  eventType: "card_moved",
  classifiedType: "trello.card.moved",
  buildWorkflow: (boardId) => buildTrelloSmokeWorkflow("card_moved", "trello:card_moved", boardId),
  // updateCard with differing listBefore/listAfter → classifies to trello.card.moved.
  // `data.old` deliberately has NO "closed" key (else the archive-priority branch wins).
  buildSyntheticAction: (id) => ({
    id: id.actionId,
    type: "updateCard",
    date: SYNTHETIC_DATE,
    data: {
      card: { id: id.cardId, name: id.cardName },
      listBefore: { id: id.listFromId, name: "crsmoke-from" },
      listAfter: { id: id.listToId, name: "crsmoke-to" },
      old: { idList: id.listFromId },
      board: { id: id.boardId, name: "crsmoke-board" },
    },
    memberCreator: memberCreator(),
  }),
  identityMatches: (run, id) =>
    baseMatch(run, id, { eventType: "card_moved", classifiedType: "trello.card.moved", actionType: "updateCard" }) &&
    run.triggerPayload?.fromListId === id.listFromId &&
    run.triggerPayload?.toListId === id.listToId,
};

export const CARD_ARCHIVED_SPEC: TrelloWebhookTriggerSpec = {
  label: "trello:card_archived",
  eventType: "card_archived",
  classifiedType: "trello.card.archived",
  buildWorkflow: (boardId) => buildTrelloSmokeWorkflow("card_archived", "trello:card_archived", boardId),
  // updateCard with data.old.closed present → archive-priority branch → archived.
  buildSyntheticAction: (id) => ({
    id: id.actionId,
    type: "updateCard",
    date: SYNTHETIC_DATE,
    data: {
      card: { id: id.cardId, name: id.cardName, closed: true },
      old: { closed: false },
      list: { id: id.listId, name: "crsmoke-list" },
      board: { id: id.boardId, name: "crsmoke-board" },
    },
    memberCreator: memberCreator(),
  }),
  identityMatches: (run, id) =>
    baseMatch(run, id, { eventType: "card_archived", classifiedType: "trello.card.archived", actionType: "updateCard" }) &&
    run.triggerPayload?.closed === true,
};

export const CARD_UPDATED_SPEC: TrelloWebhookTriggerSpec = {
  label: "trello:card_updated",
  eventType: "card_updated",
  classifiedType: "trello.card.updated",
  buildWorkflow: (boardId) => buildTrelloSmokeWorkflow("card_updated", "trello:card_updated", boardId),
  // updateCard with a generic data.old change (a smoke-minted name change) and NO
  // "closed" key and NO list move → classifies to trello.card.updated.
  buildSyntheticAction: (id) => ({
    id: id.actionId,
    type: "updateCard",
    date: SYNTHETIC_DATE,
    data: {
      card: { id: id.cardId, name: id.cardName },
      old: { name: "crsmoke-old-name" },
      list: { id: id.listId, name: "crsmoke-list" },
      board: { id: id.boardId, name: "crsmoke-board" },
    },
    memberCreator: memberCreator(),
  }),
  identityMatches: (run, id) => {
    if (!baseMatch(run, id, { eventType: "card_updated", classifiedType: "trello.card.updated", actionType: "updateCard" })) {
      return false;
    }
    const changed = run.triggerPayload?.changedFields;
    return Array.isArray(changed) && changed.includes("name");
  },
};

export const ALL_TRELLO_WEBHOOK_SPECS: readonly TrelloWebhookTriggerSpec[] = [
  NEW_CARD_SPEC,
  CARD_MOVED_SPEC,
  CARD_ARCHIVED_SPEC,
  CARD_UPDATED_SPEC,
];

export interface TrelloWebhookSmokeDeps {
  /** Mint a fresh, unique synthetic identity (unique action id per run for dedup). */
  mintIdentity(): TrelloWebhookSmokeIdentity;
  createActiveSmokeWorkflow(
    workflow: TrelloWebhookSmokeWorkflow,
  ): Promise<{ workflowId: string }>;
  /**
   * DIRECT-SEED the minimum trigger_resources row (provider `trello`, eventType
   * `<spec>`, keyed by workflowId+nodeId, config `{ callbackURL, eventType, boardId }`).
   * Does NOT run the activation hook → NO Trello API call, NO real webhook. Returns
   * the stored event_type so the smoke proves it equals the dispatch key.
   */
  seedTriggerResource(input: {
    workflowId: string;
    triggerNodeId: string;
    boardId: string;
    eventType: string;
  }): Promise<{ seededEventType: string | null }>;
  /**
   * Wrap the spec's Trello `action` in a `{ action, model }` board-webhook body, sign
   * it with the REAL `TRELLO_CLIENT_SECRET` (`X-Trello-Webhook` base64 HMAC-SHA1 over
   * `rawBody + the seeded callbackURL`), and POST it through the REAL
   * `POST /api/webhooks/trello?workflowId=&nodeId=` route. Returns the HTTP status.
   */
  deliverSyntheticEvent(input: {
    identity: TrelloWebhookSmokeIdentity;
    action: Record<string, unknown>;
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

export async function runTrelloWebhookSmoke(
  deps: TrelloWebhookSmokeDeps,
  spec: TrelloWebhookTriggerSpec,
  opts: TrelloWebhookSmokeOptions = {},
): Promise<TrelloWebhookSmokeResult> {
  const ref: { workflowId: string | null; eventId: string | null } = {
    workflowId: null,
    eventId: null,
  };
  let result: TrelloWebhookSmokeResult;
  try {
    result = await runCore(deps, spec, opts, ref);
  } catch (err) {
    result = base(spec, ref, { outcome: "fail", reason: (err as Error).message });
  } finally {
    // Cleanup ALWAYS runs and is NOT masked. No provider-side resource exists (no
    // real Trello webhook was created) — only smoke-owned DB rows.
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
  spec: TrelloWebhookTriggerSpec,
  ref: { workflowId: string | null; eventId: string | null },
  over: Partial<TrelloWebhookSmokeResult> & { outcome: TrelloWebhookSmokeResult["outcome"] },
): TrelloWebhookSmokeResult {
  return {
    reason: null,
    triggerLabel: spec.label,
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
  spec: TrelloWebhookTriggerSpec,
  opts: TrelloWebhookSmokeOptions,
  ref: { workflowId: string | null; eventId: string | null },
): Promise<TrelloWebhookSmokeResult> {
  const identity = deps.mintIdentity();
  ref.eventId = identity.actionId;

  // 1. Active smoke workflow watching this Trello trigger.
  const workflow = spec.buildWorkflow(identity.boardId);
  const { workflowId } = await deps.createActiveSmokeWorkflow(workflow);
  ref.workflowId = workflowId;

  // 2. DIRECT-SEED the trigger_resources row (no activation hook, no Trello API).
  const { seededEventType } = await deps.seedTriggerResource({
    workflowId,
    triggerNodeId: workflow.triggerNodeId,
    boardId: identity.boardId,
    eventType: spec.eventType,
  });
  if (seededEventType !== spec.eventType) {
    return base(spec, ref, {
      outcome: "fail",
      reason: `seeded trigger_resources event_type '${seededEventType ?? "null"}', expected '${spec.eventType}'`,
      seededEventType,
    });
  }

  // 3. BASELINE — no event delivered yet ⇒ no runs.
  const baselineRuns = await deps.listRuns(workflowId);
  if (baselineRuns.length !== 0) {
    return base(spec, ref, {
      outcome: "fail",
      reason: `baseline violation: ${baselineRuns.length} run(s) before any event delivery`,
      seededEventType,
      baselineRunCount: baselineRuns.length,
    });
  }

  // 4. Deliver the synthetic signed action through the REAL route.
  const action = spec.buildSyntheticAction(identity);
  const { httpStatus } = await deps.deliverSyntheticEvent({
    identity,
    action,
    workflowId,
    triggerNodeId: workflow.triggerNodeId,
  });
  if (httpStatus !== 200) {
    return base(spec, ref, {
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
    return base(spec, ref, {
      outcome: "fail",
      reason: `expected exactly 1 run after delivery, got ${afterRuns.length}`,
      seededEventType,
      deliverHttpStatus: httpStatus,
      afterRunCount: afterRuns.length,
    });
  }

  // 6. The fired run must identify the synthetic action (actionId + card/board + markers).
  const fired = afterRuns[0]!;
  if (!spec.identityMatches(fired, identity)) {
    return base(spec, ref, {
      outcome: "fail",
      reason: `fired run did not identify the synthetic ${spec.label} (eventId=${fired.eventId ?? "null"}, eventType=${fired.eventType ?? "null"})`,
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
    return base(spec, ref, {
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
    action,
    workflowId,
    triggerNodeId: workflow.triggerNodeId,
  });
  if (redeliver.httpStatus !== 200) {
    return base(spec, ref, {
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
    return base(spec, ref, {
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

  return base(spec, ref, {
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
