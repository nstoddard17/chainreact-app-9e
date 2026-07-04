/**
 * Trigger-smoke harness — Typeform WEBHOOK trigger dispatch path (Lane C, direct-seed).
 *
 * Spec-driven DIRECT-SEEDED HMAC webhook smoke for the single Typeform trigger:
 *
 *   typeform:new_response_in_form  (inbound form_response, normalize new_response_in_form)
 *
 * DIRECT-SEED CONTRACT (honest scope — same boundary as the GitHub / Trello / Monday /
 * Asana smokes): Typeform's real activation hook calls `PUT /forms/{id}/webhooks/{tag}`
 * with a V2-minted secret (needs a connected integration + a real form). That is out of
 * scope for a smoke. So this harness DIRECT-SEEDS the minimum `trigger_resources` row
 * the receive route + dispatcher look up — provider `typeform`, eventType
 * `new_response_in_form`, keyed by workflowId+nodeId, config `{ formId, webhookTag,
 * hookSecretEncrypted: encryptToken(<smoke secret>), webhookEnabled }` — WITHOUT running
 * the activation hook and WITHOUT any Typeform API call. Cleanup deletes that row
 * directly (no deactivation hook -> no Typeform API).
 *
 *   THIS CERTIFIES: receive -> per-row HMAC verify (Typeform-Signature = sha256= +
 *   base64 HMAC-SHA256 over the raw body, keyed with the row's decrypted
 *   hookSecretEncrypted) -> event-type gate (form_response only) -> normalize
 *   (token dedup key, row-attributed formId fallback) -> dispatchTriggerEvent ->
 *   P-S2 formId filter -> dedup -> durable enqueue -> drain -> terminal run.
 *   THIS DOES NOT CERTIFY the Typeform provider-side lifecycle (PUT/DELETE
 *   /forms/{id}/webhooks/{tag}) — that path is covered by unit tests
 *   (activate/deactivate) and needs live credentials for an end-to-end proof.
 *
 * Synthetic-content note: the smoke fabricates a MINIMAL form_response envelope with
 * clearly synthetic ids (`crsmoke-…`) and a single text answer whose value is the
 * literal string "smoke" — no realistic respondent data is invented.
 *
 * Every DB / route / dispatch touchpoint is behind injected `TypeformWebhookSmokeDeps`
 * so this orchestrator is fully unit-testable with fakes; real wiring lives in
 * typeformWebhookSmokeDeps.ts and only runs in the gated dev integration test.
 */
import {
  WorkflowDefinitionSchema,
  type WorkflowDefinition,
} from "@/contracts/workflowDefinition";

export const TYPEFORM_WEBHOOK_SMOKE_TRIGGER_NODE_ID = "smoke-typeform-webhook-trigger";
export const TYPEFORM_WEBHOOK_SMOKE_ACTION_NODE_ID = "smoke-noop-action";

export interface TypeformWebhookSmokeWorkflow {
  readonly definition: WorkflowDefinition;
  readonly triggerNodeId: string;
  readonly actionNodeId: string;
  readonly name: string;
}

/** Build a smoke workflow: the Typeform trigger (V2 short type) -> native no-op. */
export function buildTypeformSmokeWorkflow(
  formId: string,
): TypeformWebhookSmokeWorkflow {
  const definition = WorkflowDefinitionSchema.parse({
    nodes: [
      {
        id: TYPEFORM_WEBHOOK_SMOKE_TRIGGER_NODE_ID,
        kind: "trigger",
        provider: "typeform",
        type: "new_response_in_form",
        // `formId` is the one REQUIRED builder field; a synthetic value
        // satisfies the pre-execution readiness gate. It is NOT a real form.
        // (The receive route resolves the trigger row via the query params;
        // the P-S2 filter compares against the seeded row's config — we keep
        // them equal for consistency.)
        config: { formId },
        position: { x: 0, y: 0 },
      },
      {
        id: TYPEFORM_WEBHOOK_SMOKE_ACTION_NODE_ID,
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
        id: "smoke-typeform-webhook-edge",
        from: TYPEFORM_WEBHOOK_SMOKE_TRIGGER_NODE_ID,
        to: TYPEFORM_WEBHOOK_SMOKE_ACTION_NODE_ID,
      },
    ],
  });
  return {
    definition,
    triggerNodeId: TYPEFORM_WEBHOOK_SMOKE_TRIGGER_NODE_ID,
    actionNodeId: TYPEFORM_WEBHOOK_SMOKE_ACTION_NODE_ID,
    name: "trigger-smoke:typeform:new_response_in_form",
  };
}

