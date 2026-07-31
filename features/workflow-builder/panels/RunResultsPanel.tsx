"use client";

import { useState } from "react";
import Link from "next/link";
import type { WorkflowRunStep } from "@/contracts/workflow";
import { getNodeDisplayName } from "@/core/workflows/nodeDisplayName";
import { failedRunCta } from "@/core/errors/failedRunCta";
import { resolveHelpLink } from "@/features/marketing/help/contextualHelp";
import { useGraphSlice } from "../state/graphSlice";
import { useRunSlice } from "../state/runSlice";
import { AgentRepairLoopPanel } from "./AgentRepairLoopPanel";
import { RunResultsRepairBlock } from "./RunResultsRepairBlock";

/** Friendly stand-in when a run step references a node no longer on the canvas. */
const MISSING_NODE_LABEL = "a node that's no longer in this workflow";

/**
 * Slice 3.8 — Test Run / Latest Run Output Preview.
 *
 * Renders the most recent run started from the builder. Polls the run
 * detail endpoint via `useLatestRunPolling` (installed at the
 * WorkflowBuilder level so unmount cleans up the interval).
 *
 * Surfaces:
 *   - idle: no run started yet — explanatory hint.
 *   - pending: run enqueued, waiting for the engine to write the row.
 *   - succeeded / failed: per-step status pills + per-step "View output"
 *     disclosure (compact <details>). Failures additionally surface the
 *     classified error block + fatalError code/message when present.
 *   - lost: 60-poll ceiling expired without a row appearing. Engine may
 *     still finish; the panel just stops polling and tells the user.
 *
 * Deliberately compact:
 *   - JSON pretty-print only (no inspector, no search, no clipboard, no
 *     redaction beyond what's already in the contract).
 *   - Max-height scrollable per step so a chatty Slack response doesn't
 *     blow out the column height.
 */
export function RunResultsPanel({ accountId }: { accountId?: string } = {}) {
  const status = useRunSlice((s) => s.status);
  const runId = useRunSlice((s) => s.runId);
  const detail = useRunSlice((s) => s.detail);
  const fetchError = useRunSlice((s) => s.fetchError);
  const pollCount = useRunSlice((s) => s.pollCount);
  // Slice 4.BUILDER-NODE-IDENTITY-1 — resolve each step's opaque node id to a
  // friendly label from the current canvas; missing nodes get a generic phrase
  // (never the raw id) in the visible copy. The raw id stays only as a dev hover.
  const pendingNodes = useGraphSlice((s) => s.pendingNodes);
  const labelForNodeId = (nodeId: string): string => {
    const node = pendingNodes.find((n) => n.id === nodeId);
    return node ? getNodeDisplayName(node) : MISSING_NODE_LABEL;
  };

  return (
    <section
      aria-label="Latest run results"
      className="flex min-w-0 flex-col gap-2 p-3"
      data-status={status}
      style={{ background: "var(--builder-panel)" }}
    >
      <header className="flex min-w-0 flex-wrap items-center justify-between gap-2">
        <h3 className="shrink-0 text-[13px] font-semibold" style={{ color: "var(--builder-text)" }}>
          Latest run
        </h3>
        {runId ? (
          <code
            // A 36-character unbroken id: `break-all` is the only thing that can
            // split it, and it stays selectable/copyable in full.
            className="builder-mono min-w-0 break-all text-[10.5px]"
            data-testid="run-id"
            style={{ color: "var(--builder-muted)" }}
          >
            {runId}
          </code>
        ) : null}
      </header>
      {fetchError && status !== "succeeded" && status !== "failed" ? (
        <p role="alert" className="text-xs text-destructive">
          {fetchError}
        </p>
      ) : null}
      <Body
        status={status}
        detail={detail}
        pollCount={pollCount}
        labelForNodeId={labelForNodeId}
        accountId={accountId}
      />
    </section>
  );
}

