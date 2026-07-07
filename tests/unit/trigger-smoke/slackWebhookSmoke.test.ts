/**
 * @jest-environment node
 *
 * Unit tests for the Slack webhook trigger-smoke orchestrator
 * (tests/trigger-smoke/slackWebhookSmoke.ts) with injected fakes. No DB, no
 * route, no provider — proves the spec-driven orchestration contract for BOTH
 * registered Slack webhook specs:
 *   - registration must store the canonical dispatch key
 *   - baseline-first (no runs before delivery)
 *   - delivery non-200 fails
 *   - exactly one run after delivery; its trigger event identifies the synthetic
 *   - terminal must be 'succeeded'
 *   - dedup: re-sending the same event_id keeps it at one run
 *   - cleanup ALWAYS runs (even when the body throws)
 *   - the file_shared spec's identity rides on file_id + channel_id (snake_case)
 */
import {
  runSlackWebhookSmoke,
  CHANNEL_CREATED_SPEC,
  FILE_SHARED_SPEC,
  MEMBER_JOINED_CHANNEL_SPEC,
  MEMBER_LEFT_CHANNEL_SPEC,
  REACTION_ADDED_SPEC,
  REACTION_REMOVED_SPEC,
  MESSAGE_CHANNEL_SPEC,
  MESSAGE_CHANNEL_FILTERED_SPEC,
  MESSAGE_CHANNEL_FILTER_CHANNEL_ID,
  MESSAGE_GROUP_SPEC,
  MESSAGE_IM_SPEC,
  MESSAGE_MPIM_SPEC,
  ALL_SLACK_WEBHOOK_SPECS,
  type SlackWebhookTriggerSpec,
  type SlackWebhookSmokeDeps,
  type SlackWebhookSmokeIdentity,
  type SlackWebhookSmokeRun,
} from "@/tests/trigger-smoke/slackWebhookSmoke";
import {
  normalizeSlackEvent,
  type SlackEventCallbackPayload,
} from "@/integrations/slack/webhooks/normalize";
import { newMessageChannelFilter } from "@/integrations/slack/triggers/newMessageChannel/filter";
import { newMessagePrivateChannelFilter } from "@/integrations/slack/triggers/newMessagePrivateChannel/filter";
import { newDirectMessageFilter } from "@/integrations/slack/triggers/newDirectMessage/filter";
import { newGroupDirectMessageFilter } from "@/integrations/slack/triggers/newGroupDirectMessage/filter";

const FAST = { afterDeliverAttempts: 1, afterDeliverSleepMs: 0, dedupSettleMs: 0 } as const;

const IDENTITY: SlackWebhookSmokeIdentity = {
  eventId: "Ev-test-1",
  teamId: "T-TEST-1",
  channelId: "C-TEST-1",
  channelName: "crsmoke-chan-test",
  fileId: "F-TEST-1",
  userId: "U-TEST-1",
};

interface FakeOpts {
  registeredEventType?: string | null;
  preexistingRuns?: number;
  deliverStatus?: number;
  deliverPushesRun?: boolean;
  corruptPayload?: boolean;
  drainStatus?: SlackWebhookSmokeRun["status"];
  dedupBroken?: boolean;
  throwOnArm?: boolean;
}

interface FakeState {
  workflowCreated: boolean;
  armCalled: boolean;
  cleanedWorkflow: boolean;
  cleanedDedup: boolean;
  deliveries: number;
  lastInnerEvent: Record<string, unknown> | null;
}

