/**
 * Trigger-smoke harness — Calendly WEBHOOK trigger dispatch path (Lane C, direct-seed).
 *
 * Spec-driven DIRECT-SEEDED HMAC webhook smoke, parameterized over BOTH Calendly
 * triggers (one spec per run):
 *
 *   calendly:event_scheduled  (inbound invitee.created,  normalize event_scheduled)
 *   calendly:event_canceled   (inbound invitee.canceled, normalize event_canceled)
 *
 * DIRECT-SEED CONTRACT (honest scope — same boundary as the GitHub / Trello /
 * Monday / Asana / Typeform smokes): Calendly's real activation hook calls
 * `POST /webhook_subscriptions` with a V2-minted signing key (needs a connected
 * integration on a PAID Calendly plan). That is out of scope for a smoke. So this
 * harness DIRECT-SEEDS the minimum `trigger_resources` row the receive route +
 * dispatcher look up — provider `calendly`, eventType per spec, keyed by
 * workflowId+nodeId, config `{ calendlyUserId, hookSecretEncrypted:
 * encryptToken(<smoke key>), webhookEnabled, subscriptionUri }` — WITHOUT running
 * the activation hook and WITHOUT any Calendly API call. Cleanup deletes that row
 * directly (no deactivation hook -> no Calendly API).
 *
 *   THIS CERTIFIES: receive -> per-row HMAC verify (Calendly-Webhook-Signature =
 *   t=<unix>,v1=<hex HMAC-SHA256 over "<t>.<raw body>", keyed with the row's
 *   decrypted hookSecretEncrypted) -> event-family gate (invitee.* matching the
 *   row) -> normalize (subscriber-scoped invitee dedup key, row-attributed
 *   subscriber) -> dispatchTriggerEvent -> P-S2 subscriber/event-type filter ->
 *   dedup -> durable enqueue -> drain -> terminal run.
 *   THIS DOES NOT CERTIFY the Calendly provider-side lifecycle
 *   (POST/DELETE /webhook_subscriptions) — that path is covered by unit tests
 *   (activate/deactivate) and needs live paid-plan credentials for an end-to-end
 *   proof (Phase 13).
 *
 * Synthetic-content note: the smoke fabricates a MINIMAL invitee envelope with
 * clearly synthetic ids (`crsmoke-…`) and "smoke" placeholder strings — no
 * realistic invitee data is invented.
 *
 * Every DB / route / dispatch touchpoint is behind injected
 * `CalendlyWebhookSmokeDeps` so this orchestrator is fully unit-testable with
 * fakes; real wiring lives in calendlyWebhookSmokeDeps.ts and only runs in the
 * gated dev integration test.
 */
import {
  WorkflowDefinitionSchema,
  type WorkflowDefinition,
} from "@/contracts/workflowDefinition";

export const CALENDLY_WEBHOOK_SMOKE_TRIGGER_NODE_ID = "smoke-calendly-webhook-trigger";
export const CALENDLY_WEBHOOK_SMOKE_ACTION_NODE_ID = "smoke-noop-action";

export type CalendlySmokeTriggerType = "event_scheduled" | "event_canceled";

export interface CalendlySmokeTriggerSpec {
  readonly triggerType: CalendlySmokeTriggerType;
  /** The provider envelope `event` field for this trigger. */
  readonly providerEvent: "invitee.created" | "invitee.canceled";
}

export const CALENDLY_SMOKE_SPECS: readonly CalendlySmokeTriggerSpec[] = [
  { triggerType: "event_scheduled", providerEvent: "invitee.created" },
  { triggerType: "event_canceled", providerEvent: "invitee.canceled" },
];

export interface CalendlyWebhookSmokeWorkflow {
  readonly definition: WorkflowDefinition;
  readonly triggerNodeId: string;
  readonly actionNodeId: string;
  readonly name: string;
}

/** Build a smoke workflow: the Calendly trigger (V2 short type) -> native no-op. */
export function buildCalendlySmokeWorkflow(
  spec: CalendlySmokeTriggerSpec,
): CalendlyWebhookSmokeWorkflow {
  const definition = WorkflowDefinitionSchema.parse({
    nodes: [
      {
        id: CALENDLY_WEBHOOK_SMOKE_TRIGGER_NODE_ID,
        kind: "trigger",
        provider: "calendly",
        type: spec.triggerType,
        // The only builder field (eventTypeId) is OPTIONAL — the smoke
        // leaves it empty (all event types), so the P-S2 filter exercises
        // the subscriber-attribution dimension.
        config: {},
        position: { x: 0, y: 0 },
      },
      {
        id: CALENDLY_WEBHOOK_SMOKE_ACTION_NODE_ID,
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
        id: "smoke-calendly-webhook-edge",
        from: CALENDLY_WEBHOOK_SMOKE_TRIGGER_NODE_ID,
        to: CALENDLY_WEBHOOK_SMOKE_ACTION_NODE_ID,
      },
    ],
  });
  return {
    definition,
    triggerNodeId: CALENDLY_WEBHOOK_SMOKE_TRIGGER_NODE_ID,
    actionNodeId: CALENDLY_WEBHOOK_SMOKE_ACTION_NODE_ID,
    name: `trigger-smoke:calendly:${spec.triggerType}`,
  };
}

