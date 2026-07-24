import { z } from "zod";

import {
  AnswerQuestionsResultSchema,
  ClassifyResultSchema,
  ExtractFieldsResultSchema,
  ExtractRowsResultSchema,
  ROW_CONFIDENCE_KEY,
  SuggestSchemaResultSchema,
  SummarizeResultSchema,
  TransformRecordResultSchema,
  TransformRowsResultSchema,
  USER_SCHEMA_FIELD_NAME_PATTERN,
  USER_SCHEMA_MAX_FIELDS,
  type UserDefinedSchema,
} from "@/contracts/aiProcessing";
import type { AiProcessRequest } from "./types";

/**
 * Per-task output contracts (AI-PROVIDER-2 CS-2), shared by BOTH client
 * implementations so gateway and first-party stay behaviorally symmetric:
 *
 *   - `resultValidatorFor(request)` — the strict Zod envelope the raw
 *     model result must satisfy (STRUCTURE only; field VALUES stay
 *     `unknown` — coercion/typing against the user schema is the
 *     orchestrator's extraction validator, a separate later layer).
 *   - `outputJsonSchemaFor(request)` — the same contract compiled to a
 *     JSON Schema (Draft 2020-12 subset) sent as the gateway
 *     `outputSchema` / first-party `responseTool.inputSchema`.
 *
 * No-leak: the JSON Schema embeds the user's declared field NAMES and
 * DESCRIPTIONS (they are the extraction instructions) — never document
 * content, tokens, or account/workflow identifiers.
 */

// ─── Zod result validators ───────────────────────────────────────────────────

export function resultValidatorFor(request: AiProcessRequest): z.ZodTypeAny {
  switch (request.task) {
    case "analyze_document":
      switch (request.mode) {
        case "summarize":
          return SummarizeResultSchema;
        case "extract_fields":
          return ExtractFieldsResultSchema;
        case "extract_rows":
          return ExtractRowsResultSchema;
        case "classify":
          return ClassifyResultSchema;
        case "answer_questions":
          return AnswerQuestionsResultSchema;
      }
      break;
    case "transform_data":
      return request.outputShape === "record"
        ? TransformRecordResultSchema
        : TransformRowsResultSchema;
    case "suggest_schema":
      return SuggestSchemaResultSchema;
  }
  // Exhaustiveness backstop — unreachable for well-typed requests.
  throw new Error("Unknown AI process request task.");
}

// ─── JSON Schema builders ────────────────────────────────────────────────────

const CONFIDENCE_JSON = {
  type: "number",
  minimum: 0,
  maximum: 1,
} as const;

/** `{ value, confidence }` per declared field; every declared field required. */
function fieldsObjectJson(schema: UserDefinedSchema): Record<string, unknown> {
  const properties: Record<string, unknown> = {};
  for (const field of schema.fields) {
    properties[field.name] = {
      type: "object",
      description: field.description ?? undefined,
      properties: {
        // Value type left open (may be null) — strict typing/coercion happens
        // in the extraction validator, not at the delivery contract.
        value: {},
        confidence: CONFIDENCE_JSON,
      },
      required: ["value", "confidence"],
      additionalProperties: false,
    };
  }
  return {
    type: "object",
    properties,
    required: schema.fields.map((f) => f.name),
    additionalProperties: false,
  };
}

/** One row object: every declared column + the reserved `_confidence`. */
function rowObjectJson(schema: UserDefinedSchema): Record<string, unknown> {
  const properties: Record<string, unknown> = {
    [ROW_CONFIDENCE_KEY]: CONFIDENCE_JSON,
  };
  for (const field of schema.fields) {
    properties[field.name] = field.description
      ? { description: field.description }
      : {};
  }
  return {
    type: "object",
    properties,
    required: [...schema.fields.map((f) => f.name), ROW_CONFIDENCE_KEY],
    additionalProperties: false,
  };
}