function makeFakeDeps(
  spec: SlackWebhookTriggerSpec,
  opts: FakeOpts = {},
): { deps: SlackWebhookSmokeDeps; state: FakeState } {
  const runs: SlackWebhookSmokeRun[] = [];
  for (let i = 0; i < (opts.preexistingRuns ?? 0); i += 1) {
    runs.push({ runId: `pre-${i}`, status: "queued", triggerPayload: null, eventId: null, eventType: null });
  }
  const seen = new Set<string>();
  const state: FakeState = {
    workflowCreated: false,
    armCalled: false,
    cleanedWorkflow: false,
    cleanedDedup: false,
    deliveries: 0,
    lastInnerEvent: null,
  };

  function pushRun(
    identity: SlackWebhookSmokeIdentity,
    innerEvent: Record<string, unknown>,
  ): void {
    // Echo what the route would persist: the normalized inner event becomes the
    // run's trigger payload; eventType is the spec's canonical type. Corruption
    // mangles the payload so identityMatches fails.
    const payload = opts.corruptPayload ? { type: "wrong", bad: true } : innerEvent;
    runs.push({
      runId: `run-${runs.length + 1}`,
      status: "queued",
      triggerPayload: payload,
      eventId: identity.eventId,
      eventType: spec.eventType,
    });
  }

  const deps: SlackWebhookSmokeDeps = {
    mintIdentity: () => IDENTITY,
    async createActiveSmokeWorkflow() {
      state.workflowCreated = true;
      return { workflowId: "wf-test" };
    },
    async armWebhookTrigger() {
      state.armCalled = true;
      if (opts.throwOnArm) throw new Error("arm boom");
      return {
        registeredEventType:
          opts.registeredEventType === undefined ? spec.eventType : opts.registeredEventType,
      };
    },
    async deliverSyntheticEvent({ identity, innerEvent }) {
      state.deliveries += 1;
      state.lastInnerEvent = innerEvent;
      const status = opts.deliverStatus ?? 200;
      if (status !== 200) return { httpStatus: status };
      const isRedeliver = seen.has(identity.eventId);
      if (!isRedeliver) {
        seen.add(identity.eventId);
        if (opts.deliverPushesRun ?? true) pushRun(identity, innerEvent);
      } else if (opts.dedupBroken) {
        pushRun(identity, innerEvent);
      }
      return { httpStatus: 200 };
    },
    async listRuns() {
      return runs.map((r) => ({ ...r }));
    },
    async drainRun(runId) {
      const run = runs.find((r) => r.runId === runId);
      if (run) {
        (run as { status: SlackWebhookSmokeRun["status"] }).status =
          opts.drainStatus === undefined ? "succeeded" : opts.drainStatus;
      }
    },
    async readRun(runId) {
      const run = runs.find((r) => r.runId === runId);
      return run ? { ...run } : null;
    },
    async cleanupWorkflow() {
      state.cleanedWorkflow = true;
    },
    async cleanupDedup() {
      state.cleanedDedup = true;
    },
    async sleep() {
      /* no-op */
    },
  };
  return { deps, state };
}

