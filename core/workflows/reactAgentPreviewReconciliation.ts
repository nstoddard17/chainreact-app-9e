import type { AgentChangeStatus } from "@/contracts/agentChangeHistory";
import { isEditableGraphVersion } from "./editableGraphVersion";

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
  /**
   * RESTORED-EDIT-PROPOSAL-STALE-MISMATCH-1 — a base version was recorded but ChainReact cannot
   * confirm what it refers to (the current graph fingerprint isn't available, or one of the two
   * values isn't a canonical fingerprint at all). Distinct from `stale` on purpose: "we can't
   * check" is not "your workflow changed", and telling the user the second when we mean the first
   * is a false accusation about their own workflow.
   */
  | "version_unknown"
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
  /**
   * The canonical GRAPH FINGERPRINT (`computeEditableGraphVersion`) of the draft the proposal was
   * built and validated against. Persisted with the turn; never re-derived on restore.
   */
  readonly baseGraphVersion?: string | null;
  /**
   * The canonical GRAPH FINGERPRINT of the graph as it stands right now — the SAME graph and the
   * SAME function `replaceGraphLocal` checks at Apply time, so this verdict and Apply can never
   * disagree.
   *
   * RESTORED-EDIT-PROPOSAL-STALE-MISMATCH-1 — this used to be `savedGraphVersion`, fed from
   * `graphSlice.hydratedRevision`, which is the workflow's `updatedAt` TIMESTAMP. Comparing a
   * timestamp to a content fingerprint is never equal, so every restored edit proposal was marked
   * Stale even when nothing had changed. The name now states which value space it belongs to.
   */
  readonly currentGraphVersion: string | null;
  /**
   * RESTORED-EDIT-PROPOSAL-STALE-MISMATCH-1 — the canonical fingerprint of the proposal's END
   * STATE (`proposedDefinition`), when one survived persistence.
   *
   * Only the APPLIED-and-saved branch uses it, and it is the only value that can answer that
   * branch's real question. `baseGraphVersion` is the graph BEFORE the change, so once the change
   * is applied the base can never match the current graph — judging "applied" by the base would
   * tell every user their workflow had changed since, when the only thing that changed it was the
   * apply itself.
   */
  readonly proposedGraphVersion?: string | null;
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
  currentGraphVersion: string | null,
): ProposalPinning {
  if (!baseGraphVersion) return "unpinned";
  if (!currentGraphVersion) return "unknown";
  // RESTORED-EDIT-PROPOSAL-STALE-MISMATCH-1 — both sides MUST be canonical graph fingerprints.
  // Anything else (most importantly an `updatedAt` timestamp, which is what used to arrive here)
  // is not comparable, and an incomparable pair must never be reported as "your workflow changed".
  // Fail CLOSED to `unknown`: Apply stays disabled, but the user is told the truth.
  if (!isEditableGraphVersion(baseGraphVersion) || !isEditableGraphVersion(currentGraphVersion)) {
    return "unknown";
  }
  return baseGraphVersion === currentGraphVersion ? "matches" : "moved_on";
}

/** Does the proposal still fit the saved workflow well enough to act on? */
function stillFits(pinning: ProposalPinning): boolean {
  return pinning === "matches" || pinning === "unpinned";
}

/**
 * RESTORED-EDIT-PROPOSAL-STALE-MISMATCH-1 — "we cannot confirm this proposal matches your current
 * workflow". Deliberately NOT the stale copy: it makes no claim about the user's workflow having
 * changed, because nothing established that. Apply stays unavailable (fail closed) and the honest
 * next step is to ask React again. Fixed copy — no ids, hashes, timestamps, or values.
 */
const VERSION_UNKNOWN_VERDICT: PersistedPreviewVerdict = {
  state: "version_unknown",
  label: "Can't verify",
  detail:
    "ChainReact can't confirm this suggestion still matches your current workflow, so it can't be applied as-is. Ask React to suggest it again.",
  canReopen: false,
  appliedToSavedWorkflow: false,
};

