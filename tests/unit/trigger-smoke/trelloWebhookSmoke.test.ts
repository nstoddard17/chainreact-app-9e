/**
 * @jest-environment node
 *
 * Unit tests for the spec-driven Trello webhook trigger-smoke orchestrator
 * (tests/trigger-smoke/trelloWebhookSmoke.ts) with injected fakes. No DB, no route,
 * no provider. The fake's `fakeNormalize` mirrors the RELEVANT fields of the real
 * `normalizeTrelloEvent` mapping (cardId/boardId/classifiedType/fromListId/toListId/
 * closed/changedFields) so each spec's synthetic action shape + identity matcher is
 * exercised together. Proves the direct-seed orchestration contract for all 4 safe
 * lifecycle specs + the standard failure branches.
 */
import {
  runTrelloWebhookSmoke,
  ALL_TRELLO_WEBHOOK_SPECS,
  NEW_CARD_SPEC,
  CARD_MOVED_SPEC,
  CARD_ARCHIVED_SPEC,
  CARD_UPDATED_SPEC,
  COMMENT_ADDED_SPEC,
  MEMBER_CHANGED_SPEC,
  type TrelloWebhookTriggerSpec,
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
  listFromId: "crsmoke-from-1",
  listToId: "crsmoke-to-1",
};

/** Mirror the relevant fields of the real normalizeTrelloEvent output. */
function fakeNormalize(
  action: Record<string, unknown>,
  spec: TrelloWebhookTriggerSpec,
): Record<string, unknown> {
  const data = (action.data ?? {}) as Record<string, unknown>;
  const card = (data.card ?? {}) as Record<string, unknown>;
  const board = (data.board ?? {}) as Record<string, unknown>;
  const listBefore = data.listBefore as Record<string, unknown> | undefined;
  const listAfter = data.listAfter as Record<string, unknown> | undefined;
  const old = data.old as Record<string, unknown> | undefined;
  const member = data.member as Record<string, unknown> | undefined;
  const memberAction =
    action.type === "addMemberToCard"
      ? "added"
      : action.type === "removeMemberFromCard"
        ? "removed"
        : null;
  return {
    actionId: action.id ?? null,
    actionType: action.type ?? null,
    classifiedType: spec.classifiedType,
    boardId: board.id ?? null,
    cardId: card.id ?? null,
    cardName: card.name ?? null,
    fromListId: listBefore?.id ?? null,
    toListId: listAfter?.id ?? null,
    closed: card.closed ?? null,
    changedFields: old ? Object.keys(old) : null,
    commentText: data.text ?? null,
    memberId: data.idMember ?? member?.id ?? null,
    memberAction,
  };
}

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

