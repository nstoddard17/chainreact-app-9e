import type { ActionMeta } from "@/contracts/actionMeta";
import { AI_PROVIDER_ID } from "@/core/integrations/connectionlessProviders";

/**
 * Builder metadata for `ai:analyze_document` (AI-PROVIDER-5 CS-5).
 *
 * Rule-17 field classification (every field, exactly one class):
 *   - `file`                 core user decision (the thing to read)
 *   - `mode`                 core user decision (what to do with it)
 *   - `instructions`         core user decision (optional focus)
 *   - `expectedFields`       core user decision, conditional on mode
 *   - `rowSchema`            core user decision, conditional on mode
 *   - `labels`               core user decision, conditional on mode
 *   - `allowOtherLabel`      conditional option (defaulted, visible with classify)
 *   - `question`             core user decision, conditional on mode
 *   - `pageRange` `sheetName` `maxPages`   advanced control (scope narrowing)
 *   - `confidenceThreshold` `onLowConfidence` `strictValidation` `maxRows`
 *                            advanced control (quality/limit knobs)
 *   - `modelQuality`         advanced control (cost/quality trade)
 * There is no internal-implementation-detail field: the author never sees
 * a task name, a model name, a tier, a registry key, or a wire format.
 *
 * Progressive disclosure: mode-scoped fields use top-level `visibleWhen`
 * and are REQUIRED WHEN VISIBLE — a hidden one is never a readiness gap
 * (`missingRequiredFields` evaluates the condition), so switching modes
 * never leaves a phantom "needs setup" marker behind.
 *
 * `dynamicOutputs` declares where the author's own field names attach in
 * the variable picker. It is inert until CS-8 implements synthesis; the
 * runtime resolver already walks those paths, so hand-typed references
 * work today and discovery catches up without a metadata rewrite.
 */
