/**
 * Append a signature to a Gmail body field.
 *
 * Shared between `send_email` (Gmail 2.1 Commit 2) and the draft / reply
 * actions (Gmail 2.1 Commit 3). The function is a pure string append
 * with V1-faithful separators:
 *   - textBody → `${body}\n\n${signature}` (V1 sendEmail.ts:164)
 *   - htmlBody → `${body}<br><br>${signature}` (V1 sendEmail.ts:163)
 *
 * The textBody separator uses LF only — `\r\n\r\n` would be more
 * RFC 5322-spec-correct but V1 used LF-only and email clients render
 * either identically. Matching V1 keeps regression risk minimal.
 *
 * The function NEVER converts textBody to HTML (G-R6 regression
 * guard): an HTML-shaped signature appended to a textBody stays in
 * the text/plain part. The schema requires workflow authors to put
 * an HTML signature in htmlBody if they want HTML rendering.
 */
export function applySignature(
  body: string | undefined,
  signature: string | undefined,
  isHtml: boolean,
): string | undefined {
  if (body === undefined) return undefined;
  if (signature === undefined || signature.length === 0) return body;
  const separator = isHtml ? "<br><br>" : "\n\n";
  return `${body}${separator}${signature}`;
}
