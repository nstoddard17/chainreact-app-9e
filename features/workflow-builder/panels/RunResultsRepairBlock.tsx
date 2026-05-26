"use client";

import { useState } from "react";
import {
  AiApiError,
  applyWorkflowPatch,
  requestWorkflowRepair,
  type AiOpaquePatch,
  type AiRepairResult,
  type AiRepairSuccess,
} from "@/lib/api/ai";
import { AiBulletList, AiRequiredInputList } from "../ai";

/**
 * Slice 4.AI-13 — failed-run repair entry point.
 *
 * Rendered only when the run failed (the parent panel only mounts this on
 * `detail.status === "failed"`). Calls the deterministic AI-7 service via the
 * AI-13 route, then renders a value-free summary + (when present) a
 * structurally validated preview. Applying a proposed repair REUSES the
 * existing AI-9B apply route — no separate repair-apply path. The proposed
 * patch is treated as opaque on the client (never inspected / rendered as
 * config values). High-risk patches require explicit confirmation via the
 * existing apply route's confirmation contract.
 *
 * Intentional non-goals: no chat history, no thread persistence, no model
 * settings, no auto-apply. A single Ask → Result → (optional) Apply flow.
 */
type RepairUiState =
  | "idle"
  | "loading"
  | "ready"
  | "applying"
  | "applied"
  | "error";

export function RunResultsRepairBlock({
  workflowId,
  runId,
}: {
  workflowId: string;
  runId: string;
}) {
  const [state, setState] = useState<RepairUiState>("idle");
  const [result, setResult] = useState<AiRepairResult | null>(null);
  const [applyError, setApplyError] = useState<string | null>(null);

  async function onAsk(): Promise<void> {
    setState("loading");
    setResult(null);
    setApplyError(null);
    try {
      const res = await requestWorkflowRepair(workflowId, runId);
      setResult(res);
      setState("ready");
    } catch (err) {
      const message =
        err instanceof AiApiError
          ? err.message
          : "Couldn't reach the repair service.";
      setResult({ ok: false, code: "REQUEST_FAILED", message });
      setState("error");
    }
  }

  async function onApply(
    patch: AiOpaquePatch,
    requiresConfirmation: boolean,
    riskLevel: string,
  ): Promise<void> {
    setState("applying");
    setApplyError(null);
    try {
      const applyResult = await applyWorkflowPatch(workflowId, {
        patch,
        ...(requiresConfirmation
          ? {
              confirmation: {
                confirmed: true,
                acceptedRiskLevel: riskLevel,
                acceptedAt: new Date().toISOString(),
              },
            }
          : {}),
      });
      if (applyResult.ok) {
        setState("applied");
        // The repair changed the workflow draft definition, not this run's
        // outcome. The user re-runs to verify the fix; no run-state refresh
        // here. (Re-polling the same failed run id would still show "failed".)
        return;
      }
      setApplyError(applyResult.message);
      setState("ready");
    } catch (err) {
      setApplyError(
        err instanceof AiApiError ? err.message : "Couldn't apply the repair.",
      );
      setState("ready");
    }
  }

  return (
    <section
      aria-label="Repair suggestion"
      className="flex flex-col gap-2 rounded border border-input bg-muted/30 p-2"
      data-testid="repair-block"
      data-state={state}
    >
      <header className="flex items-center justify-between gap-2">
        <h4 className="text-xs font-medium">AI repair suggestion</h4>
        {state === "idle" ? (
          <button
            type="button"
            className="rounded border border-input bg-background px-2 py-1 text-xs hover:bg-accent"
            onClick={onAsk}
            data-testid="repair-ask"
          >
            Ask AI to suggest a fix
          </button>
        ) : null}
      </header>

      {state === "loading" ? (
        <p
          role="status"
          className="text-xs text-muted-foreground"
          data-testid="repair-loading"
        >
          Looking for a safe repair…
        </p>
      ) : null}

      {state === "error" && result && !result.ok ? (
        <p
          role="alert"
          className="text-xs text-destructive"
          data-testid="repair-error"
        >
          {result.message}
        </p>
      ) : null}

      {result && result.ok ? (
        <RepairResult
          result={result}
          onApply={onApply}
          applyError={applyError}
          state={state}
        />
      ) : null}

      {state === "applied" ? (
        <p
          role="status"
          className="text-xs text-emerald-700 dark:text-emerald-300"
          data-testid="repair-applied"
        >
          Repair applied. Re-run the workflow to verify.
        </p>
      ) : null}
    </section>
  );
}

function RepairResult({
  result,
  onApply,
  applyError,
  state,
}: {
  result: AiRepairSuccess;
  onApply: (
    patch: AiOpaquePatch,
    requiresConfirmation: boolean,
    riskLevel: string,
  ) => Promise<void>;
  applyError: string | null;
  state: RepairUiState;
}) {
  const preview = result.preview;
  const proposedPatch = result.proposedPatch;
  const canApply = !!proposedPatch && !!preview?.validation?.ok;
  const requiresConfirmation = preview?.requiresConfirmation === true;
  const riskLevel = preview?.riskLevel ?? "low";

  return (
    <div className="flex flex-col gap-2" data-testid="repair-result">
      <p
        className="text-xs text-muted-foreground"
        data-testid="repair-reason-code"
        data-reason-code={result.reasonCode}
      >
        <span className="font-medium">
          {repairabilityLabel(result.repairability)}
        </span>
        {" — "}
        {humanReasonCode(result.reasonCode)}
      </p>

      <AiBulletList items={result.recommendations} testId="repair-recommendations" />

      <AiRequiredInputList
        title="Need from you:"
        items={result.requiredUserInput}
        testId="repair-required-input"
        showFieldHint
      />

      {preview?.changes && preview.changes.length > 0 ? (
        <details
          className="rounded bg-background p-2 text-xs"
          data-testid="repair-preview-changes"
        >
          <summary className="cursor-pointer text-xs font-medium">
            {preview.changes.length} change
            {preview.changes.length === 1 ? "" : "s"} previewed
            {requiresConfirmation ? " · requires confirmation" : ""}
          </summary>
          <ul className="ml-4 mt-1 list-disc">
            {preview.changes.map((c, i) => (
              <li key={i}>{c.description}</li>
            ))}
          </ul>
        </details>
      ) : null}

      <AiBulletList
        items={result.safetyNotes}
        severity="warning"
        testId="repair-safety-notes"
      />

      {applyError ? (
        <p
          role="alert"
          className="text-xs text-destructive"
          data-testid="repair-apply-error"
        >
          {applyError}
        </p>
      ) : null}

      {canApply && proposedPatch ? (
        <button
          type="button"
          className="self-start rounded border border-input bg-background px-2 py-1 text-xs hover:bg-accent disabled:opacity-50"
          onClick={() =>
            onApply(proposedPatch, requiresConfirmation, riskLevel)
          }
          disabled={state === "applying"}
          data-testid="repair-apply"
        >
          {state === "applying"
            ? "Applying…"
            : requiresConfirmation
              ? `Apply repair (confirm ${riskLevel})`
              : "Apply repair"}
        </button>
      ) : null}
    </div>
  );
}

function repairabilityLabel(
  r: AiRepairSuccess["repairability"],
): string {
  switch (r) {
    case "repairable":
      return "Repair available";
    case "needsUserInput":
      return "Needs your input";
    case "noSafeRepair":
      return "No safe repair";
  }
}

function humanReasonCode(code: string): string {
  return code.toLowerCase().replace(/_/g, " ");
}
