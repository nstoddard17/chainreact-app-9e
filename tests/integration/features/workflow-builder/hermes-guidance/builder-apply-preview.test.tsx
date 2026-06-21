/**
 * WorkflowBuilder — explicit "Apply preview" additive patch flow (HERMES-AGENT-APPLY-PREVIEW-PATCH).
 *
 * Drives the real builder: open "Build with me" → submit → "Show on canvas" → "Apply preview".
 * Proves apply is an explicit, user-initiated, ADDITIVE LOCAL-draft edit: blank graphs receive the
 * proposed nodes/edges; existing graphs keep everything and only gain the proposed pieces (a proposed
 * trigger is skipped — no replace); the workflow becomes dirty via the normal mechanism; NOTHING is
 * auto-saved/activated/run; no separate workflow is created; new nodes have EMPTY config (nothing
 * inferred); the overlay clears and a safe confirmation shows; the browser calls only the guidance
 * helper.
 */
const mockRouterRefresh = jest.fn();
jest.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: mockRouterRefresh, push: jest.fn() }),
}));

jest.mock("@/lib/api/discovery", () => ({
  __esModule: true,
  listNativeActions: async () => [],
  listNativeTriggers: async () => [],
  listProviderActions: async () => [],
  listProviderTriggers: async () => [],
  DiscoveryApiError: class DiscoveryApiError extends Error {
    code = "UNKNOWN";
    status = 500;
  },
}));

const mockUpdateWorkflow = jest.fn();
jest.mock("@/lib/api/workflows", () => {
  const actual = jest.requireActual("@/lib/api/workflows");
  return { ...actual, updateWorkflow: (...a: unknown[]) => mockUpdateWorkflow(...a) };
});

const mockRequest = jest.fn();
jest.mock("@/lib/api/ai/guidance", () => ({
  requestWorkflowGuidance: (...a: unknown[]) => mockRequest(...a),
}));

import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { WorkflowBuilder } from "@/features/workflow-builder/WorkflowBuilder";
import { useGraphSlice } from "@/features/workflow-builder/state/graphSlice";
import { useConfigSlice } from "@/features/workflow-builder/state/configSlice";
import type { WorkflowDetail } from "@/contracts/workflow";

const triggerProviders = [{ id: "slack", displayName: "Slack" }];
const actionProviders = [{ id: "github", displayName: "GitHub" }];

const workflowPlan = {
  schemaVersion: 1,
  title: "Lead follow-up",
  summary: "Watch then notify.",
  notApplied: true,
  steps: [
    { ref: "s0", role: "trigger", provider: "gmail", type: "new_email", purpose: "watch" },
    { ref: "s1", role: "action", provider: "slack", type: "send_message", purpose: "notify" },
  ],
};
const previewDraft = {
  version: 1,
  title: "Lead follow-up",
  summary: "Watch then notify.",
  notice: "Preview only — your workflow has not changed.",
  notApplied: true,
  nodes: [
    { previewId: "preview-step-1", role: "trigger", provider: "gmail", type: "new_email", label: "gmail:new_email", purpose: "watch", notApplied: true },
    { previewId: "preview-step-2", role: "action", provider: "slack", type: "send_message", label: "slack:send_message", purpose: "notify", notApplied: true },
  ],
  edges: [{ previewId: "preview-edge-1", fromPreviewId: "preview-step-1", toPreviewId: "preview-step-2", notApplied: true }],
};

function workflow(nodes: WorkflowDetail["draftDefinition"]["nodes"], edges: WorkflowDetail["draftDefinition"]["edges"]): WorkflowDetail {
  return {
    id: "wf-1", name: "Test", state: "draft", disabledReason: null, disabledContext: null,
    activeRevisionId: null, draftDefinition: { nodes, edges }, deletedAt: null,
    createdAt: "2026-05-17T00:00:00Z", updatedAt: "2026-05-17T00:00:00Z",
  };
}

