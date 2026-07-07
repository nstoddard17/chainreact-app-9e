/**
 * @jest-environment node
 *
 * Unit tests for the Mailchimp polling trigger-smoke orchestrator
 * (tests/trigger-smoke/mailchimpPollingSmoke.ts) with injected fakes. No DB,
 * no Mailchimp. The fake models each trigger's snapshot semantics (known-set
 * diff for subscriber_added_to_segment / campaign_created; observed-state
 * compare for segment_updated) plus a dedup set — so the orchestrator's
 * WATERMARK proof (absorbed snapshot fires nothing) and DEDUP proof (restored
 * snapshot re-detects, dedup drops) are both exercised for real.
 *
 * Also proves the pure spec parts: plus-addressed marker emails, workflow
 * configs, per-trigger dedup cleanup patterns, and identityMatches
 * accept/reject behavior.
 */
import {
  runMailchimpPollingSmoke,
  plusAddressedEmail,
  renamedSegmentName,
  MC_SUBSCRIBER_ADDED_TO_SEGMENT_SPEC,
  MC_SEGMENT_UPDATED_SPEC,
  MC_CAMPAIGN_CREATED_SPEC,
  ALL_MAILCHIMP_POLLING_SPECS,
  type MailchimpPollingRun,
  type MailchimpPollingSmokeContext,
  type MailchimpPollingSmokeDeps,
  type MailchimpPollingTriggerSpec,
} from "@/tests/trigger-smoke/mailchimpPollingSmoke";

const FAST = { afterPollAttempts: 1, afterPollSleepMs: 0 } as const;

const MARKER = "crsmoke-test-marker";
const AUD = { audienceId: "aud1", ownerLocal: "owner", ownerDomain: "example.invalid" };
const SEGMENT_ID = "12345";
const TAG_NAME = `${MARKER}-tag`;

interface FakeOpts {
  noSnapshot?: boolean;
  preexistingRuns?: number;
  suppressRun?: boolean;
  corruptPayload?: boolean;
  drainStatus?: MailchimpPollingRun["status"];
  dedupBroken?: boolean;
  watermarkBroken?: boolean;
  throwOnChange?: boolean;
}

interface FakeState {
  membersCreated: string[];
  membersDeleted: string[];
  segmentDeleted: boolean;
  campaignDeleted: boolean;
  dedupPatterns: string[];
  workflowCleaned: boolean;
  polls: number;
}

/**
 * Fake provider: items (member hashes / campaign ids) appear via applyChange;
 * the stored snapshot either tracks a known-id set or an observed member
 * count, matching the real trigger shapes.
 */
