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
  pickAirtableAttachmentField,
  pickAirtablePrimaryTextField,
  pickMondaySecondGroup,
  pickMondaySmokeBoard,
  pickMondaySmokeGroup,
  pickNotionSmokeDatabase,
  pickSecondSmokeList,
  pickSmokeSafeTarget,
  type AirtableTableLite,
  type MondayBoardLite,
  type MondayGroupLite,
  type NotionDatabaseHitLite,
  type TrelloListCandidate,
  type TrelloMoveListCandidate,
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

describe("pickSecondSmokeList — a safe move_card DESTINATION on the source board", () => {
  // Lists on ONE smoke board (the caller only ever passes the source board's lists).
  const lists: TrelloMoveListCandidate[] = [
    { listId: "src", listLabel: "Test" }, // the SOURCE list (excluded as a no-op)
    { listId: "done", listLabel: "Done" }, // ✓ destination-allow-list name
    { listId: "doing", listLabel: "Doing" }, // not in the allow-list
    { listId: "tgt", listLabel: "Target Lane" }, // ✓ destination-allow-list name
  ];

  it("finds a distinct safe destination list (allow-listed name, never the source)", () => {
    const chosen = pickSecondSmokeList(lists, "src");
    // Allow-list matches: "Done", "Target Lane" -> sorted by label -> "Done".
    expect(chosen).toEqual({ listId: "done", listLabel: "Done" });
  });

  it("blocks (null) when only the source list exists on the board", () => {
    expect(pickSecondSmokeList([{ listId: "src", listLabel: "Test" }], "src")).toBeNull();
  });

  it("blocks (null) when no OTHER list has an allow-listed name", () => {
    const onlyArbitrary: TrelloMoveListCandidate[] = [
      { listId: "src", listLabel: "Test" },
      { listId: "x", listLabel: "Backlog" }, // not smoke/test/done/moved/target
      { listId: "y", listLabel: "In Review" },
    ];
    expect(pickSecondSmokeList(onlyArbitrary, "src")).toBeNull(); // -> BLOCKED_ENV
  });

  it("never returns the source list even when its name matches the allow-list", () => {
    const chosen = pickSecondSmokeList(
      [
        { listId: "src", listLabel: "smoke-source" }, // matches, but IS the source
        { listId: "moved", listLabel: "Moved" },
      ],
      "src",
    );
    expect(chosen?.listId).toBe("moved");
  });

  it("is deterministic regardless of input order", () => {
    const shuffled = [lists[3]!, lists[1]!, lists[0]!, lists[2]!];
    expect(pickSecondSmokeList(shuffled, "src")?.listId).toBe("done");
  });
});

describe("pickAirtablePrimaryTextField — a writable text field for the marker", () => {
  it("prefers the PRIMARY field when it is text-typed", () => {
    const table: AirtableTableLite = {
      id: "t1",
      primaryFieldId: "f1",
      fields: [
        { id: "f1", name: "Name", type: "singleLineText" },
        { id: "f2", name: "Notes", type: "multilineText" },
      ],
    };
    expect(pickAirtablePrimaryTextField(table)).toBe("Name");
  });

  it("falls back to the first text field when the primary is NOT text", () => {
    const table: AirtableTableLite = {
      id: "t1",
      primaryFieldId: "f1",
      fields: [
        { id: "f1", name: "Count", type: "number" }, // primary, not text
        { id: "f2", name: "Title", type: "singleLineText" },
      ],
    };
    expect(pickAirtablePrimaryTextField(table)).toBe("Title");
  });

  it("returns null when the table has no writable text field", () => {
    const table: AirtableTableLite = {
      id: "t1",
      primaryFieldId: "f1",
      fields: [
        { id: "f1", name: "Count", type: "number" },
        { id: "f2", name: "When", type: "date" },
      ],
    };
    expect(pickAirtablePrimaryTextField(table)).toBeNull(); // -> BLOCKED_ENV
  });
});

describe("pickAirtableAttachmentField — an attachment field for add_attachment", () => {
  it("returns the first multipleAttachments field", () => {
    const table: AirtableTableLite = {
      id: "t1",
      primaryFieldId: "f1",
      fields: [
        { id: "f1", name: "Name", type: "singleLineText" },
        { id: "f2", name: "Draft Image", type: "multipleAttachments" },
        { id: "f3", name: "Other Files", type: "multipleAttachments" },
      ],
    };
    expect(pickAirtableAttachmentField(table)).toBe("Draft Image");
  });

  it("returns null (never a non-attachment field) when the table has none", () => {
    const table: AirtableTableLite = {
      id: "t1",
      primaryFieldId: "f1",
      fields: [
        { id: "f1", name: "Name", type: "singleLineText" },
        { id: "f2", name: "Notes", type: "multilineText" },
      ],
    };
    expect(pickAirtableAttachmentField(table)).toBeNull(); // -> BLOCKED_ENV, never a guess
  });
});