describe("runSlackWebhookSmoke — happy path (both specs)", () => {
  it.each(ALL_SLACK_WEBHOOK_SPECS.map((s) => [s.label, s] as const))(
    "%s passes: baseline 0 → deliver → 1 run identified → succeeded → dedup holds → cleaned",
    async (_label, spec) => {
      const { deps, state } = makeFakeDeps(spec);
      const r = await runSlackWebhookSmoke(deps, spec, FAST);

      expect(r.outcome).toBe("pass");
      expect(r.triggerLabel).toBe(spec.label);
      expect(r.registeredEventType).toBe(spec.eventType);
      expect(r.baselineRunCount).toBe(0);
      expect(r.deliverHttpStatus).toBe(200);
      expect(r.afterRunCount).toBe(1);
      expect(r.identityMatched).toBe(true);
      expect(r.terminalStatus).toBe("succeeded");
      expect(r.afterRedeliverRunCount).toBe(1);
      expect(r.dedupProven).toBe(true);
      expect(r.cleaned).toBe(true);
      expect(state.deliveries).toBe(2);
      expect(state.cleanedWorkflow).toBe(true);
      expect(state.cleanedDedup).toBe(true);
    },
  );

  it("file_shared synthetic inner event carries snake_case id stubs only (no name/bytes)", () => {
    const inner = FILE_SHARED_SPEC.buildSyntheticInnerEvent(IDENTITY);
    expect(inner.type).toBe("file_shared");
    expect(inner.file_id).toBe(IDENTITY.fileId);
    expect(inner.channel_id).toBe(IDENTITY.channelId);
    expect(inner.user_id).toBe(IDENTITY.userId);
    expect(inner.file).toEqual({ id: IDENTITY.fileId });
    // Metadata only — no name, mimeType, size, url, or bytes leak into the payload.
    expect(inner).not.toHaveProperty("name");
    expect(inner).not.toHaveProperty("url_private");
    expect(inner).not.toHaveProperty("content");
  });

  it("member_joined/left synthetic events carry channel + user id stubs only", () => {
    for (const spec of [MEMBER_JOINED_CHANNEL_SPEC, MEMBER_LEFT_CHANNEL_SPEC] as const) {
      const inner = spec.buildSyntheticInnerEvent(IDENTITY);
      expect(inner.channel).toBe(IDENTITY.channelId);
      expect(inner.user).toBe(IDENTITY.userId);
      // No message body / text / name anywhere in a membership event.
      expect(inner).not.toHaveProperty("text");
      expect(inner).not.toHaveProperty("name");
      // The fired run's identity keys on channel + user.
      const run: SlackWebhookSmokeRun = {
        runId: "r", status: "queued", triggerPayload: inner, eventId: IDENTITY.eventId, eventType: spec.eventType,
      };
      expect(spec.identityMatches(run, IDENTITY)).toBe(true);
    }
  });

  it("reaction_added/removed carry a standard emoji + item reference, NO message body", () => {
    for (const spec of [REACTION_ADDED_SPEC, REACTION_REMOVED_SPEC] as const) {
      const inner = spec.buildSyntheticInnerEvent(IDENTITY);
      expect(inner.reaction).toBe("white_check_mark");
      expect(inner.item).toEqual({ type: "message", channel: IDENTITY.channelId, ts: "1700000000.000100" });
      // Only a ts reference — NO message text/body is carried.
      expect(inner).not.toHaveProperty("text");
      expect((inner.item as Record<string, unknown>)).not.toHaveProperty("text");
      const run: SlackWebhookSmokeRun = {
        runId: "r", status: "queued", triggerPayload: inner, eventId: IDENTITY.eventId, eventType: spec.eventType,
      };
      expect(spec.identityMatches(run, IDENTITY)).toBe(true);
    }
  });

  it("identity fails when the payload type is a different Slack event (no cross-spec match)", () => {
    const wrong: SlackWebhookSmokeRun = {
      runId: "r", status: "queued",
      triggerPayload: { type: "member_left_channel", channel: IDENTITY.channelId, user: IDENTITY.userId },
      eventId: IDENTITY.eventId, eventType: MEMBER_JOINED_CHANNEL_SPEC.eventType,
    };
    // A member_left payload must NOT satisfy the member_joined spec.
    expect(MEMBER_JOINED_CHANNEL_SPEC.identityMatches(wrong, IDENTITY)).toBe(false);
  });
});

const MESSAGE_SPECS = [
  MESSAGE_CHANNEL_SPEC,
  MESSAGE_CHANNEL_FILTERED_SPEC,
  MESSAGE_GROUP_SPEC,
  MESSAGE_IM_SPEC,
  MESSAGE_MPIM_SPEC,
] as const;

/** Wrap a spec's inner event in the event_callback envelope and run the REAL normalizer. */
function normalizeSpecEvent(spec: SlackWebhookTriggerSpec, identity: SlackWebhookSmokeIdentity) {
  const inner = spec.buildSyntheticInnerEvent(identity);
  return normalizeSlackEvent({
    type: "event_callback",
    team_id: identity.teamId,
    event_id: identity.eventId,
    event_time: 1700000000,
    event: inner as SlackEventCallbackPayload["event"],
  });
}

