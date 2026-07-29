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
import { GuidedBuildCard } from "../panels/GuidedBuildCard";
import { useGuidedConnect } from "./useGuidedConnect";

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
  readonly refreshConnections: () => void;
  readonly providerLabels?: Readonly<Record<string, string>>;
  /** Open the issues rail (detailed secondary surface). */
  readonly onOpenIssues?: () => void;
  /** Injected stage bodies (Configure / Test / Activate slices). */
  readonly configureSection?: ReactNode;
  readonly testSection?: ReactNode;
  readonly activateSection?: ReactNode;
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
    refreshConnections,
    providerLabels,
    onOpenIssues,
    configureSection,
    testSection,
    activateSection,
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

  const connect = useGuidedConnect({ onRefreshConnections: refreshConnections });

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
