/**
 * Trigger-smoke harness — Gmail POLLING trigger dispatch path (Lane B).
 *
 * One spec-driven orchestrator covering the Gmail history-cursor polling family:
 *   - gmail:new_email          (change: self-send marked email; identity: subject marker)
 *   - gmail:new_labeled_email  (change: self-send + apply smoke label; identity: labelAppliedId + subject)
 *   - gmail:new_attachment     (change: self-send multipart w/ marked attachment; identity: attachment filename)
 *
 * All three poll Gmail's users.history.list from a per-trigger
 * `config.snapshot.historyId` cursor seeded by the REAL activation hook
 * (usersGetProfile → baseline historyId — the V1 "first poll miss" rule), then
 * hydrate each new message and enqueue through the handler's own enqueueRun.
 * Cross-tick dedup is `webhook_event_dedup` keyed (gmail, <prefix><messageId>)
 * with per-trigger prefixes ("" / "labeled:" / "attachment:") so the same
 * message can fire all three triggers independently.
 *
 * Seeding uses ONLY the action-certified Gmail self-send patterns (15/15
 * action-certified account): the certified send_email handler for plain seeds,
 * the certified create_label + add_label handlers for the label flow, and the
 * proven smoke multipart helper (stageGmailAttachmentMessage) for the
 * attachment seed. Every seed carries a run-unique `crsmoke-` marker — no
 * reliance on arbitrary mailbox history, and the marker subject filter on
 * new_email makes concurrent real mail unable to fire that spec.
 *
 * Each spec proves, in order:
 *   prepare (mint marker; labeled: create smoke label) → create active
 *   {gmail trigger → native no-op} workflow → ARM via the real
 *   registerWorkflowTriggers (activation seeds snapshot.historyId; assert
 *   non-null) → FIRST poll: pre-existing mailbox state fires NOTHING
 *   (baseline-first) → capture the post-baseline cursor → apply ONE marked
 *   change → bounded re-poll (history propagation lag) → exactly ONE run whose
 *   persisted trigger_event identifies the seed (eventType + per-trigger
 *   eventId + marker fields) → drain → terminal 'succeeded' →
 *   WATERMARK PROOF: poll again (cursor advanced past the change) → still 1 →
 *   DEDUP PROOF: REWIND snapshot.historyId to the pre-change cursor and poll —
 *   history re-surfaces the same message id, webhook_event_dedup drops it →
 *   still 1 → cleanup (trash seed message, delete smoke label, unregister
 *   trigger, soft-delete workflow, delete dedup row) → 0 leaked.
 *
 * WHY the per-trigger poll handler, not the global runPollingTriggers(): the
 * handler's poll() IS the real polling dispatch path (the same function the
 * cron's runOne invokes); the global shell would poll + fire every due polling
 * workflow across all accounts on the shared dev DB. Same scoping as the
 * certified Excel / OneNote polling smokes.
 *
 * Every DB / engine / provider touchpoint is behind injected
 * `GmailPollingSmokeDeps` so this orchestrator is fully unit-testable with
 * fakes; real wiring lives in gmailPollingSmokeDeps.ts and only runs in the
 * gated dev integration test.
 */
import {
  WorkflowDefinitionSchema,
  type WorkflowDefinition,
} from "@/contracts/workflowDefinition";

export const GMAIL_POLLING_SMOKE_TRIGGER_NODE_ID = "smoke-gmail-poll-trigger";
export const GMAIL_POLLING_SMOKE_ACTION_NODE_ID = "smoke-noop-action";

export interface GmailPollingSmokeWorkflow {
  readonly definition: WorkflowDefinition;
  readonly triggerNodeId: string;
  readonly actionNodeId: string;
  readonly name: string;
}