/** Synthetic Calendly identity — fully smoke-minted, no real booking data. */
export interface CalendlyWebhookSmokeIdentity {
  /** Synthetic subscriber (connected-user) UUID — the P-S2/dedup scope. */
  readonly subscriberUserId: string;
  /** Synthetic scheduled-event UUID. */
  readonly eventUuid: string;
  /** Synthetic invitee UUID — the dedup key's discriminator. */
  readonly inviteeUuid: string;
  /** The per-subscription smoke signing key (seeded encrypted on the row). */
  readonly hookSecret: string;
  /** Deterministic synthetic timestamp (informational occurredAt only). */
  readonly createdAt: string;
}

export interface CalendlyWebhookSmokeRun {
  readonly runId: string;
  readonly status: "succeeded" | "failed" | "running" | "queued" | null;
  readonly triggerPayload: Readonly<Record<string, unknown>> | null;
  readonly eventId: string | null;
  readonly eventType: string | null;
}

/** Subscriber-scoped invitee dedup key (NO timestamp) — redeliveries collapse. */
export function expectedCalendlyEventId(
  spec: CalendlySmokeTriggerSpec,
  identity: CalendlyWebhookSmokeIdentity,
): string {
  return `${spec.triggerType}:${identity.subscriberUserId}:${identity.inviteeUuid}`;
}

/** Build the minimal synthetic invitee delivery envelope. Pure — no I/O. */
export function buildSyntheticInviteeBody(
  spec: CalendlySmokeTriggerSpec,
  identity: CalendlyWebhookSmokeIdentity,
): Record<string, unknown> {
  const inviteeUri = `https://api.calendly.com/scheduled_events/${identity.eventUuid}/invitees/${identity.inviteeUuid}`;
  const base: Record<string, unknown> = {
    uri: inviteeUri,
    email: "crsmoke@example.invalid",
    name: "crsmoke invitee",
    status: spec.triggerType === "event_canceled" ? "canceled" : "active",
    timezone: "UTC",
    created_at: identity.createdAt,
    rescheduled: false,
    scheduled_event: {
      uri: `https://api.calendly.com/scheduled_events/${identity.eventUuid}`,
      name: "crsmoke meeting",
      status: spec.triggerType === "event_canceled" ? "canceled" : "active",
      start_time: identity.createdAt,
      end_time: identity.createdAt,
      event_type: "https://api.calendly.com/event_types/crsmoke-event-type",
      location: { type: "custom", location: "smoke" },
      event_memberships: [
        {
          user: `https://api.calendly.com/users/${identity.subscriberUserId}`,
          user_email: "crsmoke-host@example.invalid",
          user_name: "crsmoke host",
        },
      ],
    },
  };
  if (spec.triggerType === "event_canceled") {
    base.cancellation = {
      canceled_by: "crsmoke host",
      reason: "smoke",
      canceler_type: "host",
    };
  }
  return {
    event: spec.providerEvent,
    created_at: identity.createdAt,
    created_by: `https://api.calendly.com/users/${identity.subscriberUserId}`,
    payload: base,
  };
}

export function calendlyIdentityMatches(
  spec: CalendlySmokeTriggerSpec,
  run: CalendlyWebhookSmokeRun,
  identity: CalendlyWebhookSmokeIdentity,
): boolean {
  if (run.eventId !== expectedCalendlyEventId(spec, identity)) return false;
  if (run.eventType !== spec.triggerType) return false;
  const p = run.triggerPayload;
  if (!p) return false;
  return (
    p.changeKind === spec.triggerType &&
    p.subscriberUserId === identity.subscriberUserId &&
    p.inviteeId === identity.inviteeUuid
  );
}

