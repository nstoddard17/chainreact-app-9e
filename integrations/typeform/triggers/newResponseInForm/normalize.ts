import type { TriggerEvent } from "@/contracts/triggerEvent";

/**
 * Normalize a Typeform `form_response` webhook delivery into V2's
 * canonical `TriggerEvent` — Slice 5.TYPEFORM-1.
 *
 * PURE + deterministic dedup key (enforced by
 * tests/structure/webhook-normalize-purity.test.ts): the `eventId` is
 * never derived from a clock or RNG.
 *
 * Dedup key: `new_response_in_form:${formId}:${responseToken}` —
 * `form_response.token` is Typeform's stable unique response id, so the
 * key collapses provider redeliveries (Typeform retries until 2XX with
 * no exactly-once guarantee) AND the per-workflow webhook fan-out
 * (N workflows watching the same form → N deliveries) into a single
 * dispatch round; `dispatchTriggerEvent` then fans out to all rows on
 * `(typeform, new_response_in_form)` and the per-trigger formId filter
 * re-narrows to the right form's workflows. Deliveries missing a `token`
 * fall back to the provider `event_id`, then to `submitted_at` (payload
 * data, not a clock read) so unrelated malformed deliveries never share
 * a key.
 *
 * Payload is a BOUNDED PROJECTION, never a raw spread:
 *   changeKind, formId, responseToken, providerEventId, formTitle,
 *   submittedAt, landedAt, answers[], hidden, score
 * `answers[]` flattens Typeform's discriminated union into
 * `{ fieldId, fieldRef, fieldTitle, fieldType, answerType, value }` with
 * `value` extracted per documented answer type; question titles come
 * from `definition.fields` by field id (the `answers` array contains
 * only ANSWERED questions — positional alignment is never assumed).
 * Unknown/complex answer types (e.g. `payment` — out of slice scope)
 * keep their `answerType` with `value: null` rather than spreading raw
 * provider structure. `response_url` (admin console URL) is deliberately
 * EXCLUDED — provider URLs never become workflow variables.
 *
 * `answers` + `hidden` are free-form respondent content and are marked
 * `sensitive: true` in the trigger meta's payloadShape.
 */

interface TypeformAnswerField {
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

export interface TypeformFormResponsePayload {
  form_id?: string;
  token?: string;
  submitted_at?: string;
  landed_at?: string;
  calculated?: { score?: number };
  hidden?: Record<string, unknown>;
  definition?: {
    id?: string;
    title?: string;
    fields?: Array<{ id?: string; title?: string; ref?: string; type?: string }>;
  };
  answers?: TypeformAnswer[];
}

export interface TypeformWebhookEvent {
  event_id?: string;
  event_type?: string;
  form_response?: TypeformFormResponsePayload;
}

export interface NormalizedTypeformAnswer {
  fieldId: string | null;
  fieldRef: string | null;
  fieldTitle: string | null;
  fieldType: string | null;
  answerType: string | null;
  value: string | number | boolean | null;
}

/** Extract the documented primitive value for one answer entry. */
function extractAnswerValue(answer: TypeformAnswer): string | number | boolean | null {
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
      const all = typeof other === "string" && other.length > 0 ? [...labels, other] : labels;
      return all.length > 0 ? all.join(", ") : null;
    }
    default:
      // Unknown/complex types (payment, …) — keep the answerType, never
      // spread raw provider structure.
      return null;
  }
}

export function normalizeNewResponseInForm(
  ev: TypeformWebhookEvent,
  ctx: { formId: string | null },
): TriggerEvent {
  const response = ev.form_response ?? {};
  const formId = response.form_id ?? ctx.formId ?? null;
  const responseToken = response.token ?? null;
  const providerEventId = ev.event_id ?? null;
  const submittedAt = response.submitted_at ?? null;
  const occurredAt = submittedAt ?? new Date().toISOString();

  const eventId = responseToken
    ? `new_response_in_form:${formId ?? "no-form"}:${responseToken}`
    : providerEventId
      ? `new_response_in_form:${formId ?? "no-form"}:no-token:${providerEventId}`
      : `new_response_in_form:${formId ?? "no-form"}:no-token:${submittedAt ?? "no-timestamp"}`;

  // Question titles by field id — `answers` only carries answered
  // questions, so titles are looked up, never positionally aligned.
  const titlesByFieldId = new Map<string, string>();
  for (const field of response.definition?.fields ?? []) {
    if (typeof field.id === "string" && typeof field.title === "string") {
      titlesByFieldId.set(field.id, field.title);
    }
  }

  const answers: NormalizedTypeformAnswer[] = [];
  for (const answer of response.answers ?? []) {
    const fieldId = answer.field?.id ?? null;
    answers.push({
      fieldId,
      fieldRef: answer.field?.ref ?? null,
      fieldTitle: fieldId ? (titlesByFieldId.get(fieldId) ?? null) : null,
      fieldType: answer.field?.type ?? null,
      answerType: answer.type ?? null,
      value: extractAnswerValue(answer),
    });
  }

  const hidden =
    response.hidden && typeof response.hidden === "object" && !Array.isArray(response.hidden)
      ? response.hidden
      : null;

  return {
    provider: "typeform",
    eventType: "new_response_in_form",
    eventId,
    occurredAt,
    providerAccountId: formId ?? "unknown",
    payload: {
      changeKind: "new_response_in_form",
      formId,
      responseToken,
      providerEventId,
      formTitle: response.definition?.title ?? null,
      submittedAt,
      landedAt: response.landed_at ?? null,
      answers,
      hidden,
      score: typeof response.calculated?.score === "number" ? response.calculated.score : null,
    },
  };
}
