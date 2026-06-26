/**
 * Tests for features/workflow-builder/validation/validationIssueCategory.
 *
 * Slice 4.BUILDER-VALIDATION-CATEGORIES — pure mapping from a builder validation
 * issue code to a user-meaningful drawer category. Presentational only: it must
 * cover every code the collector can emit and must NOT invent categories the
 * validator has no signal for (no "Connection required").
 */
import type { BuilderValidationIssueCode } from "@/features/workflow-builder/validation/collectBuilderValidationIssues";
import {
  categorizeValidationIssue,
  validationCategoryLabel,
  VALIDATION_CATEGORY_ORDER,
  type ValidationIssueCategory,
} from "@/features/workflow-builder/validation/validationIssueCategory";

// Every code the collector defines — kept in lockstep so a new code forces a
// categorization decision (the switch is exhaustive; this asserts coverage).
const ALL_CODES: readonly BuilderValidationIssueCode[] = [
  "no_trigger",
  "multiple_triggers",
  "unconfigured_node",
  "router_routes_invalid",
  "missing_required_field",
  "unreachable_node",
  "stale_edge",
  "self_loop_edge",
  "broken_variable_reference",
];

describe("categorizeValidationIssue", () => {
  it("routes author-fills-something codes to 'needs_input'", () => {
    expect(categorizeValidationIssue("missing_required_field")).toBe("needs_input");
    expect(categorizeValidationIssue("unconfigured_node")).toBe("needs_input");
    expect(categorizeValidationIssue("router_routes_invalid")).toBe("needs_input");
  });

  it("routes structural graph codes to 'workflow_setup'", () => {
    expect(categorizeValidationIssue("no_trigger")).toBe("workflow_setup");
    expect(categorizeValidationIssue("multiple_triggers")).toBe("workflow_setup");
    expect(categorizeValidationIssue("unreachable_node")).toBe("workflow_setup");
    expect(categorizeValidationIssue("stale_edge")).toBe("workflow_setup");
    expect(categorizeValidationIssue("self_loop_edge")).toBe("workflow_setup");
  });

  it("routes the broken variable reference warning to 'data_reference'", () => {
    expect(categorizeValidationIssue("broken_variable_reference")).toBe("data_reference");
  });

  it("maps every known code to a category in the display order (no gaps)", () => {
    for (const code of ALL_CODES) {
      const category = categorizeValidationIssue(code);
      expect(VALIDATION_CATEGORY_ORDER).toContain(category);
    }
  });
});

describe("validationCategoryLabel", () => {
  it("gives plain-English, non-technical labels", () => {
    const labels: Record<ValidationIssueCategory, string> = {
      needs_input: "Needs your input",
      workflow_setup: "Workflow setup",
      data_reference: "Check your data",
    };
    for (const category of VALIDATION_CATEGORY_ORDER) {
      expect(validationCategoryLabel(category)).toBe(labels[category]);
    }
  });

  it("leads with the user-actionable 'Needs your input' category", () => {
    expect(VALIDATION_CATEGORY_ORDER[0]).toBe("needs_input");
  });
});
