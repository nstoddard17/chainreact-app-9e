import type { ActionMeta } from "@/contracts/actionMeta";

/**
 * Typeform `get_response` ActionMeta — TYPEFORM-2.
 *
 * Read-only single-response lookup by token. Typeform has no dedicated
 * GET-one endpoint, so this filters the Responses API with
 * `included_response_ids` — returns `found: false` (does NOT throw) when
 * no completed response matches, so workflows can branch.
 *
 * `answers` / `hidden` outputs are respondent content → sensitive (same
 * posture as the trigger's payloadShape and `list_responses`).
 */
export const typeformGetResponseMeta: ActionMeta = {
  key: "typeform:get_response",
  provider: "typeform",
  type: "get_response",
  displayName: "Get Response",
  description:
    "Look up one completed Typeform response by its response token (e.g. from the New Response trigger). Returns `found: false` when no match exists (does NOT fail the run).",
  category: "data",
  requiresIntegration: true,
  fields: [
    {
      name: "formId",
      label: "Form",
      type: "combobox",
      optionsSource: "typeform:forms",
      required: true,
      placeholder: "Search forms…",
      description:
        "Form the response belongs to. Draft or unpublished forms may appear here but will not receive responses until published in Typeform.",
    },
    {
      name: "responseToken",
      label: "Response token",
      type: "text",
      required: true,
      placeholder: "Map the trigger's responseToken here",
      description:
        "Typeform's unique id for the response — usually mapped from the New Response trigger or a previous List Responses run.",
    },
  ],
  outputs: [
    {
      name: "found",
      type: "boolean",
      description:
        "True when a completed response with this token exists. Branch on this before using the other outputs.",
    },
    {
      name: "responseToken",
      type: "string",
      description: "Typeform's unique id for this response.",
      nullable: true,
    },
    {
      name: "submittedAt",
      type: "string",
      description: "When the respondent submitted (ISO 8601).",
      nullable: true,
    },
    {
      name: "landedAt",
      type: "string",
      description: "When the respondent opened the form (ISO 8601).",
      nullable: true,
    },
    {
      name: "answers",
      type: "array",
      description:
        "Answered questions: fieldId, fieldRef, fieldType, answerType, value. Skipped questions are absent. Sensitive — respondent content.",
      sensitive: true,
      nullable: true,
    },
    {
      name: "hidden",
      type: "object",
      description:
        "Hidden-field values passed into the form, when used. Sensitive — respondent content.",
      nullable: true,
      sensitive: true,
    },
    {
      name: "score",
      type: "number",
      description: "Calculated quiz score, when the form scores responses.",
      nullable: true,
    },
  ],
  producesFileRef: false,
  consumesFileRef: false,
  displayOrder: 20,
  isDestructive: false,
  requiresConfirmation: false,
  riskLevel: "low",
};
