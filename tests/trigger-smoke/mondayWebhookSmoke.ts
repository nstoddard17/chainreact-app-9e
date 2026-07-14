/**
 * Trigger-smoke harness — Monday WEBHOOK trigger dispatch path (Lane C, direct-seed).
 *
 * Spec-driven DIRECT-SEEDED HMAC webhook smoke for the Monday board triggers:
 *
 *   monday:new_item        (inbound `create_item`,             normalize new_item)
 *   monday:item_moved      (inbound `item_moved_to_any_group`, normalize item_moved)
 *   monday:new_subitem     (inbound `create_subitem`,          normalize new_subitem)
 *   monday:new_update      (inbound `create_update`,           normalize new_update)
 *   monday:column_changed  (inbound `change_column_value`,     normalize column_changed)
 *
 * CONTENT-TRIGGER NOTE (new_update / column_changed). Earlier passes deferred these two
 * as "content-excluded" out of caution (the Monday analogs of Trello comment_added /
 * member_changed). That is REVISED for the direct-seed path: every value in a
 * direct-seed payload is smoke-minted, so an update body / column value is NOT real
 * user content — it is a deterministic `crsmoke-` marker, the same kind of synthesis
 * already used for item/board names. No real Monday delivery, no real user, native
 * no-op action → zero side effect. The smoke verifies the minted marker survives
 * classification + normalization into the run's trigger payload (`body` /
 * `previousValue`+`newValue`). Honest scope is unchanged (below): V2 ingestion, NOT
 * provider subscription delivery.
 *
 * DIRECT-SEED CONTRACT (honest scope — same boundary as the GitHub / Trello smokes):
 *   Monday's real activation hook calls the `create_webhook` GraphQL mutation to
 *   SUBSCRIBE a board (needs a connected integration + a real board). That is out of
 *   scope and unsafe for a smoke. So this harness DIRECT-SEEDS the minimum
 *   `trigger_resources` row the receive route + dispatcher look up — provider
 *   `monday`, eventType `<spec>`, keyed by workflowId+nodeId, config `{ eventType,
 *   boardId }` — WITHOUT running the activation hook and WITHOUT any Monday API call.
 *   Cleanup deletes that row directly (no deactivation hook -> no Monday API).
 *
 *   THIS CERTIFIES: receive -> HMAC verify (x-monday-signature = HMAC-SHA256 hex over
 *   the raw body, keyed with MONDAY_SIGNING_SECRET) -> classify -> event-type filter
 *   -> normalize -> dispatchTriggerEvent -> dedup -> durable enqueue -> drain ->
 *   terminal run. THIS DOES NOT CERTIFY Monday provider-side subscription activation
 *   (create_webhook / delete_webhook via the Monday API).
 *
 * Monday signature caveat: unlike Trello (HMAC over rawBody + callbackURL), Monday
 * signs the raw body ONLY. The harness signs the exact bytes it POSTs, so verification
 * passes without a real Monday-registered webhook and production verification is
 * UNWEAKENED.
 *
 * Single pattern: `runMondayWebhookSmoke(deps, spec, opts)` runs the shared flow; a
 * `MondayWebhookTriggerSpec` plugs in the eventType, the workflow builder, the
 * synthetic Monday `event` object, the deterministic dedup key, and the identity
 * matcher. All values are smoke-minted (no real board/item/user, no update body text,
 * no column values, no raw bytes, no provider fetch).
 *
 * Every DB / route / dispatch touchpoint is behind injected `MondayWebhookSmokeDeps`
 * so this orchestrator is fully unit-testable with fakes; real wiring lives in
 * mondayWebhookSmokeDeps.ts and only runs in the gated dev integration test.
 */
import {
  WorkflowDefinitionSchema,
  type WorkflowDefinition,
} from "@/contracts/workflowDefinition";

export const MONDAY_WEBHOOK_SMOKE_TRIGGER_NODE_ID = "smoke-monday-webhook-trigger";
export const MONDAY_WEBHOOK_SMOKE_ACTION_NODE_ID = "smoke-noop-action";

export interface MondayWebhookSmokeWorkflow {
  readonly definition: WorkflowDefinition;
  readonly triggerNodeId: string;
  readonly actionNodeId: string;
  readonly name: string;
}