function buildPollingWorkflow(
  triggerType: string,
  triggerConfig: Record<string, unknown>,
  name: string,
): GmailPollingSmokeWorkflow {
  const definition = WorkflowDefinitionSchema.parse({
    nodes: [
      {
        id: GMAIL_POLLING_SMOKE_TRIGGER_NODE_ID,
        kind: "trigger",
        provider: "gmail",
        type: triggerType,
        config: triggerConfig,
        position: { x: 0, y: 0 },
      },
      {
        id: GMAIL_POLLING_SMOKE_ACTION_NODE_ID,
        kind: "action",
        provider: "native",
        // Unary is_falsy on a truthy literal with onFalse:"skip" → evaluates
        // false → NULL branch → terminal 'succeeded', zero external effect.
        type: "if_then_condition",
        config: { input: "smoke", operator: "is_falsy", onFalse: "skip" },
        position: { x: 0, y: 160 },
      },
    ],
    edges: [
      {
        id: "smoke-gmail-poll-edge",
        from: GMAIL_POLLING_SMOKE_TRIGGER_NODE_ID,
        to: GMAIL_POLLING_SMOKE_ACTION_NODE_ID,
      },
    ],
  });
  return {
    definition,
    triggerNodeId: GMAIL_POLLING_SMOKE_TRIGGER_NODE_ID,
    actionNodeId: GMAIL_POLLING_SMOKE_ACTION_NODE_ID,
    name,
  };
}

/** Per-run context: the minted marker (+ the smoke label for the labeled spec). */
export interface GmailPollingSmokeContext {
  readonly marker: string;
  readonly labelId?: string;
  readonly labelName?: string;
}

/** What applyChange produced: the seeded Gmail message + the identity to match. */
export interface GmailPollingChange {
  readonly messageId: string;
  /** Human-readable identity string for logs (subject marker / filename). */
  readonly identity: string;
}

export interface GmailPollingRun {
  readonly runId: string;
  readonly status: "succeeded" | "failed" | "running" | "queued" | null;
  readonly triggerPayload: Readonly<Record<string, unknown>> | null;
  /** The run's persisted TriggerEvent.eventId (per-trigger prefixed message id). */
  readonly eventId: string | null;
  readonly eventType: string | null;
}

/** Injected seams. Real wiring in gmailPollingSmokeDeps.ts; fakes in tests. */
export interface GmailPollingSmokeDeps {
  /** Mint a run-unique `crsmoke-` marker string. */
  mintMarker(kind: string): string;
  /** Create a smoke label (certified create_label). labeled spec only. */
  prepareLabel(marker: string): Promise<{ labelId: string; labelName: string }>;
  createActiveSmokeWorkflow(
    workflow: GmailPollingSmokeWorkflow,
  ): Promise<{ workflowId: string }>;
  /**
   * Arm via the REAL lifecycle (registerWorkflowTriggers → the Gmail
   * activation hook fetches the profile and seeds snapshot.historyId).
   * Returns the seeded cursor so the smoke proves the baseline was captured.
   */
  armPollingTrigger(input: {
    workflowId: string;
    triggerNodeId: string;
  }): Promise<{ snapshotHistoryId: string | null }>;
  /** REAL per-trigger Gmail poll handler scoped to this trigger. */
  poll(input: { workflowId: string; triggerNodeId: string }): Promise<void>;
  /** Read the trigger row's current snapshot.historyId cursor. */
  readSnapshotHistoryId(input: {
    workflowId: string;
    triggerNodeId: string;
  }): Promise<string | null>;
  /** REWIND the cursor (dedup proof: re-poll must re-surface, dedup must drop). */
  rewindSnapshot(input: {
    workflowId: string;
    triggerNodeId: string;
    historyId: string;
  }): Promise<void>;
  /** Self-send ONE marked plain email (certified send_email). Returns its id. */
  sendMarkedEmail(marker: string): Promise<{ messageId: string }>;
  /** Apply the smoke label to a message (certified add_label). */
  applyLabel(input: { messageId: string; labelId: string }): Promise<void>;
  /**
   * Self-send ONE multipart email carrying a single marked text attachment
   * (the proven smoke multipart helper). Returns the id + attachment filename.
   */
  sendMarkedAttachmentEmail(
    markerPrefix: string,
  ): Promise<{ messageId: string; fileName: string }>;
  listRuns(workflowId: string): Promise<readonly GmailPollingRun[]>;
  drainRun(runId: string): Promise<void>;
  readRun(runId: string): Promise<GmailPollingRun | null>;
  /** unregisterWorkflowTriggers + soft-delete the smoke workflow. */
  cleanupWorkflow(workflowId: string): Promise<void>;
  /** Trash the seeded smoke message. */
  trashMessage(messageId: string): Promise<void>;
  /** Delete the smoke label (labels.delete). labeled spec only. */
  deleteLabel(labelId: string): Promise<void>;
  /** Delete the synthetic dedup row (provider=gmail, prefixed event key). */
  cleanupDedup(eventKey: string): Promise<void>;
  sleep(ms: number): Promise<void>;
}

