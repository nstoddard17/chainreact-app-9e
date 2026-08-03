/** @jest-environment node */
import {
  reconcilePersistedPreview,
  transcriptHasAppliedSavedChange,
} from "@/core/workflows/reactAgentPreviewReconciliation";

/**
 * REACT-AGENT-CONVERSATION-PERSISTENCE-1 — reconciling a restored proposal
 * against the workflow as it stands NOW.
 *
 * The product rule: conversation history remembers what happened; the SAVED
 * workflow determines what exists. Every case below is one way those two can
 * disagree, and the verdict must side with the saved workflow.
 */

const V1 = "2026-07-29T10:00:00.000Z";
const V2 = "2026-07-29T11:00:00.000Z";
const CHANGE = "11111111-1111-4111-8111-111111111111";

it("a proposal that was never applied is history, and can be reopened while it still fits", () => {
  const v = reconcilePersistedPreview({
    agentChangeId: CHANGE,
    changeStatus: "preview_created",
    baseGraphVersion: V1,
    savedGraphVersion: V1,
    hasProposalPayload: true,
  });
  expect(v.state).toBe("not_applied");
  expect(v.canReopen).toBe(true);
  expect(v.appliedToSavedWorkflow).toBe(false);
});

it("applied to the draft but never saved reads as NOT SAVED and never resumes the journey", () => {
  const v = reconcilePersistedPreview({
    agentChangeId: CHANGE,
    changeStatus: "preview_applied",
    baseGraphVersion: V1,
    savedGraphVersion: V1,
    hasProposalPayload: true,
  });
  expect(v.state).toBe("not_saved");
  expect(v.label).toBe("Not saved");
  expect(v.appliedToSavedWorkflow).toBe(false);
  // Still compatible with the saved workflow, so reopening it is safe.
  expect(v.canReopen).toBe(true);
});

it("applied AND saved is the only state that may resume the guided journey", () => {
  const v = reconcilePersistedPreview({
    agentChangeId: CHANGE,
    changeStatus: "applied_saved",
    baseGraphVersion: V1,
    savedGraphVersion: V1,
    hasProposalPayload: true,
  });
  expect(v.state).toBe("applied");
  expect(v.label).toBe("Applied");
  expect(v.appliedToSavedWorkflow).toBe(true);
  expect(v.canReopen).toBe(false);
});

it("an applied+saved change whose workflow moved on is still applied, just superseded", () => {
  const v = reconcilePersistedPreview({
    agentChangeId: CHANGE,
    changeStatus: "applied_saved",
    baseGraphVersion: V1,
    savedGraphVersion: V2,
    hasProposalPayload: true,
  });
  expect(v.state).toBe("applied_superseded");
  expect(v.appliedToSavedWorkflow).toBe(true);
});

it("the saved workflow changing after the preview marks it STALE and blocks reopening", () => {
  const v = reconcilePersistedPreview({
    agentChangeId: CHANGE,
    changeStatus: "preview_created",
    baseGraphVersion: V1,
    savedGraphVersion: V2,
    hasProposalPayload: true,
  });
  expect(v.state).toBe("stale");
  expect(v.label).toBe("Stale");
  expect(v.canReopen).toBe(false);
  expect(v.detail).toMatch(/Ask React to update it/i);
});

it("an applied-but-unsaved proposal on a moved-on workflow is stale, not reopenable", () => {
  const v = reconcilePersistedPreview({
    agentChangeId: CHANGE,
    changeStatus: "preview_applied",
    baseGraphVersion: V1,
    savedGraphVersion: V2,
    hasProposalPayload: true,
  });
  expect(v.state).toBe("stale");
  expect(v.canReopen).toBe(false);
  expect(v.appliedToSavedWorkflow).toBe(false);
});

it.each(["preview_discarded", "undone", "kept_as_preview"] as const)(
  "a %s proposal stays in history but can never trigger setup",
  (status) => {
    const v = reconcilePersistedPreview({
      agentChangeId: CHANGE,
      changeStatus: status,
      baseGraphVersion: V1,
      savedGraphVersion: V1,
      hasProposalPayload: true,
    });
    expect(v.state).toBe("discarded");
    expect(v.label).toBe("Discarded");
    expect(v.canReopen).toBe(false);
    expect(v.appliedToSavedWorkflow).toBe(false);
  },
);

it("a failed apply is reported honestly and offers no reopen", () => {
  const v = reconcilePersistedPreview({
    agentChangeId: CHANGE,
    changeStatus: "apply_failed",
    baseGraphVersion: V1,
    savedGraphVersion: V1,
    hasProposalPayload: true,
  });
  expect(v.state).toBe("failed");
  expect(v.canReopen).toBe(false);
});

it("an unknown SAVED version fails closed — we never claim compatibility we can't check", () => {
  expect(
    reconcilePersistedPreview({
      changeStatus: null,
      baseGraphVersion: V1,
      savedGraphVersion: null,
      hasProposalPayload: true,
    }).state,
  ).toBe("stale");
});

/**
 * A NEW-workflow proposal is additive: it is not an edit of any particular
 * revision, so no `baseGraphVersion` is ever recorded for it. Treating that
 * absence as drift would label the commonest proposal of all — the one that
 * builds a workflow from an empty canvas — permanently "Stale".
 */
it("an UNPINNED additive proposal is judged on its own terms, not called stale", () => {
  const applied = reconcilePersistedPreview({
    changeStatus: "preview_applied",
    baseGraphVersion: null,
    savedGraphVersion: V1,
    hasProposalPayload: true,
  });
  expect(applied.state).toBe("not_saved");
  expect(applied.label).toBe("Not saved");
  expect(applied.canReopen).toBe(true);

  const shown = reconcilePersistedPreview({
    changeStatus: "preview_created",
    baseGraphVersion: null,
    savedGraphVersion: V2,
    hasProposalPayload: true,
  });
  expect(shown.state).toBe("not_applied");
  expect(shown.canReopen).toBe(true);
});

it("a proposal whose payload did not survive persistence is never reopenable", () => {
  const v = reconcilePersistedPreview({
    changeStatus: "preview_created",
    baseGraphVersion: V1,
    savedGraphVersion: V1,
    hasProposalPayload: false,
  });
  expect(v.canReopen).toBe(false);
});

it("transcriptHasAppliedSavedChange is true only when something actually landed", () => {
  const notSaved = reconcilePersistedPreview({
    changeStatus: "preview_applied",
    baseGraphVersion: V1,
    savedGraphVersion: V1,
    hasProposalPayload: true,
  });
  const saved = reconcilePersistedPreview({
    changeStatus: "applied_saved",
    baseGraphVersion: V1,
    savedGraphVersion: V1,
    hasProposalPayload: true,
  });
  expect(transcriptHasAppliedSavedChange([notSaved])).toBe(false);
  expect(transcriptHasAppliedSavedChange([notSaved, saved])).toBe(true);
});
