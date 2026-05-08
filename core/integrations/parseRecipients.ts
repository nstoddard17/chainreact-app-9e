/**
 * Q7 — Multi-recipient field parser.
 *
 * Schema-declared multi-recipient fields (Calendar attendees, Gmail/Outlook
 * to/cc/bcc, future provider mentions) MUST route through this helper before
 * being handed to the provider API. It splits CSV strings, trims whitespace,
 * drops empties, and flattens mixed array-of-CSV inputs into a flat string list.
 *
 * Out of scope: RFC 5322 display-name parsing. The helper returns the raw
 * trimmed strings; callers map them to provider-specific shapes (e.g.
 * `[{ email }]` for Calendar attendees) and apply provider-specific validation.
 */
export function parseRecipients(
  input: string | readonly string[] | null | undefined,
): string[] {
  if (input == null) return [];
  const arr = Array.isArray(input) ? input : [input as string];
  const out: string[] = [];
  for (const entry of arr) {
    if (typeof entry !== "string") continue;
    for (const part of entry.split(",")) {
      const trimmed = part.trim();
      if (trimmed.length > 0) out.push(trimmed);
    }
  }
  return out;
}