export const analyzeDocumentMeta: ActionMeta = {
  key: "ai:analyze_document",
  provider: AI_PROVIDER_ID,
  type: "analyze_document",
  displayName: "Analyze Document",
  description:
    "Read a document, spreadsheet, or block of text with ChainReact AI and turn it into structured data your next steps can use: a summary, named fields, table rows, a category, or an answer to a question. Supports PDF, Word, Excel, CSV, and plain text (scanned or image-only files are not supported yet). Uses 3 AI credits per run, or 6 on higher quality. Document content is processed by ChainReact's AI service.",
  category: "ai",
  requiresIntegration: false,
  fields: [
    {
      name: "file",
      label: "Document",
      description:
        "The file to read - pick it from an earlier step (an email attachment, a downloaded file, an uploaded file). You can also point this at text from an earlier step instead of a file.",
      type: "file",
      required: true,
    },
    {
      name: "mode",
      label: "What should the AI do?",
      description: "Pick the kind of result you need from this document.",
      type: "select",
      required: true,
      defaultValue: "summarize",
      options: [
        {
          value: "summarize",
          label: "Summarize it",
          description: "A short summary plus the key points.",
        },
        {
          value: "extract_fields",
          label: "Pull out specific fields",
          description: "One value per field you name (invoice total, due date...).",
        },
        {
          value: "extract_rows",
          label: "Pull out a table of rows",
          description: "One row per line item, with the columns you name.",
        },
        {
          value: "classify",
          label: "Sort it into a category",
          description: "Pick the best-fitting label from your list.",
        },
        {
          value: "answer_questions",
          label: "Answer a question about it",
          description: "A written answer to the question you ask.",
        },
      ],
    },
    {
      name: "instructions",
      label: "Extra instructions",
      description:
        "Optional. Tell the AI what to focus on, in plain language - for example \"only the line items on the second invoice\".",
      type: "textarea",
      required: false,
      placeholder: "Focus on the totals section",
    },
    {
      name: "expectedFields",
      label: "Fields to pull out",
      description:
        "Name each value you want. The names become the outputs you can use in later steps.",
      type: "schema-fields",
      required: true,
      visibleWhen: { field: "mode", valueIn: ["extract_fields"] },
    },
    {
      name: "rowSchema",
      label: "Columns for each row",
      description:
        "Name the columns every extracted row should have. Each row comes back with exactly these columns.",
      type: "schema-fields",
      required: true,
      visibleWhen: { field: "mode", valueIn: ["extract_rows"] },
    },
    {
      name: "labels",
      label: "Categories",
      description:
        "The categories this document could belong to. The AI picks the best fit.",
      type: "string-array",
      required: true,
      stringArrayMaxItems: 50,
      visibleWhen: { field: "mode", valueIn: ["classify"] },
    },
    {
      name: "allowOtherLabel",
      label: "Allow \"Other\" when nothing fits",
      description:
        "On by default. Turn this off to force a pick from your list even when none of them fit well.",
      type: "boolean",
      required: false,
      defaultValue: true,
      visibleWhen: { field: "mode", valueIn: ["classify"] },
    },
    {
      name: "question",
      label: "Question",
      description: "What do you want to know about this document?",
      type: "textarea",
      required: true,
      placeholder: "What is the total amount due, and when?",
      visibleWhen: { field: "mode", valueIn: ["answer_questions"] },
    },
    // ── Advanced ────────────────────────────────────────────────────────
    {
      name: "pageRange",
      label: "Page range",
      description:
        "Limit reading to certain pages, for example \"1-5\" or \"1-3, 8\". Applies to PDF files only; other formats read in full and the run notes that this was ignored.",
      type: "text",
      required: false,
      placeholder: "1-5",
      advanced: true,
    },
    {
      name: "sheetName",
      label: "Sheet name",
      description:
        "Read only one sheet of a spreadsheet. Applies to Excel files only; other formats read in full and the run notes that this was ignored.",
      type: "text",
      required: false,
      placeholder: "June Payroll",
      advanced: true,
    },
    {
      name: "maxPages",
      label: "Maximum pages",
      description:
        "Stop after this many pages or sheets, applied after the page range. Useful for very long documents. The run reports when this cut anything off.",
      type: "number",
      required: false,
      numeric: { min: 1, max: 500, step: 1, integer: true },
      advanced: true,
    },
    {
      name: "maxRows",
      label: "Maximum rows",
      description:
        "The most rows one run may return. Only used when pulling out a table of rows.",
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
        "Values the AI is less sure about than this are listed in the step's low-confidence output. 0 accepts anything, 1 accepts only certainty.",
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
        "On by default: if the AI cannot find a value you marked required, the step stops instead of quietly returning an empty value.",
      type: "boolean",
      required: false,
      defaultValue: true,
      advanced: true,
    },
    {
      name: "modelQuality",
      label: "Quality",
      description:
        "Higher quality handles messier documents and costs twice as many AI credits per run.",
      type: "select",
      required: false,
      defaultValue: "standard",
      options: [
        { value: "standard", label: "Standard (3 credits)" },
        { value: "advanced", label: "Higher quality (6 credits)" },
      ],
      advanced: true,
    },
  ],
  outputs: [
    { name: "mode", type: "string", description: "The analysis that was run." },
    {
      name: "sourceName",
      type: "string",
      description: "Name of the document that was read.",
    },
    {
      name: "detectedType",
      type: "string",
      description: "How the document was read: pdf, docx, xlsx, csv, text, or parsed.",
    },
    {
      name: "summary",
      type: "string",
      nullable: true,
      description: "The summary. Only set when summarizing.",
    },
    {
      name: "keyPoints",
      type: "array",
      nullable: true,
      description: "Key points from the summary. Only set when summarizing.",
    },
    {
      name: "fields",
      type: "object",
      nullable: true,
      description:
        "One entry per field you asked for. Only set when pulling out fields.",
    },
    {
      name: "rows",
      type: "array",
      nullable: true,
      description:
        "One entry per extracted row, with the columns you named plus a per-row confidence. Only set when pulling out rows.",
    },
    {
      name: "rowCount",
      type: "number",
      nullable: true,
      description: "How many rows came back. Only set when pulling out rows.",
    },
    {
      name: "label",
      type: "string",
      nullable: true,
      description: "The category that was picked. Only set when sorting into a category.",
    },
    {
      name: "answer",
      type: "string",
      nullable: true,
      description: "The answer to your question. Only set when answering a question.",
    },
    {
      name: "overallConfidence",
      type: "number",
      description: "How confident the AI was overall, from 0 to 1.",
    },
    {
      name: "lowConfidenceFields",
      type: "array",
      description: "Names of the values the AI was least sure about.",
    },
    {
      name: "truncated",
      type: "boolean",
      description: "True when the document was too long and part of it was left out.",
    },
    {
      name: "pageRangeApplied",
      type: "boolean",
      description: "True when the page range you set was actually used.",
    },
    {
      name: "segmentsAnalyzed",
      type: "number",
      description: "How many pages, sheets, or sections were read.",
    },
    {
      name: "warnings",
      type: "array",
      description: "Notes about anything that was skipped, ignored, or cut short.",
    },
  ],
  producesFileRef: false,
  consumesFileRef: true,
  displayOrder: 10,
  isDestructive: false,
  requiresConfirmation: false,
  riskLevel: "low",
  dynamicOutputs: [
    {
      configField: "expectedFields",
      attachUnder: "fields",
      whenField: "mode",
      whenValueIn: ["extract_fields"],
    },
    {
      configField: "rowSchema",
      attachUnder: "rows",
      whenField: "mode",
      whenValueIn: ["extract_rows"],
    },
  ],
};
