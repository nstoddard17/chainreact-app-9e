/**
 * Trigger-smoke harness — Slack WEBHOOK trigger dispatch path (Lane C beachhead).
 *
 * The first synthetic-webhook-receipt smoke. Certifies the full real receipt path
 * for ONE low-risk, non-message, non-PII Slack lifecycle webhook:
 *
 *   slack:channel_created  (canonical eventType `slack.channel_created`)
 *
 * WHY this trigger (Lane C candidate selection, see the readiness checkpoint §13):
 *   - already registered (ALL_TRIGGER_META) + has a real receive/normalize/dispatch
 *     path (app/api/webhooks/slack → integrations/slack/webhooks/{receive,normalize}
 *     → services/triggers/dispatch),
 *   - drivable with a fully synthetic provider-shaped event_callback payload
 *     (the event IS the channel creation; no follow-up provider fetch in normalize),
 *   - requires NO real provider mutation (no channel is actually created),
 *   - does NOT send / broadcast / publish (the wired action is a native no-op),
 *   - exposes NO raw bytes / message body — channel METADATA only, and every value
 *     in the synthetic payload is minted by the smoke (no user content, no PII),
 *   - routes to a smoke-owned workflow + trigger_resources row,
 *   - carries a deterministic Slack `event_id` → dedup is provable.
 *
 * The REAL receipt path is exercised end-to-end:
 *   create active smoke workflow (slack:channel_created trigger → native no-op) →
 *   ARM via the real `registerWorkflowTriggers` (Slack needs no provider-side
 *   subscription — registration is a pure trigger_resources upsert; no integration
 *   required) → assert the row's event_type is the canonical dispatch key
 *   `slack.channel_created` → BASELINE: no event delivered yet ⇒ 0 runs →
 *   build a synthetic signed `event_callback` and POST it to the REAL route
 *   `POST /api/webhooks/slack` (real HMAC verify → real normalize → real
 *   `dispatchTriggerEvent` → dedup → enqueue) → exactly ONE durable 'queued' run
 *   whose `trigger_event` identifies the synthetic event (eventId + channel id +
 *   channel-name marker) → drain via the real durable-queue processor → terminal
 *   'succeeded' → RE-SEND the SAME event_id → dedup keeps it at exactly ONE run →
 *   soft-delete the workflow + trigger_resources + the synthetic dedup row → 0 leaked.
 *
 * Signature handling: the synthetic request is signed with the REAL
 * `SLACK_SIGNING_SECRET` (the smoke env legitimately holds it) using Slack's
 * documented `v0:${ts}:${rawBody}` HMAC-SHA256 contract, so production verification
 * runs UNCHANGED and UNWEAKENED — only the payload contents are synthetic.
 *
 * Every DB / route / dispatch touchpoint is behind injected `SlackWebhookSmokeDeps`
 * so this orchestrator is fully unit-testable with fakes; real wiring lives in
 * slackWebhookSmokeDeps.ts and only runs in the gated dev integration test.
 */
import {
  WorkflowDefinitionSchema,
  type WorkflowDefinition,
} from "@/contracts/workflowDefinition";

export const SLACK_WEBHOOK_SMOKE_TRIGGER_NODE_ID = "smoke-slack-webhook-trigger";
export const SLACK_WEBHOOK_SMOKE_ACTION_NODE_ID = "smoke-noop-action";

/**
 * Canonical dispatch event type for slack:channel_created. The workflow trigger
 * node carries the FULL canonical eventType (what `normalize.ts` emits and what
 * `lifecycle.ts` stores in trigger_resources.event_type and the dispatcher queries
 * on lookup) — mirrors the committed Slack e2e walkthrough which builds its trigger
 * node with `type: "slack.message.channel"`.
 */
export const SLACK_CHANNEL_CREATED_EVENT_TYPE = "slack.channel_created";

export interface SlackWebhookSmokeWorkflow {
  readonly definition: WorkflowDefinition;
  readonly triggerNodeId: string;
  readonly actionNodeId: string;
  readonly name: string;
}

