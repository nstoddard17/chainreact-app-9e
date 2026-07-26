/**
 * Provider-neutral semantic field mapping (TYPEFORM-DYNAMIC-OUTPUTS-CONSUMPTION-1).
 *
 * Decides which upstream output should fill which downstream field, by MEANING rather than by name
 * equality. The problem it solves is the one the acceptance case exposes: a form asks "Email
 * address", "First name", "Company"; Mailchimp wants `email`; HubSpot wants `email`, `firstname`,
 * `company`; Gmail wants a body. Nothing matches literally, and a human sees the mapping instantly.
 *
 * Deliberately generic. It knows about CONCEPTS (email, first name, company, …) and about the
 * shape of a candidate, never about Typeform, Mailchimp, HubSpot or Gmail. The same layer serves any
 * trigger feeding any action — which is the requirement that the fix must not be hardcoded to one
 * provider combination.
 *
 * Three outcomes, and the distinction between them is the product behavior:
 *   - **high confidence** → map automatically (exactly one plausible source, types compatible);
 *   - **ambiguous** → return the candidates and map NOTHING, so the user chooses. Silently picking
 *     "Work email" over "Personal email" is a guess wearing a confident face;
 *   - **missing** → say so. Never fabricate, never substitute a loosely-related field.
 *
 * Pure: no registry, no I/O, no model. `core/` so the builder, the agent and validation share one
 * definition of "these two fields mean the same thing".
 */

/** A concept two differently-named fields can share. Extend deliberately — each needs real aliases. */
export type FieldConcept =
  | "email"
  | "first_name"
  | "last_name"
  | "full_name"
  | "company"
  | "phone"
  | "message"
  | "subject"
  | "website"
  | "address"
  | "city"
  | "country";

/**
 * Alias vocabulary per concept, matched against NORMALIZED tokens (lowercased, punctuation collapsed).
 * Ordered longest-first at match time so "first name" beats a bare "name".
 */
const CONCEPT_ALIASES: Readonly<Record<FieldConcept, readonly string[]>> = {
  email: ["email", "email address", "e mail", "mail", "work email", "business email", "contact email"],
  first_name: ["first name", "firstname", "given name", "forename", "first"],
  last_name: ["last name", "lastname", "surname", "family name", "second name", "last"],
  full_name: ["full name", "fullname", "your name", "name", "contact name"],
  company: ["company", "company name", "organisation", "organization", "employer", "business", "business name", "org"],
  phone: ["phone", "phone number", "telephone", "mobile", "cell", "contact number"],
  message: ["message", "comments", "comment", "notes", "note", "description", "details", "enquiry", "inquiry", "question", "body", "how can we help"],
  subject: ["subject", "title", "topic", "regarding"],
  website: ["website", "url", "web site", "homepage", "site"],
  address: ["address", "street", "street address", "postal address"],
  city: ["city", "town", "locality"],
  country: ["country", "nation"],
};

/** Concepts whose value is a person's identity/contact detail — used to keep types honest. */
const STRING_CONCEPTS: ReadonlySet<FieldConcept> = new Set([
  "email",
  "first_name",
  "last_name",
  "full_name",
  "company",
  "phone",
  "message",
  "subject",
  "website",
  "address",
  "city",
  "country",
]);

