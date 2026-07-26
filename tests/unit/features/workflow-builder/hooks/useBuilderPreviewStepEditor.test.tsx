/**
 * REACT-AGENT-RESOLVER-RECOVERY-1 — "Open step editor" from the React Agent's required-details panel.
 *
 * The reported failure said "You can finish this in the step editor" while offering no path there.
 * A PREVIEW node has no config panel because it isn't in the draft yet, so the honest implementation
 * is the one the button's label states: run the SAME explicit additive local-draft apply (carrying
 * every value already entered), then select that node and highlight that field.
 *
 * What this proves is the whole contract, not a callback:
 *   - the CORRECT node is selected (not a positional guess, and correct even when a proposed trigger
 *     is skipped because the draft already has one),
 *   - the CORRECT field is highlighted,
 *   - every guided-setup value the user entered lands on the new node,
 *   - existing draft nodes and their config are untouched, and nothing is saved / activated / run,
 *   - no second workflow is created.
 */
const mockCreateCheckpoint = jest.fn();
jest.mock("@/lib/api/workflowCheckpoints", () => ({
  __esModule: true,
  listWorkflowCheckpoints: jest.fn(async () => []),
  createWorkflowCheckpoint: (...a: unknown[]) => mockCreateCheckpoint(...a),
  restoreWorkflowCheckpoint: jest.fn(),
}));

import { act, renderHook } from "@testing-library/react";
import { useBuilderPreview } from "@/features/workflow-builder/hooks/useBuilderPreview";
import { useGraphSlice } from "@/features/workflow-builder/state/graphSlice";
import { useConfigSlice } from "@/features/workflow-builder/state/configSlice";
import type { WorkflowPlan } from "@/contracts/guidanceSession";
import type { DraftPreview } from "@/contracts/workflowPlanPreview";
import type { PreviewSetupFieldsByType } from "@/core/workflows/previewSetupFields";

const plan = {
  schemaVersion: 1,
  title: "Typeform to Mailchimp",
  summary: "New response adds a subscriber.",
  notApplied: true,
  steps: [
    { ref: "s0", role: "trigger", provider: "typeform", type: "new_response_in_form", purpose: "watch" },
    { ref: "s1", role: "action", provider: "mailchimp", type: "add_subscriber", purpose: "subscribe" },
    { ref: "s2", role: "action", provider: "gmail", type: "send_email", purpose: "notify" },
  ],
} as unknown as WorkflowPlan;

const preview = {
  version: 1,
  title: "Typeform to Mailchimp",
  summary: "New response adds a subscriber.",
  notice: "Preview only — your workflow has not changed.",
  notApplied: true,
  nodes: [
    { previewId: "preview-step-1", role: "trigger", provider: "typeform", type: "new_response_in_form", label: "New Response in Form", purpose: "watch", notApplied: true },
    { previewId: "preview-step-2", role: "action", provider: "mailchimp", type: "add_subscriber", label: "Add Subscriber", purpose: "subscribe", notApplied: true },
    { previewId: "preview-step-3", role: "action", provider: "gmail", type: "send_email", label: "Send Email", purpose: "notify", notApplied: true },
  ],
  edges: [],
} as unknown as DraftPreview;

const setupFieldsByType: PreviewSetupFieldsByType = {
  "typeform:new_response_in_form": [
    { name: "formId", label: "Form", type: "select-async", required: true, optionsSource: "typeform:forms" },
  ],
  "mailchimp:add_subscriber": [
    { name: "audience_id", label: "Audience", type: "select-async", required: true, optionsSource: "mailchimp:audiences" },
    { name: "email_address", label: "Email address", type: "text", required: true },
  ],
};

function resetStores(): void {
  useGraphSlice.setState({
    workflowId: "wf-1",
    pendingNodes: [],
    pendingEdges: [],
    isDirty: false,
    saveError: null,
  } as never);
  useConfigSlice.setState({
    activeNodeId: null,
    focusFieldKey: null,
    focusFieldNodeId: null,
    focusFieldOrigin: null,
  } as never);
}

