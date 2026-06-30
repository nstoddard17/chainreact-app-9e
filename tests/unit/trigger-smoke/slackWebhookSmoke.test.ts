/**
 * @jest-environment node
 *
 * Unit tests for the Slack webhook trigger-smoke orchestrator
 * (tests/trigger-smoke/slackWebhookSmoke.ts) with injected fakes. No DB, no
 * route, no provider — proves the orchestration contract:
 *   - registration must store the canonical dispatch key
 *   - baseline-first (no runs before delivery)
 *   - delivery non-200 fails
 *   - exactly one run after delivery; its trigger event identifies the synthetic
 *   - terminal must be 'succeeded'
 *   - dedup: re-sending the same event_id keeps it at one run
 *   - cleanup ALWAYS runs (even when the body throws)
 */
import {
  runSlackWebhookSmoke,
  SLACK_CHANNEL_CREATED_EVENT_TYPE,
  type SlackWebhookSmokeDeps,
  type SlackWebhookSmokeIdentity,
  type SlackWebhookSmokeRun,
} from "@/tests/trigger-smoke/slackWebhookSmoke";

const FAST = { afterDeliverAttempts: 1, afterDeliverSleepMs: 0, dedupSettleMs: 0 } as const;

const IDENTITY: SlackWebhookSmokeIdentity = {
  eventId: "Ev-test-1",
  channelId: "C-TEST-1",
  channelName: "crsmoke-chan-test",
  teamId: "T-TEST-1",
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
}

function makeFakeDeps(opts: FakeOpts = {}): {
  deps: SlackWebhookSmokeDeps;
  state: FakeState;
} {
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
  };

  function pushRun(identity: SlackWebhookSmokeIdentity): void {
    const channel = opts.corruptPayload
      ? { id: "C-WRONG", name: "not-the-marker" }
      : { id: identity.channelId, name: identity.channelName };
    runs.push({
      runId: `run-${runs.length + 1}`,
      status: "queued",
      triggerPayload: { type: "channel_created", channel },
      eventId: identity.eventId,
      eventType: SLACK_CHANNEL_CREATED_EVENT_TYPE,
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
          opts.registeredEventType === undefined
            ? SLACK_CHANNEL_CREATED_EVENT_TYPE
            : opts.registeredEventType,
      };
    },
    async deliverSyntheticEvent({ identity }) {
      state.deliveries += 1;
      const status = opts.deliverStatus ?? 200;
      if (status !== 200) return { httpStatus: status };
      const isRedeliver = seen.has(identity.eventId);
      if (!isRedeliver) {
        seen.add(identity.eventId);
        if (opts.deliverPushesRun ?? true) pushRun(identity);
      } else if (opts.dedupBroken) {
        // Simulate a dedup failure: a second run appears on re-send.
        pushRun(identity);
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

describe("runSlackWebhookSmoke — happy path", () => {
  it("passes: baseline 0 → deliver → 1 run identified → succeeded → dedup holds → cleaned", async () => {
    const { deps, state } = makeFakeDeps();
    const r = await runSlackWebhookSmoke(deps, FAST);

    expect(r.outcome).toBe("pass");
    expect(r.registeredEventType).toBe(SLACK_CHANNEL_CREATED_EVENT_TYPE);
    expect(r.baselineRunCount).toBe(0);
    expect(r.deliverHttpStatus).toBe(200);
    expect(r.afterRunCount).toBe(1);
    expect(r.identityMatched).toBe(true);
    expect(r.terminalStatus).toBe("succeeded");
    expect(r.afterRedeliverRunCount).toBe(1);
    expect(r.dedupProven).toBe(true);
    expect(r.cleaned).toBe(true);
    expect(r.eventId).toBe(IDENTITY.eventId);
    // Delivered twice (initial + dedup re-send), both cleanups ran.
    expect(state.deliveries).toBe(2);
    expect(state.cleanedWorkflow).toBe(true);
    expect(state.cleanedDedup).toBe(true);
  });
});

describe("runSlackWebhookSmoke — failure branches", () => {
  it("fails when registration stored a non-canonical event_type", async () => {
    const { deps } = makeFakeDeps({ registeredEventType: "channel_created" });
    const r = await runSlackWebhookSmoke(deps, FAST);
    expect(r.outcome).toBe("fail");
    expect(r.reason).toMatch(/event_type/);
    expect(r.registeredEventType).toBe("channel_created");
    expect(r.cleaned).toBe(true);
  });

  it("fails on baseline violation (runs exist before delivery)", async () => {
    const { deps, state } = makeFakeDeps({ preexistingRuns: 1 });
    const r = await runSlackWebhookSmoke(deps, FAST);
    expect(r.outcome).toBe("fail");
    expect(r.reason).toMatch(/baseline/);
    expect(r.baselineRunCount).toBe(1);
    // Never delivered an event (baseline guard short-circuits first).
    expect(state.deliveries).toBe(0);
    expect(r.cleaned).toBe(true);
  });

  it("fails when the webhook route returns non-200", async () => {
    const { deps } = makeFakeDeps({ deliverStatus: 401 });
    const r = await runSlackWebhookSmoke(deps, FAST);
    expect(r.outcome).toBe("fail");
    expect(r.deliverHttpStatus).toBe(401);
    expect(r.cleaned).toBe(true);
  });

  it("fails when no run appears after delivery", async () => {
    const { deps } = makeFakeDeps({ deliverPushesRun: false });
    const r = await runSlackWebhookSmoke(deps, FAST);
    expect(r.outcome).toBe("fail");
    expect(r.reason).toMatch(/exactly 1 run/);
    expect(r.afterRunCount).toBe(0);
    expect(r.cleaned).toBe(true);
  });

  it("fails when the fired run does not identify the synthetic event", async () => {
    const { deps } = makeFakeDeps({ corruptPayload: true });
    const r = await runSlackWebhookSmoke(deps, FAST);
    expect(r.outcome).toBe("fail");
    expect(r.reason).toMatch(/did not identify/);
    expect(r.identityMatched).toBe(false);
    expect(r.cleaned).toBe(true);
  });

  it("fails when the drained run is not terminal 'succeeded'", async () => {
    const { deps } = makeFakeDeps({ drainStatus: "failed" });
    const r = await runSlackWebhookSmoke(deps, FAST);
    expect(r.outcome).toBe("fail");
    expect(r.terminalStatus).toBe("failed");
    expect(r.identityMatched).toBe(true);
    expect(r.cleaned).toBe(true);
  });

  it("fails when dedup does not hold (a second run appears on re-send)", async () => {
    const { deps } = makeFakeDeps({ dedupBroken: true });
    const r = await runSlackWebhookSmoke(deps, FAST);
    expect(r.outcome).toBe("fail");
    expect(r.reason).toMatch(/dedup/);
    expect(r.afterRedeliverRunCount).toBe(2);
    expect(r.dedupProven).toBe(false);
    expect(r.cleaned).toBe(true);
  });

  it("still cleans up when the body throws", async () => {
    const { deps, state } = makeFakeDeps({ throwOnArm: true });
    const r = await runSlackWebhookSmoke(deps, FAST);
    expect(r.outcome).toBe("fail");
    expect(r.reason).toMatch(/arm boom/);
    // Workflow was created before the throw → cleanup must still run.
    expect(state.workflowCreated).toBe(true);
    expect(state.cleanedWorkflow).toBe(true);
    expect(state.cleanedDedup).toBe(true);
    expect(r.cleaned).toBe(true);
  });
});
