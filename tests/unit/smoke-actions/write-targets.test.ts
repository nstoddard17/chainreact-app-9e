/**
 * @jest-environment node
 *
 * Write smoke — connection-vs-target classification + smoke-safe target picker.
 *
 * Business rules protected:
 *   - a connected-but-targetless provider is BLOCKED_NO_TARGET, NEVER NOT_CONNECTED
 *     (the SMOKE-WRITE-2 Trello misdiagnosis),
 *   - a personal credential connected by a co-member is CONNECTED_NOT_EXECUTABLE,
 *   - target discovery only picks a list whose board AND list are explicitly
 *     smoke/test named (never an arbitrary first board/list), deterministically.
 */
import {
  classifyWriteTarget,
  pickSmokeSafeTarget,
  type TrelloListCandidate,
} from "@/tests/smoke-actions/writeTargets";

describe("classifyWriteTarget — the 4 distinct states", () => {
  it("not connected only when the DB proves it", () => {
    expect(classifyWriteTarget({ dbConnected: false, execUsable: false, hasTarget: false })).toBe("NOT_CONNECTED");
  });
  it("connected but not executable under the smoke user (personal cred provenance)", () => {
    expect(classifyWriteTarget({ dbConnected: true, execUsable: false, hasTarget: false })).toBe(
      "CONNECTED_NOT_EXECUTABLE",
    );
  });
  it("connected + executable but no safe smoke target -> BLOCKED (not 'not connected')", () => {
    expect(classifyWriteTarget({ dbConnected: true, execUsable: true, hasTarget: false })).toBe("BLOCKED_NO_TARGET");
  });
  it("ready when connected + executable + a safe target exists", () => {
    expect(classifyWriteTarget({ dbConnected: true, execUsable: true, hasTarget: true })).toBe("READY");
  });
});

describe("pickSmokeSafeTarget — explicitly smoke-named board AND list only", () => {
  const cands: TrelloListCandidate[] = [
    { boardId: "b1", boardLabel: "My Real Board", listId: "l1", listLabel: "To Do" }, // neither smoke
    { boardId: "b2", boardLabel: "Test Kanban Board", listId: "l2", listLabel: "Backlog" }, // board smoke, list not
    { boardId: "b3", boardLabel: "Test Kanban Board", listId: "l3", listLabel: "Testing" }, // both smoke ✓
    { boardId: "b4", boardLabel: "Smoke Board", listId: "l4", listLabel: "smoke-list" }, // both smoke ✓
  ];

  it("never picks an arbitrary first board/list — requires both names to match", () => {
    const single: TrelloListCandidate[] = [
      { boardId: "b1", boardLabel: "My Real Board", listId: "l1", listLabel: "To Do" },
      { boardId: "b2", boardLabel: "Marketing", listId: "l2", listLabel: "Inbox" },
    ];
    expect(pickSmokeSafeTarget(single)).toBeNull(); // -> BLOCKED_ENV, set the env
  });

  it("picks a board+list both smoke-named, deterministically (sorted)", () => {
    const chosen = pickSmokeSafeTarget(cands);
    // Sorted by (boardLabel, listLabel): "Smoke Board" < "Test Kanban Board".
    expect(chosen).toEqual({ boardId: "b4", listId: "l4", boardLabel: "Smoke Board", listLabel: "smoke-list" });
  });

  it("is stable regardless of input order", () => {
    const shuffled = [cands[2]!, cands[0]!, cands[3]!, cands[1]!];
    expect(pickSmokeSafeTarget(shuffled)?.boardId).toBe("b4");
  });
});
