/**
 * Trigger-smoke harness — Mailchimp POLLING trigger dispatch path (Lane B).
 *
 * One spec-driven orchestrator covering the three SEEDABLE Mailchimp polling
 * triggers (of the six registered — see the blocker notes in the seed):
 *   - mailchimp:subscriber_added_to_segment (change: tag a NEW plus-addressed member;
 *                                            identity: member email marker)
 *   - mailchimp:segment_updated             (change: RENAME the marker tag segment;
 *                                            identity: renamed marker name)
 *   - mailchimp:campaign_created            (change: create a DRAFT campaign;
 *                                            identity: marker title, never sent)
 *
 * SEEDING uses the action-certified Mailchimp patterns: audience discovery via
 * the proven smoke helper (pinned env → smoke-named → first audience),
 * plus-addressed run-unique `crsmoke-` member emails, the certified
 * add_subscriber / add_tag handlers, and remove_subscriber mode
 * delete_permanent for cleanup. Mailchimp TAGS are static segments, so the
 * certified add_tag both mints the smoke segment (tag on member A before
 * arming) and performs the post-baseline mutation (tag on member B) with NO
 * uncertified write path. The only smoke-only inline API calls are campaign
 * create/delete + segment delete (no production wrapper or action exists);
 * they reuse the shared mailchimpRequest helper. The draft campaign is NEVER
 * sent — creating it sends no mail (same guarantee as add_subscriber).
 *
 * SNAPSHOT MODEL (differs from Gmail's linear history cursor): each trigger
 * keeps a JSON snapshot (known-hash set / observed segment state / known-id
 * set) advanced by UNION or overwrite per poll. The freshness proofs adapt:
 *   - WATERMARK: after the fired poll, another poll must fire 0 more (the
 *     snapshot absorbed the change).
 *   - DEDUP: the orchestrator RESTORES the exact pre-change snapshot JSON and
 *     polls again — the poller re-detects the same change and the
 *     webhook_event_dedup row (per-trigger key shapes:
 *     subscriber_added_to_segment:{seg}:{hash} / segment_updated:{seg}:{updatedAt}
 *     / campaign_created:{id}) must drop it. This isolates the dedup layer
 *     from the snapshot layer.
 *
 * Flow per spec: prepare (discover audience + seed pre-arm resources, settle
 * confirmed) → create active {trigger → native no-op} workflow → ARM via the
 * real registerWorkflowTriggers (activation hook captures the baseline
 * snapshot) → FIRST poll fires 0 (baseline-first) → capture the pre-change
 * snapshot JSON → apply ONE marked change → bounded re-poll → exactly ONE run
 * identifying the seed → drain → terminal 'succeeded' → watermark poll →
 * restore-snapshot dedup poll → cleanup (delete_permanent members, delete
 * smoke segment + draft campaign, unregister, soft-delete, dedup rows) →
 * 0 leaked.
 *
 * The per-trigger poll handler is driven directly (the same function the
 * cron's runOne invokes) — the global shell would fire every due polling
 * workflow on the shared dev DB. Same scoping as Excel / OneNote / Gmail.
 *
 * Every DB / provider touchpoint is behind injected `MailchimpPollingSmokeDeps`
 * so this orchestrator is fully unit-testable with fakes; real wiring lives in
 * mailchimpPollingSmokeDeps.ts and only runs in the gated dev integration test.
 */
import {
  WorkflowDefinitionSchema,
  type WorkflowDefinition,
} from "@/contracts/workflowDefinition";

export const MAILCHIMP_POLLING_SMOKE_TRIGGER_NODE_ID = "smoke-mailchimp-poll-trigger";
export const MAILCHIMP_POLLING_SMOKE_ACTION_NODE_ID = "smoke-noop-action";

export interface MailchimpPollingSmokeWorkflow {
  readonly definition: WorkflowDefinition;
  readonly triggerNodeId: string;
  readonly actionNodeId: string;
  readonly name: string;
}

