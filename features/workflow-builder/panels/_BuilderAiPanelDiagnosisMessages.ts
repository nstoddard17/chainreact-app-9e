import {
  AI_CREDITS_EXHAUSTED_MESSAGE,
  type RepairPreviewFailure,
} from "@/lib/api/ai";

/**
 * Pure, UI-owned copy mappers for the Builder AI diagnosis-family actions.
 * Extracted from `useBuilderDiagnosisActions` in Slice 4.AI-REPAIR-HANDLER-CLEANUP-1
 * (refactor only — NO behavior change) so the growing hook stops re-inlining the
 * same safe-copy ladders for each new deterministic repair category.
 *
 * Every function here returns a SAFE, fixed string — never raw server/model text,
 * ids, config, tokens, or provider errors. Same input → same output as the inline
 * code these replaced; the handlers still own all state + control flow.
 */

/** AI-REPAIR-3E — safe, code-keyed copy for a handled repair-apply failure. */
export function safeApplyFailureMessage(code: string): string {
  switch (code) {
    case "STALE_PATCH":
      return "This preview is out of date. Run Check workflow again.";
    case "NOT_APPLYABLE":
      return "This change can't be applied. Run Check workflow again.";
    default:
      // EXECUTION_FAILED | anything else.
      return "Couldn’t apply this change. Run Check workflow again.";
  }
}

/** Generic fallback for a failed repair-preview build (transport or unknown handled code). */
export const REPAIR_PREVIEW_GENERIC_ERROR =
  "Couldn’t build a repair preview right now. Please try again.";

/**
 * Safe, status-mapped copy for a transport-level failure of an AI-assistant action
 * (explain / suggest / preview). 401 → sign-in, 404 → not-found, else the caller's
 * action-specific `fallback`. Mirrors the inline ladder these calls replaced.
 */
export function aiAssistantTransportErrorMessage(status: number, fallback: string): string {
  if (status === 401) return "Please sign in to use the AI assistant.";
  if (status === 404) return "This workflow couldn’t be found.";
  return fallback;
}

/**
 * AI-DIAG-QA-3 — safe, code-keyed copy for a HANDLED (ok:false) workflow-Q&A result.
 * AI_CREDITS_EXHAUSTED → the shared exhausted message; ACCOUNT_PENDING_DELETION →
 * a fixed account line; anything else (AI_GATE_ERROR / MODEL_FAILED / PARSE_FAILED /
 * unknown) → one generic retry line. Defense in depth — a raw model/server/gate
 * message can NEVER leak through this mapper.
 */
export function diagnosisQaFailureMessage(code: string): string {
  if (code === "AI_CREDITS_EXHAUSTED") return AI_CREDITS_EXHAUSTED_MESSAGE;
  if (code === "ACCOUNT_PENDING_DELETION") return "This account is pending deletion.";
  return "Couldn’t answer that right now. Please try again.";
}

/**
 * Safe copy for a HANDLED (ok:false) repair-preview result. AI_CREDITS_EXHAUSTED →
 * the shared exhausted message; NOTHING_TO_PREVIEW / NO_SAFE_PATCH are EXPECTED,
 * non-503 states whose client-normalized, UI-owned `message` is surfaced as-is; any
 * other (MODEL_FAILED / PARSE_FAILED / unknown) forces the generic line — defense in
 * depth so a raw model/server message can NEVER leak here.
 */
export function repairPreviewFailureMessage(res: RepairPreviewFailure): string {
  if (res.code === "AI_CREDITS_EXHAUSTED") return AI_CREDITS_EXHAUSTED_MESSAGE;
  if (res.code === "NOTHING_TO_PREVIEW" || res.code === "NO_SAFE_PATCH") return res.message;
  return REPAIR_PREVIEW_GENERIC_ERROR;
}
