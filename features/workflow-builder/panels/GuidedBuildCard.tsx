"use client";

import type { ReactNode } from "react";
import type { AgentConnectionProvider } from "@/core/workflows/agentReadiness";
import {
  GUIDED_BUILD_STEPS,
  stepForStage,
  type GuidedBuildSnapshot,
} from "@/core/workflows/guidedBuildStage";
import { humanizeProviderSlug } from "@/core/workflows/options/optionsRecovery";
import type { GuidedConnectController } from "../hooks/useGuidedConnect";

/**
 * REACT-AGENT-GUIDED-BUILD-1 — the guided build card, rendered INSIDE the React
 * Agent rail transcript (the same footer slot the preview setup card uses).
 * One card, one current stage: Connect → Configure → Test → Activate.
 *
 * Presentational + wiring only:
 *   - The STAGE is a pure projection (`deriveGuidedBuildStage`) over the
 *     readiness verdict — this card never computes its own truth.
 *   - Connect buttons launch the existing OAuth flow in a popup via the
 *     `GuidedConnectController`; "Connected" comes ONLY from the refreshed
 *     server-resolved signal, never from the popup's claim.
 *   - Configure / Test / Activate section bodies are injected by the builder
 *     (`configureSection` / `testSection` / `activateSection`) so this file
 *     owns layout, not behavior. When a section isn't provided the card shows
 *     an honest pointer to the existing surface instead of a dead control.
 *   - No model/Hermes call, no AI credits: every control here is deterministic.
 *
 * No-leak: renders provider labels, node/field labels, stable status codes and
 * fixed copy only. No config values, tokens, or provider payloads ever reach
 * these props.
 */

export interface GuidedBuildCardProps {
  readonly snapshot: GuidedBuildSnapshot;
  readonly connect: GuidedConnectController;
  /** Display labels per provider slug (absent → humanized slug). */
  readonly providerLabels?: Readonly<Record<string, string>>;
  /** Exit the guided session (the card's close). */
  readonly onExit: () => void;
  /** Open the issues rail (the detailed secondary surface, `blocked` stage). */
  readonly onOpenIssues?: () => void;
  /** Injected stage bodies (arrive with their implementation slices). */
  readonly configureSection?: ReactNode;
  readonly testSection?: ReactNode;
  readonly activateSection?: ReactNode;
}

function providerDisplayName(
  p: AgentConnectionProvider,
  labels?: Readonly<Record<string, string>>,
): string {
  return labels?.[p.provider] ?? p.name ?? humanizeProviderSlug(p.provider);
}

/** Attempt-state helper copy for one provider row. */
function attemptNote(
  status: "launching" | "waiting" | "failed" | "canceled" | "popup_blocked",
): string {
  switch (status) {
    case "launching":
      return "Opening the sign-in window…";
    case "waiting":
      return "Finish the sign-in in the popup window. This updates automatically.";
    case "failed":
      return "The connection didn't finish.";
    case "canceled":
      return "The sign-in window was closed before finishing.";
    case "popup_blocked":
      return "Your browser blocked the popup. Allow popups for this site, then try again.";
  }
}