export function reconcilePersistedPreview(
  input: ReconcilePersistedPreviewInput,
): PersistedPreviewVerdict {
  const {
    changeStatus,
    baseGraphVersion,
    currentGraphVersion,
    proposedGraphVersion,
    hasProposalPayload,
  } = input;

  const pinning = pinningOf(baseGraphVersion, currentGraphVersion);
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
    // changes what we tell the user — and that is answered by the proposal's END
    // state, never by the base (see `proposedGraphVersion`). When the end state
    // isn't available we make NO claim about later changes rather than a wrong one.
    const endStateKnown =
      isEditableGraphVersion(proposedGraphVersion) && isEditableGraphVersion(currentGraphVersion);
    const superseded = endStateKnown && proposedGraphVersion !== currentGraphVersion;
    return {
      state: superseded ? "applied_superseded" : "applied",
      label: "Applied",
      detail: superseded
        ? "This change was applied and saved. Your workflow has changed since."
        : "This change was applied and saved to your workflow.",
      canReopen: false,
      appliedToSavedWorkflow: true,
    };
  }

  if (changeStatus === "preview_applied") {
    // Applied to the DRAFT only. The draft was abandoned without a save, so
    // those nodes do not exist in the workflow that just loaded.
    if (pinning === "unknown") return VERSION_UNKNOWN_VERDICT;
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
  if (pinning === "unknown") return VERSION_UNKNOWN_VERDICT;
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
/**
 * RESTORED-EDIT-PROPOSAL-STALE-MISMATCH-1 — a SAFE, structured description of one reconciliation,
 * for diagnosing "why did my proposal say that?" without reading any workflow content.
 *
 * Carries only presence booleans, enums, and a TRUNCATED fingerprint prefix — never a workflow
 * definition, node config, variable value, prompt, model response, credential, or full digest.
 */
export interface ProposalReconciliationDiagnostic {
  readonly proposalId: string | null;
  readonly versionStrategy: "graph_fingerprint";
  readonly baseVersionPresent: boolean;
  readonly currentVersionPresent: boolean;
  /** Whether each side had the canonical fingerprint SHAPE (a timestamp would be false). */
  readonly baseVersionWellFormed: boolean;
  readonly currentVersionWellFormed: boolean;
  /** First 4 chars only — enough to correlate two log lines, not to reconstruct a graph. */
  readonly baseVersionPrefix: string | null;
  readonly currentVersionPrefix: string | null;
  readonly comparison: ProposalPinning;
  readonly state: PersistedPreviewState;
  readonly canReopen: boolean;
}

const PREFIX_LEN = 4;
const prefixOf = (v: string | null | undefined): string | null =>
  typeof v === "string" && v.length > 0 ? v.slice(0, PREFIX_LEN) : null;

/** Build the safe diagnostic for a reconciliation that has already been computed. */
export function describeProposalReconciliation(
  input: ReconcilePersistedPreviewInput,
  verdict: PersistedPreviewVerdict,
): ProposalReconciliationDiagnostic {
  return {
    proposalId: input.agentChangeId ?? null,
    versionStrategy: "graph_fingerprint",
    baseVersionPresent: !!input.baseGraphVersion,
    currentVersionPresent: !!input.currentGraphVersion,
    baseVersionWellFormed: isEditableGraphVersion(input.baseGraphVersion),
    currentVersionWellFormed: isEditableGraphVersion(input.currentGraphVersion),
    baseVersionPrefix: prefixOf(input.baseGraphVersion),
    currentVersionPrefix: prefixOf(input.currentGraphVersion),
    comparison: pinningOf(input.baseGraphVersion, input.currentGraphVersion),
    state: verdict.state,
    canReopen: verdict.canReopen,
  };
}

export function transcriptHasAppliedSavedChange(
  verdicts: readonly PersistedPreviewVerdict[],
): boolean {
  return verdicts.some((v) => v.appliedToSavedWorkflow);
}
