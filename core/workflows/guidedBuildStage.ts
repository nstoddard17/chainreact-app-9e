import type {
  AgentConnectionProvider,
  AgentConnectionSignal,
  AgentReadinessBlocker,
  AgentReadinessVerdict,
} from "./agentReadiness";

/**
 * REACT-AGENT-GUIDED-BUILD-1 — the guided build stage PROJECTION.
 *
 * The React Agent walks a user through Create → Connect → Configure → Test →
 * Activate without leaving the rail. This module answers "which stage is the
 * user in right now?" — and it is a pure PROJECTION over the existing
 * deterministic signals (the readiness verdict + the server-resolved connection
 * signal + lifecycle state), never a second state machine. There is no stored
 * stage to drift out of sync: reload the builder and the same inputs derive the
 * same stage.
 *
 * Ordering contract (the guided flow's product rule):
 *   1. Connection comes BEFORE node configuration — a missing/invalid app, or a
 *      still-unresolved connection check, keeps the user in `connecting`.
 *   2. Configuration comes before test; a passed test (or a non-testable
 *      trigger with clean connections) unlocks activate.
 *   3. Anything else blocking (broken graph, lifecycle, failed test) is
 *      `blocked` — the issues rail remains the detailed secondary surface.
 *
 * No-leak: inputs and outputs carry only labels, enums, counts, node ids and
 * field key/label names — never config values, tokens, or provider payloads
 * (the same contract as `computeAgentReadiness`).
 */

export type GuidedBuildStage =
  | "creating"
  | "preview_ready"
  | "connecting"
  | "configuring"
  | "ready_to_test"
  | "testing"
  | "ready_to_activate"
  | "complete"
  | "blocked";

/** Blocker kinds owned by the Connect stage. */
const CONNECTION_KINDS = new Set<AgentReadinessBlocker["kind"]>([
  "missing_connection",
  "invalid_connection",
]);

/** Blocker kinds owned by the Configure stage. */
const CONFIGURE_KINDS = new Set<AgentReadinessBlocker["kind"]>([
  "missing_required_field",
  "unresolved_variable",
]);

export interface DeriveGuidedBuildStageInput {
  /** A preview is open for review (pre-apply). */
  readonly previewActive: boolean;
  /** The guided session is running (applied change / restored session). */
  readonly sessionActive: boolean;
  /** Live workflow lifecycle state (server prop, e.g. "draft" | "active"). */
  readonly workflowState: string;
  /** The readiness verdict for the live draft (or preview end-state). */
  readonly verdict: AgentReadinessVerdict;
  /** The server-resolved connection signal the verdict was computed from. */
  readonly connection: AgentConnectionSignal;
}

export interface GuidedBuildSnapshot {
  readonly stage: GuidedBuildStage;
  /**
   * Every provider the draft uses, in server-resolved order, when the signal is
   * resolved — connected ones included so the Connect stage can show real
   * progress ("1 of 2 connected"). Empty until the signal resolves.
   */
  readonly connectionProviders: readonly AgentConnectionProvider[];
  /** True while the connection signal is still loading/error (not resolved). */
  readonly connectionUnresolved: boolean;
  /** Connect-stage blockers (missing/invalid connections), verdict order. */
  readonly connectionBlockers: readonly AgentReadinessBlocker[];
  /** Configure-stage blockers (missing fields / unresolved variables). */
  readonly configureBlockers: readonly AgentReadinessBlocker[];
  /** Blockers owned by neither stage (graph/lifecycle/test failures). */
  readonly otherBlockers: readonly AgentReadinessBlocker[];
}

export function deriveGuidedBuildStage(
  input: DeriveGuidedBuildStageInput,
): GuidedBuildSnapshot {
  const { previewActive, sessionActive, workflowState, verdict, connection } = input;

  const connectionProviders =
    connection.state === "resolved" ? connection.providers : [];
  const connectionUnresolved =
    connection.state === "loading" || connection.state === "error";

  const connectionBlockers = verdict.blockers.filter((b) =>
    CONNECTION_KINDS.has(b.kind),
  );
  const configureBlockers = verdict.blockers.filter((b) =>
    CONFIGURE_KINDS.has(b.kind),
  );
  const otherBlockers = verdict.blockers.filter(
    (b) => !CONNECTION_KINDS.has(b.kind) && !CONFIGURE_KINDS.has(b.kind),
  );

  const base = {
    connectionProviders,
    connectionUnresolved,
    connectionBlockers,
    configureBlockers,
    otherBlockers,
  };

  // An ACTIVE workflow inside a guided session = the journey finished. (An
  // active workflow outside a session never shows the guided card at all.)
  if (sessionActive && workflowState === "active") {
    return { stage: "complete", ...base };
  }
  // Reviewing a preview (pre-apply) always wins over a stale session view —
  // the rail's preview setup card is the surface for this stage.
  if (previewActive) {
    return { stage: "preview_ready", ...base };
  }
  if (!sessionActive) {
    return { stage: "creating", ...base };
  }

  // Guided session, change applied:
  if (connectionBlockers.length > 0) {
    return { stage: "connecting", ...base };
  }
  // Connection truth not yet resolved → stay in Connect ("checking…"), never
  // start configuration on an unverified claim. Product rule 1.
  if (connectionUnresolved) {
    return { stage: "connecting", ...base };
  }
  if (configureBlockers.length > 0) {
    // Configure only owns the stage while nothing HARDER blocks (a broken
    // graph or lifecycle conflict needs the issues rail, not field entry).
    if (otherBlockers.length > 0) {
      return { stage: "blocked", ...base };
    }
    return { stage: "configuring", ...base };
  }
  if (otherBlockers.length > 0) {
    return { stage: "blocked", ...base };
  }

  if (verdict.lastTestStatus === "running") {
    return { stage: "testing", ...base };
  }
  if (verdict.status === "ready_to_activate") {
    return { stage: "ready_to_activate", ...base };
  }
  if (verdict.status === "ready_to_test") {
    return { stage: "ready_to_test", ...base };
  }
  // Verdict says not-ready/blocked but no blocker fell into a bucket above
  // (e.g. connection disabled on the logged-out builder). Fail safe.
  return { stage: "blocked", ...base };
}

/** Ordered stepper labels for the guided card (display only). */
export const GUIDED_BUILD_STEPS = [
  { id: "connect", label: "Connect" },
  { id: "configure", label: "Configure" },
  { id: "test", label: "Test" },
  { id: "activate", label: "Activate" },
] as const;

export type GuidedBuildStepId = (typeof GUIDED_BUILD_STEPS)[number]["id"];

/** Which stepper step a stage highlights (null → the stepper is not shown). */
export function stepForStage(stage: GuidedBuildStage): GuidedBuildStepId | null {
  switch (stage) {
    case "connecting":
      return "connect";
    case "configuring":
      return "configure";
    case "ready_to_test":
    case "testing":
      return "test";
    case "ready_to_activate":
    case "complete":
      return "activate";
    case "creating":
    case "preview_ready":
    case "blocked":
      return null;
  }
}