/** Per-trigger plug-in. Pure — no I/O outside the deps calls in applyChange. */
export interface GmailPollingTriggerSpec {
  readonly label: string;
  /** Canonical trigger_resources event_type (= meta type = dispatch key). */
  readonly eventType: string;
  /** Whether prepare must create a smoke label before the workflow is built. */
  readonly needsLabel: boolean;
  buildWorkflow(ctx: GmailPollingSmokeContext): GmailPollingSmokeWorkflow;
  /** Apply the ONE marked change via the injected deps. */
  applyChange(
    deps: GmailPollingSmokeDeps,
    ctx: GmailPollingSmokeContext,
  ): Promise<GmailPollingChange>;
  /** The webhook_event_dedup key this trigger writes for a message id. */
  dedupKey(messageId: string): string;
  /** Does the fired run's persisted trigger event identify OUR seed? */
  identityMatches(
    run: GmailPollingRun,
    ctx: GmailPollingSmokeContext,
    change: GmailPollingChange,
  ): boolean;
}

export const GMAIL_NEW_EMAIL_SPEC: GmailPollingTriggerSpec = {
  label: "gmail:new_email",
  eventType: "new_email",
  needsLabel: false,
  // Subject exact-match on the run-unique marker + NO label constraint
  // (labelIds: []) → deterministic: concurrent real mail cannot match, and
  // Gmail inbox categorization cannot break the self-send seed.
  buildWorkflow: (ctx) =>
    buildPollingWorkflow(
      "new_email",
      { subject: ctx.marker, subjectExactMatch: true, labelIds: [] },
      "trigger-smoke:gmail:new_email",
    ),
  async applyChange(deps, ctx) {
    const { messageId } = await deps.sendMarkedEmail(ctx.marker);
    return { messageId, identity: ctx.marker };
  },
  dedupKey: (messageId) => messageId,
  identityMatches(run, ctx, change) {
    if (run.eventType !== "new_email") return false;
    if (run.eventId !== change.messageId) return false;
    const payload = run.triggerPayload;
    if (!payload) return false;
    // Marker proof: hydration must preserve the run-unique subject verbatim.
    return payload.id === change.messageId && payload.subject === ctx.marker;
  },
};

export const GMAIL_NEW_LABELED_EMAIL_SPEC: GmailPollingTriggerSpec = {
  label: "gmail:new_labeled_email",
  eventType: "new_labeled_email",
  needsLabel: true,
  buildWorkflow: (ctx) => {
    if (!ctx.labelId) throw new Error("labeled spec requires ctx.labelId");
    return buildPollingWorkflow(
      "new_labeled_email",
      { labelId: ctx.labelId },
      "trigger-smoke:gmail:new_labeled_email",
    );
  },
  // The self-send itself produces only a messagesAdded history event (which
  // this trigger ignores); the add_label produces the labelsAdded event whose
  // addedLabelIds carry OUR smoke label — the only thing that can fire it.
  async applyChange(deps, ctx) {
    if (!ctx.labelId) throw new Error("labeled spec requires ctx.labelId");
    const { messageId } = await deps.sendMarkedEmail(ctx.marker);
    await deps.applyLabel({ messageId, labelId: ctx.labelId });
    return { messageId, identity: `${ctx.marker} + label ${ctx.labelId}` };
  },
  dedupKey: (messageId) => `labeled:${messageId}`,
  identityMatches(run, ctx, change) {
    if (run.eventType !== "new_labeled_email") return false;
    if (run.eventId !== `labeled:${change.messageId}`) return false;
    const payload = run.triggerPayload;
    if (!payload) return false;
    if (payload.labelAppliedId !== ctx.labelId) return false;
    const added = payload.labelsAdded;
    if (!Array.isArray(added) || !added.includes(ctx.labelId)) return false;
    // Marker proof: the hydrated subject must carry the run-unique marker.
    return payload.id === change.messageId && payload.subject === ctx.marker;
  },
};

