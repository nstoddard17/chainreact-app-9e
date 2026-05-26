"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import type { AiPlanFailure, AiPreview } from "@/lib/api/ai";
import { getWorkflow } from "@/lib/api/workflows";
import { AiBulletList, AiRequiredInputList } from "../ai";
import { useBuilderAi } from "../hooks/useBuilderAi";
import { useGraphSlice } from "../state/graphSlice";

/**
 * Minimal Builder AI assistant panel (Slice 4.AI-11, UX-hardened in 4.AI-11B).
 *
 * A single prompt box + result panel driving the backend plan → preview →
 * confirm → apply loop (AI-9A/9B). NOT a chat product — no thread, no history,
 * no prompt/response persistence. It NEVER calls a model from the client, NEVER
 * auto-applies, NEVER bypasses preview or confirmation, and mutates the workflow
 * ONLY through the AI-9B apply route. It renders a value-free view — no raw patch
 * JSON, config values, secrets, raw model responses, or raw provider errors.
 *
 * AI-11B hardening: clearer per-state copy, a readable "What AI plans to change"
 * preview (counts + risk + risk reasons + cost + errors/warnings, required input
 * shown separately from errors), an explicit risk-acknowledgement gate that
 * resets on every new plan, stale-patch recovery with a one-click re-plan (never
 * auto-reapply), friendly model-unavailable copy, a character counter near the
 * limit, and a clear-result control. The prompt is kept after planning so the
 * user can revise.
 */

const MAX_PROMPT_LENGTH = 8_000;
const COUNTER_THRESHOLD = Math.floor(MAX_PROMPT_LENGTH * 0.8);

