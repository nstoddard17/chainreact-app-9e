"use client";

import * as React from "react";
import { Button } from "@/components/ui/button";
import type {
  LiveTestDisclosureEffect,
  LiveTestSessionStatusDto,
} from "@/lib/api/liveTest";
import type { LiveTestPhase } from "./useLiveTestSession";

/**
 * Run Live Test modal (WORKFLOW-LIVE-TEST-4 §4/§5) — presentational consumer of
 * `useLiveTestSession`. One dialog walks the whole journey:
 *
 *   reviewing  → the side-effect DISCLOSURE (server-generated; rendered verbatim) + the
 *                explicit "Start listening" consent action. Opening this screen has caused
 *                NOTHING external — closing here abandons an awaiting-consent row, that's all.
 *   active     → honest server state: listening (with countdown + cancel), captured (safe
 *                preview), running (run handed to the builder's results tracker), and the
 *                terminal outcomes. Every line reflects the polled session DTO — the UI never
 *                claims a state the server hasn't confirmed.
 *   error      → typed recovery only: re-review after drift, cancel the blocking session,
 *                retry a failed start. Never a dead end, never a fake retry.
 *
 * The modal shows metadata only: provider labels, operation display names, step names, the safe
 * sender/subject/time preview. No tokens, no config values, no raw payloads (the DTOs can't
 * carry them).
 */

export interface LiveTestModalProps {
  phase: LiveTestPhase;
  busy: boolean;
  onStart: () => void;
  onCancelSession: () => void;
  onCancelBlockingAndRetry: () => void;
  onRetry: () => void;
  onClose: () => void;
}

const KIND_LABEL: Record<LiveTestDisclosureEffect["kind"], string> = {
  reads: "Reads",
  creates: "Creates",
  sends: "Sends",
  updates: "Updates",
  deletes: "Deletes",
  changes: "Changes",
};

export function LiveTestModal({
  phase,
  busy,
  onStart,
  onCancelSession,
  onCancelBlockingAndRetry,
  onRetry,
  onClose,
}: LiveTestModalProps): React.ReactElement | null {
  if (phase.kind === "idle") return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="live-test-modal-title"
      data-testid="live-test-modal"
      onKeyDown={(e) => {
        if (e.key === "Escape") {
          e.preventDefault();
          onClose();
        }
      }}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
    >
      <div className="flex max-h-[90vh] w-full max-w-lg flex-col gap-4 overflow-y-auto rounded border border-input bg-card p-6 shadow-lg">
        <header className="flex items-start justify-between gap-2">
          <h2 id="live-test-modal-title" className="text-lg font-semibold">
            Run Live Test
          </h2>
          <Button
            type="button"
            size="sm"
            variant="ghost"
            onClick={onClose}
            data-testid="live-test-close"
            aria-label="Close live test dialog"
          >
            ✕
          </Button>
        </header>

        {phase.kind === "preparing" ? (
          <p role="status" className="text-sm text-muted-foreground">
            Checking this workflow&rsquo;s real side effects…
          </p>
        ) : null}

        {phase.kind === "reviewing" || phase.kind === "starting" ? (
          <DisclosureBody
            phase={phase}
            busy={busy}
            onStart={onStart}
            onClose={onClose}
          />
        ) : null}

        {phase.kind === "active" ? (
          <ActiveBody
            session={phase.session}
            advisory={phase.advisory}
            busy={busy}
            onCancelSession={onCancelSession}
            onClose={onClose}
          />
        ) : null}

        {phase.kind === "error" ? (
          <ErrorBody
            phase={phase}
            busy={busy}
            onRetry={onRetry}
            onRetryStart={onStart}
            onCancelBlockingAndRetry={onCancelBlockingAndRetry}
            onClose={onClose}
          />
        ) : null}
      </div>
    </div>
  );
}