/** Synthetic Typeform identity — fully smoke-minted, no real form/response data. */
export interface TypeformWebhookSmokeIdentity {
  /** Synthetic form id (also the normalized providerAccountId). */
  readonly formId: string;
  /** Synthetic response token — the dedup key's discriminator. */
  readonly responseToken: string;
  /** Synthetic provider event id. */
  readonly providerEventId: string;
  /** The per-webhook smoke secret (seeded encrypted on the row, signs deliveries). */
  readonly hookSecret: string;
  /** Deterministic synthetic timestamp (informational occurredAt only). */
  readonly submittedAt: string;
}

export interface TypeformWebhookSmokeRun {
  readonly runId: string;
  readonly status: "succeeded" | "failed" | "running" | "queued" | null;
  readonly triggerPayload: Readonly<Record<string, unknown>> | null;
  readonly eventId: string | null;
  readonly eventType: string | null;
}

/** Token-scoped dedup key (NO timestamp) — redeliveries collapse. */
export function expectedTypeformEventId(
  identity: TypeformWebhookSmokeIdentity,
): string {
  return `new_response_in_form:${identity.formId}:${identity.responseToken}`;
}

/** Build the minimal synthetic form_response delivery body. Pure — no I/O. */
export function buildSyntheticFormResponseBody(
  identity: TypeformWebhookSmokeIdentity,
): Record<string, unknown> {
  return {
    event_id: identity.providerEventId,
    event_type: "form_response",
    form_response: {
      form_id: identity.formId,
      token: identity.responseToken,
      submitted_at: identity.submittedAt,
      landed_at: identity.submittedAt,
      definition: {
        id: identity.formId,
        title: "crsmoke form",
        fields: [
          { id: "crsmoke-field-1", title: "crsmoke question", ref: "crsmoke-ref-1", type: "short_text" },
        ],
      },
      answers: [
        {
          type: "text",
          text: "smoke",
          field: { id: "crsmoke-field-1", ref: "crsmoke-ref-1", type: "short_text" },
        },
      ],
    },
  };
}

export function typeformIdentityMatches(
  run: TypeformWebhookSmokeRun,
  identity: TypeformWebhookSmokeIdentity,
): boolean {
  if (run.eventId !== expectedTypeformEventId(identity)) return false;
  if (run.eventType !== "new_response_in_form") return false;
  const p = run.triggerPayload;
  if (!p) return false;
  return (
    p.changeKind === "new_response_in_form" &&
    p.formId === identity.formId &&
    p.responseToken === identity.responseToken
  );
}

export interface TypeformWebhookSmokeDeps {
  mintIdentity(): TypeformWebhookSmokeIdentity;
  createActiveSmokeWorkflow(
    workflow: TypeformWebhookSmokeWorkflow,
  ): Promise<{ workflowId: string }>;
  /**
   * DIRECT-SEED the minimum trigger_resources row (provider `typeform`, eventType
   * `new_response_in_form`, keyed by workflowId+nodeId, config `{ formId,
   * webhookTag, hookSecretEncrypted, webhookEnabled: true }`) — the exact
   * post-activation shape, minted without the activation hook or any Typeform
   * API call.
   */
  seedTriggerResource(input: {
    workflowId: string;
    triggerNodeId: string;
    formId: string;
    hookSecret: string;
  }): Promise<{ seededEventType: string | null }>;
  /**
   * Serialize the synthetic form_response body, sign the raw bytes with the SAME
   * per-row smoke secret (`Typeform-Signature` = sha256= + base64 HMAC-SHA256),
   * and POST it through the REAL `POST /api/webhooks/typeform?workflowId=&nodeId=`
   * route.
   */
  deliverSyntheticEvent(input: {
    body: Record<string, unknown>;
    hookSecret: string;
    workflowId: string;
    triggerNodeId: string;
  }): Promise<{ httpStatus: number }>;
  listRuns(workflowId: string): Promise<readonly TypeformWebhookSmokeRun[]>;
  drainRun(runId: string): Promise<void>;
  readRun(runId: string): Promise<TypeformWebhookSmokeRun | null>;
  cleanupWorkflow(workflowId: string): Promise<void>;
  cleanupDedup(eventId: string): Promise<void>;
  sleep(ms: number): Promise<void>;
}

