/**
 * Trigger-smoke harness — GENERIC direct-seed webhook orchestrator (Lane C).
 *
 * Generalizes the flow the GitHub / Trello / Monday direct-seed smokes each
 * re-implemented, so the consolidated-webhook batch (Stripe / Shopify / HubSpot /
 * Mailchimp) shares ONE orchestrator and each provider plugs in a pure spec + a
 * real-wiring deps object.
 *
 * DIRECT-SEED CONTRACT (the honest scope boundary, same as github:new_commit):
 *   These providers' real `registerWorkflowTriggers` activation hooks call the
 *   provider API to create webhook subscriptions (needs a connected integration
 *   plus real provider resources). That is OUT OF SCOPE for a smoke. The deps
 *   DIRECT-SEED the minimum registration rows the receive route + dispatcher look
 *   up (trigger_resources for Stripe/Shopify/Mailchimp; hubspot_app_subscriptions
 *   + hubspot_subscription_refs for HubSpot) WITHOUT running the activation hook
 *   and WITHOUT any provider API call. Cleanup deletes those rows directly.
 *
 *   THIS CERTIFIES: the V2 webhook INGESTION PATH for the provider event shape —
 *   receive → signature verify (where the provider has a scheme) → normalize →
 *   dispatch → dedup → durable enqueue → drain → terminal run. It does NOT
 *   certify provider-side subscription activation, and it does NOT claim the
 *   provider delivered the event.
 *
 * Flow per spec (identical to the github harness, but the identity is minted
 * FIRST and threaded through seeding — Stripe's per-row endpointSecret and
 * Mailchimp's content-hash dedup key must be shared between the seeded row and
 * the signed delivery):
 *   mint identity → create active {trigger → native no-op} workflow →
 *   DIRECT-SEED registration (assert stored event_type == canonical dispatch key)
 *   → BASELINE 0 runs → POST the synthetic signed event through the REAL route →
 *   exactly ONE run identifying the synthetic event → drain → terminal
 *   'succeeded' → re-send the SAME dedup identity → still ONE run → cleanup
 *   (workflow + seeded registration rows + dedup row) → 0 leaked.
 *
 * Every DB / route / dispatch touchpoint is behind injected deps so the
 * orchestrator is fully unit-testable with fakes; real wiring lives in the
 * per-provider *WebhookSmokeDeps.ts files and only runs in the gated dev test.
 */
import {
  WorkflowDefinitionSchema,
  type WorkflowDefinition,
} from "@/contracts/workflowDefinition";

export interface DirectSeedSmokeWorkflow {
  readonly definition: WorkflowDefinition;
  readonly triggerNodeId: string;
  readonly actionNodeId: string;
  readonly name: string;
}

export const DIRECT_SEED_SMOKE_TRIGGER_NODE_ID = "smoke-webhook-trigger";
export const DIRECT_SEED_SMOKE_ACTION_NODE_ID = "smoke-noop-action";

/**
 * Build a smoke workflow: one provider webhook trigger → native no-op.
 * `triggerConfig` must carry the trigger meta's REQUIRED builder fields so the
 * drained run passes the pre-execution readiness gate (MISSING_REQUIRED_FIELDS)
 * — same reason the github harness pins a synthetic `repository`.
 */
export function buildDirectSeedSmokeWorkflow(
  provider: string,
  triggerType: string,
  triggerConfig: Record<string, unknown>,
  label: string,
): DirectSeedSmokeWorkflow {
  const definition = WorkflowDefinitionSchema.parse({
    nodes: [
      {
        id: DIRECT_SEED_SMOKE_TRIGGER_NODE_ID,
        kind: "trigger",
        provider,
        type: triggerType,
        config: triggerConfig,
        position: { x: 0, y: 0 },
      },
      {
        id: DIRECT_SEED_SMOKE_ACTION_NODE_ID,
        kind: "action",
        provider: "native",
        // Unary is_falsy on a truthy literal with onFalse:"skip" → evaluates false →
        // engine takes the NULL branch → terminal 'succeeded', zero external effect.
        // (Same proven no-op every trigger smoke wires.)
        type: "if_then_condition",
        config: { input: "smoke", operator: "is_falsy", onFalse: "skip" },
        position: { x: 0, y: 160 },
      },
    ],
    edges: [
      {
        id: "smoke-webhook-edge",
        from: DIRECT_SEED_SMOKE_TRIGGER_NODE_ID,
        to: DIRECT_SEED_SMOKE_ACTION_NODE_ID,
      },
    ],
  });
  return {
    definition,
    triggerNodeId: DIRECT_SEED_SMOKE_TRIGGER_NODE_ID,
    actionNodeId: DIRECT_SEED_SMOKE_ACTION_NODE_ID,
    name: `trigger-smoke:${label}`,
  };
}

