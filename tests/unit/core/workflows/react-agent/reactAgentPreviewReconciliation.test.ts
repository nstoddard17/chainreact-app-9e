/** @jest-environment node */
import {
  reconcilePersistedPreview,
  transcriptHasAppliedSavedChange,
  describeProposalReconciliation,
} from "@/core/workflows/reactAgentPreviewReconciliation";
import { computeEditableGraphVersion } from "@/core/workflows/editableGraphVersion";

/**
 * REACT-AGENT-CONVERSATION-PERSISTENCE-1 — reconciling a restored proposal
 * against the workflow as it stands NOW.
 *
 * The product rule: conversation history remembers what happened; the SAVED
 * workflow determines what exists. Every case below is one way those two can
 * disagree, and the verdict must side with the saved workflow.
 */

/**
 * RESTORED-EDIT-PROPOSAL-STALE-MISMATCH-1 — these fixtures are now REAL canonical graph
 * fingerprints, produced by the same function production uses on both sides of the comparison.
 *
 * They used to be ISO timestamps on BOTH sides, which is a world production never had: a
 * proposal's `baseGraphVersion` has always been a `computeEditableGraphVersion` digest, while the
 * value fed in as the current version was `graphSlice.hydratedRevision` — the workflow's
 * `updatedAt`. Comparing timestamp-to-timestamp made every case here pass while production
 * compared fingerprint-to-timestamp and marked every restored edit proposal Stale.
 */
const GRAPH_A = {
  nodes: [
    { id: "t1", kind: "trigger", provider: "gmail", type: "new_email", config: {}, position: { x: 0, y: 0 } },
    { id: "a1", kind: "action", provider: "slack", type: "send_direct_message", config: {}, position: { x: 0, y: 120 } },
  ],
  edges: [{ id: "e1", from: "t1", to: "a1" }],
};
const GRAPH_B = {
  ...GRAPH_A,
  nodes: [GRAPH_A.nodes[0]!, { ...GRAPH_A.nodes[1]!, type: "send_channel_message" }],
};
const V1 = computeEditableGraphVersion(GRAPH_A);
const V2 = computeEditableGraphVersion(GRAPH_B);
/** What `graphSlice.hydratedRevision` actually holds — the shape that caused the defect. */
const HYDRATED_REVISION_TIMESTAMP = "2026-07-29T10:00:00.000Z";
const CHANGE = "11111111-1111-4111-8111-111111111111";

it("a proposal that was never applied is history, and can be reopened while it still fits", () => {
  const v = reconcilePersistedPreview({
    agentChangeId: CHANGE,
    changeStatus: "preview_created",
    baseGraphVersion: V1,
    currentGraphVersion: V1,
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
    currentGraphVersion: V1,
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
    currentGraphVersion: V2,
    proposedGraphVersion: V2,
    hasProposalPayload: true,
  });
  expect(v.state).toBe("applied");
  expect(v.label).toBe("Applied");
  expect(v.appliedToSavedWorkflow).toBe(true);
  expect(v.canReopen).toBe(false);
});

it("an applied+saved change whose workflow moved on is still applied, just superseded", () => {
  // The workflow is NOT at the proposal's end state any more — something else changed it.
  const v = reconcilePersistedPreview({
    agentChangeId: CHANGE,
    changeStatus: "applied_saved",
    baseGraphVersion: V1,
    currentGraphVersion: V1,
    proposedGraphVersion: V2,
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
    currentGraphVersion: V2,
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
    currentGraphVersion: V2,
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
      currentGraphVersion: V1,
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
    currentGraphVersion: V1,
    hasProposalPayload: true,
  });
  expect(v.state).toBe("failed");
  expect(v.canReopen).toBe(false);
});

it("an unknown CURRENT version fails closed — we never claim compatibility we can't check", () => {
  const v = reconcilePersistedPreview({
    changeStatus: null,
    baseGraphVersion: V1,
    currentGraphVersion: null,
    hasProposalPayload: true,
  });
  // Fails closed, but does NOT accuse the user's workflow of having changed.
  expect(v.state).toBe("version_unknown");
  expect(v.canReopen).toBe(false);
  expect(v.detail).not.toMatch(/changed/i);
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
    currentGraphVersion: V1,
    hasProposalPayload: true,
  });
  expect(applied.state).toBe("not_saved");
  expect(applied.label).toBe("Not saved");
  expect(applied.canReopen).toBe(true);

  const shown = reconcilePersistedPreview({
    changeStatus: "preview_created",
    baseGraphVersion: null,
    currentGraphVersion: V2,
    hasProposalPayload: true,
  });
  expect(shown.state).toBe("not_applied");
  expect(shown.canReopen).toBe(true);
});

it("a proposal whose payload did not survive persistence is never reopenable", () => {
  const v = reconcilePersistedPreview({
    changeStatus: "preview_created",
    baseGraphVersion: V1,
    currentGraphVersion: V1,
    hasProposalPayload: false,
  });
  expect(v.canReopen).toBe(false);
});

it("transcriptHasAppliedSavedChange is true only when something actually landed", () => {
  const notSaved = reconcilePersistedPreview({
    changeStatus: "preview_applied",
    baseGraphVersion: V1,
    currentGraphVersion: V1,
    hasProposalPayload: true,
  });
  const saved = reconcilePersistedPreview({
    changeStatus: "applied_saved",
    baseGraphVersion: V1,
    currentGraphVersion: V1,
    hasProposalPayload: true,
  });
  expect(transcriptHasAppliedSavedChange([notSaved])).toBe(false);
  expect(transcriptHasAppliedSavedChange([notSaved, saved])).toBe(true);
});