function buildPollingWorkflow(
  triggerType: string,
  triggerConfig: Record<string, unknown>,
  name: string,
): MailchimpPollingSmokeWorkflow {
  const definition = WorkflowDefinitionSchema.parse({
    nodes: [
      {
        id: MAILCHIMP_POLLING_SMOKE_TRIGGER_NODE_ID,
        kind: "trigger",
        provider: "mailchimp",
        type: triggerType,
        config: triggerConfig,
        position: { x: 0, y: 0 },
      },
      {
        id: MAILCHIMP_POLLING_SMOKE_ACTION_NODE_ID,
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
        id: "smoke-mailchimp-poll-edge",
        from: MAILCHIMP_POLLING_SMOKE_TRIGGER_NODE_ID,
        to: MAILCHIMP_POLLING_SMOKE_ACTION_NODE_ID,
      },
    ],
  });
  return {
    definition,
    triggerNodeId: MAILCHIMP_POLLING_SMOKE_TRIGGER_NODE_ID,
    actionNodeId: MAILCHIMP_POLLING_SMOKE_ACTION_NODE_ID,
    name,
  };
}

/** Discovered audience + owner mailbox for plus-addressed smoke members. */
export interface MailchimpSmokeAudienceInfo {
  readonly audienceId: string;
  readonly ownerLocal: string;
  readonly ownerDomain: string;
}

/** Per-run context assembled by prepare(). */
export interface MailchimpPollingSmokeContext {
  readonly marker: string;
  readonly audience: MailchimpSmokeAudienceInfo;
  /** Tag name = smoke segment name (carries the marker). Segment specs only. */
  readonly tagName?: string;
  /** The tag's static segment id. Segment specs only. */
  readonly segmentId?: string;
  /** Plus-addressed member emails created during prepare (cleanup list). */
  readonly seedMemberEmails: readonly string[];
}

/** What applyChange produced. */
export interface MailchimpPollingChange {
  /** Human-readable identity for logs. */
  readonly identity: string;
  /** The post-baseline member email (segment specs; cleanup). */
  readonly memberEmail?: string;
  /** The draft campaign id (campaign spec; cleanup). */
  readonly campaignId?: string;
}

export interface MailchimpPollingRun {
  readonly runId: string;
  readonly status: "succeeded" | "failed" | "running" | "queued" | null;
  readonly triggerPayload: Readonly<Record<string, unknown>> | null;
  readonly eventId: string | null;
  readonly eventType: string | null;
}