export const GMAIL_NEW_ATTACHMENT_SPEC: GmailPollingTriggerSpec = {
  label: "gmail:new_attachment",
  eventType: "new_attachment",
  needsLabel: false,
  // The trigger has NO config filters (minimal Gmail 2.3 field set) — the
  // determinism comes from the history window: the snapshot cursor is seeded
  // at arm time, so only messages arriving after it are visible, and the
  // identity check pins the run to OUR attachment filename.
  buildWorkflow: () =>
    buildPollingWorkflow("new_attachment", {}, "trigger-smoke:gmail:new_attachment"),
  async applyChange(deps, ctx) {
    const { messageId, fileName } = await deps.sendMarkedAttachmentEmail(
      `${ctx.marker}-`,
    );
    return { messageId, identity: fileName };
  },
  dedupKey: (messageId) => `attachment:${messageId}`,
  identityMatches(run, ctx, change) {
    if (run.eventType !== "new_attachment") return false;
    if (run.eventId !== `attachment:${change.messageId}`) return false;
    const payload = run.triggerPayload;
    if (!payload || payload.id !== change.messageId) return false;
    const attachments = payload.attachments;
    if (!Array.isArray(attachments) || attachments.length === 0) return false;
    // Marker proof: the extracted attachment metadata must carry OUR
    // marker-bearing filename.
    return attachments.some(
      (a) =>
        typeof (a as { filename?: unknown }).filename === "string" &&
        ((a as { filename: string }).filename === change.identity ||
          (a as { filename: string }).filename.includes(ctx.marker)),
    );
  },
};

export const ALL_GMAIL_POLLING_SPECS: readonly GmailPollingTriggerSpec[] = [
  GMAIL_NEW_EMAIL_SPEC,
  GMAIL_NEW_LABELED_EMAIL_SPEC,
  GMAIL_NEW_ATTACHMENT_SPEC,
];

export interface GmailPollingSmokeOptions {
  /** Bounded re-poll attempts after the change (history propagation lag). */
  readonly afterPollAttempts?: number;
  readonly afterPollSleepMs?: number;
}

export interface GmailPollingSmokeResult {
  readonly outcome: "pass" | "fail";
  readonly reason: string | null;
  readonly triggerLabel: string;
  /** The activation-seeded baseline cursor (proves the snapshot init). */
  readonly armedHistoryId: string | null;
  readonly baselineRunCount: number;
  readonly afterRunCount: number;
  readonly identityMatched: boolean;
  readonly terminalStatus: GmailPollingRun["status"] | null;
  /** Run count after the extra advanced-cursor poll (watermark proof: stays 1). */
  readonly afterWatermarkRunCount: number | null;
  readonly watermarkProven: boolean;
  /** Run count after the REWOUND-cursor poll (dedup proof: stays 1). */
  readonly afterRewindRunCount: number | null;
  readonly dedupProven: boolean;
  readonly seededMessageId: string | null;
  readonly workflowId: string | null;
  readonly cleaned: boolean;
}

