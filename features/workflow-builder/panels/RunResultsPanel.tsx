"use client";

import { useState } from "react";
import type { WorkflowRunStep } from "@/contracts/workflow";
import { useRunSlice } from "../state/runSlice";

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
export function RunResultsPanel() {
  const status = useRunSlice((s) => s.status);
  const runId = useRunSlice((s) => s.runId);
  const detail = useRunSlice((s) => s.detail);
  const fetchError = useRunSlice((s) => s.fetchError);
  const pollCount = useRunSlice((s) => s.pollCount);

  return (
    <section
      aria-label="Latest run results"
      className="flex flex-col gap-2 rounded border border-input bg-card p-3"
      data-status={status}
    >
      <header className="flex items-center justify-between gap-2">
        <h3 className="text-sm font-medium">Latest run</h3>
        {runId ? (
          <code className="text-xs text-muted-foreground" data-testid="run-id">
            {runId}
          </code>
        ) : null}
      </header>
      {fetchError && status !== "succeeded" && status !== "failed" ? (
        <p role="alert" className="text-xs text-destructive">
          {fetchError}
        </p>
      ) : null}
      <Body status={status} detail={detail} pollCount={pollCount} />
    </section>
  );
}

function Body({
  status,
  detail,
  pollCount,
}: {
  status: ReturnType<typeof useRunSlice.getState>["status"];
  detail: ReturnType<typeof useRunSlice.getState>["detail"];
  pollCount: number;
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
      <RunStatusLine detail={detail} />
      {detail.fatalError ? <FatalErrorBlock error={detail.fatalError} /> : null}
      {detail.errorClassification ? (
        <ClassifiedErrorBlock classification={detail.errorClassification} />
      ) : null}
      <Steps steps={detail.steps} />
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
    <div className="flex items-center justify-between gap-3">
      <StatusPill status={detail.status} />
      <span className="text-xs text-muted-foreground">
        {succeeded ? "Succeeded" : "Failed"} ·{" "}
        {durationLabel(detail.startedAt, detail.finishedAt)}
      </span>
    </div>
  );
}

function Steps({ steps }: { steps: readonly WorkflowRunStep[] }) {
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
          <StepRow step={step} />
        </li>
      ))}
    </ol>
  );
}

function StepRow({ step }: { step: WorkflowRunStep }) {
  const [open, setOpen] = useState(false);
  const hasOutput = step.output !== undefined;
  return (
    <article
      className="flex flex-col gap-1 rounded border border-input p-2"
      data-status={step.status}
      data-testid={`step-${step.nodeId}`}
    >
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <StatusPill status={step.status} />
          <code className="text-xs text-muted-foreground truncate" title={step.nodeId}>
            {step.nodeId}
          </code>
        </div>
        {(hasOutput || step.error) && (
          <button
            type="button"
            className="text-xs text-muted-foreground underline-offset-2 hover:underline"
            onClick={() => setOpen((v) => !v)}
            aria-expanded={open}
            data-testid={`step-${step.nodeId}-toggle`}
          >
            {open ? "Hide output" : "View output"}
          </button>
        )}
      </div>
      {step.error ? (
        <p className="text-xs text-destructive">
          <span className="font-medium">{step.error.code}: </span>
          {step.error.message}
        </p>
      ) : null}
      {open && hasOutput ? (
        <pre
          className="max-h-48 overflow-auto rounded bg-muted p-2 text-xs"
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

function FatalErrorBlock({
  error,
}: {
  error: NonNullable<
    NonNullable<ReturnType<typeof useRunSlice.getState>["detail"]>["fatalError"]
  >;
}) {
  return (
    <div
      role="alert"
      className="flex flex-col gap-0.5 rounded bg-destructive/10 p-2 text-xs"
      data-testid="run-fatal-error"
    >
      <span className="font-medium">Fatal: {error.code}</span>
      <span className="text-muted-foreground">{error.message}</span>
    </div>
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
      className="flex flex-col gap-0.5 rounded bg-muted p-2 text-xs"
      data-severity={classification.severity}
      data-testid="run-error-classification"
    >
      <span className="font-medium">{classification.title}</span>
      <span className="text-muted-foreground">{classification.description}</span>
      {classification.hint ? (
        <span className="text-muted-foreground">
          <span className="font-medium">Hint: </span>
          {classification.hint}
        </span>
      ) : null}
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