/** Build a smoke workflow: one Monday webhook trigger (V2 short type) -> native no-op. */
export function buildMondaySmokeWorkflow(
  eventType: string,
  label: string,
  boardId: string,
): MondayWebhookSmokeWorkflow {
  const definition = WorkflowDefinitionSchema.parse({
    nodes: [
      {
        id: MONDAY_WEBHOOK_SMOKE_TRIGGER_NODE_ID,
        kind: "trigger",
        provider: "monday",
        type: eventType,
        // `boardId` is the one REQUIRED builder field on every Monday board trigger;
        // a synthetic value satisfies the pre-execution readiness gate. It is NOT a
        // real board. (The receive route resolves the trigger row via the query
        // params, not this node config; we keep them equal for consistency.)
        config: { boardId },
        position: { x: 0, y: 0 },
      },
      {
        id: MONDAY_WEBHOOK_SMOKE_ACTION_NODE_ID,
        kind: "action",
        provider: "native",
        // Unary is_falsy on a truthy literal with onFalse:"skip" -> evaluates false ->
        // engine takes the NULL branch -> terminal 'succeeded', zero external effect.
        type: "if_then_condition",
        config: { input: "smoke", operator: "is_falsy", onFalse: "skip" },
        position: { x: 0, y: 160 },
      },
    ],
    edges: [
      {
        id: "smoke-monday-webhook-edge",
        from: MONDAY_WEBHOOK_SMOKE_TRIGGER_NODE_ID,
        to: MONDAY_WEBHOOK_SMOKE_ACTION_NODE_ID,
      },
    ],
  });
  return {
    definition,
    triggerNodeId: MONDAY_WEBHOOK_SMOKE_TRIGGER_NODE_ID,
    actionNodeId: MONDAY_WEBHOOK_SMOKE_ACTION_NODE_ID,
    name: `trigger-smoke:${label}`,
  };
}

/** Synthetic Monday identity — fully smoke-minted, no real board/item/user data. */
export interface MondayWebhookSmokeIdentity {
  /** Synthetic board id (also the normalized providerAccountId). */
  readonly boardId: string;
  /** Synthetic item id (pulseId) — new_item / item_moved. */
  readonly itemId: string;
  /** Synthetic item name — smoke marker, no real content. */
  readonly itemName: string;
  /** Synthetic group id (new_item group / item_moved destination). */
  readonly groupId: string;
  /** Synthetic source group id (item_moved). */
  readonly sourceGroupId: string;
  /** Synthetic subitem id (new_subitem). */
  readonly subitemId: string;
  /** Synthetic subitem name — smoke marker. */
  readonly subitemName: string;
  /** Synthetic parent item id (new_subitem). */
  readonly parentItemId: string;
  /** Deterministic synthetic timestamp — part of every dedup key. */
  readonly createdAt: string;
}

export interface MondayWebhookSmokeRun {
  readonly runId: string;
  readonly status: "succeeded" | "failed" | "running" | "queued" | null;
  /** The run's persisted trigger event payload (normalized Monday event). */
  readonly triggerPayload: Readonly<Record<string, unknown>> | null;
  /** The run's persisted TriggerEvent.eventId (= the deterministic dedup key). */
  readonly eventId: string | null;
  /** The run's persisted TriggerEvent.eventType. */
  readonly eventType: string | null;
}

/**
 * Per-trigger plug-in: V2 eventType + inbound Monday enum + workflow builder +
 * synthetic `event` object + deterministic dedup key + identity matcher. Pure — no
 * I/O. The deps wrap the event in `{ event }`, sign it, and POST it through the real
 * route.
 */
export interface MondayWebhookTriggerSpec {
  readonly label: string;
  /** V2 trigger type (the seeded trigger_resources event_type + dispatch key). */
  readonly eventType: string;
  /** Inbound Monday `event.type` enum that classifies to `eventType`. */
  readonly inboundEventType: string;
  buildWorkflow(boardId: string): MondayWebhookSmokeWorkflow;
  /** The inner Monday `event` object for this trigger (smoke-minted; drives classify). */
  buildSyntheticEvent(identity: MondayWebhookSmokeIdentity): Record<string, unknown>;
  /** The deterministic dedup key the normalizer derives from this synthetic event. */
  expectedEventId(identity: MondayWebhookSmokeIdentity): string;
  identityMatches(run: MondayWebhookSmokeRun, identity: MondayWebhookSmokeIdentity): boolean;
}

