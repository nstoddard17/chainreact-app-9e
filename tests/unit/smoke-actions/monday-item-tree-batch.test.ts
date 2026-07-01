/**
 * @jest-environment node
 *
 * Write smoke harness — Monday item-tree reuse batch (update_item / create_update /
 * create_subitem / delete_item).
 *
 * Pins each fixture WITHOUT a real DB/provider, driving it through the pure
 * `runWriteSmoke` orchestrator over a FAKE boundary. Each reuses a fresh smoke
 * PARENT item (setup create_item) and cleans via the registered delete_item; the
 * update/subitem are disposed of transitively by the parent delete (never captured,
 * so 0 leaked). Protects:
 *   - update_item: rename via columnId "name", verified by get_item marker+"updated";
 *   - create_update: verified by list_updates marker, parent-delete cleanup;
 *   - create_subitem: verified by list_subitems marker, parent-delete cleanup;
 *   - delete_item: executeIsCleanup, verified by list_items expectAbsent (marker gone);
 *   - all four: BLOCKED_ENV when no board/group discovered (never writes blind).
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
const env = (n: string) =>
  n === "SMOKE_MONDAY_BOARD_ID" ? "board-smoke" : n === "SMOKE_MONDAY_GROUP_ID" ? "grp-smoke" : undefined;

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

describe("monday item-tree batch: shape", () => {
  const KEYS = [
    "monday:update_item",
    "monday:create_update",
    "monday:create_subitem",
    "monday:delete_item",
  ] as const;

  it.each(KEYS)("%s is destructiveSafe, needs only board/group env (no connected flag)", (key) => {
    const f = fixtureFor(key);
    expect(f).toBeDefined();
    expect(f.writeHarness?.liveClass).toBe("destructiveSafe");
    expect(f.liveSafe).toBe(false);
    expect(f.requiredEnv).toEqual(["SMOKE_MONDAY_BOARD_ID", "SMOKE_MONDAY_GROUP_ID"]);
    expect(f.requiredEnv).not.toContain("SMOKE_MONDAY_CONNECTED");
    // Every fixture reuses a create_item setup capturing the parent into ledger "item".
    expect(f.writeHarness?.setup?.[0]?.action).toBe("create_item");
    expect(f.writeHarness?.setup?.[0]?.captureResource).toEqual({
      resourceKey: "item",
      idPath: "itemId",
      kind: "item",
    });
  });

  it("update_item renames via columnId 'name', verifies name+'updated', cleans via delete_item", () => {
    const f = fixtureFor("monday:update_item");
    expect(f.config.columnId).toBe("name");
    expect(f.config.columnValue).toBe("{{smokeMarker}}updated");
    expect(f.writeHarness?.verify?.action).toBe("get_item");
    expect(f.writeHarness?.verify?.markerPath).toBe("itemName");
    expect(f.writeHarness?.verify?.markerSuffix).toBe("updated");
    expect(f.writeHarness?.cleanup?.action).toBe("delete_item");
    expect(f.writeHarness?.cleanupKind).toBe("delete");
  });

  it("create_update verifies via list_updates and does NOT capture the update", () => {
    const f = fixtureFor("monday:create_update");
    expect(f.writeHarness?.captureResource).toBeUndefined();
    expect(f.writeHarness?.verify?.action).toBe("list_updates");
    expect(f.writeHarness?.verify?.markerPath).toBe("updates");
    expect(f.writeHarness?.cleanup?.action).toBe("delete_item");
  });

  it("create_subitem verifies via list_subitems and does NOT capture the subitem", () => {
    const f = fixtureFor("monday:create_subitem");
    expect(f.writeHarness?.captureResource).toBeUndefined();
    expect(f.writeHarness?.verify?.action).toBe("list_subitems");
    expect(f.writeHarness?.verify?.markerPath).toBe("subitems");
    expect(f.writeHarness?.cleanup?.action).toBe("delete_item");
  });

  it("delete_item is executeIsCleanup, verified by list_items expectAbsent (no cleanup step)", () => {
    const f = fixtureFor("monday:delete_item");
    expect(f.risk).toBe("destructive");
    expect(f.liveRisk).toBe("destructive");
    expect(f.writeHarness?.executeIsCleanup).toBe(true);
    expect(f.writeHarness?.cleanup).toBeUndefined();
    expect(f.writeHarness?.verify?.action).toBe("list_items");
    expect(f.writeHarness?.verify?.expectAbsent).toEqual({ path: "items", value: "{{smokeMarker}}" });
  });
});

// ─── update_item ───────────────────────────────────────────────────────────────

describe("monday:update_item orchestration", () => {
  it("PASS: setup -> rename -> get_item name marker+'updated' -> delete_item (cleaned)", async () => {
    const deps = depsWith({
      "monday:create_item": { ok: true, output: { itemId: ITEM_ID, itemName: `${MARKER}item` }, reason: null },
      "monday:update_item": { ok: true, output: { itemId: ITEM_ID, itemName: `${MARKER}updated` }, reason: null },
      "monday:get_item": { ok: true, output: { itemId: ITEM_ID, itemName: `${MARKER}updated` }, reason: null },
      "monday:delete_item": { ok: true, output: { success: true }, reason: null },
    });
    const res = await runWriteSmoke(fixtureFor("monday:update_item"), { ...RUN, envLookup: env }, deps);
    expect(res.status).toBe("PASS");
    expect(res.artifact).toBe("cleaned");
    expect(res.ledger.created).toBe(1);
    expect(res.ledger.leaked).toBe(0);
    expect(deps.calls.find((c) => c.action === "update_item")?.config.columnId).toBe("name");
    expect(deps.calls.find((c) => c.action === "update_item")?.config.itemId).toBe(ITEM_ID);
    expect(deps.calls.find((c) => c.action === "delete_item")?.config.itemId).toBe(ITEM_ID);
  });

  it("VERIFY_FAILED: no-op update leaves the seed name (lacks 'updated'); cleanup still runs", async () => {
    const deps = depsWith({
      "monday:create_item": { ok: true, output: { itemId: ITEM_ID, itemName: `${MARKER}item` }, reason: null },
      "monday:update_item": { ok: true, output: { itemId: ITEM_ID, itemName: `${MARKER}item` }, reason: null },
      "monday:get_item": { ok: true, output: { itemId: ITEM_ID, itemName: `${MARKER}item` }, reason: null },
      "monday:delete_item": { ok: true, output: { success: true }, reason: null },
    });
    const res = await runWriteSmoke(fixtureFor("monday:update_item"), { ...RUN, envLookup: env }, deps);
    expect(res.status).toBe("VERIFY_FAILED");
    expect(res.ledger.leaked).toBe(0);
    expect(deps.calls.some((c) => c.action === "delete_item")).toBe(true);
  });
});

// ─── create_update ───────────────────────────────────────────────────────────

describe("monday:create_update orchestration", () => {
  it("PASS: setup -> post update -> list_updates marker -> delete parent (cleaned, 0 leaked)", async () => {
    const deps = depsWith({
      "monday:create_item": { ok: true, output: { itemId: ITEM_ID, itemName: `${MARKER}item` }, reason: null },
      "monday:create_update": { ok: true, output: { updateId: "u-1", body: `${MARKER}update` }, reason: null },
      "monday:list_updates": { ok: true, output: { updates: [{ updateId: "u-1", body: `${MARKER}update` }] }, reason: null },
      "monday:delete_item": { ok: true, output: { success: true }, reason: null },
    });
    const res = await runWriteSmoke(fixtureFor("monday:create_update"), { ...RUN, envLookup: env }, deps);
    expect(res.status).toBe("PASS");
    expect(res.artifact).toBe("cleaned");
    // Only the parent item is in the ledger -> exactly one created + cleaned resource.
    expect(res.ledger.created).toBe(1);
    expect(res.ledger.leaked).toBe(0);
    expect(deps.calls.find((c) => c.action === "create_update")?.config.itemId).toBe(ITEM_ID);
    expect(deps.calls.find((c) => c.action === "list_updates")?.config.itemId).toBe(ITEM_ID);
  });

  it("VERIFY_FAILED: list_updates read-back lacks the marker (cleanup still runs)", async () => {
    const deps = depsWith({
      "monday:create_item": { ok: true, output: { itemId: ITEM_ID, itemName: `${MARKER}item` }, reason: null },
      "monday:create_update": { ok: true, output: { updateId: "u-1", body: `${MARKER}update` }, reason: null },
      "monday:list_updates": { ok: true, output: { updates: [] }, reason: null },
      "monday:delete_item": { ok: true, output: { success: true }, reason: null },
    });
    const res = await runWriteSmoke(fixtureFor("monday:create_update"), { ...RUN, envLookup: env }, deps);
    expect(res.status).toBe("VERIFY_FAILED");
    expect(res.ledger.leaked).toBe(0);
    expect(deps.calls.some((c) => c.action === "delete_item")).toBe(true);
  });
});

// ─── create_subitem ────────────────────────────────────────────────────────────

describe("monday:create_subitem orchestration", () => {
  it("PASS: setup -> add subitem -> list_subitems marker -> delete parent (cleaned, 0 leaked)", async () => {
    const deps = depsWith({
      "monday:create_item": { ok: true, output: { itemId: ITEM_ID, itemName: `${MARKER}item` }, reason: null },
      "monday:create_subitem": { ok: true, output: { subitemId: "s-1", subitemName: `${MARKER}subitem` }, reason: null },
      "monday:list_subitems": { ok: true, output: { subitems: [{ subitemId: "s-1", subitemName: `${MARKER}subitem` }] }, reason: null },
      "monday:delete_item": { ok: true, output: { success: true }, reason: null },
    });
    const res = await runWriteSmoke(fixtureFor("monday:create_subitem"), { ...RUN, envLookup: env }, deps);
    expect(res.status).toBe("PASS");
    expect(res.artifact).toBe("cleaned");
    expect(res.ledger.created).toBe(1);
    expect(res.ledger.leaked).toBe(0);
    expect(deps.calls.find((c) => c.action === "create_subitem")?.config.parentItemId).toBe(ITEM_ID);
    expect(deps.calls.find((c) => c.action === "list_subitems")?.config.parentItemId).toBe(ITEM_ID);
  });

  it("VERIFY_FAILED: list_subitems read-back lacks the marker (cleanup still runs)", async () => {
    const deps = depsWith({
      "monday:create_item": { ok: true, output: { itemId: ITEM_ID, itemName: `${MARKER}item` }, reason: null },
      "monday:create_subitem": { ok: true, output: { subitemId: "s-1", subitemName: `${MARKER}subitem` }, reason: null },
      "monday:list_subitems": { ok: true, output: { subitems: [] }, reason: null },
      "monday:delete_item": { ok: true, output: { success: true }, reason: null },
    });
    const res = await runWriteSmoke(fixtureFor("monday:create_subitem"), { ...RUN, envLookup: env }, deps);
    expect(res.status).toBe("VERIFY_FAILED");
    expect(res.ledger.leaked).toBe(0);
    expect(deps.calls.some((c) => c.action === "delete_item")).toBe(true);
  });
});

// ─── delete_item ───────────────────────────────────────────────────────────────

describe("monday:delete_item orchestration", () => {
  it("PASS: setup -> delete (execute) -> list_items marker absent (cleaned, 0 leaked)", async () => {
    const deps = depsWith({
      "monday:create_item": { ok: true, output: { itemId: ITEM_ID, itemName: `${MARKER}item` }, reason: null },
      "monday:delete_item": { ok: true, output: { success: true }, reason: null },
      "monday:list_items": { ok: true, output: { items: [{ itemId: "other", itemName: "someone-elses-item" }] }, reason: null },
    });
    const res = await runWriteSmoke(fixtureFor("monday:delete_item"), { ...RUN, envLookup: env }, deps);
    expect(res.status).toBe("PASS");
    expect(res.artifact).toBe("cleaned");
    expect(res.ledger.created).toBe(1);
    expect(res.ledger.leaked).toBe(0);
    expect(deps.calls.find((c) => c.action === "delete_item")?.config.itemId).toBe(ITEM_ID);
  });

  it("VERIFY_FAILED: the deleted item's marker still appears in list_items (delete echo not trusted)", async () => {
    const deps = depsWith({
      "monday:create_item": { ok: true, output: { itemId: ITEM_ID, itemName: `${MARKER}item` }, reason: null },
      "monday:delete_item": { ok: true, output: { success: true }, reason: null },
      "monday:list_items": { ok: true, output: { items: [{ itemId: ITEM_ID, itemName: `${MARKER}item` }] }, reason: null },
    });
    const res = await runWriteSmoke(fixtureFor("monday:delete_item"), { ...RUN, envLookup: env }, deps);
    expect(res.status).toBe("VERIFY_FAILED");
  });

  it("BLOCKED_ENV when no board/group discovered (never writes blind)", async () => {
    const deps = depsWith({});
    const res = await runWriteSmoke(fixtureFor("monday:delete_item"), { ...RUN, envLookup: () => undefined }, deps);
    expect(res.status).toBe("BLOCKED_ENV");
    expect(res.reason).toMatch(/SMOKE_MONDAY_BOARD_ID|SMOKE_MONDAY_GROUP_ID/);
    expect(deps.calls).toHaveLength(0);
  });
});