function makeFakeDeps(
  spec: MailchimpPollingTriggerSpec,
  opts: FakeOpts = {},
): { deps: MailchimpPollingSmokeDeps; state: FakeState } {
  const runs: MailchimpPollingRun[] = [];
  for (let i = 0; i < (opts.preexistingRuns ?? 0); i += 1) {
    runs.push({ runId: `pre-${i}`, status: "queued", triggerPayload: null, eventId: null, eventType: null });
  }
  // Provider truth.
  const items: Array<{ id: string; email?: string }> = [];
  let providerSegmentName = TAG_NAME;
  const seen = new Set<string>();
  // Stored trigger snapshot (null until armed).
  let snapshot: Record<string, unknown> | null = null;
  let fired = false;
  const state: FakeState = {
    membersCreated: [],
    membersDeleted: [],
    segmentDeleted: false,
    campaignDeleted: false,
    dedupPatterns: [],
    workflowCleaned: false,
    polls: 0,
  };

  function fireRun(item: { id: string; email?: string }): void {
    let payload: Record<string, unknown>;
    let eventId: string;
    if (spec.eventType === "subscriber_added_to_segment") {
      payload = {
        listId: AUD.audienceId,
        segmentId: SEGMENT_ID,
        subscriberHash: item.id,
        emailAddress: item.email ?? null,
      };
      eventId = `subscriber_added_to_segment:${SEGMENT_ID}:${item.id}`;
    } else if (spec.eventType === "segment_updated") {
      payload = {
        listId: AUD.audienceId,
        segmentId: SEGMENT_ID,
        name: providerSegmentName,
        memberCount: 1,
      };
      eventId = `segment_updated:${SEGMENT_ID}:${providerSegmentName}`;
    } else {
      payload = {
        campaignId: item.id,
        audienceId: AUD.audienceId,
        title: MARKER,
      };
      eventId = `campaign_created:${item.id}`;
    }
    runs.push({
      runId: `run-${runs.length + 1}`,
      status: "queued",
      triggerPayload: opts.corruptPayload
        ? { listId: "other", title: "unrelated" }
        : payload,
      eventId,
      eventType: spec.eventType,
    });
  }

  function pollOnce(): void {
    state.polls += 1;
    if (!snapshot) return;
    if (spec.eventType === "segment_updated") {
      const known = snapshot.name as string;
      if (providerSegmentName !== known) {
        const key = `segment_updated:${SEGMENT_ID}:${providerSegmentName}`;
        if (!seen.has(key) || opts.dedupBroken) {
          seen.add(key);
          if (!opts.suppressRun) fireRun({ id: `name-${providerSegmentName}` });
        }
        snapshot = { ...snapshot, name: providerSegmentName };
      }
    } else {
      const known = new Set(snapshot.known as string[]);
      for (const item of items) {
        if (known.has(item.id)) continue;
        const key =
          spec.eventType === "subscriber_added_to_segment"
            ? `subscriber_added_to_segment:${SEGMENT_ID}:${item.id}`
            : `campaign_created:${item.id}`;
        if (!seen.has(key) || opts.dedupBroken) {
          seen.add(key);
          if (!opts.suppressRun) fireRun(item);
        }
      }
      snapshot = { ...snapshot, known: items.map((i) => i.id) };
    }
    if (opts.watermarkBroken && fired) {
      fireRun({ id: "dup-item" });
    }
    if (runs.length > 0) fired = true;
  }

  const deps: MailchimpPollingSmokeDeps = {
    mintMarker: () => MARKER,
    async discoverAudience() {
      return AUD;
    },
    async createSmokeMember({ email }) {
      state.membersCreated.push(email);
    },
    async addTag({ email }) {
      // Tagging member B is the observable provider change (sub_added spec).
      if (opts.throwOnChange && email.includes("-b@")) throw new Error("change boom");
      if (email.includes("-b@")) items.push({ id: `hash-${email}`, email });
    },
    async renameSegment({ newName }) {
      if (opts.throwOnChange) throw new Error("change boom");
      providerSegmentName = newName;
    },
    async findSegmentIdByName() {
      return SEGMENT_ID;
    },
    async awaitSegmentSettled() {
      /* settled instantly in the fake */
    },
    async createSmokeCampaign() {
      if (opts.throwOnChange) throw new Error("change boom");
      const id = `camp-${items.length + 1}`;
      items.push({ id });
      return { campaignId: id };
    },
    async createActiveSmokeWorkflow() {
      return { workflowId: "wf-test" };
    },
    async armPollingTrigger() {
      if (opts.noSnapshot) return { snapshotPresent: false };
      snapshot =
        spec.eventType === "segment_updated"
          ? { name: providerSegmentName, memberCount: 1 }
          : { known: items.map((i) => i.id) };
      return { snapshotPresent: true };
    },
    poll: async () => pollOnce(),
    async readSnapshot() {
      return snapshot ? { ...snapshot } : null;
    },
    async restoreSnapshot(input) {
      snapshot = { ...input.snapshot };
    },
    async listRuns() {
      return runs.map((r) => ({ ...r }));
    },
    async drainRun(runId) {
      const run = runs.find((r) => r.runId === runId);
      if (run) {
        (run as { status: MailchimpPollingRun["status"] }).status =
          opts.drainStatus === undefined ? "succeeded" : opts.drainStatus;
      }
    },
    async readRun(runId) {
      const run = runs.find((r) => r.runId === runId);
      return run ? { ...run } : null;
    },
    async cleanupWorkflow() {
      state.workflowCleaned = true;
    },
    async deleteMemberPermanent({ email }) {
      state.membersDeleted.push(email);
    },
    async deleteSegment() {
      state.segmentDeleted = true;
    },
    async deleteCampaign() {
      state.campaignDeleted = true;
    },
    async cleanupDedupLike(pattern) {
      state.dedupPatterns.push(pattern);
    },
    async sleep() {
      /* no-op */
    },
  };
  return { deps, state };
}