beforeEach(() => {
  mockUpdateWorkflow.mockReset();
  mockRequest.mockReset().mockResolvedValue({ ok: true, guidanceText: "Here's an idea.", source: "hermes-agent", workflowPlan, previewDraft });
  useGraphSlice.getState().reset();
  useConfigSlice.getState().reset();
});

function renderBuilder(wf: WorkflowDetail) {
  return render(
    <WorkflowBuilder workflow={wf} triggerProviders={triggerProviders} actionProviders={actionProviders} accountId="acct-1" guidanceEnabled />,
  );
}

async function applyPreview(user: ReturnType<typeof userEvent.setup>) {
  // HERMES-AGENT-REPLACE-BUILDER-AI-PLAN — guidance now lives directly in the left rail (no
  // floating toggle to open first).
  await user.type(screen.getByPlaceholderText(/Example:/i), "follow up with leads");
  await user.click(screen.getByTestId("workflow-guidance-submit"));
  await user.click(await screen.findByTestId("workflow-guidance-show-on-canvas"));
  await user.click(await screen.findByTestId("builder-preview-apply"));
}

describe("builder apply-preview — blank workflow", () => {
  it("adds the proposed trigger+action+edge to the local draft (empty config), dirty, no save", async () => {
    const user = userEvent.setup();
    renderBuilder(workflow([], []));
    await applyPreview(user);

    const s = useGraphSlice.getState();
    expect(s.pendingNodes).toHaveLength(2);
    expect(s.pendingNodes.map((n) => `${n.provider}:${n.type}`)).toEqual(["gmail:new_email", "slack:send_message"]);
    expect(s.pendingEdges).toHaveLength(1);
    expect(s.pendingNodes.every((n) => Object.keys(n.config).length === 0)).toBe(true); // nothing inferred
    expect(s.isDirty).toBe(true); // dirty via the normal mechanism
    expect(mockUpdateWorkflow).not.toHaveBeenCalled(); // no auto-save
  });

  it("clears the overlay and shows the safe confirmation after apply", async () => {
    const user = userEvent.setup();
    renderBuilder(workflow([], []));
    await applyPreview(user);
    await waitFor(() => expect(screen.queryByTestId("builder-preview-overlay")).not.toBeInTheDocument());
    expect(screen.getByTestId("builder-apply-notice")).toHaveTextContent(
      "Preview applied to draft — review required fields before saving or activating.",
    );
  });

  it("calls ONLY the guidance helper (no save/update, no second network call)", async () => {
    const user = userEvent.setup();
    renderBuilder(workflow([], []));
    await applyPreview(user);
    expect(mockRequest).toHaveBeenCalledTimes(1);
    expect(mockUpdateWorkflow).not.toHaveBeenCalled();
  });
});

describe("builder apply-preview — existing workflow", () => {
  const existingNodes = [
    { id: "trig", kind: "trigger" as const, provider: "slack", type: "message_received", config: { foo: "bar" }, position: { x: 0, y: 0 } },
    { id: "act", kind: "action" as const, provider: "github", type: "add_comment", config: { repository: "octocat/x" }, position: { x: 0, y: 200 } },
  ];
  const existingEdges = [{ id: "e1", from: "trig", to: "act" }];

  it("keeps ALL existing nodes/edges/config and only ADDS the proposed action (trigger skipped — no replace)", async () => {
    const user = userEvent.setup();
    renderBuilder(workflow(existingNodes, existingEdges));
    await applyPreview(user);

    const s = useGraphSlice.getState();
    // Existing pieces untouched.
    expect(s.pendingNodes.find((n) => n.id === "trig")).toMatchObject({ provider: "slack", type: "message_received", config: { foo: "bar" } });
    expect(s.pendingNodes.find((n) => n.id === "act")).toMatchObject({ config: { repository: "octocat/x" } });
    expect(s.pendingEdges.some((e) => e.id === "e1")).toBe(true);
    // Proposed trigger skipped (already have one); only the action was added.
    expect(s.pendingNodes).toHaveLength(3);
    expect(s.pendingNodes.filter((n) => n.kind === "trigger")).toHaveLength(1);
    const added = s.pendingNodes.find((n) => n.provider === "slack" && n.type === "send_message")!;
    expect(added).toBeDefined();
    // HERMES-AGENT-APPLY-IN-PLACE: the action appends after the sole tail `act` (new anchor edge),
    // and the existing trigger→action edge `e1` is preserved (not removed/rewritten).
    expect(s.pendingEdges.some((e) => e.from === "act" && e.to === added.id)).toBe(true);
    expect(s.pendingEdges.some((e) => e.id === "e1")).toBe(true);
    expect(s.isDirty).toBe(true);
    expect(mockUpdateWorkflow).not.toHaveBeenCalled();
  });

  it("shows the in-place confirmation notice after an appended apply", async () => {
    const user = userEvent.setup();
    renderBuilder(workflow(existingNodes, existingEdges));
    await applyPreview(user);
    expect(screen.getByTestId("builder-apply-notice")).toHaveTextContent(
      "Preview applied to draft — review required fields before saving or activating.",
    );
  });
});

