/**
 * @jest-environment node
 *
 * Unit tests for the GitHub webhook trigger-smoke orchestrator
 * (tests/trigger-smoke/githubWebhookSmoke.ts) with injected fakes. No DB, no
 * route, no provider — proves the direct-seed orchestration contract:
 *   - the direct-seeded row must carry the canonical dispatch key (new_commit)
 *   - baseline-first (no runs before delivery)
 *   - delivery non-200 fails
 *   - exactly one run after delivery; its trigger event identifies the synthetic
 *     delivery (deliveryId + repo + head commit sha)
 *   - terminal must be 'succeeded'
 *   - dedup: re-sending the same delivery id keeps it at one run
 *   - cleanup ALWAYS runs (even when the body throws)
 */
import {
  runGitHubWebhookSmoke,
  GITHUB_NEW_COMMIT_EVENT_TYPE,
  type GitHubWebhookSmokeDeps,
  type GitHubWebhookSmokeIdentity,
  type GitHubWebhookSmokeRun,
} from "@/tests/trigger-smoke/githubWebhookSmoke";

const FAST = { afterDeliverAttempts: 1, afterDeliverSleepMs: 0, dedupSettleMs: 0 } as const;

const IDENTITY: GitHubWebhookSmokeIdentity = {
  deliveryId: "delivery-test-1",
  repoOwner: "crsmoke-owner",
  repoName: "crsmoke-repo",
  repoFullName: "crsmoke-owner/crsmoke-repo",
  commitSha: "abc123def4560000000000000000000000000000",
  commitMessage: "crsmoke synthetic commit",
  hookId: "crsmoke-hook-1",
};

interface FakeOpts {
  seededEventType?: string | null;
  preexistingRuns?: number;
  deliverStatus?: number;
  deliverPushesRun?: boolean;
  corruptPayload?: boolean;
  drainStatus?: GitHubWebhookSmokeRun["status"];
  dedupBroken?: boolean;
  throwOnSeed?: boolean;
}

interface FakeState {
  workflowCreated: boolean;
  seeded: boolean;
  cleanedWorkflow: boolean;
  cleanedDedup: boolean;
  deliveries: number;
}

