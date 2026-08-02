
/**
 * Pure sanitizer for the MCP smoke-result artifact (CS-1, Stage 2A).
 *
 * The artifact is read by the internal MCP server's diagnostics tools, so it
 * MUST carry no sensitive content. This module is deliberately free of any
 * Playwright import so the no-leak guarantees can be unit-tested directly with
 * plain objects.
 *
 * Allowed per record: category, title, status, durationMs, errorClass,
 * stepLabel, attachment BASENAMES only.
 *
 * Never included: raw `error.message`, URLs, absolute paths, screenshot/trace
 * bytes or paths, posted message text, channel names, token-shaped values,
 * env/secret values. Free-text fields (title, stepLabel) are scrubbed of
 * URL-shaped and token-shaped substrings defensively; the error message is
 * dropped entirely (only a coarse class label is kept).
 */

export type SmokeStatus =
  | "passed"
  | "failed"
  | "timedOut"
  | "skipped"
  | "interrupted";

/** Raw, possibly-sensitive input collected by the reporter (or a test). */
export interface RawSmokeInput {
  category: string;
  title: string;
  status: SmokeStatus;
  durationMs: number;
  /** Playwright error class name, if any (e.g. "TimeoutError"). */
  errorName?: string | null;
  /** Raw error message — used ONLY to derive a coarse class; never emitted. */
  errorMessage?: string | null;
  /** A coarse phase/step label, if available. Scrubbed before emit. */
  stepLabel?: string | null;
  /** Attachment file paths — reduced to basenames; bytes never read. */
  attachmentPaths?: readonly string[];
}

/** Sanitized, safe-to-share record. */
export interface SanitizedSmokeRecord {
  category: string;
  title: string;
  status: SmokeStatus;
  durationMs: number;
  errorClass: string | null;
  stepLabel: string | null;
  attachmentBasenames: string[];
}

export interface SmokeArtifact {
  /** Schema marker so the reader can validate it's the expected shape. */
  schema: "chainreact.mcp.smoke/v1";
  suite: "production-smoke";
  /** ISO-8601 generation time (supplied by the caller; pure fn takes no clock). */
  generatedAt: string;
  totals: { passed: number; failed: number; skipped: number; other: number };
  records: SanitizedSmokeRecord[];
}

const URL_RE = /\b[a-z][a-z0-9+.-]*:\/\/\S+/gi;
// Token-ish shapes we never want to echo even by accident.
const TOKEN_RES: readonly RegExp[] = [
  /eyJ[A-Za-z0-9_-]{4,}\.[A-Za-z0-9_-]{4,}\.[A-Za-z0-9_-]{4,}/g, // JWT
  /xox[baprs]-[A-Za-z0-9-]{6,}/g, // Slack
  /\bsk-[A-Za-z0-9_-]{12,}/g, // OpenAI-ish
  /\b[rs]k_(?:live|test)_[A-Za-z0-9]{8,}/g, // Stripe
  /\bgh[posu]_[A-Za-z0-9]{12,}/g, // GitHub
  /\bAIza[A-Za-z0-9_-]{10,}/g, // Google
  /\bBearer\s+[A-Za-z0-9._-]{8,}/gi, // bearer header
];
// Absolute-path shapes (POSIX + Windows drive + UNC).
const ABS_PATH_RE = /(?:[A-Za-z]:[\\/]|\\\\|(?<![\w.])\/)[^\s"']*/g;

/** Remove URL-, token-, and absolute-path-shaped substrings from free text. */
export function scrubFreeText(input: string): string {
  let out = input;
  out = out.replace(URL_RE, "[redacted-url]");
  for (const re of TOKEN_RES) out = out.replace(re, "[redacted-token]");
  out = out.replace(ABS_PATH_RE, "[redacted-path]");
  // Collapse whitespace the redactions may have left ragged.
  return out.replace(/\s{2,}/g, " ").trim();
}

/**
 * Map a possibly-sensitive error to a coarse, message-free class label. The
 * raw message is NEVER returned — at most a fixed keyword bucket derived from
 * it, so no message substring can leak.
 */
export function classifyError(
  errorName?: string | null,
  errorMessage?: string | null,
): string | null {
  if (errorName && errorName.trim().length > 0) {
    // Only allow a conservative identifier shape through; otherwise bucket it.
    return /^[A-Za-z][A-Za-z0-9]*$/.test(errorName.trim())
      ? errorName.trim()
      : "Error";
  }
  if (!errorMessage) return null;
  const m = errorMessage.toLowerCase();
  if (m.includes("timeout") || m.includes("timed out")) return "TimeoutError";
  if (m.includes("expect(") || m.includes("expected")) return "AssertionError";
  return "Error";
}

/**
 * Platform-agnostic basename (CI-TIMEOUT-CAPACITY-FIX-1 follow-up): the host's
 * `path.basename` only splits on the host's separator, so on a Linux runner a
 * Windows-style path ("C:\\Users\\<name>\\...\\trace.zip") contains no "/" and
 * leaked WHOLE into the artifact — username, drive letter, parents and all.
 * Artifacts must never carry local paths regardless of which OS produced the
 * path or which OS sanitizes it, so strip on BOTH separators explicitly.
 */
function crossPlatformBasename(p: string): string {
  const tail = p.split(/[\\/]/).filter(Boolean).pop() ?? "";
  // A bare drive designator ("C:") is a location, not a filename — drop it.
  return /^[A-Za-z]:$/.test(tail) ? "" : tail;
}

function sanitizeRecord(raw: RawSmokeInput): SanitizedSmokeRecord {
  const basenames = Array.from(
    new Set((raw.attachmentPaths ?? []).map((p) => crossPlatformBasename(p)).filter(Boolean)),
  );
  return {
    category: scrubFreeText(raw.category),
    title: scrubFreeText(raw.title),
    status: raw.status,
    durationMs: Math.max(0, Math.round(raw.durationMs) || 0),
    errorClass: classifyError(raw.errorName, raw.errorMessage),
    stepLabel:
      raw.stepLabel != null && raw.stepLabel.trim().length > 0
        ? scrubFreeText(raw.stepLabel)
        : null,
    attachmentBasenames: basenames,
  };
}

/** Build the full sanitized artifact from raw inputs + a caller-supplied timestamp. */
export function buildSmokeArtifact(
  raws: readonly RawSmokeInput[],
  generatedAt: string,
): SmokeArtifact {
  const records = raws.map(sanitizeRecord);
  const totals = { passed: 0, failed: 0, skipped: 0, other: 0 };
  for (const r of records) {
    if (r.status === "passed") totals.passed += 1;
    else if (r.status === "skipped") totals.skipped += 1;
    else if (r.status === "failed" || r.status === "timedOut") totals.failed += 1;
    else totals.other += 1;
  }
  return {
    schema: "chainreact.mcp.smoke/v1",
    suite: "production-smoke",
    generatedAt,
    totals,
    records,
  };
}