describe("builder apply-preview — insert between (selected mid-chain node)", () => {
  const existingNodes = [
    { id: "trig", kind: "trigger" as const, provider: "slack", type: "message_received", config: {}, position: { x: 0, y: 0 } },
    { id: "act", kind: "action" as const, provider: "github", type: "add_comment", config: { repository: "octocat/x" }, position: { x: 0, y: 200 } },
  ];
  const existingEdges = [{ id: "e1", from: "trig", to: "act" }];

  it("inserts the proposed action between the selected node and its single child (A → new → B)", async () => {
    const user = userEvent.setup();
    renderBuilder(workflow(existingNodes, existingEdges));
    await user.type(screen.getByPlaceholderText(/Example:/i), "follow up with leads");
    await user.click(screen.getByTestId("workflow-guidance-submit"));
    await user.click(await screen.findByTestId("workflow-guidance-show-on-canvas"));
    // Select the mid-chain trigger node (its sole outgoing edge trig → act is the split point).
    act(() => {
      useConfigSlice.getState().openNode({ nodeId: "trig", initialValues: {} });
    });
    await user.click(await screen.findByTestId("builder-preview-apply"));

    const s = useGraphSlice.getState();
    const added = s.pendingNodes.find((n) => n.provider === "slack" && n.type === "send_message")!;
    expect(added).toBeDefined();
    // Split: e1 (trig → act) removed; replaced by trig → new and new → act. Existing config kept.
    expect(s.pendingEdges.some((e) => e.id === "e1")).toBe(false);
    expect(s.pendingEdges.some((e) => e.from === "trig" && e.to === added.id)).toBe(true);
    expect(s.pendingEdges.some((e) => e.from === added.id && e.to === "act")).toBe(true);
    expect(s.pendingNodes.find((n) => n.id === "act")).toMatchObject({ config: { repository: "octocat/x" } });
    expect(screen.getByTestId("builder-apply-notice")).toHaveTextContent(
      "Preview inserted into draft — review required fields before saving or activating.",
    );
    expect(mockUpdateWorkflow).not.toHaveBeenCalled();
  });
});

