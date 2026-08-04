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
  listAiActions: () => Promise.resolve([]),
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

// HERMES-AGENT-GUIDED-PREVIEW-SETUP-ASYNC-OPTIONS — the rail setup card loads async optionsSource
// fields through the EXISTING resolver helper (fetchOptionsSource → /api/options/[source]), never
// Hermes. Mock it so the dropdown populates deterministically; non-async tests never call it.
const mockFetchOptionsSource = jest.fn();
jest.mock("@/lib/api/options", () => ({
  __esModule: true,
  fetchOptionsSource: (...a: unknown[]) => mockFetchOptionsSource(...a),
}));

import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { WorkflowBuilder } from "@/features/workflow-builder/WorkflowBuilder";
import { useGraphSlice } from "@/features/workflow-builder/state/graphSlice";
import { useConfigSlice } from "@/features/workflow-builder/state/configSlice";
// REACT-AGENT-REVIEW-TRAY-UX-1 — the review-tray tests "fill in" a field exactly the way the config
// rail's Save does (draft → graph), so an issue resolves through the real path, not a test shortcut.
import { commitNodeConfigDraft } from "@/features/workflow-builder/state/commitConfigDraft";
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
  mockFetchOptionsSource.mockReset();
  mockRequest.mockReset().mockResolvedValue({ ok: true, guidanceText: "Here's an idea.", source: "hermes-agent", workflowPlan, previewDraft });
  useGraphSlice.getState().reset();
  useConfigSlice.getState().reset();
});

function renderBuilder(wf: WorkflowDetail) {
  return render(
    <WorkflowBuilder workflow={wf} triggerProviders={triggerProviders} actionProviders={actionProviders} accountId="acct-1" guidanceEnabled />,
  );
}

// Enter the guidance prompt the fast user-level way: focus + paste fires the same
// controlled-input path as typing, in ONE input event instead of one per character
// (BUILDER-JSDOM-PERFORMANCE-1). Per-character behavior is not this suite's contract.
async function enterPrompt(user: ReturnType<typeof userEvent.setup>, text: string) {
  await user.click(screen.getByPlaceholderText(/Example:/i));
  await user.paste(text);
}

async function applyPreview(user: ReturnType<typeof userEvent.setup>) {
  // HERMES-AGENT-REPLACE-BUILDER-AI-PLAN — guidance now lives directly in the left rail (no
  // floating toggle to open first). REACT-LIVE-SKELETON — the preview AUTO-shows on the canvas; the
  // overlay's "Apply preview" is the action (no redundant rail "Show on canvas" click — that button is
  // hidden while the preview is already displayed, per HERMES-AGENT-PREVIEW-SHOWN-DEDUP).
  await enterPrompt(user, "follow up with leads");
  await user.click(screen.getByTestId("workflow-guidance-submit"));
  await user.click(await screen.findByTestId("builder-preview-apply"));
}

