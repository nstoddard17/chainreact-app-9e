/**
 * @jest-environment node
 *
 * Slice 3.SEC-7 — tests for the redactOutput helper.
 *
 * Covers:
 *   - Top-level sensitive field is replaced with the sentinel.
 *   - Non-sensitive fields pass through unchanged.
 *   - Nested object: only marked fields are redacted; siblings preserved.
 *   - Nested object: when parent is sensitive, whole subtree is replaced
 *     without descending.
 *   - Arrays of objects: per-item field-level redaction.
 *   - Missing meta / unknown shapes: pass through without throwing.
 *   - Input is NEVER mutated (reference identity check after redaction).
 *   - Null / undefined / scalar inputs: pass through.
 */

import type { OutputMeta } from "@/contracts/actionMeta";
import {
  REDACTED_SENTINEL,
  redactOutput,
} from "@/core/security/redactOutput";

describe("redactOutput — sentinel", () => {
  it("exports a stable sentinel string", () => {
    expect(REDACTED_SENTINEL).toBe("[REDACTED]");
  });
});

describe("redactOutput — top-level redaction", () => {
  it("replaces a sensitive scalar field with the sentinel", () => {
    const meta: OutputMeta[] = [
      { name: "id", type: "string" },
      { name: "clientSecret", type: "string", sensitive: true },
    ];
    const out = redactOutput({ id: "pi_1", clientSecret: "pi_1_secret_xyz" }, meta);
    expect(out).toEqual({ id: "pi_1", clientSecret: REDACTED_SENTINEL });
  });

  it("preserves non-sensitive fields verbatim", () => {
    const meta: OutputMeta[] = [{ name: "id", type: "string" }];
    const out = redactOutput({ id: "pi_1", amount: 100, currency: "usd" }, meta);
    expect(out).toEqual({ id: "pi_1", amount: 100, currency: "usd" });
  });

  it("replaces a sensitive object field with the sentinel (whole-subtree hide)", () => {
    const meta: OutputMeta[] = [
      { name: "id", type: "string" },
      { name: "customer", type: "object", sensitive: true },
    ];
    const out = redactOutput(
      { id: "pi_1", customer: { email: "user@example.com", name: "Alice" } },
      meta,
    );
    expect(out).toEqual({ id: "pi_1", customer: REDACTED_SENTINEL });
  });

  it("replaces a sensitive array field with the sentinel", () => {
    const meta: OutputMeta[] = [
      { name: "results", type: "array", sensitive: true },
    ];
    const out = redactOutput(
      { results: [{ id: "r1", email: "a@b.c" }, { id: "r2", email: "x@y.z" }] },
      meta,
    );
    expect(out).toEqual({ results: REDACTED_SENTINEL });
  });
});

describe("redactOutput — nested-field descent", () => {
  it("redacts a nested sensitive field inside an object, preserves siblings", () => {
    const meta: OutputMeta[] = [
      {
        name: "user",
        type: "object",
        fields: [
          { name: "id", type: "string" },
          { name: "email", type: "string", sensitive: true },
          { name: "displayName", type: "string" },
        ],
      },
    ];
    const out = redactOutput(
      { user: { id: "u-1", email: "secret@example.com", displayName: "Alice" } },
      meta,
    );
    expect(out).toEqual({
      user: { id: "u-1", email: REDACTED_SENTINEL, displayName: "Alice" },
    });
  });

  it("redacts deeply nested sensitive field (3 levels)", () => {
    const meta: OutputMeta[] = [
      {
        name: "envelope",
        type: "object",
        fields: [
          {
            name: "user",
            type: "object",
            fields: [
              {
                name: "contact",
                type: "object",
                fields: [{ name: "email", type: "string", sensitive: true }],
              },
            ],
          },
        ],
      },
    ];
    const out = redactOutput(
      { envelope: { user: { contact: { email: "deep@example.com" } } } },
      meta,
    );
    expect(out).toEqual({
      envelope: { user: { contact: { email: REDACTED_SENTINEL } } },
    });
  });

  it("passes through keys present in the value but absent in meta", () => {
    // Catches the "handler emits more than the meta documents" case.
    const meta: OutputMeta[] = [
      {
        name: "user",
        type: "object",
        fields: [{ name: "email", type: "string", sensitive: true }],
      },
    ];
    const out = redactOutput(
      { user: { email: "secret@example.com", undocumented: "preserved" } },
      meta,
    );
    expect(out).toEqual({
      user: { email: REDACTED_SENTINEL, undocumented: "preserved" },
    });
  });
});

