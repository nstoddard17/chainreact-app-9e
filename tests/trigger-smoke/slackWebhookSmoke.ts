/**
 * Trigger-smoke harness — Slack WEBHOOK trigger dispatch path (Lane C).
 *
 * Spec-driven synthetic-webhook-receipt smoke. Certifies the full real receipt
 * path for low-risk, non-message, non-PII Slack lifecycle/metadata webhooks:
 *
 *   slack:channel_created       (canonical eventType `slack.channel_created`)
 *   slack:file_shared           (canonical eventType `slack.file_shared`)
 *   slack:member_joined_channel (canonical eventType `slack.member_joined_channel`)
 *   slack:member_left_channel   (canonical eventType `slack.member_left_channel`)
 *   slack:reaction_added        (canonical eventType `slack.reaction_added`)
 *   slack:reaction_removed      (canonical eventType `slack.reaction_removed`)
 *
 * The member_* events carry ONLY channel + user id stubs; the reaction_* events
 * carry a standard emoji NAME + a message-item reference (channel + ts) with NO
 * message body/text. Every value is smoke-minted (no user content, no PII, no real
 * channel / user / message). Slack's `message.*` triggers carry message TEXT and are
 * deliberately OUT of this metadata scope (see the readiness checkpoint).
 *
 * WHY these triggers (Lane C candidate selection, see the readiness checkpoint
 * §13/§14):
 *   - already registered (ALL_TRIGGER_META) + a real receive/normalize/dispatch
 *     path (app/api/webhooks/slack → integrations/slack/webhooks/{receive,normalize}
 *     → services/triggers/dispatch),
 *   - drivable with a fully synthetic provider-shaped event_callback payload (the
 *     event IS the lifecycle fact; `normalize.ts` passes the inner event through
 *     verbatim — NO follow-up provider fetch),
 *   - require NO real provider mutation (no channel created, no file shared),
 *   - do NOT send / broadcast / publish (the wired action is a native no-op),
 *   - expose NO raw bytes / message body — `channel_created` is channel METADATA,
 *     `file_shared` carries ONLY id stubs (file_id / user_id / channel_id, no name /
 *     mimeType / size / url / bytes / FileRef). Every value is smoke-minted (no user
 *     content, no PII, no real channel / file / user),
 *   - route to a smoke-owned workflow + trigger_resources row,
 *   - carry a deterministic Slack `event_id` → dedup is provable.
 *
 * The REAL receipt path is exercised end-to-end per spec:
 *   create active smoke workflow (slack trigger → native no-op) → ARM via the real
 *   `registerWorkflowTriggers` (Slack needs no provider-side subscription —
 *   registration is a pure trigger_resources upsert; no integration required) →
 *   assert the row's event_type is the canonical dispatch key → BASELINE: no event
 *   delivered yet ⇒ 0 runs → build a synthetic signed `event_callback` (the spec
 *   supplies the inner event) and POST it to the REAL route `POST /api/webhooks/slack`
 *   (real HMAC verify → real normalize → real `dispatchTriggerEvent` → dedup →
 *   enqueue) → exactly ONE durable 'queued' run whose `trigger_event` identifies the
 *   synthetic event → drain via the real durable-queue processor → terminal
 *   'succeeded' → RE-SEND the SAME event_id → dedup keeps it at exactly ONE run →
 *   soft-delete the workflow + trigger_resources + the synthetic dedup row → 0 leaked.
 *
 * Signature handling: the synthetic request is signed with the REAL
 * `SLACK_SIGNING_SECRET` (the smoke env legitimately holds it) using Slack's
 * documented `v0:${ts}:${rawBody}` HMAC-SHA256 contract, so production verification
 * runs UNCHANGED and UNWEAKENED — only the payload contents are synthetic.
 *
 * Single pattern: `runSlackWebhookSmoke(deps, spec, opts)` runs the shared flow; a
 * `SlackWebhookTriggerSpec` plugs in the canonical eventType, the workflow builder,
 * the synthetic inner-event shape, and the identity matcher. The deps own the
 * envelope + signing + real-route POST (shared); the spec owns the inner-event shape
 * (per trigger). Every DB / route / dispatch touchpoint is behind injected
 * `SlackWebhookSmokeDeps` so this orchestrator is fully unit-testable with fakes;
 * real wiring lives in slackWebhookSmokeDeps.ts and only runs in the gated test.
 */