describe("runMailchimpPollingSmoke — happy path (all specs)", () => {
  it.each(ALL_MAILCHIMP_POLLING_SPECS.map((s) => [s.label, s] as const))(
    "%s passes: prepare → arm → baseline 0 → change → 1 run identified → succeeded → watermark holds → restored-snapshot dedup holds → cleaned",
    async (_label, spec) => {
      const { deps, state } = makeFakeDeps(spec);
      const r = await runMailchimpPollingSmoke(deps, spec, FAST);

      expect(r.outcome).toBe("pass");
      expect(r.triggerLabel).toBe(spec.label);
      expect(r.snapshotPresent).toBe(true);
      expect(r.baselineRunCount).toBe(0);
      expect(r.afterRunCount).toBe(1);
      expect(r.identityMatched).toBe(true);
      expect(r.terminalStatus).toBe("succeeded");
      expect(r.afterWatermarkRunCount).toBe(1);
      expect(r.watermarkProven).toBe(true);
      expect(r.afterRestoreRunCount).toBe(1);
      expect(r.dedupProven).toBe(true);
      expect(r.cleaned).toBe(true);
      // baseline + change-detection + watermark + restored-dedup = 4 polls.
      expect(state.polls).toBe(4);
      expect(state.workflowCleaned).toBe(true);
      expect(state.dedupPatterns.length).toBe(1);
      const isSegmentSpec = spec.eventType !== "campaign_created";
      expect(state.segmentDeleted).toBe(isSegmentSpec);
      expect(state.campaignDeleted).toBe(!isSegmentSpec);
      // sub_added creates member A (prepare) + member B (change); the rename
      // spec creates only member A; campaign spec creates no members.
      const expectedMembers =
        spec.eventType === "subscriber_added_to_segment" ? 2 : spec.eventType === "segment_updated" ? 1 : 0;
      expect(state.membersDeleted.length).toBe(expectedMembers);
    },
  );
});

describe("runMailchimpPollingSmoke — failure branches (subscriber_added_to_segment as vehicle)", () => {
  const spec = MC_SUBSCRIBER_ADDED_TO_SEGMENT_SPEC;

  it("fails when activation did not capture a snapshot", async () => {
    const { deps } = makeFakeDeps(spec, { noSnapshot: true });
    const r = await runMailchimpPollingSmoke(deps, spec, FAST);
    expect(r.outcome).toBe("fail");
    expect(r.reason).toMatch(/baseline snapshot/);
    expect(r.cleaned).toBe(true);
  });

  it("fails on baseline violation", async () => {
    const { deps } = makeFakeDeps(spec, { preexistingRuns: 1 });
    const r = await runMailchimpPollingSmoke(deps, spec, FAST);
    expect(r.outcome).toBe("fail");
    expect(r.reason).toMatch(/baseline/);
    expect(r.baselineRunCount).toBe(1);
    expect(r.cleaned).toBe(true);
  });

  it("fails when no run appears after the change", async () => {
    const { deps } = makeFakeDeps(spec, { suppressRun: true });
    const r = await runMailchimpPollingSmoke(deps, spec, FAST);
    expect(r.outcome).toBe("fail");
    expect(r.reason).toMatch(/exactly 1 run/);
    expect(r.cleaned).toBe(true);
  });

  it("fails when the fired run does not identify the seeded change", async () => {
    const { deps } = makeFakeDeps(spec, { corruptPayload: true });
    const r = await runMailchimpPollingSmoke(deps, spec, FAST);
    expect(r.outcome).toBe("fail");
    expect(r.reason).toMatch(/did not identify/);
    expect(r.identityMatched).toBe(false);
    expect(r.cleaned).toBe(true);
  });

  it("fails when the drained run is not terminal 'succeeded'", async () => {
    const { deps } = makeFakeDeps(spec, { drainStatus: "failed" });
    const r = await runMailchimpPollingSmoke(deps, spec, FAST);
    expect(r.outcome).toBe("fail");
    expect(r.terminalStatus).toBe("failed");
    expect(r.identityMatched).toBe(true);
    expect(r.cleaned).toBe(true);
  });

  it("fails when the watermark does not hold (absorbed-snapshot poll re-fires)", async () => {
    const { deps } = makeFakeDeps(spec, { watermarkBroken: true });
    const r = await runMailchimpPollingSmoke(deps, spec, FAST);
    expect(r.outcome).toBe("fail");
    expect(r.reason).toMatch(/watermark/);
    expect(r.watermarkProven).toBe(false);
    expect(r.cleaned).toBe(true);
  });

  it("fails when dedup does not hold on the restored-snapshot poll", async () => {
    const { deps } = makeFakeDeps(spec, { dedupBroken: true });
    const r = await runMailchimpPollingSmoke(deps, spec, FAST);
    expect(r.outcome).toBe("fail");
    expect(r.reason).toMatch(/dedup/);
    expect(r.afterRestoreRunCount).toBe(2);
    expect(r.dedupProven).toBe(false);
    expect(r.cleaned).toBe(true);
  });

  it("still cleans up seed members + segment when the change throws", async () => {
    const { deps, state } = makeFakeDeps(spec, { throwOnChange: true });
    const r = await runMailchimpPollingSmoke(deps, spec, FAST);
    expect(r.outcome).toBe("fail");
    expect(r.reason).toMatch(/change boom/);
    // Member A (prepare seed) is still deleted; segment deleted; workflow cleaned.
    expect(state.membersDeleted.length).toBeGreaterThanOrEqual(1);
    expect(state.segmentDeleted).toBe(true);
    expect(state.workflowCleaned).toBe(true);
    expect(r.cleaned).toBe(true);
  });
});