describe("pickNotionSmokeDatabase — usable DB + its title-property name", () => {
  const hits: NotionDatabaseHitLite[] = [
    { id: "d1", title: "Customers", titleFieldName: "Name" },
    { id: "d2", title: "Smoke Test DB", titleFieldName: "Title" },
    { id: "d3", title: "No Title DB", titleFieldName: null }, // unusable
  ];

  it("uses the pinned database id exactly when provided", () => {
    expect(pickNotionSmokeDatabase(hits, "d1")).toEqual({
      databaseId: "d1",
      title: "Customers",
      titleFieldName: "Name",
    });
  });

  it("returns null when the pinned database has no title property (unusable)", () => {
    expect(pickNotionSmokeDatabase(hits, "d3")).toBeNull(); // -> BLOCKED_ENV
  });

  it("prefers a smoke/test-named database when no pin is given", () => {
    expect(pickNotionSmokeDatabase(hits)?.databaseId).toBe("d2");
  });

  it("falls back to the first USABLE database (skips the title-less one)", () => {
    const noNamed: NotionDatabaseHitLite[] = [
      { id: "d3", title: "No Title DB", titleFieldName: null },
      { id: "d1", title: "Customers", titleFieldName: "Name" },
    ];
    expect(pickNotionSmokeDatabase(noNamed)?.databaseId).toBe("d1");
  });

  it("returns null when there are no usable databases", () => {
    expect(pickNotionSmokeDatabase([{ id: "d3", title: "x", titleFieldName: null }])).toBeNull();
  });
});

describe("pickMondaySmokeBoard — pinned -> smoke-named -> first (throwaway account)", () => {
  const boards: MondayBoardLite[] = [
    { id: "b1", label: "Sprint Planning" },
    { id: "b2", label: "Smoke Test Board" },
    { id: "b3", label: "Roadmap" },
  ];

  it("uses the pinned board id exactly when provided", () => {
    expect(pickMondaySmokeBoard(boards, "b3")).toEqual({ id: "b3", label: "Roadmap" });
  });

  it("returns null when the pinned board id is not in the list", () => {
    expect(pickMondaySmokeBoard(boards, "nope")).toBeNull(); // -> BLOCKED_ENV
  });

  it("prefers a smoke/test/chainreact-named board when no pin is given", () => {
    expect(pickMondaySmokeBoard(boards)?.id).toBe("b2");
  });

  it("falls back to the first board on the throwaway account when none is smoke-named", () => {
    const noNamed: MondayBoardLite[] = [
      { id: "b1", label: "Sprint Planning" },
      { id: "b3", label: "Roadmap" },
    ];
    expect(pickMondaySmokeBoard(noNamed)?.id).toBe("b1");
  });

  it("returns null when the account has no boards", () => {
    expect(pickMondaySmokeBoard([])).toBeNull(); // -> BLOCKED_ENV
  });
});

describe("pickMondaySmokeGroup — a usable group, deterministically", () => {
  it("picks the alphabetically-first group regardless of input order", () => {
    const groups: MondayGroupLite[] = [
      { id: "g2", label: "To Do" },
      { id: "g1", label: "Done" },
      { id: "g3", label: "In Progress" },
    ];
    expect(pickMondaySmokeGroup(groups)).toEqual({ id: "g1", label: "Done" });
  });

  it("returns null when the board has no group (lacks a usable group)", () => {
    expect(pickMondaySmokeGroup([])).toBeNull(); // -> BLOCKED_ENV
  });
});

describe("pickMondaySecondGroup — a distinct move_item destination group", () => {
  const groups: MondayGroupLite[] = [
    { id: "g2", label: "To Do" },
    { id: "g1", label: "Done" },
    { id: "g3", label: "In Progress" },
  ];

  it("picks the alphabetically-first group that is NOT the source", () => {
    // Source is "Done" (g1, alphabetically first) -> second is "In Progress" (g3).
    expect(pickMondaySecondGroup(groups, "g1")).toEqual({ id: "g3", label: "In Progress" });
  });

  it("is deterministic regardless of input order", () => {
    const shuffled = [groups[2]!, groups[0]!, groups[1]!];
    expect(pickMondaySecondGroup(shuffled, "g1")?.id).toBe("g3");
  });

  it("returns null when the only group IS the source (board has one group)", () => {
    expect(pickMondaySecondGroup([{ id: "g1", label: "Done" }], "g1")).toBeNull(); // -> BLOCKED_ENV
  });
});
