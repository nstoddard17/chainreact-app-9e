/**
 * Generic CSV-or-array list parser — the shape-agnostic sibling of
 * `parseRecipients` (Q7).
 *
 * Schema-declared multi-value fields whose semantics are NOT recipients
 * (Outlook `categories[]`, Trello labels-by-name, Notion multi-select
 * options, etc.) MUST route through this helper before reaching the
 * provider API. It splits CSV strings, trims whitespace, drops empties,
 * and flattens mixed array-of-CSV inputs into a flat string list.
 *
 * `parseRecipients` is now a thin delegate over this helper so all
 * Q7-shape callers (recipients, categories, labels, attendees) share
 * one canonical splitter. The "recipients" naming stays as the public
 * surface for email-recipient fields because the term is well-established
 * in handler tests + docs.
 *
 * Out of scope: any provider-specific value validation. Categories are
 * arbitrary user-defined labels — the caller decides what's valid.
 */
export function parseCsvList(
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