export interface TypeformWebhookSmokeOptions {
  readonly afterDeliverAttempts?: number;
  readonly afterDeliverSleepMs?: number;
  readonly dedupSettleMs?: number;
}

export interface TypeformWebhookSmokeResult {
  readonly outcome: "pass" | "fail" | "skip";
  readonly reason: string | null;
  readonly triggerLabel: string;
  readonly seededEventType: string | null;
  readonly baselineRunCount: number;
  readonly deliverHttpStatus: number | null;
  readonly afterRunCount: number;
  readonly identityMatched: boolean;
  readonly terminalStatus: TypeformWebhookSmokeRun["status"] | null;
  readonly afterRedeliverRunCount: number | null;
  readonly dedupProven: boolean;
  readonly eventId: string | null;
  readonly workflowId: string | null;
  readonly cleaned: boolean;
}

const TRIGGER_LABEL = "typeform:new_response_in_form";

export async function runTypeformWebhookSmoke(
  deps: TypeformWebhookSmokeDeps,
  opts: TypeformWebhookSmokeOptions = {},
): Promise<TypeformWebhookSmokeResult> {
  const ref: { workflowId: string | null; eventId: string | null } = {
    workflowId: null,
    eventId: null,
  };
  let result: TypeformWebhookSmokeResult;
  try {
    result = await runCore(deps, opts, ref);
  } catch (err) {
    result = base(ref, { outcome: "fail", reason: (err as Error).message });
  } finally {
    // Cleanup ALWAYS runs and is NOT masked. No provider-side resource exists (no
    // real Typeform webhook was created) — only smoke-owned DB rows.
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
  over: Partial<TypeformWebhookSmokeResult> & {
    outcome: TypeformWebhookSmokeResult["outcome"];
  },
): TypeformWebhookSmokeResult {
  return {
    reason: null,
    triggerLabel: TRIGGER_LABEL,
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
  deps: TypeformWebhookSmokeDeps,
  opts: TypeformWebhookSmokeOptions,
  ref: { workflowId: string | null; eventId: string | null },
): Promise<TypeformWebhookSmokeResult> {
  const identity = deps.mintIdentity();
  ref.eventId = expectedTypeformEventId(identity);

  // 1. Active smoke workflow watching this Typeform trigger.
  const workflow = buildTypeformSmokeWorkflow(identity.formId);
  const { workflowId } = await deps.createActiveSmokeWorkflow(workflow);
  ref.workflowId = workflowId;

  // 2. DIRECT-SEED the trigger_resources row (post-activation shape; no Typeform API).
  const { seededEventType } = await deps.seedTriggerResource({
    workflowId,
    triggerNodeId: workflow.triggerNodeId,
    formId: identity.formId,
    hookSecret: identity.hookSecret,
  });
  if (seededEventType !== "new_response_in_form") {
    return base(ref, {
      outcome: "fail",
      reason: `seeded trigger_resources event_type '${seededEventType ?? "null"}', expected 'new_response_in_form'`,
      seededEventType,
    });
  }

  // 3. BASELINE — no event delivered yet => no runs.
  const baselineRuns = await deps.listRuns(workflowId);
  if (baselineRuns.length !== 0) {
    return base(ref, {
      outcome: "fail",
      reason: `baseline violation: ${baselineRuns.length} run(s) before any event delivery`,
      seededEventType,
      baselineRunCount: baselineRuns.length,
    });
  }

  // 4. Deliver the synthetic signed event through the REAL route.
  const body = buildSyntheticFormResponseBody(identity);
  const { httpStatus } = await deps.deliverSyntheticEvent({
    body,
    hookSecret: identity.hookSecret,
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
  let afterRuns: readonly TypeformWebhookSmokeRun[] = [];
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

  // 6. The fired run must identify the synthetic event.
  const fired = afterRuns[0]!;
  if (!typeformIdentityMatches(fired, identity)) {
    return base(ref, {
      outcome: "fail",
      reason: `fired run did not identify the synthetic ${TRIGGER_LABEL} (eventId=${fired.eventId ?? "null"}, eventType=${fired.eventType ?? "null"})`,
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

  // 8. DEDUP — re-send the SAME event; dispatcher must drop it (stays 1 run).
  const redeliver = await deps.deliverSyntheticEvent({
    body,
    hookSecret: identity.hookSecret,
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
      reason: `dedup failed: ${afterRedeliver.length} run(s) after re-sending the same event (expected 1)`,
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