/** Injected seams. Real wiring in mailchimpPollingSmokeDeps.ts; fakes in tests. */
export interface MailchimpPollingSmokeDeps {
  mintMarker(kind: string): string;
  /** Proven smoke audience discovery (pinned env → smoke-named → first). */
  discoverAudience(): Promise<MailchimpSmokeAudienceInfo>;
  /** Certified add_subscriber (status "subscribed"; API send-free). */
  createSmokeMember(input: { audienceId: string; email: string }): Promise<void>;
  /** Certified add_tag (auto-creates the tag's static segment). */
  addTag(input: { audienceId: string; email: string; tag: string }): Promise<void>;
  /** Resolve the tag's static segment id by name (bounded retry inside). */
  findSegmentIdByName(input: {
    audienceId: string;
    name: string;
  }): Promise<string>;
  /**
   * Bounded settle: waits until BOTH segmentGet.member_count AND
   * segmentMembersList report >= minMembers — so the activation snapshot
   * (whichever source it reads) captures a stable pre-change baseline.
   */
  awaitSegmentSettled(input: {
    audienceId: string;
    segmentId: string;
    minMembers: number;
  }): Promise<void>;
  /** Smoke-only inline PATCH /segments/{id} — rename (deterministic observable). */
  renameSegment(input: {
    audienceId: string;
    segmentId: string;
    newName: string;
  }): Promise<void>;
  /** Smoke-only inline POST /campaigns — a DRAFT (never sent). */
  createSmokeCampaign(input: {
    audienceId: string;
    marker: string;
  }): Promise<{ campaignId: string }>;
  createActiveSmokeWorkflow(
    workflow: MailchimpPollingSmokeWorkflow,
  ): Promise<{ workflowId: string }>;
  /** REAL registerWorkflowTriggers → activation snapshot. */
  armPollingTrigger(input: {
    workflowId: string;
    triggerNodeId: string;
  }): Promise<{ snapshotPresent: boolean }>;
  /** REAL per-trigger Mailchimp poll handler scoped to this trigger. */
  poll(input: { workflowId: string; triggerNodeId: string }): Promise<void>;
  /** Read the trigger row's whole snapshot JSON (the dedup-rewind target). */
  readSnapshot(input: {
    workflowId: string;
    triggerNodeId: string;
  }): Promise<Record<string, unknown> | null>;
  /** RESTORE a previously captured snapshot JSON (dedup-vs-snapshot isolation). */
  restoreSnapshot(input: {
    workflowId: string;
    triggerNodeId: string;
    snapshot: Record<string, unknown>;
  }): Promise<void>;
  listRuns(workflowId: string): Promise<readonly MailchimpPollingRun[]>;
  drainRun(runId: string): Promise<void>;
  readRun(runId: string): Promise<MailchimpPollingRun | null>;
  cleanupWorkflow(workflowId: string): Promise<void>;
  /** Certified remove_subscriber mode "delete_permanent". */
  deleteMemberPermanent(input: { audienceId: string; email: string }): Promise<void>;
  /** Smoke-only inline DELETE /lists/{id}/segments/{segmentId}. */
  deleteSegment(input: { audienceId: string; segmentId: string }): Promise<void>;
  /** Smoke-only inline DELETE /campaigns/{id}. */
  deleteCampaign(campaignId: string): Promise<void>;
  /** Delete dedup rows by LIKE pattern (provider=mailchimp). */
  cleanupDedupLike(pattern: string): Promise<void>;
  sleep(ms: number): Promise<void>;
}

export interface MailchimpPollingTriggerSpec {
  readonly label: string;
  readonly eventType: string;
  /** Discover the audience + seed/settle the pre-arm resources. */
  prepare(
    deps: MailchimpPollingSmokeDeps,
    marker: string,
  ): Promise<MailchimpPollingSmokeContext>;
  buildWorkflow(ctx: MailchimpPollingSmokeContext): MailchimpPollingSmokeWorkflow;
  applyChange(
    deps: MailchimpPollingSmokeDeps,
    ctx: MailchimpPollingSmokeContext,
  ): Promise<MailchimpPollingChange>;
  /** SQL LIKE pattern for the dedup rows this run may have written. */
  dedupCleanupPattern(
    ctx: MailchimpPollingSmokeContext,
    change: MailchimpPollingChange | null,
  ): string | null;
  identityMatches(
    run: MailchimpPollingRun,
    ctx: MailchimpPollingSmokeContext,
    change: MailchimpPollingChange,
  ): boolean;
}

export function plusAddressedEmail(
  audience: MailchimpSmokeAudienceInfo,
  marker: string,
  suffix: string,
): string {
  return `${audience.ownerLocal}+${marker}-${suffix}@${audience.ownerDomain}`;
}

/** Shared prepare for the two segment specs: member A + marker tag = segment. */
async function prepareTagSegment(
  deps: MailchimpPollingSmokeDeps,
  marker: string,
): Promise<MailchimpPollingSmokeContext> {
  const audience = await deps.discoverAudience();
  const tagName = `${marker}-tag`;
  const emailA = plusAddressedEmail(audience, marker, "a");
  await deps.createSmokeMember({ audienceId: audience.audienceId, email: emailA });
  await deps.addTag({ audienceId: audience.audienceId, email: emailA, tag: tagName });
  const segmentId = await deps.findSegmentIdByName({
    audienceId: audience.audienceId,
    name: tagName,
  });
  // Settle BEFORE arming so the activation baseline is stable — otherwise a
  // lagging member_count could flip during the baseline poll and false-fire.
  await deps.awaitSegmentSettled({
    audienceId: audience.audienceId,
    segmentId,
    minMembers: 1,
  });
  return { marker, audience, tagName, segmentId, seedMemberEmails: [emailA] };
}