function DisclosureBody({
  phase,
  busy,
  onStart,
  onClose,
}: {
  phase: Extract<LiveTestPhase, { kind: "reviewing" | "starting" }>;
  busy: boolean;
  onStart: () => void;
  onClose: () => void;
}): React.ReactElement {
  const { disclosure, trigger } = phase.prep;
  return (
    <>
      <p className="text-sm text-muted-foreground">
        This runs your workflow once, for real, using one real{" "}
        <span className="font-medium text-foreground">
          {trigger.provider} {trigger.eventType.replace(/_/g, " ")}
        </span>{" "}
        event. Review what it will do before starting.
      </p>

      <ul
        aria-label="Real external effects"
        data-testid="live-test-disclosure-effects"
        className="flex flex-col gap-2"
      >
        {disclosure.effects.map((effect) => (
          <li
            key={effect.nodeId}
            data-testid={`live-test-effect-${effect.nodeId}`}
            className={
              "flex flex-col gap-0.5 rounded border p-3 " +
              (effect.requiresAttention
                ? "border-rose-500/50 bg-rose-500/5"
                : "border-input bg-background")
            }
          >
            <div className="flex items-center justify-between gap-2">
              <span className="text-sm font-medium">
                {KIND_LABEL[effect.kind]} · {effect.operation}
              </span>
              <span className="text-xs text-muted-foreground">{effect.providerLabel}</span>
            </div>
            {effect.stepName ? (
              <p className="text-xs text-muted-foreground">Step: {effect.stepName}</p>
            ) : null}
            {effect.mayBeIrreversible ? (
              <p className="text-xs font-medium text-rose-700 dark:text-rose-300">
                May not be reversible.
              </p>
            ) : null}
            {effect.riskDescription ? (
              <p className="text-xs text-muted-foreground">{effect.riskDescription}</p>
            ) : null}
          </li>
        ))}
      </ul>

      {disclosure.internalSteps.length > 0 ? (
        <p className="text-xs text-muted-foreground" data-testid="live-test-internal-steps">
          Internal steps (no external effect):{" "}
          {disclosure.internalSteps.map((s) => s.operation).join(", ")}
        </p>
      ) : null}

      <ul
        aria-label="What starting means"
        data-testid="live-test-disclosure-statements"
        className="flex list-disc flex-col gap-1 pl-5 text-xs text-muted-foreground"
      >
        {disclosure.statements.map((statement) => (
          <li key={statement}>{statement}</li>
        ))}
      </ul>

      <footer className="flex justify-end gap-2">
        <Button
          type="button"
          variant="outline"
          onClick={onClose}
          disabled={busy}
          data-testid="live-test-review-cancel"
        >
          Cancel
        </Button>
        <Button
          type="button"
          variant="destructive"
          onClick={onStart}
          disabled={busy}
          data-testid="live-test-start-button"
        >
          {phase.kind === "starting" ? "Starting…" : "Start listening"}
        </Button>
      </footer>
    </>
  );
}

