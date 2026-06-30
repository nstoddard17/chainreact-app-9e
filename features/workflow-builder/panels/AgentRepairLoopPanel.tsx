"use client";

import { useCallback, type ReactNode } from "react";
import { useGraphSlice } from "../state/graphSlice";
import { useConfigSlice } from "../state/configSlice";
import { useRunControls } from "../hooks/useRunControls";
import { useRepairLoopStore, type AgentRepairLoop } from "../state/repairLoopStore";
import { buildRepairReveal } from "../hooks/useAgentRepairLoop";

/**
 * REACT-AGENT-TEST-FIX-LOOP — the guided "test → fix → retest" narrative for the
 * latest failed test run. Renders near the top of the failed-run section of
 * RunResultsPanel; the classified error block, step list, and AI repair block
 * stay rendered beneath it (this panel is additive, not a replacement).
 *
 * The thread is owned by `repairLoopStore` and advanced by `useAgentRepairLoop`
 * (mounted at the builder root). This panel only READS the thread and offers two
 * real, wired actions:
 *   - Open the failing step (→ `configSlice.revealNode`, reusing the existing
 *     open/highlight path; field highlight only when proven).
 *   - Retest after fix (→ the existing `useRunControls().handleTestWorkflow`,
 *     a TEST run — external actions are skipped; no second run path is created).
 *
 * No-leak: every visible string is a humanized `safeReason` / safe label / fixed
 * copy. Raw provider errors live (sanitized) in the step list below, never here.
 */
export function AgentRepairLoopPanel({ workflowId }: { workflowId: string }) {
  const loop = useRepairLoopStore((s) => s.loop);
  const markFieldOpened = useRepairLoopStore((s) => s.markFieldOpened);
  const pendingNodes = useGraphSlice((s) => s.pendingNodes);
  const revealNode = useConfigSlice((s) => s.revealNode);
  const { handleTestWorkflow, anyRunning } = useRunControls();

  const reveal = buildRepairReveal(loop, pendingNodes);

  const handleOpen = useCallback(() => {
    if (!reveal) return;
    revealNode(reveal);
    markFieldOpened({ workflowId });
  }, [reveal, revealNode, markFieldOpened, workflowId]);

  const handleRetest = useCallback(() => {
    void handleTestWorkflow();
  }, [handleTestWorkflow]);

  // Only render this workflow's active thread.
  if (!loop || loop.workflowId !== workflowId || loop.status === "idle") return null;

  return (
    <section
      aria-label="Guided repair"
      data-testid="agent-repair-loop"
      data-status={loop.status}
      className="flex flex-col gap-2 rounded border p-3"
      style={{
        borderColor: "var(--builder-border)",
        background: "var(--builder-panel)",
      }}
    >
      <Narrative
        loop={loop}
        canOpen={reveal !== null}
        anyRunning={anyRunning}
        onOpen={handleOpen}
        onRetest={handleRetest}
      />
    </section>
  );
}