export interface DirectSeedSmokeRun {
  readonly runId: string;
  readonly status: "succeeded" | "failed" | "running" | "queued" | null;
  /** The run's persisted trigger event payload (normalized provider event). */
  readonly triggerPayload: Readonly<Record<string, unknown>> | null;
  /** The run's persisted TriggerEvent.eventId (= the dedup key). */
  readonly eventId: string | null;
  /** The run's persisted TriggerEvent.eventType. */
  readonly eventType: string | null;
}

/** Every provider identity carries at least the dedup key. */
export interface DirectSeedSmokeIdentity {
  readonly eventId: string;
}

/**
 * Per-provider plug-in: pure — no I/O. The deps own seeding, signing and the
 * real-route POST; the spec owns the workflow shape and the identity check.
 */
export interface DirectSeedWebhookSpec<TIdentity extends DirectSeedSmokeIdentity> {
  readonly label: string;
  readonly provider: string;
  /** The canonical dispatch event_type the seeded registration must store. */
  readonly expectedEventType: string;
  buildWorkflow(): DirectSeedSmokeWorkflow;
  /** Does the fired run's persisted trigger event identify the synthetic event? */
  identityMatches(run: DirectSeedSmokeRun, identity: TIdentity): boolean;
}

export interface DirectSeedWebhookSmokeDeps<TIdentity extends DirectSeedSmokeIdentity> {
  /** Mint a fresh, unique synthetic identity (unique dedup key per run). */
  mintIdentity(): TIdentity;
  createActiveSmokeWorkflow(
    workflow: DirectSeedSmokeWorkflow,
  ): Promise<{ workflowId: string }>;
  /**
   * DIRECT-SEED the minimum registration rows the receive route + dispatcher
   * look up. Does NOT run the activation hook → NO provider API call, NO real
   * webhook created. Returns the stored event_type so the smoke proves it
   * equals the canonical dispatch key.
   */
  seedRegistration(input: {
    workflowId: string;
    triggerNodeId: string;
    identity: TIdentity;
  }): Promise<{ seededEventType: string | null }>;
  /**
   * Build the synthetic provider event for this identity, sign it per the
   * provider's documented scheme (production verification UNWEAKENED), and
   * POST it through the REAL receive route. Returns the route's HTTP status.
   */
  deliverSyntheticEvent(input: {
    identity: TIdentity;
    workflowId: string;
    triggerNodeId: string;
  }): Promise<{ httpStatus: number }>;
  listRuns(workflowId: string): Promise<readonly DirectSeedSmokeRun[]>;
  drainRun(runId: string): Promise<void>;
  readRun(runId: string): Promise<DirectSeedSmokeRun | null>;
  /**
   * Delete the seeded registration rows + soft-delete the workflow. No
   * deactivation hook runs (no provider-side resource exists).
   */
  cleanupRegistration(workflowId: string, identity: TIdentity): Promise<void>;
  /** Delete the synthetic dedup row (provider, event_id) — hygiene. */
  cleanupDedup(eventId: string): Promise<void>;
  sleep(ms: number): Promise<void>;
}

export interface DirectSeedWebhookSmokeOptions {
  /** Bounded re-list attempts after delivery (DB read settle). Default 5. */
  readonly afterDeliverAttempts?: number;
  /** Sleep between re-list attempts (ms). Default 200. */
  readonly afterDeliverSleepMs?: number;
  /** Settle window before asserting dedup held no second run (ms). Default 500. */
  readonly dedupSettleMs?: number;
}

export interface DirectSeedWebhookSmokeResult {
  readonly outcome: "pass" | "fail" | "skip";
  readonly reason: string | null;
  readonly triggerLabel: string;
  readonly seededEventType: string | null;
  readonly baselineRunCount: number;
  readonly deliverHttpStatus: number | null;
  readonly afterRunCount: number;
  readonly identityMatched: boolean;
  readonly terminalStatus: DirectSeedSmokeRun["status"] | null;
  /** Run count after re-sending the SAME dedup identity (dedup proof: stays 1). */
  readonly afterRedeliverRunCount: number | null;
  readonly dedupProven: boolean;
  readonly eventId: string | null;
  readonly workflowId: string | null;
  readonly cleaned: boolean;
}

