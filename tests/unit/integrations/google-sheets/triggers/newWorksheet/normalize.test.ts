/**
 * @jest-environment node
 */
import { normalize } from "@/integrations/google-sheets/triggers/newWorksheet/normalize";

describe("new_worksheet normalize", () => {
  const baseInput = {
    sheetId: 42,
    worksheetName: "Sheet2",
    index: 1,
    sheetType: "GRID",
    occurredAt: "2026-05-15T12:00:00.000Z",
  };
  const baseContext = {
    accountId: "alice@example.test",
    spreadsheetId: "ss-1",
  };

  it("emits a TriggerEvent with the canonical payload shape", () => {
    const ev = normalize(baseInput, baseContext);
    expect(ev.provider).toBe("google-sheets");
    expect(ev.eventType).toBe("new_worksheet");
    expect(ev.accountId).toBe("alice@example.test");
    expect(ev.occurredAt).toBe("2026-05-15T12:00:00.000Z");
    expect(ev.payload).toEqual({
      changeKind: "added",
      spreadsheetId: "ss-1",
      worksheetId: 42,
      worksheetName: "Sheet2",
      index: 1,
      sheetType: "GRID",
    });
  });

  it("eventId combines spreadsheetId + new_worksheet + sheetId + nameHash", () => {
    const ev = normalize(baseInput, baseContext);
    // Format: ss-1:new_worksheet:42:<12-hex-chars>
    expect(ev.eventId).toMatch(/^ss-1:new_worksheet:42:[0-9a-f]{12}$/);
  });

  it("identical sheets produce identical eventIds (idempotent webhook firings dedup)", () => {
    const a = normalize(baseInput, baseContext);
    const b = normalize(
      { ...baseInput, occurredAt: "2026-05-15T13:00:00.000Z" },
      baseContext,
    );
    expect(a.eventId).toBe(b.eventId);
    expect(a.occurredAt).not.toBe(b.occurredAt);
  });

  it("renamed sheet (same sheetId, different name) produces a DIFFERENT eventId", () => {
    const original = normalize(baseInput, baseContext);
    const renamed = normalize({ ...baseInput, worksheetName: "Renamed" }, baseContext);
    expect(original.eventId).not.toBe(renamed.eventId);
  });

  it("different sheetId produces a different eventId (delete-then-recreate fires fresh)", () => {
    const original = normalize(baseInput, baseContext);
    const recreated = normalize({ ...baseInput, sheetId: 99 }, baseContext);
    expect(original.eventId).not.toBe(recreated.eventId);
  });

  it("different spreadsheetId produces a different eventId", () => {
    const a = normalize(baseInput, baseContext);
    const b = normalize(baseInput, { ...baseContext, spreadsheetId: "ss-2" });
    expect(a.eventId).not.toBe(b.eventId);
  });

  it("tolerates null index + null sheetType in payload", () => {
    const ev = normalize(
      { ...baseInput, index: null, sheetType: null },
      baseContext,
    );
    expect(ev.payload.index).toBeNull();
    expect(ev.payload.sheetType).toBeNull();
  });

  it("supports sheetId=0 (the default first sheet) without falsy-bug regression", () => {
    const ev = normalize({ ...baseInput, sheetId: 0 }, baseContext);
    expect(ev.eventId).toMatch(/^ss-1:new_worksheet:0:[0-9a-f]{12}$/);
    expect(ev.payload.worksheetId).toBe(0);
  });
});
