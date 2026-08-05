/**
 * @jest-environment node
 *
 * SUPABASE-TABLE-TYPING-1B — writing a typed domain value into a jsonb column.
 *
 * `toJsonColumn` exists so a repository never has to write `value as Json`, an
 * assertion nothing checks. It must reproduce `JSON.stringify` EXACTLY, because
 * supabase-js serializes the payload with `JSON.stringify` anyway — if the two
 * disagreed, this batch would have silently changed what reaches Postgres.
 * Every case below is pinned against `JSON.parse(JSON.stringify(x))`.
 */
import { toJsonColumn } from "@/core/database/jsonColumn";

/** What the driver would have stored. */
const viaDriver = (v: unknown) => JSON.parse(JSON.stringify(v));

describe("toJsonColumn — identical to what the driver would serialize", () => {
  it.each([
    ["primitives", { a: 1, b: "x", c: true, d: null }],
    ["nested objects", { a: { b: { c: [1, 2, 3] } } }],
    ["arrays of objects", [{ nodeId: "n1", status: "succeeded" }, { nodeId: "n2" }]],
    ["empty object", {}],
    ["empty array", []],
    ["a trigger envelope", {
      provider: "slack",
      eventType: "message_received",
      eventId: "Ev1",
      occurredAt: "2026-08-05T00:00:00.000Z",
      providerAccountId: "T1",
      payload: { text: "hi", nested: { deep: [1, { x: null }] } },
    }],
  ])("matches the driver for %s", (_label, value) => {
    expect(toJsonColumn("col", value)).toEqual(viaDriver(value));
  });

  it("drops undefined-valued keys from objects, exactly like JSON.stringify", () => {
    const v = { kept: 1, dropped: undefined };
    expect(toJsonColumn("col", v)).toEqual(viaDriver(v));
    expect(toJsonColumn("col", v)).toEqual({ kept: 1 });
  });

  it("turns undefined/function array elements into null, exactly like JSON.stringify", () => {
    const v = [1, undefined, () => 0, "x"];
    expect(toJsonColumn("col", v)).toEqual(viaDriver(v));
    expect(toJsonColumn("col", v)).toEqual([1, null, null, "x"]);
  });

  it("drops function- and symbol-valued keys, exactly like JSON.stringify", () => {
    const v = { kept: 1, fn: () => 0, sym: Symbol("s") };
    expect(toJsonColumn("col", v)).toEqual(viaDriver(v));
  });

  it("turns NaN / Infinity into null, exactly like JSON.stringify", () => {
    const v = { a: NaN, b: Infinity, c: -Infinity, d: 1.5 };
    expect(toJsonColumn("col", v)).toEqual(viaDriver(v));
  });

  it("honours toJSON(), so a Date serializes to its ISO string", () => {
    const v = { at: new Date("2026-08-05T00:00:00.000Z") };
    expect(toJsonColumn("col", v)).toEqual(viaDriver(v));
    expect(toJsonColumn("col", v)).toEqual({ at: "2026-08-05T00:00:00.000Z" });
  });

  it("passes null and bare primitives through", () => {
    expect(toJsonColumn("col", null)).toBeNull();
    expect(toJsonColumn("col", "s")).toBe("s");
    expect(toJsonColumn("col", 3)).toBe(3);
    expect(toJsonColumn("col", false)).toBe(false);
  });

  it("does not share structure with the input (the stored value is constructed)", () => {
    const input = { nested: { a: 1 } };
    const out = toJsonColumn("col", input) as { nested: { a: number } };
    out.nested.a = 99;
    expect(input.nested.a).toBe(1);
  });
});

describe("toJsonColumn — fails closed where JSON has no encoding", () => {
  it("throws on a circular reference, naming the column", () => {
    const circular: Record<string, unknown> = { a: 1 };
    circular.self = circular;
    expect(() => toJsonColumn("workflow_runs.steps", circular)).toThrow(
      /workflow_runs\.steps.*circular/,
    );
    // JSON.stringify throws here too — behaviour is unchanged.
    expect(() => JSON.stringify(circular)).toThrow();
  });

  it("throws on BigInt, which JSON.stringify also refuses", () => {
    expect(() => toJsonColumn("col", { n: 1n })).toThrow(/BigInt/);
    expect(() => JSON.stringify({ n: 1n })).toThrow();
  });

  it("throws when the ROOT value has no JSON encoding", () => {
    expect(() => toJsonColumn("col", undefined)).toThrow(/cannot be stored/);
    expect(() => toJsonColumn("col", () => 0)).toThrow(/cannot be stored/);
  });
});
