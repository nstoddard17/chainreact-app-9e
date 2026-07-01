/**
 * @jest-environment node
 *
 * Write smoke harness — Monday item lifecycle batch (move_item / archive_item /
 * duplicate_item).
 *
 * Pins each fixture WITHOUT a real DB/provider, driving it through the pure
 * `runWriteSmoke` orchestrator over a FAKE boundary. Protects:
 *   - move_item: setup create_item -> move -> get_item marker + groupId==target ->
 *     delete_item; BLOCKED_ENV when no second group (SMOKE_MONDAY_TARGET_GROUP_ID);
 *   - archive_item: setup -> archive -> get_item state=="archived" -> delete_item;
 *   - duplicate_item: setup -> duplicate (capture clone) -> get_item marker on the
 *     clone -> delete_item per ledger item (original + duplicate), 0 leaked.
 */
import type { ActionSmokeFixture } from "@/tests/smoke-actions/contract";
import { WRITE_SMOKE_FIXTURES } from "@/tests/smoke-actions/fixtures";
import {
  runWriteSmoke,
  type StepRunOutcome,
  type WriteHarnessDeps,
} from "@/tests/smoke-actions/writeHarness";

const RUN = { runToken: "T1", allowWrite: true, allowDestructive: true } as const;
const MARKER = "crsmoke-T1-";
const ITEM_ID = "item-1";
const DUP_ID = "item-2";
const env = (n: string) =>
  n === "SMOKE_MONDAY_BOARD_ID"
    ? "board-smoke"
    : n === "SMOKE_MONDAY_GROUP_ID"
      ? "grp-src"
      : n === "SMOKE_MONDAY_TARGET_GROUP_ID"
        ? "grp-dst"
        : undefined;

const fixtureFor = (key: string): ActionSmokeFixture =>
  WRITE_SMOKE_FIXTURES.find((f) => `${f.provider}:${f.action}` === key)!;

interface RecordingDeps extends WriteHarnessDeps {
  readonly calls: { provider: string; action: string; config: Record<string, unknown> }[];
}

function depsWith(plan: Record<string, StepRunOutcome>): RecordingDeps {
  const calls: RecordingDeps["calls"] = [];
  return {
    calls,
    async runActionStep(input) {
      calls.push({ ...input, config: { ...input.config } });
      return plan[`${input.provider}:${input.action}`] ?? { ok: true, output: null, reason: null };
    },
  };
}

// ─── Shape ───────────────────────────────────────────────────────────────────

describe("monday item lifecycle: shape", () => {
  const KEYS = ["monday:move_item", "monday:archive_item", "monday:duplicate_item"] as const;

  it.each(KEYS)("%s is destructiveSafe with a create_item setup", (key) => {
    const f = fixtureFor(key);
    expect(f).toBeDefined();
    expect(f.writeHarness?.liveClass).toBe("destructiveSafe");
    expect(f.liveSafe).toBe(false);
    expect(f.writeHarness?.setup?.[0]?.action).toBe("create_item");
    expect(f.requiredEnv).not.toContain("SMOKE_MONDAY_CONNECTED");
  });

  it("move_item requires a second target group and verifies groupId==target", () => {
    const f = fixtureFor("monday:move_item");
    expect(f.requiredEnv).toEqual([
      "SMOKE_MONDAY_BOARD_ID",
      "SMOKE_MONDAY_GROUP_ID",
      "SMOKE_MONDAY_TARGET_GROUP_ID",
    ]);
    expect(f.config.targetGroupId).toBe("{{env.SMOKE_MONDAY_TARGET_GROUP_ID}}");
    expect(f.writeHarness?.verify?.action).toBe("get_item");
    expect(f.writeHarness?.verify?.expectEquals).toEqual({
      path: "groupId",
      value: "{{env.SMOKE_MONDAY_TARGET_GROUP_ID}}",
    });
    expect(f.writeHarness?.cleanup?.action).toBe("delete_item");
  });

  it("archive_item verifies state==archived then deletes", () => {
    const f = fixtureFor("monday:archive_item");
    expect(f.writeHarness?.verify?.action).toBe("get_item");
    expect(f.writeHarness?.verify?.expectEquals).toEqual({ path: "state", value: "archived" });
    expect(f.writeHarness?.cleanup?.action).toBe("delete_item");
    expect(f.writeHarness?.cleanupKind).toBe("delete");
  });

  it("duplicate_item captures the clone and cleans BOTH via cleanupEach", () => {
    const f = fixtureFor("monday:duplicate_item");
    expect(f.writeHarness?.captureResource).toEqual({
      resourceKey: "duplicate",
      idPath: "newItemId",
      kind: "item",
    });
    expect(f.writeHarness?.verify?.config.itemId).toBe("{{ledger.duplicate.id}}");
    expect(f.writeHarness?.cleanupEach?.action).toBe("delete_item");
    expect(f.writeHarness?.cleanup).toBeUndefined();
  });
});

