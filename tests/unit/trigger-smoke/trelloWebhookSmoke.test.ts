/**
 * @jest-environment node
 *
 * Unit tests for the Trello webhook trigger-smoke orchestrator
 * (tests/trigger-smoke/trelloWebhookSmoke.ts) with injected fakes. No DB, no
 * route, no provider — proves the direct-seed orchestration contract:
 *   - the direct-seeded row must carry the canonical dispatch key (new_card)
 *   - baseline-first (no runs before delivery)
 *   - delivery non-200 fails
 *   - exactly one run after delivery; its trigger event identifies the synthetic
 *     card-created (actionId + cardId + boardId)
 *   - terminal must be 'succeeded'
 *   - dedup: re-sending the same action id keeps it at one run
 *   - cleanup ALWAYS runs (even when the body throws)
 */
import {
  runTrelloWebhookSmoke,
  TRELLO_NEW_CARD_EVENT_TYPE,
  type TrelloWebhookSmokeDeps,
  type TrelloWebhookSmokeIdentity,
  type TrelloWebhookSmokeRun,
} from "@/tests/trigger-smoke/trelloWebhookSmoke";

const FAST = { afterDeliverAttempts: 1, afterDeliverSleepMs: 0, dedupSettleMs: 0 } as const;

const IDENTITY: TrelloWebhookSmokeIdentity = {
  actionId: "action-test-1",
  boardId: "crsmoke-board-1",
  cardId: "crsmoke-card-1",
  cardName: "crsmoke card 1",
  listId: "crsmoke-list-1",
};

