"use client";

import { useState } from "react";
import type { WorkflowPlan } from "@/contracts/guidanceSession";
import type { DraftPreview } from "@/contracts/workflowPlanPreview";
import type { GuidanceOfficialTemplateMatch } from "@/contracts/aiGuidance";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { requestWorkflowGuidance } from "@/lib/api/ai/guidance";
import {
  MAX_GOAL_LENGTH,
  UNAVAILABLE_MESSAGE,
  asRenderablePlan,
  asRenderablePreview,
  safeErrorMessage,
  submitOnEnter,
} from "./guidancePanelShared";
import { GuidancePlanSection, GuidancePreviewSection } from "./GuidanceSuggestionSections";
import { GuidanceTemplateMatchSection } from "./GuidanceTemplateMatchSection";
import { GuidanceTemplatePreviewDialog } from "./GuidanceTemplatePreviewDialog";
import { useTemplatePreviewFlow } from "./useTemplatePreviewFlow";

/**
 * The original single-shot "Build with me" form (dashboard). Extracted verbatim from
 * `WorkflowGuidancePanel` (HERMES-AGENT-GUIDANCE-UI) — behavior, testids, and copy are unchanged. It
 * calls ONLY the governed `requestWorkflowGuidance` helper and never applies/saves/runs a workflow.
 */

const GOAL_PLACEHOLDER =
  "Example: When a new lead comes in, remind me to follow up if I have not heard back in 3 days.";

type Status = "idle" | "loading" | "done" | "error";

export interface SingleShotGuidancePanelProps {
  readonly accountId: string;
  readonly workflowId?: string;
  readonly onPreviewToCanvas?: (payload: { plan: WorkflowPlan; preview: DraftPreview }) => void;
}

export function SingleShotGuidancePanel({ accountId, workflowId }: SingleShotGuidancePanelProps) {
  const [goal, setGoal] = useState("");
  const [status, setStatus] = useState<Status>("idle");
  const [guidanceText, setGuidanceText] = useState("");
  const [plan, setPlan] = useState<WorkflowPlan | null>(null);
  const [preview, setPreview] = useState<DraftPreview | null>(null);
  const [templateMatches, setTemplateMatches] = useState<readonly GuidanceOfficialTemplateMatch[]>([]);
  const [errorMessage, setErrorMessage] = useState("");
  const templatePreview = useTemplatePreviewFlow(accountId);

  const trimmed = goal.trim();
  const canSubmit = trimmed.length > 0 && status !== "loading";

  async function handleSubmit(): Promise<void> {
    if (!canSubmit) return;
    setStatus("loading");
    setErrorMessage("");
    setGuidanceText("");
    setPlan(null);
    setPreview(null);
    setTemplateMatches([]);
    try {
      const res = await requestWorkflowGuidance({
        accountId,
        goalText: trimmed,
        ...(workflowId ? { workflowId } : {}),
      });
      if (res.ok) {
        setGuidanceText(res.guidanceText);
        setPlan(asRenderablePlan(res.workflowPlan));
        setPreview(asRenderablePreview(res.previewDraft));
        setTemplateMatches(res.officialTemplateMatches ?? []);
        setStatus("done");
      } else {
        setErrorMessage(safeErrorMessage(res));
        setStatus("error");
      }
    } catch {
      setErrorMessage(UNAVAILABLE_MESSAGE);
      setStatus("error");
    }
  }

  return (
    <section
      data-testid="workflow-guidance-panel"
      aria-label="Build with me"
      className="mb-6 rounded-lg border border-neutral-200 bg-white p-4 dark:border-neutral-800 dark:bg-neutral-900"
    >
      <h2 className="text-base font-semibold text-neutral-900 dark:text-neutral-100">Build with me</h2>
      <p className="mt-1 text-sm text-neutral-600 dark:text-neutral-400">
        Describe what you want to automate and I&apos;ll help you figure out the workflow.
      </p>

      <div className="mt-3">
        <Label htmlFor="workflow-guidance-goal" className="text-neutral-700 dark:text-neutral-300">
          Your automation goal
        </Label>
        <Textarea
          id="workflow-guidance-goal"
          value={goal}
          onChange={(e) => setGoal(e.target.value)}
          onKeyDown={(e) => submitOnEnter(e, handleSubmit)}
          placeholder={GOAL_PLACEHOLDER}
          rows={3}
          maxLength={MAX_GOAL_LENGTH}
          disabled={status === "loading"}
          className="mt-1"
        />
      </div>

      <div className="mt-3 flex items-center gap-3">
        <Button
          type="button"
          onClick={handleSubmit}
          disabled={!canSubmit}
          data-testid="workflow-guidance-submit"
        >
          {status === "loading" ? "Thinking…" : "Get guidance"}
        </Button>
      </div>

      {status === "error" && (
        <p
          role="alert"
          data-testid="workflow-guidance-error"
          className="mt-3 text-sm text-red-700 dark:text-red-300"
        >
          {errorMessage}
        </p>
      )}

      {status === "done" && guidanceText.length > 0 && (
        <div data-testid="workflow-guidance-result" className="mt-4">
          <h3 className="text-sm font-semibold text-neutral-900 dark:text-neutral-100">Guidance</h3>
          <p className="mt-1 whitespace-pre-wrap text-sm text-neutral-700 dark:text-neutral-300">
            {guidanceText}
          </p>
        </div>
      )}

      {status === "done" && plan && !preview && <GuidancePlanSection plan={plan} />}

      {status === "done" && preview && <GuidancePreviewSection preview={preview} plan={plan} />}

      {status === "done" && templateMatches.length > 0 && (
        <GuidanceTemplateMatchSection matches={templateMatches} onPreview={templatePreview.openPreview} />
      )}

      {templatePreview.previewMatch && (
        <GuidanceTemplatePreviewDialog
          match={templatePreview.previewMatch}
          busy={templatePreview.busy}
          error={templatePreview.error}
          onConfirmUse={templatePreview.confirmUse}
          onClose={templatePreview.closePreview}
        />
      )}
    </section>
  );
}
