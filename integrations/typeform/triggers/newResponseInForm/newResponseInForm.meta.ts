import type { TriggerMeta } from "@/contracts/triggerMeta";

/**
 * Builder-facing metadata for `typeform:new_response_in_form` — Slice
 * 5.TYPEFORM-1.
 *
 * Webhook-activated. Activation creates one Typeform form webhook
 * (`PUT /forms/{formId}/webhooks/{tag}`) bound to the configured form
 * with a V2-minted per-webhook HMAC secret (encrypted at rest). Low
 * risk — observational.
 *
 * `payloadShape` mirrors `normalize.ts`. Unlike Asana's compact events,
 * the Typeform payload carries the FULL response content, so `answers`
 * and `hidden` are marked `sensitive: true` (free-form respondent
 * content — redacted in run details, still flowable downstream).
 */
export const typeformNewResponseInFormTriggerMeta: TriggerMeta = {
  key: "typeform:new_response_in_form",
  provider: "typeform",
  type: "new_response_in_form",
  displayName: "New Response in Form",
  description:
    "Fires when someone submits a response to the configured Typeform form. The event carries the submitted answers, hidden fields, and quiz score.",
  category: "data",
  activation: "webhook",
  requiresIntegration: true,
  fields: [
    {
      name: "formId",
      label: "Form",
      description:
        "Form to watch for new responses. Draft or unpublished forms may appear here but will not receive responses until published in Typeform.",
      type: "combobox",
      optionsSource: "typeform:forms",
      required: true,
      placeholder: "Search forms…",
    },
  ],
  payloadShape: [
    {
      name: "changeKind",
      type: "string",
      description: "Always 'new_response_in_form'.",
    },
    {
      name: "formId",
      type: "string",
      description: "Id of the form that received the response.",
      nullable: true,
    },
    {
      name: "responseToken",
      type: "string",
      description: "Typeform's unique id for this response.",
      nullable: true,
    },
    {
      name: "providerEventId",
      type: "string",
      description: "Typeform's delivery event id.",
      nullable: true,
    },
    {
      name: "formTitle",
      type: "string",
      description: "Title of the form (when present in the delivery).",
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
        "Answered questions: fieldId, fieldRef, fieldTitle, fieldType, answerType, value. Skipped questions are absent.",
      sensitive: true,
    },
    {
      name: "answersByRef",
      type: "object",
      description:
        "Answers keyed by each question's STABLE reference (e.g. answersByRef.email) — the path to map a specific question into a later step. Positional answers[] shifts when a respondent skips a question; these keys do not. Unanswered questions are absent.",
      sensitive: true,
    },
    {
      name: "hidden",
      type: "object",
      description: "Hidden-field values passed into the form, when used.",
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
  /**
   * TYPEFORM-DYNAMIC-OUTPUTS-CONSUMPTION-1 — the selected form's questions become mappable outputs.
   *
   * Declaration only: the static registry does no I/O. `services/discovery/dynamicTriggerOutputs`
   * (server) and the builder (via /api/options) both resolve `typeform:form_questions` for the chosen
   * `formId` and merge the result under `answersByRef` with the SAME pure merger, so a path shown in
   * the picker is the path the runtime emits.
   */
  dynamicOutputSource: {
    configField: "formId",
    source: "typeform:form_questions",
    attachUnder: "answersByRef",
  },
  displayOrder: 10,
};