/** Build the smoke workflow: slack:channel_created webhook trigger → native no-op. */
export function buildSlackChannelCreatedSmokeWorkflow(): SlackWebhookSmokeWorkflow {
  const definition = WorkflowDefinitionSchema.parse({
    nodes: [
      {
        id: SLACK_WEBHOOK_SMOKE_TRIGGER_NODE_ID,
        kind: "trigger",
        provider: "slack",
        type: SLACK_CHANNEL_CREATED_EVENT_TYPE,
        // channel_created filter takes an empty config (match-all); narrowing by
        // name/privacy is a downstream guard concern, not part of this trigger.
        config: {},
        position: { x: 0, y: 0 },
      },
      {
        id: SLACK_WEBHOOK_SMOKE_ACTION_NODE_ID,
        kind: "action",
        provider: "native",
        // Unary is_falsy on a truthy literal with onFalse:"skip" → evaluates false →
        // engine takes the NULL branch → terminal 'succeeded', zero external effect.
        // (Same proven no-op the scheduled / OneNote smokes wire.)
        type: "if_then_condition",
        config: { input: "smoke", operator: "is_falsy", onFalse: "skip" },
        position: { x: 0, y: 160 },
      },
    ],
    edges: [
      {
        id: "smoke-slack-webhook-edge",
        from: SLACK_WEBHOOK_SMOKE_TRIGGER_NODE_ID,
        to: SLACK_WEBHOOK_SMOKE_ACTION_NODE_ID,
      },
    ],
  });
  return {
    definition,
    triggerNodeId: SLACK_WEBHOOK_SMOKE_TRIGGER_NODE_ID,
    actionNodeId: SLACK_WEBHOOK_SMOKE_ACTION_NODE_ID,
    name: "trigger-smoke:slack:channel_created",
  };
}

/** Synthetic Slack event identity — fully smoke-minted, no user content / PII. */
export interface SlackWebhookSmokeIdentity {
  /** Slack Events API `event_id` — deterministic dedup key. */
  readonly eventId: string;
  /** Synthetic public-channel id (C-prefixed). */
  readonly channelId: string;
  /** Synthetic channel name — carries the unique run marker. */
  readonly channelName: string;
  /** Synthetic Slack workspace (team) id. */
  readonly teamId: string;
}

export interface SlackWebhookSmokeRun {
  readonly runId: string;
  readonly status: "succeeded" | "failed" | "running" | "queued" | null;
  /** The run's persisted trigger event payload (Slack inner `event` object). */
  readonly triggerPayload: Readonly<Record<string, unknown>> | null;
  /** The run's persisted TriggerEvent.eventId. */
  readonly eventId: string | null;
  /** The run's persisted TriggerEvent.eventType. */
  readonly eventType: string | null;
}

export interface SlackWebhookSmokeDeps {
  /** Mint a fresh, unique synthetic identity (unique event_id per run for dedup). */
  mintIdentity(): SlackWebhookSmokeIdentity;
  createActiveSmokeWorkflow(
    workflow: SlackWebhookSmokeWorkflow,
  ): Promise<{ workflowId: string }>;
  /**
   * Arm via the REAL lifecycle (`registerWorkflowTriggers`) — Slack registration is
   * a pure trigger_resources upsert (no provider-side subscription, no integration
   * required). Returns the stored event_type so the smoke proves it equals the
   * canonical dispatch key.
   */
  armWebhookTrigger(input: {
    workflowId: string;
    triggerNodeId: string;
  }): Promise<{ registeredEventType: string | null }>;
  /**
   * Build a synthetic signed `event_callback` for this identity and POST it through
   * the REAL `POST /api/webhooks/slack` route (real HMAC verify → normalize →
   * dispatch). Returns the route's HTTP status.
   */
  deliverSyntheticEvent(input: {
    identity: SlackWebhookSmokeIdentity;
  }): Promise<{ httpStatus: number }>;
  listRuns(workflowId: string): Promise<readonly SlackWebhookSmokeRun[]>;
  drainRun(runId: string): Promise<void>;
  readRun(runId: string): Promise<SlackWebhookSmokeRun | null>;
  /** Soft-delete the smoke workflow + unregister its trigger_resources row. */
  cleanupWorkflow(workflowId: string): Promise<void>;
  /** Delete the synthetic dedup row (provider=slack, event_id) — hygiene. */
  cleanupDedup(eventId: string): Promise<void>;
  sleep(ms: number): Promise<void>;
}