describe("builder apply-preview — ambiguous multi-tail falls back to a side chain", () => {
  const multiTailNodes = [
    { id: "trig", kind: "trigger" as const, provider: "slack", type: "message_received", config: {}, position: { x: 0, y: 0 } },
    { id: "a1", kind: "action" as const, provider: "github", type: "add_comment", config: {}, position: { x: -120, y: 200 } },
    { id: "a2", kind: "action" as const, provider: "notion", type: "create_page", config: {}, position: { x: 120, y: 200 } },
  ];
  const multiTailEdges = [
    { id: "e1", from: "trig", to: "a1" },
    { id: "e2", from: "trig", to: "a2" },
  ];

  it("adds a detached chain and shows the safe fallback notice (no existing edge removed)", async () => {
    const user = userEvent.setup();
    renderBuilder(workflow(multiTailNodes, multiTailEdges));
    await applyPreview(user);

    const s = useGraphSlice.getState();
    const added = s.pendingNodes.find((n) => !["trig", "a1", "a2"].includes(n.id))!;
    expect(added).toBeDefined();
    expect(s.pendingEdges.some((e) => e.to === added.id)).toBe(false); // detached
    expect(s.pendingEdges.some((e) => e.id === "e1")).toBe(true); // existing edges preserved
    expect(s.pendingEdges.some((e) => e.id === "e2")).toBe(true);
    expect(screen.getByTestId("builder-apply-notice")).toHaveTextContent(
      "Preview added as a separate draft chain because ChainReact could not safely determine where to insert it.",
    );
    expect(mockUpdateWorkflow).not.toHaveBeenCalled();
  });
});

describe("builder apply-preview — post-apply config hints (HERMES-AGENT-APPLY-CONFIG-HINTS)", () => {
  // slack:send_message required fields, sourced exactly like the discovery registry would supply.
  const requiredFieldsByType = {
    "slack:send_message": {
      displayName: "Send Message",
      requiredFields: [
        { name: "channel", label: "Channel" },
        { name: "message", label: "Message" },
      ],
    },
  };

  function renderWithMeta(wf: WorkflowDetail) {
    return render(
      <WorkflowBuilder
        workflow={wf}
        triggerProviders={triggerProviders}
        actionProviders={actionProviders}
        requiredFieldsByType={requiredFieldsByType}
        accountId="acct-1"
        guidanceEnabled
      />,
    );
  }

  it("lists the newly-added node's missing required FIELD NAMES from metadata (no values)", async () => {
    const user = userEvent.setup();
    renderWithMeta(workflow([], []));
    await applyPreview(user);

    const hints = await screen.findByTestId("builder-apply-config-hints");
    // Field LABELS from metadata, names only.
    expect(hints).toHaveTextContent("Needs configuration: Channel, Message");
    // No values / secrets / tokens / credential ids ever rendered.
    expect(hints.textContent ?? "").not.toMatch(/token|secret|xox|Bearer|account[_-]?id|password/i);
  });

  it("marks the applied nodes with the short-lived 'Added from preview' badge", async () => {
    const user = userEvent.setup();
    renderWithMeta(workflow([], []));
    await applyPreview(user);

    const badges = await screen.findAllByTestId("added-from-preview-badge");
    expect(badges.length).toBeGreaterThan(0);

    // Dismissing the notice clears the badges (short-lived).
    await user.click(screen.getByTestId("builder-apply-notice-dismiss"));
    await waitFor(() =>
      expect(screen.queryAllByTestId("added-from-preview-badge")).toHaveLength(0),
    );
  });

  it("falls back to a generic review notice when the node type has no metadata", async () => {
    const user = userEvent.setup();
    // No requiredFieldsByType prop → metadata unavailable for every applied node.
    renderBuilder(workflow([], []));
    await applyPreview(user);

    const hints = await screen.findByTestId("builder-apply-config-hints");
    expect(hints).toHaveTextContent("Review this step");
    expect(hints).not.toHaveTextContent("Needs configuration:");
  });

  it("does not auto-save / update the workflow when surfacing hints", async () => {
    const user = userEvent.setup();
    renderWithMeta(workflow([], []));
    await applyPreview(user);
    expect(mockUpdateWorkflow).not.toHaveBeenCalled();
  });
});

