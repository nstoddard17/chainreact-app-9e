/**
 * Shared Typeform answer union + value extraction — TYPEFORM-2.
 *
 * Extracted from `integrations/typeform/triggers/newResponseInForm/normalize.ts`
 * (behavior unchanged) so the Responses API wrapper (`api/responses.ts`,
 * backing `typeform:list_responses` / `typeform:get_response`) and the
 * webhook normalizer flatten answers identically. The `answers[]` entry
 * shape is the SAME discriminated union in the webhook payload and the
 * Responses API (docs/providers/typeform/research.md).
 *
 * Unknown/complex answer types (e.g. `payment` — out of slice scope) keep
 * their `answerType` with `value: null` rather than spreading raw provider
 * structure.
 */

export interface TypeformAnswerField {
  id?: string;
  ref?: string;
  type?: string;
}

export interface TypeformAnswer {
  type?: string;
  field?: TypeformAnswerField;
  text?: string;
  email?: string;
  url?: string;
  date?: string;
  file_url?: string;
  phone_number?: string;
  number?: number;
  boolean?: boolean;
  choice?: { id?: string; label?: string; other?: string; ref?: string };
  choices?: { ids?: string[]; labels?: string[]; refs?: string[]; other?: string };
}

/** Extract the documented primitive value for one answer entry. */
export function extractAnswerValue(
  answer: TypeformAnswer,
): string | number | boolean | null {
  switch (answer.type) {
    case "text":
      return answer.text ?? null;
    case "email":
      return answer.email ?? null;
    case "url":
      return answer.url ?? null;
    case "date":
      return answer.date ?? null;
    case "file_url":
      return answer.file_url ?? null;
    case "phone_number":
      return answer.phone_number ?? null;
    case "number":
      return typeof answer.number === "number" ? answer.number : null;
    case "boolean":
      return typeof answer.boolean === "boolean" ? answer.boolean : null;
    case "choice":
      return answer.choice?.label ?? answer.choice?.other ?? null;
    case "choices": {
      const labels = Array.isArray(answer.choices?.labels)
        ? answer.choices.labels.filter((l): l is string => typeof l === "string")
        : [];
      const other = answer.choices?.other;
      const all =
        typeof other === "string" && other.length > 0 ? [...labels, other] : labels;
      return all.length > 0 ? all.join(", ") : null;
    }
    default:
      // Unknown/complex types (payment, …) — keep the answerType, never
      // spread raw provider structure.
      return null;
  }
}