// ─── move_item ─────────────────────────────────────────────────────────────────

describe("monday:move_item orchestration", () => {
  it("PASS: setup -> move -> get_item marker + groupId==target -> delete (cleaned)", async () => {
    const deps = depsWith({
      "monday:create_item": { ok: true, output: { itemId: ITEM_ID, itemName: `${MARKER}item` }, reason: null },
      "monday:move_item": { ok: true, output: { itemId: ITEM_ID, targetGroupId: "grp-dst" }, reason: null },
      "monday:get_item": { ok: true, output: { itemId: ITEM_ID, itemName: `${MARKER}item`, groupId: "grp-dst" }, reason: null },
      "monday:delete_item": { ok: true, output: { success: true }, reason: null },
    });
    const res = await runWriteSmoke(fixtureFor("monday:move_item"), { ...RUN, envLookup: env }, deps);
    expect(res.status).toBe("PASS");
    expect(res.artifact).toBe("cleaned");
    expect(res.ledger.leaked).toBe(0);
    expect(deps.calls.find((c) => c.action === "create_item")?.config.groupId).toBe("grp-src");
    expect(deps.calls.find((c) => c.action === "move_item")?.config.targetGroupId).toBe("grp-dst");
  });

  it("VERIFY_FAILED: item did not land in the target group (cleanup still runs)", async () => {
    const deps = depsWith({
      "monday:create_item": { ok: true, output: { itemId: ITEM_ID, itemName: `${MARKER}item` }, reason: null },
      "monday:move_item": { ok: true, output: { itemId: ITEM_ID }, reason: null },
      "monday:get_item": { ok: true, output: { itemId: ITEM_ID, itemName: `${MARKER}item`, groupId: "grp-src" }, reason: null },
      "monday:delete_item": { ok: true, output: { success: true }, reason: null },
    });
    const res = await runWriteSmoke(fixtureFor("monday:move_item"), { ...RUN, envLookup: env }, deps);
    expect(res.status).toBe("VERIFY_FAILED");
    expect(deps.calls.some((c) => c.action === "delete_item")).toBe(true);
  });

  it("BLOCKED_ENV when no second group discovered (board has one group)", async () => {
    const deps = depsWith({});
    const oneGroupEnv = (n: string) => (n === "SMOKE_MONDAY_TARGET_GROUP_ID" ? undefined : env(n));
    const res = await runWriteSmoke(fixtureFor("monday:move_item"), { ...RUN, envLookup: oneGroupEnv }, deps);
    expect(res.status).toBe("BLOCKED_ENV");
    expect(res.reason).toMatch(/SMOKE_MONDAY_TARGET_GROUP_ID/);
    expect(deps.calls).toHaveLength(0);
  });
});

// ─── archive_item ──────────────────────────────────────────────────────────────

