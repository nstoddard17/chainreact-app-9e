/**
 * @jest-environment node
 *
 * Tests for features/workflow-builder/config-modal/fields/_variableValidator.
 *
 * Slice 3.7 — soft variable-reference validator. Asserts the
 * design-time warnings the picker surfaces inline. Save is NOT gated
 * on these (engine strict-resolution at run time is the authoritative
 * gate). Tests pin the message wording so renderer snapshots can rely
 * on it.
 */

import type { OutputMeta } from "@/contracts/actionMeta";
import {
  validateReferences,
  type ValidatorSource,
} from "@/features/workflow-builder/config-modal/fields/_variableValidator";

const triggerSource: ValidatorSource = {
  sourceId: "trigger",
  outputs: [
    { name: "from", type: "string" },
    {
      name: "payload",
      type: "object",
      fields: [
        { name: "message", type: "string" },
        {
          name: "attachments",
          type: "array",
          fields: [{ name: "name", type: "string" }],
        },
      ],
    },
    { name: "opaqueObj", type: "object" }, // no declared fields → opaque
    { name: "opaqueUnk", type: "unknown" },
  ],
};

const actionSource: ValidatorSource = {
  sourceId: "act-1",
  outputs: [
    { name: "ok", type: "boolean" },
    { name: "status", type: "number" },
  ],
};

describe("validateReferences — empty inputs", () => {
  it("returns [] for non-string values", () => {
    expect(
      validateReferences({ value: undefined, sources: [triggerSource] }),
    ).toEqual([]);
    expect(
      validateReferences({ value: 42, sources: [triggerSource] }),
    ).toEqual([]);
  });

  it("returns [] for strings without references", () => {
    expect(
      validateReferences({ value: "plain text", sources: [triggerSource] }),
    ).toEqual([]);
  });

  it("returns [] for resolvable references", () => {
    expect(
      validateReferences({
        value: "Hi {{trigger.from}} — payload: {{trigger.payload.message}}",
        sources: [triggerSource],
      }),
    ).toEqual([]);
  });
});

describe("validateReferences — missing_node", () => {
  it("flags a token whose nodeId isn't in sources", () => {
    const warnings = validateReferences({
      value: "{{ghost.foo}}",
      sources: [triggerSource],
    });
    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toMatchObject({
      token: "{{ghost.foo}}",
      sourceId: "ghost",
      path: "foo",
      reason: "missing_node",
    });
    expect(warnings[0]!.message).toMatch(/no upstream source named 'ghost'/i);
  });

  it("flags multiple missing-node tokens once each (one warning per token)", () => {
    const warnings = validateReferences({
      value: "{{ghost.a}} and {{phantom.b}} and {{trigger.from}}",
      sources: [triggerSource],
    });
    expect(warnings).toHaveLength(2);
    expect(warnings.map((w) => w.sourceId).sort()).toEqual(["ghost", "phantom"]);
  });
});

describe("validateReferences — missing_field", () => {
  it("flags a top-level path that isn't a declared output", () => {
    const warnings = validateReferences({
      value: "{{trigger.notAField}}",
      sources: [triggerSource],
    });
    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toMatchObject({
      reason: "missing_field",
      sourceId: "trigger",
      path: "notAField",
    });
    expect(warnings[0]!.message).toMatch(/'notAField' is not a declared output/);
  });

  it("flags a missing nested field inside an `object` output with declared fields", () => {
    const warnings = validateReferences({
      value: "{{trigger.payload.notReal}}",
      sources: [triggerSource],
    });
    expect(warnings).toHaveLength(1);
    expect(warnings[0]!.path).toBe("payload.notReal");
    expect(warnings[0]!.message).toMatch(/'notReal' is not a declared output/);
  });
});

describe("validateReferences — opaque traversal (no warning)", () => {
  it("`unknown` outputs short-circuit to OK for any nested path", () => {
    expect(
      validateReferences({
        value: "{{trigger.opaqueUnk.anything.goes[0]}}",
        sources: [triggerSource],
      }),
    ).toEqual([]);
  });

  it("`object` outputs without declared `fields` short-circuit to OK", () => {
    expect(
      validateReferences({
        value: "{{trigger.opaqueObj.whatever}}",
        sources: [triggerSource],
      }),
    ).toEqual([]);
  });

  it("array index segments treat the rest of the path as opaque", () => {
    // attachments.fields[0].name is declared — should be fine.
    expect(
      validateReferences({
        value: "{{trigger.payload.attachments[0].name}}",
        sources: [triggerSource],
      }),
    ).toEqual([]);
    // attachments[0].nonExistent — once we hit the array index, we
    // can't validate further; opaque → no warning.
    expect(
      validateReferences({
        value: "{{trigger.payload.attachments[0].madeUp}}",
        sources: [triggerSource],
      }),
    ).toEqual([]);
  });

  it("scalar leaves treat any further traversal as opaque (e.g. `string.length`)", () => {
    expect(
      validateReferences({
        value: "{{trigger.from.length}}",
        sources: [triggerSource],
      }),
    ).toEqual([]);
  });
});

describe("validateReferences — whole-node references", () => {
  it("`{{nodeId}}` (no path) is always OK when the source exists", () => {
    expect(
      validateReferences({
        value: "snapshot: {{trigger}}",
        sources: [triggerSource],
      }),
    ).toEqual([]);
  });

  it("`{{nodeId}}` is missing_node when the source doesn't exist", () => {
    const warnings = validateReferences({
      value: "{{ghost}}",
      sources: [triggerSource],
    });
    expect(warnings).toHaveLength(1);
    expect(warnings[0]!.reason).toBe("missing_node");
    expect(warnings[0]!.path).toBe("");
  });
});

describe("validateReferences — multi-source", () => {
  it("flags tokens against any matching source", () => {
    const warnings = validateReferences({
      value:
        "{{trigger.notAField}} and {{act-1.status}} and {{act-1.bogus}}",
      sources: [triggerSource, actionSource],
    });
    const reasons = warnings.map((w) => `${w.sourceId}:${w.path}:${w.reason}`);
    expect(reasons).toEqual([
      "trigger:notAField:missing_field",
      "act-1:bogus:missing_field",
    ]);
  });
});

describe("validateReferences — AI_FIELD skipping", () => {
  it("does not flag AI_FIELD tokens (parser drops them)", () => {
    expect(
      validateReferences({
        value: "Subject: {{AI_FIELD:subject}} body {{AI_FIELD:body}}",
        sources: [triggerSource],
      }),
    ).toEqual([]);
  });
});

describe("validateReferences — empty sources", () => {
  it("flags every token as missing_node when sources is empty", () => {
    const warnings = validateReferences({
      value: "{{trigger.foo}} and {{x.y}}",
      sources: [],
    });
    expect(warnings.map((w) => w.reason)).toEqual([
      "missing_node",
      "missing_node",
    ]);
  });
});

// Type sanity: OutputMeta tree under test must include each variant
// at least once for the opaque branches to exercise.
const _ensureOutputMetaCoverage: readonly OutputMeta[] = triggerSource.outputs;
void _ensureOutputMetaCoverage;
