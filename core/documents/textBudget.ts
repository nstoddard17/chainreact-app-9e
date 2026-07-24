import type { DocumentAnalysisMode } from "@/contracts/aiProcessing";
import type { ParsedDocument, ParsedSegment } from "./parsedDocument";
import { countChars } from "./parsedDocument";

/**
 * Text budgeting for AI document processing (AI-PROVIDER-PLAN-1 §4.6).
 *
 * Applied AFTER parsing and BEFORE any model call. The per-mode overflow
 * policy is deliberate:
 *   - summarize / classify / answer_questions tolerate truncation (the
 *     result is flagged, and the flag also travels to the model so a
 *     summary can say it saw a partial document);
 *   - extract_fields / extract_rows REJECT overflow — silent truncation
 *     during extraction means silently missing rows (payroll rows), a
 *     correctness failure. The user narrows with Page range / Sheet.
 *
 * Pure — the env-configured ceiling (`AI_PROCESSOR_MAX_INPUT_CHARS`) is
 * read by the services layer (CS-2) and passed in as `maxChars`.
 */

/** Default ceiling (~37k tokens) when no env override is configured. */
export const DEFAULT_MAX_INPUT_CHARS = 150_000;

export const TRUNCATION_WARNING = "text_budget_truncated";
export const SEGMENT_SPLIT_WARNING = "text_budget_split_first_segment";

export type TextBudgetOverflowBehavior = "truncate" | "reject";

export function overflowBehaviorForMode(
  mode: DocumentAnalysisMode,
): TextBudgetOverflowBehavior {
  switch (mode) {
    case "summarize":
    case "classify":
    case "answer_questions":
      return "truncate";
    case "extract_fields":
    case "extract_rows":
      return "reject";
  }
}

export type TextBudgetResult =
  | { readonly ok: true; readonly document: ParsedDocument }
  | {
      readonly ok: false;
      readonly charCount: number;
      readonly maxChars: number;
    };

/**
 * Enforce `maxChars` over a parsed document.
 *
 * Truncation keeps whole segments in order while they fit ("truncate at
 * a segment boundary"). Exception: when even the FIRST segment exceeds
 * the budget (one huge sheet/CSV), it is split mid-segment rather than
 * returning an empty payload — flagged with SEGMENT_SPLIT_WARNING.
 */
export function applyTextBudget(
  parsed: ParsedDocument,
  options: {
    maxChars: number;
    onOverflow: TextBudgetOverflowBehavior;
  },
): TextBudgetResult {
  const { maxChars, onOverflow } = options;
  if (maxChars < 1) {
    throw new RangeError("maxChars must be a positive integer.");
  }
  if (parsed.charCount <= maxChars) {
    return { ok: true, document: parsed };
  }
  if (onOverflow === "reject") {
    return { ok: false, charCount: parsed.charCount, maxChars };
  }

  const kept: ParsedSegment[] = [];
  const warnings = [...parsed.warnings, TRUNCATION_WARNING];
  let used = 0;
  for (const segment of parsed.segments) {
    if (used + segment.text.length <= maxChars) {
      kept.push(segment);
      used += segment.text.length;
      continue;
    }
    if (kept.length === 0) {
      kept.push({ label: segment.label, text: segment.text.slice(0, maxChars) });
      warnings.push(SEGMENT_SPLIT_WARNING);
    }
    break;
  }

  return {
    ok: true,
    document: {
      kind: parsed.kind,
      segments: kept,
      totalSegments: parsed.totalSegments,
      truncated: true,
      charCount: countChars(kept),
      warnings,
    },
  };
}
