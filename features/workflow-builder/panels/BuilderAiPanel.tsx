"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { getWorkflow } from "@/lib/api/workflows";
import { useBuilderAi } from "../hooks/useBuilderAi";
import { useGraphSlice } from "../state/graphSlice";

/**
 * Minimal Builder AI assistant panel (Slice 4.AI-11).
 *
 * The first user-facing AI surface: a single prompt box + result panel that
 * drives the backend plan → preview → confirm → apply loop:
 *   1. POST /api/workflows/[id]/ai/plan  (preview-only)
 *   2. user reviews the preview
 *   3. user explicitly confirms a high-risk/destructive change
 *   4. POST /api/workflows/[id]/ai/apply (confirmed apply)
 *
 * This is NOT a chat product — no thread, no history, no persistence. It NEVER
 * calls a model from the client, NEVER auto-applies, NEVER bypasses preview or
 * confirmation, and mutates the workflow ONLY through the AI-9B apply route.
 * It renders a value-free view — no raw patch JSON, no config values, no secrets.
 * After a successful apply it refreshes Builder state via the existing
 * `graphSlice.hydrate` pattern (re-fetch the saved definition).
 */

const MAX_PROMPT_LENGTH = 8_000;

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
  const canApply =
    !!planOk &&
    planOk.canApplyLater &&
    !!planOk.proposedPatch &&
    (!requiresConfirmation || riskAcknowledged) &&
    !applying;

  const applyResult = ai.applyResult;

  async function handlePlan(): Promise<void> {
    setRiskAcknowledged(false);
    await ai.plan(trimmed);
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
          Describe a change in plain English. The AI proposes a preview — nothing
          is applied until you review and confirm.
        </p>
      </header>

      <Textarea
        aria-label="Describe the workflow change"
        data-testid="builder-ai-prompt"
        placeholder="e.g. Post a Slack message to #alerts when a new email arrives"
        value={prompt}
        onChange={(e) => setPrompt(e.target.value)}
        disabled={busy}
        maxLength={MAX_PROMPT_LENGTH + 100}
      />
      {tooLong && (
        <p role="alert" className="text-xs text-destructive">
          That request is too long. Please shorten it.
        </p>
      )}

      <div className="flex items-center gap-3">
        <Button
          type="button"
          size="sm"
          onClick={handlePlan}
          disabled={!canSubmit}
          data-testid="builder-ai-plan-button"
        >
          {planning ? "Thinking…" : "Plan with AI"}
        </Button>
      </div>

      {ai.error && (
        <p role="alert" className="text-xs text-destructive" data-testid="builder-ai-error">
          {ai.error}
        </p>
      )}

      {/* ── Plan failure (model unavailable / parse / preview) ── */}
      {planFail && (
        <div role="status" data-testid="builder-ai-plan-failure" className="text-xs text-muted-foreground">
          {planFail.code === "MODEL_FAILED"
            ? "The AI assistant isn’t available right now. An administrator may need to finish setting it up."
            : planFail.code === "PARSE_FAILED"
              ? "The AI couldn’t produce a usable plan. Try rephrasing your request."
              : "Couldn’t preview a plan against this workflow."}
        </div>
      )}

      {/* ── Plan success ── */}
      {planOk && (
        <div className="flex flex-col gap-2" data-testid="builder-ai-plan-result">
          <p className="text-sm">{planOk.intentSummary}</p>

          {planOk.assumptions.length > 0 && (
            <DetailList title="Assumptions" items={planOk.assumptions} testid="builder-ai-assumptions" />
          )}

          {planOk.requiredUserInput.length > 0 && (
            <div data-testid="builder-ai-needs-input" className="text-xs">
              <p className="font-medium">More information needed before this can be built:</p>
              <ul className="list-disc pl-4 text-muted-foreground">
                {planOk.requiredUserInput.map((r, i) => (
                  <li key={`${r.label}-${i}`}>{r.label}</li>
                ))}
              </ul>
            </div>
          )}

          {planOk.unsupportedRequests.length > 0 && (
            <DetailList
              title="Not supported yet"
              items={planOk.unsupportedRequests}
              testid="builder-ai-unsupported"
            />
          )}

          {planOk.safetyNotes.length > 0 && (
            <DetailList title="Please review" items={planOk.safetyNotes} testid="builder-ai-safety" />
          )}

          {preview && (
            <div className="flex flex-col gap-1 text-xs" data-testid="builder-ai-preview">
              <p>
                Risk: <span className="font-medium">{preview.riskLevel}</span>
                {preview.requiresConfirmation ? " · confirmation required" : ""}
              </p>
              {preview.taskCostEstimate && (
                <p>Estimated cost: ~{preview.taskCostEstimate.estimatedTasksPerRun} task(s) per run.</p>
              )}
              {(preview.affectedNodeIds?.length || preview.affectedEdgeIds?.length) && (
                <p>
                  Affects {preview.affectedNodeIds?.length ?? 0} node(s),{" "}
                  {preview.affectedEdgeIds?.length ?? 0} connection(s).
                </p>
              )}
              {preview.changes && preview.changes.length > 0 && (
                <ul className="list-disc pl-4 text-muted-foreground">
                  {preview.changes.map((c, i) => (
                    <li key={`${c.op}-${i}`}>{c.description}</li>
                  ))}
                </ul>
              )}
              {preview.validation && preview.validation.errors.length > 0 && (
                <ul className="list-disc pl-4 text-destructive" data-testid="builder-ai-validation-errors">
                  {preview.validation.errors.map((e, i) => (
                    <li key={`${e.code}-${i}`}>{e.message}</li>
                  ))}
                </ul>
              )}
            </div>
          )}

          {/* Not apply-ready */}
          {!planOk.canApplyLater && planOk.proposedPatch && (
            <p className="text-xs text-muted-foreground" data-testid="builder-ai-not-applyable">
              This plan can’t be applied as-is. {planOk.blockedReason ?? preview?.blockedReason ?? ""}
            </p>
          )}

          {/* Apply-ready */}
          {planOk.canApplyLater && planOk.proposedPatch && (
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
                    I understand this is a {preview?.riskLevel}-risk change and want to apply it.
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
                {applying ? "Applying…" : "Apply change"}
              </Button>
            </div>
          )}
        </div>
      )}

      {/* ── Apply outcome ── */}
      {applyResult && applyResult.ok && (
        <p role="status" className="text-xs text-muted-foreground" data-testid="builder-ai-apply-success">
          {applyResult.summaryText}
        </p>
      )}
      {applyResult && !applyResult.ok && (
        <p role="alert" className="text-xs text-destructive" data-testid="builder-ai-apply-failure">
          {applyResult.code === "STALE_PATCH"
            ? "This workflow changed since the plan was created. Run “Plan with AI” again and re-apply."
            : applyResult.code === "CONFIRMATION_REQUIRED"
              ? "This change needs your confirmation before it can be applied."
              : applyResult.message}
        </p>
      )}
    </section>
  );
}

function DetailList({
  title,
  items,
  testid,
}: {
  title: string;
  items: readonly string[];
  testid: string;
}) {
  return (
    <div className="text-xs" data-testid={testid}>
      <p className="font-medium">{title}</p>
      <ul className="list-disc pl-4 text-muted-foreground">
        {items.map((item, i) => (
          <li key={`${item}-${i}`}>{item}</li>
        ))}
      </ul>
    </div>
  );
}
