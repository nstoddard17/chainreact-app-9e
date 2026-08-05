const mockRequest = jest.fn();
jest.mock("@/lib/api/ai/guidance", () => ({
  requestWorkflowGuidance: (...a: unknown[]) => mockRequest(...a),
}));

import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { WorkflowGuidancePanel } from "@/features/workflows/WorkflowGuidancePanel";
import {
  useGuidanceConversation,
  type GuidanceChatMessage,
  type GuidanceConversationPersistence,
} from "@/features/workflows/useGuidanceConversation";
import { reconcilePersistedPreview } from "@/core/workflows/reactAgentPreviewReconciliation";
import { computeEditableGraphVersion } from "@/core/workflows/editableGraphVersion";

/**
 * REACT-AGENT-CONVERSATION-PERSISTENCE-1 — how a RESTORED transcript renders.
 *
 * Two things must be visibly true when a user comes back to a workflow: the
 * conversation is there, and every past proposal is honestly labelled against
 * what is actually saved. A restored proposal must never quietly behave like a
 * live one — no auto-show on the canvas, no Apply on a stale suggestion.
 */

/**
 * RESTORED-EDIT-PROPOSAL-STALE-MISMATCH-1 — REAL canonical graph fingerprints, not timestamps.
 * These fixtures used to be ISO timestamps, which is what let the hash-vs-timestamp defect hide:
 * timestamp-to-timestamp compares equal, so the harness agreed with itself while production
 * compared a fingerprint against `hydratedRevision` and marked every restored edit proposal stale.
 */
const GRAPH_A = {
  nodes: [
    { id: "t1", kind: "trigger", provider: "stripe", type: "event_received", config: {}, position: { x: 0, y: 0 } },
    { id: "a1", kind: "action", provider: "slack", type: "send_channel_message", config: {}, position: { x: 0, y: 120 } },
  ],
  edges: [{ id: "e1", from: "t1", to: "a1" }],
};
const V1 = computeEditableGraphVersion(GRAPH_A);
const V2 = computeEditableGraphVersion({ ...GRAPH_A, edges: [] });
const CHANGE = "11111111-1111-4111-8111-111111111111";

const plan = { schemaVersion: 1, title: "Payment alert", steps: [] } as never;
const preview = { version: 1, title: "Payment alert", nodes: [], edges: [] } as never;

const restored: readonly GuidanceChatMessage[] = [
  { id: "p:1", role: "user", text: "post Stripe payments to Slack", restored: true },
  {
    id: "p:2",
    role: "assistant",
    text: "Here's the workflow.",
    plan,
    preview,
    baseGraphVersion: V1,
    agentChangeId: CHANGE,
    restored: true,
  },
];

function persistenceOf(
  messages: readonly GuidanceChatMessage[],
): GuidanceConversationPersistence {
  return { load: async () => messages, append: () => {} };
}

/** Render the rail with an injected, already-restored conversation. */
function Harness(props: {
  readonly onPreviewToCanvas?: jest.Mock;
  readonly currentGraphVersion: string | null;
  readonly changeStatus: Parameters<typeof reconcilePersistedPreview>[0]["changeStatus"];
  readonly messages?: readonly GuidanceChatMessage[];
}) {
  const conversation = useGuidanceConversation(
    { accountId: "acct-1", workflowId: "wf-1" },
    { persistence: persistenceOf(props.messages ?? restored) },
  );
  return (
    <WorkflowGuidancePanel
      accountId="acct-1"
      workflowId="wf-1"
      conversational
      conversation={conversation}
      {...(props.onPreviewToCanvas ? { onPreviewToCanvas: props.onPreviewToCanvas } : {})}
      reconcileRestoredPreview={(m) =>
        reconcilePersistedPreview({
          ...(m.agentChangeId ? { agentChangeId: m.agentChangeId } : {}),
          changeStatus: props.changeStatus,
          baseGraphVersion: m.baseGraphVersion ?? null,
          currentGraphVersion: props.currentGraphVersion,
          hasProposalPayload: m.hasProposalPayload,
        })
      }
    />
  );
}

