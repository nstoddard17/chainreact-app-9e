/**
 * @jest-environment node
 *
 * Unit tests for the spec-driven Monday webhook trigger-smoke orchestrator
 * (tests/trigger-smoke/mondayWebhookSmoke.ts) with injected fakes. No DB, no route,
 * no provider. The fake's `fakeNormalize` mirrors the RELEVANT fields of the real
 * per-trigger normalizers (changeKind/boardId/itemId/groupId/previousGroupId/
 * currentGroupId/subitemId/parentItemId + the deterministic eventId) so each spec's
 * synthetic event shape + identity matcher is exercised together. Proves the
 * direct-seed orchestration contract for all 3 safe lifecycle specs + the standard
 * failure branches.
 */
import {
  runMondayWebhookSmoke,
  ALL_MONDAY_WEBHOOK_SPECS,
  NEW_ITEM_SPEC,
  ITEM_MOVED_SPEC,
  NEW_SUBITEM_SPEC,
  NEW_UPDATE_SPEC,
  COLUMN_CHANGED_SPEC,
  type MondayWebhookTriggerSpec,
  type MondayWebhookSmokeDeps,
  type MondayWebhookSmokeIdentity,
  type MondayWebhookSmokeRun,
} from "@/tests/trigger-smoke/mondayWebhookSmoke";

const FAST = { afterDeliverAttempts: 1, afterDeliverSleepMs: 0, dedupSettleMs: 0 } as const;

const IDENTITY: MondayWebhookSmokeIdentity = {
  boardId: "crsmoke-board-1",
  itemId: "crsmoke-item-1",
  itemName: "crsmoke item 1",
  groupId: "crsmoke-group-1",
  sourceGroupId: "crsmoke-src-1",
  subitemId: "crsmoke-subitem-1",
  subitemName: "crsmoke subitem 1",
  parentItemId: "crsmoke-parent-1",
  createdAt: "2026-06-30T00:00:00.000Z",
};

/** Mirror the relevant normalized fields the real per-trigger normalizers emit. */
function fakeNormalize(
  event: Record<string, unknown>,
  spec: MondayWebhookTriggerSpec,
): Record<string, unknown> {
  const boardId = (event.boardId as string) ?? null;
  const pulseId = (event.pulseId as string) ?? null;
  if (spec.eventType === "new_item") {
    return { changeKind: "new_item", boardId, itemId: pulseId, itemName: event.pulseName ?? null, groupId: event.groupId ?? null };
  }
  if (spec.eventType === "item_moved") {
    return {
      changeKind: "item_moved",
      boardId,
      itemId: pulseId,
      previousGroupId: event.previousGroupId ?? null,
      currentGroupId: event.groupId ?? null,
    };
  }
  if (spec.eventType === "new_update") {
    return {
      changeKind: "new_update",
      boardId,
      updateId: event.updateId ?? null,
      itemId: pulseId,
      body: event.body ?? null,
    };
  }
  if (spec.eventType === "column_changed") {
    return {
      changeKind: "column_changed",
      boardId,
      itemId: pulseId,
      columnId: event.columnId ?? null,
      previousValue: event.previousValue ?? null,
      newValue: event.value ?? null,
    };
  }
  return {
    changeKind: "new_subitem",
    boardId,
    subitemId: pulseId,
    subitemName: event.pulseName ?? null,
    parentItemId: event.parentItemId ?? null,
  };
}