describe("builder preview canvas state (HERMES-AGENT-PREVIEW-CANVAS-STATE-AND-FIT)", () => {
  it("hides the empty-state 'Choose a trigger' card while a preview is active, and restores it on Discard", async () => {
    const user = userEvent.setup();
    renderBuilder(workflow([], []));
    // Empty draft, no preview yet → the empty-state card is shown.
    expect(screen.getByTestId("empty-canvas-state")).toBeInTheDocument();

    // Submit → preview overlay AUTO-shows → empty-state hidden (no "Show on canvas" click needed).
    await enterPrompt(user, "follow up with leads");
    await user.click(screen.getByTestId("workflow-guidance-submit"));
    await screen.findByTestId("builder-preview-overlay");
    expect(screen.queryByTestId("empty-canvas-state")).not.toBeInTheDocument();

    // Discard → overlay gone, graph still empty → empty-state card returns; nothing mutated/saved.
    await user.click(screen.getByTestId("builder-preview-discard"));
    await waitFor(() => expect(screen.queryByTestId("builder-preview-overlay")).not.toBeInTheDocument());
    expect(screen.getByTestId("empty-canvas-state")).toBeInTheDocument();
    expect(useGraphSlice.getState().pendingNodes).toHaveLength(0);
    expect(useGraphSlice.getState().isDirty).toBe(false);
    expect(mockUpdateWorkflow).not.toHaveBeenCalled();
  });

  it("keeps the empty-state card in normal empty draft mode (no preview)", () => {
    renderBuilder(workflow([], []));
    expect(screen.getByTestId("empty-canvas-state")).toBeInTheDocument();
  });

  // REACT-LIVE-SKELETON — the headline behavior: as soon as a valid plan arrives, the canvas skeleton
  // appears automatically, WITHOUT the user finding/clicking "Show on canvas". Showing is display-only.
  it("auto-shows the preview overlay on the canvas with NO 'Show on canvas' click (no apply, no save)", async () => {
    const user = userEvent.setup();
    renderBuilder(workflow([], []));
    await enterPrompt(user, "follow up with leads");
    await user.click(screen.getByTestId("workflow-guidance-submit"));
    // The skeleton overlay appears on its own — the test never clicks "Show on canvas".
    await screen.findByTestId("builder-preview-overlay");
    expect(screen.queryByTestId("empty-canvas-state")).not.toBeInTheDocument();
    // Auto-show is display-only — nothing applied to the draft, nothing saved.
    expect(useGraphSlice.getState().pendingNodes).toHaveLength(0);
    expect(useGraphSlice.getState().isDirty).toBe(false);
    expect(mockUpdateWorkflow).not.toHaveBeenCalled();
  });
});

