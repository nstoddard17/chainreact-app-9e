/**
 * @jest-environment node
 *
 * Write smoke harness — Monday item-tree create (first Monday write).
 *
 * Pins monday:create_item WITHOUT a real DB/provider, driving it through the pure
 * `runWriteSmoke` orchestrator over a FAKE boundary. The smoke-owned resource is
 * the ITEM (created + hard-deleted via the registered delete_item). Protects:
 *   - shape: destructiveSafe; board/group come from configFromEnv (overlaid by
 *     discovery) and there is NO SMOKE_MONDAY_CONNECTED requirement — connection is
 *     proven from the DB by the dev test, not an env flag;
 *   - PASS: create -> INDEPENDENT get_item read-back (marker on the item name) ->
 *     delete_item -> cleaned, leaked 0;
 *   - VERIFY_FAILED: read-back name lacks the marker (cleanup still runs);
 *   - BLOCKED_ENV when no board/group was discovered (never writes blind).
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
// The discovered board + group ids resolve from the overlay, else BLOCKED_ENV.
const env = (n: string) =>
  n === "SMOKE_MONDAY_BOARD_ID" ? "board-smoke" : n === "SMOKE_MONDAY_GROUP_ID" ? "grp-smoke" : undefined;

const createItem = (): ActionSmokeFixture =>
  WRITE_SMOKE_FIXTURES.find((f) => `${f.provider}:${f.action}` === "monday:create_item")!;

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

describe("monday:create_item — shape", () => {
  it("is a destructiveSafe write fixture with NO connected-env requirement", () => {
    const f = createItem();
    expect(f).toBeDefined();
    expect(f.risk).toBe("write");
    expect(f.liveRisk).toBe("write");
    expect(f.liveSafe).toBe(false);
    expect(f.writeHarness?.liveClass).toBe("destructiveSafe");
    // Board + group are the only required env, both supplied by discovery overlay.
    // NO SMOKE_MONDAY_CONNECTED — connection comes from the DB probe.
    expect(f.requiredEnv).toEqual(["SMOKE_MONDAY_BOARD_ID", "SMOKE_MONDAY_GROUP_ID"]);
    expect(f.requiredEnv).not.toContain("SMOKE_MONDAY_CONNECTED");
    expect(f.configFromEnv).toEqual({
      boardId: "SMOKE_MONDAY_BOARD_ID",
      groupId: "SMOKE_MONDAY_GROUP_ID",
    });
  });

  it("verifies via get_item (marker on item name), cleans via delete_item (hard delete)", () => {
    const f = createItem();
    expect(f.writeHarness?.captureResource).toEqual({ resourceKey: "item", idPath: "itemId", kind: "item" });
    expect(f.writeHarness?.markerEchoPath).toBe("itemName");
    expect(f.writeHarness?.verify?.provider).toBe("monday");
    expect(f.writeHarness?.verify?.action).toBe("get_item");
    expect(f.writeHarness?.verify?.markerPath).toBe("itemName");
    expect(f.writeHarness?.verify?.smokeRead).toBeUndefined();
    expect(f.writeHarness?.cleanup?.action).toBe("delete_item");
    expect(f.writeHarness?.cleanupKind).toBe("delete");
  });
});

// ─── Orchestration ─────────────────────────────────────────────────────────────

describe("monday:create_item — orchestration", () => {
  it("PASS: create -> independent get_item name marker -> delete_item (cleaned)", async () => {
    const deps = depsWith({
      "monday:create_item": { ok: true, output: { itemId: ITEM_ID, itemName: `${MARKER}item` }, reason: null },
      "monday:get_item": { ok: true, output: { itemId: ITEM_ID, itemName: `${MARKER}item` }, reason: null },
      "monday:delete_item": { ok: true, output: { success: true }, reason: null },
    });
    const res = await runWriteSmoke(createItem(), { ...RUN, envLookup: env }, deps);
    expect(res.status).toBe("PASS");
    expect(res.artifact).toBe("cleaned");
    expect(res.ledger.created).toBe(1);
    expect(res.ledger.leaked).toBe(0);
    // create targeted the discovered board+group; verify + delete targeted the captured id.
    const create = deps.calls.find((c) => c.action === "create_item");
    expect(create?.config.boardId).toBe("board-smoke");
    expect(create?.config.groupId).toBe("grp-smoke");
    expect(create?.config.itemName).toBe(`${MARKER}item`);
    expect(deps.calls.find((c) => c.action === "get_item")?.config.itemId).toBe(ITEM_ID);
    expect(deps.calls.find((c) => c.action === "delete_item")?.config.itemId).toBe(ITEM_ID);
  });

  it("VERIFY_FAILED: read-back name lacks the marker (cleanup still runs)", async () => {
    const deps = depsWith({
      "monday:create_item": { ok: true, output: { itemId: ITEM_ID, itemName: `${MARKER}item` }, reason: null },
      "monday:get_item": { ok: true, output: { itemId: ITEM_ID, itemName: "someone-elses-item" }, reason: null },
      "monday:delete_item": { ok: true, output: { success: true }, reason: null },
    });
    const res = await runWriteSmoke(createItem(), { ...RUN, envLookup: env }, deps);
    expect(res.status).toBe("VERIFY_FAILED");
    expect(res.ledger.leaked).toBe(0); // cleanup still deletes the smoke item
    expect(deps.calls.some((c) => c.action === "delete_item")).toBe(true);
  });

  it("BLOCKED_ENV when no board/group was discovered (never writes blind)", async () => {
    const deps = depsWith({});
    const res = await runWriteSmoke(createItem(), { ...RUN, envLookup: () => undefined }, deps);
    expect(res.status).toBe("BLOCKED_ENV");
    expect(res.reason).toMatch(/SMOKE_MONDAY_BOARD_ID|SMOKE_MONDAY_GROUP_ID/);
    expect(deps.calls).toHaveLength(0);
  });
});