describe("Slack message.* specs — shape, real normalizer, real filters", () => {
  it.each(MESSAGE_SPECS.map((s) => [s.label, s] as const))(
    "%s: the REAL normalizer derives the spec's canonical eventType and preserves the crsmoke marker text",
    (_label, spec) => {
      const event = normalizeSpecEvent(spec, IDENTITY);
      expect(event.eventType).toBe(spec.eventType);
      expect(event.eventId).toBe(IDENTITY.eventId);
      const text = (event.payload as Record<string, unknown>).text;
      expect(typeof text).toBe("string");
      expect(text).toContain("crsmoke");
      expect(text).toContain(IDENTITY.eventId);
      // The run the route would persist satisfies the spec's identity matcher.
      const run: SlackWebhookSmokeRun = {
        runId: "r",
        status: "queued",
        triggerPayload: event.payload as Record<string, unknown>,
        eventId: event.eventId,
        eventType: event.eventType,
      };
      expect(spec.identityMatches(run, IDENTITY)).toBe(true);
    },
  );

  it("channel kinds are shape-faithful: channel/group C…, im D…, mpim G…, channel_type authoritative", () => {
    const chan = MESSAGE_CHANNEL_SPEC.buildSyntheticInnerEvent(IDENTITY);
    expect(chan.channel_type).toBe("channel");
    expect(String(chan.channel).startsWith("C")).toBe(true);
    const group = MESSAGE_GROUP_SPEC.buildSyntheticInnerEvent(IDENTITY);
    expect(group.channel_type).toBe("group");
    expect(String(group.channel).startsWith("C")).toBe(true); // modern private channel
    const im = MESSAGE_IM_SPEC.buildSyntheticInnerEvent(IDENTITY);
    expect(im.channel_type).toBe("im");
    expect(String(im.channel).startsWith("D")).toBe(true);
    const mpim = MESSAGE_MPIM_SPEC.buildSyntheticInnerEvent(IDENTITY);
    expect(mpim.channel_type).toBe("mpim");
    expect(String(mpim.channel).startsWith("G")).toBe(true);
  });

  it("message text is smoke-minted marker only — no user content fields beyond the contract shape", () => {
    for (const spec of MESSAGE_SPECS) {
      const inner = spec.buildSyntheticInnerEvent(IDENTITY);
      expect(inner.type).toBe("message");
      expect(inner.text).toBe(`crsmoke synthetic message marker ${IDENTITY.eventId}`);
      expect(inner.user).toBe(IDENTITY.userId);
      // No attachments / files / blocks with real content ride along.
      expect(inner).not.toHaveProperty("attachments");
      expect(inner).not.toHaveProperty("files");
    }
  });

  it("filtered spec arms a regex-valid pinned channelId and the REAL filter parses + matches it", () => {
    const wf = MESSAGE_CHANNEL_FILTERED_SPEC.buildWorkflow();
    const trigger = wf.definition.nodes.find((n) => n.id === wf.triggerNodeId)!;
    expect(trigger.config).toEqual({ channelId: MESSAGE_CHANNEL_FILTER_CHANNEL_ID });
    expect(MESSAGE_CHANNEL_FILTER_CHANNEL_ID).toMatch(/^C[A-Z0-9]+$/);

    const event = normalizeSpecEvent(MESSAGE_CHANNEL_FILTERED_SPEC, IDENTITY);
    const config = newMessageChannelFilter.parseConfig(trigger.config);
    expect(newMessageChannelFilter.evaluate(event, config)).toEqual({ kind: "match" });
  });

  it("REAL filter drops a filtered-config event from a different channel (negative stays unit-proven)", () => {
    const config = newMessageChannelFilter.parseConfig({
      channelId: MESSAGE_CHANNEL_FILTER_CHANNEL_ID,
    });
    const event = normalizeSpecEvent(MESSAGE_CHANNEL_SPEC, IDENTITY); // channel = minted C-CRSMOKE-… id
    const result = newMessageChannelFilter.evaluate(event, config);
    expect(result.kind).toBe("no-match");
  });

  it("each message kind's REAL filter returns match on the empty (match-all) config", () => {
    const pairs = [
      [MESSAGE_CHANNEL_SPEC, newMessageChannelFilter],
      [MESSAGE_GROUP_SPEC, newMessagePrivateChannelFilter],
      [MESSAGE_IM_SPEC, newDirectMessageFilter],
      [MESSAGE_MPIM_SPEC, newGroupDirectMessageFilter],
    ] as const;
    for (const [spec, filter] of pairs) {
      const event = normalizeSpecEvent(spec, IDENTITY);
      expect(filter.eventType).toBe(spec.eventType);
      const config = filter.parseConfig({});
      expect(filter.evaluate(event, config)).toEqual({ kind: "match" });
    }
  });

  it("message identity fails when the persisted text lost the marker", () => {
    const inner = MESSAGE_CHANNEL_SPEC.buildSyntheticInnerEvent(IDENTITY);
    const run: SlackWebhookSmokeRun = {
      runId: "r",
      status: "queued",
      triggerPayload: { ...inner, text: "some other text" },
      eventId: IDENTITY.eventId,
      eventType: MESSAGE_CHANNEL_SPEC.eventType,
    };
    expect(MESSAGE_CHANNEL_SPEC.identityMatches(run, IDENTITY)).toBe(false);
  });
});