function Body({
  status,
  detail,
  pollCount,
  labelForNodeId,
  accountId,
}: {
  status: ReturnType<typeof useRunSlice.getState>["status"];
  detail: ReturnType<typeof useRunSlice.getState>["detail"];
  pollCount: number;
  labelForNodeId: (nodeId: string) => string;
  accountId?: string;
}) {
  if (status === "idle") {
    return (
      <p className="text-xs text-muted-foreground" data-testid="latest-run-idle">
        Run Now to see per-step output here.
      </p>
    );
  }
  if (status === "pending") {
    return (
      <p
        role="status"
        className="text-xs text-muted-foreground"
        data-testid="latest-run-pending"
      >
        Waiting for the run to finish… (poll {pollCount})
      </p>
    );
  }
  if (status === "lost") {
    return (
      <p
        role="status"
        className="text-xs text-muted-foreground"
        data-testid="latest-run-lost"
      >
        Run is taking longer than expected. Check the Run History when
        the engine finishes — this panel stopped polling after{" "}
        {pollCount} attempts.
      </p>
    );
  }
  if (!detail) {
    // Should be unreachable in practice — terminal status implies detail
    // is set — but guard anyway so a stale store doesn't crash the panel.
    return null;
  }
  return (
    <>
      {/* REACT-AGENT-TEST-FIX-LOOP — guided "test → fix → retest" thread at the
          top of the failed-run section. Renders only when the root watcher
          (`useAgentRepairLoop`) has an active thread for this workflow; the
          classified error block, step list, and AI repair block below stay
          available. */}
      {detail.status === "failed" ? (
        <AgentRepairLoopPanel workflowId={detail.workflowId} />
      ) : null}
      <RunStatusLine detail={detail} />
      {/* V2-READY-51 — the raw `fatalError` is no longer on the wire; the
          humanized `errorClassification` is the user-facing failure surface. */}
      {detail.errorClassification ? (
        <>
          <ClassifiedErrorBlock classification={detail.errorClassification} />
          {/* CR-FAILREASON-2 — one primary next-action CTA from the classified
              action. Complements (does not replace) the AI repair block below. */}
          <RunErrorCta
            action={detail.errorClassification.action}
            workflowId={detail.workflowId}
          />
        </>
      ) : null}
      <Steps steps={detail.steps} labelForNodeId={labelForNodeId} />
      {detail.status === "failed" ? (
        <RunResultsRepairBlock
          workflowId={detail.workflowId}
          runId={detail.id}
          {...(accountId ? { accountId } : {})}
        />
      ) : null}
    </>
  );
}

function RunStatusLine({
  detail,
}: {
  detail: NonNullable<ReturnType<typeof useRunSlice.getState>["detail"]>;
}) {
  const succeeded = detail.status === "succeeded";
  return (
    <div className="flex min-w-0 flex-wrap items-center justify-between gap-3">
      <StatusPill status={detail.status} />
      <span className="text-xs text-muted-foreground">
        {succeeded ? "Succeeded" : "Failed"} ·{" "}
        {durationLabel(detail.startedAt, detail.finishedAt)}
      </span>
    </div>
  );
}

function Steps({
  steps,
  labelForNodeId,
}: {
  steps: readonly WorkflowRunStep[];
  labelForNodeId: (nodeId: string) => string;
}) {
  if (steps.length === 0) {
    return (
      <p className="text-xs text-muted-foreground">
        No step records — the engine reported zero steps for this run.
      </p>
    );
  }
  return (
    <ol className="flex flex-col gap-2" aria-label="Run steps">
      {steps.map((step, idx) => (
        <li key={`${step.nodeId}-${idx}`}>
          <StepRow step={step} nodeLabel={labelForNodeId(step.nodeId)} />
        </li>
      ))}
    </ol>
  );
}

function StepRow({ step, nodeLabel }: { step: WorkflowRunStep; nodeLabel: string }) {
  const [open, setOpen] = useState(false);
  const hasOutput = step.output !== undefined;
  return (
    <article
      className="flex min-w-0 flex-col gap-1 rounded border border-input p-2"
      data-status={step.status}
      data-testid={`step-${step.nodeId}`}
    >
      <div className="flex min-w-0 flex-wrap items-center justify-between gap-2">
        <div
          className="flex min-w-0 flex-1 items-center gap-2"
          data-legible-min="140"
          data-legible-what="results step identity"
        >
          <span className="shrink-0">
            <StatusPill status={step.status} />
          </span>
          <span className="min-w-0 break-words text-xs text-muted-foreground" title={step.nodeId}>
            {nodeLabel}
          </span>
        </div>
        {(hasOutput || step.error) && (
          <button
            type="button"
            className="shrink-0 text-xs text-muted-foreground underline-offset-2 hover:underline"
            onClick={() => setOpen((v) => !v)}
            aria-expanded={open}
            data-testid={`step-${step.nodeId}-toggle`}
          >
            {open ? "Hide output" : "View output"}
          </button>
        )}
      </div>
      {step.error ? (
        <p className="min-w-0 break-words text-xs text-destructive">
          <span className="font-medium">{step.error.code}: </span>
          {step.error.message}
        </p>
      ) : null}
      {open && hasOutput ? (
        <pre
          // The ONE place local horizontal scrolling is the right answer: JSON
          // lines are irreducibly wide and reflowing them would destroy the
          // structure the author is reading. `max-w-full min-w-0` is what stops
          // the block's intrinsic content width from becoming the panel's
          // minimum width — the viewer scrolls, the Builder does not.
          className="max-h-48 min-w-0 max-w-full overflow-auto rounded bg-muted p-2 text-xs"
          data-testid={`step-${step.nodeId}-output`}
        >
          {safeStringify(step.output)}
        </pre>
      ) : null}
    </article>
  );
}