function mountHook() {
  return renderHook(() =>
    useBuilderPreview({
      workflowId: "wf-1",
      localOnly: true, // no checkpoint round-trip; this hook path is what the rail uses
      setupFieldsByType,
      pendingNodes: useGraphSlice.getState().pendingNodes,
      pendingEdges: useGraphSlice.getState().pendingEdges,
    }),
  );
}

beforeEach(() => {
  jest.clearAllMocks();
  resetStores();
});

describe("handleOpenPreviewStepEditor", () => {
  it("selects the node the preview field became and highlights that exact field", () => {
    const { result } = mountHook();
    act(() => {
      result.current.handleShowPreview({ plan, preview });
    });
    // The user typed an audience id by hand because the Mailchimp resolver couldn't list any.
    act(() => {
      result.current.handlePreviewConfigChange("preview-step-2", "audience_id", "aud_manual_1");
      result.current.handlePreviewConfigChange("preview-step-2", "email_address", "lead@example.com");
    });

    act(() => {
      result.current.handleOpenPreviewStepEditor("preview-step-2", "audience_id");
    });

    const nodes = useGraphSlice.getState().pendingNodes;
    expect(nodes).toHaveLength(3);
    const mailchimpNode = nodes.find((n) => n.provider === "mailchimp");
    expect(mailchimpNode).toBeDefined();

    const config = useConfigSlice.getState();
    expect(config.activeNodeId).toBe(mailchimpNode!.id);
    expect(config.focusFieldNodeId).toBe(mailchimpNode!.id);
    expect(config.focusFieldKey).toBe("audience_id");

    // Everything the user entered came with it — including the hand-typed id.
    expect(mailchimpNode!.config).toMatchObject({
      audience_id: "aud_manual_1",
      email_address: "lead@example.com",
    });
  });

  it("stays correct when a proposed trigger is SKIPPED because the draft already has one", () => {
    // The classic off-by-one trap: addedNodeIds no longer lines up positionally with plan steps.
    useGraphSlice.setState({
      pendingNodes: [
        { id: "existing-trigger", kind: "trigger", provider: "slack", type: "new_message", config: { channel: "C1" }, position: { x: 0, y: 0 } },
      ],
    } as never);
    const { result } = mountHook();
    act(() => {
      result.current.handleShowPreview({ plan, preview });
    });
    act(() => {
      result.current.handleOpenPreviewStepEditor("preview-step-3", "to");
    });

    const nodes = useGraphSlice.getState().pendingNodes;
    // The typeform trigger was skipped (no replace-trigger), so only the two actions were added.
    expect(nodes.filter((n) => n.provider === "typeform")).toHaveLength(0);
    const gmailNode = nodes.find((n) => n.provider === "gmail");
    expect(gmailNode).toBeDefined();
    expect(useConfigSlice.getState().activeNodeId).toBe(gmailNode!.id);
    expect(useConfigSlice.getState().focusFieldKey).toBe("to");

    // The pre-existing node and its config are untouched.
    const existing = nodes.find((n) => n.id === "existing-trigger");
    expect(existing?.config).toEqual({ channel: "C1" });
  });

  it("does not create another workflow, save, or activate — the draft is only edited locally", () => {
    const { result } = mountHook();
    act(() => {
      result.current.handleShowPreview({ plan, preview });
    });
    act(() => {
      result.current.handleOpenPreviewStepEditor("preview-step-1", "formId");
    });
    const graph = useGraphSlice.getState();
    expect(graph.workflowId).toBe("wf-1"); // same workflow, no second one
    expect(graph.isDirty).toBe(true); // a normal local draft edit
    expect(mockCreateCheckpoint).not.toHaveBeenCalled(); // localOnly builder
  });

  it("falls back to the existing open-first-incomplete behavior when the target can't be resolved", () => {
    const { result } = mountHook();
    act(() => {
      result.current.handleShowPreview({ plan, preview });
    });
    act(() => {
      // A preview id that isn't in this plan — never guess a node for it.
      result.current.handleOpenPreviewStepEditor("preview-step-99", "formId");
    });
    expect(useConfigSlice.getState().focusFieldKey).toBeNull();
    // The steps were still applied (the action's stated first half ran).
    expect(useGraphSlice.getState().pendingNodes).toHaveLength(3);
  });
});