describe("runSlackWebhookSmoke — failure branches (channel_created)", () => {
  const spec = CHANNEL_CREATED_SPEC;

  it("fails when registration stored a non-canonical event_type", async () => {
    const { deps } = makeFakeDeps(spec, { registeredEventType: "channel_created" });
    const r = await runSlackWebhookSmoke(deps, spec, FAST);
    expect(r.outcome).toBe("fail");
    expect(r.reason).toMatch(/event_type/);
    expect(r.registeredEventType).toBe("channel_created");
    expect(r.cleaned).toBe(true);
  });

  it("fails on baseline violation (runs exist before delivery)", async () => {
    const { deps, state } = makeFakeDeps(spec, { preexistingRuns: 1 });
    const r = await runSlackWebhookSmoke(deps, spec, FAST);
    expect(r.outcome).toBe("fail");
    expect(r.reason).toMatch(/baseline/);
    expect(r.baselineRunCount).toBe(1);
    expect(state.deliveries).toBe(0);
    expect(r.cleaned).toBe(true);
  });

  it("fails when the webhook route returns non-200", async () => {
    const { deps } = makeFakeDeps(spec, { deliverStatus: 401 });
    const r = await runSlackWebhookSmoke(deps, spec, FAST);
    expect(r.outcome).toBe("fail");
    expect(r.deliverHttpStatus).toBe(401);
    expect(r.cleaned).toBe(true);
  });

  it("fails when no run appears after delivery", async () => {
    const { deps } = makeFakeDeps(spec, { deliverPushesRun: false });
    const r = await runSlackWebhookSmoke(deps, spec, FAST);
    expect(r.outcome).toBe("fail");
    expect(r.reason).toMatch(/exactly 1 run/);
    expect(r.afterRunCount).toBe(0);
    expect(r.cleaned).toBe(true);
  });

  it("fails when the fired run does not identify the synthetic event", async () => {
    const { deps } = makeFakeDeps(spec, { corruptPayload: true });
    const r = await runSlackWebhookSmoke(deps, spec, FAST);
    expect(r.outcome).toBe("fail");
    expect(r.reason).toMatch(/did not identify/);
    expect(r.identityMatched).toBe(false);
    expect(r.cleaned).toBe(true);
  });

  it("fails when the drained run is not terminal 'succeeded'", async () => {
    const { deps } = makeFakeDeps(spec, { drainStatus: "failed" });
    const r = await runSlackWebhookSmoke(deps, spec, FAST);
    expect(r.outcome).toBe("fail");
    expect(r.terminalStatus).toBe("failed");
    expect(r.identityMatched).toBe(true);
    expect(r.cleaned).toBe(true);
  });

  it("fails when dedup does not hold (a second run appears on re-send)", async () => {
    const { deps } = makeFakeDeps(spec, { dedupBroken: true });
    const r = await runSlackWebhookSmoke(deps, spec, FAST);
    expect(r.outcome).toBe("fail");
    expect(r.reason).toMatch(/dedup/);
    expect(r.afterRedeliverRunCount).toBe(2);
    expect(r.dedupProven).toBe(false);
    expect(r.cleaned).toBe(true);
  });

  it("still cleans up when the body throws", async () => {
    const { deps, state } = makeFakeDeps(spec, { throwOnArm: true });
    const r = await runSlackWebhookSmoke(deps, spec, FAST);
    expect(r.outcome).toBe("fail");
    expect(r.reason).toMatch(/arm boom/);
    expect(state.workflowCreated).toBe(true);
    expect(state.cleanedWorkflow).toBe(true);
    expect(state.cleanedDedup).toBe(true);
    expect(r.cleaned).toBe(true);
  });
});