export async function runDirectSeedWebhookSmoke<
  TIdentity extends DirectSeedSmokeIdentity,
>(
  deps: DirectSeedWebhookSmokeDeps<TIdentity>,
  spec: DirectSeedWebhookSpec<TIdentity>,
  opts: DirectSeedWebhookSmokeOptions = {},
): Promise<DirectSeedWebhookSmokeResult> {
  const ref: {
    workflowId: string | null;
    identity: TIdentity | null;
  } = { workflowId: null, identity: null };
  let result: DirectSeedWebhookSmokeResult;
  try {
    result = await runCore(deps, spec, opts, ref);
  } catch (err) {
    result = base(spec, ref, { outcome: "fail", reason: (err as Error).message });
  } finally {
    // Cleanup ALWAYS runs and is NOT masked. A cleanup failure flips `cleaned`
    // to false but never the verdict. No provider-side resource exists — only
    // smoke-owned DB rows (workflow, seeded registration, runs, dedup row).
    let cleaned = true;
    if (ref.workflowId && ref.identity) {
      cleaned =
        (await deps
          .cleanupRegistration(ref.workflowId, ref.identity)
          .then(() => true)
          .catch(() => false)) && cleaned;
    }
    if (ref.identity) {
      cleaned =
        (await deps
          .cleanupDedup(ref.identity.eventId)
          .then(() => true)
          .catch(() => false)) && cleaned;
    }
    result = { ...result!, cleaned };
  }
  return result!;
}

function base<TIdentity extends DirectSeedSmokeIdentity>(
  spec: DirectSeedWebhookSpec<TIdentity>,
  ref: { workflowId: string | null; identity: TIdentity | null },
  over: Partial<DirectSeedWebhookSmokeResult> & {
    outcome: DirectSeedWebhookSmokeResult["outcome"];
  },
): DirectSeedWebhookSmokeResult {
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
    eventId: ref.identity?.eventId ?? null,
    workflowId: ref.workflowId,
    cleaned: false,
    ...over,
  };
}

async function runCore<TIdentity extends DirectSeedSmokeIdentity>(
  deps: DirectSeedWebhookSmokeDeps<TIdentity>,
  spec: DirectSeedWebhookSpec<TIdentity>,
  opts: DirectSeedWebhookSmokeOptions,
  ref: { workflowId: string | null; identity: TIdentity | null },
): Promise<DirectSeedWebhookSmokeResult> {
  // Identity FIRST — seeding may depend on it (Stripe's endpointSecret,
  // Mailchimp's content-hash dedup key, HubSpot's portal id).
  const identity = deps.mintIdentity();
  ref.identity = identity;

  // 1. Active smoke workflow watching this provider trigger.
  const workflow = spec.buildWorkflow();
  const { workflowId } = await deps.createActiveSmokeWorkflow(workflow);
  ref.workflowId = workflowId;

  // 2. DIRECT-SEED the registration rows (no activation hook, no provider API).
  const { seededEventType } = await deps.seedRegistration({
    workflowId,
    triggerNodeId: workflow.triggerNodeId,
    identity,
  });
  if (seededEventType !== spec.expectedEventType) {
    return base(spec, ref, {
      outcome: "fail",
      reason: `seeded registration stored event_type '${seededEventType ?? "null"}', expected '${spec.expectedEventType}'`,
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

  // 4. Deliver the synthetic signed event through the REAL receive route.
  const { httpStatus } = await deps.deliverSyntheticEvent({
    identity,
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
  let afterRuns: readonly DirectSeedSmokeRun[] = [];
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

  // 6. The fired run must identify the synthetic event (dedup key + markers).
  const fired = afterRuns[0]!;
  if (!spec.identityMatches(fired, identity)) {
    return base(spec, ref, {
      outcome: "fail",
      reason: `fired run did not identify the synthetic event (eventId=${fired.eventId ?? "null"}, eventType=${fired.eventType ?? "null"})`,
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

  // 8. DEDUP — re-send the SAME dedup identity; it must be dropped (stays 1).
  const redeliver = await deps.deliverSyntheticEvent({
    identity,
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
      reason: `dedup failed: ${afterRedeliver.length} run(s) after re-sending the same dedup identity (expected 1)`,
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
