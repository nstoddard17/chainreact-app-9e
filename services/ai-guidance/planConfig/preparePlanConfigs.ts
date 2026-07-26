/**
 * Plan-config preparation (REACT-CONFIG-COVERAGE-1; extracted verbatim from the workflow-guidance
 * route in REACT-AGENT-PREVIEW-FIRST-RELEASE-CLOSEOUT-1 so the route stays a thin HTTP boundary —
 * a pure code move, no behavior change).
 *
 * For one advisory `WorkflowPlan`:
 *   1. rebind sensitive-literal placeholders back to the user's exact values,
 *   2. sanitize every step's config against the node's real FieldMeta (fabricated identity values
 *      are REMOVED, reported via `onWarning` — never saved as if they were real customer data),
 *   3. verify / label-map dynamic option values through the canonical resolvers; a
 *      supplied-but-unusable value becomes a targeted setup input (`requiredInputs` + a safe
 *      warning) — never a silent drop.
 *
 * Warning strings carry field KEYS only — never values, prompts, or identity.
 */

import type { WorkflowPlan } from "@/contracts/guidanceSession";
import {
  rebindSensitiveLiteralsDeep,
  type SensitiveLiteralBinding,
} from "@/core/security/sensitiveLiterals";
import { sanitizePlanStepConfigs } from "./sanitizeProposedConfig";
import { resolveProposedOptionValues } from "./resolveProposedOptionValues";

export interface PreparePlanConfigsInput {
  readonly plan: WorkflowPlan;
  readonly userId: string;
  readonly workflowId?: string;
  /** Request-local bindings from the route's tokenization pass. */
  readonly literalBindings: readonly SensitiveLiteralBinding[];
  /** The user's own normalized words (`buildUserLiteralCorpus`) — the fabricated-value ground truth. */
  readonly userLiteralCorpus: string;
  /** Receives each safe, field-key-only warning line (the route collects them for the response). */
  readonly onWarning: (message: string) => void;
}

/** Sanitize + dynamic-resolve one plan's step configs. Field KEYS only ever reach warnings. */
export async function preparePlanConfigs(input: PreparePlanConfigsInput): Promise<WorkflowPlan> {
  const { userId, workflowId, onWarning } = input;
  const rebound = rebindSensitiveLiteralsDeep(input.plan, input.literalBindings);
  const sanitizeResult = sanitizePlanStepConfigs(rebound, input.userLiteralCorpus);
  const sanitized = sanitizeResult.plan;
  for (const { field } of sanitizeResult.fabricated) {
    // Say what actually happened. "I couldn't set it" would be untrue and would hide that the
    // model had produced a realistic-looking value for real customer data.
    onWarning(
      `I didn't have real data for '${field}', so I left it empty rather than filling in an example value.`,
    );
  }
  const targets = sanitized.steps
    .filter(
      (s): s is typeof s & { config: Readonly<Record<string, unknown>> } =>
        (s.role === "trigger" || s.role === "action") && !!s.config && Object.keys(s.config).length > 0,
    )
    .map((s) => ({
      ref: s.ref,
      kind: s.role as "trigger" | "action",
      capabilityKey: `${s.provider}:${s.type}`,
      config: s.config,
    }));
  if (targets.length === 0) return sanitized;
  const resolved = await resolveProposedOptionValues({
    userId,
    ...(workflowId ? { workflowId } : {}),
    targets,
  });
  const byRef = new Map(resolved.map((r) => [r.ref, r]));
  return {
    ...sanitized,
    steps: sanitized.steps.map((step) => {
      const r = byRef.get(step.ref);
      if (!r) return step;
      for (const field of r.deferredFields) {
        onWarning(`I couldn't set '${field}' automatically — pick it in the step's setup.`);
      }
      const requiredInputs = [...new Set([...(step.requiredInputs ?? []), ...r.deferredFields])];
      const { config: _config, ...rest } = step;
      return {
        ...rest,
        ...(requiredInputs.length > 0 ? { requiredInputs } : {}),
        ...(Object.keys(r.config).length > 0 ? { config: r.config } : {}),
      };
    }),
  };
}
