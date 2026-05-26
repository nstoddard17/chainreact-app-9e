/**
 * Forced structured-output tool for the workflow planner (Slice 4.AI-19).
 *
 * Live smoke against Claude Sonnet 4.6 returned freeform text (PARSE_FAILED /
 * NOT_JSON) even though the prompt's `JSON_OUTPUT_RULES` forbid prose. The
 * supported alternative — assistant-message prefill — is rejected by Claude
 * 4.x with HTTP 400 `invalid_request_error` and was reverted in AI-12C.
 *
 * This module declares the single tool the planner forces the model to call.
 * The `inputSchema` mirrors the parser's accepted shape so the model has a
 * concrete contract to emit against. **It is intentionally LENIENT** about
 * `proposedPatch` (`object | null`, no recursive operation enumeration) —
 * `WorkflowPatchSchema` + `parseWorkflowPlanResponse` are the strict
 * downstream gates and the source of truth. Loosening this schema does NOT
 * loosen V2's parser guarantees; tightening it here would risk Anthropic
 * rejecting the tool at request time for schema features the parser already
 * handles fine.
 *
 * No-leak: the tool name + description + schema are sent verbatim in the
 * request body. They MUST NOT contain secrets, API keys, or user data.
 *
 * Plan reference: docs/slices/phase-4/ai-architecture-react-agent-plan.md §AI-19.
 */

import type { ModelResponseTool } from "@/core/ai/modelTypes";

/** The tool name surfaced to the model + matched in the tool_use response block. */
export const WORKFLOW_PLAN_TOOL_NAME = "propose_workflow_plan";

/**
 * JSON Schema mirroring {@link WorkflowPlanResponse}. `additionalProperties:
 * false` keeps the model from inventing top-level fields; the parser strips
 * unknowns at the top level anyway, but rejecting them here gives the model a
 * clearer contract. `proposedPatch` is kept as `object | null` because the
 * recursive `WorkflowPatch` shape (operations / nodes / edges) is enforced
 * downstream by `WorkflowPatchSchema` — duplicating it here adds rejection
 * surface area for changes to the patch schema without buying real safety.
 */
export const WORKFLOW_PLAN_TOOL_SCHEMA: Readonly<Record<string, unknown>> = {
  type: "object",
  additionalProperties: false,
  required: ["intentSummary", "confidence"],
  properties: {
    intentSummary: {
      type: "string",
      description:
        "One-sentence restatement of what the user wants this workflow to do.",
    },
    assumptions: {
      type: "array",
      items: { type: "string" },
      description: "Assumptions the planner is making about ambiguous request parts.",
    },
    requiredUserInput: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["label", "kind"],
        properties: {
          label: { type: "string" },
          nodeId: { type: "string" },
          field: { type: "string" },
          kind: {
            type: "string",
            enum: [
              "config_value",
              "select_integration",
              "choose_trigger",
              "variable_reference",
              "clarification",
            ],
          },
        },
      },
      description:
        "Inputs the planner needs from the user before this workflow can run (missing ids, ambiguous channels, unselected integrations, etc.).",
    },
    unsupportedRequests: {
      type: "array",
      items: { type: "string" },
      description:
        "Parts of the request the planner could not satisfy with available metadata. NEVER guess.",
    },
    safetyNotes: {
      type: "array",
      items: { type: "string" },
      description:
        "Plain-English notes about destructive, costly, or otherwise sensitive parts of the plan.",
    },
    proposedPatch: {
      // The patch shape is strictly validated downstream by WorkflowPatchSchema.
      // Keeping this lenient at the tool layer avoids duplicating that
      // recursive schema in two places.
      type: ["object", "null"],
      description:
        "The WorkflowPatch (envelope + operations) when the planner can produce a complete, valid one — or null when user input is still needed.",
    },
    confidence: {
      type: "string",
      enum: ["high", "medium", "low"],
      description:
        "Planner's self-rated confidence in the proposed plan. NOT trusted for safety decisions — purely informational.",
    },
  },
};

/** Pre-built {@link ModelResponseTool} the planner hands to the model client. */
export const WORKFLOW_PLAN_TOOL: ModelResponseTool = {
  name: WORKFLOW_PLAN_TOOL_NAME,
  description:
    "Return the workflow plan response object exactly matching the schema. Always call this tool exactly once. Do not return prose or any other tool call.",
  inputSchema: WORKFLOW_PLAN_TOOL_SCHEMA,
};