import {
  WorkflowDefinitionSchema,
  type WorkflowDefinition,
} from "@/contracts/workflowDefinition";

export const SLACK_WEBHOOK_SMOKE_TRIGGER_NODE_ID = "smoke-slack-webhook-trigger";
export const SLACK_WEBHOOK_SMOKE_ACTION_NODE_ID = "smoke-noop-action";

/**
 * Canonical dispatch event types. The workflow trigger node carries the FULL
 * canonical eventType (what `normalize.ts` emits and what `lifecycle.ts` stores in
 * trigger_resources.event_type and the dispatcher queries on lookup) — mirrors the
 * committed Slack e2e walkthrough which builds its trigger node with
 * `type: "slack.message.channel"`.
 */
export const SLACK_CHANNEL_CREATED_EVENT_TYPE = "slack.channel_created";
export const SLACK_FILE_SHARED_EVENT_TYPE = "slack.file_shared";
export const SLACK_MEMBER_JOINED_CHANNEL_EVENT_TYPE = "slack.member_joined_channel";
export const SLACK_MEMBER_LEFT_CHANNEL_EVENT_TYPE = "slack.member_left_channel";
export const SLACK_REACTION_ADDED_EVENT_TYPE = "slack.reaction_added";
export const SLACK_REACTION_REMOVED_EVENT_TYPE = "slack.reaction_removed";

export interface SlackWebhookSmokeWorkflow {
  readonly definition: WorkflowDefinition;
  readonly triggerNodeId: string;
  readonly actionNodeId: string;
  readonly name: string;
}