export function GuidedBuildCard({
  snapshot,
  connect,
  providerLabels,
  onExit,
  onOpenIssues,
  configureSection,
  testSection,
  activateSection,
}: GuidedBuildCardProps) {
  const { stage } = snapshot;
  // The card renders only for the guided stages (the preview/creating stages
  // are owned by the existing preview setup card / composer).
  if (stage === "creating" || stage === "preview_ready") return null;

  const activeStep = stepForStage(stage);
  const connectedCount = snapshot.connectionProviders.filter(
    (p) => p.state === "connected",
  ).length;
  const providerTotal = snapshot.connectionProviders.length;

  return (
    <section
      data-testid="guided-build-card"
      data-stage={stage}
      aria-label="Guided workflow setup"
      className="mt-1 rounded-md border p-3"
      style={{ background: "var(--builder-panel-2)", borderColor: "var(--builder-border)" }}
    >
      <div className="flex items-start justify-between gap-2">
        <div>
          <h3 className="text-[12px] font-semibold" style={{ color: "var(--builder-text)" }}>
            Finish setting up this workflow
          </h3>
          {/* Stepper — display only; the stage is derived, never clickable-ahead. */}
          <ol className="mt-1 flex flex-wrap items-center gap-1" data-testid="guided-build-steps">
            {GUIDED_BUILD_STEPS.map((step, i) => {
              const isActive = step.id === activeStep;
              return (
                <li key={step.id} className="flex items-center gap-1">
                  {i > 0 ? (
                    <span aria-hidden className="text-[10px]" style={{ color: "var(--builder-muted)" }}>
                      →
                    </span>
                  ) : null}
                  <span
                    data-testid={`guided-step-${step.id}`}
                    data-active={isActive ? "true" : undefined}
                    className="rounded px-1.5 py-0.5 text-[10.5px] font-medium"
                    style={
                      isActive
                        ? { background: "var(--builder-accent)", color: "#fff" }
                        : { color: "var(--builder-muted)" }
                    }
                  >
                    {step.label}
                  </span>
                </li>
              );
            })}
          </ol>
        </div>
        <button
          type="button"
          data-testid="guided-build-exit"
          onClick={onExit}
          className="text-[11px] underline"
          style={{ color: "var(--builder-muted)" }}
          title="Exit guided setup (you can keep building manually; nothing is lost)"
        >
          Exit
        </button>
      </div>

      {stage === "connecting" ? (
        <div className="mt-2" data-testid="guided-connect-section">
          <p className="text-[11px]" style={{ color: "var(--builder-muted)" }}>
            {snapshot.connectionUnresolved && providerTotal === 0
              ? "Checking which apps this workflow needs…"
              : `Connect the apps this workflow uses (${connectedCount} of ${providerTotal} connected). Nothing runs until you test and activate.`}
          </p>
          <ul className="mt-2 space-y-2">
            {snapshot.connectionProviders.map((p) => {
              const label = providerDisplayName(p, providerLabels);
              const rowAttempt =
                connect.attempt && connect.attempt.provider === p.provider
                  ? connect.attempt
                  : null;
              const busy =
                rowAttempt?.status === "launching" || rowAttempt?.status === "waiting";
              return (
                <li
                  key={p.provider}
                  data-testid={`guided-connect-${p.provider}`}
                  data-state={p.state}
                  className="rounded border px-2 py-1.5"
                  style={{ borderColor: "var(--builder-border)", background: "var(--builder-panel)" }}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-[11.5px] font-medium" style={{ color: "var(--builder-text)" }}>
                      {label}
                    </span>
                    {p.state === "connected" ? (
                      <span
                        data-testid={`guided-connect-${p.provider}-connected`}
                        className="text-[11px] font-medium"
                        style={{ color: "var(--builder-accent)" }}
                      >
                        ✓ Connected
                      </span>
                    ) : p.canReconnect ? (
                      <button
                        type="button"
                        data-testid={`guided-connect-${p.provider}-button`}
                        onClick={() => connect.connect(p.provider)}
                        disabled={busy}
                        className="rounded-md px-2.5 py-1 text-[11.5px] font-semibold text-white disabled:opacity-60"
                        style={{ background: "var(--builder-accent)", border: "1px solid var(--builder-accent)" }}
                        title={`Connect ${label} in a popup window — you'll come right back here`}
                      >
                        {busy
                          ? "Waiting…"
                          : rowAttempt &&
                              (rowAttempt.status === "failed" ||
                                rowAttempt.status === "canceled" ||
                                rowAttempt.status === "popup_blocked")
                            ? "Try again"
                            : p.state === "invalid"
                              ? "Reconnect"
                              : "Connect"}
                      </button>
                    ) : (
                      /* Account/service provider + non-admin member: connecting is an
                         account-management action. Honest, no dead button. */
                      <span
                        data-testid={`guided-connect-${p.provider}-owner-gated`}
                        className="text-[11px]"
                        style={{ color: "var(--builder-muted)" }}
                      >
                        Ask a workspace owner or admin to connect {label}.
                      </span>
                    )}
                  </div>
                  {rowAttempt && rowAttempt.status !== "completed" && rowAttempt.status !== "idle" ? (
                    <p
                      data-testid={`guided-connect-${p.provider}-note`}
                      className="mt-1 text-[10.5px]"
                      style={{ color: "var(--builder-muted)" }}
                    >
                      {attemptNote(rowAttempt.status)}
                    </p>
                  ) : null}
                </li>
              );
            })}
          </ul>
          {snapshot.connectionUnresolved && providerTotal > 0 ? (
            <p className="mt-1 text-[10.5px]" style={{ color: "var(--builder-muted)" }}>
              Re-checking connections…
            </p>
          ) : null}
        </div>
      ) : null}

      {stage === "configuring" ? (
        <div className="mt-2" data-testid="guided-configure-section">
          {configureSection ?? (
            <p className="text-[11px]" style={{ color: "var(--builder-muted)" }}>
              Connections are ready. Finish the remaining step setup below in the
              issues panel.
              {onOpenIssues ? (
                <>
                  {" "}
                  <button
                    type="button"
                    data-testid="guided-configure-open-issues"
                    onClick={onOpenIssues}
                    className="underline"
                    style={{ color: "var(--builder-accent)" }}
                  >
                    Open setup issues
                  </button>
                </>
              ) : null}
            </p>
          )}
        </div>
      ) : null}

      {stage === "ready_to_test" || stage === "testing" ? (
        <div className="mt-2" data-testid="guided-test-section">
          {testSection ?? (
            <p className="text-[11px]" style={{ color: "var(--builder-muted)" }}>
              Everything is filled in and connected. Use the header&apos;s Test button to
              run a safe test.
            </p>
          )}
        </div>
      ) : null}

      {stage === "ready_to_activate" ? (
        <div className="mt-2" data-testid="guided-activate-section">
          {activateSection ?? (
            <p className="text-[11px]" style={{ color: "var(--builder-muted)" }}>
              Ready to activate. Use the header&apos;s Activate button to turn it on.
            </p>
          )}
        </div>
      ) : null}

      {stage === "complete" ? (
        <p
          className="mt-2 text-[11px]"
          data-testid="guided-complete-note"
          style={{ color: "var(--builder-text)" }}
        >
          ✓ This workflow is live. You can keep editing — changes stay in your draft
          until you publish them.
        </p>
      ) : null}

      {stage === "blocked" ? (
        <div className="mt-2" data-testid="guided-blocked-section">
          <p className="text-[11px]" style={{ color: "var(--builder-text)" }}>
            Something needs attention before this can run:
          </p>
          <ul className="mt-1 space-y-1">
            {snapshot.otherBlockers.slice(0, 3).map((b, i) => (
              <li key={i} className="text-[11px]" style={{ color: "var(--builder-muted)" }}>
                {b.message} <span style={{ color: "var(--builder-text)" }}>{b.nextStep}</span>
              </li>
            ))}
          </ul>
          {onOpenIssues ? (
            <button
              type="button"
              data-testid="guided-blocked-open-issues"
              onClick={onOpenIssues}
              className="mt-1 text-[11px] underline"
              style={{ color: "var(--builder-accent)" }}
            >
              Review all issues
            </button>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}
