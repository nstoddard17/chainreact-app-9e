/**
 * @jest-environment node
 *
 * Guided-setup values must survive Apply on the EDIT path
 * (REACT-AGENT-PREVIEW-PROVENANCE-CLOSEOUT-1).
 *
 * The additive path always seeded these through `planToBuilderPatch`; the edit path handed the
 * proposal straight to `replaceGraphLocal` and dropped them. The values at stake are exactly the
 * ones enrichment is forbidden to choose — the audience, the recipient, the consent flag — so losing
 * them at the last step would undo the ownership model completely.
 */

import { applyPreviewConfigToDefinition } from "@/core/workflows/mapping/previewConfigOverlay";
import type { WorkflowDefinition } from "@/contracts/workflowDefinition";

function def(): WorkflowDefinition {
  return {
    nodes: [
      { id: "trig", kind: "trigger", provider: "acme", type: "new_row", config: { sheetId: "s1" }, position: { x: 0, y: 0 } },
      {
        id: "mc",
        kind: "action",
        provider: "mailchimp",
        type: "add_subscriber",
        config: { email: "{{trig.columns.contact_email}}", status: "subscribed" },
        position: { x: 0, y: 120 },
      },
    ],
    edges: [{ id: "e1", from: "trig", to: "mc" }],
  } as WorkflowDefinition;
}

describe("overlaying the user's preview-setup values", () => {
  it("(#32) writes the user's choice onto the proposal node", () => {
    const out = applyPreviewConfigToDefinition(def(), { mc: { audienceId: "aud-42" } });
    expect(out.nodes[1]!.config).toMatchObject({
      audienceId: "aud-42",
      email: "{{trig.columns.contact_email}}", // the agent's mapping is untouched
      status: "subscribed",
    });
  });

  it("the user's value beats the proposal's for the same field", () => {
    const out = applyPreviewConfigToDefinition(def(), { mc: { status: "pending" } });
    expect(out.nodes[1]!.config.status).toBe("pending");
  });

  it("'', false and 0 overlay like any other value — they are explicit decisions", () => {
    const out = applyPreviewConfigToDefinition(def(), {
      mc: { email: "", doubleOptIn: false, retries: 0 },
    });
    expect(out.nodes[1]!.config.email).toBe("");
    expect(out.nodes[1]!.config.doubleOptIn).toBe(false);
    expect(out.nodes[1]!.config.retries).toBe(0);
  });

  it("(#20, #21) preserves node ids, edge ids and node count — nothing is regenerated", () => {
    const before = def();
    const out = applyPreviewConfigToDefinition(before, { mc: { audienceId: "aud-42" } });
    expect(out.nodes.map((n) => n.id)).toEqual(["trig", "mc"]);
    expect(out.edges).toEqual(before.edges);
    expect(out.nodes).toHaveLength(2);
  });

  it("(#22) preserves object identity when there is nothing to overlay", () => {
    const before = def();
    expect(applyPreviewConfigToDefinition(before, {})).toBe(before);
    expect(applyPreviewConfigToDefinition(before, { mc: {} })).toBe(before);
    // Re-writing an identical value is not a change either.
    expect(applyPreviewConfigToDefinition(before, { mc: { status: "subscribed" } })).toBe(before);
  });

  it("ignores overlay keys for nodes the proposal does not contain", () => {
    const before = def();
    expect(applyPreviewConfigToDefinition(before, { ghost: { x: 1 } })).toBe(before);
  });

  it("does not mutate the input definition", () => {
    const before = def();
    applyPreviewConfigToDefinition(before, { mc: { audienceId: "aud-42" } });
    expect(before.nodes[1]!.config.audienceId).toBeUndefined();
  });
});
