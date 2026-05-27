import { useCallback, useState } from "react";
import {
  AiApiError,
  applyWorkflowPatch,
  planWorkflow,
  type AiApplyConfirmation,
  type AiApplyResult,
  type AiPlanResult,
  type CurrentGraphSnapshot,
} from "@/lib/api/ai";
import {
  composeFollowUpPrompt,
  type RequiredInputAnswer,
} from "@/features/workflow-builder/ai";

/**
 * Plan → preview → confirm → apply state machine for the Builder AI panel
 * (Slice 4.AI-11; follow-up conversational state added in Slice 4.AI-21).
 *
 * Wraps the `lib/api/ai` client. NEVER calls a model directly, NEVER mutates the
 * workflow except via the AI-9B apply route, and NEVER auto-applies (the panel
 * must call `apply()` from an explicit user action). Confirmation is attached
 * only when the deterministic preview says `requiresConfirmation`, carrying the
 * preview's recomputed risk level (never a client-invented one).
 *
 * Slice 4.AI-21 — session-local follow-up state. When a planner response has
 * unresolved `requiredUserInput`, the panel can call `submitFollowUp(answer)`
 * to send a reconstructed prompt (original + asked labels + prior answers +
 * the new answer) back through the normal `planWorkflow` path. Nothing is
 * persisted server-side; the chain lives only in this hook's state and is
 * cleared on `reset()`, a fresh `plan()`, or chain completion (a response
 * with empty `requiredUserInput`).
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

/**
 * AI-22 — structured input to `submitFollowUp`. Either field may be
 * empty individually, but at least one of them must contribute a value;
 * a call with `freeText: ""` AND empty `structuredAnswers` is a no-op.
 */
export interface SubmitFollowUpInput {
  readonly freeText?: string;
  readonly structuredAnswers?: readonly RequiredInputAnswer[];
}

/**
 * Slice 4.AI-24 — per-call options for `plan` / `submitFollowUp`. The
 * `currentGraph` snapshot is the user's pending / unsaved builder canvas
 * (graphSlice's pending*) — the planner needs it so a fresh prompt issued
 * after the user deleted nodes locally without saving doesn't see the
 * stale server `draftDefinition`. Forwarded verbatim to the plan route.
 */
export interface BuilderAiCallOptions {
  readonly currentGraph?: CurrentGraphSnapshot;
}

export interface UseBuilderAi {
  readonly status: BuilderAiStatus;
  readonly planResult: AiPlanResult | null;
  readonly applyResult: AiApplyResult | null;
  /** Transport/auth error message (401/404/500) — never a raw provider error. */
  readonly error: string | null;
  /**
   * True when the panel should treat the next submit as a follow-up answer to
   * a prior plan that returned unresolved `requiredUserInput`. Derived from
   * internal chain state (`originalPrompt !== null`). Cleared on reset / fresh
   * plan / chain completion.
   */
  readonly followUpMode: boolean;
  /**
   * Run a fresh plan request. Returns the resulting `AiPlanResult` on a
   * successful round-trip (incl. handled failures like `PARSE_FAILED`), or
   * `null` when the transport itself failed (the hook sets `error` in that
   * case). The chat-layout panel uses the return value to append an
   * assistant message in lockstep with the user message (Slice 4.AI-21B).
   */
  plan(
    prompt: string,
    modelTier?: "fast" | "strong",
    options?: BuilderAiCallOptions,
  ): Promise<AiPlanResult | null>;
  /**
   * Submit a follow-up answer for the in-progress required-input chain.
   * Reconstructs the planner prompt internally (original + asked labels +
   * prior answers + this answer) and routes through the standard plan path.
   * No-op when there is no in-progress chain or no unresolved questions on
   * the latest plan. Returns the resulting `AiPlanResult` on success, or
   * `null` on transport failure or when the no-op guards refuse the call.
   *
   * Accepts EITHER a free-text string (legacy AI-21 shape) OR a structured
   * `{ freeText?, structuredAnswers? }` object (AI-22) carrying answers
   * collected from the interactive `RequiredInputControl`s. Both end up
   * inside `composeFollowUpPrompt` so the model sees them together.
   */
  submitFollowUp(
    answer: string | SubmitFollowUpInput,
    modelTier?: "fast" | "strong",
    options?: BuilderAiCallOptions,
  ): Promise<AiPlanResult | null>;
  /**
   * Run the apply call against the latest plan's `proposedPatch`. Returns
   * the `AiApplyResult` on a successful round-trip (incl. handled failures
   * like `STALE_PATCH`), or `null` when the transport failed or the guards
   * refused (no current apply-ready plan).
   */
  apply(): Promise<AiApplyResult | null>;
  reset(): void;
}