function StatusPill({ status }: { status: WorkflowRunStep["status"] }) {
  const tone =
    status === "succeeded"
      ? "bg-emerald-100 text-emerald-900 dark:bg-emerald-500/20 dark:text-emerald-300"
      : status === "failed"
        ? "bg-red-100 text-red-900 dark:bg-red-500/20 dark:text-red-300"
        : "bg-zinc-100 text-zinc-900 dark:bg-zinc-500/20 dark:text-zinc-300";
  const label =
    status === "succeeded"
      ? "Succeeded"
      : status === "failed"
        ? "Failed"
        : "Skipped";
  return (
    <span
      className={`rounded px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide ${tone}`}
      data-status-kind={status}
    >
      {label}
    </span>
  );
}

function ClassifiedErrorBlock({
  classification,
}: {
  classification: NonNullable<
    NonNullable<ReturnType<typeof useRunSlice.getState>["detail"]>["errorClassification"]
  >;
}) {
  return (
    <div
      role={classification.severity === "error" ? "alert" : "status"}
      className="flex min-w-0 flex-col gap-0.5 rounded bg-muted p-2 text-xs"
      data-severity={classification.severity}
      data-testid="run-error-classification"
    >
      <span className="break-words font-medium">{classification.title}</span>
      <span className="break-words text-muted-foreground">{classification.description}</span>
      {classification.hint ? (
        <span className="text-muted-foreground">
          <span className="font-medium">Hint: </span>
          {classification.hint}
        </span>
      ) : null}
    </div>
  );
}

/**
 * CR-FAILREASON-2 — one primary next-action CTA for the latest failed run, from
 * the shared `failedRunCta` mapping. Link for actionable destinations; plain
 * guidance text for retry_later / contact_support (no safe destination yet);
 * nothing for a missing/legacy action.
 */
function RunErrorCta({
  action,
  workflowId,
}: {
  action: Parameters<typeof failedRunCta>[0];
  workflowId: string;
}) {
  const cta = failedRunCta(action, { workflowId });
  // HELP-CENTER-CONTEXTUAL-1 — secondary Help Center link from the same
  // classified action enum (central resolver; null → nothing rendered).
  const help = resolveHelpLink({ type: "run_error", action });
  if (!cta && !help) return null;
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
      {cta &&
        (cta.href ? (
          <Link
            href={cta.href}
            data-testid="run-error-cta"
            data-cta-action={action}
            className="inline-flex w-fit items-center text-xs font-medium underline underline-offset-2 hover:no-underline"
          >
            {cta.label}
          </Link>
        ) : (
          <p
            data-testid="run-error-cta"
            data-cta-action={action}
            className="text-xs font-medium text-muted-foreground"
          >
            {cta.label}
          </p>
        ))}
      {help && (
        <Link
          href={help.href}
          data-testid="run-error-help-link"
          className="inline-flex w-fit items-center text-xs text-muted-foreground underline underline-offset-2 hover:text-foreground hover:no-underline"
        >
          {help.label}
        </Link>
      )}
    </div>
  );
}

function safeStringify(value: unknown): string {
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return "<<unserializable output>>";
  }
}

function durationLabel(startedAtIso: string, finishedAtIso: string): string {
  const startMs = Date.parse(startedAtIso);
  const endMs = Date.parse(finishedAtIso);
  if (!Number.isFinite(startMs) || !Number.isFinite(endMs)) return "";
  const ms = Math.max(0, endMs - startMs);
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60_000) return `${(ms / 1000).toFixed(1)}s`;
  const minutes = Math.floor(ms / 60_000);
  const seconds = Math.floor((ms % 60_000) / 1000);
  return `${minutes}m ${seconds}s`;
}
