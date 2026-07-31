"use client";

import type { WorkflowRunStep, WorkflowRunSummary } from "@/contracts/workflow";
import { WorkflowApiError } from "@/lib/api/workflows";

/**
 * Slice 4.BUILDER-RUNS-TAB-1 — pure presentational primitives + formatters for
 * the builder Runs tab (`RunsPanel.tsx`). Kept side-effect-free and store-free
 * so the stateful panel stays readable and these pieces are trivially testable.
 *
 * NONE of these render per-step OUTPUT, raw trigger payloads, tokens, or
 * credential ids — the Runs tab is execution history/debugging and only ever
 * surfaces status + the server-humanized error.
 */

/** Friendly stand-in when a run step references a node no longer on the canvas. */
export const MISSING_NODE_LABEL = "a step that's no longer in this workflow";

export const SOURCE_LABEL: Record<
  NonNullable<WorkflowRunSummary["triggeredBy"]>,
  string
> = {
  manual: "Manual run",
  test: "Test run",
  webhook: "Webhook run",
  scheduled: "Scheduled run",
  retry: "Retried run",
  api_key: "API run",
  unknown: "Run",
};

export type RowStatus = "succeeded" | "failed" | "skipped" | "running";

export function StatusBadge({ status }: { status: RowStatus }) {
  const label =
    status === "succeeded"
      ? "Success"
      : status === "failed"
        ? "Failed"
        : status === "running"
          ? "Running"
          : "Skipped";
  const tone =
    status === "succeeded"
      ? "bg-emerald-100 text-emerald-900 dark:bg-emerald-500/20 dark:text-emerald-300"
      : status === "failed"
        ? "bg-red-100 text-red-900 dark:bg-red-500/20 dark:text-red-300"
        : status === "running"
          ? "bg-sky-100 text-sky-900 dark:bg-sky-500/20 dark:text-sky-300"
          : "bg-zinc-100 text-zinc-900 dark:bg-zinc-500/20 dark:text-zinc-300";
  return (
    <span
      className={`rounded px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide ${tone}`}
      data-status-kind={status}
    >
      {label}
    </span>
  );
}

export function TestTag() {
  return (
    <span
      data-testid="run-test-tag"
      className="rounded px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide bg-amber-100 text-amber-900 dark:bg-amber-500/20 dark:text-amber-300"
    >
      Test
    </span>
  );
}

/**
 * WORKFLOW-LIVE-TEST-4 — a CONSENTED live test. Distinct from TestTag because
 * "Test" implies no external calls, and a live test made real ones under an
 * explicit consent. Rose tint keeps the "this touched real systems" signal.
 */
export function LiveTestTag() {
  return (
    <span
      data-testid="run-live-test-tag"
      className="rounded px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide bg-rose-100 text-rose-900 dark:bg-rose-500/20 dark:text-rose-300"
    >
      Live test
    </span>
  );
}

export function ClassifiedErrorBlock({
  classification,
}: {
  classification: NonNullable<WorkflowRunSummary["errorClassification"]>;
}) {
  return (
    <div
      role={classification.severity === "error" ? "alert" : "status"}
      className="flex min-w-0 flex-col gap-0.5 rounded bg-muted p-2.5 text-[12px]"
      data-severity={classification.severity}
      data-testid="run-error-classification"
    >
      {/* Long provider prose wraps — it is human-readable text, so it must never
          need panning and must never be clipped. */}
      <span className="break-words font-medium">{classification.title}</span>
      <span className="break-words text-muted-foreground">{classification.description}</span>
      {classification.hint ? (
        <span className="break-words text-muted-foreground">
          <span className="font-medium">Hint: </span>
          {classification.hint}
        </span>
      ) : null}
    </div>
  );
}

export function StepTimeline({
  steps,
  labelForNodeId,
}: {
  steps: readonly WorkflowRunStep[];
  labelForNodeId: (nodeId: string) => string;
}) {
  if (steps.length === 0) {
    return (
      <p className="text-[12px]" style={{ color: "var(--builder-muted)" }}>
        No step records — the engine reported zero steps for this run.
      </p>
    );
  }
  return (
    <ol className="flex flex-col gap-1.5" aria-label="Run steps">
      {steps.map((step, idx) => {
        const failed = step.status === "failed";
        return (
          <li key={`${step.nodeId}-${idx}`}>
            <div
              data-testid={`run-step-${step.nodeId}`}
              data-status={step.status}
              className="flex min-w-0 flex-col gap-1 rounded-[6px] border p-2"
              style={{
                borderColor: failed ? "rgb(220 38 38 / 0.5)" : "var(--builder-border)",
                background: failed ? "rgb(220 38 38 / 0.06)" : "var(--builder-panel)",
              }}
            >
              {/*
                RESPONSIVE-BUILDER-RUNS-6 — the step order number and the status
                badge hold their intrinsic size (they are the two things that must
                stay scannable down a column of steps); the NODE NAME is the part
                that yields. It wraps rather than truncating, because a step card
                has a full line for it and a half-shown node name is not much use
                when you are trying to work out which step failed.

                Previously the name carried `truncate` inside a row with no
                `min-w-0` and non-shrinking siblings, so it burst out of its own
                row instead of ellipsising.
              */}
              <div className="flex min-w-0 flex-wrap items-center gap-2">
                <span
                  className="shrink-0 text-[11px]"
                  style={{ color: "var(--builder-muted)" }}
                >
                  {idx + 1}.
                </span>
                <span className="shrink-0">
                  <StatusBadge status={step.status} />
                </span>
                <span
                  className="min-w-0 flex-1 break-words text-[12px]"
                  style={{ color: "var(--builder-text)" }}
                  title={step.nodeId}
                  data-legible-min="140"
                  data-legible-what="step identity"
                >
                  {labelForNodeId(step.nodeId)}
                </span>
              </div>
              {/* Server-humanized, identifier-free message only — never raw output. */}
              {step.error ? (
                <p className="min-w-0 break-words text-[11.5px] text-destructive">
                  {step.error.message}
                </p>
              ) : null}
            </div>
          </li>
        );
      })}
    </ol>
  );
}

export function messageFrom(err: unknown, fallback: string): string {
  if (err instanceof WorkflowApiError) return err.message;
  if (err instanceof Error) return err.message;
  return fallback;
}

/** Source rows show source + duration; absolute timestamp (no "x min ago") keeps
 *  rendering deterministic and free of hydration drift (RunHistory's convention). */
export function metaLine(run: WorkflowRunSummary): string {
  const duration = durationLabel(run.startedAt, run.finishedAt);
  const started = formatTimestamp(run.startedAt);
  return duration ? `${started} · ${duration}` : started;
}

export function formatTimestamp(iso: string): string {
  return iso.replace("T", " ").replace(/\..*$/, " UTC").replace(/Z$/, " UTC");
}

export function durationLabel(startedAtIso: string, finishedAtIso: string): string {
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
