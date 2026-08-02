import {
  encodeMobileCursor,
  decodeMobileCursor,
  clampMobilePageLimit,
  MOBILE_CURSOR_MAX_INPUT_LENGTH,
} from "@/core/mobile/cursor";

describe("core/mobile/cursor — the one mobile cursor format", () => {
  const position = {
    sortTs: "2026-07-31T10:05:00.000Z",
    id: "00000000-0000-4000-8000-0000000000c2",
  };

  it("round-trips encode → decode exactly", () => {
    expect(decodeMobileCursor(encodeMobileCursor(position))).toEqual(position);
  });

  it("is opaque transport (base64url, no dots/plus/slash/equals)", () => {
    const encoded = encodeMobileCursor(position);
    expect(encoded).toMatch(/^[A-Za-z0-9_-]+$/);
  });

  it.each([
    ["empty", ""],
    ["not base64url", "!!!not-a-cursor!!!"],
    ["random base64 of garbage", Buffer.from("garbage").toString("base64url")],
    ["wrong version", Buffer.from("v9.2026-07-31T10:05:00.000Z.00000000-0000-4000-8000-0000000000c2").toString("base64url")],
    ["malformed timestamp", Buffer.from("v1.yesterday.00000000-0000-4000-8000-0000000000c2").toString("base64url")],
    ["SQL in timestamp slot", Buffer.from("v1.2026-07-31T10:05:00.000Z;drop table.00000000-0000-4000-8000-0000000000c2").toString("base64url")],
    ["malformed id", Buffer.from("v1.2026-07-31T10:05:00.000Z.not-a-uuid").toString("base64url")],
    ["missing segments", Buffer.from("v1.only-one-part").toString("base64url")],
  ])("rejects %s with null (stable 400 at the route)", (_label, input) => {
    expect(decodeMobileCursor(input)).toBeNull();
  });

  it("bounds decoder input size", () => {
    const oversize = "A".repeat(MOBILE_CURSOR_MAX_INPUT_LENGTH + 1);
    expect(decodeMobileCursor(oversize)).toBeNull();
  });

  it("a cursor carries position only — no authority fields exist to tamper with", () => {
    const decoded = decodeMobileCursor(encodeMobileCursor(position));
    expect(Object.keys(decoded ?? {}).sort()).toEqual(["id", "sortTs"]);
  });

  it("clamps limits: default, floor 1, ceiling max, non-integer → default", () => {
    const bounds = { fallback: 25, max: 100 };
    expect(clampMobilePageLimit(undefined, bounds)).toBe(25);
    expect(clampMobilePageLimit(0, bounds)).toBe(1);
    expect(clampMobilePageLimit(-5, bounds)).toBe(1);
    expect(clampMobilePageLimit(1000, bounds)).toBe(100);
    expect(clampMobilePageLimit(2.5, bounds)).toBe(25);
    expect(clampMobilePageLimit(Number.NaN, bounds)).toBe(25);
    expect(clampMobilePageLimit(40, bounds)).toBe(40);
  });
});