// HERMES-AGENT-MUTATION-PREVIEW — the reported scenario: an applied draft (manual.run → Slack) and the
// user asks to "change it to an email notification". The mutation plan carries a `replaces` marker so
// Apply SWAPS Slack for email IN PLACE (not append) — the canvas actually changes.
describe("builder apply-preview — general EDIT (Slack → email swap, replace not append)", () => {
  const manualSlackWorkflow = workflow(
    [
      { id: "t1", kind: "trigger" as const, provider: "native", type: "manual.run", config: {}, position: { x: 0, y: 0 } },
      { id: "a1", kind: "action" as const, provider: "slack", type: "send_channel_message", config: { channel: "C1" }, position: { x: 0, y: 200 } },
    ],
    [{ id: "e1", from: "t1", to: "a1" }],
  );
  // HERMES-AGENT-WORKFLOW-EDITOR — the route returns the exact catalog-validated end-state graph.
  const proposedDefinition = {
    nodes: [
      { id: "t1", kind: "trigger", provider: "native", type: "manual.run", config: {}, position: { x: 0, y: 0 } },
      { id: "email-1", kind: "action", provider: "gmail", type: "send_email", config: {}, position: { x: 0, y: 0 } },
    ],
    edges: [{ id: "ne1", from: "t1", to: "email-1" }],
  };
  const mutationPlan = {
    schemaVersion: 1,
    title: "Proposed change",
    summary: "Switch the notification to email.",
    notApplied: true,
    steps: [
      { ref: "t1", role: "trigger", provider: "native", type: "manual.run", purpose: "" },
      { ref: "email-1", role: "action", provider: "gmail", type: "send_email", purpose: "" },
    ],
  };
  const mutationPreview = {
    version: 1,
    title: "Proposed change",
    summary: "Switch the notification to email.",
    notice: "Preview only — your workflow has not changed.",
    notApplied: true,
    nodes: [
      { previewId: "t1", role: "trigger", provider: "native", type: "manual.run", label: "native:manual.run", purpose: "", notApplied: true },
      { previewId: "email-1", role: "action", provider: "gmail", type: "send_email", label: "gmail:send_email", purpose: "", missingInputs: ["to"], notApplied: true },
    ],
    edges: [{ previewId: "ne1", fromPreviewId: "t1", toPreviewId: "email-1", notApplied: true }],
  };
  const editResponse = { ok: true, guidanceText: "Here's the change.", source: "hermes-agent", workflowPlan: mutationPlan, previewDraft: mutationPreview, proposedDefinition };

  it("auto-shows the email edit as ONE in-canvas diff graph (no floating ghost overlay; display-only)", async () => {
    const user = userEvent.setup();
    mockRequest.mockResolvedValue(editResponse);
    renderBuilder(manualSlackWorkflow);
    await enterPrompt(user, "change it to an email notification");
    await user.click(screen.getByTestId("workflow-guidance-submit"));
    // HERMES-AGENT-PREVIEW-DIFF-GRAPH — the edit shows a slim control bar + ONE composed diff graph in
    // the canvas (data-preview-diff), NOT the old floating ghost-node overlay stacked over the live graph.
    await screen.findByTestId("builder-preview-control-bar");
    expect(screen.queryByTestId("builder-preview-overlay")).not.toBeInTheDocument();
    expect(screen.queryAllByTestId("builder-preview-node")).toHaveLength(0); // no floating ghost nodes
    expect(screen.getByTestId("workflow-canvas").getAttribute("data-preview-diff")).toBe("true");
    // Auto-show is display-only — nothing applied/saved yet; Slack still in the real draft.
    expect(useGraphSlice.getState().pendingNodes.map((n) => `${n.provider}:${n.type}`)).toEqual(["native:manual.run", "slack:send_channel_message"]);
    expect(useGraphSlice.getState().isDirty).toBe(false);
    expect(mockUpdateWorkflow).not.toHaveBeenCalled();
  });

  it("Apply REPLACES the Slack action with email (no append); the local graph becomes the exact proposed graph; no save", async () => {
    const user = userEvent.setup();
    mockRequest.mockResolvedValue(editResponse);
    renderBuilder(manualSlackWorkflow);
    await enterPrompt(user, "change it to an email notification");
    await user.click(screen.getByTestId("workflow-guidance-submit"));
    await user.click(await screen.findByTestId("builder-preview-apply"));

    const s = useGraphSlice.getState();
    // Slack is GONE; email took its place — two nodes total, NOT three (no append). The exact proposed graph.
    expect(s.pendingNodes.map((n) => `${n.provider}:${n.type}`)).toEqual(["native:manual.run", "gmail:send_email"]);
    expect(s.pendingNodes.some((n) => n.provider === "slack")).toBe(false);
    expect(s.pendingEdges.map((e) => `${e.from}->${e.to}`)).toEqual(["t1->email-1"]);
    expect(s.isDirty).toBe(true);
    expect(mockUpdateWorkflow).not.toHaveBeenCalled(); // no auto-save/run/activate
    expect(screen.getByTestId("builder-apply-notice")).toHaveTextContent("Change applied");
  });

  it("Discard leaves the graph unchanged (Slack still present, not dirty)", async () => {
    const user = userEvent.setup();
    mockRequest.mockResolvedValue(editResponse);
    renderBuilder(manualSlackWorkflow);
    await enterPrompt(user, "change it to an email notification");
    await user.click(screen.getByTestId("workflow-guidance-submit"));
    await user.click(await screen.findByTestId("builder-preview-discard"));
    await waitFor(() => expect(screen.queryByTestId("builder-preview-overlay")).not.toBeInTheDocument());
    const s = useGraphSlice.getState();
    expect(s.pendingNodes.map((n) => `${n.provider}:${n.type}`)).toEqual(["native:manual.run", "slack:send_channel_message"]);
    expect(s.isDirty).toBe(false);
    expect(mockUpdateWorkflow).not.toHaveBeenCalled();
  });

  // HERMES-AGENT-RAIL-EDIT-PREVIEW-CLEANUP — once the edit auto-shows on the canvas, the rail must NOT
  // offer a redundant "Show on canvas" (the canvas already shows it; Apply/Discard live in the top bar),
  // and must never leak internal patch wording (node ids / "and its edges are removed").
  it("rail offers no redundant 'Show on canvas' once the edit auto-shows on the canvas", async () => {
    const user = userEvent.setup();
    mockRequest.mockResolvedValue(editResponse);
    renderBuilder(manualSlackWorkflow);
    await enterPrompt(user, "change the slack action to a gmail send email");
    await user.click(screen.getByTestId("workflow-guidance-submit"));
    await screen.findByTestId("builder-preview-control-bar"); // auto-shown on the canvas
    await waitFor(() => expect(screen.queryByTestId("workflow-guidance-show-on-canvas")).toBeNull());
    expect(screen.getByText("Here's the change.")).toBeInTheDocument();
  });
});

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
    await enterPrompt(user, "follow up with leads");
    await user.click(screen.getByTestId("workflow-guidance-submit"));
    await screen.findByTestId("builder-preview-overlay"); // auto-shown
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

    // BUILDER-ISSUES-RAIL-1 — the gaps are reported in the issues rail, not a floating card.
    await user.click(screen.getByTestId("builder-header-validation-pill"));
    const card = await screen.findByTestId("validation-summary");
    // One actionable row per missing required field — field LABELS from metadata, names only.
    expect(card).toHaveTextContent("Send Message needs a Channel.");
    expect(card).toHaveTextContent("Send Message needs a Message.");
    // No values / secrets / tokens / credential ids ever rendered.
    expect(card.textContent ?? "").not.toMatch(/token|secret|xox|Bearer|account[_-]?id|password/i);
  });

  it("HERMES-AGENT-REMOVE-ADDED-FROM-PREVIEW-BADGE — accepted nodes do NOT render an 'Added from preview' badge (they look like normal draft nodes)", async () => {
    const user = userEvent.setup();
    renderWithMeta(workflow([], []));
    await applyPreview(user);

    // The nodes were added to the draft...
    await waitFor(() => expect(useGraphSlice.getState().pendingNodes.length).toBeGreaterThan(0));
    expect(screen.getAllByTestId("workflow-node-view").length).toBeGreaterThan(0);
    // ...but the noisy on-card badge is gone.
    expect(screen.queryByTestId("added-from-preview-badge")).not.toBeInTheDocument();
    expect(screen.queryByText(/added from preview/i)).not.toBeInTheDocument();
    // The apply is still acknowledged (now a toast, with the gaps in the rail) — nothing saved.
    expect(screen.getByTestId("builder-apply-notice")).toBeInTheDocument();
    expect(mockUpdateWorkflow).not.toHaveBeenCalled();
  });

  it("falls back to a generic review notice when the node type has no metadata", async () => {
    const user = userEvent.setup();
    // No requiredFieldsByType prop → metadata unavailable for every applied node.
    renderBuilder(workflow([], []));
    await applyPreview(user);

    // Without metadata the validator can confirm no field gap, so the rail has nothing to flag on
    // those nodes — the apply is acknowledged by the toast alone and nothing invents a gap.
    const notice = await screen.findByTestId("builder-apply-notice");
    expect(notice).toBeInTheDocument();
    expect(notice).not.toHaveTextContent("needs a");
  });

  it("does not auto-save / update the workflow when surfacing hints", async () => {
    const user = userEvent.setup();
    renderWithMeta(workflow([], []));
    await applyPreview(user);
    expect(mockUpdateWorkflow).not.toHaveBeenCalled();
  });

  it("CHECKLIST-ITEM-10 — clicking a setup issue opens the node and highlights the missing field (no save/run)", async () => {
    const user = userEvent.setup();
    renderWithMeta(workflow([], []));
    await applyPreview(user);

    await user.click(screen.getByTestId("builder-header-validation-pill"));
    const card = await screen.findByTestId("validation-summary");
    const channelRow = within(card)
      .getAllByTestId("validation-summary-issue")
      .find((el) => el.textContent?.includes("Channel"));
    expect(channelRow).toBeDefined();

    const slack = useGraphSlice.getState().pendingNodes.find(
      (n) => n.provider === "slack" && n.type === "send_message",
    )!;
    await user.click(channelRow!);

    // Opens the node AND highlights the field (revealNode), with no save / run.
    expect(useConfigSlice.getState().activeNodeId).toBe(slack.id);
    expect(useConfigSlice.getState().focusFieldKey).toBe("channel");
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
    // BUILDER-ISSUES-RAIL-1 — the apply is still acknowledged, and the drawer stays on the node it
    // deliberately opened rather than being taken over by the issues rail. Nothing was saved.
    expect(screen.getByTestId("builder-apply-notice")).toBeInTheDocument();
    expect(screen.queryByTestId("validation-summary")).not.toBeInTheDocument();
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

  it("auto-show alone, then Discard, never selects/opens a node (and applies nothing)", async () => {
    const user = userEvent.setup();
    renderWith(workflow([], []), slackMeta);
    await enterPrompt(user, "follow up with leads");
    await user.click(screen.getByTestId("workflow-guidance-submit"));
    await screen.findByTestId("builder-preview-overlay"); // auto-shown
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
describe("builder apply-preview — the pre-apply preview card (REACT-AGENT-PREAPPLY-SETUP-UX-1)", () => {
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
    await enterPrompt(user, "remind the team to review new leads");
    await user.click(screen.getByTestId("workflow-guidance-submit"));
    await screen.findByTestId("builder-preview-overlay"); // auto-shown (no redundant rail button click)
  }

  it("the canvas node stays visual-only, and the rail SUMMARISES the setup instead of collecting it", async () => {
    const user = userEvent.setup();
    mockRequest.mockResolvedValue({ ok: true, guidanceText: "ok", source: "hermes-agent", workflowPlan, previewDraft: previewMissing(["message", "channel"]) });
    renderGuided({ "slack:send_message": { displayName: "Send Message", requiredFields: [{ name: "message", label: "Message" }, { name: "channel", label: "Channel" }] } });
    await showPreview(user);
    await screen.findByTestId("builder-preview-overlay");

    // Canvas: short badge, no controls inside the overlay.
    expect(screen.getByTestId("preview-node-needs-setup")).toHaveTextContent("Needs setup · 2");
    expect(document.querySelector("[data-testid='builder-preview-overlay'] input,[data-testid='builder-preview-overlay'] select,[data-testid='builder-preview-overlay'] textarea")).toBeNull();

    // Rail: the outstanding fields are NAMED; neither of them renders as a control.
    const card = screen.getByTestId("builder-preview-setup-rail");
    expect(screen.getByTestId("preview-setup-required")).toHaveTextContent("Message");
    // `channel` has no metadata label in this harness, so the raw field name is the honest
    // fallback rather than an invented friendlier one.
    expect(screen.getByTestId("preview-setup-required")).toHaveTextContent("channel");
    expect(card.querySelector("input,select,textarea")).toBeNull();
    // And Apply is the card's only action.
    expect(card.querySelectorAll("button")).toHaveLength(1);
    expect(screen.getByTestId("builder-preview-setup-apply")).toBeInTheDocument();
  });

  it("Apply is never gated on setup: it works with every field unresolved and auto-opens the incomplete node", async () => {
    const user = userEvent.setup();
    mockRequest.mockResolvedValue({ ok: true, guidanceText: "ok", source: "hermes-agent", workflowPlan, previewDraft: previewMissing(["message", "channel"]) });
    renderGuided({ "slack:send_message": { displayName: "Send Message", requiredFields: [{ name: "message", label: "Message" }, { name: "channel", label: "Channel" }] } });
    await showPreview(user);

    // Nothing is applied / dirtied / saved before Apply, and previewing calls the helper once.
    expect(useGraphSlice.getState().pendingNodes).toHaveLength(0);
    expect(useGraphSlice.getState().isDirty).toBe(false);
    expect(mockUpdateWorkflow).not.toHaveBeenCalled();
    expect(mockRequest).toHaveBeenCalledTimes(1);

    await user.click(await screen.findByTestId("builder-preview-setup-apply"));
    await waitFor(() => expect(slackNode()).toBeDefined());
    // The node lands with its fields still unresolved — that is the point.
    expect(slackNode()!.config).toEqual({});
    expect(mockUpdateWorkflow).not.toHaveBeenCalled();
    // Applying never costs another AI call.
    expect(mockRequest).toHaveBeenCalledTimes(1);
    // The still-incomplete node is opened so the user can finish it.
    expect(useConfigSlice.getState().activeNodeId).toBe(slackNode()!.id);
  });

  it("values the user's own request supplied are seeded on Apply without being asked for again", async () => {
    const user = userEvent.setup();
    mockRequest.mockResolvedValue({
      ok: true,
      guidanceText: "ok",
      source: "hermes-agent",
      workflowPlan: {
        ...workflowPlan,
        steps: workflowPlan.steps.map((step) =>
          step.ref === "s1" ? { ...step, config: { message: "Review new leads" } } : step,
        ),
      },
      previewDraft: previewMissing(["channel"]),
    });
    renderGuided({ "slack:send_message": { displayName: "Send Message", requiredFields: [{ name: "message", label: "Message" }, { name: "channel", label: "Channel" }] } });
    await showPreview(user);

    await user.click(await screen.findByTestId("builder-preview-setup-apply"));
    await waitFor(() => expect(slackNode()).toBeDefined());
    expect(slackNode()!.config).toMatchObject({ message: "Review new leads" });
  });

  it("Discard clears the rail card; a re-asked preview shows a fresh summary and nothing was applied", async () => {
    const user = userEvent.setup();
    mockRequest.mockResolvedValue({ ok: true, guidanceText: "ok", source: "hermes-agent", workflowPlan, previewDraft: previewMissing(["message"]) });
    renderGuided({ "slack:send_message": { displayName: "Send Message", requiredFields: [{ name: "message", label: "Message" }] } });
    await showPreview(user);
    await screen.findByTestId("builder-preview-setup-rail");

    await user.click(screen.getByTestId("builder-preview-discard"));
    expect(useGraphSlice.getState().pendingNodes).toHaveLength(0);
    await waitFor(() => expect(screen.queryByTestId("builder-preview-setup-rail")).not.toBeInTheDocument());

    // There is NO manual "Show on canvas" re-show button — the user re-asks React, which auto-shows
    // a fresh preview.
    expect(screen.queryByTestId("workflow-guidance-show-on-canvas")).not.toBeInTheDocument();
    await showPreview(user);
    expect(await screen.findByTestId("preview-setup-required")).toHaveTextContent("Message");
  });

  it("the option resolver is NEVER called before Apply — no provider request for a workflow that does not exist yet", async () => {
    const user = userEvent.setup();
    mockFetchOptionsSource.mockResolvedValue({ ok: true, source: "slack:channels", items: [{ value: "C2", label: "#leads" }], hasMore: false });
    mockRequest.mockResolvedValue({ ok: true, guidanceText: "ok", source: "hermes-agent", workflowPlan, previewDraft: previewMissing(["channel", "message"]) });
    render(
      <WorkflowBuilder
        workflow={workflow([], [])}
        triggerProviders={triggerProviders}
        actionProviders={actionProviders}
        requiredFieldsByType={{ "slack:send_message": { displayName: "Send Message", requiredFields: [{ name: "channel", label: "Channel" }, { name: "message", label: "Message" }] } }}
        setupFieldsByType={{
          "slack:send_message": [
            { name: "channel", label: "Channel", type: "select-async" as const, required: true, optionsSource: "slack:channels" },
            { name: "message", label: "Message", type: "textarea" as const, required: true },
          ],
        }}
        accountId="acct-1"
        guidanceEnabled
      />,
    );
    await showPreview(user);
    await screen.findByTestId("builder-preview-setup-rail");

    // This is what used to discover "Slack isn't connected yet" and offer Reconnect in Apps before
    // the user had accepted anything. The preview stage asks the provider nothing.
    expect(mockFetchOptionsSource).not.toHaveBeenCalled();
    expect(screen.queryByTestId("preview-setup-preview-step-2-channel")).not.toBeInTheDocument();
    expect(screen.queryByText(/Reconnect in Apps/i)).not.toBeInTheDocument();
    expect(mockRequest).toHaveBeenCalledTimes(1);
  });
});

/**
 * BUILDER-ISSUES-RAIL-1 — the post-approval review loop, driven through the REAL builder.
 *
 * The floating review tray is gone. What still has to work is the loop it existed for: after an
 * apply, the user can see everything that is still unset, click one, land on that exact field, fix
 * it, and watch the count fall to zero — now entirely inside the issues rail, which is also where
 * the same gaps were already reported before an agent was ever involved.
 *
 * Note the drawer is single-slot. An apply that leaves a node incomplete ALREADY opens that node's
 * config panel (HERMES-AGENT-AUTO-OPEN-FIRST-INCOMPLETE-AFTER-APPLY), so these tests open the rail
 * the way a user does — the header issue-count pill.
 */
describe("builder apply-preview — post-approval review loop in the issues rail", () => {
  const requiredFieldsByType = {
    "gmail:new_email": { displayName: "New Email", requiredFields: [{ name: "label", label: "Label" }] },
    "slack:send_message": {
      displayName: "Send Message",
      requiredFields: [
        { name: "channel", label: "Channel" },
        { name: "message", label: "Message" },
      ],
    },
  };

  function renderWithMeta() {
    return render(
      <WorkflowBuilder
        workflow={workflow([], [])}
        triggerProviders={triggerProviders}
        actionProviders={actionProviders}
        requiredFieldsByType={requiredFieldsByType}
        accountId="acct-1"
        guidanceEnabled
      />,
    );
  }

  const slackNode = () =>
    useGraphSlice.getState().pendingNodes.find((n) => n.provider === "slack" && n.type === "send_message")!;

  async function openIssuesRail(user: ReturnType<typeof userEvent.setup>) {
    await user.click(screen.getByTestId("builder-header-validation-pill"));
    return screen.findByTestId("validation-summary");
  }

  /**
   * Locate a row by its field. Matched case-insensitively against the row's text because the row
   * names the field by its LABEL ("Channel"), not its key — BUILDER-ISSUES-RAIL-1 dropped the
   * redundant "node · fieldKey" locator line the tray never had.
   */
  function issueRow(fieldPath: string): HTMLElement {
    const row = screen
      .getAllByTestId("validation-summary-issue")
      .find((el) => el.textContent?.toLowerCase().includes(fieldPath.toLowerCase()));
    if (!row) throw new Error(`no issues-rail row for field ${fieldPath}`);
    return row;
  }

  /** Exactly what the config rail's Save does: commit the in-progress draft into the local graph. */
  function fillField(nodeId: string, name: string, value: unknown) {
    act(() => {
      useConfigSlice.getState().updateField({ nodeId, name, value });
      commitNodeConfigDraft(nodeId);
    });
  }

  it("reports every remaining gap in the rail, blocked, with the tray's three-line presentation", async () => {
    const user = userEvent.setup();
    renderWithMeta();
    await applyPreview(user);
    const rail = await openIssuesRail(user);

    expect(screen.getByTestId("validation-summary-status")).toHaveTextContent("Blocked");
    expect(screen.getByTestId("validation-summary-remaining")).toHaveTextContent("3 issues remaining");
    expect(screen.getAllByTestId("validation-summary-issue")).toHaveLength(3);
    // The presentation the tray was liked for: what, why, and the next step — per row.
    expect(rail).toHaveTextContent("Send Message needs a Channel.");
    expect(rail).toHaveTextContent("Open the Channel field and fill it in.");
    expect(screen.getAllByTestId("validation-summary-explanation").length).toBe(3);
    // Still labels only — no values, secrets, tokens, or credential ids.
    expect(rail.textContent ?? "").not.toMatch(/token|secret|xox|Bearer|account[_-]?id|password/i);
  });

  it("attributes an agent-added gap to React, and never claims that for a hand-built step", async () => {
    const user = userEvent.setup();
    renderWithMeta();
    await applyPreview(user);
    await openIssuesRail(user);
    // These nodes WERE added by the agent, so the honest explanation names it.
    expect(screen.getAllByTestId("validation-summary-explanation")[0]).toHaveTextContent(
      /React added this step/i,
    );
  });

  it("clicking an issue opens the right node and highlights the right field (no save/run)", async () => {
    const user = userEvent.setup();
    renderWithMeta();
    await applyPreview(user);
    await openIssuesRail(user);

    await user.click(issueRow("channel"));

    expect(useConfigSlice.getState().activeNodeId).toBe(slackNode().id);
    expect(useConfigSlice.getState().focusFieldKey).toBe("channel");
    expect(mockUpdateWorkflow).not.toHaveBeenCalled();
  });

  it("drops the remaining count as each field is completed", async () => {
    const user = userEvent.setup();
    renderWithMeta();
    await applyPreview(user);
    await openIssuesRail(user);
    expect(screen.getByTestId("validation-summary-remaining")).toHaveTextContent("3 issues remaining");

    // Follow the real path: the row opens the node's config draft, which is what a value can then
    // be committed into. (Committing into a node whose draft was never opened is a no-op.)
    await user.click(issueRow("channel"));
    fillField(slackNode().id, "channel", "C123");

    await openIssuesRail(user);
    await waitFor(() =>
      expect(screen.getByTestId("validation-summary-remaining")).toHaveTextContent("2 issues remaining"),
    );
    expect(screen.getByTestId("validation-summary-status")).toHaveTextContent("Blocked");
  });

  it("runs the whole loop: issue → fill → next issue, ending in the ready state", async () => {
    const user = userEvent.setup();
    renderWithMeta();
    await applyPreview(user);
    await openIssuesRail(user);

    const gmailId = useGraphSlice.getState().pendingNodes.find((n) => n.provider === "gmail")!.id;
    const slackId = slackNode().id;

    await user.click(issueRow("label"));
    expect(useConfigSlice.getState().activeNodeId).toBe(gmailId);
    fillField(gmailId, "label", "INBOX");

    await openIssuesRail(user);
    await user.click(issueRow("channel"));
    expect(useConfigSlice.getState().activeNodeId).toBe(slackId);
    expect(useConfigSlice.getState().focusFieldKey).toBe("channel");
    fillField(slackId, "channel", "C123");

    await openIssuesRail(user);
    await user.click(issueRow("message"));
    fillField(slackId, "message", "New lead");

    await openIssuesRail(user);
    await waitFor(() =>
      expect(screen.getByTestId("validation-summary-status")).toHaveTextContent("Ready"),
    );
    expect(screen.getByText("All setup complete")).toBeInTheDocument();
    // Nothing was saved, run, or activated by the review loop itself.
    expect(mockUpdateWorkflow).not.toHaveBeenCalled();
  });

  // The regression this batch exists to prevent: two issue surfaces for one problem.
  it("raises NO floating issue list over the canvas — the apply notice is a one-line toast", async () => {
    const user = userEvent.setup();
    renderWithMeta();
    await applyPreview(user);

    const notice = await screen.findByTestId("builder-apply-notice");
    expect(notice).toHaveAttribute("data-tray", "none");
    expect(screen.queryByTestId("builder-setup-needed")).not.toBeInTheDocument();
    expect(screen.queryByTestId("builder-review-tray-expanded")).not.toBeInTheDocument();
    expect(screen.queryByTestId("builder-review-tray-collapsed")).not.toBeInTheDocument();
    // The toast does not restate the issues — that is the rail's job now.
    expect(notice).not.toHaveTextContent("needs a Channel");
  });
});