interface FakeOpts {
  seededEventType?: string | null;
  preexistingRuns?: number;
  deliverStatus?: number;
  deliverPushesRun?: boolean;
  corruptPayload?: boolean;
  drainStatus?: MondayWebhookSmokeRun["status"];
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
  spec: MondayWebhookTriggerSpec,
  opts: FakeOpts = {},
): { deps: MondayWebhookSmokeDeps; state: FakeState } {
  const runs: MondayWebhookSmokeRun[] = [];
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
  const expectedEventId = spec.expectedEventId(IDENTITY);

  function pushRun(event: Record<string, unknown>): void {
    const payload = opts.corruptPayload
      ? { changeKind: "wrong", boardId: "wrong", itemId: "wrong" }
      : fakeNormalize(event, spec);
    runs.push({
      runId: `run-${runs.length + 1}`,
      status: "queued",
      triggerPayload: payload,
      eventId: expectedEventId,
      eventType: spec.eventType,
    });
  }

  const deps: MondayWebhookSmokeDeps = {
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
    async deliverSyntheticEvent({ event }) {
      state.deliveries += 1;
      const status = opts.deliverStatus ?? 200;
      if (status !== 200) return { httpStatus: status };
      const isRedeliver = seen.has(expectedEventId);
      if (!isRedeliver) {
        seen.add(expectedEventId);
        if (opts.deliverPushesRun ?? true) pushRun(event);
      } else if (opts.dedupBroken) {
        pushRun(event);
      }
      return { httpStatus: 200 };
    },
    async listRuns() {
      return runs.map((r) => ({ ...r }));
    },
    async drainRun(runId) {
      const run = runs.find((r) => r.runId === runId);
      if (run) {
        (run as { status: MondayWebhookSmokeRun["status"] }).status =
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

describe("runMondayWebhookSmoke — happy path (all 3 lifecycle specs)", () => {
  it.each(ALL_MONDAY_WEBHOOK_SPECS.map((s) => [s.label, s] as const))(
    "%s passes: seed -> baseline 0 -> deliver -> 1 run identified -> succeeded -> dedup holds -> cleaned",
    async (_label, spec) => {
      const { deps, state } = makeFakeDeps(spec);
      const r = await runMondayWebhookSmoke(deps, spec, FAST);

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

  it("each lifecycle spec's synthetic event carries its inbound type + deterministic dedup key", () => {
    const newItem = NEW_ITEM_SPEC.buildSyntheticEvent(IDENTITY);
    expect(newItem.type).toBe("create_item");
    expect(newItem.pulseId).toBe(IDENTITY.itemId);
    expect(NEW_ITEM_SPEC.expectedEventId(IDENTITY)).toBe(
      `new_item:${IDENTITY.boardId}:${IDENTITY.itemId}:${IDENTITY.createdAt}`,
    );

    const moved = ITEM_MOVED_SPEC.buildSyntheticEvent(IDENTITY);
    expect(moved.type).toBe("item_moved_to_any_group");
    expect(moved.previousGroupId).toBe(IDENTITY.sourceGroupId);
    expect(moved.groupId).toBe(IDENTITY.groupId);
    expect(ITEM_MOVED_SPEC.expectedEventId(IDENTITY)).toBe(
      `item_moved:${IDENTITY.boardId}:${IDENTITY.itemId}:${IDENTITY.createdAt}`,
    );

    const subitem = NEW_SUBITEM_SPEC.buildSyntheticEvent(IDENTITY);
    expect(subitem.type).toBe("create_subitem");
    // create_subitem must NOT set itemId (would conflate subitem vs parent).
    expect(subitem).not.toHaveProperty("itemId");
    expect(subitem.pulseId).toBe(IDENTITY.subitemId);
    expect(subitem.parentItemId).toBe(IDENTITY.parentItemId);
    expect(NEW_SUBITEM_SPEC.expectedEventId(IDENTITY)).toBe(
      `new_subitem:${IDENTITY.boardId}:${IDENTITY.subitemId}:${IDENTITY.createdAt}`,
    );
  });

  it("content specs mint a deterministic crsmoke marker that the identity matcher verifies", () => {
    // new_update → create_update carrying a crsmoke- body marker (no real content).
    const update = NEW_UPDATE_SPEC.buildSyntheticEvent(IDENTITY);
    expect(update.type).toBe("create_update");
    expect(update.body).toBe(`crsmoke-body-${IDENTITY.itemId}`);
    expect(NEW_UPDATE_SPEC.expectedEventId(IDENTITY)).toBe(
      `new_update:${IDENTITY.boardId}:crsmoke-update-${IDENTITY.itemId}`,
    );
    const updateRun: MondayWebhookSmokeRun = {
      runId: "u1",
      status: "queued",
      eventId: NEW_UPDATE_SPEC.expectedEventId(IDENTITY),
      eventType: "new_update",
      triggerPayload: fakeNormalize(update, NEW_UPDATE_SPEC),
    };
    expect(NEW_UPDATE_SPEC.identityMatches(updateRun, IDENTITY)).toBe(true);

    // column_changed → change_column_value carrying crsmoke- previous/new value markers.
    const column = COLUMN_CHANGED_SPEC.buildSyntheticEvent(IDENTITY);
    expect(column.type).toBe("change_column_value");
    expect(column.previousValue).toBe(`crsmoke-prev-${IDENTITY.itemId}`);
    expect(column.value).toBe(`crsmoke-new-${IDENTITY.itemId}`);
    expect(COLUMN_CHANGED_SPEC.expectedEventId(IDENTITY)).toBe(
      `column_changed:${IDENTITY.boardId}:${IDENTITY.itemId}:crsmoke_col:${IDENTITY.createdAt}`,
    );
    const columnRun: MondayWebhookSmokeRun = {
      runId: "c1",
      status: "queued",
      eventId: COLUMN_CHANGED_SPEC.expectedEventId(IDENTITY),
      eventType: "column_changed",
      triggerPayload: fakeNormalize(column, COLUMN_CHANGED_SPEC),
    };
    expect(COLUMN_CHANGED_SPEC.identityMatches(columnRun, IDENTITY)).toBe(true);
  });
});

describe("runMondayWebhookSmoke — failure branches (new_item)", () => {
  const spec = NEW_ITEM_SPEC;

  it("fails when the seeded row stored a non-canonical event_type", async () => {
    const { deps } = makeFakeDeps(spec, { seededEventType: "create_item" });
    const r = await runMondayWebhookSmoke(deps, spec, FAST);
    expect(r.outcome).toBe("fail");
    expect(r.reason).toMatch(/event_type/);
    expect(r.seededEventType).toBe("create_item");
    expect(r.cleaned).toBe(true);
  });

  it("fails on baseline violation (runs exist before delivery)", async () => {
    const { deps, state } = makeFakeDeps(spec, { preexistingRuns: 1 });
    const r = await runMondayWebhookSmoke(deps, spec, FAST);
    expect(r.outcome).toBe("fail");
    expect(r.reason).toMatch(/baseline/);
    expect(r.baselineRunCount).toBe(1);
    expect(state.deliveries).toBe(0);
    expect(r.cleaned).toBe(true);
  });

  it("fails when the webhook route returns non-200", async () => {
    const { deps } = makeFakeDeps(spec, { deliverStatus: 401 });
    const r = await runMondayWebhookSmoke(deps, spec, FAST);
    expect(r.outcome).toBe("fail");
    expect(r.deliverHttpStatus).toBe(401);
    expect(r.cleaned).toBe(true);
  });

  it("fails when no run appears after delivery", async () => {
    const { deps } = makeFakeDeps(spec, { deliverPushesRun: false });
    const r = await runMondayWebhookSmoke(deps, spec, FAST);
    expect(r.outcome).toBe("fail");
    expect(r.reason).toMatch(/exactly 1 run/);
    expect(r.afterRunCount).toBe(0);
    expect(r.cleaned).toBe(true);
  });

  it("fails when the fired run does not identify the synthetic event", async () => {
    const { deps } = makeFakeDeps(spec, { corruptPayload: true });
    const r = await runMondayWebhookSmoke(deps, spec, FAST);
    expect(r.outcome).toBe("fail");
    expect(r.reason).toMatch(/did not identify/);
    expect(r.identityMatched).toBe(false);
    expect(r.cleaned).toBe(true);
  });

  it("fails when the drained run is not terminal 'succeeded'", async () => {
    const { deps } = makeFakeDeps(spec, { drainStatus: "failed" });
    const r = await runMondayWebhookSmoke(deps, spec, FAST);
    expect(r.outcome).toBe("fail");
    expect(r.terminalStatus).toBe("failed");
    expect(r.identityMatched).toBe(true);
    expect(r.cleaned).toBe(true);
  });

  it("fails when dedup does not hold (a second run appears on re-send)", async () => {
    const { deps } = makeFakeDeps(spec, { dedupBroken: true });
    const r = await runMondayWebhookSmoke(deps, spec, FAST);
    expect(r.outcome).toBe("fail");
    expect(r.reason).toMatch(/dedup/);
    expect(r.afterRedeliverRunCount).toBe(2);
    expect(r.dedupProven).toBe(false);
    expect(r.cleaned).toBe(true);
  });

  it("still cleans up when the body throws", async () => {
    const { deps, state } = makeFakeDeps(spec, { throwOnSeed: true });
    const r = await runMondayWebhookSmoke(deps, spec, FAST);
    expect(r.outcome).toBe("fail");
    expect(r.reason).toMatch(/seed boom/);
    expect(state.workflowCreated).toBe(true);
    expect(state.cleanedWorkflow).toBe(true);
    expect(state.cleanedDedup).toBe(true);
    expect(r.cleaned).toBe(true);
  });
});
