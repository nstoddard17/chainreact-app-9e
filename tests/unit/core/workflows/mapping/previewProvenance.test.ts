/**
 * @jest-environment node
 *
 * Preview field provenance (REACT-AGENT-PREVIEW-FIELD-PROVENANCE-1).
 *
 * The input that lets enrichment fill what the agent left unresolved while never touching what the
 * user decided. The whole point is that the VALUE cannot answer that question — a filled field may
 * be the agent's guess or the user's choice; an empty one may be untouched or deliberately cleared —
 * so these tests are mostly about refusing to infer ownership from values.
 */

import {
  EMPTY_PROVENANCE,
  fieldIdentity,
  initializeProvenance,
  initializeProvenanceFromDiff,
  isUserOwned,
  markUserOwned,
  mergeAgentProvenance,
  rowFieldPath,
  toAgentOwnedFields,
} from "@/core/workflows/mapping/previewProvenance";
import { enrichProposal } from "@/core/workflows/mapping/enrichProposal";
import type { WorkflowDefinition } from "@/contracts/workflowDefinition";
import type { MappingCandidate } from "@/core/workflows/mapping/semanticFieldMapping";

describe("field identity (#15, #16, #17)", () => {
  it("is <nodeId>.<fieldPath> and unique per node", () => {
    expect(fieldIdentity("nodeA", "email")).toBe("nodeA.email");
    expect(fieldIdentity("nodeA", "email")).not.toBe(fieldIdentity("nodeB", "email"));
  });

  it("(#15) supports nested paths", () => {
    expect(fieldIdentity("hs", "properties.email")).toBe("hs.properties.email");
  });

  it("(#16,#17) distinguishes stable row identities, not array positions", () => {
    // Callers pass a stable row id in the path; ownership then survives reordering.
    expect(fieldIdentity("n", "rows.row-abc.value")).not.toBe(fieldIdentity("n", "rows.row-xyz.value"));
  });

  it("round-trips through toAgentOwnedFields, nested paths included", () => {
    const provenance = initializeProvenance({
      proposedConfig: { hs: { "properties.email": "x", firstname: "y" } },
    });
    expect(toAgentOwnedFields(provenance)).toEqual({ hs: ["properties.email", "firstname"] });
  });
});

describe("initialization (#1-#3)", () => {
  it("(#1) marks proposal-supplied fields agent-owned", () => {
    const p = initializeProvenance({ proposedConfig: { mc: { email: "{{t.x}}" }, gm: { subject: "Hi" } } });
    expect(p).toEqual({ "mc.email": "agent", "gm.subject": "agent" });
  });

  it("(#2) marks fields the proposal said it still NEEDS as agent-owned (they are what enrichment fills)", () => {
    const p = initializeProvenance({
      proposedConfig: { hs: {} },
      requiredInputsByNode: { hs: ["email", "company"] },
    });
    expect(toAgentOwnedFields(p)).toEqual({ hs: ["email", "company"] });
  });

  it("(#3) a value the proposal did NOT supply is left unrecorded — not agent-owned", () => {
    // Pre-existing workflow configuration must never become enrichment-eligible by accident.
    const p = initializeProvenance({ proposedConfig: { mc: { email: "x" } } });
    expect(p["mc.audience_id"]).toBeUndefined();
    expect(toAgentOwnedFields(p).mc).toEqual(["email"]);
  });

  it("(#4,#5,#6,#7) a fresh initialization replaces prior provenance entirely", () => {
    const first = initializeProvenance({ proposedConfig: { old: { a: 1 } } });
    const second = initializeProvenance({ proposedConfig: { fresh: { b: 2 } } });
    expect(second).toEqual({ "fresh.b": "agent" });
    expect(second).not.toHaveProperty("old.a");
    expect(first).not.toBe(second);
  });
});