function makeFakeDeps(opts: FakeOpts = {}): {
  deps: GitHubWebhookSmokeDeps;
  state: FakeState;
} {
  const runs: GitHubWebhookSmokeRun[] = [];
  for (let i = 0; i < (opts.preexistingRuns ?? 0); i += 1) {
    runs.push({ runId: `pre-${i}`, status: "queued", triggerPayload: null, eventId: null, eventType: null });
  }
  const seen = new Set<string>();
  const state: FakeState = {
    workflowCreated: false,
    seeded: false,
    cleanedWorkflow: false,
    cleanedDedup: false,
    deliveries: 0,
  };

  function pushRun(identity: GitHubWebhookSmokeIdentity): void {
    const payload = opts.corruptPayload
      ? { eventName: "push", repository: "wrong/repo", head_commit: { id: "deadbeef" } }
      : {
          eventName: "push",
          repository: identity.repoFullName,
          owner: identity.repoOwner,
          head_commit: { id: identity.commitSha, message: identity.commitMessage },
        };
    runs.push({
      runId: `run-${runs.length + 1}`,
      status: "queued",
      triggerPayload: payload,
      eventId: identity.deliveryId,
      eventType: GITHUB_NEW_COMMIT_EVENT_TYPE,
    });
  }

  const deps: GitHubWebhookSmokeDeps = {
    mintIdentity: () => IDENTITY,
    async createActiveSmokeWorkflow() {
      state.workflowCreated = true;
      return { workflowId: "wf-test" };
    },
    async seedTriggerResource() {
      state.seeded = true;
      if (opts.throwOnSeed) throw new Error("seed boom");
      return {
        seededEventType:
          opts.seededEventType === undefined ? GITHUB_NEW_COMMIT_EVENT_TYPE : opts.seededEventType,
      };
    },
    async deliverSyntheticEvent({ identity }) {
      state.deliveries += 1;
      const status = opts.deliverStatus ?? 200;
      if (status !== 200) return { httpStatus: status };
      const isRedeliver = seen.has(identity.deliveryId);
      if (!isRedeliver) {
        seen.add(identity.deliveryId);
        if (opts.deliverPushesRun ?? true) pushRun(identity);
      } else if (opts.dedupBroken) {
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
        (run as { status: GitHubWebhookSmokeRun["status"] }).status =
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

describe("runGitHubWebhookSmoke — happy path", () => {
  it("passes: seed → baseline 0 → deliver → 1 run identified → succeeded → dedup holds → cleaned", async () => {
    const { deps, state } = makeFakeDeps();
    const r = await runGitHubWebhookSmoke(deps, FAST);

    expect(r.outcome).toBe("pass");
    expect(r.seededEventType).toBe(GITHUB_NEW_COMMIT_EVENT_TYPE);
    expect(r.baselineRunCount).toBe(0);
    expect(r.deliverHttpStatus).toBe(200);
    expect(r.afterRunCount).toBe(1);
    expect(r.identityMatched).toBe(true);
    expect(r.terminalStatus).toBe("succeeded");
    expect(r.afterRedeliverRunCount).toBe(1);
    expect(r.dedupProven).toBe(true);
    expect(r.cleaned).toBe(true);
    expect(r.eventId).toBe(IDENTITY.deliveryId);
    expect(state.deliveries).toBe(2);
    expect(state.seeded).toBe(true);
    expect(state.cleanedWorkflow).toBe(true);
    expect(state.cleanedDedup).toBe(true);
  });
});

describe("runGitHubWebhookSmoke — failure branches", () => {
  it("fails when the seeded row stored a non-canonical event_type", async () => {
    const { deps } = makeFakeDeps({ seededEventType: "github.new_commit" });
    const r = await runGitHubWebhookSmoke(deps, FAST);
    expect(r.outcome).toBe("fail");
    expect(r.reason).toMatch(/event_type/);
    expect(r.seededEventType).toBe("github.new_commit");
    expect(r.cleaned).toBe(true);
  });

  it("fails on baseline violation (runs exist before delivery)", async () => {
    const { deps, state } = makeFakeDeps({ preexistingRuns: 1 });
    const r = await runGitHubWebhookSmoke(deps, FAST);
    expect(r.outcome).toBe("fail");
    expect(r.reason).toMatch(/baseline/);
    expect(r.baselineRunCount).toBe(1);
    expect(state.deliveries).toBe(0);
    expect(r.cleaned).toBe(true);
  });

  it("fails when the webhook route returns non-200", async () => {
    const { deps } = makeFakeDeps({ deliverStatus: 401 });
    const r = await runGitHubWebhookSmoke(deps, FAST);
    expect(r.outcome).toBe("fail");
    expect(r.deliverHttpStatus).toBe(401);
    expect(r.cleaned).toBe(true);
  });

  it("fails when no run appears after delivery", async () => {
    const { deps } = makeFakeDeps({ deliverPushesRun: false });
    const r = await runGitHubWebhookSmoke(deps, FAST);
    expect(r.outcome).toBe("fail");
    expect(r.reason).toMatch(/exactly 1 run/);
    expect(r.afterRunCount).toBe(0);
    expect(r.cleaned).toBe(true);
  });

  it("fails when the fired run does not identify the synthetic delivery", async () => {
    const { deps } = makeFakeDeps({ corruptPayload: true });
    const r = await runGitHubWebhookSmoke(deps, FAST);
    expect(r.outcome).toBe("fail");
    expect(r.reason).toMatch(/did not identify/);
    expect(r.identityMatched).toBe(false);
    expect(r.cleaned).toBe(true);
  });

  it("fails when the drained run is not terminal 'succeeded'", async () => {
    const { deps } = makeFakeDeps({ drainStatus: "failed" });
    const r = await runGitHubWebhookSmoke(deps, FAST);
    expect(r.outcome).toBe("fail");
    expect(r.terminalStatus).toBe("failed");
    expect(r.identityMatched).toBe(true);
    expect(r.cleaned).toBe(true);
  });

  it("fails when dedup does not hold (a second run appears on re-send)", async () => {
    const { deps } = makeFakeDeps({ dedupBroken: true });
    const r = await runGitHubWebhookSmoke(deps, FAST);
    expect(r.outcome).toBe("fail");
    expect(r.reason).toMatch(/dedup/);
    expect(r.afterRedeliverRunCount).toBe(2);
    expect(r.dedupProven).toBe(false);
    expect(r.cleaned).toBe(true);
  });

  it("still cleans up when the body throws", async () => {
    const { deps, state } = makeFakeDeps({ throwOnSeed: true });
    const r = await runGitHubWebhookSmoke(deps, FAST);
    expect(r.outcome).toBe("fail");
    expect(r.reason).toMatch(/seed boom/);
    expect(state.workflowCreated).toBe(true);
    expect(state.cleanedWorkflow).toBe(true);
    expect(state.cleanedDedup).toBe(true);
    expect(r.cleaned).toBe(true);
  });
});
