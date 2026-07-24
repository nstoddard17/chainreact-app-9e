import type { ModelMessage, ModelResponseTool } from "@/core/ai/modelTypes";
import { outputJsonSchemaFor } from "./responseSchemas";
import type { AiProcessRequest } from "./types";

/**
 * Shared request construction (AI-PROVIDER-2 CS-2). Both processor
 * implementations consume the SAME structured fields — the gateway gets
 * them as a versioned JSON body (the Render side owns final vendor
 * prompting), the first-party path gets them rendered into model
 * messages + a forced-tool-use descriptor. Sharing this module is what
 * makes the two paths behaviorally symmetric.
 *
 * No-leak: bodies carry the document text / input data the user asked us
 * to process (inherent to the feature) plus product metadata — NEVER
 * account/user/workflow/membership/billing identifiers, and NEVER the
 * gateway token (header-only, applied by the client).
 */

export const AI_PROCESS_SCHEMA_VERSION = 1;
export const GATEWAY_PROCESS_PATH = "/api/hermes-agent/process";

/** Serialized request bodies larger than this are refused client-side. */
export const GATEWAY_MAX_BODY_BYTES = 2 * 1024 * 1024;

/** Versioned gateway wire body for one process call. */
export function buildGatewayProcessBody(
  request: AiProcessRequest,
  requestId: string,
): Record<string, unknown> {
  const base: Record<string, unknown> = {
    schemaVersion: AI_PROCESS_SCHEMA_VERSION,
    task: request.task,
    outputSchema: outputJsonSchemaFor(request),
    limits: request.limits,
    requestId,
  };
  if (request.instructions) base.instructions = request.instructions;

  switch (request.task) {
    case "analyze_document":
      base.mode = request.mode;
      base.document = request.document;
      if (request.question) base.question = request.question;
      if (request.schema) base.schema = request.schema;
      if (request.labels) base.labels = request.labels;
      if (request.allowOtherLabel !== undefined) {
        base.allowOtherLabel = request.allowOtherLabel;
      }
      break;
    case "transform_data":
      base.input = { json: request.inputJson };
      base.outputShape = request.outputShape;
      base.schema = request.schema;
      if (request.destinationContext) {
        base.destinationContext = request.destinationContext;
      }
      break;
    case "suggest_schema":
      base.document = request.document;
      break;
  }
  return base;
}

// ─── First-party rendering ───────────────────────────────────────────────────

const TASK_TOOL_NAME: Record<AiProcessRequest["task"], string> = {
  analyze_document: "return_document_analysis",
  transform_data: "return_transformed_data",
  suggest_schema: "return_suggested_schema",
};

function renderDocument(request: AiProcessRequest): string {
  if (request.task === "transform_data") {
    return `INPUT DATA (JSON):\n${request.inputJson}`;
  }
  const doc = request.document;
  const segments = doc.segments
    .map((s) => (s.label ? `--- ${s.label} ---\n${s.text}` : s.text))
    .join("\n\n");
  const truncatedNote = doc.truncated
    ? "\n\n[NOTE: the document was truncated before analysis]"
    : "";
  return `DOCUMENT: ${doc.name} (${doc.mimeType})\n\n${segments}${truncatedNote}`;
}

function renderTaskInstruction(request: AiProcessRequest): string {
  switch (request.task) {
    case "analyze_document":
      switch (request.mode) {
        case "summarize":
          return "Summarize the document and list its key points.";
        case "extract_fields":
          return "Extract the declared fields from the document. Use null for values not present; never invent values.";
        case "extract_rows":
          return "Extract every matching row from the document into the declared columns. Never invent rows.";
        case "classify":
          return `Classify the document${request.labels?.length ? ` into one of: ${request.labels.join(", ")}${request.allowOtherLabel === false ? "" : ', or "Other" when none fits'}` : ""}.`;
        case "answer_questions":
          return `Answer this question about the document: ${request.question ?? ""}`;
      }
      break;
    case "transform_data":
      return "Transform the input data into the destination schema. Map source values faithfully; use null when a destination field has no source.";
    case "suggest_schema":
      return "Propose an extraction schema (snake_case field names, types, short descriptions) for the fields a workflow author would want from this document.";
  }
  return "";
}

export interface FirstPartyRequestShape {
  readonly messages: readonly ModelMessage[];
  readonly responseTool: ModelResponseTool;
}

/**
 * Render the SAME logical request for the first-party model client:
 * system+user messages plus a forced-tool-use descriptor whose
 * `inputSchema` is byte-identical to the gateway `outputSchema` (parity
 * is asserted by test).
 */
export function buildFirstPartyRequestShape(
  request: AiProcessRequest,
): FirstPartyRequestShape {
  const parts: string[] = [renderTaskInstruction(request)];
  if (request.instructions) {
    parts.push(`AUTHOR INSTRUCTIONS:\n${request.instructions}`);
  }
  if (request.task === "transform_data" && request.destinationContext) {
    parts.push(
      `DESTINATION CONTEXT (product metadata):\n${JSON.stringify(request.destinationContext)}`,
    );
  }
  parts.push(renderDocument(request));

  return {
    messages: [
      {
        role: "system",
        content:
          "You are ChainReact's data processing engine. Reply ONLY by calling the provided tool with a result that exactly matches its schema. Never fabricate values.",
      },
      { role: "user", content: parts.join("\n\n") },
    ],
    responseTool: {
      name: TASK_TOOL_NAME[request.task],
      description: "Return the structured result for this task.",
      inputSchema: outputJsonSchemaFor(request),
    },
  };
}
