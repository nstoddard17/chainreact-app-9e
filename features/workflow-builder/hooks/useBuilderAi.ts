import { useCallback, useState } from "react";
import {
  AiApiError,
  applyWorkflowPatch,
  planWorkflow,
  type AiApplyConfirmation,
  type AiApplyResult,
  type AiPlanResult,
} from "@/lib/api/ai";

/**
 * Plan → preview → confirm → apply state machine for the Builder AI panel
 * (Slice 4.AI-11).
 *
 * Wraps the `lib/api/ai` client. NEVER calls a model directly, NEVER mutates the
 * workflow except via the AI-9B apply route, and NEVER auto-applies (the panel
 * must call `apply()` from an explicit user action). Confirmation is attached
 * only when the deterministic preview says `requiresConfirmation`, carrying the
 * preview's recomputed risk level (never a client-invented one).
 */

export type BuilderAiStatus =
  | "idle"
  | "planning"
  | "planned"
  | "applying"
  | "applied";

export interface UseBuilderAiOptions {
  readonly workflowId: string | null;
  /** Called after a successful apply so the parent can refresh Builder state. */
  readonly onApplied?: () => void | Promise<void>;
}

export interface UseBuilderAi {
  readonly status: BuilderAiStatus;
  readonly planResult: AiPlanResult | null;
  readonly applyResult: AiApplyResult | null;
  /** Transport/auth error message (401/404/500) — never a raw provider error. */
  readonly error: string | null;
  plan(prompt: string, modelTier?: "fast" | "strong"): Promise<void>;
  apply(): Promise<void>;
  reset(): void;
}

function friendlyError(err: unknown, fallback: string): string {
  if (err instanceof AiApiError) {
    if (err.status === 401) return "Please sign in to use the AI assistant.";
    if (err.status === 404) return "This workflow couldn’t be found.";
  }
  return fallback;
}

export function useBuilderAi({
  workflowId,
  onApplied,
}: UseBuilderAiOptions): UseBuilderAi {
  const [status, setStatus] = useState<BuilderAiStatus>("idle");
  const [planResult, setPlanResult] = useState<AiPlanResult | null>(null);
  const [applyResult, setApplyResult] = useState<AiApplyResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const plan = useCallback(
    async (prompt: string, modelTier?: "fast" | "strong") => {
      if (!workflowId) return;
      setStatus("planning");
      setError(null);
      setPlanResult(null);
      setApplyResult(null);
      try {
        const result = await planWorkflow(workflowId, {
          prompt,
          ...(modelTier ? { modelTier } : {}),
        });
        setPlanResult(result);
        setStatus("planned");
      } catch (err) {
        setError(friendlyError(err, "The AI assistant is unavailable right now."));
        setStatus("idle");
      }
    },
    [workflowId],
  );

  const apply = useCallback(async () => {
    if (!workflowId) return;
    // Guard: only an apply-ready plan with a proposed patch may be applied.
    if (!planResult || !planResult.ok || !planResult.proposedPatch || !planResult.canApplyLater) {
      return;
    }
    const requiresConfirmation = planResult.preview?.requiresConfirmation === true;
    const confirmation: AiApplyConfirmation | undefined = requiresConfirmation
      ? {
          confirmed: true,
          ...(planResult.preview?.riskLevel ? { acceptedRiskLevel: planResult.preview.riskLevel } : {}),
          acceptedAt: new Date().toISOString(),
        }
      : undefined;

    setStatus("applying");
    setError(null);
    setApplyResult(null);
    try {
      const result = await applyWorkflowPatch(workflowId, {
        patch: planResult.proposedPatch,
        ...(confirmation ? { confirmation } : {}),
      });
      setApplyResult(result);
      setStatus("applied");
      if (result.ok && onApplied) await onApplied();
    } catch (err) {
      setError(friendlyError(err, "Couldn’t apply the change. Please try again."));
      setStatus("planned");
    }
  }, [workflowId, planResult, onApplied]);

  const reset = useCallback(() => {
    setStatus("idle");
    setPlanResult(null);
    setApplyResult(null);
    setError(null);
  }, []);

  return { status, planResult, applyResult, error, plan, apply, reset };
}
