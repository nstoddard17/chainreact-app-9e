/**
 * Tests for core/workflows/configVariableReferences — Slice 4.BUILDER-DATA-MAP-MVP-1.
 *
 * `collectConfigVariableReferences` returns EVERY `{{nodeId.path}}` reference in
 * a node's top-level string / string[] config (sibling to the broken-ref
 * detector, which returns only the broken subset). Delegates tokenization to
 * the shared `parseReferences`, so it can never disagree on what a reference IS.
 */

import { collectConfigVariableReferences } from "@/core/workflows/configVariableReferences";

describe("collectConfigVariableReferences", () => {
  it("returns an empty list when the config holds no references", () => {
    const refs = collectConfigVariableReferences({
      id: "n1",
      config: { url: "https://example.com", count: 3 },
    });
    expect(refs).toEqual([]);
  });

  it("extracts a single trigger reference with its field key, source, and path", () => {
    const refs = collectConfigVariableReferences({
      id: "n1",
      config: { to: "{{trigger.email.from}}" },
    });
    expect(refs).toEqual([
      {
        nodeId: "n1",
        fieldKey: "to",
        token: "{{trigger.email.from}}",
        sourceId: "trigger",
        refPath: "email.from",
      },
    ]);
  });

  it("extracts references from string-array config elements", () => {
    const refs = collectConfigVariableReferences({
      id: "n1",
      config: { recipients: ["{{trigger.a}}", "static@x.com", "{{step2.b}}"] },
    });
    expect(refs.map((r) => r.sourceId)).toEqual(["trigger", "step2"]);
    expect(refs.map((r) => r.refPath)).toEqual(["a", "b"]);
  });

  it("captures a whole-node reference with an empty path", () => {
    const refs = collectConfigVariableReferences({
      id: "n1",
      config: { payload: "{{step9}}" },
    });
    expect(refs[0]).toMatchObject({ sourceId: "step9", refPath: "" });
  });

  it("ignores AI_FIELD tokens (not author-pickable variables)", () => {
    const refs = collectConfigVariableReferences({
      id: "n1",
      config: { body: "Hello {{AI_FIELD:greeting}} — {{trigger.name}}" },
    });
    expect(refs).toHaveLength(1);
    expect(refs[0]!.sourceId).toBe("trigger");
  });

  it("does not scan nested object config (same scope as the broken-ref detector)", () => {
    const refs = collectConfigVariableReferences({
      id: "n1",
      config: { headers: { Authorization: "{{trigger.token}}" } },
    });
    expect(refs).toEqual([]);
  });
});