/** Common identity floor: dedup key + canonical eventType + changeKind + board/item. */
function baseMatch(
  run: MondayWebhookSmokeRun,
  identity: MondayWebhookSmokeIdentity,
  spec: MondayWebhookTriggerSpec,
  changeKind: string,
): boolean {
  if (run.eventId !== spec.expectedEventId(identity)) return false;
  if (run.eventType !== spec.eventType) return false;
  const p = run.triggerPayload;
  if (!p) return false;
  return p.changeKind === changeKind && p.boardId === identity.boardId;
}

export const NEW_ITEM_SPEC: MondayWebhookTriggerSpec = {
  label: "monday:new_item",
  eventType: "new_item",
  inboundEventType: "create_item",
  buildWorkflow: (boardId) => buildMondaySmokeWorkflow("new_item", "monday:new_item", boardId),
  buildSyntheticEvent: (id) => ({
    type: "create_item",
    boardId: id.boardId,
    pulseId: id.itemId,
    pulseName: id.itemName,
    groupId: id.groupId,
    createdAt: id.createdAt,
    userId: "crsmoke-user",
  }),
  expectedEventId: (id) => `new_item:${id.boardId}:${id.itemId}:${id.createdAt}`,
  identityMatches: (run, id) => {
    if (!baseMatch(run, id, NEW_ITEM_SPEC, "new_item")) return false;
    const p = run.triggerPayload!;
    return p.itemId === id.itemId && p.groupId === id.groupId;
  },
};

export const ITEM_MOVED_SPEC: MondayWebhookTriggerSpec = {
  label: "monday:item_moved",
  eventType: "item_moved",
  inboundEventType: "item_moved_to_any_group",
  buildWorkflow: (boardId) => buildMondaySmokeWorkflow("item_moved", "monday:item_moved", boardId),
  buildSyntheticEvent: (id) => ({
    type: "item_moved_to_any_group",
    boardId: id.boardId,
    pulseId: id.itemId,
    pulseName: id.itemName,
    previousGroupId: id.sourceGroupId,
    groupId: id.groupId,
    movedAt: id.createdAt,
    userId: "crsmoke-user",
  }),
  expectedEventId: (id) => `item_moved:${id.boardId}:${id.itemId}:${id.createdAt}`,
  identityMatches: (run, id) => {
    if (!baseMatch(run, id, ITEM_MOVED_SPEC, "item_moved")) return false;
    const p = run.triggerPayload!;
    return (
      p.itemId === id.itemId &&
      p.previousGroupId === id.sourceGroupId &&
      p.currentGroupId === id.groupId
    );
  },
};

export const NEW_SUBITEM_SPEC: MondayWebhookTriggerSpec = {
  label: "monday:new_subitem",
  eventType: "new_subitem",
  inboundEventType: "create_subitem",
  buildWorkflow: (boardId) => buildMondaySmokeWorkflow("new_subitem", "monday:new_subitem", boardId),
  // create_subitem uses pulseId for the NEW subitem and parentItemId for the parent
  // (the normalizer reads them separately — do NOT set itemId, which conflates them).
  buildSyntheticEvent: (id) => ({
    type: "create_subitem",
    boardId: id.boardId,
    pulseId: id.subitemId,
    pulseName: id.subitemName,
    parentItemId: id.parentItemId,
    createdAt: id.createdAt,
    userId: "crsmoke-user",
  }),
  expectedEventId: (id) => `new_subitem:${id.boardId}:${id.subitemId}:${id.createdAt}`,
  identityMatches: (run, id) => {
    if (!baseMatch(run, id, NEW_SUBITEM_SPEC, "new_subitem")) return false;
    const p = run.triggerPayload!;
    return p.subitemId === id.subitemId && p.parentItemId === id.parentItemId;
  },
};

/** Deterministic synthetic update id (new_update) — stable per identity for dedup. */
function updateIdMarker(id: MondayWebhookSmokeIdentity): string {
  return `crsmoke-update-${id.itemId}`;
}

/** Deterministic synthetic update body marker (new_update) — no real content. */
function updateBodyMarker(id: MondayWebhookSmokeIdentity): string {
  return `crsmoke-body-${id.itemId}`;
}

/** Fixed synthetic column id (column_changed) — part of the dedup key. */
const SMOKE_COLUMN_ID = "crsmoke_col";

/** Deterministic synthetic previous/new column value markers (column_changed). */
function prevValueMarker(id: MondayWebhookSmokeIdentity): string {
  return `crsmoke-prev-${id.itemId}`;
}
function newValueMarker(id: MondayWebhookSmokeIdentity): string {
  return `crsmoke-new-${id.itemId}`;
}

