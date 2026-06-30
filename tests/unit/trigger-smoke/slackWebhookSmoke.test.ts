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
  ALL_SLACK_WEBHOOK_SPECS,
  type SlackWebhookTriggerSpec,
  type SlackWebhookSmokeDeps,
  type SlackWebhookSmokeIdentity,
  type SlackWebhookSmokeRun,
} from "@/tests/trigger-smoke/slackWebhookSmoke";

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