/** Shared change for the two segment specs: NEW member B gets the tag. */
async function addTaggedMemberB(
  deps: MailchimpPollingSmokeDeps,
  ctx: MailchimpPollingSmokeContext,
): Promise<{ emailB: string }> {
  if (!ctx.tagName) throw new Error("segment spec requires ctx.tagName");
  const emailB = plusAddressedEmail(ctx.audience, ctx.marker, "b");
  await deps.createSmokeMember({
    audienceId: ctx.audience.audienceId,
    email: emailB,
  });
  await deps.addTag({
    audienceId: ctx.audience.audienceId,
    email: emailB,
    tag: ctx.tagName,
  });
  return { emailB };
}

export const MC_SUBSCRIBER_ADDED_TO_SEGMENT_SPEC: MailchimpPollingTriggerSpec = {
  label: "mailchimp:subscriber_added_to_segment",
  eventType: "subscriber_added_to_segment",
  prepare: prepareTagSegment,
  buildWorkflow: (ctx) => {
    if (!ctx.segmentId) throw new Error("spec requires ctx.segmentId");
    return buildPollingWorkflow(
      "subscriber_added_to_segment",
      { listId: ctx.audience.audienceId, segmentId: ctx.segmentId },
      "trigger-smoke:mailchimp:subscriber_added_to_segment",
    );
  },
  async applyChange(deps, ctx) {
    const { emailB } = await addTaggedMemberB(deps, ctx);
    return { identity: emailB, memberEmail: emailB };
  },
  dedupCleanupPattern: (ctx) =>
    ctx.segmentId ? `subscriber_added_to_segment:${ctx.segmentId}:%` : null,
  identityMatches(run, ctx, change) {
    if (run.eventType !== "subscriber_added_to_segment") return false;
    const payload = run.triggerPayload;
    if (!payload) return false;
    if (payload.segmentId !== ctx.segmentId) return false;
    if (payload.listId !== ctx.audience.audienceId) return false;
    // Marker proof: the payload email is the run-unique plus-addressed seed.
    const email = payload.emailAddress;
    if (typeof email !== "string" || !change.memberEmail) return false;
    if (email.toLowerCase() !== change.memberEmail.toLowerCase()) return false;
    // eventId shape: subscriber_added_to_segment:{segmentId}:{subscriberHash}.
    return (
      run.eventId ===
      `subscriber_added_to_segment:${ctx.segmentId}:${String(payload.subscriberHash ?? "")}`
    );
  },
};

export const MC_SEGMENT_UPDATED_SPEC: MailchimpPollingTriggerSpec = {
  label: "mailchimp:segment_updated",
  eventType: "segment_updated",
  prepare: prepareTagSegment,
  buildWorkflow: (ctx) => {
    if (!ctx.segmentId) throw new Error("spec requires ctx.segmentId");
    return buildPollingWorkflow(
      "segment_updated",
      { listId: ctx.audience.audienceId, segmentId: ctx.segmentId },
      "trigger-smoke:mailchimp:segment_updated",
    );
  },
  // The observable update is a RENAME of the marker tag segment. Live-probed
  // alternative rejected: a tag-add DOES flip member_count, but Mailchimp's
  // segmentGet member_count aggregate lags minutes behind segmentMembersList
  // (observed live 2026-07-06: 10 polls x 2.5s never saw the new count while
  // the members list was already fresh). The rename is the segment record's
  // PRIMARY field — echoed immediately — and is exactly the "name" observable
  // the poller diffs.
  async applyChange(deps, ctx) {
    if (!ctx.segmentId || !ctx.tagName) throw new Error("spec requires ctx.segmentId");
    const newName = renamedSegmentName(ctx);
    await deps.renameSegment({
      audienceId: ctx.audience.audienceId,
      segmentId: ctx.segmentId,
      newName,
    });
    return { identity: newName };
  },
  dedupCleanupPattern: (ctx) =>
    ctx.segmentId ? `segment_updated:${ctx.segmentId}:%` : null,
  identityMatches(run, ctx, _change) {
    if (run.eventType !== "segment_updated") return false;
    const payload = run.triggerPayload;
    if (!payload) return false;
    if (payload.segmentId !== ctx.segmentId) return false;
    if (payload.listId !== ctx.audience.audienceId) return false;
    // Marker proof: the observed segment NAME is the RENAMED run-unique
    // marker name (the very field the change mutated).
    if (payload.name !== renamedSegmentName(ctx)) return false;
    return (
      typeof run.eventId === "string" &&
      run.eventId.startsWith(`segment_updated:${ctx.segmentId}:`)
    );
  },
};