/**
 * RESTORED-EDIT-PROPOSAL-STALE-MISMATCH-1 — the defect itself.
 *
 * Production compared a proposal's `baseGraphVersion` (a `computeEditableGraphVersion` content
 * fingerprint) against `graphSlice.hydratedRevision` (the workflow's `updatedAt` timestamp). A
 * timestamp can never equal a fingerprint, so EVERY restored edit proposal reconciled as
 * "the workflow moved on": badged Stale, Apply withdrawn, even when nothing had changed.
 */
describe("fingerprint-vs-timestamp (the defect)", () => {
  it("a restored edit proposal is CURRENT when the graph is unchanged", () => {
    const v = reconcilePersistedPreview({
      agentChangeId: CHANGE,
      changeStatus: "preview_created",
      baseGraphVersion: computeEditableGraphVersion(GRAPH_A),
      currentGraphVersion: computeEditableGraphVersion(GRAPH_A),
      hasProposalPayload: true,
    });
    expect(v.state).toBe("not_applied");
    expect(v.canReopen).toBe(true);
    expect(v.label).not.toBe("Stale");
  });

  it("never compares a content fingerprint with a hydrated timestamp — and never calls it stale", () => {
    const v = reconcilePersistedPreview({
      changeStatus: "preview_created",
      baseGraphVersion: computeEditableGraphVersion(GRAPH_A),
      currentGraphVersion: HYDRATED_REVISION_TIMESTAMP,
      hasProposalPayload: true,
    });
    // Fails closed rather than pretending, and does NOT accuse the workflow of changing.
    expect(v.state).toBe("version_unknown");
    expect(v.state).not.toBe("stale");
    expect(v.canReopen).toBe(false);
  });

  it("a timestamp is never accepted as a match either (both directions fail closed)", () => {
    const v = reconcilePersistedPreview({
      changeStatus: "preview_created",
      baseGraphVersion: HYDRATED_REVISION_TIMESTAMP,
      currentGraphVersion: HYDRATED_REVISION_TIMESTAMP,
      hasProposalPayload: true,
    });
    expect(v.state).toBe("version_unknown");
    expect(v.canReopen).toBe(false);
  });
});

describe("stale detection still catches real changes", () => {
  const base = computeEditableGraphVersion(GRAPH_A);
  const cases: ReadonlyArray<readonly [string, typeof GRAPH_A]> = [
    [
      "node configuration changed",
      { ...GRAPH_A, nodes: [GRAPH_A.nodes[0]!, { ...GRAPH_A.nodes[1]!, config: { channel: "#ops" } }] },
    ],
    [
      "a node was added",
      {
        ...GRAPH_A,
        nodes: [
          ...GRAPH_A.nodes,
          { id: "a2", kind: "action", provider: "slack", type: "send_channel_message", config: {}, position: { x: 0, y: 240 } },
        ],
      },
    ],
    ["a node was removed", { ...GRAPH_A, nodes: [GRAPH_A.nodes[0]!] }],
    ["an edge changed", { ...GRAPH_A, edges: [{ id: "e1", from: "a1", to: "t1" }] }],
  ];
  it.each(cases)("marks the restored proposal stale when %s", (_label, changed) => {
    const v = reconcilePersistedPreview({
      changeStatus: "preview_created",
      baseGraphVersion: base,
      currentGraphVersion: computeEditableGraphVersion(changed),
      hasProposalPayload: true,
    });
    expect(v.state).toBe("stale");
    expect(v.canReopen).toBe(false);
  });

  it("stale copy carries no workflow data, ids, hashes or timestamps", () => {
    const v = reconcilePersistedPreview({
      changeStatus: "preview_created",
      baseGraphVersion: base,
      currentGraphVersion: computeEditableGraphVersion(GRAPH_B),
      hasProposalPayload: true,
    });
    for (const text of [v.label, v.detail]) {
      expect(text).not.toMatch(/[0-9a-f]{8}/); // no fingerprint
      expect(text).not.toMatch(/\d{4}-\d{2}-\d{2}/); // no timestamp
      expect(text).not.toMatch(/gmail|slack|new_email|send_/i); // no workflow content
    }
  });
});

describe("describeProposalReconciliation — safe diagnostics", () => {
  it("reports the comparison without exposing workflow content or a full fingerprint", () => {
    const input = {
      agentChangeId: CHANGE,
      changeStatus: "preview_created" as const,
      baseGraphVersion: V1,
      currentGraphVersion: V2,
      hasProposalPayload: true,
    };
    const d = describeProposalReconciliation(input, reconcilePersistedPreview(input));
    expect(d.versionStrategy).toBe("graph_fingerprint");
    expect(d.comparison).toBe("moved_on");
    expect(d.state).toBe("stale");
    expect(d.baseVersionWellFormed).toBe(true);
    expect(d.currentVersionWellFormed).toBe(true);
    // Truncated: never the whole digest, never workflow content.
    expect(d.baseVersionPrefix).toHaveLength(4);
    expect(d.baseVersionPrefix).not.toBe(V1);
    expect(JSON.stringify(d)).not.toMatch(/gmail|slack|new_email|send_/i);
  });

  it("flags a non-fingerprint (timestamp) input as malformed instead of comparing it", () => {
    const input = {
      changeStatus: "preview_created" as const,
      baseGraphVersion: V1,
      currentGraphVersion: HYDRATED_REVISION_TIMESTAMP,
      hasProposalPayload: true,
    };
    const d = describeProposalReconciliation(input, reconcilePersistedPreview(input));
    expect(d.currentVersionWellFormed).toBe(false);
    expect(d.comparison).toBe("unknown");
    expect(d.state).toBe("version_unknown");
  });
});