export const NEW_UPDATE_SPEC: MondayWebhookTriggerSpec = {
  label: "monday:new_update",
  eventType: "new_update",
  inboundEventType: "create_update",
  buildWorkflow: (boardId) => buildMondaySmokeWorkflow("new_update", "monday:new_update", boardId),
  // create_update → normalize new_update. `body` carries the user-authored update text;
  // we mint a deterministic `crsmoke-` marker (NOT real content) and assert it survives
  // into payload.body. updateId is a stable synthetic id (drives the dedup key).
  buildSyntheticEvent: (id) => ({
    type: "create_update",
    boardId: id.boardId,
    pulseId: id.itemId,
    updateId: updateIdMarker(id),
    body: updateBodyMarker(id),
    createdAt: id.createdAt,
    userId: "crsmoke-user",
  }),
  expectedEventId: (id) => `new_update:${id.boardId}:${updateIdMarker(id)}`,
  identityMatches: (run, id) => {
    if (!baseMatch(run, id, NEW_UPDATE_SPEC, "new_update")) return false;
    const p = run.triggerPayload!;
    return (
      p.updateId === updateIdMarker(id) &&
      p.itemId === id.itemId &&
      p.body === updateBodyMarker(id)
    );
  },
};

export const COLUMN_CHANGED_SPEC: MondayWebhookTriggerSpec = {
  label: "monday:column_changed",
  eventType: "column_changed",
  inboundEventType: "change_column_value",
  buildWorkflow: (boardId) => buildMondaySmokeWorkflow("column_changed", "monday:column_changed", boardId),
  // change_column_value → normalize column_changed. previousValue/newValue carry the
  // column content; we mint deterministic `crsmoke-` markers (NOT real values) and
  // assert both survive into the payload. The dedup key includes columnId + changedAt.
  buildSyntheticEvent: (id) => ({
    type: "change_column_value",
    boardId: id.boardId,
    pulseId: id.itemId,
    pulseName: id.itemName,
    columnId: SMOKE_COLUMN_ID,
    columnTitle: "crsmoke-column",
    previousValue: prevValueMarker(id),
    value: newValueMarker(id),
    changedAt: id.createdAt,
    userId: "crsmoke-user",
  }),
  expectedEventId: (id) =>
    `column_changed:${id.boardId}:${id.itemId}:${SMOKE_COLUMN_ID}:${id.createdAt}`,
  identityMatches: (run, id) => {
    if (!baseMatch(run, id, COLUMN_CHANGED_SPEC, "column_changed")) return false;
    const p = run.triggerPayload!;
    return (
      p.itemId === id.itemId &&
      p.columnId === SMOKE_COLUMN_ID &&
      p.previousValue === prevValueMarker(id) &&
      p.newValue === newValueMarker(id)
    );
  },
};

export const ALL_MONDAY_WEBHOOK_SPECS: readonly MondayWebhookTriggerSpec[] = [
  NEW_ITEM_SPEC,
  ITEM_MOVED_SPEC,
  NEW_SUBITEM_SPEC,
  NEW_UPDATE_SPEC,
  COLUMN_CHANGED_SPEC,
];

export interface MondayWebhookSmokeDeps {
  /** Mint a fresh, unique synthetic identity (unique ids per run -> unique dedup key). */
  mintIdentity(): MondayWebhookSmokeIdentity;
  createActiveSmokeWorkflow(
    workflow: MondayWebhookSmokeWorkflow,
  ): Promise<{ workflowId: string }>;
  /**
   * DIRECT-SEED the minimum trigger_resources row (provider `monday`, eventType
   * `<spec>`, keyed by workflowId+nodeId, config `{ eventType, boardId }`). Does NOT
   * run the activation hook -> NO Monday API call, NO real webhook. Returns the stored
   * event_type so the smoke proves it equals the dispatch key.
   */
  seedTriggerResource(input: {
    workflowId: string;
    triggerNodeId: string;
    boardId: string;
    eventType: string;
  }): Promise<{ seededEventType: string | null }>;
  /**
   * Wrap the spec's Monday `event` object in a `{ event }` body, sign it with the
   * REAL `MONDAY_SIGNING_SECRET` (`x-monday-signature` = HMAC-SHA256 hex over the raw
   * body), and POST it through the REAL
   * `POST /api/webhooks/monday?workflowId=&nodeId=` route. Returns the HTTP status.
   */
  deliverSyntheticEvent(input: {
    event: Record<string, unknown>;
    workflowId: string;
    triggerNodeId: string;
  }): Promise<{ httpStatus: number }>;
  listRuns(workflowId: string): Promise<readonly MondayWebhookSmokeRun[]>;
  drainRun(runId: string): Promise<void>;
  readRun(runId: string): Promise<MondayWebhookSmokeRun | null>;
  /** Soft-delete the smoke workflow + DELETE the seeded trigger_resources row
   * directly (no deactivation hook -> no Monday API). */
  cleanupWorkflow(workflowId: string): Promise<void>;
  /** Delete the synthetic dedup row (provider=monday, event_id) — hygiene. */
  cleanupDedup(eventId: string): Promise<void>;
  sleep(ms: number): Promise<void>;
}

