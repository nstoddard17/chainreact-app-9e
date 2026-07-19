import type { WorkflowPlan } from "@/contracts/guidanceSession";
import type { PreviewSetupFieldsByType } from "@/core/workflows/previewSetupFields";

/**
 * Plan-config → guided-preview-setup derivations (REACT-CONFIG-COVERAGE-1).
 *
 * A plan step may now carry `config` — values the USER supplied in their own request, sanitized
 * server-side against registry FieldMeta. These pure helpers key those values by the preview node
 * id (`preview-step-N`, matching `planToDraftPreview`) so the rail's guided-setup card can show
 * and edit them BEFORE Apply. Client-safe: imports contracts/core only; no state, no fetch.
 */

/** Matches `planToDraftPreview`'s preview node ids (1-based over ALL plan steps). */
function planPreviewStepId(index: number): string {
  return `preview-step-${index + 1}`;
}

/**
 * Initial guided-setup values derived from the plan's step `config`, limited to fields the rail
 * card can render with a primitive control so the state stays edit-shaped.
 */
export function buildInitialPreviewConfig(
  plan: WorkflowPlan | null | undefined,
  setupFieldsByType?: PreviewSetupFieldsByType,
): Record<string, Record<string, unknown>> {
  const out: Record<string, Record<string, unknown>> = {};
  if (!plan?.steps) return out;
  plan.steps.forEach((step, i) => {
    const config = step.config;
    if (!config) return;
    const supported = setupFieldsByType?.[`${step.provider}:${step.type}`] ?? [];
    const entry: Record<string, unknown> = {};
    for (const field of supported) {
      const value = config[field.name];
      if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
        entry[field.name] = value;
      }
    }
    if (Object.keys(entry).length > 0) out[planPreviewStepId(i)] = entry;
  });
  return out;
}

/**
 * ALL plan-config values keyed by preview node id, for the setup card's "from your request"
 * visibility (including fields with no supported primitive control).
 */
export function buildPlanPrefilledConfig(
  plan: WorkflowPlan | null | undefined,
): Record<string, Record<string, unknown>> {
  const out: Record<string, Record<string, unknown>> = {};
  if (!plan?.steps) return out;
  plan.steps.forEach((step, i) => {
    if (step.config && Object.keys(step.config).length > 0) {
      out[planPreviewStepId(i)] = { ...step.config };
    }
  });
  return out;
}
