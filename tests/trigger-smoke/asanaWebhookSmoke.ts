/**
 * Trigger-smoke harness — Asana WEBHOOK trigger dispatch path (Lane C, direct-seed).
 *
 * Spec-driven DIRECT-SEEDED HMAC webhook smoke for BOTH Asana project triggers:
 *
 *   asana:new_task_in_project      (inbound task+added,   normalize new_task_in_project)
 *   asana:task_updated_in_project  (inbound task+changed, normalize task_updated_in_project)
 *
 * Both are certifiable — Asana webhook events are COMPACT (gids + action + timestamp
 * only, no task names / notes / values), so no user-content-shaped data is fabricated
 * (contrast the excluded Monday new_update / column_changed).
 *
 * DIRECT-SEED CONTRACT (honest scope — same boundary as the GitHub / Trello / Monday
 * smokes): Asana's real activation hook calls `POST /webhooks` and persists the
 * per-webhook X-Hook-Secret during the creation handshake (needs a connected
 * integration + a real project). That is out of scope for a smoke. So this harness
 * DIRECT-SEEDS the minimum `trigger_resources` row the receive route + dispatcher look
 * up — provider `asana`, eventType `<spec>`, keyed by workflowId+nodeId, config
 * `{ projectId, hookSecretEncrypted: encryptToken(<smoke secret>), webhookEnabled }` —
 * WITHOUT running the activation hook and WITHOUT any Asana API call. Cleanup deletes
 * that row directly (no deactivation hook -> no Asana API).
 *
 *   THIS CERTIFIES: receive -> per-row HMAC verify (X-Hook-Signature = HMAC-SHA256 hex
 *   over the raw body, keyed with the row's decrypted hookSecretEncrypted) -> classify
 *   -> event-type filter -> normalize (row-attributed projectGid) ->
 *   dispatchTriggerEvent -> P-S2 projectId filter -> dedup -> durable enqueue -> drain
 *   -> terminal run. THIS DOES NOT CERTIFY the Asana provider-side lifecycle
 *   (POST /webhooks + X-Hook-Secret handshake persistence + DELETE /webhooks) — that
 *   path is covered by unit tests (activate/receive) and needs live credentials for an
 *   end-to-end proof.
 *
 * Asana signature caveat: the secret is PER WEBHOOK (delivered once via the creation
 * handshake), so the harness mints a smoke secret, seeds it encrypted on the row
 * exactly as the handshake path would, and signs the exact bytes it POSTs — production
 * verification is UNWEAKENED.
 *
 * Every DB / route / dispatch touchpoint is behind injected `AsanaWebhookSmokeDeps` so
 * this orchestrator is fully unit-testable with fakes; real wiring lives in
 * asanaWebhookSmokeDeps.ts and only runs in the gated dev integration test.
 */
import {
  WorkflowDefinitionSchema,
  type WorkflowDefinition,
} from "@/contracts/workflowDefinition";

export const ASANA_WEBHOOK_SMOKE_TRIGGER_NODE_ID = "smoke-asana-webhook-trigger";
export const ASANA_WEBHOOK_SMOKE_ACTION_NODE_ID = "smoke-noop-action";

export interface AsanaWebhookSmokeWorkflow {
  readonly definition: WorkflowDefinition;
  readonly triggerNodeId: string;
  readonly actionNodeId: string;
  readonly name: string;
}

/** Build a smoke workflow: one Asana project trigger (V2 short type) -> native no-op. */
export function buildAsanaSmokeWorkflow(
  eventType: string,
  label: string,
  projectId: string,
): AsanaWebhookSmokeWorkflow {
  const definition = WorkflowDefinitionSchema.parse({
    nodes: [
      {
        id: ASANA_WEBHOOK_SMOKE_TRIGGER_NODE_ID,
        kind: "trigger",
        provider: "asana",
        type: eventType,
        // `projectId` is the one REQUIRED builder field on both Asana project
        // triggers; a synthetic value satisfies the pre-execution readiness gate.
        // It is NOT a real project. (The receive route resolves the trigger row
        // via the query params; the P-S2 filter compares against the seeded row's
        // config — we keep them equal for consistency.)
        config: { projectId },
        position: { x: 0, y: 0 },
      },
      {
        id: ASANA_WEBHOOK_SMOKE_ACTION_NODE_ID,
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
        id: "smoke-asana-webhook-edge",
        from: ASANA_WEBHOOK_SMOKE_TRIGGER_NODE_ID,
        to: ASANA_WEBHOOK_SMOKE_ACTION_NODE_ID,
      },
    ],
  });
  return {
    definition,
    triggerNodeId: ASANA_WEBHOOK_SMOKE_TRIGGER_NODE_ID,
    actionNodeId: ASANA_WEBHOOK_SMOKE_ACTION_NODE_ID,
    name: `trigger-smoke:${label}`,
  };
}

