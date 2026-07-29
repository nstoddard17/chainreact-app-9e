import type { AgentChangeStatus } from "@/contracts/agentChangeHistory";

/**
 * REACT-AGENT-CONVERSATION-PERSISTENCE-1 — reconcile a RESTORED React Agent
 * proposal against the workflow as it actually stands now.
 *
 * The product rule this module encodes:
 *
 *   Conversation history remembers what happened.
 *   The saved workflow determines what actually exists.
 *
 * A restored transcript is a record of past turns, not a description of the
 * current draft. So every restored proposal must be re-judged against two
 * present-tense facts — the saved graph revision, and the canonical lifecycle
 * row in `agent_change_history` — before the UI says anything about it or
 * offers any action.
 *
 * Ownership: this module NEVER invents a lifecycle status. `agent_change_history`
 * owns "was it applied / discarded / failed"; the persisted message owns "which
 * draft revision was it built against"; the caller supplies "what is saved right
 * now". This is a pure projection over those three, with no state of its own —
 * exactly like `deriveGuidedBuildStage` over readiness.
 *
 * Pure module: no I/O, no React, no storage. Labels are fixed copy; nothing here
 * carries config values, provider payloads, tokens, or ids beyond opaque refs.
 */

export type PersistedPreviewState =
  /** Shown, never applied — pure history. */
  | "not_applied"
  /** Applied to the draft but the draft was never saved: those nodes do not exist. */
  | "not_saved"
  /** Applied AND saved into the workflow revision that is still current. */
  | "applied"
  /** Applied AND saved, but the workflow has moved on since. */
  | "applied_superseded"
  /** The user explicitly discarded it. */
  | "discarded"
  /** Apply was attempted and failed. */
  | "failed"
  /** The saved workflow changed after this proposal was built — it no longer fits. */
  | "stale";

export interface ReconcilePersistedPreviewInput {
  /** Reference to the canonical lifecycle row, when this turn carried a proposal. */
  readonly agentChangeId?: string | null;
  /** Lifecycle status read from `agent_change_history`, or null when no row exists. */
  readonly changeStatus?: AgentChangeStatus | null;
  /** The saved-draft revision the proposal was validated against. */
  readonly baseGraphVersion?: string | null;
  /** The workflow's CURRENT saved revision (graph slice `hydratedRevision`). */
  readonly savedGraphVersion: string | null;
  /** True when the proposal payload survived persistence intact enough to reopen. */
  readonly hasProposalPayload: boolean;
}

export interface PersistedPreviewVerdict {
  readonly state: PersistedPreviewState;
  /** Short badge copy ("Not saved", "Applied", "Discarded", "Stale"). */
  readonly label: string;
  /** One honest sentence explaining the badge. Fixed copy; no ids, no values. */
  readonly detail: string;
  /**
   * Whether the transcript may offer "Show on canvas again". Only ever true when
   * the proposal payload survived AND the workflow has not moved since — a
   * reopened preview must propose exactly what was reviewed, or not be offered.
   */
  readonly canReopen: boolean;
  /**
   * Whether this proposal counts as landed in the SAVED workflow. The guided
   * journey may resume only from this; an applied-but-unsaved change never
   * starts Connect / Configure / Test / Activate.
   */
  readonly appliedToSavedWorkflow: boolean;
}

/** Statuses that mean the user (or the system) closed this proposal out. */
const CLOSED_STATUSES: ReadonlySet<AgentChangeStatus> = new Set([
  "preview_discarded",
  "undone",
  "kept_as_preview",
]);

/**
 * How the proposal relates to the workflow revision that is saved right now.
 *
 * Four cases, and the distinction between the last two is load-bearing:
 *
 *   - `matches`   — built against exactly what is saved.
 *   - `moved_on`  — built against a different revision; the workflow changed.
 *   - `unknown`   — a base revision was recorded but the saved one isn't known
 *                   yet. "We can't tell" fails CLOSED: a disabled Apply and an
 *                   honest "ask React to update it" beats silently applying a
 *                   proposal built against a graph nobody can identify.
 *   - `unpinned`  — no base revision was ever recorded. This is the NEW-workflow
 *                   additive proposal: it is not an edit of any particular
 *                   revision, so there is no revision it can drift from.
 *                   Calling it stale would be a false accusation — and it is the
 *                   commonest proposal there is, the one that builds a workflow
 *                   from an empty canvas.
 */