function friendlyError(err: unknown, fallback: string): string {
  if (err instanceof AiApiError) {
    if (err.status === 401) return "Please sign in to use the AI assistant.";
    if (err.status === 404) return "This workflow couldn’t be found.";
  }
  return fallback;
}

/**
 * Whether a planner result represents an in-progress chain (the AI asked for
 * more information). Used to decide whether to start / extend / complete a
 * follow-up chain.
 */
function planNeedsMoreInput(result: AiPlanResult): boolean {
  return result.ok === true && result.requiredUserInput.length > 0;
}

export function useBuilderAi({
  workflowId,
  onApplied,
}: UseBuilderAiOptions): UseBuilderAi {
  const [status, setStatus] = useState<BuilderAiStatus>("idle");
  const [planResult, setPlanResult] = useState<AiPlanResult | null>(null);
  const [applyResult, setApplyResult] = useState<AiApplyResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  // Slice 4.AI-21 — session-local follow-up chain. `originalPrompt` is the
  // first prompt of the chain; `priorFollowUpAnswers` accumulates answers from
  // prior follow-up turns within the same chain. Both are cleared on
  // `reset()`, a fresh `plan()`, or chain completion (response with empty
  // requiredUserInput).
  const [originalPrompt, setOriginalPrompt] = useState<string | null>(null);
  const [priorFollowUpAnswers, setPriorFollowUpAnswers] = useState<readonly string[]>([]);

  const plan = useCallback<UseBuilderAi["plan"]>(
    async (prompt, modelTier, options) => {
      if (!workflowId) return null;
      setStatus("planning");
      setError(null);
      setPlanResult(null);
      setApplyResult(null);
      // Fresh prompts always start a new chain — clear any prior follow-up state.
      setOriginalPrompt(null);
      setPriorFollowUpAnswers([]);
      try {
        const result = await planWorkflow(workflowId, {
          prompt,
          ...(modelTier ? { modelTier } : {}),
          // AI-24 — forward current-canvas snapshot when provided.
          ...(options?.currentGraph ? { currentGraph: options.currentGraph } : {}),
        });
        setPlanResult(result);
        setStatus("planned");
        // Start a new chain if the response asked for more info.
        if (planNeedsMoreInput(result)) {
          setOriginalPrompt(prompt);
        }
        return result;
      } catch (err) {
        setError(friendlyError(err, "The AI assistant is unavailable right now."));
        setStatus("idle");
        return null;
      }
    },
    [workflowId],
  );

  const submitFollowUp = useCallback<UseBuilderAi["submitFollowUp"]>(
    async (answer, modelTier, options) => {
      if (!workflowId) return null;
      // Guard: there must be an in-progress chain with outstanding questions
      // on the latest plan. If not, the panel should be calling `plan()`.
      if (!originalPrompt) return null;
      if (!planResult || !planResult.ok || planResult.requiredUserInput.length === 0) {
        return null;
      }
      // AI-22 — normalize to {freeText, structuredAnswers}. Legacy string-only
      // callers stay equivalent to `{ freeText: <string> }`.
      const normalized: SubmitFollowUpInput =
        typeof answer === "string"
          ? { freeText: answer }
          : answer;
      const freeText = (normalized.freeText ?? "").trim();
      const structuredAnswers = normalized.structuredAnswers ?? [];
      // No-op when both inputs are empty after trim.
      if (freeText.length === 0 && structuredAnswers.length === 0) return null;

      const requiredInputLabels = planResult.requiredUserInput.map((r) => r.label);
      const reconstructed = composeFollowUpPrompt({
        originalPrompt,
        requiredInputLabels,
        priorFollowUpAnswers,
        followUp: freeText,
        structuredAnswers: structuredAnswers.map((a) => ({
          label: a.descriptor.fieldLabel ?? a.descriptor.label,
          display: a.display,
          ...(a.value !== undefined ? { value: a.value } : {}),
        })),
      });
      // Single per-turn summary string for the prior-answers history.
      // Mixes free-text and the most-meaningful display value(s) so subsequent
      // turns can cite them succinctly without re-attaching the full structure.
      const turnSummary = [
        freeText,
        ...structuredAnswers.map((a) => {
          const fieldLabel = a.descriptor.fieldLabel ?? a.descriptor.label;
          return `${fieldLabel}: ${a.display}`;
        }),
      ]
        .filter((s) => s.length > 0)
        .join(" / ");

      setStatus("planning");
      setError(null);
      setApplyResult(null);
      try {
        const result = await planWorkflow(workflowId, {
          prompt: reconstructed,
          ...(modelTier ? { modelTier } : {}),
          // AI-24 — forward current-canvas snapshot on follow-up too.
          ...(options?.currentGraph ? { currentGraph: options.currentGraph } : {}),
        });
        // Slice 4.AI-25 — preserve chain on ANY structured planner failure
        // during a follow-up turn. RATE_LIMITED / PARSE_FAILED /
        // PREVIEW_UNAVAILABLE / NETWORK_ERROR / TIMEOUT (all wrapped as
        // MODEL_FAILED) and structural ok:false responses are all treated
        // as retryable — the user shouldn't lose the original prompt, prior
        // follow-up answers, or the in-flight needs-input question just
        // because the planner round-trip failed. We also DO NOT overwrite
        // `planResult` with the failure shape; keeping the prior needs-input
        // plan in state means the chat's latest plan_result message (and
        // its interactive controls) remain visible. The panel layer
        // (BuilderAiPanel.handleSubmit) detects the `null` return and
        // restores composer text + staged required-input answers so the
        // user can retry without re-typing or re-selecting.
        if (!result.ok) {
          setStatus("planned");
          return null;
        }
        setPlanResult(result);
        setStatus("planned");
        if (planNeedsMoreInput(result)) {
          // Chain continues — remember this turn's summary for the next turn
          // so the model can see the full set of prior responses.
          setPriorFollowUpAnswers((prev) => [...prev, turnSummary]);
        } else {
          // ok:true && requiredUserInput.length === 0 → chain genuinely
          // complete. Drop chain state so the next prompt is treated as
          // fresh; the user can apply this plan or start a new request.
          setOriginalPrompt(null);
          setPriorFollowUpAnswers([]);
        }
        return result;
      } catch (err) {
        // Transport failure — same chain-preservation contract as the
        // ok:false branch above (AI-25). The user can retry the same
        // follow-up answer; chain state, prior planResult, and the
        // panel's composer + staged answers all survive.
        setError(friendlyError(err, "The AI assistant is unavailable right now."));
        setStatus("idle");
        return null;
      }
    },
    [workflowId, originalPrompt, planResult, priorFollowUpAnswers],
  );

  const apply = useCallback<UseBuilderAi["apply"]>(async () => {
    if (!workflowId) return null;
    // Guard: only an apply-ready plan with a proposed patch may be applied.
    if (!planResult || !planResult.ok || !planResult.proposedPatch || !planResult.canApplyLater) {
      return null;
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
      return result;
    } catch (err) {
      setError(friendlyError(err, "Couldn’t apply the change. Please try again."));
      setStatus("planned");
      return null;
    }
  }, [workflowId, planResult, onApplied]);

  const reset = useCallback(() => {
    setStatus("idle");
    setPlanResult(null);
    setApplyResult(null);
    setError(null);
    setOriginalPrompt(null);
    setPriorFollowUpAnswers([]);
  }, []);

  return {
    status,
    planResult,
    applyResult,
    error,
    followUpMode: originalPrompt !== null,
    plan,
    submitFollowUp,
    apply,
    reset,
  };
}