describe("builder apply-preview — auto-open first incomplete node (HERMES-AGENT-AUTO-OPEN-FIRST-INCOMPLETE-AFTER-APPLY)", () => {
  // Only slack:send_message has metadata (with required fields) → the gmail trigger is "no metadata".
  const slackMeta = {
    "slack:send_message": {
      displayName: "Send Message",
      requiredFields: [
        { name: "channel", label: "Channel" },
        { name: "message", label: "Message" },
      ],
    },
  };
  function renderWith(wf: WorkflowDetail, meta: Record<string, { displayName: string; requiredFields: { name: string; label: string }[] }>) {
    return render(
      <WorkflowBuilder
        workflow={wf}
        triggerProviders={triggerProviders}
        actionProviders={actionProviders}
        requiredFieldsByType={meta}
        accountId="acct-1"
        guidanceEnabled
      />,
    );
  }

  it("selects/opens the first newly-added node that metadata confirms is incomplete", async () => {
    const user = userEvent.setup();
    renderWith(workflow([], []), slackMeta);
    await applyPreview(user);

    await waitFor(() => {
      const slack = useGraphSlice.getState().pendingNodes.find((n) => n.provider === "slack" && n.type === "send_message");
      expect(slack).toBeDefined();
      // The metadata-incomplete Slack action is selected (its config rail opens via activeNodeId).
      expect(useConfigSlice.getState().activeNodeId).toBe(slack!.id);
    });
    // The no-metadata gmail trigger is NOT auto-opened (we can't confirm it's incomplete).
    const gmail = useGraphSlice.getState().pendingNodes.find((n) => n.provider === "gmail");
    expect(useConfigSlice.getState().activeNodeId).not.toBe(gmail!.id);
    // Existing post-apply hints still render; nothing was saved.
    expect(screen.getByTestId("builder-apply-config-hints")).toBeInTheDocument();
    expect(mockUpdateWorkflow).not.toHaveBeenCalled();
  });

  it("opens the FIRST incomplete in added order when multiple newly-added nodes are incomplete", async () => {
    const user = userEvent.setup();
    const bothMeta = {
      "gmail:new_email": { displayName: "New Email", requiredFields: [{ name: "label", label: "Label" }] },
      "slack:send_message": { displayName: "Send Message", requiredFields: [{ name: "channel", label: "Channel" }] },
    };
    renderWith(workflow([], []), bothMeta);
    await applyPreview(user);

    await waitFor(() => {
      const gmail = useGraphSlice.getState().pendingNodes.find((n) => n.provider === "gmail" && n.type === "new_email");
      expect(gmail).toBeDefined();
      // The trigger is added first → it is the FIRST incomplete → it is the one opened.
      expect(useConfigSlice.getState().activeNodeId).toBe(gmail!.id);
    });
  });

  it("does NOT force-open any node when all newly-added nodes are complete", async () => {
    const user = userEvent.setup();
    const completeMeta = {
      "gmail:new_email": { displayName: "New Email", requiredFields: [] },
      "slack:send_message": { displayName: "Send Message", requiredFields: [] },
    };
    renderWith(workflow([], []), completeMeta);
    await applyPreview(user);
    await screen.findByTestId("builder-apply-notice");
    expect(useConfigSlice.getState().activeNodeId).toBeNull();
  });

  it("Show on canvas alone, then Discard, never selects/opens a node (and applies nothing)", async () => {
    const user = userEvent.setup();
    renderWith(workflow([], []), slackMeta);
    await user.type(screen.getByPlaceholderText(/Example:/i), "follow up with leads");
    await user.click(screen.getByTestId("workflow-guidance-submit"));
    await user.click(await screen.findByTestId("workflow-guidance-show-on-canvas"));
    // Showing the preview overlay selects nothing.
    expect(useConfigSlice.getState().activeNodeId).toBeNull();
    await user.click(await screen.findByTestId("builder-preview-discard"));
    // Discard still selects nothing and applied nothing to the draft.
    expect(useConfigSlice.getState().activeNodeId).toBeNull();
    expect(useGraphSlice.getState().pendingNodes).toHaveLength(0);
  });
});

