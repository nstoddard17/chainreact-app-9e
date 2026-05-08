/**
 * @jest-environment node
 */
import { normalize } from "@/integrations/google-sheets/triggers/rowChanged/normalize";

describe("normalize", () => {
  const baseContext = {
    accountId: "alice@example.test",
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
    expect(ev.accountId).toBe("alice@example.test");
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
});
