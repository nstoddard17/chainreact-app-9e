import {
  extractAnswerValue,
  type TypeformAnswer,
} from "@/integrations/_shared/typeform/answers";
import type { TypeformResponseItem } from "@/integrations/_shared/typeform/api/responses";

/**
 * Shared bounded projection for the TYPEFORM-2 read actions
 * (`list_responses` / `get_response`).
 *
 * Mirrors the trigger normalizer's answer flattening (same shared
 * `extractAnswerValue`) with ONE honest difference: Responses API items
 * carry NO `definition` block, so there is no `fieldTitle` here (the
 * webhook payload's titles come from `definition.fields`). A permanently
 * null field would be dishonest metadata — it is omitted instead.
 *
 * Never a raw spread: `metadata` (respondent fingerprint), provider URLs,
 * and unknown provider keys are dropped at the API-wrapper boundary and
 * this projection only reads the narrow item type.
 */

export interface ProjectedTypeformAnswer {
  fieldId: string | null;
  fieldRef: string | null;
  fieldType: string | null;
  answerType: string | null;
  value: string | number | boolean | null;
}

export interface ProjectedTypeformResponse {
  responseToken: string | null;
  submittedAt: string | null;
  landedAt: string | null;
  answers: ProjectedTypeformAnswer[];
  hidden: Record<string, unknown> | null;
  score: number | null;
}

function projectAnswer(answer: TypeformAnswer): ProjectedTypeformAnswer {
  return {
    fieldId: answer.field?.id ?? null,
    fieldRef: answer.field?.ref ?? null,
    fieldType: answer.field?.type ?? null,
    answerType: answer.type ?? null,
    value: extractAnswerValue(answer),
  };
}

export function projectResponse(
  item: TypeformResponseItem,
): ProjectedTypeformResponse {
  return {
    responseToken: item.token ?? null,
    submittedAt: item.submitted_at ?? null,
    landedAt: item.landed_at ?? null,
    answers: (item.answers ?? []).map(projectAnswer),
    hidden: item.hidden ?? null,
    score:
      typeof item.calculated?.score === "number" ? item.calculated.score : null,
  };
}