/** Synthetic Asana identity — fully smoke-minted, no real project/task/user data. */
export interface AsanaWebhookSmokeIdentity {
  /** Synthetic project gid (also the normalized providerAccountId). */
  readonly projectId: string;
  /** Synthetic task gid. */
  readonly taskGid: string;
  /** Synthetic actor gid. */
  readonly actorGid: string;
  /** The per-webhook smoke secret (seeded encrypted on the row, signs deliveries). */
  readonly hookSecret: string;
  /** Deterministic synthetic timestamp — part of every dedup key. */
  readonly createdAt: string;
}

export interface AsanaWebhookSmokeRun {
  readonly runId: string;
  readonly status: "succeeded" | "failed" | "running" | "queued" | null;
  readonly triggerPayload: Readonly<Record<string, unknown>> | null;
  readonly eventId: string | null;
  readonly eventType: string | null;
}

/**
 * Per-trigger plug-in: V2 eventType + inbound (resource_type, action) pair +
 * workflow builder + synthetic event object + deterministic dedup key + identity
 * matcher. Pure — no I/O. The deps wrap the events in `{ events: [...] }`, sign the
 * raw bytes with the row's seeded secret, and POST through the real route.
 */
export interface AsanaWebhookTriggerSpec {
  readonly label: string;
  readonly eventType: string;
  /** Inbound Asana action that classifies to `eventType` ("added" / "changed"). */
  readonly inboundAction: string;
  buildWorkflow(projectId: string): AsanaWebhookSmokeWorkflow;
  buildSyntheticEvent(identity: AsanaWebhookSmokeIdentity): Record<string, unknown>;
  expectedEventId(identity: AsanaWebhookSmokeIdentity): string;
  identityMatches(run: AsanaWebhookSmokeRun, identity: AsanaWebhookSmokeIdentity): boolean;
}

function baseMatch(
  run: AsanaWebhookSmokeRun,
  identity: AsanaWebhookSmokeIdentity,
  spec: AsanaWebhookTriggerSpec,
): boolean {
  if (run.eventId !== spec.expectedEventId(identity)) return false;
  if (run.eventType !== spec.eventType) return false;
  const p = run.triggerPayload;
  if (!p) return false;
  return (
    p.changeKind === spec.eventType &&
    p.projectGid === identity.projectId &&
    p.taskGid === identity.taskGid &&
    p.actorGid === identity.actorGid
  );
}

function buildSyntheticTaskEvent(
  identity: AsanaWebhookSmokeIdentity,
  action: string,
): Record<string, unknown> {
  return {
    user: { gid: identity.actorGid },
    resource: {
      gid: identity.taskGid,
      resource_type: "task",
      resource_subtype: "default_task",
    },
    parent: { gid: identity.projectId, resource_type: "project" },
    action,
    created_at: identity.createdAt,
  };
}

export const NEW_TASK_IN_PROJECT_SPEC: AsanaWebhookTriggerSpec = {
  label: "asana:new_task_in_project",
  eventType: "new_task_in_project",
  inboundAction: "added",
  buildWorkflow: (projectId) =>
    buildAsanaSmokeWorkflow("new_task_in_project", "asana:new_task_in_project", projectId),
  buildSyntheticEvent: (id) => buildSyntheticTaskEvent(id, "added"),
  expectedEventId: (id) =>
    `new_task_in_project:${id.projectId}:${id.taskGid}:${id.createdAt}`,
  identityMatches: (run, id) => baseMatch(run, id, NEW_TASK_IN_PROJECT_SPEC),
};

export const TASK_UPDATED_IN_PROJECT_SPEC: AsanaWebhookTriggerSpec = {
  label: "asana:task_updated_in_project",
  eventType: "task_updated_in_project",
  inboundAction: "changed",
  buildWorkflow: (projectId) =>
    buildAsanaSmokeWorkflow(
      "task_updated_in_project",
      "asana:task_updated_in_project",
      projectId,
    ),
  buildSyntheticEvent: (id) => buildSyntheticTaskEvent(id, "changed"),
  expectedEventId: (id) =>
    `task_updated_in_project:${id.projectId}:${id.taskGid}:${id.createdAt}`,
  identityMatches: (run, id) => baseMatch(run, id, TASK_UPDATED_IN_PROJECT_SPEC),
};

export const ALL_ASANA_WEBHOOK_SPECS: readonly AsanaWebhookTriggerSpec[] = [
  NEW_TASK_IN_PROJECT_SPEC,
  TASK_UPDATED_IN_PROJECT_SPEC,
];

