import type { ActionMeta } from "@/contracts/actionMeta";
import { AI_PROVIDER_ID } from "@/core/integrations/connectionlessProviders";

/**
 * Builder metadata for `ai:transform_data` (AI-PROVIDER-6 CS-6).
 *
 * Rule-17 field classification (every field, exactly one class):
 *   - `input`             core user decision (what to transform)
 *   - `destinationMode`   core user decision (how the target shape is decided)
 *   - `destinationAction` **static provider resource** — a registered picker
 *                         (`ai:destination_actions`) over the real action
 *                         catalog, never a hand-typed key
 *   - `destinationSchema` core user decision, conditional on mode
 *   - `outputShape`       core user decision (one result per item, or one)
 *   - `instructions`      core user decision (optional refinements)
 *   - `strictValidation` `maxRows` `confidenceThreshold` `onLowConfidence`
 *     `modelQuality`      advanced controls
 * No internal-implementation-detail field: the author never sees a task name,
 * model, tier, registry key, wire format, or the derived schema itself.
 *
 * The destination-action path is what makes this action worth building: the
 * fields are DERIVED from the destination's own metadata
 * (`core/workflows/deriveDestinationContext.ts`), re-derived server-side at
 * run time, so nobody retypes a schema ChainReact already knows.
 *
 * `dynamicOutputs` covers the custom-schema mode only — the declaration
 * contract sources child outputs from a `schema-fields` config field, and in
 * destination-action mode there is no such field (the shape comes from the
 * registry). CS-8 owns synthesis; that asymmetry is recorded in the CS-6
 * outcome doc.
 */
export const transformDataMeta: ActionMeta = {
  key: "ai:transform_data",
  provider: AI_PROVIDER_ID,
  type: "transform_data",
  displayName: "Transform Data",
  description:
    "Reshape data from an earlier step into the exact fields another step needs, using ChainReact AI. Point it at a step in your workflow and it reads that step's own fields — no need to describe them yourself — or define the fields you want by hand. Works on records and lists of records. Uses 2 AI credits per run, or 4 on higher quality. Your data is processed by ChainReact's AI service.",
  category: "ai",
  requiresIntegration: false,
  fields: [
    {
      name: "input",
      label: "Data to transform",
      description:
        "The data from an earlier step — a single record or a list of them. Insert it with the variable picker, for example the rows an Analyze Document step produced.",
      type: "textarea",
      required: true,
      placeholder: "{{step.rows}}",
    },
    {
      name: "destinationMode",
      label: "What shape should the result be?",
      description:
        "Match another step's fields and ChainReact reads that step's setup for you. Or define the fields yourself when the result isn't headed straight into another step.",
      type: "select",
      required: true,
      defaultValue: "action",
      options: [
        {
          value: "action",
          label: "Match another step's fields",
          description: "Recommended — the fields come from the step you pick.",
        },
        {
          value: "custom",
          label: "Define the fields myself",
          description: "Name each field you want in the result.",
        },
      ],
    },
    {
      name: "destinationAction",
      label: "Destination step",
      description:
        "The step this data is headed for. Its own fields become the shape of the result.",
      type: "combobox",
      required: true,
      optionsSource: "ai:destination_actions",
      placeholder: "Search steps...",
      visibleWhen: { field: "destinationMode", valueIn: ["action"] },
    },
    {
      name: "destinationSchema",
      label: "Fields to produce",
      description:
        "Name each field the result should have. The names become the outputs you can use in later steps.",
      type: "schema-fields",
      required: true,
      visibleWhen: { field: "destinationMode", valueIn: ["custom"] },
    },
    {
      name: "outputShape",
      label: "How many results?",
      description:
        "A list in gives a list out by default. Choose a single result when you want everything combined into one.",
      type: "select",
      required: true,
      defaultValue: "rows",
      options: [
        { value: "rows", label: "One result per item" },
        { value: "record", label: "A single result" },
      ],
    },
    {
      name: "instructions",
      label: "Extra instructions",
      description:
        "Optional. Tell the AI how to map anything it might get wrong, in plain language - for example \"use the billing address, not the shipping address\".",
      type: "textarea",
      required: false,
      placeholder: "Combine first and last name into the full name field",
    },
    // ── Advanced ────────────────────────────────────────────────────────
    {
      name: "maxRows",
      label: "Maximum results",
      description:
        "The most results one run may return. Only used when producing one result per item.",
      type: "number",
      required: false,
      defaultValue: 100,
      numeric: { min: 1, max: 500, step: 1, integer: true },
      advanced: true,
    },
    {
      name: "confidenceThreshold",
      label: "Confidence threshold",
      description:
        "Results the AI is less sure about than this are listed in the step's low-confidence output. 0 accepts anything, 1 accepts only certainty.",
      type: "number",
      required: false,
      defaultValue: 0.7,
      numeric: { min: 0, max: 1, step: 0.05 },
      advanced: true,
    },
    {
      name: "onLowConfidence",
      label: "When confidence is low",
      description:
        "Low confidence never stops the step by default - it is reported so a later step can review it.",
      type: "select",
      required: false,
      defaultValue: "flag",
      options: [
        { value: "flag", label: "Report it and continue" },
        { value: "fail", label: "Stop the run" },
        { value: "blank", label: "Leave those values empty" },
      ],
      advanced: true,
    },
    {
      name: "strictValidation",
      label: "Require every required field",
      description:
        "On by default: if the AI cannot fill a field the destination step requires, this step stops instead of quietly passing an empty value along.",
      type: "boolean",
      required: false,
      defaultValue: true,
      advanced: true,
    },
    {
      name: "modelQuality",
      label: "Quality",
      description:
        "Higher quality handles messier or less obvious mappings and costs twice as many AI credits per run.",
      type: "select",
      required: false,
      defaultValue: "standard",
      options: [
        { value: "standard", label: "Standard (2 credits)" },
        { value: "advanced", label: "Higher quality (4 credits)" },
      ],
      advanced: true,
    },
  ],
  outputs: [
    {
      name: "rows",
      type: "array",
      nullable: true,
      description:
        "One entry per transformed item, with the destination's fields plus a per-item confidence. Only set when producing one result per item.",
    },
    {
      name: "rowCount",
      type: "number",
      nullable: true,
      description: "How many results came back. Only set when producing one result per item.",
    },
    {
      name: "record",
      type: "object",
      nullable: true,
      description:
        "The single transformed result, keyed by the destination's field names. Only set when producing a single result.",
    },
    {
      name: "inputCount",
      type: "number",
      description: "How many items went in.",
    },
    {
      name: "destination",
      type: "string",
      nullable: true,
      description:
        "The step the result was shaped for. Empty when the fields were defined by hand.",
    },
    {
      name: "overallConfidence",
      type: "number",
      description: "How confident the AI was overall, from 0 to 1.",
    },
    {
      name: "lowConfidenceFields",
      type: "array",
      description: "Names of the results the AI was least sure about.",
    },
    {
      name: "warnings",
      type: "array",
      description:
        "Destination fields this step could not fill in — usually a connected-app resource you pick on the destination step itself.",
    },
  ],
  producesFileRef: false,
  consumesFileRef: false,
  displayOrder: 20,
  isDestructive: false,
  requiresConfirmation: false,
  riskLevel: "low",
  dynamicOutputs: [
    {
      configField: "destinationSchema",
      attachUnder: "rows",
      whenField: "destinationMode",
      whenValueIn: ["custom"],
    },
    {
      configField: "destinationSchema",
      attachUnder: "record",
      whenField: "destinationMode",
      whenValueIn: ["custom"],
    },
  ],
};