/** Build a smoke workflow: one Slack webhook trigger (canonical type) → native no-op. */
export function buildSlackWebhookSmokeWorkflow(
  canonicalEventType: string,
  label: string,
): SlackWebhookSmokeWorkflow {
  const definition = WorkflowDefinitionSchema.parse({
    nodes: [
      {
        id: SLACK_WEBHOOK_SMOKE_TRIGGER_NODE_ID,
        kind: "trigger",
        provider: "slack",
        type: canonicalEventType,
        // Slack lifecycle filters take an empty / optional config (match-all);
        // narrowing by channel/name is a downstream guard concern.
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
    name: `trigger-smoke:${label}`,
  };
}

/**
 * Synthetic Slack event identity — fully smoke-minted, no user content / PII. Carries
 * the superset of fields the registered specs reference; each spec reads only what
 * its inner-event shape needs.
 */
export interface SlackWebhookSmokeIdentity {
  /** Slack Events API `event_id` — deterministic dedup key. */
  readonly eventId: string;
  /** Synthetic Slack workspace (team) id. */
  readonly teamId: string;
  /** Synthetic channel id (C-prefixed). */
  readonly channelId: string;
  /** Synthetic channel name — carries the run marker (channel_created). */
  readonly channelName: string;
  /** Synthetic file id — carries the run marker (file_shared). */
  readonly fileId: string;
  /** Synthetic user id (the would-be sharer; never a real Slack user). */
  readonly userId: string;
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

/**
 * Per-trigger plug-in: canonical eventType + workflow builder + synthetic inner-event
 * shape + identity matcher. Pure — no I/O. The deps wrap the inner event in the
 * event_callback envelope, sign it, and POST it through the real route.
 */
export interface SlackWebhookTriggerSpec {
  readonly label: string;
  readonly eventType: string;
  buildWorkflow(): SlackWebhookSmokeWorkflow;
  /** The Slack inner `event` object for this trigger (smoke-minted, metadata only). */
  buildSyntheticInnerEvent(identity: SlackWebhookSmokeIdentity): Record<string, unknown>;
  /** Does the fired run's persisted trigger event identify the synthetic event? */
  identityMatches(run: SlackWebhookSmokeRun, identity: SlackWebhookSmokeIdentity): boolean;
}

const SYNTHETIC_EVENT_TS = "1700000000.000000";

export const CHANNEL_CREATED_SPEC: SlackWebhookTriggerSpec = {
  label: "slack:channel_created",
  eventType: SLACK_CHANNEL_CREATED_EVENT_TYPE,
  buildWorkflow: () =>
    buildSlackWebhookSmokeWorkflow(SLACK_CHANNEL_CREATED_EVENT_TYPE, "slack:channel_created"),
  buildSyntheticInnerEvent: (identity) => ({
    type: "channel_created",
    channel: {
      id: identity.channelId,
      name: identity.channelName,
      created: 1700000000,
      // Synthetic creator — not a real Slack user; no PII.
      creator: identity.userId,
      is_channel: true,
      is_private: false,
    },
    event_ts: SYNTHETIC_EVENT_TS,
  }),
  identityMatches: (run, identity) => {
    if (run.eventId !== identity.eventId) return false;
    if (run.eventType !== SLACK_CHANNEL_CREATED_EVENT_TYPE) return false;
    const payload = run.triggerPayload;
    if (!payload || payload.type !== "channel_created") return false;
    const channel = payload.channel as Record<string, unknown> | undefined;
    if (!channel || typeof channel !== "object") return false;
    return (
      channel.id === identity.channelId &&
      typeof channel.name === "string" &&
      channel.name.includes(identity.channelName)
    );
  },
};

export const FILE_SHARED_SPEC: SlackWebhookTriggerSpec = {
  label: "slack:file_shared",
  eventType: SLACK_FILE_SHARED_EVENT_TYPE,
  buildWorkflow: () =>
    buildSlackWebhookSmokeWorkflow(SLACK_FILE_SHARED_EVENT_TYPE, "slack:file_shared"),
  // Slack's file_shared payload carries ONLY id stubs (snake_case `_id` fields +
  // a partial `file: { id }` stub) — no name / mimeType / size / url / bytes.
  buildSyntheticInnerEvent: (identity) => ({
    type: "file_shared",
    file_id: identity.fileId,
    user_id: identity.userId,
    channel_id: identity.channelId,
    file: { id: identity.fileId },
    event_ts: SYNTHETIC_EVENT_TS,
  }),
  identityMatches: (run, identity) => {
    if (run.eventId !== identity.eventId) return false;
    if (run.eventType !== SLACK_FILE_SHARED_EVENT_TYPE) return false;
    const payload = run.triggerPayload;
    if (!payload || payload.type !== "file_shared") return false;
    // Identity = the synthetic file id (carries the marker) + channel id, verbatim
    // from the inner event the normalizer passes through. No name / bytes asserted.
    return payload.file_id === identity.fileId && payload.channel_id === identity.channelId;
  },
};

/** Standard, safe emoji name for the synthetic reaction events (metadata only). */
const SYNTHETIC_REACTION = "white_check_mark";
/** Synthetic reacted-to message reference — a ts only, NO message body/text. */
const SYNTHETIC_ITEM_TS = "1700000000.000100";

export const MEMBER_JOINED_CHANNEL_SPEC: SlackWebhookTriggerSpec = {
  label: "slack:member_joined_channel",
  eventType: SLACK_MEMBER_JOINED_CHANNEL_EVENT_TYPE,
  buildWorkflow: () =>
    buildSlackWebhookSmokeWorkflow(SLACK_MEMBER_JOINED_CHANNEL_EVENT_TYPE, "slack:member_joined_channel"),
  // Membership metadata only — channel + user id stubs (+ the would-be inviter).
  buildSyntheticInnerEvent: (identity) => ({
    type: "member_joined_channel",
    user: identity.userId,
    channel: identity.channelId,
    channel_type: "C",
    team: identity.teamId,
    inviter: identity.userId,
    event_ts: SYNTHETIC_EVENT_TS,
  }),
  identityMatches: (run, identity) => {
    if (run.eventId !== identity.eventId) return false;
    if (run.eventType !== SLACK_MEMBER_JOINED_CHANNEL_EVENT_TYPE) return false;
    const payload = run.triggerPayload;
    if (!payload || payload.type !== "member_joined_channel") return false;
    return payload.channel === identity.channelId && payload.user === identity.userId;
  },
};

export const MEMBER_LEFT_CHANNEL_SPEC: SlackWebhookTriggerSpec = {
  label: "slack:member_left_channel",
  eventType: SLACK_MEMBER_LEFT_CHANNEL_EVENT_TYPE,
  buildWorkflow: () =>
    buildSlackWebhookSmokeWorkflow(SLACK_MEMBER_LEFT_CHANNEL_EVENT_TYPE, "slack:member_left_channel"),
  buildSyntheticInnerEvent: (identity) => ({
    type: "member_left_channel",
    user: identity.userId,
    channel: identity.channelId,
    channel_type: "C",
    team: identity.teamId,
    event_ts: SYNTHETIC_EVENT_TS,
  }),
  identityMatches: (run, identity) => {
    if (run.eventId !== identity.eventId) return false;
    if (run.eventType !== SLACK_MEMBER_LEFT_CHANNEL_EVENT_TYPE) return false;
    const payload = run.triggerPayload;
    if (!payload || payload.type !== "member_left_channel") return false;
    return payload.channel === identity.channelId && payload.user === identity.userId;
  },
};

export const REACTION_ADDED_SPEC: SlackWebhookTriggerSpec = {
  label: "slack:reaction_added",
  eventType: SLACK_REACTION_ADDED_EVENT_TYPE,
  buildWorkflow: () =>
    buildSlackWebhookSmokeWorkflow(SLACK_REACTION_ADDED_EVENT_TYPE, "slack:reaction_added"),
  // Reaction metadata only — a standard emoji NAME + a message-item reference
  // (channel + ts). NO message body/text is carried.
  buildSyntheticInnerEvent: (identity) => ({
    type: "reaction_added",
    user: identity.userId,
    reaction: SYNTHETIC_REACTION,
    item_user: identity.userId,
    item: { type: "message", channel: identity.channelId, ts: SYNTHETIC_ITEM_TS },
    event_ts: SYNTHETIC_EVENT_TS,
  }),
  identityMatches: (run, identity) => {
    if (run.eventId !== identity.eventId) return false;
    if (run.eventType !== SLACK_REACTION_ADDED_EVENT_TYPE) return false;
    const payload = run.triggerPayload;
    if (!payload || payload.type !== "reaction_added") return false;
    if (payload.reaction !== SYNTHETIC_REACTION) return false;
    const item = payload.item as Record<string, unknown> | undefined;
    return Boolean(item) && item!.channel === identity.channelId;
  },
};

export const REACTION_REMOVED_SPEC: SlackWebhookTriggerSpec = {
  label: "slack:reaction_removed",
  eventType: SLACK_REACTION_REMOVED_EVENT_TYPE,
  buildWorkflow: () =>
    buildSlackWebhookSmokeWorkflow(SLACK_REACTION_REMOVED_EVENT_TYPE, "slack:reaction_removed"),
  buildSyntheticInnerEvent: (identity) => ({
    type: "reaction_removed",
    user: identity.userId,
    reaction: SYNTHETIC_REACTION,
    item_user: identity.userId,
    item: { type: "message", channel: identity.channelId, ts: SYNTHETIC_ITEM_TS },
    event_ts: SYNTHETIC_EVENT_TS,
  }),
  identityMatches: (run, identity) => {
    if (run.eventId !== identity.eventId) return false;
    if (run.eventType !== SLACK_REACTION_REMOVED_EVENT_TYPE) return false;
    const payload = run.triggerPayload;
    if (!payload || payload.type !== "reaction_removed") return false;
    if (payload.reaction !== SYNTHETIC_REACTION) return false;
    const item = payload.item as Record<string, unknown> | undefined;
    return Boolean(item) && item!.channel === identity.channelId;
  },
};

export const ALL_SLACK_WEBHOOK_SPECS: readonly SlackWebhookTriggerSpec[] = [
  CHANNEL_CREATED_SPEC,
  FILE_SHARED_SPEC,
  MEMBER_JOINED_CHANNEL_SPEC,
  MEMBER_LEFT_CHANNEL_SPEC,
  REACTION_ADDED_SPEC,
  REACTION_REMOVED_SPEC,
];

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
    workflow: SlackWebhookSmokeWorkflow;
    workflowId: string;
    triggerNodeId: string;
  }): Promise<{ registeredEventType: string | null }>;
  /**
   * Wrap the spec's inner event in a synthetic `event_callback`, sign it with the
   * REAL `SLACK_SIGNING_SECRET` (Slack's `v0:${ts}:${rawBody}` HMAC contract), and
   * POST it through the REAL `POST /api/webhooks/slack` route (real HMAC verify →
   * normalize → dispatch). Returns the route's HTTP status.
   */
  deliverSyntheticEvent(input: {
    identity: SlackWebhookSmokeIdentity;
    innerEvent: Record<string, unknown>;
  }): Promise<{ httpStatus: number }>;
  listRuns(workflowId: string): Promise<readonly SlackWebhookSmokeRun[]>;
  drainRun(runId: string): Promise<void>;
  readRun(runId: string): Promise<SlackWebhookSmokeRun | null>;
  /** Soft-delete the smoke workflow + unregister its trigger_resources row. */
  cleanupWorkflow(workflow: SlackWebhookSmokeWorkflow, workflowId: string): Promise<void>;
  /** Delete the synthetic dedup row (provider=slack, event_id) — hygiene. */
  cleanupDedup(eventId: string): Promise<void>;
  sleep(ms: number): Promise<void>;
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

export async function runSlackWebhookSmoke(
  deps: SlackWebhookSmokeDeps,
  spec: SlackWebhookTriggerSpec,
  opts: SlackWebhookSmokeOptions = {},
): Promise<SlackWebhookSmokeResult> {
  const ref: {
    workflow: SlackWebhookSmokeWorkflow | null;
    workflowId: string | null;
    eventId: string | null;
  } = { workflow: null, workflowId: null, eventId: null };
  let result: SlackWebhookSmokeResult;
  try {
    result = await runCore(deps, spec, opts, ref);
  } catch (err) {
    result = base(spec, ref, { outcome: "fail", reason: (err as Error).message });
  } finally {
    // Cleanup ALWAYS runs and is NOT masked. A cleanup failure flips `cleaned`
    // to false but never the verdict. No provider-side resource exists — only
    // smoke-owned DB rows (workflow, trigger_resources, runs, dedup row).
    let cleaned = true;
    if (ref.workflow && ref.workflowId) {
      cleaned =
        (await deps
          .cleanupWorkflow(ref.workflow, ref.workflowId)
          .then(() => true)
          .catch(() => false)) && cleaned;
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
  spec: SlackWebhookTriggerSpec,
  ref: { workflowId: string | null; eventId: string | null },
  over: Partial<SlackWebhookSmokeResult> & { outcome: SlackWebhookSmokeResult["outcome"] },
): SlackWebhookSmokeResult {
  return {
    reason: null,
    triggerLabel: spec.label,
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
  spec: SlackWebhookTriggerSpec,
  opts: SlackWebhookSmokeOptions,
  ref: {
    workflow: SlackWebhookSmokeWorkflow | null;
    workflowId: string | null;
    eventId: string | null;
  },
): Promise<SlackWebhookSmokeResult> {
  const identity = deps.mintIdentity();
  ref.eventId = identity.eventId;

  // 1. Active smoke workflow watching this Slack trigger.
  const workflow = spec.buildWorkflow();
  ref.workflow = workflow;
  const { workflowId } = await deps.createActiveSmokeWorkflow(workflow);
  ref.workflowId = workflowId;

  // 2. Arm via the real lifecycle → trigger_resources upsert. Prove the stored
  //    event_type is the canonical dispatch key (else dispatch could never match).
  const { registeredEventType } = await deps.armWebhookTrigger({
    workflow,
    workflowId,
    triggerNodeId: workflow.triggerNodeId,
  });
  if (registeredEventType !== spec.eventType) {
    return base(spec, ref, {
      outcome: "fail",
      reason: `trigger_resources stored event_type '${registeredEventType ?? "null"}', expected '${spec.eventType}'`,
      registeredEventType,
    });
  }

  // 3. BASELINE — no event delivered yet ⇒ no runs.
  const baselineRuns = await deps.listRuns(workflowId);
  if (baselineRuns.length !== 0) {
    return base(spec, ref, {
      outcome: "fail",
      reason: `baseline violation: ${baselineRuns.length} run(s) before any event delivery`,
      registeredEventType,
      baselineRunCount: baselineRuns.length,
    });
  }

  // 4. Deliver the synthetic signed event through the REAL receive route.
  const innerEvent = spec.buildSyntheticInnerEvent(identity);
  const { httpStatus } = await deps.deliverSyntheticEvent({ identity, innerEvent });
  if (httpStatus !== 200) {
    return base(spec, ref, {
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
    return base(spec, ref, {
      outcome: "fail",
      reason: `expected exactly 1 run after delivery, got ${afterRuns.length}`,
      registeredEventType,
      deliverHttpStatus: httpStatus,
      afterRunCount: afterRuns.length,
    });
  }

  // 6. The fired run must identify the synthetic event (eventId + spec fields).
  const fired = afterRuns[0]!;
  if (!spec.identityMatches(fired, identity)) {
    return base(spec, ref, {
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
    return base(spec, ref, {
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
  const redeliver = await deps.deliverSyntheticEvent({ identity, innerEvent });
  if (redeliver.httpStatus !== 200) {
    return base(spec, ref, {
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
    return base(spec, ref, {
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

  return base(spec, ref, {
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