type ProposalPinning = "matches" | "moved_on" | "unknown" | "unpinned";

function pinningOf(
  baseGraphVersion: string | null | undefined,
  savedGraphVersion: string | null,
): ProposalPinning {
  if (!baseGraphVersion) return "unpinned";
  if (!savedGraphVersion) return "unknown";
  return baseGraphVersion === savedGraphVersion ? "matches" : "moved_on";
}

/** Does the proposal still fit the saved workflow well enough to act on? */
function stillFits(pinning: ProposalPinning): boolean {
  return pinning === "matches" || pinning === "unpinned";
}

export function reconcilePersistedPreview(
  input: ReconcilePersistedPreviewInput,
): PersistedPreviewVerdict {
  const {
    changeStatus,
    baseGraphVersion,
    savedGraphVersion,
    hasProposalPayload,
  } = input;

  const pinning = pinningOf(baseGraphVersion, savedGraphVersion);
  const stillPinned = stillFits(pinning);

  if (changeStatus === "apply_failed" || changeStatus === "test_failed") {
    return {
      state: "failed",
      label: "Not applied",
      detail: "This change couldn't be applied. Ask React to try again.",
      canReopen: false,
      appliedToSavedWorkflow: false,
    };
  }

  if (changeStatus && CLOSED_STATUSES.has(changeStatus)) {
    return {
      state: "discarded",
      label: "Discarded",
      detail: "You discarded this suggestion. It's kept here for reference only.",
      canReopen: false,
      appliedToSavedWorkflow: false,
    };
  }

  if (changeStatus === "applied_saved" || changeStatus === "tested") {
    // The change reached the SAVED workflow, so the guided journey may resume
    // from it either way. Whether it is still the NEWEST saved state only
    // changes what we tell the user.
    return {
      state: pinning === "matches" ? "applied" : "applied_superseded",
      label: "Applied",
      detail:
        pinning === "matches"
          ? "This change was applied and saved to your workflow."
          : "This change was applied and saved. Your workflow has changed since.",
      canReopen: false,
      appliedToSavedWorkflow: true,
    };
  }

  if (changeStatus === "preview_applied") {
    // Applied to the DRAFT only. The draft was abandoned without a save, so
    // those nodes do not exist in the workflow that just loaded.
    if (!stillPinned) {
      return {
        state: "stale",
        label: "Stale",
        detail:
          "You applied this to your draft but left without saving, and your workflow has changed since. Ask React to update it before applying.",
        canReopen: false,
        appliedToSavedWorkflow: false,
      };
    }
    return {
      state: "not_saved",
      label: "Not saved",
      detail:
        "You applied this to your draft but left without saving, so it isn't part of your workflow.",
      canReopen: hasProposalPayload,
      appliedToSavedWorkflow: false,
    };
  }

  // No lifecycle row, or still at preview_created: the proposal was shown and
  // never acted on. Whether it can be reopened is purely a staleness question.
  if (!stillPinned) {
    return {
      state: "stale",
      label: "Stale",
      detail:
        "Your workflow changed after this suggestion was made. Ask React to update it before applying.",
      canReopen: false,
      appliedToSavedWorkflow: false,
    };
  }

  return {
    state: "not_applied",
    label: "Not applied",
    detail: "This suggestion was never applied to your workflow.",
    canReopen: hasProposalPayload,
    appliedToSavedWorkflow: false,
  };
}

/**
 * Does the restored transcript contain a proposal that actually landed in the
 * SAVED workflow? This — and only this — is what lets a returning user resume
 * the guided journey; history alone never does.
 */
export function transcriptHasAppliedSavedChange(
  verdicts: readonly PersistedPreviewVerdict[],
): boolean {
  return verdicts.some((v) => v.appliedToSavedWorkflow);
}
