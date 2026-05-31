/**
 * @jest-environment node
 */
import { normalize } from "@/integrations/google-sheets/triggers/rowChanged/normalize";

describe("normalize", () => {
  const baseContext = {
    providerAccountId: "alice@example.test",
    spreadsheetId: "ss-1",
    sheetName: "Sheet1",
    headers: null,
  };

  it("emits a TriggerEvent with the canonical payload shape", () => {
    const ev = normalize(
      {
        rowIndex: 5,
        rowValues: ["alice", "alice@e.test", 42],
        occurredAt: "2026-05-08T12:00:00Z",
      },
      baseContext,
    );

    expect(ev.provider).toBe("google-sheets");
    expect(ev.eventType).toBe("row_changed");
    expect(ev.occurredAt).toBe("2026-05-08T12:00:00Z");
    expect(ev.providerAccountId).toBe("alice@example.test");
    expect(ev.payload).toMatchObject({
      changeKind: "added",
      spreadsheetId: "ss-1",
      sheetName: "Sheet1",
      rowIndex: 5,
      rowValues: ["alice", "alice@e.test", 42],
      headers: null,
    });
  });

  it("eventId combines spreadsheetId + sheetName + rowIndex + value-hash", () => {
    const ev = normalize(
      { rowIndex: 5, rowValues: ["x"], occurredAt: "t" },
      baseContext,
    );
    // Format: ss-1:Sheet1:5:<12-hex-chars>
    expect(ev.eventId).toMatch(/^ss-1:Sheet1:5:[0-9a-f]{12}$/);
  });

  it("identical rows at the same index produce identical eventIds (duplicate-collapse)", () => {
    const a = normalize(
      { rowIndex: 5, rowValues: ["x", 1], occurredAt: "t1" },
      baseContext,
    );
    const b = normalize(
      { rowIndex: 5, rowValues: ["x", 1], occurredAt: "t2" }, // different timestamp
      baseContext,
    );
    expect(a.eventId).toBe(b.eventId);
    // occurredAt differs but eventId is timestamp-independent — that's
    // the point of dedup at the dispatcher.
    expect(a.occurredAt).not.toBe(b.occurredAt);
  });

  it("different values at the same index produce different eventIds (overwrite-as-fresh)", () => {
    const a = normalize(
      { rowIndex: 5, rowValues: ["alice"], occurredAt: "t" },
      baseContext,
    );
    const b = normalize(
      { rowIndex: 5, rowValues: ["bob"], occurredAt: "t" },
      baseContext,
    );
    expect(a.eventId).not.toBe(b.eventId);
  });

  it("different rowIndex produces different eventIds (every row distinct)", () => {
    const a = normalize(
      { rowIndex: 5, rowValues: ["x"], occurredAt: "t" },
      baseContext,
    );
    const b = normalize(
      { rowIndex: 6, rowValues: ["x"], occurredAt: "t" },
      baseContext,
    );
    expect(a.eventId).not.toBe(b.eventId);
  });

  it("different sheets produce different eventIds even with same row+values", () => {
    const a = normalize(
      { rowIndex: 5, rowValues: ["x"], occurredAt: "t" },
      { ...baseContext, sheetName: "Sheet1" },
    );
    const b = normalize(
      { rowIndex: 5, rowValues: ["x"], occurredAt: "t" },
      { ...baseContext, sheetName: "Sheet2" },
    );
    expect(a.eventId).not.toBe(b.eventId);
  });

  it("surfaces headers when context provides them", () => {
    const ev = normalize(
      { rowIndex: 5, rowValues: ["alice", "a@e"], occurredAt: "t" },
      { ...baseContext, headers: ["Name", "Email"] },
    );
    expect(ev.payload.headers).toEqual(["Name", "Email"]);
  });

  describe("Sheets 2.3 — extended changeKind variants", () => {
    const ctxPositional = {
      providerAccountId: "alice@example.test",
      spreadsheetId: "ss-1",
      sheetName: "Sheet1",
      headers: null,
      keyColumn: null,
    };
    const ctxKeyColumn = {
      ...ctxPositional,
      keyColumn: "id",
    };

    it("emits changeKind: 'updated' when called with 'updated'", () => {
      const ev = normalize(
        {
          rowIndex: 5,
          rowValues: ["alice", "updated"],
          rowKey: "5",
          rowHash: "a".repeat(64),
          occurredAt: "t",
        },
        ctxPositional,
        "updated",
        { useLegacyEventId: false },
      );
      expect(ev.payload.changeKind).toBe("updated");
      expect(ev.payload.rowValues).toEqual(["alice", "updated"]);
    });

    it("emits changeKind: 'removed' with null rowIndex + null rowValues", () => {
      const ev = normalize(
        {
          rowIndex: null,
          rowValues: null,
          rowKey: "5",
          rowHash: "b".repeat(64),
          occurredAt: "t",
        },
        ctxPositional,
        "removed",
        { useLegacyEventId: false },
      );
      expect(ev.payload.changeKind).toBe("removed");
      expect(ev.payload.rowIndex).toBeNull();
      expect(ev.payload.rowValues).toBeNull();
    });

    it("extended eventId includes the changeKind infix", () => {
      const ev = normalize(
        {
          rowIndex: 5,
          rowValues: ["x"],
          rowKey: "5",
          rowHash: "c".repeat(64),
          occurredAt: "t",
        },
        ctxPositional,
        "updated",
        { useLegacyEventId: false },
      );
      // Format: ss-1:Sheet1:updated:5:<12-hex>
      expect(ev.eventId).toBe("ss-1:Sheet1:updated:5:cccccccccccc");
    });

    it("extended eventId for 'added' DIFFERS from legacy 'added' eventId (D-EventId)", () => {
      const legacy = normalize(
        { rowIndex: 5, rowValues: ["x"], occurredAt: "t" },
        ctxPositional,
      );
      const extended = normalize(
        {
          rowIndex: 5,
          rowValues: ["x"],
          rowKey: "5",
          rowHash: createHashLocal(["x"]),
          occurredAt: "t",
        },
        ctxPositional,
        "added",
        { useLegacyEventId: false },
      );
      // Legacy: ss-1:Sheet1:5:<hash>. Extended: ss-1:Sheet1:added:5:<hash>.
      // The infix prevents collision between the legacy added-only
      // dedup space and the extended added/updated/removed space.
      expect(legacy.eventId).not.toBe(extended.eventId);
      expect(extended.eventId).toContain(":added:");
    });

    it("added/updated/removed eventIds for the same key are distinct (dedup safe)", () => {
      const added = normalize(
        {
          rowIndex: 5,
          rowValues: ["x"],
          rowKey: "5",
          rowHash: createHashLocal(["x"]),
          occurredAt: "t",
        },
        ctxPositional,
        "added",
        { useLegacyEventId: false },
      );
      const updated = normalize(
        {
          rowIndex: 5,
          rowValues: ["x"],
          rowKey: "5",
          rowHash: createHashLocal(["x"]),
          occurredAt: "t",
        },
        ctxPositional,
        "updated",
        { useLegacyEventId: false },
      );
      const removed = normalize(
        {
          rowIndex: null,
          rowValues: null,
          rowKey: "5",
          rowHash: createHashLocal(["x"]),
          occurredAt: "t",
        },
        ctxPositional,
        "removed",
        { useLegacyEventId: false },
      );
      expect(added.eventId).not.toBe(updated.eventId);
      expect(added.eventId).not.toBe(removed.eventId);
      expect(updated.eventId).not.toBe(removed.eventId);
    });

    it("keyColumn mode populates keyColumn + keyValue in payload", () => {
      const ev = normalize(
        {
          rowIndex: 5,
          rowValues: ["a1", "alice"],
          rowKey: "a1",
          rowHash: "d".repeat(64),
          occurredAt: "t",
        },
        ctxKeyColumn,
        "updated",
        { useLegacyEventId: false },
      );
      expect(ev.payload.keyColumn).toBe("id");
      expect(ev.payload.keyValue).toBe("a1");
      expect(ev.payload.rowKey).toBe("a1");
    });

    it("positional mode emits keyColumn=null + keyValue=null", () => {
      const ev = normalize(
        {
          rowIndex: 5,
          rowValues: ["x"],
          rowKey: "5",
          rowHash: "e".repeat(64),
          occurredAt: "t",
        },
        ctxPositional,
        "updated",
        { useLegacyEventId: false },
      );
      expect(ev.payload.keyColumn).toBeNull();
      expect(ev.payload.keyValue).toBeNull();
      expect(ev.payload.rowKey).toBe("5");
    });

    it("previousValues is ALWAYS null (D-PreviousValues)", () => {
      for (const kind of ["added", "updated", "removed"] as const) {
        const ev = normalize(
          {
            rowIndex: kind === "removed" ? null : 5,
            rowValues: kind === "removed" ? null : ["x"],
            rowKey: "5",
            rowHash: "f".repeat(64),
            occurredAt: "t",
          },
          ctxPositional,
          kind,
          { useLegacyEventId: false },
        );
        expect(ev.payload.previousValues).toBeNull();
      }
    });

    it("throws when removed event has null rowValues + no rowHash (hash required)", () => {
      expect(() =>
        normalize(
          {
            rowIndex: null,
            rowValues: null,
            rowKey: "5",
            // No rowHash provided.
            occurredAt: "t",
          },
          ctxPositional,
          "removed",
          { useLegacyEventId: false },
        ),
      ).toThrow(/rowHash/);
    });

    it("uses the same hash function as snapshot.hashRow (dedup alignment)", () => {
      // Build an eventId manually using the same algorithm as the
      // snapshot helper, and verify normalize produces the same one.
      const values = ["alice", 30];
      const fullHash = createHashLocal(values);
      const shortHash = fullHash.slice(0, 12);
      const ev = normalize(
        {
          rowIndex: 5,
          rowValues: values,
          rowKey: "5",
          rowHash: fullHash,
          occurredAt: "t",
        },
        ctxPositional,
        "added",
        { useLegacyEventId: false },
      );
      expect(ev.eventId).toBe(`ss-1:Sheet1:added:5:${shortHash}`);
    });
  });
});

// Local mirror of the snapshot helper's hash so the test stays
// self-contained but pins the algorithm.
function createHashLocal(values: ReadonlyArray<unknown>): string {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { createHash } = require("node:crypto") as typeof import("node:crypto");
  return createHash("sha256").update(JSON.stringify(values)).digest("hex");
}
