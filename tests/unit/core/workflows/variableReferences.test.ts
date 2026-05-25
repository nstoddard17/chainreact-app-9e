/**
 * @jest-environment node
 *
 * Tests for core/workflows/variableReferences — Slice 3.7.
 *
 * The picker emits these tokens; the future React Agent parses them to
 * reason about workflow variable usage. Tests pin both directions
 * (parse + format) so a future agent can round-trip references
 * losslessly.
 */

import {
  formatReference,
  parseReferences,
  type VariableReference,
} from "@/core/workflows/variableReferences";

describe("parseReferences", () => {
  it("returns [] for non-string inputs", () => {
    expect(parseReferences(undefined)).toEqual([]);
    expect(parseReferences(null)).toEqual([]);
    expect(parseReferences(42)).toEqual([]);
    expect(parseReferences({})).toEqual([]);
    expect(parseReferences([])).toEqual([]);
  });

  it("returns [] for plain strings without tokens", () => {
    expect(parseReferences("")).toEqual([]);
    expect(parseReferences("Hello world")).toEqual([]);
    expect(parseReferences("no { or {{ here")).toEqual([]);
  });

  it("extracts a single simple reference", () => {
    const refs = parseReferences("{{trigger.message}}");
    expect(refs).toHaveLength(1);
    expect(refs[0]).toEqual<VariableReference>({
      token: "{{trigger.message}}",
      nodeId: "trigger",
      path: "message",
      offset: 0,
    });
  });

  it("extracts multiple references in source order", () => {
    const refs = parseReferences(
      "Hi {{trigger.from}}, you said: {{node-x.body}}.",
    );
    expect(refs).toHaveLength(2);
    expect(refs[0]!.nodeId).toBe("trigger");
    expect(refs[0]!.path).toBe("from");
    expect(refs[0]!.offset).toBe(3);
    expect(refs[1]!.nodeId).toBe("node-x");
    expect(refs[1]!.path).toBe("body");
    expect(refs[1]!.offset).toBeGreaterThan(refs[0]!.offset);
  });

  it("extracts a reference with no path (whole-node alias)", () => {
    expect(parseReferences("{{trigger}}")).toEqual([
      {
        token: "{{trigger}}",
        nodeId: "trigger",
        path: "",
        offset: 0,
      },
    ]);
  });

  it("preserves bracket-index paths verbatim", () => {
    const refs = parseReferences("{{node-1.attachments[0].name}}");
    expect(refs[0]!.path).toBe("attachments[0].name");
  });

  it("preserves a leading bracket path (no leading dot)", () => {
    const refs = parseReferences("{{node-1[0]}}");
    expect(refs[0]!.path).toBe("[0]");
  });

  it("trims internal whitespace inside the token", () => {
    expect(parseReferences("{{ trigger.foo }}")[0]).toEqual({
      token: "{{ trigger.foo }}",
      nodeId: "trigger",
      path: "foo",
      offset: 0,
    });
  });

  it("skips AI_FIELD tokens (agent construct, not author-pickable)", () => {
    expect(parseReferences("{{AI_FIELD:summary}}")).toEqual([]);
    // AI_FIELD alongside a real reference still surfaces the real ref.
    const refs = parseReferences(
      "AI: {{AI_FIELD:title}} — From: {{trigger.from}}",
    );
    expect(refs).toHaveLength(1);
    expect(refs[0]!.nodeId).toBe("trigger");
  });

  it("skips tokens with no leading identifier", () => {
    expect(parseReferences("{{.foo}}")).toEqual([]);
    expect(parseReferences("{{[0]}}")).toEqual([]);
    expect(parseReferences("{{}}")).toEqual([]);
  });

  it("stops scanning at an unterminated `{{...` open (permissive, doesn't throw)", () => {
    expect(parseReferences("hello {{trigger.foo")).toEqual([]);
  });

  it("greedy-matches to the first `}}` when nested `{{` appears (parser is intentionally simple)", () => {
    // Author intent in `{{trigger.foo {{trigger.bar}}` is ambiguous;
    // the parser takes the simple route and matches the first `}}`.
    // The resulting token's path contains the inner `{{trigger.bar` as
    // literal text. The runtime resolver's stricter tokenizer rejects
    // this at execute time — design-time stays permissive.
    const refs = parseReferences("{{trigger.foo {{trigger.bar}}");
    expect(refs).toHaveLength(1);
    expect(refs[0]!.nodeId).toBe("trigger");
  });
});

describe("formatReference", () => {
  it("composes `{{nodeId.path}}` for a dotted path", () => {
    expect(formatReference({ nodeId: "trigger", path: "from.name" })).toBe(
      "{{trigger.from.name}}",
    );
  });

  it("composes `{{nodeId}}` when path is empty", () => {
    expect(formatReference({ nodeId: "trigger", path: "" })).toBe("{{trigger}}");
  });

  it("joins bracket-leading paths without a leading dot", () => {
    expect(formatReference({ nodeId: "n1", path: "[0]" })).toBe("{{n1[0]}}");
    expect(formatReference({ nodeId: "n1", path: "[0].name" })).toBe(
      "{{n1[0].name}}",
    );
  });

  it("round-trips: parseReferences(formatReference(x))[0] reproduces x", () => {
    const cases = [
      { nodeId: "trigger", path: "" },
      { nodeId: "trigger", path: "message" },
      { nodeId: "node-x", path: "body" },
      { nodeId: "node-x", path: "headers.content-type" },
      { nodeId: "node-x", path: "attachments[0].name" },
      { nodeId: "node-x", path: "[0]" },
    ] as const;
    for (const c of cases) {
      const token = formatReference(c);
      const refs = parseReferences(token);
      expect(refs).toHaveLength(1);
      expect(refs[0]!.nodeId).toBe(c.nodeId);
      expect(refs[0]!.path).toBe(c.path);
      expect(refs[0]!.token).toBe(token);
      expect(refs[0]!.offset).toBe(0);
    }
  });
});
