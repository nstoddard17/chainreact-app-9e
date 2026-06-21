"use client";

import { useState } from "react";
import type { WorkflowPlan } from "@/contracts/guidanceSession";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { requestWorkflowGuidance } from "@/lib/api/ai/guidance";

/**
 * "Build with me" — the first user-facing entry point for advisory Hermes Agent workflow guidance
 * (HERMES-AGENT-GUIDANCE-UI). A user describes a vague automation goal; ChainReact asks the Hermes
 * Agent (via the server route) for clarifying questions / practical guidance and renders it.
 *
 * ADVISORY ONLY: this never creates, changes, applies, or runs a workflow. It calls ONLY the
 * ChainReact route `POST /api/accounts/[id]/ai/workflow-guidance` through the `requestWorkflowGuidance`
 * helper — never the Render gateway / a model vendor / Nous / the private Hermes Agent, and never sees
 * a token. `accountId` comes from server/router context (a prop), not arbitrary user input. Failures
 * map to safe copy — no internal error / provider status / raw envelope / usage is shown.
 *
 * HERMES-AGENT-PLAN-EXTRACTION: when the server returns a capability-validated `workflowPlan`, this
 * also renders a small REVIEW-ONLY "Suggested plan" section under the guidance. The plan is advisory
 * (`notApplied: true`) — there is intentionally NO create / apply / add-nodes / run control here;
 * surfacing it never changes the user's workflow.
 */

const GOAL_PLACEHOLDER =
  "Example: When a new lead comes in, remind me to follow up if I have not heard back in 3 days.";
const UNAVAILABLE_MESSAGE = "AI workflow guidance is temporarily unavailable.";
const MAX_GOAL_LENGTH = 2_000;

type Status = "idle" | "loading" | "done" | "error";

/** Narrow the route's `workflowPlan` to a renderable plan with at least one step (else null). */
function asRenderablePlan(value: WorkflowPlan | null | undefined): WorkflowPlan | null {
  if (!value || typeof value !== "object") return null;
  return Array.isArray(value.steps) && value.steps.length > 0 ? value : null;
}

export interface WorkflowGuidancePanelProps {
  /** Account scope for the request (resolved server-side / from router context). */
  readonly accountId: string;
  /** Optional builder-context workflow id; only included when present. */
  readonly workflowId?: string;
}

export function WorkflowGuidancePanel({ accountId, workflowId }: WorkflowGuidancePanelProps) {
  const [goal, setGoal] = useState("");
  const [status, setStatus] = useState<Status>("idle");
  const [guidanceText, setGuidanceText] = useState("");
  const [plan, setPlan] = useState<WorkflowPlan | null>(null);
  const [errorMessage, setErrorMessage] = useState("");

  const trimmed = goal.trim();
  const canSubmit = trimmed.length > 0 && status !== "loading";

  async function handleSubmit(): Promise<void> {
    if (!canSubmit) return;
    setStatus("loading");
    setErrorMessage("");
    setGuidanceText("");
    setPlan(null);
    try {
      const res = await requestWorkflowGuidance({
        accountId,
        goalText: trimmed,
        ...(workflowId ? { workflowId } : {}),
      });
      if (res.ok) {
        setGuidanceText(res.guidanceText);
        // Review-only advisory plan (capability-validated server-side). Never auto-applied.
        setPlan(asRenderablePlan(res.workflowPlan));
        setStatus("done");
      } else {
        // Only the credits denial carries distinct safe copy; everything else is generic-unavailable.
        setErrorMessage(res.code === "AI_CREDITS_EXHAUSTED" ? res.message : UNAVAILABLE_MESSAGE);
        setStatus("error");
      }
    } catch {
      // Transport failures (401/400/500) — never surface internal detail.
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
        Describe what you want to automate and I will help you figure out the workflow. This is
        guidance, not automatic workflow creation.
      </p>

      <div className="mt-3">
        <Label htmlFor="workflow-guidance-goal" className="text-neutral-700 dark:text-neutral-300">
          Your automation goal
        </Label>
        <Textarea
          id="workflow-guidance-goal"
          value={goal}
          onChange={(e) => setGoal(e.target.value)}
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

      {status === "done" && plan && (
        <div
          data-testid="workflow-guidance-plan"
          className="mt-4 rounded-md border border-neutral-200 bg-neutral-50 p-3 dark:border-neutral-800 dark:bg-neutral-950"
        >
          <h3 className="text-sm font-semibold text-neutral-900 dark:text-neutral-100">
            Suggested plan
          </h3>
          {/* Advisory framing — make it unmistakable that nothing was changed. No apply control. */}
          <p
            data-testid="workflow-guidance-plan-disclaimer"
            className="mt-0.5 text-xs text-neutral-500 dark:text-neutral-400"
          >
            Review only — this has not changed your workflow.
          </p>
          {plan.title.length > 0 && (
            <p className="mt-2 text-sm font-medium text-neutral-800 dark:text-neutral-200">
              {plan.title}
            </p>
          )}
          {plan.summary.length > 0 && (
            <p className="mt-1 text-sm text-neutral-600 dark:text-neutral-400">{plan.summary}</p>
          )}
          <ol className="mt-2 space-y-1.5">
            {plan.steps.map((step, i) => (
              <li key={step.ref} className="text-sm text-neutral-700 dark:text-neutral-300">
                <span className="font-medium">{i + 1}.</span>{" "}
                <span className="rounded bg-neutral-200 px-1 py-0.5 text-xs font-medium text-neutral-700 dark:bg-neutral-800 dark:text-neutral-300">
                  {step.role}
                </span>{" "}
                <code className="text-xs">
                  {step.provider}:{step.type}
                </code>
                {step.purpose.length > 0 && (
                  <span className="text-neutral-600 dark:text-neutral-400"> — {step.purpose}</span>
                )}
              </li>
            ))}
          </ol>
        </div>
      )}
    </section>
  );
}
