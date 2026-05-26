"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { getWorkflow } from "@/lib/api/workflows";
import { AiBulletList, AiRequiredInputList } from "../ai";
import { useBuilderAi } from "../hooks/useBuilderAi";
import { useGraphSlice } from "../state/graphSlice";
import {
  PlanFailure,
  PreviewSection,
} from "./_BuilderAiPanelPreview";

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

  // Slice 4.AI-20 — Apply-readiness gate. `showApplyControls` requires the
  // service to have flagged `canApplyLater: true` AND for there to be no
  // outstanding `requiredUserInput`. The service-side gate
  // (planWorkflowFromPrompt) already coerces canApplyLater→false when
  // requiredUserInput is non-empty; this UI check is belt-and-suspenders
  // so a future contract drift can't re-surface the live-smoke bug (Apply
  // enabled while "More information is needed" was rendered).
  const requiredInputCount = planOk?.requiredUserInput.length ?? 0;
  const hasUnresolvedRequiredInput = requiredInputCount > 0;
  const showApplyControls =
    !!planOk &&
    planOk.canApplyLater &&
    !!planOk.proposedPatch &&
    !hasUnresolvedRequiredInput &&
    !appliedOk;
  const canApply =
    showApplyControls && (!requiresConfirmation || riskAcknowledged) && !applying;
  // A patch was generated but the AI flagged outstanding required input —
  // render a guidance callout instead of an Apply button.
  const showRequiredInputBlock =
    !!planOk && !!planOk.proposedPatch && hasUnresolvedRequiredInput && !appliedOk;
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
      className="flex flex-col gap-3"
      style={{ color: "var(--builder-text)" }}
    >
      <p
        className="px-1 text-[11.5px] leading-relaxed"
        style={{ color: "var(--builder-muted)" }}
      >
        Describe a change in plain English — e.g. &ldquo;post a Slack message
        to #alerts when a new email arrives&rdquo;. The agent proposes a
        preview; nothing is applied until you review and confirm.
      </p>

      <div
        className="flex flex-col gap-0 rounded-md"
        style={{
          background: "var(--builder-panel-2)",
          border: "1px solid var(--builder-border)",
        }}
      >
        <Textarea
          aria-label="Describe the workflow change"
          data-testid="builder-ai-prompt"
          placeholder="Describe a change — e.g. ‘retry once on 5xx, then DM #oncall’"
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          disabled={busy}
          maxLength={MAX_PROMPT_LENGTH + 100}
          aria-invalid={tooLong || undefined}
          rows={3}
          className="resize-none border-0 bg-transparent text-[12.5px] leading-[1.45] shadow-none focus-visible:ring-0"
        />
        <div
          className="flex items-center justify-between gap-2 px-2 pb-2 pt-1"
          style={{ borderTop: "0" }}
        >
          <span
            className="builder-mono text-[10.5px]"
            style={{ color: "var(--builder-muted)" }}
          >
            <kbd
              className="rounded-[3px] px-1.5 py-px text-[9.5px]"
              style={{
                background: "var(--builder-panel)",
                border: "1px solid var(--builder-border)",
                color: "var(--builder-muted)",
              }}
            >
              ⌘
            </kbd>
            <kbd
              className="ml-0.5 rounded-[3px] px-1.5 py-px text-[9.5px]"
              style={{
                background: "var(--builder-panel)",
                border: "1px solid var(--builder-border)",
                color: "var(--builder-muted)",
              }}
            >
              ↵
            </kbd>
            <span className="ml-1.5">plan</span>
          </span>
          <Button
            type="button"
            size="sm"
            onClick={handlePlan}
            disabled={!canSubmit}
            data-testid="builder-ai-plan-button"
            className="h-7 px-2.5 text-[12px]"
            style={{
              background: "var(--builder-text)",
              color: "var(--builder-panel)",
              border: "1px solid var(--builder-text)",
            }}
          >
            {planning ? "Thinking…" : "Plan with AI"}
          </Button>
        </div>
      </div>

      {(prompt.length >= COUNTER_THRESHOLD || tooLong) && (
        <p
          data-testid="builder-ai-char-count"
          className="builder-mono px-1 text-[11px]"
          style={{
            color: tooLong ? "var(--builder-danger)" : "var(--builder-muted)",
          }}
        >
          {prompt.length}/{MAX_PROMPT_LENGTH}
          {tooLong ? " — too long, please shorten your request." : ""}
        </p>
      )}

      {hasResult && !busy ? (
        <div>
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={handleClear}
            data-testid="builder-ai-clear-button"
            className="h-7 px-2.5 text-[12px]"
          >
            Clear
          </Button>
        </div>
      ) : null}

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

          {showRequiredInputBlock && (
            <p
              className="text-xs"
              data-testid="builder-ai-required-input-block"
              role="status"
              style={{ color: "var(--builder-warn)" }}
            >
              The agent drafted a plan, but {requiredInputCount === 1 ? "one detail is" : "some details are"} still
              missing. Provide the missing details above, then run{" "}
              <span className="font-medium">Plan with AI</span> again — the agent
              won&rsquo;t apply an incomplete patch.
            </p>
          )}

          {!planOk.canApplyLater &&
            !hasUnresolvedRequiredInput &&
            planOk.proposedPatch && (
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