export interface CalendlyWebhookSmokeDeps {
  mintIdentity(): CalendlyWebhookSmokeIdentity;
  createActiveSmokeWorkflow(
    workflow: CalendlyWebhookSmokeWorkflow,
  ): Promise<{ workflowId: string }>;
  /**
   * DIRECT-SEED the minimum trigger_resources row (provider `calendly`,
   * eventType per spec, keyed by workflowId+nodeId, config
   * `{ calendlyUserId, hookSecretEncrypted, webhookEnabled: true,
   * subscriptionUri }`) — the exact post-activation shape, minted without
   * the activation hook or any Calendly API call.
   */
  seedTriggerResource(input: {
    workflowId: string;
    triggerNodeId: string;
    triggerType: CalendlySmokeTriggerType;
    subscriberUserId: string;
    hookSecret: string;
  }): Promise<{ seededEventType: string | null }>;
  /**
   * Serialize the synthetic invitee envelope, sign the raw bytes with the SAME
   * per-row smoke key (`Calendly-Webhook-Signature` = t=<unix>,v1=<hex
   * HMAC-SHA256 over "<t>.<raw body>">), and POST it through the REAL
   * `POST /api/webhooks/calendly?workflowId=&nodeId=` route.
   */
  deliverSyntheticEvent(input: {
    body: Record<string, unknown>;
    hookSecret: string;
    workflowId: string;
    triggerNodeId: string;
  }): Promise<{ httpStatus: number }>;
  listRuns(workflowId: string): Promise<readonly CalendlyWebhookSmokeRun[]>;
  drainRun(runId: string): Promise<void>;
  readRun(runId: string): Promise<CalendlyWebhookSmokeRun | null>;
  cleanupWorkflow(workflowId: string): Promise<void>;
  cleanupDedup(eventId: string): Promise<void>;
  sleep(ms: number): Promise<void>;
}

export interface CalendlyWebhookSmokeOptions {
  readonly afterDeliverAttempts?: number;
  readonly afterDeliverSleepMs?: number;
  readonly dedupSettleMs?: number;
}

export interface CalendlyWebhookSmokeResult {
  readonly outcome: "pass" | "fail" | "skip";
  readonly reason: string | null;
  readonly triggerLabel: string;
  readonly seededEventType: string | null;
  readonly baselineRunCount: number;
  readonly deliverHttpStatus: number | null;
  readonly afterRunCount: number;
  readonly identityMatched: boolean;
  readonly terminalStatus: CalendlyWebhookSmokeRun["status"] | null;
  readonly afterRedeliverRunCount: number | null;
  readonly dedupProven: boolean;
  readonly eventId: string | null;
  readonly workflowId: string | null;
  readonly cleaned: boolean;
}

export async function runCalendlyWebhookSmoke(
  spec: CalendlySmokeTriggerSpec,
  deps: CalendlyWebhookSmokeDeps,
  opts: CalendlyWebhookSmokeOptions = {},
): Promise<CalendlyWebhookSmokeResult> {
  const ref: { workflowId: string | null; eventId: string | null } = {
    workflowId: null,
    eventId: null,
  };
  let result: CalendlyWebhookSmokeResult;
  try {
    result = await runCore(spec, deps, opts, ref);
  } catch (err) {
    result = base(spec, ref, { outcome: "fail", reason: (err as Error).message });
  } finally {
    // Cleanup ALWAYS runs and is NOT masked. No provider-side resource exists (no
    // real Calendly subscription was created) — only smoke-owned DB rows.
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
  spec: CalendlySmokeTriggerSpec,
  ref: { workflowId: string | null; eventId: string | null },
  over: Partial<CalendlyWebhookSmokeResult> & {
    outcome: CalendlyWebhookSmokeResult["outcome"];
  },
): CalendlyWebhookSmokeResult {
  return {
    reason: null,
    triggerLabel: `calendly:${spec.triggerType}`,
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
  spec: CalendlySmokeTriggerSpec,
  deps: CalendlyWebhookSmokeDeps,
  opts: CalendlyWebhookSmokeOptions,
  ref: { workflowId: string | null; eventId: string | null },
): Promise<CalendlyWebhookSmokeResult> {
  const identity = deps.mintIdentity();
  ref.eventId = expectedCalendlyEventId(spec, identity);

  // 1. Active smoke workflow watching this Calendly trigger.
  const workflow = buildCalendlySmokeWorkflow(spec);
  const { workflowId } = await deps.createActiveSmokeWorkflow(workflow);
  ref.workflowId = workflowId;

  // 2. DIRECT-SEED the trigger_resources row (post-activation shape; no Calendly API).
  const { seededEventType } = await deps.seedTriggerResource({
    workflowId,
    triggerNodeId: workflow.triggerNodeId,
    triggerType: spec.triggerType,
    subscriberUserId: identity.subscriberUserId,
    hookSecret: identity.hookSecret,
  });
  if (seededEventType !== spec.triggerType) {
    return base(spec, ref, {
      outcome: "fail",
      reason: `seeded trigger_resources event_type '${seededEventType ?? "null"}', expected '${spec.triggerType}'`,
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
  const body = buildSyntheticInviteeBody(spec, identity);
  const { httpStatus } = await deps.deliverSyntheticEvent({
    body,
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
  let afterRuns: readonly CalendlyWebhookSmokeRun[] = [];
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
  if (!calendlyIdentityMatches(spec, fired, identity)) {
    return base(spec, ref, {
      outcome: "fail",
      reason: `fired run did not identify the synthetic calendly:${spec.triggerType} (eventId=${fired.eventId ?? "null"}, eventType=${fired.eventType ?? "null"})`,
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
    body,
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
