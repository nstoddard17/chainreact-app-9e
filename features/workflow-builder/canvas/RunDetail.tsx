"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import type { WorkflowRunDetail } from "@/contracts/workflow";
import { getNodeDisplayName } from "@/core/workflows/nodeDisplayName";
import { failedRunCta } from "@/core/errors/failedRunCta";
import { resolveHelpLink } from "@/features/marketing/help/contextualHelp";
import { getWorkflowRun } from "@/lib/api/workflows";
import { useGraphSlice } from "../state/graphSlice";
import { useConfigSlice } from "../state/configSlice";
import { useRunControls } from "../hooks/useRunControls";
import {
  ClassifiedErrorBlock,
  MISSING_NODE_LABEL,
  SOURCE_LABEL,
  StatusBadge,
  StepTimeline,
  TestTag,
  durationLabel,
  formatTimestamp,
} from "./runsPanelParts";

/**
 * Slice 4.BUILDER-RUNS-TAB-1 — the run-detail/debugging pane of the builder
 * Runs tab. Fetches one run's sanitized detail (`getWorkflowRun`) and renders
 * the summary, humanized error, step timeline (failed step highlighted), and
 * the safe action CTAs. Never renders raw step output / payloads.
 */
export function RunDetailPane({
  workflowId,
  selectedRunId,
  isLiveSelection,
  onOpenFailedStep,
  runEditBlocked,
}: {
  workflowId: string | null;
  selectedRunId: string | null;
  isLiveSelection: boolean;
  onOpenFailedStep?: () => void;
  runEditBlocked: boolean;
}) {
  const [detail, setDetail] = useState<WorkflowRunDetail | null>(null);
  const [state, setState] = useState<"idle" | "loading" | "loaded" | "error">("idle");

  useEffect(() => {
    if (!workflowId || !selectedRunId || isLiveSelection) {
      setDetail(null);
      setState("idle");
      return;
    }
    let cancelled = false;
    setState("loading");
    getWorkflowRun(workflowId, selectedRunId)
      .then((d) => {
        if (cancelled) return;
        setDetail(d);
        setState("loaded");
      })
      .catch(() => {
        if (cancelled) return;
        setDetail(null);
        setState("error");
      });
    return () => {
      cancelled = true;
    };
  }, [workflowId, selectedRunId, isLiveSelection]);

  return (
    <section
      aria-label="Run detail"
      className="flex min-h-0 flex-1 flex-col overflow-y-auto p-4"
      data-testid="run-detail"
    >
      {isLiveSelection ? (
        <p role="status" className="text-[12.5px]" style={{ color: "var(--builder-muted)" }}>
          Run in progress…
        </p>
      ) : selectedRunId === null ? (
        <p className="text-[12.5px]" style={{ color: "var(--builder-muted)" }}>
          Select a run to see its details.
        </p>
      ) : state === "loading" ? (
        <p role="status" className="text-[12.5px]" style={{ color: "var(--builder-muted)" }}>
          Loading run detail…
        </p>
      ) : state === "error" || !detail ? (
        <p
          className="text-[12.5px]"
          style={{ color: "var(--builder-muted)" }}
          data-testid="run-detail-unavailable"
        >
          Detailed output is unavailable for this run.
        </p>
      ) : (
        <RunDetailBody
          detail={detail}
          {...(onOpenFailedStep ? { onOpenFailedStep } : {})}
          runEditBlocked={runEditBlocked}
        />
      )}
    </section>
  );
}