export interface MondayWebhookSmokeOptions {
  readonly afterDeliverAttempts?: number;
  readonly afterDeliverSleepMs?: number;
  readonly dedupSettleMs?: number;
}

export interface MondayWebhookSmokeResult {
  readonly outcome: "pass" | "fail" | "skip";
  readonly reason: string | null;
  readonly triggerLabel: string;
  readonly seededEventType: string | null;
  readonly baselineRunCount: number;
  readonly deliverHttpStatus: number | null;
  readonly afterRunCount: number;
  readonly identityMatched: boolean;
  readonly terminalStatus: MondayWebhookSmokeRun["status"] | null;
  readonly afterRedeliverRunCount: number | null;
  readonly dedupProven: boolean;
  readonly eventId: string | null;
  readonly workflowId: string | null;
  readonly cleaned: boolean;
}

export async function runMondayWebhookSmoke(
  deps: MondayWebhookSmokeDeps,
  spec: MondayWebhookTriggerSpec,
  opts: MondayWebhookSmokeOptions = {},
): Promise<MondayWebhookSmokeResult> {
  const ref: { workflowId: string | null; eventId: string | null } = {
    workflowId: null,
    eventId: null,
  };
  let result: MondayWebhookSmokeResult;
  try {
    result = await runCore(deps, spec, opts, ref);
  } catch (err) {
    result = base(spec, ref, { outcome: "fail", reason: (err as Error).message });
  } finally {
    // Cleanup ALWAYS runs and is NOT masked. No provider-side resource exists (no
    // real Monday webhook was created) — only smoke-owned DB rows.
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
  spec: MondayWebhookTriggerSpec,
  ref: { workflowId: string | null; eventId: string | null },
  over: Partial<MondayWebhookSmokeResult> & { outcome: MondayWebhookSmokeResult["outcome"] },
): MondayWebhookSmokeResult {
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
  deps: MondayWebhookSmokeDeps,
  spec: MondayWebhookTriggerSpec,
  opts: MondayWebhookSmokeOptions,
  ref: { workflowId: string | null; eventId: string | null },
): Promise<MondayWebhookSmokeResult> {
  const identity = deps.mintIdentity();
  ref.eventId = spec.expectedEventId(identity);

  // 1. Active smoke workflow watching this Monday trigger.
  const workflow = spec.buildWorkflow(identity.boardId);
  const { workflowId } = await deps.createActiveSmokeWorkflow(workflow);
  ref.workflowId = workflowId;

  // 2. DIRECT-SEED the trigger_resources row (no activation hook, no Monday API).
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

  // 3. BASELINE — no event delivered yet => no runs.
  const baselineRuns = await deps.listRuns(workflowId);
  if (baselineRuns.length !== 0) {
    return base(spec, ref, {
      outcome: "fail",
      reason: `baseline violation: ${baselineRuns.length} run(s) before any event delivery`,
      seededEventType,
      baselineRunCount: baselineRuns.length,
    });
  }

  // 4. Deliver the synthetic signed event through the REAL route.
  const event = spec.buildSyntheticEvent(identity);
  const { httpStatus } = await deps.deliverSyntheticEvent({
    event,
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
  let afterRuns: readonly MondayWebhookSmokeRun[] = [];
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

  // 6. The fired run must identify the synthetic event (dedup key + board/item + markers).
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

  // 7. Drain -> terminal 'succeeded'.
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

  // 8. DEDUP — re-send the SAME event; dispatcher must drop it (stays 1 run).
  const redeliver = await deps.deliverSyntheticEvent({
    event,
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
      reason: `dedup failed: ${afterRedeliver.length} run(s) after re-sending the same event (expected 1)`,
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