function Narrative({
  loop,
  canOpen,
  anyRunning,
  onOpen,
  onRetest,
}: {
  loop: AgentRepairLoop;
  canOpen: boolean;
  anyRunning: boolean;
  onOpen: () => void;
  onRetest: () => void;
}) {
  if (loop.status === "retesting") {
    return (
      <p role="status" data-testid="agent-repair-message" className="text-[12.5px]" style={{ color: "var(--builder-muted)" }}>
        Retesting… checking whether your fix worked.
      </p>
    );
  }

  if (loop.status === "test_passed") {
    return (
      <>
        <Heading icon="✓" tone="ok">Test passed</Heading>
        <p data-testid="agent-repair-message" className="text-[12.5px]" style={{ color: "var(--builder-text)" }}>
          {passedMessage(loop)} You can now save, activate, or continue editing.
        </p>
      </>
    );
  }

  if (loop.status === "retest_failed_to_start") {
    return (
      <>
        <Heading icon="!" tone="warn">Couldn&rsquo;t start the retest</Heading>
        <p data-testid="agent-repair-message" className="text-[12.5px]" style={{ color: "var(--builder-text)" }}>
          The retest didn&rsquo;t start. Check your connection and try again.
        </p>
        <Actions>
          <RetestButton anyRunning={anyRunning} onRetest={onRetest} />
        </Actions>
      </>
    );
  }

  // test_failed | field_opened | still_failing — the guided failure summary.
  const stillFailing = loop.status === "still_failing";
  const fieldOpened = loop.status === "field_opened";
  return (
    <>
      <Heading icon="!" tone="warn">
        {stillFailing ? "Still needs attention" : "Failed test detected"}
      </Heading>
      {stillFailing ? (
        <p data-testid="agent-repair-attempt" className="text-[11.5px]" style={{ color: "var(--builder-muted)" }}>
          Attempt {loop.attemptCount} — here&rsquo;s what to fix next.
        </p>
      ) : null}
      <ol data-testid="agent-repair-steps" className="flex list-decimal flex-col gap-1 pl-4 text-[12.5px]" style={{ color: "var(--builder-text)" }}>
        <li>{whatFailedLine(loop)}</li>
        <li>{openedLine(loop, fieldOpened)}</li>
        <li>Fix it, then retest.</li>
      </ol>
      <Actions>
        {canOpen ? (
          <button
            type="button"
            onClick={onOpen}
            data-testid="agent-repair-open-field"
            className="rounded-[6px] border px-2.5 py-1 text-[12px]"
            style={{
              borderColor: "var(--builder-border)",
              color: "var(--builder-text)",
              background: "var(--builder-panel)",
            }}
          >
            {openButtonLabel(loop)}
          </button>
        ) : null}
        <RetestButton anyRunning={anyRunning} onRetest={onRetest} />
      </Actions>
    </>
  );
}

function RetestButton({ anyRunning, onRetest }: { anyRunning: boolean; onRetest: () => void }) {
  return (
    <button
      type="button"
      onClick={onRetest}
      disabled={anyRunning}
      data-testid="agent-repair-retest"
      title="Re-runs this workflow in test mode — external actions are skipped and nothing is saved."
      className="rounded-[6px] border px-2.5 py-1 text-[12px] disabled:opacity-50"
      style={{
        borderColor: "var(--builder-border)",
        color: "var(--builder-text)",
        background: "var(--builder-panel)",
      }}
    >
      {anyRunning ? "Retesting…" : "Retest after fix"}
    </button>
  );
}

function Actions({ children }: { children: ReactNode }) {
  return (
    <div className="flex flex-wrap items-center gap-2" data-testid="agent-repair-actions">
      {children}
    </div>
  );
}

function Heading({
  icon,
  tone,
  children,
}: {
  icon: string;
  tone: "ok" | "warn";
  children: ReactNode;
}) {
  const color =
    tone === "ok"
      ? "text-emerald-700 dark:text-emerald-300"
      : "text-amber-700 dark:text-amber-300";
  return (
    <h4 className={`flex items-center gap-1.5 text-[13px] font-semibold ${color}`}>
      <span aria-hidden>{icon}</span>
      {children}
    </h4>
  );
}

/** "The Send Email step failed. <safe reason>" — node label is a safe display name. */
function whatFailedLine(loop: AgentRepairLoop): string {
  const where = loop.failingNodeLabel ? `The ${loop.failingNodeLabel} step failed.` : "A step in this workflow failed.";
  return `${where} ${loop.safeReason}`.trim();
}

/** The "what I opened" line — names a field only when one is proven. */
function openedLine(loop: AgentRepairLoop, opened: boolean): string {
  const target = loop.failingFieldLabel ?? loop.failingFieldPath;
  if (opened) {
    return target
      ? `I opened the ${target} field for you.`
      : "I opened the failing step for you. Review this step's configuration.";
  }
  return target
    ? `Open the ${target} field and fill it in.`
    : "Open the failing step and review this step's configuration.";
}

function openButtonLabel(loop: AgentRepairLoop): string {
  const target = loop.failingFieldLabel ?? loop.failingFieldPath;
  return target ? `Open the ${target} field` : "Open the failing step";
}

function passedMessage(loop: AgentRepairLoop): string {
  return loop.failingNodeLabel
    ? `The ${loop.failingNodeLabel} step ran cleanly this time.`
    : "The workflow ran cleanly this time.";
}