beforeEach(() => {
  jest.clearAllMocks();
});

it("restores the transcript and labels an applied-but-unsaved proposal 'Not saved'", async () => {
  render(<Harness currentGraphVersion={V1} changeStatus="preview_applied" />);

  expect(await screen.findByText("post Stripe payments to Slack")).toBeInTheDocument();
  expect(screen.getByText("Here's the workflow.")).toBeInTheDocument();
  const badge = await screen.findByTestId("workflow-guidance-restored-preview");
  expect(badge).toHaveAttribute("data-state", "not_saved");
  expect(screen.getByTestId("workflow-guidance-restored-preview-label")).toHaveTextContent(
    "Not saved",
  );
  expect(badge).toHaveTextContent(/isn't part of your workflow/i);
});

it("never auto-shows a restored proposal on the canvas", async () => {
  const onPreviewToCanvas = jest.fn();
  render(
    <Harness
      currentGraphVersion={V1}
      changeStatus="preview_applied"
      onPreviewToCanvas={onPreviewToCanvas}
    />,
  );
  await screen.findByTestId("workflow-guidance-restored-preview");
  // Give the auto-show effect every chance to fire.
  await waitFor(() => expect(screen.getByText("Here's the workflow.")).toBeInTheDocument());
  expect(onPreviewToCanvas).not.toHaveBeenCalled();
});

it("offers an explicit reopen for a still-compatible proposal, carrying its lifecycle id", async () => {
  const user = userEvent.setup();
  const onPreviewToCanvas = jest.fn();
  render(
    <Harness
      currentGraphVersion={V1}
      changeStatus="preview_applied"
      onPreviewToCanvas={onPreviewToCanvas}
    />,
  );
  await user.click(await screen.findByTestId("workflow-guidance-restored-preview-reopen"));
  expect(onPreviewToCanvas).toHaveBeenCalledTimes(1);
  expect(onPreviewToCanvas.mock.calls[0]![0]).toMatchObject({
    agentChangeId: CHANGE,
    baseGraphVersion: V1,
  });
});

it("marks the proposal STALE and withdraws reopen when the saved workflow changed", async () => {
  const onPreviewToCanvas = jest.fn();
  render(
    <Harness
      currentGraphVersion={V2}
      changeStatus="preview_created"
      onPreviewToCanvas={onPreviewToCanvas}
    />,
  );
  const badge = await screen.findByTestId("workflow-guidance-restored-preview");
  expect(badge).toHaveAttribute("data-state", "stale");
  expect(badge).toHaveTextContent(/Ask React to update it/i);
  expect(screen.queryByTestId("workflow-guidance-restored-preview-reopen")).toBeNull();
  expect(onPreviewToCanvas).not.toHaveBeenCalled();
});

it("keeps a discarded proposal in history with no way to act on it", async () => {
  const onPreviewToCanvas = jest.fn();
  render(
    <Harness
      currentGraphVersion={V1}
      changeStatus="preview_discarded"
      onPreviewToCanvas={onPreviewToCanvas}
    />,
  );
  const badge = await screen.findByTestId("workflow-guidance-restored-preview");
  expect(badge).toHaveAttribute("data-state", "discarded");
  // The turn is still readable in the transcript…
  expect(screen.getByText("Here's the workflow.")).toBeInTheDocument();
  // …but it cannot be reopened or re-applied.
  expect(screen.queryByTestId("workflow-guidance-restored-preview-reopen")).toBeNull();
  expect(onPreviewToCanvas).not.toHaveBeenCalled();
});

it("labels an applied AND saved proposal 'Applied'", async () => {
  render(<Harness currentGraphVersion={V1} changeStatus="applied_saved" />);
  const badge = await screen.findByTestId("workflow-guidance-restored-preview");
  expect(badge).toHaveAttribute("data-state", "applied");
  expect(screen.getByTestId("workflow-guidance-restored-preview-label")).toHaveTextContent(
    "Applied",
  );
});