describe("edit-proposal initialization uses the DIFF, not the raw config (#1, #2)", () => {
  /**
   * The distinction the whole ownership model rests on. An edit proposal carries the user's own
   * pre-existing configuration inside it, so seeding from node configs would mark the audience they
   * chose months ago as "agent-owned" and license the first schema resolve to overwrite it.
   */
  const DIFF = {
    nodes: [
      {
        nodeId: "mc",
        // The proposal introduced `email`, rewrote `status`, and says `audienceId` is still needed.
        addedFields: [{ name: "email" }],
        changedFields: [{ name: "status" }],
        missingRequiredFields: [{ name: "audienceId" }],
      },
      {
        nodeId: "gm",
        addedFields: [],
        changedFields: [],
        missingRequiredFields: [{ name: "to" }],
      },
    ],
  };

  it("(#1) marks added, changed and still-needed fields agent-owned", () => {
    expect(toAgentOwnedFields(initializeProvenanceFromDiff(DIFF))).toEqual({
      mc: ["email", "status", "audienceId"],
      gm: ["to"],
    });
  });

  it("(#2) a field the proposal left UNTOUCHED is never agent-owned", () => {
    const p = initializeProvenanceFromDiff(DIFF);
    // `apiKeyRef` and `fromName` exist on the live node but appear in no diff group.
    expect(p["mc.apiKeyRef"]).toBeUndefined();
    expect(p["mc.fromName"]).toBeUndefined();
    expect(isUserOwned(p, "mc", "fromName")).toBe(false); // unrecorded, i.e. simply not eligible
  });

  it("a node with no changes at all contributes nothing", () => {
    expect(
      initializeProvenanceFromDiff({
        nodes: [{ nodeId: "untouched", addedFields: [], changedFields: [], missingRequiredFields: [] }],
      }),
    ).toEqual({});
  });
});

describe("non-destructive refresh keeps user ownership (#16)", () => {
  it("never re-seeds a field the user already took over", () => {
    let provenance = initializeProvenance({ proposedConfig: { mc: { email: "x", status: "y" } } });
    provenance = markUserOwned(provenance, "mc", "email");

    // The SAME preview refreshes and re-declares both fields as the agent's.
    const refreshed = mergeAgentProvenance(
      provenance,
      initializeProvenance({ proposedConfig: { mc: { email: "z", status: "y", extra: "new" } } }),
    );

    expect(isUserOwned(refreshed, "mc", "email")).toBe(true); // still the user's
    expect(toAgentOwnedFields(refreshed)).toEqual({ mc: ["status", "extra"] });
  });

  it("returns the same object when nothing new arrives (no needless re-render)", () => {
    const p = initializeProvenance({ proposedConfig: { mc: { email: "x" } } });
    expect(mergeAgentProvenance(p, initializeProvenance({ proposedConfig: { mc: { email: "x" } } }))).toBe(p);
  });
});

describe("repeated rows use stable ids, never positions (#9)", () => {
  it("composes a row-scoped path that survives reordering", () => {
    expect(rowFieldPath("subscriptions", "row-abc", "eventType")).toBe("subscriptions.row-abc.eventType");
    // Two rows are distinct identities regardless of the order they render in.
    expect(rowFieldPath("subscriptions", "row-abc", "eventType")).not.toBe(
      rowFieldPath("subscriptions", "row-xyz", "eventType"),
    );
  });

  it("ownership of one row is unaffected by edits to another", () => {
    let p = initializeProvenance({
      proposedConfig: {
        hs: {
          [rowFieldPath("subs", "r1", "eventType")]: "a",
          [rowFieldPath("subs", "r2", "eventType")]: "b",
        },
      },
    });
    p = markUserOwned(p, "hs", rowFieldPath("subs", "r2", "eventType"));
    expect(isUserOwned(p, "hs", rowFieldPath("subs", "r1", "eventType"))).toBe(false);
    expect(toAgentOwnedFields(p)).toEqual({ hs: [rowFieldPath("subs", "r1", "eventType")] });
  });
});

describe("user edits flip ownership, value-blind (#8-#14, #38)", () => {
  const base = initializeProvenance({ proposedConfig: { mc: { email: "{{t.email}}", status: "subscribed" } } });

  it("(#8,#9,#10) any edit marks that exact field user-owned", () => {
    const after = markUserOwned(base, "mc", "email");
    expect(isUserOwned(after, "mc", "email")).toBe(true);
    // Siblings are untouched.
    expect(isUserOwned(after, "mc", "status")).toBe(false);
    expect(toAgentOwnedFields(after)).toEqual({ mc: ["status"] });
  });

  it("(#11,#12,#13,#14,#38) clearing, '', false and 0 are all user decisions — the API takes NO value", () => {
    // The function signature itself is the guarantee: there is no value to apply truthiness to.
    let p = base;
    for (const field of ["email", "status"]) p = markUserOwned(p, "mc", field);
    expect(toAgentOwnedFields(p)).toEqual({});
    expect(isUserOwned(p, "mc", "email")).toBe(true);
  });

  it("(#16) editing one repeated row does not mark the others", () => {
    const rows = initializeProvenance({
      proposedConfig: { n: { "rows.row-1.value": "a", "rows.row-2.value": "b" } },
    });
    const after = markUserOwned(rows, "n", "rows.row-1.value");
    expect(isUserOwned(after, "n", "rows.row-1.value")).toBe(true);
    expect(isUserOwned(after, "n", "rows.row-2.value")).toBe(false);
  });

  it("re-marking an already user-owned field preserves object identity (no needless re-render)", () => {
    const once = markUserOwned(base, "mc", "email");
    expect(markUserOwned(once, "mc", "email")).toBe(once);
  });

  it("an unrecorded field is neither user- nor agent-owned", () => {
    expect(isUserOwned(EMPTY_PROVENANCE, "x", "y")).toBe(false);
    expect(toAgentOwnedFields(EMPTY_PROVENANCE)).toEqual({});
  });
});