function ActiveBody({
  session,
  advisory,
  busy,
  onCancelSession,
  onClose,
}: {
  session: LiveTestSessionStatusDto;
  advisory: "usage_limit_reached" | "capture_error" | null;
  busy: boolean;
  onCancelSession: () => void;
  onClose: () => void;
}): React.ReactElement {
  const preview = session.triggerPreview;
  return (
    <>
      {session.status === "waiting_for_trigger" ? (
        <div className="flex flex-col gap-2" data-testid="live-test-waiting">
          <p role="status" className="text-sm font-medium">
            Listening for a real matching event…
          </p>
          <p className="text-sm text-muted-foreground">
            Trigger it now — for a Gmail trigger, send an email that matches this
            workflow&rsquo;s filters to the connected inbox.
          </p>
          <ExpiryCountdown expiresAt={session.expiresAt} />
        </div>
      ) : null}

      {session.status === "trigger_received" || session.status === "authorizing_execution" ? (
        <p role="status" className="text-sm font-medium" data-testid="live-test-captured">
          Event captured — starting the run…
        </p>
      ) : null}

      {session.status === "running" ? (
        <p role="status" className="text-sm font-medium" data-testid="live-test-running">
          Workflow is running with the captured event…
        </p>
      ) : null}

      {session.status === "succeeded" ? (
        <p role="status" className="text-sm font-medium" data-testid="live-test-succeeded">
          Live test finished. The workflow ran once and remains inactive.
        </p>
      ) : null}

      {session.status === "failed" ? (
        <div className="flex flex-col gap-1" data-testid="live-test-failed">
          <p role="alert" className="text-sm font-medium text-destructive">
            {session.failureCode === "run_failed"
              ? "The live test ran but the workflow failed."
              : "The live test could not run."}
          </p>
          {session.failureMessage ? (
            <p className="text-sm text-muted-foreground">{session.failureMessage}</p>
          ) : null}
        </div>
      ) : null}

      {session.status === "cancelled" ? (
        <p role="status" className="text-sm" data-testid="live-test-cancelled">
          Live test cancelled. Nothing was executed.
        </p>
      ) : null}

      {session.status === "expired" ? (
        <p role="status" className="text-sm" data-testid="live-test-expired">
          No matching event arrived in time. Nothing was executed — you can start another
          live test whenever you&rsquo;re ready.
        </p>
      ) : null}

      {preview ? (
        <dl
          data-testid="live-test-preview"
          className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 rounded border border-input bg-background p-3 text-xs"
        >
          {preview.from ? (
            <>
              <dt className="text-muted-foreground">From</dt>
              <dd className="truncate">{preview.from}</dd>
            </>
          ) : null}
          {preview.subject ? (
            <>
              <dt className="text-muted-foreground">Subject</dt>
              <dd className="truncate">{preview.subject}</dd>
            </>
          ) : null}
          {preview.receivedAt ? (
            <>
              <dt className="text-muted-foreground">Received</dt>
              <dd>{new Date(preview.receivedAt).toLocaleString()}</dd>
            </>
          ) : null}
        </dl>
      ) : null}

      {advisory === "usage_limit_reached" ? (
        <p role="alert" className="text-sm text-amber-700 dark:text-amber-300" data-testid="live-test-advisory">
          Your account&rsquo;s task limit is reached, so the captured event can&rsquo;t run
          yet. The capture is kept until this session expires — upgrade or free up tasks,
          and it will run on its own.
        </p>
      ) : null}
      {advisory === "capture_error" ? (
        <p role="status" className="text-sm text-muted-foreground" data-testid="live-test-advisory">
          Having trouble checking for new events — still trying.
        </p>
      ) : null}

      {session.workflowRunId && (session.status === "running" || session.status === "succeeded" || session.status === "failed") ? (
        <p className="text-xs text-muted-foreground" data-testid="live-test-run-link">
          The run appears in this workflow&rsquo;s Runs tab labeled{" "}
          <span className="font-medium">Live test</span>.
        </p>
      ) : null}

      <footer className="flex justify-end gap-2">
        {session.canCancel ? (
          <Button
            type="button"
            variant="outline"
            onClick={onCancelSession}
            disabled={busy}
            data-testid="live-test-cancel-button"
          >
            {busy ? "Cancelling…" : "Cancel live test"}
          </Button>
        ) : null}
        <Button type="button" onClick={onClose} data-testid="live-test-done-button">
          {session.canCancel ? "Hide" : "Done"}
        </Button>
      </footer>
    </>
  );
}

function ErrorBody({
  phase,
  busy,
  onRetry,
  onRetryStart,
  onCancelBlockingAndRetry,
  onClose,
}: {
  phase: Extract<LiveTestPhase, { kind: "error" }>;
  busy: boolean;
  onRetry: () => void;
  onRetryStart: () => void;
  onCancelBlockingAndRetry: () => void;
  onClose: () => void;
}): React.ReactElement {
  return (
    <>
      <p role="alert" className="text-sm text-destructive" data-testid="live-test-error">
        {phase.message}
      </p>
      <footer className="flex justify-end gap-2">
        <Button type="button" variant="outline" onClick={onClose} disabled={busy}>
          Close
        </Button>
        {phase.recovery === "re_prepare" ? (
          <Button type="button" onClick={onRetry} disabled={busy} data-testid="live-test-reprepare">
            Review again
          </Button>
        ) : null}
        {phase.recovery === "retry_start" ? (
          <Button type="button" onClick={onRetryStart} disabled={busy} data-testid="live-test-retry-start">
            Try again
          </Button>
        ) : null}
        {phase.recovery === "cancel_existing" && phase.blockingSessionId ? (
          <Button
            type="button"
            onClick={onCancelBlockingAndRetry}
            disabled={busy}
            data-testid="live-test-cancel-existing"
          >
            Cancel it and start over
          </Button>
        ) : null}
      </footer>
    </>
  );
}

/** Simple once-a-second countdown to the listening window's end. */
function ExpiryCountdown({ expiresAt }: { expiresAt: string }): React.ReactElement | null {
  const [now, setNow] = React.useState(() => Date.now());
  React.useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);
  const remainingMs = Date.parse(expiresAt) - now;
  if (!Number.isFinite(remainingMs)) return null;
  const clamped = Math.max(0, remainingMs);
  const minutes = Math.floor(clamped / 60_000);
  const seconds = Math.floor((clamped % 60_000) / 1000);
  return (
    <p className="text-xs text-muted-foreground" data-testid="live-test-countdown">
      Listening for another {minutes}:{seconds.toString().padStart(2, "0")} — if nothing
      matches by then, the test ends with no run.
    </p>
  );
}