/** Deterministic post-rename segment name (still marker-bearing). */
export function renamedSegmentName(ctx: MailchimpPollingSmokeContext): string {
  return `${ctx.tagName}-renamed`;
}

export const MC_CAMPAIGN_CREATED_SPEC: MailchimpPollingTriggerSpec = {
  label: "mailchimp:campaign_created",
  eventType: "campaign_created",
  async prepare(deps, marker) {
    const audience = await deps.discoverAudience();
    return { marker, audience, seedMemberEmails: [] };
  },
  // audienceId narrows the watch to the smoke audience (config filter the
  // poll echoes into campaignsList). status is deliberately unset — the
  // synthetic campaign stays a DRAFT ("save" status) and must be visible.
  buildWorkflow: (ctx) =>
    buildPollingWorkflow(
      "campaign_created",
      { audienceId: ctx.audience.audienceId },
      "trigger-smoke:mailchimp:campaign_created",
    ),
  async applyChange(deps, ctx) {
    const { campaignId } = await deps.createSmokeCampaign({
      audienceId: ctx.audience.audienceId,
      marker: ctx.marker,
    });
    return { identity: ctx.marker, campaignId };
  },
  dedupCleanupPattern: (_ctx, change) =>
    change?.campaignId ? `campaign_created:${change.campaignId}` : "campaign_created:%crsmoke%",
  identityMatches(run, ctx, change) {
    if (run.eventType !== "campaign_created") return false;
    if (!change.campaignId) return false;
    if (run.eventId !== `campaign_created:${change.campaignId}`) return false;
    const payload = run.triggerPayload;
    if (!payload) return false;
    if (payload.campaignId !== change.campaignId) return false;
    if (payload.audienceId !== ctx.audience.audienceId) return false;
    // Marker proof: the draft campaign's title carries the run marker.
    return typeof payload.title === "string" && payload.title.includes(ctx.marker);
  },
};

export const ALL_MAILCHIMP_POLLING_SPECS: readonly MailchimpPollingTriggerSpec[] = [
  MC_SUBSCRIBER_ADDED_TO_SEGMENT_SPEC,
  MC_SEGMENT_UPDATED_SPEC,
  MC_CAMPAIGN_CREATED_SPEC,
];

export interface MailchimpPollingSmokeOptions {
  /** Bounded re-poll attempts after the change (Mailchimp read-side lag). */
  readonly afterPollAttempts?: number;
  readonly afterPollSleepMs?: number;
}

export interface MailchimpPollingSmokeResult {
  readonly outcome: "pass" | "fail";
  readonly reason: string | null;
  readonly triggerLabel: string;
  readonly snapshotPresent: boolean;
  readonly baselineRunCount: number;
  readonly afterRunCount: number;
  readonly identityMatched: boolean;
  readonly terminalStatus: MailchimpPollingRun["status"] | null;
  readonly afterWatermarkRunCount: number | null;
  readonly watermarkProven: boolean;
  readonly afterRestoreRunCount: number | null;
  readonly dedupProven: boolean;
  readonly workflowId: string | null;
  readonly cleaned: boolean;
}

