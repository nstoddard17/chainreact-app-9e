/**
 * DEV-CONNECTION-TRANSPLANT-UTILITY-1 — redaction helpers.
 *
 * Everything a report/log/diagnostic line carries about an external account
 * passes through here. Rules:
 *   - never a full email address, domain, or provider account id;
 *   - never token material (plaintext OR ciphertext — ciphertext is sensitive);
 *   - identifiers keep only a short recognizable prefix + length.
 */

/** Redact an arbitrary identifier: first 4 chars + length marker. */
export function redactId(value: string | null | undefined): string {
  if (!value) return "(none)";
  const prefix = value.slice(0, 4);
  return `${prefix}…(len ${value.length})`;
}

/**
 * Redact a human label / email. Emails keep 2 chars of the local part and the
 * TLD only; other labels keep the first 3 chars.
 */
export function redactLabel(value: string | null | undefined): string {
  if (!value) return "(none)";
  const at = value.indexOf("@");
  if (at > 0) {
    const local = value.slice(0, at);
    const domain = value.slice(at + 1);
    const tld = domain.includes(".") ? domain.slice(domain.lastIndexOf(".")) : "";
    return `${local.slice(0, 2)}…@…${tld}`;
  }
  return `${value.slice(0, 3)}…(len ${value.length})`;
}

/**
 * Assert a serialized artifact (report JSON, log line, error message) contains
 * none of the given sensitive values. Used by the orchestrator before writing
 * any artifact, and by tests. Values shorter than 6 chars are ignored (too
 * generic to scan for without false positives — real tokens/ciphertexts are
 * far longer).
 */
export function assertNoSecretMaterial(
  serialized: string,
  secrets: readonly (string | null | undefined)[],
): void {
  for (const secret of secrets) {
    if (!secret || secret.length < 6) continue;
    if (serialized.includes(secret)) {
      // Deliberately does NOT echo the offending value.
      throw new Error(
        "redaction violation: serialized output contains sensitive material; refusing to emit it.",
      );
    }
  }
}
