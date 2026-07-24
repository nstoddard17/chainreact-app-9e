import { FileRefSchema, type FileRef } from "@/contracts/file";
import { buildParsedDocument, type ParsedDocument } from "./parsedDocument";

/**
 * Document-input classification (AI-PROVIDER-5 CS-5).
 *
 * `ai:analyze_document` takes ONE "Document" config field whose runtime
 * value is whatever the upstream step produced. The engine pre-resolves
 * `{{...}}` before dispatch, and a single-token template returns the RAW
 * value — so the same field can legitimately arrive as:
 *
 *   - a `FileRef`        — a file staged by an upstream download/attachment
 *                          step (the common path);
 *   - plain TEXT         — an email body, a note field, an API response
 *                          string the author mapped in;
 *   - a `ParsedDocument` — already-normalized document text (the shape this
 *                          repo's parsing layer emits). No shipped action
 *                          produces one yet; accepting it keeps a future
 *                          "parse once, analyze twice" step from needing a
 *                          contract change, and it is the shape the
 *                          Suggest-Fields sample path (CS-7) already has in
 *                          hand.
 *
 * Anything else is REFUSED with a typed, caller-safe reason — never coerced
 * with `String(value)`, which would send `[object Object]` to a paid model
 * call and bill for the privilege.
 *
 * PURE: classification + text→ParsedDocument only. Fetching bytes and
 * running the npm parsers are `services/` concerns (see
 * `services/documents/parsing/`), because `core/` may not import them.
 *
 * No-leak: `reason` strings describe the SHAPE that was received (its
 * JavaScript type / the fact that it was empty) — never the value itself.
 */

/** Display name used when text is analyzed directly (no source file). */
export const TEXT_INPUT_DOCUMENT_NAME = "text-input.txt";
export const TEXT_INPUT_MIME_TYPE = "text/plain";

/** Display name used when an already-parsed document arrives with no file. */
export const PARSED_INPUT_DOCUMENT_NAME = "parsed-document";

export type DocumentInputClassification =
  | { readonly kind: "file_ref"; readonly fileRef: FileRef }
  | { readonly kind: "text"; readonly text: string }
  | { readonly kind: "parsed_document"; readonly document: ParsedDocument }
  | { readonly kind: "unsupported"; readonly reason: string };

function isParsedSegmentArray(value: unknown): value is { label: unknown; text: unknown }[] {
  return (
    Array.isArray(value) &&
    value.length > 0 &&
    value.every(
      (segment) =>
        typeof segment === "object" &&
        segment !== null &&
        typeof (segment as { text?: unknown }).text === "string",
    )
  );
}

const PARSED_KINDS = new Set(["pages", "sheets", "rows", "text"]);

/**
 * Read an already-normalized `ParsedDocument` out of an unknown value.
 * Tolerant about the bookkeeping fields (`totalSegments` / `truncated` /
 * `charCount` / `warnings` are recomputed) and strict about the two that
 * carry meaning: `kind` and `segments`.
 */
export function readParsedDocumentInput(value: unknown): ParsedDocument | null {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return null;
  const candidate = value as Record<string, unknown>;
  if (typeof candidate.kind !== "string" || !PARSED_KINDS.has(candidate.kind)) {
    return null;
  }
  if (!isParsedSegmentArray(candidate.segments)) return null;

  const segments = (candidate.segments as { label?: unknown; text: string }[]).map(
    (segment) => ({
      label: typeof segment.label === "string" ? segment.label : "",
      text: segment.text,
    }),
  );
  if (segments.every((segment) => segment.text.trim() === "")) return null;

  const warnings = Array.isArray(candidate.warnings)
    ? candidate.warnings.filter((w): w is string => typeof w === "string")
    : [];

  return buildParsedDocument({
    kind: candidate.kind as ParsedDocument["kind"],
    segments,
    ...(typeof candidate.totalSegments === "number" &&
    Number.isFinite(candidate.totalSegments) &&
    candidate.totalSegments >= segments.length
      ? { totalSegments: candidate.totalSegments }
      : {}),
    ...(candidate.truncated === true ? { truncated: true } : {}),
    warnings,
  });
}

/** Wrap plain text as a single-segment `ParsedDocument`. */
export function parsedDocumentFromText(text: string): ParsedDocument {
  return buildParsedDocument({ kind: "text", segments: [{ label: "", text }] });
}

/**
 * Classify a resolved "Document" config value into one of the three
 * supported phase-1 input kinds, or an explicit refusal.
 *
 * Order matters: a `FileRef` is an object that would also fail the
 * ParsedDocument guard, so refs are matched first via the committed strict
 * schema (which is what makes "an object with a `url`" NOT silently pass).
 */
export function classifyDocumentInput(value: unknown): DocumentInputClassification {
  if (value === undefined || value === null) {
    return { kind: "unsupported", reason: "no document was provided" };
  }

  if (typeof value === "string") {
    if (value.trim() === "") {
      return { kind: "unsupported", reason: "the text provided is empty" };
    }
    return { kind: "text", text: value };
  }

  if (typeof value === "object" && !Array.isArray(value)) {
    const asFileRef = FileRefSchema.safeParse(value);
    if (asFileRef.success) {
      return { kind: "file_ref", fileRef: asFileRef.data };
    }
    const asParsed = readParsedDocumentInput(value);
    if (asParsed) {
      return { kind: "parsed_document", document: asParsed };
    }
    return {
      kind: "unsupported",
      reason:
        "the value is an object that is not a file from a previous step and not readable document text",
    };
  }

  return {
    kind: "unsupported",
    reason: `the value is a ${Array.isArray(value) ? "list" : typeof value}, not a file or text`,
  };
}
