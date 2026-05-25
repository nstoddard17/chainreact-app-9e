import {
  buildIdempotencyKey,
  hashPayload,
} from "@/core/workflows/idempotency";

describe("buildIdempotencyKey (Q4)", () => {
  it("produces a deterministic key from meta", () => {
    const meta = {
      executionSessionId: "session-1",
      nodeId: "node-a",
      actionType: "google_calendar_create_event",
    };
    expect(buildIdempotencyKey(meta)).toBe(
      "session-1:node-a:google_calendar_create_event",
    );
  });

  it("changes when any meta field changes", () => {
    const a = buildIdempotencyKey({
      executionSessionId: "s1",
      nodeId: "n1",
      actionType: "t1",
    });
    const b = buildIdempotencyKey({
      executionSessionId: "s2",
      nodeId: "n1",
      actionType: "t1",
    });
    const c = buildIdempotencyKey({
      executionSessionId: "s1",
      nodeId: "n2",
      actionType: "t1",
    });
    const d = buildIdempotencyKey({
      executionSessionId: "s1",
      nodeId: "n1",
      actionType: "t2",
    });
    expect(new Set([a, b, c, d]).size).toBe(4);
  });
});

describe("hashPayload (Q4)", () => {
  it("returns a 64-char hex SHA-256", () => {
    const h = hashPayload({ a: 1 });
    expect(h).toMatch(/^[0-9a-f]{64}$/);
  });

  it("is deterministic for the same input", () => {
    const h1 = hashPayload({ a: 1, b: "x" });
    const h2 = hashPayload({ a: 1, b: "x" });
    expect(h1).toBe(h2);
  });

  it("ignores object key order at the top level", () => {
    expect(hashPayload({ a: 1, b: 2 })).toBe(hashPayload({ b: 2, a: 1 }));
  });

  it("ignores object key order recursively", () => {
    const h1 = hashPayload({ outer: { a: 1, b: { x: "y", z: "w" } } });
    const h2 = hashPayload({ outer: { b: { z: "w", x: "y" }, a: 1 } });
    expect(h1).toBe(h2);
  });

  it("preserves array order (order matters for arrays)", () => {
    expect(hashPayload({ list: [1, 2, 3] })).not.toBe(
      hashPayload({ list: [3, 2, 1] }),
    );
  });

  it("differentiates different values", () => {
    expect(hashPayload({ a: 1 })).not.toBe(hashPayload({ a: 2 }));
    expect(hashPayload({ a: "1" })).not.toBe(hashPayload({ a: 1 }));
  });

  it("treats undefined values as null (canonical)", () => {
    expect(hashPayload({ a: undefined })).toBe(hashPayload({ a: null }));
  });
});
