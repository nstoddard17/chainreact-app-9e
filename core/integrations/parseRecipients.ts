import { parseCsvList } from "./parseCsvList";

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
 *
 * Outlook Mail 2.2 — implementation moved to the shape-agnostic
 * `parseCsvList` so `add_categories` and other Q7-shape callers can
 * share one canonical splitter. The `parseRecipients` name stays as the
 * public surface for email-recipient fields (test + handler legibility).
 */
export function parseRecipients(
  input: string | readonly string[] | null | undefined,
): string[] {
  return parseCsvList(input);
}
