import type { AiPlanResult } from "@/lib/api/ai";
import type { RequiredInputAnswer } from "./RequiredInputControl";

/**
 * Slice 4.AI-35B — decide whether a required-input follow-up can be completed
 * DETERMINISTICALLY (drop the user's staged answers straight into the pending
 * patch's known config fields, no model call) or must go through the model
 * planner.
 *
 * Pure + client-side: it only decides WHICH path to take; the server's
 * `completePlanWithRequiredInputs` is the authority that actually builds +
 * previews the patch (and may still bounce back to re-plan).
 *
 * Deterministic ONLY when ALL hold (otherwise the model planner runs):
 *   - no free-text was typed (free text may be a new natural-language change),
 *   - the plan is a success,
 *   - every BLOCKING required input (kind !== select_integration) is single-
 *     valued (not multi-select), of a STRING-scalar renderer type, has a
 *     matching staged answer, AND is either field-specific (nodeId + field) OR
 *     a bare `config_value` the SERVER can map against the pending patch.
 * A `provider_choice` (no field) → re-plan, because resolving it changes the
 * trigger/action shape, which only the planner can build safely.
 *
 * Slice 4.AI-35E — the deterministic route drops the answer verbatim into the
 * patch config as a STRING (or string[] for multi). That is correct only for
 * string-scalar fields (text / textarea / select / combobox / cron). A
 * `number` / `boolean` / array / object field needs a correctly-TYPED value, so
 * those fall through to the model planner, which builds the config with the
 * right shape. Multi-select already bounces to the planner on `multiple`.
 *
 * Slice 4.AI-35F — a rendered required TEXT control whose entry is BARE (no
 * `nodeId`/`field` — e.g. a null-patch plan emitted "What should the message
 * say?" with no node identity) is NOT rejected client-side anymore. As long as
 * the plan carries a `proposedPatch`, the answer is forwarded WITHOUT a target
 * and the server (`completePlanWithRequiredInputs`) infers the unique missing
 * required text field from the patch metadata. A bare answer with NO patch to
 * infer against → re-plan (`no_target_node`). The server still returns
 * `NEEDS_REPLAN` (ambiguous_target / no_target_node) when it can't map safely.
 */

export interface ResolvedRequiredInputAnswer {
  /** Target node id. Absent for a bare answer the server must infer (AI-35F). */
  readonly nodeId?: string;
  /** Target config field. Absent for a bare answer the server must infer (AI-35F). */
  readonly field?: string;
  readonly value: string;
  readonly multiple?: boolean;
}

export type DeterministicCompletionDecision =
  | { readonly mode: "deterministic"; readonly answers: readonly ResolvedRequiredInputAnswer[] }
  | { readonly mode: "model_replan"; readonly reason: string };

/**
 * Renderer types whose value is a single string the completion route can write
 * verbatim into the patch config. Anything else (number / boolean / arrays /
 * objects) needs a correctly-typed value, so it routes through the model.
 * `undefined` fieldType (pre-enrichment / null-patch bare entries) is treated
 * as string-scalar — the legacy free-text behavior.
 */
const STRING_SCALAR_FIELD_TYPES: ReadonlySet<string> = new Set([
  "text",
  "textarea",
  "select",
  "combobox",
  "cron",
]);

export function evaluateDeterministicCompletion(
  planResult: AiPlanResult | null,
  structuredAnswers: readonly RequiredInputAnswer[],
  freeText: string,
): DeterministicCompletionDecision {
  if (freeText.trim().length > 0) {
    return { mode: "model_replan", reason: "free_text_present" };
  }
  if (!planResult || !planResult.ok) {
    return { mode: "model_replan", reason: "no_plan" };
  }

  const blocking = planResult.requiredUserInput.filter((r) => r.kind !== "select_integration");
  if (blocking.length === 0) {
    return { mode: "model_replan", reason: "no_blocking_inputs" };
  }
  if (blocking.some((r) => r.kind === "provider_choice")) {
    return { mode: "model_replan", reason: "provider_choice_requires_replan" };
  }

  // Index staged answers by their stable control key (`requiredInputKey`):
  // `${nodeId}::${field}` for field-specific entries, `label::<label>` for bare
  // ones. Mirrors `requiredInputKey` (kept inline to avoid importing the React
  // component into this pure module / its node-env test).
  const byKey = new Map<string, RequiredInputAnswer>();
  for (const a of structuredAnswers) byKey.set(a.key, a);
  const keyOf = (e: { nodeId?: string; field?: string; label: string }): string =>
    e.nodeId && e.field ? `${e.nodeId}::${e.field}` : `label::${e.label}`;

  const answers: ResolvedRequiredInputAnswer[] = [];
  for (const entry of blocking) {
    if (entry.multiple === true) {
      return { mode: "model_replan", reason: "multi_value_field" };
    }
    // Non-string-scalar fields (number / boolean / arrays / objects) need a
    // correctly-typed config value — let the model build it (AI-35E).
    if (entry.fieldType !== undefined && !STRING_SCALAR_FIELD_TYPES.has(entry.fieldType)) {
      return { mode: "model_replan", reason: "non_string_field" };
    }
    const answer = byKey.get(keyOf(entry));
    // Slice 4.AI-35G — a picker-backed field (static `options` or a dynamic
    // `optionsSource` resolver) stores an OPTION VALUE (e.g. a Slack channel
    // id), not the display label. Deterministic completion must use the
    // SELECTED `value`, never a free-text `display`; a free-text-only answer
    // (the user typed instead of picking) would write a label where an id is
    // required → re-plan so the model can resolve it safely.
    const isPickerField = (entry.options?.length ?? 0) > 0 || !!entry.optionsSource;
    const value = isPickerField ? answer?.value : (answer?.value ?? answer?.display);
    if (value === undefined || value.trim().length === 0) {
      return {
        mode: "model_replan",
        reason: isPickerField ? "picker_requires_option" : "missing_answer",
      };
    }
    // Multi-select entries already returned model_replan above, so every
    // answer reaching here is single-valued.
    if (entry.nodeId && entry.field) {
      answers.push({ nodeId: entry.nodeId, field: entry.field, value });
    } else {
      // Bare config_value (no node/field identity, e.g. a null-patch plan's
      // "What should the message say?"). The server can only map it against a
      // pending patch's metadata — forward it untargeted (AI-35F). With no
      // patch there is nothing to infer against → re-plan.
      if (!planResult.proposedPatch) {
        return { mode: "model_replan", reason: "no_target_node" };
      }
      answers.push({ value });
    }
  }

  return { mode: "deterministic", answers };
}