export interface AsanaWebhookSmokeDeps {
  mintIdentity(): AsanaWebhookSmokeIdentity;
  createActiveSmokeWorkflow(
    workflow: AsanaWebhookSmokeWorkflow,
  ): Promise<{ workflowId: string }>;
  /**
   * DIRECT-SEED the minimum trigger_resources row (provider `asana`, eventType
   * `<spec>`, keyed by workflowId+nodeId, config `{ projectId, hookSecretEncrypted,
   * webhookEnabled: true, handshakePending: false }`) — the exact post-activation
   * shape, minted without the activation hook or any Asana API call.
   */
  seedTriggerResource(input: {
    workflowId: string;
    triggerNodeId: string;
    projectId: string;
    hookSecret: string;
    eventType: string;
  }): Promise<{ seededEventType: string | null }>;
  /**
   * Wrap the spec's event in `{ events: [event] }`, sign the raw bytes with the
   * SAME per-row smoke secret (`X-Hook-Signature` = HMAC-SHA256 hex), and POST it
   * through the REAL `POST /api/webhooks/asana?workflowId=&nodeId=` route.
   */
  deliverSyntheticEvent(input: {
    event: Record<string, unknown>;
    hookSecret: string;
    workflowId: string;
    triggerNodeId: string;
  }): Promise<{ httpStatus: number }>;
  listRuns(workflowId: string): Promise<readonly AsanaWebhookSmokeRun[]>;
  drainRun(runId: string): Promise<void>;
  readRun(runId: string): Promise<AsanaWebhookSmokeRun | null>;
  cleanupWorkflow(workflowId: string): Promise<void>;
  cleanupDedup(eventId: string): Promise<void>;
  sleep(ms: number): Promise<void>;
}

export interface AsanaWebhookSmokeOptions {
  readonly afterDeliverAttempts?: number;
  readonly afterDeliverSleepMs?: number;
  readonly dedupSettleMs?: number;
}

export interface AsanaWebhookSmokeResult {
  readonly outcome: "pass" | "fail" | "skip";
  readonly reason: string | null;
  readonly triggerLabel: string;
  readonly seededEventType: string | null;
  readonly baselineRunCount: number;
  readonly deliverHttpStatus: number | null;
  readonly afterRunCount: number;
  readonly identityMatched: boolean;
  readonly terminalStatus: AsanaWebhookSmokeRun["status"] | null;
  readonly afterRedeliverRunCount: number | null;
  readonly dedupProven: boolean;
  readonly eventId: string | null;
  readonly workflowId: string | null;
  readonly cleaned: boolean;
}

export async function runAsanaWebhookSmoke(
  deps: AsanaWebhookSmokeDeps,
  spec: AsanaWebhookTriggerSpec,
  opts: AsanaWebhookSmokeOptions = {},
): Promise<AsanaWebhookSmokeResult> {
  const ref: { workflowId: string | null; eventId: string | null } = {
    workflowId: null,
    eventId: null,
  };
  let result: AsanaWebhookSmokeResult;
  try {
    result = await runCore(deps, spec, opts, ref);
  } catch (err) {
    result = base(spec, ref, { outcome: "fail", reason: (err as Error).message });
  } finally {
    // Cleanup ALWAYS runs and is NOT masked. No provider-side resource exists (no
    // real Asana webhook was created) — only smoke-owned DB rows.
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
  spec: AsanaWebhookTriggerSpec,
  ref: { workflowId: string | null; eventId: string | null },
  over: Partial<AsanaWebhookSmokeResult> & { outcome: AsanaWebhookSmokeResult["outcome"] },
): AsanaWebhookSmokeResult {
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
  deps: AsanaWebhookSmokeDeps,
  spec: AsanaWebhookTriggerSpec,
  opts: AsanaWebhookSmokeOptions,
  ref: { workflowId: string | null; eventId: string | null },
): Promise<AsanaWebhookSmokeResult> {
  const identity = deps.mintIdentity();
  ref.eventId = spec.expectedEventId(identity);

  // 1. Active smoke workflow watching this Asana trigger.
  const workflow = spec.buildWorkflow(identity.projectId);
  const { workflowId } = await deps.createActiveSmokeWorkflow(workflow);
  ref.workflowId = workflowId;

  // 2. DIRECT-SEED the trigger_resources row (post-activation shape; no Asana API).
  const { seededEventType } = await deps.seedTriggerResource({
    workflowId,
    triggerNodeId: workflow.triggerNodeId,
    projectId: identity.projectId,
    hookSecret: identity.hookSecret,
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
    hookSecret: identity.hookSecret,
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
  let afterRuns: readonly AsanaWebhookSmokeRun[] = [];
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

  // 6. The fired run must identify the synthetic event.
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
    hookSecret: identity.hookSecret,
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