/** Does the fired run's persisted trigger event identify the synthetic event? */
function identityMatches(
  run: SlackWebhookSmokeRun,
  identity: SlackWebhookSmokeIdentity,
): boolean {
  if (run.eventId !== identity.eventId) return false;
  if (run.eventType !== SLACK_CHANNEL_CREATED_EVENT_TYPE) return false;
  const payload = run.triggerPayload;
  if (!payload) return false;
  if (payload.type !== "channel_created") return false;
  const channel = payload.channel as Record<string, unknown> | undefined;
  if (!channel || typeof channel !== "object") return false;
  return (
    channel.id === identity.channelId &&
    typeof channel.name === "string" &&
    channel.name.includes(identity.channelName)
  );
}

export interface SlackWebhookSmokeOptions {
  /** Bounded re-list attempts after delivery (DB read settle). Default 5. */
  readonly afterDeliverAttempts?: number;
  /** Sleep between re-list attempts (ms). Default 200. */
  readonly afterDeliverSleepMs?: number;
  /** Settle window before asserting dedup held no second run (ms). Default 500. */
  readonly dedupSettleMs?: number;
}

export interface SlackWebhookSmokeResult {
  readonly outcome: "pass" | "fail" | "skip";
  readonly reason: string | null;
  readonly triggerLabel: string;
  readonly registeredEventType: string | null;
  readonly baselineRunCount: number;
  readonly deliverHttpStatus: number | null;
  readonly afterRunCount: number;
  readonly identityMatched: boolean;
  readonly terminalStatus: SlackWebhookSmokeRun["status"] | null;
  /** Run count after re-sending the SAME event_id (dedup proof: stays 1). */
  readonly afterRedeliverRunCount: number | null;
  readonly dedupProven: boolean;
  readonly eventId: string | null;
  readonly workflowId: string | null;
  readonly cleaned: boolean;
}

const LABEL = "slack:channel_created";

