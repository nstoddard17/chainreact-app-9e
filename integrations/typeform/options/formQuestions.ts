import { refreshAndRetry } from "@/services/oauth/refreshAndRetry";
import { OptionsResolverError, type OptionItem, type OptionsResolver } from "@/services/options/types";
import { formGet, type TypeformFormField } from "@/integrations/_shared/typeform/api/forms";
import { toAnswerKeyInfo } from "@/integrations/_shared/typeform/answerKeys";
import { mapTypeformOptionsError, requireTypeformIntegration } from "./_shared";

/**
 * `typeform:form_questions` — the questions on a SELECTED form (REACT-AGENT-TYPEFORM-DYNAMIC-OUTPUTS-1).
 *
 * This is the design-time half of the stable-answer contract. `typeform:forms` answers "which form?";
 * this answers "what does that form ask?", which is what turns a chosen form into mappable workflow
 * outputs. It mirrors the established resource-properties resolver shape already used for HubSpot
 * (`hubspot:contact_properties` et al): parent selection as a declared dependency, one provider call
 * through the shared API boundary, sanitized items out.
 *
 * Identity, not order. Each item's `value` is the STABLE key from `toAnswerKeyInfo` — the same
 * function the webhook normalizer uses to build `answersByRef` — so a mapping chosen here resolves to
 * the same question at runtime. Display order is presentation only and is never the identity; the
 * questions are returned in FORM order (not alphabetized) because that is how a person recognizes
 * their own form, and that ordering is deterministic for a given definition.
 *
 * Sanitization: only key, human label and normalized type leave this boundary. No raw provider
 * payload, no theme/settings/logic, no workspace links, no ids beyond the durable field reference.
 */

/** Typeform question type → the platform output/value type a downstream field can accept. */
const TYPE_MAP: Readonly<Record<string, string>> = {
  short_text: "string",
  long_text: "string",
  email: "string",
  website: "string",
  phone_number: "string",
  dropdown: "string",
  multiple_choice: "string",
  picture_choice: "string",
  legal: "boolean",
  yes_no: "boolean",
  opinion_scale: "number",
  rating: "number",
  nps: "number",
  number: "number",
  date: "string",
  file_upload: "string",
  payment: "string",
  ranking: "string",
  matrix: "string",
};

/** Normalized value type for a question, defaulting to `string` for anything unrecognized. */
export function normalizeQuestionType(providerType: string | undefined): string {
  if (!providerType) return "string";
  return TYPE_MAP[providerType] ?? "string";
}

/**
 * One sanitized question. Exported because the dynamic-output layer builds its output tree from the
 * SAME shape — there is one description of a form's questions, not a UI copy and an agent copy.
 */
export interface TypeformQuestionDescriptor {
  /** Dot-path-safe key — the `answersByRef.<key>` segment. Stable across submissions. */
  readonly key: string;
  /** The question's own text, for display. */
  readonly label: string;
  /** Normalized value type. */
  readonly type: string;
  /** Typeform's immutable reference for the field (or its id when the form uses no refs). */
  readonly providerFieldRef: string;
  /** Selectable answer options, when the question offers a fixed set. */
  readonly choices?: readonly string[];
}

/**
 * Map a provider field to a sanitized descriptor, or null when it has no durable identity (in which
 * case it has no stable path and must not be offered as mappable — offering it would recreate exactly
 * the positional fragility this slice removes).
 */
export function describeQuestion(field: TypeformFormField): TypeformQuestionDescriptor | null {
  const info = toAnswerKeyInfo({ ref: field.ref ?? null, id: field.id ?? null });
  if (info === null) return null;
  const title = typeof field.title === "string" ? field.title.trim() : "";
  const choices = (field.properties?.choices ?? [])
    .map((c) => (typeof c.label === "string" ? c.label : ""))
    .filter((label) => label.length > 0);
  return {
    key: info.key,
    // Fall back to the durable ref so a titleless question is still recognizable, never to a position.
    label: title.length > 0 ? title : info.providerFieldRef,
    type: normalizeQuestionType(field.type),
    providerFieldRef: info.providerFieldRef,
    ...(choices.length > 0 ? { choices } : {}),
  };
}

export const typeformFormQuestionsResolver: OptionsResolver = {
  source: "typeform:form_questions",
  provider: "typeform",
  requiresIntegration: true,
  async resolve(ctx) {
    const integration = requireTypeformIntegration(ctx);

    // The form is a hard dependency: without it there is no schema to describe. Typed so the picker
    // renders "select the form first" instead of an empty list that looks like "this form has none".
    const formId = typeof ctx.deps?.formId === "string" ? ctx.deps.formId.trim() : "";
    if (formId.length === 0) {
      throw new OptionsResolverError(
        "MISSING_DEPENDENCY",
        "Select the Typeform form first so its questions can be mapped.",
      );
    }

    let definition;
    try {
      definition = await refreshAndRetry({
        accountId: integration.accountId,
        provider: "typeform",
        providerAccountId: integration.providerAccountId,
        apiCall: (accessToken) => formGet({ accessToken, formId }),
      });
    } catch (err) {
      mapTypeformOptionsError(err, "form questions");
    }

    const items: OptionItem[] = [];
    for (const field of definition.fields) {
      const q = describeQuestion(field);
      if (q === null) continue;
      items.push({ value: q.key, label: q.label, description: q.type });
    }

    // Form order, deduplicated by stable key. NOT alphabetized: people recognize their own form by
    // its running order, and form order is deterministic for a given definition.
    const seen = new Set<string>();
    const deduped = items.filter((item) => (seen.has(item.value) ? false : (seen.add(item.value), true)));
    return { items: deduped, hasMore: false };
  },
};