export async function runMailchimpPollingSmoke(
  deps: MailchimpPollingSmokeDeps,
  spec: MailchimpPollingTriggerSpec,
  opts: MailchimpPollingSmokeOptions = {},
): Promise<MailchimpPollingSmokeResult> {
  const ref: {
    workflowId: string | null;
    ctx: MailchimpPollingSmokeContext | null;
    change: MailchimpPollingChange | null;
  } = { workflowId: null, ctx: null, change: null };
  let result: MailchimpPollingSmokeResult;
  try {
    result = await runCore(deps, spec, opts, ref);
  } catch (err) {
    result = base(spec, ref, { outcome: "fail", reason: (err as Error).message });
  } finally {
    // Cleanup ALWAYS runs and is NOT masked. Smoke-owned resources: seed +
    // change members (delete_permanent), the tag's static segment, the draft
    // campaign, the workflow + trigger row, and the dedup rows.
    let cleaned = true;
    const ctx = ref.ctx;
    if (ctx) {
      const emails = [
        ...ctx.seedMemberEmails,
        ...(ref.change?.memberEmail ? [ref.change.memberEmail] : []),
      ];
      for (const email of emails) {
        cleaned =
          (await deps
            .deleteMemberPermanent({ audienceId: ctx.audience.audienceId, email })
            .then(() => true)
            .catch(() => false)) && cleaned;
      }
      if (ctx.segmentId) {
        cleaned =
          (await deps
            .deleteSegment({
              audienceId: ctx.audience.audienceId,
              segmentId: ctx.segmentId,
            })
            .then(() => true)
            .catch(() => false)) && cleaned;
      }
      if (ref.change?.campaignId) {
        cleaned =
          (await deps
            .deleteCampaign(ref.change.campaignId)
            .then(() => true)
            .catch(() => false)) && cleaned;
      }
      const pattern = spec.dedupCleanupPattern(ctx, ref.change);
      if (pattern) {
        cleaned =
          (await deps
            .cleanupDedupLike(pattern)
            .then(() => true)
            .catch(() => false)) && cleaned;
      }
    }
    if (ref.workflowId) {
      cleaned =
        (await deps
          .cleanupWorkflow(ref.workflowId)
          .then(() => true)
          .catch(() => false)) && cleaned;
    }
    result = { ...result!, cleaned };
  }
  return result!;
}

function base(
  spec: MailchimpPollingTriggerSpec,
  ref: { workflowId: string | null },
  over: Partial<MailchimpPollingSmokeResult> & {
    outcome: MailchimpPollingSmokeResult["outcome"];
  },
): MailchimpPollingSmokeResult {
  return {
    reason: null,
    triggerLabel: spec.label,
    snapshotPresent: false,
    baselineRunCount: 0,
    afterRunCount: 0,
    identityMatched: false,
    terminalStatus: null,
    afterWatermarkRunCount: null,
    watermarkProven: false,
    afterRestoreRunCount: null,
    dedupProven: false,
    workflowId: ref.workflowId,
    cleaned: false,
    ...over,
  };
}