export async function runSlackWebhookSmoke(
  deps: SlackWebhookSmokeDeps,
  opts: SlackWebhookSmokeOptions = {},
): Promise<SlackWebhookSmokeResult> {
  const ref: { workflowId: string | null; eventId: string | null } = {
    workflowId: null,
    eventId: null,
  };
  let result: SlackWebhookSmokeResult;
  try {
    result = await runCore(deps, opts, ref);
  } catch (err) {
    result = base(ref, { outcome: "fail", reason: (err as Error).message });
  } finally {
    // Cleanup ALWAYS runs and is NOT masked. A cleanup failure flips `cleaned`
    // to false but never the verdict. No provider-side resource exists — only
    // smoke-owned DB rows (workflow, trigger_resources, runs, dedup row).
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
  over: Partial<SlackWebhookSmokeResult> & { outcome: SlackWebhookSmokeResult["outcome"] },
): SlackWebhookSmokeResult {
  return {
    reason: null,
    triggerLabel: LABEL,
    registeredEventType: null,
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
  deps: SlackWebhookSmokeDeps,
  opts: SlackWebhookSmokeOptions,
  ref: { workflowId: string | null; eventId: string | null },
): Promise<SlackWebhookSmokeResult> {
  const identity = deps.mintIdentity();
  ref.eventId = identity.eventId;

  // 1. Active smoke workflow watching slack:channel_created.
  const workflow = buildSlackChannelCreatedSmokeWorkflow();
  const { workflowId } = await deps.createActiveSmokeWorkflow(workflow);
  ref.workflowId = workflowId;

  // 2. Arm via the real lifecycle → trigger_resources upsert. Prove the stored
  //    event_type is the canonical dispatch key (else dispatch could never match).
  const { registeredEventType } = await deps.armWebhookTrigger({
    workflowId,
    triggerNodeId: workflow.triggerNodeId,
  });
  if (registeredEventType !== SLACK_CHANNEL_CREATED_EVENT_TYPE) {
    return base(ref, {
      outcome: "fail",
      reason: `trigger_resources stored event_type '${registeredEventType ?? "null"}', expected '${SLACK_CHANNEL_CREATED_EVENT_TYPE}'`,
      registeredEventType,
    });
  }

  // 3. BASELINE — no event delivered yet ⇒ no runs.
  const baselineRuns = await deps.listRuns(workflowId);
  if (baselineRuns.length !== 0) {
    return base(ref, {
      outcome: "fail",
      reason: `baseline violation: ${baselineRuns.length} run(s) before any event delivery`,
      registeredEventType,
      baselineRunCount: baselineRuns.length,
    });
  }

  // 4. Deliver the synthetic signed event through the REAL receive route.
  const { httpStatus } = await deps.deliverSyntheticEvent({ identity });
  if (httpStatus !== 200) {
    return base(ref, {
      outcome: "fail",
      reason: `webhook route returned HTTP ${httpStatus}, expected 200`,
      registeredEventType,
      deliverHttpStatus: httpStatus,
    });
  }

  // 5. Exactly one run, bounded re-list for DB read settle.
  const attempts = Math.max(1, opts.afterDeliverAttempts ?? 5);
  const sleepMs = Math.max(0, opts.afterDeliverSleepMs ?? 200);
  let afterRuns: readonly SlackWebhookSmokeRun[] = [];
  for (let i = 0; i < attempts; i += 1) {
    afterRuns = await deps.listRuns(workflowId);
    if (afterRuns.length >= 1) break;
    if (i < attempts - 1 && sleepMs > 0) await deps.sleep(sleepMs);
  }
  if (afterRuns.length !== 1) {
    return base(ref, {
      outcome: "fail",
      reason: `expected exactly 1 run after delivery, got ${afterRuns.length}`,
      registeredEventType,
      deliverHttpStatus: httpStatus,
      afterRunCount: afterRuns.length,
    });
  }

  // 6. The fired run must identify the synthetic event (eventId + channel + marker).
  const fired = afterRuns[0]!;
  if (!identityMatches(fired, identity)) {
    return base(ref, {
      outcome: "fail",
      reason: `fired run did not identify the synthetic event (eventId=${fired.eventId ?? "null"}, eventType=${fired.eventType ?? "null"})`,
      registeredEventType,
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
      registeredEventType,
      deliverHttpStatus: httpStatus,
      afterRunCount: 1,
      identityMatched: true,
      terminalStatus,
    });
  }

  // 8. DEDUP — re-send the SAME event_id; dispatcher must drop it (stays 1 run).
  const redeliver = await deps.deliverSyntheticEvent({ identity });
  if (redeliver.httpStatus !== 200) {
    return base(ref, {
      outcome: "fail",
      reason: `redeliver returned HTTP ${redeliver.httpStatus}, expected 200`,
      registeredEventType,
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
      reason: `dedup failed: ${afterRedeliver.length} run(s) after re-sending the same event_id (expected 1)`,
      registeredEventType,
      deliverHttpStatus: httpStatus,
      afterRunCount: 1,
      identityMatched: true,
      terminalStatus,
      afterRedeliverRunCount: afterRedeliver.length,
    });
  }

  return base(ref, {
    outcome: "pass",
    registeredEventType,
    deliverHttpStatus: httpStatus,
    afterRunCount: 1,
    identityMatched: true,
    terminalStatus: "succeeded",
    afterRedeliverRunCount: afterRedeliver.length,
    dedupProven: true,
  });
}
