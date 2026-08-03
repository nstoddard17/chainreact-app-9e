/** @jest-environment node */
/**
 * BUILDER-ISSUES-RAIL-1 — per-issue explanation + next step for the issues rail.
 *
 * The value of this module is honesty as much as helpfulness: it must never tell a user the agent
 * left a field empty when the user built that step themselves, and it must never assert a specific
 * reason a value is missing (no such record exists to read).
 */

import type {
  BuilderValidationIssue,
  BuilderValidationIssueCode,
} from "@/features/workflow-builder/validation/collectBuilderValidationIssues";
import { validationIssueGuidance } from "@/features/workflow-builder/validation/validationIssueGuidance";

const ALL_CODES: BuilderValidationIssueCode[] = [
  "no_trigger",
  "multiple_triggers",
  "unconfigured_node",
  "router_routes_invalid",
  "schema_fields_invalid",
  "missing_required_field",
  "unreachable_node",
  "stale_edge",
  "self_loop_edge",
  "missing_branch_edge",
  "stale_branch_edge",
  "broken_variable_reference",
];

function issue(over: Partial<BuilderValidationIssue> = {}): BuilderValidationIssue {
  return {
    id: "missing_required_field:n1:channel",
    code: "missing_required_field",
    severity: "error",
    message: "Send Channel Message needs a Channel.",
    nodeId: "n1",
    fieldName: "channel",
    fieldLabel: "Channel",
    ...over,
  };
}

describe("validationIssueGuidance", () => {
  it("gives every issue code a non-empty explanation and next step", () => {
    for (const code of ALL_CODES) {
      const g = validationIssueGuidance(issue({ code }));
      expect(g.explanation.length).toBeGreaterThan(0);
      expect(g.nextStep.length).toBeGreaterThan(0);
    }
  });

  it("points the next step at the named field when there is one", () => {
    expect(validationIssueGuidance(issue()).nextStep).toBe("Open the Channel field and fill it in.");
  });

  it("falls back to a generic step rather than inventing a field name", () => {
    const g = validationIssueGuidance(issue({ fieldLabel: undefined }));
    expect(g.nextStep).toBe("Open this step and fill it in.");
    expect(g.nextStep).not.toContain("undefined");
  });

  describe("agent attribution", () => {
    it("attributes the gap to React only for a node React added", () => {
      const g = validationIssueGuidance(issue(), { agentNodeIds: new Set(["n1"]) });
      expect(g.explanation).toContain("React added this step");
    });

    it("never claims React added a step the user built or a template supplied", () => {
      // No session at all…
      expect(validationIssueGuidance(issue()).explanation).not.toMatch(/React/i);
      // …and a session that touched OTHER nodes must not colour this one.
      const other = validationIssueGuidance(issue(), { agentNodeIds: new Set(["n2"]) });
      expect(other.explanation).not.toMatch(/React/i);
    });

    it("does not attribute non-field issues to React even on an agent-added node", () => {
      const g = validationIssueGuidance(
        issue({ code: "broken_variable_reference", severity: "warning" }),
        { agentNodeIds: new Set(["n1"]) },
      );
      expect(g.explanation).not.toMatch(/React added/i);
    });

    it("ignores agent attribution for a graph-level issue with no node", () => {
      const g = validationIssueGuidance(
        issue({ code: "no_trigger", nodeId: undefined, fieldName: undefined, fieldLabel: undefined }),
        { agentNodeIds: new Set(["n1"]) },
      );
      expect(g.explanation).not.toMatch(/React/i);
      expect(g.nextStep).toBe("Choose a trigger to start this workflow.");
    });
  });

  it("never asserts a specific reason a value is absent", () => {
    // The copy may say the agent lacked information; it must not claim to know WHY for this field.
    for (const code of ALL_CODES) {
      const g = validationIssueGuidance(issue({ code }), { agentNodeIds: new Set(["n1"]) });
      expect(g.explanation).not.toMatch(/because your|we found|we detected|it looks like/i);
    }
  });
});