interface FakeOpts {
  seededEventType?: string | null;
  preexistingRuns?: number;
  deliverStatus?: number;
  deliverPushesRun?: boolean;
  corruptPayload?: boolean;
  drainStatus?: TrelloWebhookSmokeRun["status"];
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
  deps: TrelloWebhookSmokeDeps;
  state: FakeState;
} {
  const runs: TrelloWebhookSmokeRun[] = [];
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

  function pushRun(identity: TrelloWebhookSmokeIdentity): void {
    const payload = opts.corruptPayload
      ? { actionType: "updateCard", cardId: "wrong", boardId: "wrong" }
      : {
          actionType: "createCard",
          classifiedType: "trello.card.created",
          actionId: identity.actionId,
          boardId: identity.boardId,
          cardId: identity.cardId,
          cardName: identity.cardName,
        };
    runs.push({
      runId: `run-${runs.length + 1}`,
      status: "queued",
      triggerPayload: payload,
      eventId: identity.actionId,
      eventType: TRELLO_NEW_CARD_EVENT_TYPE,
    });
  }

  const deps: TrelloWebhookSmokeDeps = {
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
          opts.seededEventType === undefined ? TRELLO_NEW_CARD_EVENT_TYPE : opts.seededEventType,
      };
    },
    async deliverSyntheticEvent({ identity }) {
      state.deliveries += 1;
      const status = opts.deliverStatus ?? 200;
      if (status !== 200) return { httpStatus: status };
      const isRedeliver = seen.has(identity.actionId);
      if (!isRedeliver) {
        seen.add(identity.actionId);
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
        (run as { status: TrelloWebhookSmokeRun["status"] }).status =
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

describe("runTrelloWebhookSmoke — happy path", () => {
  it("passes: seed → baseline 0 → deliver → 1 run identified → succeeded → dedup holds → cleaned", async () => {
    const { deps, state } = makeFakeDeps();
    const r = await runTrelloWebhookSmoke(deps, FAST);

    expect(r.outcome).toBe("pass");
    expect(r.seededEventType).toBe(TRELLO_NEW_CARD_EVENT_TYPE);
    expect(r.baselineRunCount).toBe(0);
    expect(r.deliverHttpStatus).toBe(200);
    expect(r.afterRunCount).toBe(1);
    expect(r.identityMatched).toBe(true);
    expect(r.terminalStatus).toBe("succeeded");
    expect(r.afterRedeliverRunCount).toBe(1);
    expect(r.dedupProven).toBe(true);
    expect(r.cleaned).toBe(true);
    expect(r.eventId).toBe(IDENTITY.actionId);
    expect(state.deliveries).toBe(2);
    expect(state.seeded).toBe(true);
    expect(state.cleanedWorkflow).toBe(true);
    expect(state.cleanedDedup).toBe(true);
  });
});

describe("runTrelloWebhookSmoke — failure branches", () => {
  it("fails when the seeded row stored a non-canonical event_type", async () => {
    const { deps } = makeFakeDeps({ seededEventType: "trello.card.created" });
    const r = await runTrelloWebhookSmoke(deps, FAST);
    expect(r.outcome).toBe("fail");
    expect(r.reason).toMatch(/event_type/);
    expect(r.seededEventType).toBe("trello.card.created");
    expect(r.cleaned).toBe(true);
  });

  it("fails on baseline violation (runs exist before delivery)", async () => {
    const { deps, state } = makeFakeDeps({ preexistingRuns: 1 });
    const r = await runTrelloWebhookSmoke(deps, FAST);
    expect(r.outcome).toBe("fail");
    expect(r.reason).toMatch(/baseline/);
    expect(r.baselineRunCount).toBe(1);
    expect(state.deliveries).toBe(0);
    expect(r.cleaned).toBe(true);
  });

  it("fails when the webhook route returns non-200", async () => {
    const { deps } = makeFakeDeps({ deliverStatus: 401 });
    const r = await runTrelloWebhookSmoke(deps, FAST);
    expect(r.outcome).toBe("fail");
    expect(r.deliverHttpStatus).toBe(401);
    expect(r.cleaned).toBe(true);
  });

  it("fails when no run appears after delivery", async () => {
    const { deps } = makeFakeDeps({ deliverPushesRun: false });
    const r = await runTrelloWebhookSmoke(deps, FAST);
    expect(r.outcome).toBe("fail");
    expect(r.reason).toMatch(/exactly 1 run/);
    expect(r.afterRunCount).toBe(0);
    expect(r.cleaned).toBe(true);
  });

  it("fails when the fired run does not identify the synthetic card-created", async () => {
    const { deps } = makeFakeDeps({ corruptPayload: true });
    const r = await runTrelloWebhookSmoke(deps, FAST);
    expect(r.outcome).toBe("fail");
    expect(r.reason).toMatch(/did not identify/);
    expect(r.identityMatched).toBe(false);
    expect(r.cleaned).toBe(true);
  });

  it("fails when the drained run is not terminal 'succeeded'", async () => {
    const { deps } = makeFakeDeps({ drainStatus: "failed" });
    const r = await runTrelloWebhookSmoke(deps, FAST);
    expect(r.outcome).toBe("fail");
    expect(r.terminalStatus).toBe("failed");
    expect(r.identityMatched).toBe(true);
    expect(r.cleaned).toBe(true);
  });

  it("fails when dedup does not hold (a second run appears on re-send)", async () => {
    const { deps } = makeFakeDeps({ dedupBroken: true });
    const r = await runTrelloWebhookSmoke(deps, FAST);
    expect(r.outcome).toBe("fail");
    expect(r.reason).toMatch(/dedup/);
    expect(r.afterRedeliverRunCount).toBe(2);
    expect(r.dedupProven).toBe(false);
    expect(r.cleaned).toBe(true);
  });

  it("still cleans up when the body throws", async () => {
    const { deps, state } = makeFakeDeps({ throwOnSeed: true });
    const r = await runTrelloWebhookSmoke(deps, FAST);
    expect(r.outcome).toBe("fail");
    expect(r.reason).toMatch(/seed boom/);
    expect(state.workflowCreated).toBe(true);
    expect(state.cleanedWorkflow).toBe(true);
    expect(state.cleanedDedup).toBe(true);
    expect(r.cleaned).toBe(true);
  });
});