export async function runGmailPollingSmoke(
  deps: GmailPollingSmokeDeps,
  spec: GmailPollingTriggerSpec,
  opts: GmailPollingSmokeOptions = {},
): Promise<GmailPollingSmokeResult> {
  const ref: {
    workflowId: string | null;
    messageId: string | null;
    labelId: string | null;
  } = { workflowId: null, messageId: null, labelId: null };
  let result: GmailPollingSmokeResult;
  try {
    result = await runCore(deps, spec, opts, ref);
  } catch (err) {
    result = base(spec, ref, { outcome: "fail", reason: (err as Error).message });
  } finally {
    // Cleanup ALWAYS runs and is NOT masked. Smoke-owned resources: the seed
    // message (trashed), the smoke label (deleted), the workflow +
    // trigger_resources row, and the dedup row.
    let cleaned = true;
    if (ref.messageId) {
      cleaned =
        (await deps.trashMessage(ref.messageId).then(() => true).catch(() => false)) &&
        cleaned;
      cleaned =
        (await deps
          .cleanupDedup(spec.dedupKey(ref.messageId))
          .then(() => true)
          .catch(() => false)) && cleaned;
    }
    if (ref.labelId) {
      cleaned =
        (await deps.deleteLabel(ref.labelId).then(() => true).catch(() => false)) &&
        cleaned;
    }
    if (ref.workflowId) {
      cleaned =
        (await deps.cleanupWorkflow(ref.workflowId).then(() => true).catch(() => false)) &&
        cleaned;
    }
    result = { ...result!, cleaned };
  }
  return result!;
}

function base(
  spec: GmailPollingTriggerSpec,
  ref: { workflowId: string | null; messageId: string | null },
  over: Partial<GmailPollingSmokeResult> & {
    outcome: GmailPollingSmokeResult["outcome"];
  },
): GmailPollingSmokeResult {
  return {
    reason: null,
    triggerLabel: spec.label,
    armedHistoryId: null,
    baselineRunCount: 0,
    afterRunCount: 0,
    identityMatched: false,
    terminalStatus: null,
    afterWatermarkRunCount: null,
    watermarkProven: false,
    afterRewindRunCount: null,
    dedupProven: false,
    seededMessageId: ref.messageId,
    workflowId: ref.workflowId,
    cleaned: false,
    ...over,
  };
}

