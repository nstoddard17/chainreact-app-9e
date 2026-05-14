/**
 * Decode a Gmail-style base64url string to raw bytes.
 *
 * Gmail 2.3 Commit 5 — Gmail's `users.messages.attachments.get`
 * returns attachment data in **base64url** form (per RFC 4648 §5):
 *   - `-` instead of `+`
 *   - `_` instead of `/`
 *   - Padding (`=`) is optional and frequently omitted.
 *
 * Why a helper instead of inlining the conversion in the handler:
 *   - The get_attachment handler is the only producer today, but the
 *     same wire shape applies to every Gmail attachment surface
 *     (future actions, e2e fixtures). One canonical decode point.
 *   - Pure / no side effects — unit-testable without mocks.
 *
 * Implementation:
 *   - Normalize to standard base64 (`-`→`+`, `_`→`/`).
 *   - Restore padding (Buffer.from in Node would tolerate missing
 *     padding, but `atob` does not — being explicit avoids surprises
 *     in non-Node runtimes).
 *   - Use Node's `Buffer.from(str, "base64")` for the decode step.
 *     The handler runs server-side; this code path never executes in
 *     a browser. Output is a `Uint8Array` for `stageFileToStorage`.
 *
 * Throws `Error` on input that's not a valid base64 string. Callers
 * (get_attachment) should let the error propagate so the workflow
 * step records a clear failure rather than staging garbage bytes.
 */
export function decodeBase64Url(input: string): Uint8Array {
  // Normalize base64url → base64.
  let normalized = input.replace(/-/g, "+").replace(/_/g, "/");

  // Restore padding to a multiple of 4. Gmail strips trailing `=`s.
  const remainder = normalized.length % 4;
  if (remainder === 2) normalized += "==";
  else if (remainder === 3) normalized += "=";
  else if (remainder === 1) {
    // A single trailing char is never valid base64 — reject early so
    // the handler surfaces a clear "bad attachment data" error instead
    // of silently truncating.
    throw new Error("decodeBase64Url: malformed base64url input");
  }

  const buf = Buffer.from(normalized, "base64");
  return new Uint8Array(buf.buffer, buf.byteOffset, buf.byteLength);
}
