import {
  SuggestSchemaResultSchema,
  USER_SCHEMA_MAX_FIELDS,
  type UserDefinedSchema,
} from "@/contracts/aiProcessing";
import {
  AiTransientError,
  ExtractionValidationError,
  refusalError,
} from "./analysisErrors";
import { executeAiAction } from "./executeAiAction";
import {
  MAX_OUTPUT_TOKENS,
  resolveAnalysisDocument,
  type ResolveAnalysisDocumentDeps,
} from "./resolveAnalysisDocument";
import type { SuggestSchemaProcessRequest } from "./types";

/**
 * `ai:suggest_schema` orchestrator (AI-PROVIDER-7 CS-7, plan §4.10).
 *
 * Builder-time, not run-time: it proposes the fields an author probably
 * wants from a document, so the `schema-fields` editor starts populated
 * instead of empty. Nothing it returns is committed — the proposal lands as
 * editable rows and the author decides.
 *
 * It reuses the CS-5 document pipeline WHOLE (`resolveAnalysisDocument`:
 * FileRef → bytes → parser → page budget; or text; or an already-parsed
 * document). There is no second parsing path, and no OCR — a scanned file
 * fails here exactly as it would in Analyze Document, with the same message.
 *
 * Billing, gating, routing, and the ledger belong to `executeAiAction`
 * (plan decision 12). This module's only privileges are the registry key
 * (`ai:suggest_schema` → feature `schema_suggestion`, 1 credit, fast tier
 * only) and the strict validator.
 */

export const SUGGEST_SCHEMA_ACTION_KEY = "ai:suggest_schema";

/** Suggestion is a starting point, not an exhaustive dump. */
export const MAX_SUGGESTED_FIELDS = 40;

export interface RunSchemaSuggestionInput {
  /** The resolved sample: FileRef · text · ParsedDocument. */
  readonly sample: unknown;
  /** Optional author steer ("just the line items"). */
  readonly instructions?: string | undefined;
  readonly accountId: string;
  readonly userId: string;
  readonly workflowId?: string | undefined;
  /** Service-role adapter reason for a `v2_storage` sample. */
  readonly storageReason: string;
}

export interface SchemaSuggestionOutcome {
  readonly schema: UserDefinedSchema;
  /** Name of the sampled document, for the builder's confirmation copy. */
  readonly sourceName: string;
  /** True when the sample was too long and only part of it was read. */
  readonly truncated: boolean;
}

export interface RunSchemaSuggestionDeps extends ResolveAnalysisDocumentDeps {
  readonly execute?: typeof executeAiAction;
}

/** Zod issue paths only — never the offending value. */
function issueNames(error: { issues: readonly { path: (string | number)[] }[] }): string[] {
  return error.issues.map((issue) =>
    issue.path.length > 0 ? issue.path.join(".") : "result",
  );
}

/**
 * Strict validation of the proposal. `SuggestSchemaResultSchema` IS the
 * committed `UserDefinedSchemaSchema`, so a proposal is held to exactly the
 * contract a hand-typed schema is held to: identifier-safe names,
 * case-insensitively unique, a closed primitive type set, 1–200 fields.
 * Anything else is a rejected reply, not a silently-cleaned one.
 */
function validateProposal(
  payload: unknown,
): { ok: true; value: UserDefinedSchema } | { ok: false; issues: readonly string[] } {
  const parsed = SuggestSchemaResultSchema.safeParse(payload);
  if (!parsed.success) return { ok: false, issues: issueNames(parsed.error) };
  if (parsed.data.fields.length > MAX_SUGGESTED_FIELDS) {
    return {
      ok: true,
      value: { fields: parsed.data.fields.slice(0, MAX_SUGGESTED_FIELDS) },
    };
  }
  return { ok: true, value: parsed.data };
}

export async function runSchemaSuggestion(
  input: RunSchemaSuggestionInput,
  deps: RunSchemaSuggestionDeps = {},
): Promise<SchemaSuggestionOutcome> {
  // 1. Sample → parser → ParsedDocument. Same pipeline as Analyze Document;
  //    `summarize` overflow behavior, because a proposal only needs to see
  //    enough of the document to name its fields.
  const resolved = await resolveAnalysisDocument(
    {
      value: input.sample,
      mode: "summarize",
      storageReason: input.storageReason,
    },
    deps,
  );

  const request: SuggestSchemaProcessRequest = {
    task: "suggest_schema",
    ...(input.instructions ? { instructions: input.instructions } : {}),
    document: resolved.payload,
    limits: {
      maxRows: Math.min(MAX_SUGGESTED_FIELDS, USER_SCHEMA_MAX_FIELDS),
      maxOutputTokens: MAX_OUTPUT_TOKENS,
    },
  };

  // 2. The shared pipeline — registry → flag → tier → price → gate → route →
  //    model → validation → ledger. `schema_suggestion` supports `fast` only.
  const outcome = await (deps.execute ?? executeAiAction)<UserDefinedSchema>({
    actionKey: SUGGEST_SCHEMA_ACTION_KEY,
    accountId: input.accountId,
    userId: input.userId,
    ...(input.workflowId ? { workflowId: input.workflowId } : {}),
    requestedTier: "fast",
    request,
    validate: validateProposal,
  });

  if (outcome.status === "preflight_refused") {
    throw refusalError(outcome);
  }
  if (outcome.status === "provider_failed") {
    if (outcome.retryable) throw new AiTransientError(outcome.message);
    throw new Error(outcome.message);
  }
  if (outcome.status === "invalid_output") {
    throw new ExtractionValidationError(outcome.issues);
  }

  return {
    schema: outcome.value,
    sourceName: resolved.payload.name,
    truncated: resolved.truncated,
  };
}