describe("Mailchimp polling specs — pure parts", () => {
  const CTX_SEG: MailchimpPollingSmokeContext = {
    marker: MARKER,
    audience: AUD,
    tagName: TAG_NAME,
    segmentId: SEGMENT_ID,
    seedMemberEmails: [plusAddressedEmail(AUD, MARKER, "a")],
  };
  const CTX_CAMPAIGN: MailchimpPollingSmokeContext = {
    marker: MARKER,
    audience: AUD,
    seedMemberEmails: [],
  };

  it("plus-addressed emails carry the run marker in the owner mailbox", () => {
    expect(plusAddressedEmail(AUD, MARKER, "a")).toBe(
      `owner+${MARKER}-a@example.invalid`,
    );
  });

  it("segment specs pin listId + segmentId in the workflow config (both meta-required)", () => {
    for (const spec of [MC_SUBSCRIBER_ADDED_TO_SEGMENT_SPEC, MC_SEGMENT_UPDATED_SPEC]) {
      const wf = spec.buildWorkflow(CTX_SEG);
      const trigger = wf.definition.nodes.find((n) => n.id === wf.triggerNodeId)!;
      expect(trigger.config).toEqual({
        listId: AUD.audienceId,
        segmentId: SEGMENT_ID,
      });
      expect(() => spec.buildWorkflow(CTX_CAMPAIGN)).toThrow(/segmentId/);
    }
  });

  it("campaign spec narrows the watch to the smoke audience", () => {
    const wf = MC_CAMPAIGN_CREATED_SPEC.buildWorkflow(CTX_CAMPAIGN);
    const trigger = wf.definition.nodes.find((n) => n.id === wf.triggerNodeId)!;
    expect(trigger.config).toEqual({ audienceId: AUD.audienceId });
  });

  it("dedup cleanup patterns match the per-trigger dedup key shapes", () => {
    expect(MC_SUBSCRIBER_ADDED_TO_SEGMENT_SPEC.dedupCleanupPattern(CTX_SEG, null)).toBe(
      `subscriber_added_to_segment:${SEGMENT_ID}:%`,
    );
    expect(MC_SEGMENT_UPDATED_SPEC.dedupCleanupPattern(CTX_SEG, null)).toBe(
      `segment_updated:${SEGMENT_ID}:%`,
    );
    expect(
      MC_CAMPAIGN_CREATED_SPEC.dedupCleanupPattern(CTX_CAMPAIGN, {
        identity: "x",
        campaignId: "camp9",
      }),
    ).toBe("campaign_created:camp9");
  });

  it("subscriber_added_to_segment identity requires the plus-addressed email + hash-keyed eventId", () => {
    const emailB = plusAddressedEmail(AUD, MARKER, "b");
    const change = { identity: emailB, memberEmail: emailB };
    const good: MailchimpPollingRun = {
      runId: "r", status: "queued",
      triggerPayload: {
        listId: AUD.audienceId, segmentId: SEGMENT_ID,
        subscriberHash: "h1", emailAddress: emailB,
      },
      eventId: `subscriber_added_to_segment:${SEGMENT_ID}:h1`,
      eventType: "subscriber_added_to_segment",
    };
    expect(MC_SUBSCRIBER_ADDED_TO_SEGMENT_SPEC.identityMatches(good, CTX_SEG, change)).toBe(true);
    // Someone else's email → reject.
    expect(
      MC_SUBSCRIBER_ADDED_TO_SEGMENT_SPEC.identityMatches(
        { ...good, triggerPayload: { ...good.triggerPayload!, emailAddress: "other@example.invalid" } },
        CTX_SEG,
        change,
      ),
    ).toBe(false);
    // Wrong segment → reject.
    expect(
      MC_SUBSCRIBER_ADDED_TO_SEGMENT_SPEC.identityMatches(
        { ...good, triggerPayload: { ...good.triggerPayload!, segmentId: "999" } },
        CTX_SEG,
        change,
      ),
    ).toBe(false);
  });

  it("segment_updated identity requires the RENAMED marker segment name", () => {
    const change = { identity: renamedSegmentName(CTX_SEG) };
    const good: MailchimpPollingRun = {
      runId: "r", status: "queued",
      triggerPayload: {
        listId: AUD.audienceId, segmentId: SEGMENT_ID,
        name: renamedSegmentName(CTX_SEG), memberCount: 1,
      },
      eventId: `segment_updated:${SEGMENT_ID}:2026-07-06T00:00:00Z`,
      eventType: "segment_updated",
    };
    expect(MC_SEGMENT_UPDATED_SPEC.identityMatches(good, CTX_SEG, change)).toBe(true);
    // The PRE-rename name must NOT satisfy the spec (the change is the rename).
    expect(
      MC_SEGMENT_UPDATED_SPEC.identityMatches(
        { ...good, triggerPayload: { ...good.triggerPayload!, name: TAG_NAME } },
        CTX_SEG,
        change,
      ),
    ).toBe(false);
    // An unrelated segment name → reject.
    expect(
      MC_SEGMENT_UPDATED_SPEC.identityMatches(
        { ...good, triggerPayload: { ...good.triggerPayload!, name: "other-segment" } },
        CTX_SEG,
        change,
      ),
    ).toBe(false);
  });

  it("campaign_created identity requires the marker title + the campaign-id eventId", () => {
    const change = { identity: MARKER, campaignId: "camp1" };
    const good: MailchimpPollingRun = {
      runId: "r", status: "queued",
      triggerPayload: { campaignId: "camp1", audienceId: AUD.audienceId, title: `${MARKER} draft` },
      eventId: "campaign_created:camp1",
      eventType: "campaign_created",
    };
    expect(MC_CAMPAIGN_CREATED_SPEC.identityMatches(good, CTX_CAMPAIGN, change)).toBe(true);
    // A different campaign id → reject.
    expect(
      MC_CAMPAIGN_CREATED_SPEC.identityMatches(
        { ...good, eventId: "campaign_created:camp2" },
        CTX_CAMPAIGN,
        change,
      ),
    ).toBe(false);
    // Marker missing from the title → reject.
    expect(
      MC_CAMPAIGN_CREATED_SPEC.identityMatches(
        { ...good, triggerPayload: { ...good.triggerPayload!, title: "Q3 newsletter" } },
        CTX_CAMPAIGN,
        change,
      ),
    ).toBe(false);
  });

  it("spec inventory covers exactly the three seedable Mailchimp polling triggers", () => {
    expect(ALL_MAILCHIMP_POLLING_SPECS.map((s) => s.label)).toEqual([
      "mailchimp:subscriber_added_to_segment",
      "mailchimp:segment_updated",
      "mailchimp:campaign_created",
    ]);
  });
});