describe("monday:archive_item orchestration", () => {
  it("PASS: setup -> archive -> get_item state==archived -> delete (cleaned)", async () => {
    const deps = depsWith({
      "monday:create_item": { ok: true, output: { itemId: ITEM_ID, itemName: `${MARKER}item` }, reason: null },
      "monday:archive_item": { ok: true, output: { success: true, archivedItemId: ITEM_ID }, reason: null },
      "monday:get_item": { ok: true, output: { itemId: ITEM_ID, state: "archived" }, reason: null },
      "monday:delete_item": { ok: true, output: { success: true }, reason: null },
    });
    const res = await runWriteSmoke(fixtureFor("monday:archive_item"), { ...RUN, envLookup: env }, deps);
    expect(res.status).toBe("PASS");
    expect(res.artifact).toBe("cleaned");
    expect(res.ledger.leaked).toBe(0);
    expect(deps.calls.find((c) => c.action === "archive_item")?.config.itemId).toBe(ITEM_ID);
  });

  it("VERIFY_FAILED: item is not archived on read-back (state still active)", async () => {
    const deps = depsWith({
      "monday:create_item": { ok: true, output: { itemId: ITEM_ID, itemName: `${MARKER}item` }, reason: null },
      "monday:archive_item": { ok: true, output: { success: true, archivedItemId: ITEM_ID }, reason: null },
      "monday:get_item": { ok: true, output: { itemId: ITEM_ID, state: "active" }, reason: null },
      "monday:delete_item": { ok: true, output: { success: true }, reason: null },
    });
    const res = await runWriteSmoke(fixtureFor("monday:archive_item"), { ...RUN, envLookup: env }, deps);
    expect(res.status).toBe("VERIFY_FAILED");
    expect(deps.calls.some((c) => c.action === "delete_item")).toBe(true);
  });
});

// ─── duplicate_item ────────────────────────────────────────────────────────────

describe("monday:duplicate_item orchestration", () => {
  it("PASS: setup -> duplicate (capture) -> get_item marker on clone -> delete BOTH (cleaned)", async () => {
    const deps = depsWith({
      "monday:create_item": { ok: true, output: { itemId: ITEM_ID, itemName: `${MARKER}item` }, reason: null },
      "monday:duplicate_item": { ok: true, output: { newItemId: DUP_ID, newItemName: `${MARKER}item` }, reason: null },
      "monday:get_item": { ok: true, output: { itemId: DUP_ID, itemName: `${MARKER}item` }, reason: null },
      "monday:delete_item": { ok: true, output: { success: true }, reason: null },
    });
    const res = await runWriteSmoke(fixtureFor("monday:duplicate_item"), { ...RUN, envLookup: env }, deps);
    expect(res.status).toBe("PASS");
    expect(res.artifact).toBe("cleaned");
    // Both the original AND the duplicate are captured + cleaned.
    expect(res.ledger.created).toBe(2);
    expect(res.ledger.cleaned).toBe(2);
    expect(res.ledger.leaked).toBe(0);
    const deleted = deps.calls.filter((c) => c.action === "delete_item").map((c) => c.config.itemId).sort();
    expect(deleted).toEqual([ITEM_ID, DUP_ID].sort());
    // verify read the DUPLICATE, not the original.
    expect(deps.calls.find((c) => c.action === "get_item")?.config.itemId).toBe(DUP_ID);
  });

  it("VERIFY_FAILED: clone lacks the marker (both still cleaned)", async () => {
    const deps = depsWith({
      "monday:create_item": { ok: true, output: { itemId: ITEM_ID, itemName: `${MARKER}item` }, reason: null },
      "monday:duplicate_item": { ok: true, output: { newItemId: DUP_ID, newItemName: "unrelated" }, reason: null },
      "monday:get_item": { ok: true, output: { itemId: DUP_ID, itemName: "someone-elses-item" }, reason: null },
      "monday:delete_item": { ok: true, output: { success: true }, reason: null },
    });
    const res = await runWriteSmoke(fixtureFor("monday:duplicate_item"), { ...RUN, envLookup: env }, deps);
    expect(res.status).toBe("VERIFY_FAILED");
    expect(res.ledger.leaked).toBe(0); // cleanupEach still deletes both
  });
});
