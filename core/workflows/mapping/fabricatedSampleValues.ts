/**
 * Detector for FABRICATED sample values in model-proposed config (REACT-AGENT-MULTISTEP-DATA-MAPPING-1).
 *
 * The production failure this exists for: asked to wire a Typeform submission into Mailchimp, HubSpot
 * and Gmail, the agent picked the right four nodes and then filled the Email fields with
 * `subscriber@example.com` and `alice@example.com`. Those are not upstream references and not values
 * the user gave — they are invented, realistic-looking customer data. Saved as-is, a workflow like
 * that silently mails a stranger (or a nobody) on every run, and looks configured while doing it.
 *
 * The rule this module encodes: **an identity-shaped literal the user never wrote is always wrong.**
 * Either it belongs to upstream workflow data (so it must be a `{{...}}` reference) or it is a real
 * decision only the user can make (so it must be asked, not guessed). There is no third case where
 * the model inventing an email address is the right answer.
 *
 * Deliberately NARROW, because the cost of a false positive is dropping a value the user did supply:
 *   - only EMAIL / PHONE / KNOWN-SAMPLE-DOMAIN shapes — the identity classes that cause real harm;
 *   - never model-authored PROSE. A subject line "New Typeform submission" or a body template is
 *     legitimate authored content and must pass untouched. Only the identity token inside a string
 *     is judged, never the string's overall "does this look made up?" quality;
 *   - anything the user actually typed is ALLOWED, matched against their own words. This is what
 *     separates "user said email invoices to billing@acme.com" from "model invented alice@example.com".
 *
 * Pure: no registry, no I/O, no model, no clock. `core/` per the project structure rule, so the
 * guidance service, the builder, and validation can all share one definition of "fabricated".
 */

/**
 * Hosts that are sample data BY CONVENTION (RFC 2606 reserved names plus the usual filler). A literal
 * on one of these is fabricated even in the vanishingly rare case the user typed it — it can never be
 * a real destination, so keeping it only makes a broken workflow look ready.
 */
const SAMPLE_HOSTS: readonly string[] = [
  "example.com",
  "example.org",
  "example.net",
  "example.edu",
  "test.com",
  "sample.com",
  "domain.com",
  "yourdomain.com",
  "yourcompany.com",
  "mycompany.com",
  "company.com",
  "acme.com",
  "mailinator.com",
];

/** Pragmatic email shape — deliberately permissive on the local part, strict about the `@host.tld`. */
const EMAIL_RE = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g;

/**
 * Phone shape, intentionally conservative: an optional `+`, then at least 9 digits once separators
 * are stripped. Short digit runs (quantities, ids, ports, years) must never trip this.
 */
const PHONE_RE = /\+?\d[\d\s().-]{8,}\d/g;

export type FabricatedValueKind = "email" | "phone" | "sample_domain";

export interface FabricatedValueFinding {
  /** Which identity class was detected. Safe enum — never the value itself. */
  readonly kind: FabricatedValueKind;
}

/**
 * Normalize the user's own words once, for repeated membership tests. Lowercased; all whitespace
 * collapsed so "billing @ acme.com" and "billing@acme.com" compare equal after the same treatment.
 */
export function buildUserLiteralCorpus(texts: readonly string[]): string {
  return texts.join("\n").toLowerCase().replace(/\s+/g, "");
}

/** True when the user's own words contain this literal (whitespace/case-insensitive). */
function userWrote(corpus: string, literal: string): boolean {
  if (corpus.length === 0) return false;
  return corpus.includes(literal.toLowerCase().replace(/\s+/g, ""));
}

function hasSampleHost(literal: string): boolean {
  const lowered = literal.toLowerCase();
  return SAMPLE_HOSTS.some((host) => lowered.endsWith(`@${host}`) || lowered.includes(`.${host}`) || lowered.endsWith(host));
}

/**
 * Inspect ONE string for a fabricated identity literal.
 *
 * Returns the first finding, or `null` when the string is clean — which includes every string whose
 * identity tokens the user actually wrote, and every string with no identity token at all (ordinary
 * prose, `{{...}}` references, subject lines, option values).
 */
export function findFabricatedSampleValue(
  value: string,
  userCorpus: string,
): FabricatedValueFinding | null {
  for (const match of value.match(EMAIL_RE) ?? []) {
    // THE USER ALWAYS WINS. If they typed this address, it is their decision — including when it is
    // on a reserved sample domain (people legitimately test with `vendor@example.com`). Overriding
    // them would silently discard a real instruction, which is the opposite failure to the one this
    // guard exists to prevent. Only literals the user never wrote are judged.
    if (userWrote(userCorpus, match)) continue;
    return hasSampleHost(match) ? { kind: "sample_domain" } : { kind: "email" };
  }
  for (const match of value.match(PHONE_RE) ?? []) {
    const digits = match.replace(/\D/g, "");
    if (digits.length < 9) continue;
    if (!userWrote(userCorpus, match) && !userWrote(userCorpus, digits)) return { kind: "phone" };
  }
  return null;
}

/**
 * Inspect a proposed config VALUE of any shape (string, string array, or a nested object/array from a
 * structured field) and report the first fabricated literal found.
 *
 * Values carrying a `{{...}}` reference are still scanned: a body like
 * `"Email: {{trigger.email}} (or reach them at alice@example.com)"` is exactly the half-mapped shape
 * this guard exists to catch, and the reference alone must not launder the invented address.
 */
export function findFabricatedValueDeep(value: unknown, userCorpus: string): FabricatedValueFinding | null {
  if (typeof value === "string") return findFabricatedSampleValue(value, userCorpus);
  if (Array.isArray(value)) {
    for (const item of value) {
      const found = findFabricatedValueDeep(item, userCorpus);
      if (found) return found;
    }
    return null;
  }
  if (value !== null && typeof value === "object") {
    for (const item of Object.values(value as Record<string, unknown>)) {
      const found = findFabricatedValueDeep(item, userCorpus);
      if (found) return found;
    }
    return null;
  }
  return null;
}