async function runCore(
  deps: MailchimpPollingSmokeDeps,
  spec: MailchimpPollingTriggerSpec,
  opts: MailchimpPollingSmokeOptions,
  ref: {
    workflowId: string | null;
    ctx: MailchimpPollingSmokeContext | null;
    change: MailchimpPollingChange | null;
  },
): Promise<MailchimpPollingSmokeResult> {
  // 0. Marker + pre-arm resources (audience discovery, seed member + tag
  //    segment where the spec needs one), settle-confirmed.
  const marker = deps.mintMarker(spec.eventType);
  const ctx = await spec.prepare(deps, marker);
  ref.ctx = ctx;

  // 1. Active smoke workflow watching this Mailchimp trigger.
  const workflow = spec.buildWorkflow(ctx);
  const { workflowId } = await deps.createActiveSmokeWorkflow(workflow);
  ref.workflowId = workflowId;

  // 2. ARM via the real lifecycle → activation captures the baseline snapshot.
  const { snapshotPresent } = await deps.armPollingTrigger({
    workflowId,
    triggerNodeId: workflow.triggerNodeId,
  });
  if (!snapshotPresent) {
    return base(spec, ref, {
      outcome: "fail",
      reason: "activation did not capture a baseline snapshot",
    });
  }

  // 3. FIRST poll — baseline-first: pre-existing state must NOT fire.
  await deps.poll({ workflowId, triggerNodeId: workflow.triggerNodeId });
  const baselineRuns = await deps.listRuns(workflowId);
  if (baselineRuns.length !== 0) {
    return base(spec, ref, {
      outcome: "fail",
      reason: `baseline violation: ${baselineRuns.length} run(s) fired from pre-existing state`,
      snapshotPresent,
      baselineRunCount: baselineRuns.length,
    });
  }

  // 4. Capture the post-baseline snapshot JSON — the dedup-restore target.
  const preChangeSnapshot = await deps.readSnapshot({
    workflowId,
    triggerNodeId: workflow.triggerNodeId,
  });
  if (!preChangeSnapshot) {
    return base(spec, ref, {
      outcome: "fail",
      reason: "post-baseline snapshot unreadable (cannot set up dedup restore)",
      snapshotPresent,
    });
  }

  // 5. Apply the ONE marked change.
  const change = await spec.applyChange(deps, ctx);
  ref.change = change;

  // 6. Bounded re-poll → exactly one run.
  const attempts = Math.max(1, opts.afterPollAttempts ?? 1);
  const sleepMs = Math.max(0, opts.afterPollSleepMs ?? 0);
  let afterRuns: readonly MailchimpPollingRun[] = [];
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
      snapshotPresent,
      afterRunCount: afterRuns.length,
    });
  }

  // 7. The fired run must identify OUR seed (markers + per-trigger eventId).
  const fired = afterRuns[0]!;
  if (!spec.identityMatches(fired, ctx, change)) {
    return base(spec, ref, {
      outcome: "fail",
      reason: `fired run did not identify the seeded change (eventId=${fired.eventId ?? "null"}, eventType=${fired.eventType ?? "null"})`,
      snapshotPresent,
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
      snapshotPresent,
      afterRunCount: 1,
      identityMatched: true,
      terminalStatus,
    });
  }

  // 9. WATERMARK PROOF — the snapshot absorbed the change; poll again → 0 new.
  await deps.poll({ workflowId, triggerNodeId: workflow.triggerNodeId });
  const afterWatermark = await deps.listRuns(workflowId);
  if (afterWatermark.length !== 1) {
    return base(spec, ref, {
      outcome: "fail",
      reason: `watermark failed: ${afterWatermark.length} run(s) after an absorbed-snapshot re-poll (expected 1)`,
      snapshotPresent,
      afterRunCount: 1,
      identityMatched: true,
      terminalStatus,
      afterWatermarkRunCount: afterWatermark.length,
    });
  }

  // 10. DEDUP PROOF — restore the pre-change snapshot and poll: the poller
  //     re-detects the same change; the webhook_event_dedup row must drop it.
  await deps.restoreSnapshot({
    workflowId,
    triggerNodeId: workflow.triggerNodeId,
    snapshot: preChangeSnapshot,
  });
  await deps.poll({ workflowId, triggerNodeId: workflow.triggerNodeId });
  const afterRestore = await deps.listRuns(workflowId);
  const dedupProven = afterRestore.length === 1;
  if (!dedupProven) {
    return base(spec, ref, {
      outcome: "fail",
      reason: `dedup failed: ${afterRestore.length} run(s) after a restored-snapshot re-poll (expected 1)`,
      snapshotPresent,
      afterRunCount: 1,
      identityMatched: true,
      terminalStatus,
      afterWatermarkRunCount: 1,
      watermarkProven: true,
      afterRestoreRunCount: afterRestore.length,
    });
  }

  return base(spec, ref, {
    outcome: "pass",
    snapshotPresent,
    afterRunCount: 1,
    identityMatched: true,
    terminalStatus: "succeeded",
    afterWatermarkRunCount: 1,
    watermarkProven: true,
    afterRestoreRunCount: 1,
    dedupProven: true,
  });
}
