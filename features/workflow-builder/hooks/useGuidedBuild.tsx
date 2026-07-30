"use client";

import { useMemo, type ReactNode } from "react";
import type {
  AgentConnectionSignal,
  AgentReadinessVerdict,
} from "@/core/workflows/agentReadiness";
import {
  deriveGuidedBuildStage,
  type GuidedBuildSnapshot,
} from "@/core/workflows/guidedBuildStage";
import type { CheckWorkflowSetupTarget } from "@/core/workflows/checkWorkflowReview";
import type { GuidedConnectController } from "./useGuidedConnect";
import { GuidedBuildCard } from "../panels/GuidedBuildCard";
import { GuidedConfigureSection } from "../panels/GuidedConfigureSection";
import {
  GuidedActivateSection,
  GuidedTestSection,
} from "../panels/GuidedTestActivateSections";

/**
 * REACT-AGENT-GUIDED-BUILD-1 — builder wiring for the guided build card
 * (extracted from `WorkflowBuilder` to keep that orchestrator thin, same
 * pattern as `useAgentRailWiring`).
 *
 * Composes: the pure stage projection over the readiness verdict + connection
 * signal, the popup connect controller, and the card render the rail mounts as
 * its transcript footer. Owns NO truth of its own — session state lives in
 * `useGuidedBuildSession` (called by the builder, because the readiness window
 * depends on it), and the stage is derived fresh every render.
 */

export interface UseGuidedBuildInput {
  readonly sessionActive: boolean;
  readonly onExitSession: () => void;
  readonly localOnly?: boolean;
  readonly previewReviewActive: boolean;
  readonly workflowState: string;
  readonly verdict: AgentReadinessVerdict;
  readonly connection: AgentConnectionSignal;
  /**
   * REACT-AGENT-PREAPPLY-SETUP-UX-1 — the OAuth popup controller, now owned by the BUILDER rather
   * than created here. The Configure stage's setup fields offer their own in-place "Connect
   * <provider>" for a connection-blocked option list, and two controllers would mean two competing
   * popups and two attempt states for one user action.
   */
  readonly connect: GuidedConnectController;
  readonly providerLabels?: Readonly<Record<string, string>>;
  /** Open the issues rail (detailed secondary surface). */
  readonly onOpenIssues?: () => void;
  /**
   * Configure stage: the live draft's nodes with missing required fields
   * (Check-workflow grouping) + the builder's existing node-setup renderer.
   * Both present → the card walks them one node at a time with progress.
   */
  readonly guidedSetupTargets?: readonly CheckWorkflowSetupTarget[];
  readonly renderNodeSetup?: (
    targets: readonly CheckWorkflowSetupTarget[],
  ) => ReactNode;
  /**
   * Test stage: save-if-dirty then dispatch the safe test run (the builder's
   * existing run-controls path). `runError` is the run controls' last safe
   * dispatch error; `draftIsDirty` drives the "saved first" note.
   */
  readonly onTest?: () => Promise<void>;
  readonly runError?: string | null;
  readonly draftIsDirty?: boolean;
  /** Activate stage: save-if-dirty → activate → refresh lifecycle state. */
  readonly onActivate?: (confirmationText?: string) => Promise<void>;
}

export interface GuidedBuildWiring {
  readonly snapshot: GuidedBuildSnapshot;
  /** The card node for the rail's transcript footer, or null (no session). */
  readonly guidedFooter: ReactNode | null;
}

export function useGuidedBuild(input: UseGuidedBuildInput): GuidedBuildWiring {
  const {
    sessionActive,
    onExitSession,
    localOnly,
    previewReviewActive,
    workflowState,
    verdict,
    connection,
    connect,
    providerLabels,
    onOpenIssues,
    guidedSetupTargets,
    renderNodeSetup,
    onTest,
    runError,
    draftIsDirty,
    onActivate,
  } = input;

  const snapshot = useMemo(
    () =>
      deriveGuidedBuildStage({
        previewActive: previewReviewActive,
        sessionActive: sessionActive && !localOnly,
        workflowState,
        verdict,
        connection,
      }),
    [previewReviewActive, sessionActive, localOnly, workflowState, verdict, connection],
  );

  // Configure-stage body: the existing node setup card, one node at a time.
  const configureSection =
    guidedSetupTargets && renderNodeSetup ? (
      <GuidedConfigureSection
        targets={guidedSetupTargets}
        renderNodeSetup={renderNodeSetup}
        configureBlockers={snapshot.configureBlockers}
        {...(onOpenIssues ? { onOpenIssues } : {})}
      />
    ) : undefined;

  // Test / Activate stage bodies — thin wrappers over the existing run and
  // activation paths (see GuidedTestActivateSections).
  const testSection = onTest ? (
    <GuidedTestSection
      onTest={onTest}
      testStatus={verdict.lastTestStatus ?? "not_tested"}
      {...(runError !== undefined ? { runError } : {})}
      {...(draftIsDirty !== undefined ? { isDirty: draftIsDirty } : {})}
    />
  ) : undefined;

  const connectedCount = snapshot.connectionProviders.filter(
    (p) => p.state === "connected",
  ).length;
  const activateSection = onActivate ? (
    <GuidedActivateSection
      onActivate={onActivate}
      testPassed={verdict.lastTestStatus === "passed"}
      warnings={verdict.warnings}
      connectedCount={connectedCount}
    />
  ) : undefined;

  const guidedFooter =
    sessionActive && !localOnly && snapshot.stage !== "creating" && snapshot.stage !== "preview_ready" ? (
      <GuidedBuildCard
        snapshot={snapshot}
        connect={connect}
        {...(providerLabels ? { providerLabels } : {})}
        onExit={onExitSession}
        {...(onOpenIssues ? { onOpenIssues } : {})}
        {...(configureSection ? { configureSection } : {})}
        {...(testSection ? { testSection } : {})}
        {...(activateSection ? { activateSection } : {})}
      />
    ) : null;

  return { snapshot, guidedFooter };
}