/** Normalize a label or field name to space-separated lowercase tokens. */
export function normalizeLabel(raw: string): string {
  return raw
    .replace(/[_\-.]+/g, " ")
    // Split camelCase / PascalCase so `firstName` and `First Name` normalize alike.
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .toLowerCase()
    .replace(/[^a-z0-9 ]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Classify a label into a concept, or null. Longest alias wins, so "first name" is never swallowed by
 * "name" — the single most damaging misclassification available here, because `full_name` and
 * `first_name` are both plausible and only one is right.
 */
export function classifyConcept(label: string): FieldConcept | null {
  const normalized = normalizeLabel(label);
  if (normalized.length === 0) return null;

  let best: { concept: FieldConcept; length: number } | null = null;
  for (const [concept, aliases] of Object.entries(CONCEPT_ALIASES) as [FieldConcept, readonly string[]][]) {
    for (const alias of aliases) {
      const isMatch = normalized === alias || normalized.includes(` ${alias} `) ||
        normalized.startsWith(`${alias} `) || normalized.endsWith(` ${alias}`);
      if (!isMatch) continue;
      if (best === null || alias.length > best.length) best = { concept, length: alias.length };
    }
  }
  return best?.concept ?? null;
}

/** A mappable upstream value. `path` is the canonical reference path, e.g. `answersByRef.email`. */
export interface MappingCandidate {
  readonly path: string;
  readonly label: string;
  readonly type?: string | undefined;
}

/** A downstream field wanting a value. */
export interface MappingTarget {
  readonly name: string;
  readonly label?: string | undefined;
  readonly type?: string | undefined;
}

export type MappingOutcome =
  | { readonly kind: "mapped"; readonly concept: FieldConcept; readonly candidate: MappingCandidate }
  | { readonly kind: "ambiguous"; readonly concept: FieldConcept; readonly candidates: readonly MappingCandidate[] }
  | { readonly kind: "missing"; readonly concept: FieldConcept }
  | { readonly kind: "no_concept" };

/**
 * Types that can carry a text-ish concept. A `number`/`boolean` source is NOT auto-mapped into a
 * string identity field even when the labels agree — "Rating" matching a `message` destination would
 * be a confident-looking type error.
 */
function typesCompatible(concept: FieldConcept, sourceType: string | undefined, targetType: string | undefined): boolean {
  const target = targetType ?? "text";
  const source = sourceType ?? "string";
  if (STRING_CONCEPTS.has(concept)) {
    if (source !== "string") return false;
    // Any text-ish destination field type accepts a string concept.
    return ["text", "textarea", "string", "email", "combobox", "select", undefined].includes(target);
  }
  return source === target;
}

/**
 * Decide what fills ONE target field, given every available upstream candidate.
 *
 * `no_concept` (the target isn't something this layer understands) and `missing` (it is, but nothing
 * upstream supplies it) are kept DISTINCT: the first is silence, the second is a statement the user
 * should see — *"this form has no company question"*.
 */
export function mapFieldSemantically(
  target: MappingTarget,
  candidates: readonly MappingCandidate[],
): MappingOutcome {
  const concept = classifyConcept(target.label ?? target.name);
  if (concept === null) return { kind: "no_concept" };

  const matches = candidates.filter((c) => classifyConcept(c.label) === concept);
  const compatible = matches.filter((c) => typesCompatible(concept, c.type, target.type));

  if (compatible.length === 1) return { kind: "mapped", concept, candidate: compatible[0]! };
  if (compatible.length > 1) return { kind: "ambiguous", concept, candidates: compatible };
  return { kind: "missing", concept };
}

/** Format a candidate as a canonical `{{sourceId.path}}` reference. */
export function toReference(sourceId: string, candidate: MappingCandidate): string {
  return `{{${sourceId}.${candidate.path}}}`;
}

/**
 * Build a readable summary body from the available candidates, for a request like "email me a summary
 * of their answers".
 *
 * Only includes concepts that actually EXIST upstream — a body must never reference a path the
 * trigger does not produce (that resolves to a typed missing-variable failure at run time), and must
 * never contain invented filler. Returns null when nothing is mappable, so the caller can leave the
 * field for the user rather than emitting an empty-looking template.
 */
export function buildSummaryBody(
  sourceId: string,
  candidates: readonly MappingCandidate[],
  options?: { readonly heading?: string },
): string | null {
  const byConcept = new Map<FieldConcept, MappingCandidate>();
  for (const c of candidates) {
    const concept = classifyConcept(c.label);
    // First candidate wins per concept; an ambiguous concept is skipped rather than guessed.
    if (concept === null) continue;
    if (byConcept.has(concept)) {
      byConcept.delete(concept);
      continue;
    }
    byConcept.set(concept, c);
  }
  if (byConcept.size === 0) return null;

  const lines: string[] = [];
  const first = byConcept.get("first_name");
  const last = byConcept.get("last_name");
  if (first && last) {
    lines.push(`Name: ${toReference(sourceId, first)} ${toReference(sourceId, last)}`);
  } else {
    const single = first ?? last ?? byConcept.get("full_name");
    if (single) lines.push(`Name: ${toReference(sourceId, single)}`);
  }
  for (const concept of ["email", "phone", "company", "website", "subject", "message"] as const) {
    const c = byConcept.get(concept);
    if (!c) continue;
    lines.push(`${c.label}: ${toReference(sourceId, c)}`);
  }
  if (lines.length === 0) return null;
  return `${options?.heading ?? "New submission"}\n\n${lines.join("\n")}`;
}