const SUGGESTED_SCHEMA_JSON = {
  type: "object",
  properties: {
    fields: {
      type: "array",
      minItems: 1,
      maxItems: USER_SCHEMA_MAX_FIELDS,
      items: {
        type: "object",
        properties: {
          name: {
            type: "string",
            pattern: USER_SCHEMA_FIELD_NAME_PATTERN.source,
            description: "snake_case identifier for the field",
          },
          type: {
            type: "string",
            enum: ["string", "number", "boolean", "date", "currency"],
          },
          required: { type: "boolean" },
          description: { type: "string", maxLength: 300 },
        },
        required: ["name", "type"],
        additionalProperties: false,
      },
    },
  },
  required: ["fields"],
  additionalProperties: false,
} as const;

/**
 * Compile the request's output contract to a JSON Schema document. The
 * model MUST reply with exactly this shape; the gateway/vendor enforces
 * it via forced structured output, and we re-validate with the Zod twin.
 */
export function outputJsonSchemaFor(
  request: AiProcessRequest,
): Record<string, unknown> {
  switch (request.task) {
    case "analyze_document":
      switch (request.mode) {
        case "summarize":
          return {
            type: "object",
            properties: {
              summary: { type: "string", minLength: 1 },
              keyPoints: {
                type: "array",
                items: { type: "string", minLength: 1 },
                maxItems: 20,
              },
              overallConfidence: CONFIDENCE_JSON,
            },
            required: ["summary", "keyPoints", "overallConfidence"],
            additionalProperties: false,
          };
        case "extract_fields":
          return {
            type: "object",
            properties: {
              fields: request.schema
                ? fieldsObjectJson(request.schema)
                : { type: "object" },
              overallConfidence: CONFIDENCE_JSON,
            },
            required: ["fields", "overallConfidence"],
            additionalProperties: false,
          };
        case "extract_rows":
          return {
            type: "object",
            properties: {
              rows: {
                type: "array",
                maxItems: request.limits.maxRows,
                items: request.schema
                  ? rowObjectJson(request.schema)
                  : { type: "object" },
              },
              overallConfidence: CONFIDENCE_JSON,
            },
            required: ["rows", "overallConfidence"],
            additionalProperties: false,
          };
        case "classify":
          return {
            type: "object",
            properties: {
              label:
                request.labels && request.labels.length > 0
                  ? {
                      type: "string",
                      enum: request.allowOtherLabel === false
                        ? [...request.labels]
                        : [...request.labels, "Other"],
                    }
                  : { type: "string", minLength: 1 },
              confidence: CONFIDENCE_JSON,
            },
            required: ["label", "confidence"],
            additionalProperties: false,
          };
        case "answer_questions":
          return {
            type: "object",
            properties: {
              answer: { type: "string", minLength: 1 },
              confidence: CONFIDENCE_JSON,
            },
            required: ["answer", "confidence"],
            additionalProperties: false,
          };
      }
      break;
    case "transform_data": {
      const itemJson = rowObjectJson(request.schema);
      if (request.outputShape === "record") {
        // A single record keyed by the destination fields (no _confidence
        // column inside the record — overallConfidence covers it).
        const properties: Record<string, unknown> = {};
        for (const field of request.schema.fields) {
          properties[field.name] = field.description
            ? { description: field.description }
            : {};
        }
        return {
          type: "object",
          properties: {
            record: {
              type: "object",
              properties,
              required: request.schema.fields.map((f) => f.name),
              additionalProperties: false,
            },
            overallConfidence: CONFIDENCE_JSON,
          },
          required: ["record", "overallConfidence"],
          additionalProperties: false,
        };
      }
      return {
        type: "object",
        properties: {
          rows: {
            type: "array",
            maxItems: request.limits.maxRows,
            items: itemJson,
          },
          overallConfidence: CONFIDENCE_JSON,
        },
        required: ["rows", "overallConfidence"],
        additionalProperties: false,
      };
    }
    case "suggest_schema":
      return { ...SUGGESTED_SCHEMA_JSON };
  }
  throw new Error("Unknown AI process request task.");
}