// HERMES-AGENT-GUIDED-PREVIEW-SETUP-RAIL-UX — the holographic CANVAS nodes stay visual-only; the guided
// setup CONTROLS live in the React RAIL setup card (BuilderPreviewSetupCard via BuilderGuidanceRail),
// tied to the latest shown preview. Filling the rail updates ephemeral previewConfig only (no dirty /
// save / Hermes call); explicit Apply seeds those values into the new draft nodes.
describe("builder apply-preview — guided setup card in the rail (HERMES-AGENT-GUIDED-PREVIEW-SETUP-RAIL-UX)", () => {
  const setupFieldsByType = {
    "slack:send_message": [
      { name: "message", label: "Message", type: "textarea" as const, required: true },
      // recipient-class field, rendered as a deterministic local control in the rail.
      { name: "to", label: "To", type: "text" as const, required: true },
    ],
  };
  function previewMissing(missing: readonly string[]) {
    return {
      version: 1,
      title: "Lead follow-up",
      summary: "Watch then notify.",
      notice: "Preview only — your workflow has not changed.",
      notApplied: true,
      nodes: [
        { previewId: "preview-step-1", role: "trigger", provider: "gmail", type: "new_email", label: "gmail:new_email", purpose: "watch", notApplied: true },
        { previewId: "preview-step-2", role: "action", provider: "slack", type: "send_message", label: "slack:send_message", purpose: "notify", missingInputs: missing, notApplied: true },
      ],
      edges: [{ previewId: "preview-edge-1", fromPreviewId: "preview-step-1", toPreviewId: "preview-step-2", notApplied: true }],
    };
  }
  const slackNode = () => useGraphSlice.getState().pendingNodes.find((n) => n.provider === "slack" && n.type === "send_message");

  function renderGuided(
    requiredFieldsByType: Record<string, { displayName: string; requiredFields: { name: string; label: string }[] }>,
  ) {
    return render(
      <WorkflowBuilder
        workflow={workflow([], [])}
        triggerProviders={triggerProviders}
        actionProviders={actionProviders}
        requiredFieldsByType={requiredFieldsByType}
        setupFieldsByType={setupFieldsByType}
        accountId="acct-1"
        guidanceEnabled
      />,
    );
  }
  async function showPreview(user: ReturnType<typeof userEvent.setup>) {
    await user.type(screen.getByPlaceholderText(/Example:/i), "remind the team to review new leads");
    await user.click(screen.getByTestId("workflow-guidance-submit"));
    await user.click(await screen.findByTestId("workflow-guidance-show-on-canvas"));
  }

  it("the canvas node stays visual-only (short badge, no controls); the rail hosts the setup control", async () => {
    const user = userEvent.setup();
    mockRequest.mockResolvedValue({ ok: true, guidanceText: "ok", source: "hermes-agent", workflowPlan, previewDraft: previewMissing(["message", "channel"]) });
    renderGuided({ "slack:send_message": { displayName: "Send Message", requiredFields: [{ name: "message", label: "Message" }, { name: "channel", label: "Channel" }] } });
    await showPreview(user);
    await screen.findByTestId("builder-preview-overlay");

    // Canvas: short badge, no controls inside the overlay.
    expect(screen.getByTestId("preview-node-needs-setup")).toHaveTextContent("Needs setup · 2");
    expect(document.querySelector("[data-testid='builder-preview-overlay'] input,[data-testid='builder-preview-overlay'] select,[data-testid='builder-preview-overlay'] textarea")).toBeNull();
    // Rail: the supported control renders; the async `channel` defers to "Choose after Apply".
    expect(screen.getByTestId("builder-preview-setup-rail")).toBeInTheDocument();
    expect(screen.getByTestId("preview-setup-preview-step-2-message")).toBeInTheDocument();
    expect(screen.queryByTestId("preview-setup-preview-step-2-channel")).not.toBeInTheDocument();
    expect(screen.getByTestId("preview-setup-after-apply")).toHaveTextContent("channel");
  });

  it("filling rail controls (incl. a recipient field) stays preview-only and is NOT sent to Hermes; Apply seeds them and skips auto-open when all required are filled", async () => {
    const user = userEvent.setup();
    mockRequest.mockResolvedValue({ ok: true, guidanceText: "ok", source: "hermes-agent", workflowPlan, previewDraft: previewMissing(["message", "to"]) });
    renderGuided({ "slack:send_message": { displayName: "Send Message", requiredFields: [{ name: "message", label: "Message" }, { name: "to", label: "To" }] } });
    await showPreview(user);

    fireEvent.change(await screen.findByTestId("preview-setup-preview-step-2-message"), { target: { value: "Review new leads" } });
    fireEvent.change(screen.getByTestId("preview-setup-preview-step-2-to"), { target: { value: "team@example.com" } });
    // Preview-only: nothing applied / dirtied / saved before Apply.
    expect(useGraphSlice.getState().pendingNodes).toHaveLength(0);
    expect(useGraphSlice.getState().isDirty).toBe(false);
    expect(mockUpdateWorkflow).not.toHaveBeenCalled();
    // Filling setup controls (incl. the recipient `to`) never re-calls the guidance helper.
    expect(mockRequest).toHaveBeenCalledTimes(1);

    await user.click(screen.getByTestId("builder-preview-setup-apply"));
    await waitFor(() => expect(slackNode()).toBeDefined());
    // The recipient value is seeded into the draft config (only on explicit Apply).
    expect(slackNode()!.config).toEqual({ message: "Review new leads", to: "team@example.com" });
    expect(mockUpdateWorkflow).not.toHaveBeenCalled();
    // All required fields satisfied → no incomplete node force-opened.
    expect(useConfigSlice.getState().activeNodeId).toBeNull();
  });

  it("an async required field stays deferred; Apply seeds the supported value and auto-opens the still-incomplete node", async () => {
    const user = userEvent.setup();
    mockRequest.mockResolvedValue({ ok: true, guidanceText: "ok", source: "hermes-agent", workflowPlan, previewDraft: previewMissing(["message", "channel"]) });
    renderGuided({ "slack:send_message": { displayName: "Send Message", requiredFields: [{ name: "message", label: "Message" }, { name: "channel", label: "Channel" }] } });
    await showPreview(user);

    fireEvent.change(await screen.findByTestId("preview-setup-preview-step-2-message"), { target: { value: "Review new leads" } });
    await user.click(screen.getByTestId("builder-preview-setup-apply"));
    await waitFor(() => expect(slackNode()).toBeDefined());
    expect(slackNode()!.config).toEqual({ message: "Review new leads" });
    // `channel` still missing → the first incomplete node auto-opens.
    expect(useConfigSlice.getState().activeNodeId).toBe(slackNode()!.id);
  });

  it("Discard clears the rail setup card + ephemeral values (a re-shown preview starts empty); nothing applied", async () => {
    const user = userEvent.setup();
    mockRequest.mockResolvedValue({ ok: true, guidanceText: "ok", source: "hermes-agent", workflowPlan, previewDraft: previewMissing(["message"]) });
    renderGuided({ "slack:send_message": { displayName: "Send Message", requiredFields: [{ name: "message", label: "Message" }] } });
    await showPreview(user);
    fireEvent.change(await screen.findByTestId("preview-setup-preview-step-2-message"), { target: { value: "typed before discard" } });

    await user.click(screen.getByTestId("builder-preview-discard"));
    expect(useGraphSlice.getState().pendingNodes).toHaveLength(0);
    // The rail setup card is gone once the preview is discarded.
    await waitFor(() => expect(screen.queryByTestId("builder-preview-setup-rail")).not.toBeInTheDocument());

    // Re-show the (same-shaped) preview — the control is empty again (previewConfig was cleared).
    await user.click(await screen.findByTestId("workflow-guidance-show-on-canvas"));
    const reshown = await screen.findByTestId("preview-setup-preview-step-2-message");
    expect((reshown as HTMLTextAreaElement).value).toBe("");
  });
});