export function BuilderAiPanel() {
  const workflowId = useGraphSlice((s) => s.workflowId);
  const hydrate = useGraphSlice((s) => s.hydrate);
  const [prompt, setPrompt] = useState("");
  const [riskAcknowledged, setRiskAcknowledged] = useState(false);

  const ai = useBuilderAi({
    workflowId,
    onApplied: async () => {
      if (!workflowId) return;
      try {
        const detail = await getWorkflow(workflowId);
        hydrate(workflowId, detail.draftDefinition);
      } catch {
        // Best-effort refresh — the apply already succeeded server-side.
      }
    },
  });

  if (!workflowId) return null;

  const trimmed = prompt.trim();
  const planning = ai.status === "planning";
  const applying = ai.status === "applying";
  const busy = planning || applying;
  const tooLong = prompt.length > MAX_PROMPT_LENGTH;
  const canSubmit = trimmed.length > 0 && !tooLong && !busy;

  const plan = ai.planResult;
  const planOk = plan && plan.ok ? plan : null;
  const planFail = plan && !plan.ok ? plan : null;
  const preview = planOk?.preview;
  const requiresConfirmation = preview?.requiresConfirmation === true;
  const applyResult = ai.applyResult;
  const appliedOk = applyResult?.ok === true;

  const showApplyControls =
    !!planOk && planOk.canApplyLater && !!planOk.proposedPatch && !appliedOk;
  const canApply =
    showApplyControls && (!requiresConfirmation || riskAcknowledged) && !applying;
  const hasResult = plan !== null || applyResult !== null || ai.error !== null;

  async function handlePlan(): Promise<void> {
    setRiskAcknowledged(false); // every new plan starts unconfirmed
    await ai.plan(trimmed);
  }

  function handleClear(): void {
    setRiskAcknowledged(false);
    ai.reset();
  }

  return (
    <section
      aria-label="AI assistant"
      data-testid="builder-ai-panel"
      className="flex flex-col gap-3 rounded border border-input bg-card p-3"
    >
      <header className="flex flex-col gap-1">
        <h3 className="text-sm font-medium">AI assistant</h3>
        <p className="text-xs text-muted-foreground">
          Describe a change in plain English — e.g. &ldquo;post a Slack message to
          #alerts when a new email arrives&rdquo;. The AI proposes a preview;
          nothing is applied until you review and confirm.
        </p>
      </header>

      <Textarea
        aria-label="Describe the workflow change"
        data-testid="builder-ai-prompt"
        placeholder="e.g. When a Stripe payment fails, send me a Slack DM"
        value={prompt}
        onChange={(e) => setPrompt(e.target.value)}
        disabled={busy}
        maxLength={MAX_PROMPT_LENGTH + 100}
        aria-invalid={tooLong || undefined}
      />
      {(prompt.length >= COUNTER_THRESHOLD || tooLong) && (
        <p
          data-testid="builder-ai-char-count"
          className={`text-xs ${tooLong ? "text-destructive" : "text-muted-foreground"}`}
        >
          {prompt.length}/{MAX_PROMPT_LENGTH}
          {tooLong ? " — too long, please shorten your request." : ""}
        </p>
      )}

      <div className="flex items-center gap-2">
        <Button
          type="button"
          size="sm"
          onClick={handlePlan}
          disabled={!canSubmit}
          data-testid="builder-ai-plan-button"
        >
          {planning ? "Thinking…" : "Plan with AI"}
        </Button>
        {hasResult && !busy && (
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={handleClear}
            data-testid="builder-ai-clear-button"
          >
            Clear
          </Button>
        )}
      </div>

      {planning && (
        <p role="status" className="text-xs text-muted-foreground" data-testid="builder-ai-planning">
          Planning your change…
        </p>
      )}

      {ai.error && (
        <p role="alert" className="text-xs text-destructive" data-testid="builder-ai-error">
          {ai.error}
        </p>
      )}

      {planFail && <PlanFailure failure={planFail} />}

      {planOk && (
        <div className="flex flex-col gap-2" data-testid="builder-ai-plan-result">
          <p className="text-sm font-medium">{planOk.intentSummary}</p>

          <AiBulletList
            title="Assumptions"
            items={planOk.assumptions}
            testId="builder-ai-assumptions"
          />

          <AiRequiredInputList
            title="More information is needed before this can be built:"
            items={planOk.requiredUserInput}
            testId="builder-ai-needs-input"
            variant="card"
          />

          <AiBulletList
            title="Not supported yet"
            items={planOk.unsupportedRequests}
            testId="builder-ai-unsupported"
          />

          <AiBulletList
            title="Please review"
            items={planOk.safetyNotes}
            testId="builder-ai-safety"
          />

          {preview && <PreviewSection preview={preview} />}

          {!planOk.canApplyLater && planOk.proposedPatch && (
            <p className="text-xs text-muted-foreground" data-testid="builder-ai-not-applyable">
              This plan can&rsquo;t be applied as-is — please adjust your request and try again.
              {planOk.blockedReason ? ` (${planOk.blockedReason})` : ""}
            </p>
          )}

          {showApplyControls && (
            <div className="flex flex-col gap-2">
              {requiresConfirmation && (
                <label className="flex items-start gap-2 text-xs" data-testid="builder-ai-risk-ack">
                  <input
                    type="checkbox"
                    checked={riskAcknowledged}
                    onChange={(e) => setRiskAcknowledged(e.target.checked)}
                    data-testid="builder-ai-risk-ack-checkbox"
                  />
                  <span>
                    I understand this is a{" "}
                    <span className="font-medium">{preview?.riskLevel}-risk</span> change and want
                    to apply it to my workflow.
                  </span>
                </label>
              )}
              <Button
                type="button"
                size="sm"
                variant={requiresConfirmation ? "destructive" : "default"}
                onClick={() => ai.apply()}
                disabled={!canApply}
                data-testid="builder-ai-apply-button"
              >
                {applying ? "Applying…" : requiresConfirmation ? "Confirm & apply" : "Apply change"}
              </Button>
            </div>
          )}
        </div>
      )}

      {applyResult && applyResult.ok && (
        <div className="flex flex-col gap-2" data-testid="builder-ai-apply-success">
          <p role="status" className="text-xs text-emerald-700 dark:text-emerald-400">
            ✓ {applyResult.summaryText}
          </p>
          <div>
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={handleClear}
              data-testid="builder-ai-plan-another-button"
            >
              Plan another change
            </Button>
          </div>
        </div>
      )}

      {applyResult && !applyResult.ok && (
        <div data-testid="builder-ai-apply-failure" className="flex flex-col gap-2">
          <p role="alert" className="text-xs text-destructive">
            {applyResult.code === "STALE_PATCH"
              ? "This workflow changed after the plan was created, so it wasn’t applied. Re-run the plan to work from the latest version."
              : applyResult.code === "CONFIRMATION_REQUIRED"
                ? "This change needs your explicit confirmation before it can be applied."
                : applyResult.message}
          </p>
          {applyResult.code === "STALE_PATCH" && (
            <div>
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={handlePlan}
                disabled={!canSubmit}
                data-testid="builder-ai-rerun-button"
              >
                Re-run plan
              </Button>
            </div>
          )}
        </div>
      )}
    </section>
  );
}