function makeFakeDeps(
  spec: TrelloWebhookTriggerSpec,
  opts: FakeOpts = {},
): { deps: TrelloWebhookSmokeDeps; state: FakeState } {
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

  function pushRun(
    identity: TrelloWebhookSmokeIdentity,
    action: Record<string, unknown>,
  ): void {
    const payload = opts.corruptPayload
      ? { actionType: "updateCard", classifiedType: "trello.wrong", cardId: "wrong", boardId: "wrong" }
      : fakeNormalize(action, spec);
    runs.push({
      runId: `run-${runs.length + 1}`,
      status: "queued",
      triggerPayload: payload,
      eventId: identity.actionId,
      eventType: spec.eventType,
    });
  }

  const deps: TrelloWebhookSmokeDeps = {
    mintIdentity: () => IDENTITY,
    async createActiveSmokeWorkflow() {
      state.workflowCreated = true;
      return { workflowId: "wf-test" };
    },
    async seedTriggerResource({ eventType }) {
      state.seeded = true;
      if (opts.throwOnSeed) throw new Error("seed boom");
      return {
        seededEventType: opts.seededEventType === undefined ? eventType : opts.seededEventType,
      };
    },
    async deliverSyntheticEvent({ identity, action }) {
      state.deliveries += 1;
      const status = opts.deliverStatus ?? 200;
      if (status !== 200) return { httpStatus: status };
      const isRedeliver = seen.has(identity.actionId);
      if (!isRedeliver) {
        seen.add(identity.actionId);
        if (opts.deliverPushesRun ?? true) pushRun(identity, action);
      } else if (opts.dedupBroken) {
        pushRun(identity, action);
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

describe("runTrelloWebhookSmoke — happy path (all 4 lifecycle specs)", () => {
  it.each(ALL_TRELLO_WEBHOOK_SPECS.map((s) => [s.label, s] as const))(
    "%s passes: seed → baseline 0 → deliver → 1 run identified → succeeded → dedup holds → cleaned",
    async (_label, spec) => {
      const { deps, state } = makeFakeDeps(spec);
      const r = await runTrelloWebhookSmoke(deps, spec, FAST);

      expect(r.outcome).toBe("pass");
      expect(r.triggerLabel).toBe(spec.label);
      expect(r.seededEventType).toBe(spec.eventType);
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

  it("each lifecycle spec's synthetic action carries its distinguishing marker", () => {
    // card_moved → differing listBefore/listAfter; archived → old.closed + card.closed;
    // updated → a generic data.old change with no closed / no list move.
    const moved = CARD_MOVED_SPEC.buildSyntheticAction(IDENTITY) as { data: Record<string, unknown> };
    expect((moved.data.listBefore as { id: string }).id).toBe(IDENTITY.listFromId);
    expect((moved.data.listAfter as { id: string }).id).toBe(IDENTITY.listToId);
    expect(moved.data.old).not.toHaveProperty("closed");

    const archived = CARD_ARCHIVED_SPEC.buildSyntheticAction(IDENTITY) as { data: Record<string, unknown> };
    expect(archived.data.old).toHaveProperty("closed");
    expect((archived.data.card as { closed: boolean }).closed).toBe(true);

    const updated = CARD_UPDATED_SPEC.buildSyntheticAction(IDENTITY) as { data: Record<string, unknown> };
    expect(updated.data.old).not.toHaveProperty("closed");
    expect(updated.data).not.toHaveProperty("listBefore");
    expect(Object.keys(updated.data.old as Record<string, unknown>)).toContain("name");
  });

  it("content specs mint a deterministic crsmoke marker that the identity matcher verifies", () => {
    // comment_added → commentCard with a crsmoke- text marker (no real user content).
    const comment = COMMENT_ADDED_SPEC.buildSyntheticAction(IDENTITY) as { type: string; data: Record<string, unknown> };
    expect(comment.type).toBe("commentCard");
    expect(comment.data.text).toBe(`crsmoke-comment-${IDENTITY.actionId}`);
    // The matcher requires payload.commentText to equal that minted marker.
    const commentRun: TrelloWebhookSmokeRun = {
      runId: "r1",
      status: "queued",
      eventId: IDENTITY.actionId,
      eventType: "comment_added",
      triggerPayload: fakeNormalize(comment as unknown as Record<string, unknown>, COMMENT_ADDED_SPEC),
    };
    expect(COMMENT_ADDED_SPEC.identityMatches(commentRun, IDENTITY)).toBe(true);

    // member_changed → addMemberToCard with a crsmoke- member id (no real PII).
    const member = MEMBER_CHANGED_SPEC.buildSyntheticAction(IDENTITY) as { type: string; data: Record<string, unknown> };
    expect(member.type).toBe("addMemberToCard");
    expect(member.data.idMember).toBe(`crsmoke-added-member-${IDENTITY.actionId}`);
    const memberRun: TrelloWebhookSmokeRun = {
      runId: "r2",
      status: "queued",
      eventId: IDENTITY.actionId,
      eventType: "member_changed",
      triggerPayload: fakeNormalize(member as unknown as Record<string, unknown>, MEMBER_CHANGED_SPEC),
    };
    expect(MEMBER_CHANGED_SPEC.identityMatches(memberRun, IDENTITY)).toBe(true);
    expect((memberRun.triggerPayload as Record<string, unknown>).memberAction).toBe("added");
  });
});

describe("runTrelloWebhookSmoke — failure branches (new_card)", () => {
  const spec = NEW_CARD_SPEC;

  it("fails when the seeded row stored a non-canonical event_type", async () => {
    const { deps } = makeFakeDeps(spec, { seededEventType: "trello.card.created" });
    const r = await runTrelloWebhookSmoke(deps, spec, FAST);
    expect(r.outcome).toBe("fail");
    expect(r.reason).toMatch(/event_type/);
    expect(r.seededEventType).toBe("trello.card.created");
    expect(r.cleaned).toBe(true);
  });

  it("fails on baseline violation (runs exist before delivery)", async () => {
    const { deps, state } = makeFakeDeps(spec, { preexistingRuns: 1 });
    const r = await runTrelloWebhookSmoke(deps, spec, FAST);
    expect(r.outcome).toBe("fail");
    expect(r.reason).toMatch(/baseline/);
    expect(r.baselineRunCount).toBe(1);
    expect(state.deliveries).toBe(0);
    expect(r.cleaned).toBe(true);
  });

  it("fails when the webhook route returns non-200", async () => {
    const { deps } = makeFakeDeps(spec, { deliverStatus: 401 });
    const r = await runTrelloWebhookSmoke(deps, spec, FAST);
    expect(r.outcome).toBe("fail");
    expect(r.deliverHttpStatus).toBe(401);
    expect(r.cleaned).toBe(true);
  });

  it("fails when no run appears after delivery", async () => {
    const { deps } = makeFakeDeps(spec, { deliverPushesRun: false });
    const r = await runTrelloWebhookSmoke(deps, spec, FAST);
    expect(r.outcome).toBe("fail");
    expect(r.reason).toMatch(/exactly 1 run/);
    expect(r.afterRunCount).toBe(0);
    expect(r.cleaned).toBe(true);
  });

  it("fails when the fired run does not identify the synthetic action", async () => {
    const { deps } = makeFakeDeps(spec, { corruptPayload: true });
    const r = await runTrelloWebhookSmoke(deps, spec, FAST);
    expect(r.outcome).toBe("fail");
    expect(r.reason).toMatch(/did not identify/);
    expect(r.identityMatched).toBe(false);
    expect(r.cleaned).toBe(true);
  });

  it("fails when the drained run is not terminal 'succeeded'", async () => {
    const { deps } = makeFakeDeps(spec, { drainStatus: "failed" });
    const r = await runTrelloWebhookSmoke(deps, spec, FAST);
    expect(r.outcome).toBe("fail");
    expect(r.terminalStatus).toBe("failed");
    expect(r.identityMatched).toBe(true);
    expect(r.cleaned).toBe(true);
  });

  it("fails when dedup does not hold (a second run appears on re-send)", async () => {
    const { deps } = makeFakeDeps(spec, { dedupBroken: true });
    const r = await runTrelloWebhookSmoke(deps, spec, FAST);
    expect(r.outcome).toBe("fail");
    expect(r.reason).toMatch(/dedup/);
    expect(r.afterRedeliverRunCount).toBe(2);
    expect(r.dedupProven).toBe(false);
    expect(r.cleaned).toBe(true);
  });

  it("still cleans up when the body throws", async () => {
    const { deps, state } = makeFakeDeps(spec, { throwOnSeed: true });
    const r = await runTrelloWebhookSmoke(deps, spec, FAST);
    expect(r.outcome).toBe("fail");
    expect(r.reason).toMatch(/seed boom/);
    expect(state.workflowCreated).toBe(true);
    expect(state.cleanedWorkflow).toBe(true);
    expect(state.cleanedDedup).toBe(true);
    expect(r.cleaned).toBe(true);
  });
});