async function runCore(
  deps: GmailPollingSmokeDeps,
  spec: GmailPollingTriggerSpec,
  opts: GmailPollingSmokeOptions,
  ref: { workflowId: string | null; messageId: string | null; labelId: string | null },
): Promise<GmailPollingSmokeResult> {
  // 0. Run-unique marker (+ smoke label when the spec filters on one).
  const marker = deps.mintMarker(spec.eventType);
  let ctx: GmailPollingSmokeContext = { marker };
  if (spec.needsLabel) {
    const { labelId, labelName } = await deps.prepareLabel(marker);
    ref.labelId = labelId;
    ctx = { marker, labelId, labelName };
  }

  // 1. Active smoke workflow watching this Gmail trigger.
  const workflow = spec.buildWorkflow(ctx);
  const { workflowId } = await deps.createActiveSmokeWorkflow(workflow);
  ref.workflowId = workflowId;

  // 2. ARM via the real lifecycle → the activation hook seeds the baseline
  //    historyId (the V1 "first poll miss" rule made concrete).
  const { snapshotHistoryId } = await deps.armPollingTrigger({
    workflowId,
    triggerNodeId: workflow.triggerNodeId,
  });
  if (!snapshotHistoryId) {
    return base(spec, ref, {
      outcome: "fail",
      reason: "activation did not seed snapshot.historyId (baseline cursor missing)",
    });
  }

  // 3. FIRST poll — baseline-first: pre-existing mailbox state must NOT fire.
  await deps.poll({ workflowId, triggerNodeId: workflow.triggerNodeId });
  const baselineRuns = await deps.listRuns(workflowId);
  if (baselineRuns.length !== 0) {
    return base(spec, ref, {
      outcome: "fail",
      reason: `baseline violation: ${baselineRuns.length} run(s) fired from pre-existing mailbox state`,
      armedHistoryId: snapshotHistoryId,
      baselineRunCount: baselineRuns.length,
    });
  }

  // 4. Capture the post-baseline cursor — the rewind target for the dedup proof.
  const preChangeHistoryId = await deps.readSnapshotHistoryId({
    workflowId,
    triggerNodeId: workflow.triggerNodeId,
  });
  if (!preChangeHistoryId) {
    return base(spec, ref, {
      outcome: "fail",
      reason: "post-baseline snapshot.historyId unreadable (cannot set up dedup rewind)",
      armedHistoryId: snapshotHistoryId,
    });
  }

  // 5. Apply the ONE marked change (self-send / send+label / send-attachment).
  const change = await spec.applyChange(deps, ctx);
  ref.messageId = change.messageId;

  // 6. Bounded re-poll (history propagation lag) → exactly one run.
  const attempts = Math.max(1, opts.afterPollAttempts ?? 1);
  const sleepMs = Math.max(0, opts.afterPollSleepMs ?? 0);
  let afterRuns: readonly GmailPollingRun[] = [];
  for (let i = 0; i < attempts; i += 1) {
    await deps.poll({ workflowId, triggerNodeId: workflow.triggerNodeId });
    afterRuns = await deps.listRuns(workflowId);
    if (afterRuns.length >= 1) break;
    if (i < attempts - 1 && sleepMs > 0) await deps.sleep(sleepMs);
  }
  if (afterRuns.length !== 1) {
    return base(spec, ref, {
      outcome: "fail",
      reason: `expected exactly 1 run after the change, got ${afterRuns.length}`,
      armedHistoryId: snapshotHistoryId,
      afterRunCount: afterRuns.length,
    });
  }

  // 7. The fired run must identify OUR seed (eventType + prefixed eventId + markers).
  const fired = afterRuns[0]!;
  if (!spec.identityMatches(fired, ctx, change)) {
    return base(spec, ref, {
      outcome: "fail",
      reason: `fired run did not identify the seeded message (eventId=${fired.eventId ?? "null"}, eventType=${fired.eventType ?? "null"})`,
      armedHistoryId: snapshotHistoryId,
      afterRunCount: 1,
    });
  }

  // 8. Drain → terminal 'succeeded'.
  await deps.drainRun(fired.runId);
  const terminal = await deps.readRun(fired.runId);
  const terminalStatus = terminal?.status ?? null;
  if (terminalStatus !== "succeeded") {
    return base(spec, ref, {
      outcome: "fail",
      reason: `fired run did not reach terminal 'succeeded' (got ${terminalStatus ?? "null"})`,
      armedHistoryId: snapshotHistoryId,
      afterRunCount: 1,
      identityMatched: true,
      terminalStatus,
    });
  }

  // 9. WATERMARK PROOF — the cursor advanced past the change; a further poll
  //    must fire nothing new.
  await deps.poll({ workflowId, triggerNodeId: workflow.triggerNodeId });
  const afterWatermark = await deps.listRuns(workflowId);
  if (afterWatermark.length !== 1) {
    return base(spec, ref, {
      outcome: "fail",
      reason: `watermark failed: ${afterWatermark.length} run(s) after an advanced-cursor re-poll (expected 1)`,
      armedHistoryId: snapshotHistoryId,
      afterRunCount: 1,
      identityMatched: true,
      terminalStatus,
      afterWatermarkRunCount: afterWatermark.length,
    });
  }

  // 10. DEDUP PROOF — rewind the cursor to BEFORE the change and poll again.
  //     history.list re-surfaces the same message id; webhook_event_dedup
  //     (per-trigger prefixed key) must drop it. This isolates the dedup
  //     layer from the watermark layer.
  await deps.rewindSnapshot({
    workflowId,
    triggerNodeId: workflow.triggerNodeId,
    historyId: preChangeHistoryId,
  });
  await deps.poll({ workflowId, triggerNodeId: workflow.triggerNodeId });
  const afterRewind = await deps.listRuns(workflowId);
  const dedupProven = afterRewind.length === 1;
  if (!dedupProven) {
    return base(spec, ref, {
      outcome: "fail",
      reason: `dedup failed: ${afterRewind.length} run(s) after a rewound-cursor re-poll (expected 1)`,
      armedHistoryId: snapshotHistoryId,
      afterRunCount: 1,
      identityMatched: true,
      terminalStatus,
      afterWatermarkRunCount: 1,
      watermarkProven: true,
      afterRewindRunCount: afterRewind.length,
    });
  }

  return base(spec, ref, {
    outcome: "pass",
    armedHistoryId: snapshotHistoryId,
    afterRunCount: 1,
    identityMatched: true,
    terminalStatus: "succeeded",
    afterWatermarkRunCount: 1,
    watermarkProven: true,
    afterRewindRunCount: 1,
    dedupProven: true,
  });
}
