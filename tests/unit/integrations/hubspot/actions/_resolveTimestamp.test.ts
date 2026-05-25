/**
 * @jest-environment node
 *
 * Tests for the shared timestamp resolver used by create_note /
 * create_task / create_call / create_meeting.
 */
import { resolveTimestampMs } from "@/integrations/hubspot/actions/_resolveTimestamp";

describe("resolveTimestampMs", () => {
  it("returns null for undefined / empty input", () => {
    expect(resolveTimestampMs(undefined)).toBeNull();
    expect(resolveTimestampMs("")).toBeNull();
  });

  it("passes through clean epoch-ms strings unchanged (cheap path)", () => {
    expect(resolveTimestampMs("1700000000000")).toBe("1700000000000");
    // 10 digits (seconds-precision is too short) — falls through to
    // Date.parse, which treats it as the year 56000-ish. The regex
    // requires 10-16 digits so this matches.
    expect(resolveTimestampMs("1700000000")).toBe("1700000000");
  });

  it("parses ISO 8601 strings to epoch-ms-string", () => {
    const result = resolveTimestampMs("2026-05-10T12:00:00.000Z");
    expect(result).toBe(
      Date.parse("2026-05-10T12:00:00.000Z").toString(),
    );
  });

  it("returns null on unparseable input", () => {
    expect(resolveTimestampMs("not a date")).toBeNull();
    expect(resolveTimestampMs("abc123")).toBeNull();
  });

  it("returns null on input that produces NaN (defensive)", () => {
    // V1's createTask had this guard; createNote/Call/Meeting didn't.
    // V2 helper applies it uniformly.
    expect(resolveTimestampMs("Invalid Date")).toBeNull();
  });
});