describe("redactOutput — array-of-objects per-item descent", () => {
  it("redacts a sensitive nested field on each item of an array", () => {
    const meta: OutputMeta[] = [
      {
        name: "payments",
        type: "array",
        fields: [
          { name: "id", type: "string" },
          { name: "customerEmail", type: "string", sensitive: true },
        ],
      },
    ];
    const out = redactOutput(
      {
        payments: [
          { id: "ch_1", customerEmail: "a@x.com" },
          { id: "ch_2", customerEmail: "b@y.com" },
        ],
      },
      meta,
    );
    expect(out).toEqual({
      payments: [
        { id: "ch_1", customerEmail: REDACTED_SENTINEL },
        { id: "ch_2", customerEmail: REDACTED_SENTINEL },
      ],
    });
  });

  it("passes through non-object items in an array (e.g. array of strings)", () => {
    const meta: OutputMeta[] = [
      {
        name: "tags",
        type: "array",
        fields: [{ name: "secret", type: "string", sensitive: true }],
      },
    ];
    const out = redactOutput({ tags: ["public-1", "public-2"] }, meta);
    expect(out).toEqual({ tags: ["public-1", "public-2"] });
  });
});

describe("redactOutput — fail-safe inputs", () => {
  it("returns value unchanged when meta is undefined", () => {
    const value = { id: "x", email: "a@b.c" };
    expect(redactOutput(value, undefined)).toBe(value);
  });

  it("returns value unchanged when meta is empty array", () => {
    const value = { id: "x", email: "a@b.c" };
    expect(redactOutput(value, [])).toBe(value);
  });

  it("returns value unchanged when value is null", () => {
    expect(redactOutput(null, [{ name: "x", type: "string", sensitive: true }])).toBeNull();
  });

  it("returns value unchanged when value is undefined", () => {
    expect(redactOutput(undefined, [{ name: "x", type: "string", sensitive: true }])).toBeUndefined();
  });

  it("returns value unchanged when value is a scalar (string)", () => {
    expect(
      redactOutput("hello", [{ name: "x", type: "string", sensitive: true }]),
    ).toBe("hello");
  });

  it("returns value unchanged when value is a number", () => {
    expect(redactOutput(42, [{ name: "x", type: "number", sensitive: true }])).toBe(42);
  });

  it("does NOT throw when meta says object but value is a string (shape mismatch)", () => {
    const meta: OutputMeta[] = [
      {
        name: "user",
        type: "object",
        fields: [{ name: "email", type: "string", sensitive: true }],
      },
    ];
    expect(() =>
      redactOutput({ user: "not-an-object" }, meta),
    ).not.toThrow();
    expect(redactOutput({ user: "not-an-object" }, meta)).toEqual({
      user: "not-an-object",
    });
  });

  it("does NOT spread class instances (Date / RegExp pass through)", () => {
    const date = new Date("2026-05-22T00:00:00Z");
    const meta: OutputMeta[] = [
      { name: "occurredAt", type: "string" },
      { name: "secret", type: "string", sensitive: true },
    ];
    const out = redactOutput({ occurredAt: date, secret: "abc" }, meta) as {
      occurredAt: unknown;
      secret: string;
    };
    expect(out.occurredAt).toBe(date);
    expect(out.secret).toBe(REDACTED_SENTINEL);
  });
});

describe("redactOutput — immutability", () => {
  it("never mutates the input object", () => {
    const value = {
      id: "pi_1",
      clientSecret: "pi_1_secret_xyz",
      user: { id: "u-1", email: "a@b.c" },
    };
    const meta: OutputMeta[] = [
      { name: "id", type: "string" },
      { name: "clientSecret", type: "string", sensitive: true },
      {
        name: "user",
        type: "object",
        fields: [
          { name: "id", type: "string" },
          { name: "email", type: "string", sensitive: true },
        ],
      },
    ];
    const snapshot = JSON.parse(JSON.stringify(value));
    redactOutput(value, meta);
    expect(value).toEqual(snapshot);
    expect(value.clientSecret).toBe("pi_1_secret_xyz");
    expect(value.user.email).toBe("a@b.c");
  });

  it("returns a fresh top-level object (reference inequality)", () => {
    const value = { id: "pi_1", secret: "x" };
    const meta: OutputMeta[] = [
      { name: "id", type: "string" },
      { name: "secret", type: "string", sensitive: true },
    ];
    const out = redactOutput(value, meta);
    expect(out).not.toBe(value);
  });

  it("returns fresh nested objects when descending into fields[]", () => {
    const value = { user: { id: "u-1", email: "a@b.c" } };
    const meta: OutputMeta[] = [
      {
        name: "user",
        type: "object",
        fields: [
          { name: "id", type: "string" },
          { name: "email", type: "string", sensitive: true },
        ],
      },
    ];
    const out = redactOutput(value, meta) as { user: unknown };
    expect(out.user).not.toBe(value.user);
  });
});