// ───────────── provenance + enrichment together: the behavior users actually feel ─────────────

const CANDIDATES: MappingCandidate[] = [
  { path: "answersByRef.email", label: "Email address", type: "string" },
  { path: "answersByRef.company", label: "Company", type: "string" },
];

function def(config: Record<string, unknown>): WorkflowDefinition {
  return {
    nodes: [
      { id: "t", kind: "trigger", provider: "p", type: "t", config: {} },
      { id: "hs", kind: "action", provider: "hubspot", type: "create_contact", config },
    ],
    edges: [{ id: "e", from: "t", to: "hs" }],
  } as WorkflowDefinition;
}

const SPEC = [
  {
    nodeId: "hs",
    fields: [
      { name: "email", label: "Email", type: "text" },
      { name: "company", label: "Company", type: "text" },
    ],
  },
];

describe("provenance protects the user through enrichment (#28-#37)", () => {
  it("(#28) an agent-owned unresolved field is filled", () => {
    const provenance = initializeProvenance({ proposedConfig: { hs: {} }, requiredInputsByNode: { hs: ["email"] } });
    const result = enrichProposal({
      definition: def({}),
      sourceId: "t",
      candidates: CANDIDATES,
      nodeSpecs: SPEC,
      agentOwnedFields: toAgentOwnedFields(provenance),
    });
    expect(result.definition.nodes[1]!.config.email).toBe("{{t.answersByRef.email}}");
  });

  it("(#30,#31) a user-owned field is never replaced, even though it is mappable", () => {
    let provenance = initializeProvenance({ proposedConfig: { hs: { email: "{{t.answersByRef.email}}" } } });
    provenance = markUserOwned(provenance, "hs", "email");
    const result = enrichProposal({
      definition: def({ email: "chosen@myco.com" }),
      sourceId: "t",
      candidates: CANDIDATES,
      nodeSpecs: SPEC,
      agentOwnedFields: toAgentOwnedFields(provenance),
    });
    expect(result.definition.nodes[1]!.config.email).toBe("chosen@myco.com");
  });

  it("(#36) a field the user explicitly CLEARED is not silently restored", () => {
    let provenance = initializeProvenance({ proposedConfig: { hs: { company: "{{t.answersByRef.company}}" } } });
    provenance = markUserOwned(provenance, "hs", "company"); // the clear itself
    const result = enrichProposal({
      definition: def({ company: "" }),
      sourceId: "t",
      candidates: CANDIDATES,
      nodeSpecs: SPEC,
      agentOwnedFields: toAgentOwnedFields(provenance),
    });
    // Empty AND user-owned → enrichment must leave it empty, despite a perfect candidate existing.
    expect(result.definition.nodes[1]!.config.company).toBe("");
    expect(result.changed).toBe(false);
  });

  it("(#37) a NON-EMPTY agent-owned value stays eligible — emptiness is not the rule", () => {
    const provenance = initializeProvenance({ proposedConfig: { hs: { email: "" } } });
    const result = enrichProposal({
      definition: def({ email: "" }),
      sourceId: "t",
      candidates: CANDIDATES,
      nodeSpecs: SPEC,
      agentOwnedFields: toAgentOwnedFields(provenance),
    });
    expect(result.definition.nodes[1]!.config.email).toBe("{{t.answersByRef.email}}");
  });

  it("(#3) an untracked field is left alone even when a perfect candidate exists", () => {
    const result = enrichProposal({
      definition: def({}),
      sourceId: "t",
      candidates: CANDIDATES,
      nodeSpecs: SPEC,
      agentOwnedFields: toAgentOwnedFields(EMPTY_PROVENANCE),
    });
    expect(result.changed).toBe(false);
    expect(result.definition.nodes[1]!.config.email).toBeUndefined();
  });
});
