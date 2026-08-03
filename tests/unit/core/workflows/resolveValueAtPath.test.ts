/** @jest-environment node */
/**
 * Tests for core/workflows/resolveValueAtPath.ts.
 *
 * Pin: permissive walks (no throws), strict absence semantics
 * (undefined intermediates are absent, but null/zero/false leaves
 * are kept), bracket array indices, malformed-path short-circuit.
 */
import { resolveValueAtPath } from "@/core/workflows/resolveValueAtPath";

describe("resolveValueAtPath", () => {
  it("empty path returns root", () => {
    expect(resolveValueAtPath({ a: 1 }, "")).toEqual({
      found: true,
      value: { a: 1 },
    });
  });

  it("empty path on undefined root is absent", () => {
    expect(resolveValueAtPath(undefined, "")).toEqual({
      found: false,
      value: undefined,
    });
  });

  it("walks a scalar key", () => {
    expect(resolveValueAtPath({ name: "marcus" }, "name")).toEqual({
      found: true,
      value: "marcus",
    });
  });

  it("walks a nested path", () => {
    expect(
      resolveValueAtPath({ payload: { from: { name: "Eve" } } }, "payload.from.name"),
    ).toEqual({ found: true, value: "Eve" });
  });

  it("missing intermediate is absent", () => {
    expect(resolveValueAtPath({ a: {} }, "a.b.c")).toEqual({
      found: false,
      value: undefined,
    });
  });

  it("missing leaf key is absent", () => {
    expect(resolveValueAtPath({ a: 1 }, "b")).toEqual({
      found: false,
      value: undefined,
    });
  });

  it("null intermediate is absent (cannot descend further)", () => {
    expect(resolveValueAtPath({ a: null }, "a.b")).toEqual({
      found: false,
      value: undefined,
    });
  });

  it("null leaf is FOUND (callers want to show 'null')", () => {
    expect(resolveValueAtPath({ a: null }, "a")).toEqual({
      found: true,
      value: null,
    });
  });

  it("undefined leaf maps to absent (cannot distinguish from missing)", () => {
    expect(resolveValueAtPath({ a: undefined }, "a")).toEqual({
      found: false,
      value: undefined,
    });
  });

  it("falsy leafs are surfaced verbatim — 0, false, empty string", () => {
    expect(resolveValueAtPath({ a: 0 }, "a")).toEqual({ found: true, value: 0 });
    expect(resolveValueAtPath({ a: false }, "a")).toEqual({
      found: true,
      value: false,
    });
    expect(resolveValueAtPath({ a: "" }, "a")).toEqual({ found: true, value: "" });
  });

  it("array numeric index walks via brackets", () => {
    expect(
      resolveValueAtPath({ items: [{ name: "a" }, { name: "b" }] }, "items[1].name"),
    ).toEqual({ found: true, value: "b" });
  });

  it("array out-of-bounds index is absent", () => {
    expect(resolveValueAtPath({ items: ["x"] }, "items[5]")).toEqual({
      found: false,
      value: undefined,
    });
  });

  it("property descent into an array is absent (must use brackets)", () => {
    expect(resolveValueAtPath({ items: ["x"] }, "items.0")).toEqual({
      found: false,
      value: undefined,
    });
  });

  it("malformed paths short-circuit to absent — leading dot", () => {
    expect(resolveValueAtPath({ a: 1 }, ".a")).toEqual({
      found: false,
      value: undefined,
    });
  });

  it("malformed paths short-circuit to absent — unterminated bracket", () => {
    expect(resolveValueAtPath({ a: [1] }, "a[0")).toEqual({
      found: false,
      value: undefined,
    });
  });

  it("malformed paths short-circuit to absent — non-integer bracket", () => {
    expect(resolveValueAtPath({ a: [1] }, "a[hello]")).toEqual({
      found: false,
      value: undefined,
    });
  });

  it("malformed paths short-circuit to absent — negative bracket", () => {
    expect(resolveValueAtPath({ a: [1] }, "a[-1]")).toEqual({
      found: false,
      value: undefined,
    });
  });

  it("exotic containers do not descend (Map, Date)", () => {
    expect(resolveValueAtPath(new Map([["a", 1]]), "a")).toEqual({
      found: false,
      value: undefined,
    });
    expect(resolveValueAtPath(new Date(), "getTime")).toEqual({
      found: false,
      value: undefined,
    });
  });

  it("Object.create(null) walks normally", () => {
    const obj = Object.create(null) as Record<string, unknown>;
    obj.x = 1;
    expect(resolveValueAtPath(obj, "x")).toEqual({ found: true, value: 1 });
  });

  it("primitive root returns absent for any non-empty path", () => {
    expect(resolveValueAtPath("hello", "length")).toEqual({
      found: false,
      value: undefined,
    });
  });
});