function PlanFailure({ failure }: { failure: AiPlanFailure }) {
  const message =
    failure.code === "MODEL_FAILED"
      ? "The AI assistant isn’t available right now. An administrator may still need to finish setting it up — please try again later."
      : failure.code === "PARSE_FAILED"
        ? failure.errors?.[0]?.code === "NOT_JSON"
          ? "The AI returned text instead of the required JSON plan. Please try again."
          : "The AI returned a plan in the wrong format. Please try again, or add more detail about the apps and steps you want."
        : "Couldn’t preview a plan against this workflow. Please try again.";
  // Value-free diagnostic only (stage + code) — never the raw model output or the
  // detailed parser message, which could echo model-supplied text.
  const detail = failure.errors?.[0];
  return (
    <div role="status" data-testid="builder-ai-plan-failure" className="text-xs text-muted-foreground">
      <p>{message}</p>
      {detail && (
        <p
          data-testid="builder-ai-plan-failure-detail"
          className="mt-1 text-[11px] text-muted-foreground/80"
        >
          Planner error: {detail.stage} / {detail.code}
        </p>
      )}
    </div>
  );
}

function PreviewSection({ preview }: { preview: AiPreview }) {
  const nodeCount = preview.affectedNodeIds?.length ?? 0;
  const edgeCount = preview.affectedEdgeIds?.length ?? 0;
  const errors = preview.validation?.errors ?? [];
  const warnings = preview.validation?.warnings ?? [];
  return (
    <div className="flex flex-col gap-1 rounded border border-input bg-background p-2 text-xs" data-testid="builder-ai-preview">
      <p className="font-medium">What AI plans to change</p>

      {preview.changes && preview.changes.length > 0 ? (
        <ul className="list-disc pl-4 text-muted-foreground" data-testid="builder-ai-changes">
          {preview.changes.map((c, i) => (
            <li key={`${c.op}-${i}`}>{c.description}</li>
          ))}
        </ul>
      ) : (
        <p className="text-muted-foreground">No structural changes detected.</p>
      )}

      {(nodeCount > 0 || edgeCount > 0) && (
        <p className="text-muted-foreground">
          Affects {nodeCount} node(s) and {edgeCount} connection(s).
        </p>
      )}

      <p>
        Risk: <span className="font-medium">{preview.riskLevel}</span>
        {preview.requiresConfirmation ? " · confirmation required" : ""}
      </p>

      {preview.riskReasons && preview.riskReasons.length > 0 && (
        <ul className="list-disc pl-4 text-muted-foreground" data-testid="builder-ai-risk-reasons">
          {preview.riskReasons.map((r, i) => (
            <li key={`${r.code}-${i}`}>{r.message}</li>
          ))}
        </ul>
      )}

      {preview.taskCostEstimate && (
        <p className="text-muted-foreground">
          Estimated cost: ~{preview.taskCostEstimate.estimatedTasksPerRun} task(s) per run.
        </p>
      )}

      {errors.length > 0 && (
        <div data-testid="builder-ai-validation-errors">
          <p className="font-medium text-destructive">Problems to fix:</p>
          <ul className="list-disc pl-4 text-destructive">
            {errors.map((e, i) => (
              <li key={`${e.code}-${i}`}>{e.message}</li>
            ))}
          </ul>
        </div>
      )}

      {warnings.length > 0 && (
        <div data-testid="builder-ai-validation-warnings">
          <p className="font-medium">Warnings:</p>
          <ul className="list-disc pl-4 text-muted-foreground">
            {warnings.map((w, i) => (
              <li key={`${w.code}-${i}`}>{w.message}</li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