function RunDetailBody({
  detail,
  onOpenFailedStep,
  runEditBlocked,
}: {
  detail: WorkflowRunDetail;
  onOpenFailedStep?: () => void;
  runEditBlocked: boolean;
}) {
  const pendingNodes = useGraphSlice((s) => s.pendingNodes);
  const revealNode = useConfigSlice((s) => s.revealNode);
  const { triggerKind, handleTestWorkflow, anyRunning, runError } = useRunControls();

  const labelForNodeId = useCallback(
    (nodeId: string): string => {
      const node = pendingNodes.find((n) => n.id === nodeId);
      return node ? getNodeDisplayName(node) : MISSING_NODE_LABEL;
    },
    [pendingNodes],
  );

  const firstFailedStep = useMemo(
    () => detail.steps.find((s) => s.status === "failed"),
    [detail.steps],
  );
  const failedNode = useMemo(
    () =>
      firstFailedStep
        ? pendingNodes.find((n) => n.id === firstFailedStep.nodeId)
        : undefined,
    [firstFailedStep, pendingNodes],
  );

  const handleOpenFailedStep = useCallback(() => {
    if (!firstFailedStep || !failedNode) return;
    revealNode({ nodeId: failedNode.id, initialValues: failedNode.config });
    onOpenFailedStep?.();
  }, [firstFailedStep, failedNode, revealNode, onOpenFailedStep]);

  const canRunAgain = triggerKind === "manual" && !runEditBlocked;

  // CR-FAILREASON-2 — a link-out CTA for the classified action. The existing
  // "Open failed step" already serves open_node (with the real node) and "Run
  // again" serves retry, so only render the link for actions those buttons don't
  // cover (reconnect → /apps, upgrade_plan → /account). retry_later /
  // contact_support have no href; open_node is excluded to avoid a duplicate.
  const failedCta = detail.errorClassification
    ? failedRunCta(detail.errorClassification.action, { workflowId: detail.workflowId })
    : null;

  // HELP-CENTER-CONTEXTUAL-1 — secondary Help Center link for the classified
  // failure (central resolver keyed on the action enum; null → no link, e.g.
  // review_pending). Failed runs only; never replaces the action buttons.
  const failedHelp =
    detail.status === "failed" && detail.errorClassification
      ? resolveHelpLink({ type: "run_error", action: detail.errorClassification.action })
      : null;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-2">
        <div className="flex items-center gap-2">
          <StatusBadge status={detail.status} />
          <span className="text-[13px] font-medium" style={{ color: "var(--builder-text)" }}>
            {SOURCE_LABEL[detail.triggeredBy ?? "unknown"]}
          </span>
          {detail.isTest ? <TestTag /> : null}
        </div>
        <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-[12px]">
          <dt style={{ color: "var(--builder-muted)" }}>Started</dt>
          <dd style={{ color: "var(--builder-text)" }}>{formatTimestamp(detail.startedAt)}</dd>
          <dt style={{ color: "var(--builder-muted)" }}>Duration</dt>
          <dd style={{ color: "var(--builder-text)" }}>
            {durationLabel(detail.startedAt, detail.finishedAt) || "—"}
          </dd>
        </dl>
      </div>

      {detail.status === "failed" && detail.errorClassification ? (
        <ClassifiedErrorBlock classification={detail.errorClassification} />
      ) : null}

      <div className="flex flex-col gap-2">
        <h3
          className="text-[12px] font-semibold uppercase tracking-wide"
          style={{ color: "var(--builder-muted)" }}
        >
          Steps
        </h3>
        <StepTimeline steps={detail.steps} labelForNodeId={labelForNodeId} />
      </div>

      <div className="flex flex-wrap items-center gap-2" data-testid="run-detail-actions">
        {firstFailedStep ? (
          failedNode ? (
            <button
              type="button"
              onClick={handleOpenFailedStep}
              data-testid="open-failed-step"
              className="rounded-[6px] border px-2.5 py-1 text-[12px]"
              style={{
                borderColor: "var(--builder-border)",
                color: "var(--builder-text)",
                background: "var(--builder-panel)",
              }}
            >
              Open failed step
            </button>
          ) : (
            <span
              data-testid="open-failed-step-missing"
              className="text-[11.5px]"
              style={{ color: "var(--builder-muted)" }}
            >
              The failed step&rsquo;s node is no longer in this workflow.
            </span>
          )
        ) : null}
        {canRunAgain ? (
          <button
            type="button"
            onClick={() => void handleTestWorkflow()}
            disabled={anyRunning}
            data-testid="run-again"
            title="Re-runs this workflow in test mode — external actions are skipped and nothing is saved."
            className="rounded-[6px] border px-2.5 py-1 text-[12px] disabled:opacity-50"
            style={{
              borderColor: "var(--builder-border)",
              color: "var(--builder-text)",
              background: "var(--builder-panel)",
            }}
          >
            {anyRunning ? "Running…" : "Run again"}
          </button>
        ) : null}
        {failedCta?.href && detail.errorClassification?.action !== "open_node" ? (
          <Link
            href={failedCta.href}
            data-testid="run-detail-cta"
            data-cta-action={detail.errorClassification?.action}
            className="rounded-[6px] border px-2.5 py-1 text-[12px]"
            style={{
              borderColor: "var(--builder-border)",
              color: "var(--builder-text)",
              background: "var(--builder-panel)",
            }}
          >
            {failedCta.label}
          </Link>
        ) : null}
        {failedHelp ? (
          <Link
            href={failedHelp.href}
            data-testid="run-detail-help-link"
            className="text-[12px] underline underline-offset-2 hover:no-underline"
            style={{ color: "var(--builder-muted)" }}
          >
            {failedHelp.label}
          </Link>
        ) : null}
      </div>
      {runError ? (
        <p role="alert" className="text-[12px] text-destructive">
          {runError}
        </p>
      ) : null}
    </div>
  );
}
