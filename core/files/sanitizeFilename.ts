/**
 * Pure file-name sanitizer for FileRef construction.
 *
 * Per docs/slices/p-s3-file-output-contract-plan.md §6 ("Security"):
 *   The storage path scheme uses a fixed segment structure that doesn't
 *   interpolate the file name into the path directly, but path traversal
 *   characters / control characters / null bytes in untrusted file names
 *   should be stripped upstream so downstream code (Supabase storage,
 *   provider upload APIs, shell-like sinks) never sees them.
 *
 * Algorithm:
 *   1. Strip path separators (`/`, `\`) — kills path-traversal sequences
 *      because `..` alone is no longer a path component.
 *   2. Strip ASCII control characters (`0x00..0x1F`, `0x7F`) — includes
 *      the null byte, tabs, line breaks, and DEL.
 *   3. Trim surrounding whitespace.
 *   4. If the result is empty, fall back to a fixed sentinel name.
 *   5. Truncate to `FILE_REF_NAME_MAX_LENGTH` (the FileRefSchema cap).
 *      The truncation is byte-naive on purpose — V1 used the same length
 *      cap as a character count and we mirror that here.
 *
 * Out of scope: Unicode normalization, reserved-name handling
 * (Windows `CON` / `PRN` / `AUX`), extension preservation on truncation.
 * The contract's storage-path scheme does not interpret file names as
 * filesystem entries directly, so reserved-name pitfalls don't apply.
 */

import { FILE_REF_NAME_MAX_LENGTH } from "@/contracts/file";

/** Fallback name used when the sanitized result would be empty. */
export const SANITIZED_FILENAME_FALLBACK = "file";

const FORWARD_SLASH = 0x2f;
const BACKSLASH = 0x5c;
const DEL = 0x7f;

function isStrippedChar(code: number): boolean {
  // Path separators.
  if (code === FORWARD_SLASH || code === BACKSLASH) return true;
  // Control range (C0 + DEL). Tabs, newlines, null byte, etc.
  if (code < 0x20) return true;
  if (code === DEL) return true;
  return false;
}

/**
 * Sanitize a user / provider-supplied file name into a form safe to embed
 * in storage paths, provider upload bodies, and log lines.
 *
 * Always returns a non-empty string ≤ `FILE_REF_NAME_MAX_LENGTH` characters.
 */
export function sanitizeFilename(input: string): string {
  let stripped = "";
  for (let i = 0; i < input.length; i += 1) {
    const code = input.charCodeAt(i);
    if (!isStrippedChar(code)) stripped += input[i];
  }

  const trimmed = stripped.trim();
  const base = trimmed.length === 0 ? SANITIZED_FILENAME_FALLBACK : trimmed;

  return base.length > FILE_REF_NAME_MAX_LENGTH
    ? base.slice(0, FILE_REF_NAME_MAX_LENGTH)
    : base;
}
