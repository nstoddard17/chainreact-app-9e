"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { useComposerSeed, type ComposerSeed } from "@/features/workflows/composerSeed";
import type { DocumentAgentChangeRef, DocumentAgentContext } from "./documentAgentContext";

/**
 * Document Builder — the bottom React Agent workspace (DOC-REACT-AGENT-1).
 *
 * THE single React Agent entry point in Document mode. The compact composer
 * stays anchored below the document; submitting expands a contextual workspace
 * UPWARD from it — never a second full-height chat panel, never a modal, never
 * a navigation away from the readable workflow.
 *
 * It renders the SAME conversation the Visual builder's left rail renders (the
 * transcript is passed in as `children`; `WorkflowBuilder` owns the one
 * `useGuidanceConversation` instance), so switching modes changes only the
 * presentation. The workspace itself owns no conversation, no proposal format,
 * and no workflow mutation: Apply / Dismiss are the existing preview actions,
 * handed down from the builder.
 *
 * Layout: `sticky bottom` inside the document's scroll column, capped height
 * with internal scrolling, collapsible back to the compact bar. A short reply
 * therefore never permanently shrinks the document.
 */
export function DocumentAgentWorkspace({
  expanded,
  onExpandedChange,
  busy,
  hasConversation,
  context,
  onClearContext,
  onSubmit,
  onCheckWorkflow,
  changes,
  onFocusChange,
  proposalActions,
  statusMessage,
  seed,
  children,
}: {
  expanded: boolean;
  onExpandedChange: (next: boolean) => void;
  /** True while a request is in flight (drives the live status line). */
  busy: boolean;
  /** True once the conversation has any content worth re-opening. */
  hasConversation: boolean;
  context: DocumentAgentContext;
  onClearContext: () => void;
  /** Send a request through the SHARED conversation (never a second store). */
  onSubmit: (prompt: string) => void;
  /** The existing deterministic, local, no-credit workflow review. */
  onCheckWorkflow?: (() => void) | undefined;
  /** Sentences a pending proposal touches (from the existing preview projection). */
  changes?: readonly DocumentAgentChangeRef[] | undefined;
  /** Focus + highlight one live sentence referenced by the agent. */
  onFocusChange?: ((nodeId: string) => void) | undefined;
  /** Apply / Dismiss / Review — the EXISTING preview controls, rendered here. */
  proposalActions?: ReactNode;
  /** Polite status text announced to assistive tech (analysis, proposal, applied). */
  statusMessage?: string | null | undefined;
  /**
   * The EXISTING keyed/versioned composer seed (features/workflows/composerSeed).
   * The empty-state composer and the insertion menu's "Ask React to add it"
   * prefill this ONE composer — they never open a second conversation and never
   * auto-send.
   */
  seed?: ComposerSeed | undefined;
  /** The shared conversation transcript. */
  children?: ReactNode;
}) {
  const [value, setValue] = useState("");
  const transcriptRef = useRef<HTMLDivElement | null>(null);
  // Reuse the one seed primitive — a Document control prefills this composer.
  useComposerSeed(seed, setValue);

  // Keep the newest content in view as the conversation grows, matching the rail.
  useEffect(() => {
    if (!expanded) return;
    const el = transcriptRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [expanded, busy, statusMessage]);

  const submit = () => {
    const trimmed = value.trim();
    // REACT-AGENT-TRUTH-AND-TURN-INTEGRITY-AUDIT-1 — while a request is in flight the conversation
    // refuses new sends; without this guard the composer CLEARED the message and the send was then
    // silently dropped. Refusing here keeps the user's text in the box instead of losing it.
    if (trimmed.length === 0 || busy) return;
    setValue("");
    onExpandedChange(true);
    onSubmit(trimmed);
  };

  const changeList = changes ?? [];

  return (
    <section
      data-testid="document-agent-workspace"
      data-expanded={expanded ? "true" : "false"}
      aria-label="React Agent"
      className="crv2-agent-dock sticky bottom-3 z-20 mx-auto mt-4 w-full max-w-[860px]"
    >
      {expanded ? (
        <div
          data-testid="document-agent-panel"
          className="crv2-agent-panel"
        >
          <header className="crv2-agent-head">
            <span aria-hidden className="crv2-agent-mark">
              ✳
            </span>
            <span className="text-[12.5px] font-semibold" style={{ color: "var(--builder-text)" }}>
              React Agent
            </span>
            {busy ? (
              <span
                data-testid="document-agent-busy"
                className="text-[11.5px]"
                style={{ color: "var(--builder-muted)" }}
              >
                Working…
              </span>
            ) : null}
            <button
              type="button"
              data-testid="document-agent-collapse"
              onClick={() => onExpandedChange(false)}
              aria-label="Collapse React Agent"
              aria-expanded={true}
              className="crv2-agent-icon ml-auto"
              title="Collapse React Agent"
            >
              <span aria-hidden>▾</span>
            </button>
          </header>

          {/* Status changes (analysing / proposal ready / applied / failed) are
              announced politely — never by stealing focus. */}
          <p role="status" aria-live="polite" className="sr-only" data-testid="document-agent-status">
            {statusMessage ?? (busy ? "React is working on your request." : "")}
          </p>

          <div
            ref={transcriptRef}
            data-testid="document-agent-transcript"
            className="crv2-agent-body"
          >
            {children}
          </div>

          {changeList.length > 0 ? (
            <div data-testid="document-agent-changes" className="crv2-agent-changes">
              <p className="m-0 text-[11.5px] font-semibold" style={{ color: "var(--builder-text-2)" }}>
                This would change:
              </p>
              <ul className="m-0 mt-1.5 flex flex-wrap gap-1.5 p-0">
                {changeList.map((change, i) => (
                  <li key={`${change.nodeId ?? "new"}-${i}`} className="list-none">
                    {change.nodeId && onFocusChange ? (
                      <button
                        type="button"
                        data-testid={`document-agent-change-${change.nodeId}`}
                        data-change-status={change.status}
                        onClick={() => onFocusChange(change.nodeId!)}
                        className="crv2-agent-ref"
                        aria-label={`Show “${change.title}” in the workflow (${change.status})`}
                      >
                        <span className="crv2-agent-ref-dot" data-status={change.status} aria-hidden />
                        {change.title}
                      </button>
                    ) : (
                      <span className="crv2-agent-ref crv2-agent-ref--static" data-change-status={change.status}>
                        <span className="crv2-agent-ref-dot" data-status={change.status} aria-hidden />
                        {change.title}
                      </span>
                    )}
                  </li>
                ))}
              </ul>
              {proposalActions ? <div className="mt-2">{proposalActions}</div> : null}
            </div>
          ) : null}
        </div>
      ) : null}

      {/* The compact composer — always available, expanded or not. */}
      <div data-testid="document-ask-react-bar" className="crv2-agent-bar">
        <span aria-hidden className="pl-2 text-[13px]" style={{ color: "var(--builder-muted)" }}>
          ✳
        </span>
        {context.kind !== "workflow" ? (
          <span data-testid="document-agent-context" data-context-kind={context.kind} className="crv2-agent-context">
            <span className="truncate">Working on: {context.label}</span>
            <button
              type="button"
              data-testid="document-agent-context-clear"
              onClick={onClearContext}
              aria-label={`Stop working on ${context.label}`}
              className="crv2-agent-context-clear"
              title="Work on the whole workflow instead"
            >
              <span aria-hidden>✕</span>
            </button>
          </span>
        ) : (
          <span
            data-testid="document-agent-context"
            data-context-kind="workflow"
            className="crv2-agent-context crv2-agent-context--whole"
          >
            Working on: Whole workflow
          </span>
        )}
        <input
          type="text"
          data-testid="document-ask-react-input"
          aria-label="Ask React"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              submit();
            }
          }}
          placeholder="Ask React to add, change, explain, or fix something…"
          className="min-w-0 flex-1 bg-transparent px-1 py-1 text-[13px] outline-none"
          style={{ color: "var(--builder-text)" }}
        />
        {onCheckWorkflow ? (
          <button
            type="button"
            data-testid="document-agent-check-workflow"
            onClick={() => {
              onExpandedChange(true);
              onCheckWorkflow();
            }}
            className="crv2-agent-icon shrink-0"
            aria-label="Check workflow"
            title="Run an instant, local review of this workflow (no AI credits used)"
          >
            <span aria-hidden>✓</span>
          </button>
        ) : null}
        {!expanded && hasConversation ? (
          <button
            type="button"
            data-testid="document-agent-expand"
            onClick={() => onExpandedChange(true)}
            className="crv2-agent-icon shrink-0"
            aria-label="Show React Agent conversation"
            aria-expanded={false}
            title="Show the conversation"
          >
            <span aria-hidden>▴</span>
          </button>
        ) : null}
        <button
          type="button"
          data-testid="document-ask-react-submit"
          onClick={submit}
          disabled={value.trim().length === 0 || busy}
          className="inline-flex h-7 shrink-0 items-center rounded-full px-3 text-[12px] font-semibold disabled:opacity-40"
          style={{ background: "var(--builder-text)", color: "var(--builder-panel)" }}
        >
          Ask React
        </button>
      </div>
    </section>
  );
}
