/**
 * REACT-AGENT-GUIDED-BUILD-1 — the guided Create → Connect → Configure → Test →
 * Activate journey, driven through the REAL WorkflowBuilder + graph slices +
 * readiness hooks. Mocked at the external boundaries only: the guidance
 * helper, the connection-readiness client, the OAuth connect client + popup
 * window, the options resolver client, and the workflow run/activate clients.
 *
 * Covers the required journeys:
 *   1. Stripe → Slack: apply → BOTH connect cards → popup OAuth completes each
 *      (origin+nonce-validated postMessage) → Slack config appears → values
 *      save to the draft → ready to activate → activate from the rail.
 *      (A Stripe trigger is not in-builder testable, so readiness — by
 *      design — routes straight to Activate after configure.)
 *   2. One app already connected → only the missing app asks to connect.
 *   3. All apps connected → skips Connect, goes straight to Configure.
 *   4. No configuration required (manual trigger) → straight to Test; test
 *      passes → Activate.
 *   5. OAuth canceled (popup closed) → stays in Connect with Try again.
 *   6. Apply → SAVE → reload → the guided card resumes at the SAME stage and the
 *      conversation comes back (revision-bound hint + stage re-derived from
 *      readiness). REACT-AGENT-CONVERSATION-PERSISTENCE-1 also pins the two
 *      failure cases that motivated it: applied-but-UNSAVED work returns to an
 *      empty canvas with the transcript intact and NO setup card, and a legacy
 *      durable localStorage marker is cleared rather than resumed.
 *  10. Billing: the ENTIRE deterministic journey calls the guidance helper
 *      exactly once (the initial create) — no AI charge for connect /
 *      configure / test / activate steps.
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
const mockRunNow = jest.fn();
const mockGetRun = jest.fn();
const mockActivate = jest.fn();
jest.mock("@/lib/api/workflows", () => {
  const actual = jest.requireActual("@/lib/api/workflows");
  return {
    ...actual,
    updateWorkflow: (...a: unknown[]) => mockUpdateWorkflow(...a),
    runNowWorkflow: (...a: unknown[]) => mockRunNow(...a),
    getWorkflowRun: (...a: unknown[]) => mockGetRun(...a),
    activateWorkflow: (...a: unknown[]) => mockActivate(...a),
  };
});

const mockRequest = jest.fn();
jest.mock("@/lib/api/ai/guidance", () => ({
  requestWorkflowGuidance: (...a: unknown[]) => mockRequest(...a),
}));

// REACT-AGENT-CONVERSATION-PERSISTENCE-1 — the durable transcript, stubbed at
// the typed-client boundary so the journeys exercise the REAL restore/append
// wiring without a database.
const agentThreadRows: Array<Record<string, unknown>> = [];
const mockGetAgentThread = jest.fn();
const mockAppendAgentMessage = jest.fn();
jest.mock("@/lib/api/builderAgentThread", () => ({
  getBuilderAgentThread: (...a: unknown[]) => mockGetAgentThread(...a),
  appendBuilderAgentMessage: (...a: unknown[]) => mockAppendAgentMessage(...a),
  clearBuilderAgentThread: jest.fn(async () => ({ deletedCount: 0 })),
}));

// The change-history timeline (the canonical proposal lifecycle record).
const recordedAgentChanges: Array<Record<string, unknown>> = [];
jest.mock("@/lib/api/agentChangeHistory", () => ({
  listAgentChangeHistory: jest.fn(async () => []),
  recordAgentChange: jest.fn(async (_wf: string, input: Record<string, unknown>) => {
    recordedAgentChanges.push(input);
    return { id: `row-${recordedAgentChanges.length}`, ...input };
  }),
}));

const mockFetchOptionsSource = jest.fn();
jest.mock("@/lib/api/options", () => ({
  __esModule: true,
  fetchOptionsSource: (...a: unknown[]) => mockFetchOptionsSource(...a),
}));

// Connection truth is server-resolved; the client hook calls this typed helper.
const mockGetConnectionReadiness = jest.fn();
jest.mock("@/lib/api/workflowConnectionReadiness", () => ({
  getWorkflowConnectionReadiness: (...a: unknown[]) => mockGetConnectionReadiness(...a),
}));

const mockStartOAuth = jest.fn();
jest.mock("@/lib/api/integrations", () => {
  const actual = jest.requireActual("@/lib/api/integrations");
  return { ...actual, startOAuth: (...a: unknown[]) => mockStartOAuth(...a) };
});

import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { buildOAuthPopupMessage } from "@/core/integrations/oauthPopupBridge";
import { WorkflowBuilder } from "@/features/workflow-builder/WorkflowBuilder";
import { useGraphSlice } from "@/features/workflow-builder/state/graphSlice";
import { useConfigSlice } from "@/features/workflow-builder/state/configSlice";
import { useRunSlice } from "@/features/workflow-builder/state/runSlice";
import type { WorkflowDetail } from "@/contracts/workflow";

const triggerProviders = [{ id: "stripe", displayName: "Stripe" }];
const actionProviders = [{ id: "slack", displayName: "Slack" }];

// ── Fixtures ────────────────────────────────────────────────────────────────

const stripeSlackPlan = {
  schemaVersion: 1,
  title: "Payment alert",
  summary: "When a Stripe payment succeeds, post to Slack.",
  notApplied: true,
  steps: [
    { ref: "s0", role: "trigger", provider: "stripe", type: "payment_succeeded", purpose: "watch" },
    { ref: "s1", role: "action", provider: "slack", type: "send_channel_message", purpose: "notify" },
  ],
};
const stripeSlackPreview = {
  version: 1,
  title: "Payment alert",
  summary: "When a Stripe payment succeeds, post to Slack.",
  notice: "Preview only — your workflow has not changed.",
  notApplied: true,
  nodes: [
    { previewId: "p1", role: "trigger", provider: "stripe", type: "payment_succeeded", label: "stripe:payment_succeeded", purpose: "watch", notApplied: true },
    { previewId: "p2", role: "action", provider: "slack", type: "send_channel_message", label: "slack:send_channel_message", purpose: "notify", missingInputs: ["channel", "text"], notApplied: true },
  ],
  edges: [{ previewId: "pe1", fromPreviewId: "p1", toPreviewId: "p2", notApplied: true }],
};

const manualSlackPlan = {
  ...stripeSlackPlan,
  steps: [
    { ref: "s0", role: "trigger", provider: "native", type: "manual.run", purpose: "start" },
    { ref: "s1", role: "action", provider: "slack", type: "send_channel_message", purpose: "notify" },
  ],
};
const manualSlackPreview = {
  ...stripeSlackPreview,
  nodes: [
    { previewId: "p1", role: "trigger", provider: "native", type: "manual.run", label: "native:manual.run", purpose: "start", notApplied: true },
    { previewId: "p2", role: "action", provider: "slack", type: "send_channel_message", label: "slack:send_channel_message", purpose: "notify", notApplied: true },
  ],
};

const REQUIRED_FIELDS = {
  "slack:send_channel_message": {
    displayName: "Send Channel Message",
    requiredFields: [
      { name: "channel", label: "Channel" },
      { name: "text", label: "Message" },
    ],
  },
} as const;

const SETUP_FIELDS = {
  "slack:send_channel_message": [
    { name: "channel", label: "Channel", type: "select-async" as const, required: true, optionsSource: "slack:channels" },
    { name: "text", label: "Message", type: "textarea" as const, required: true },
  ],
};

function workflow(): WorkflowDetail {
  return {
    id: "wf-guided", name: "Guided", state: "draft", disabledReason: null, disabledContext: null,
    activeRevisionId: null, draftDefinition: { nodes: [], edges: [] }, deletedAt: null,
    createdAt: "2026-07-28T00:00:00Z", updatedAt: "2026-07-28T00:00:00Z",
  };
}

// Server-truth stand-in: which providers count as connected right now. The
// readiness mock derives its DTO from this set on EVERY call, exactly like the
// real brain re-resolving integration rows.
let connectedProviders: Set<string>;

function connectionEntry(provider: string, name: string, nodeIds: string[]) {
  const ready = connectedProviders.has(provider);
  return {
    provider,
    name,
    credentialClass: "account",
    nodeIds,
    nodeCount: nodeIds.length,
    status: ready ? "CONNECTED" : "DISCONNECTED",
    ready,
    providerEnabled: true,
    refreshable: true,
    tokenExpired: false,
    scopesSatisfied: true,
    missingScopeCount: 0,
    reconnectNeeded: false,
    canReconnect: true,
  };
}

function installConnectionReadiness(): void {
  mockGetConnectionReadiness.mockImplementation(
    async (_workflowId: string, definition: { nodes: Array<{ id: string; provider?: string }> }) => {
      const byProvider = new Map<string, string[]>();
      for (const n of definition.nodes) {
        if (!n.provider || n.provider === "native") continue;
        byProvider.set(n.provider, [...(byProvider.get(n.provider) ?? []), n.id]);
      }
      const providers = [...byProvider.entries()].map(([p, ids]) =>
        connectionEntry(p, p === "slack" ? "Slack" : "Stripe", ids),
      );
      return {
        workflowId: "wf-guided",
        access: "OK",
        allRequiredConnected: providers.every((p) => p.ready),
        providers,
      };
    },
  );
}

// Popup stand-in the connect hook opens.
interface FakePopup { closed: boolean; close: jest.Mock }
let openedPopups: FakePopup[];
let openSpy: jest.SpyInstance;

function lastOAuthNonce(): string {
  const call = mockStartOAuth.mock.calls.at(-1)! as unknown[];
  return (call[1] as { returnContext: { nonce: string } }).returnContext.nonce;
}

/** Simulate the popup completing OAuth: server-truth flips, bridge message posts. */
function completeOAuth(provider: string): void {
  connectedProviders.add(provider);
  const msg = buildOAuthPopupMessage({ provider, status: "connected", nonce: lastOAuthNonce() });
  fireEvent(window, new MessageEvent("message", { data: msg, origin: window.location.origin }));
}

beforeEach(() => {
  jest.clearAllMocks();
  window.localStorage.clear();
  connectedProviders = new Set();
  installConnectionReadiness();
  openedPopups = [];
  openSpy = jest.spyOn(window, "open").mockImplementation(() => {
    const popup: FakePopup = { closed: false, close: jest.fn() };
    popup.close.mockImplementation(() => { popup.closed = true; });
    openedPopups.push(popup);
    return popup as unknown as Window;
  });
  mockStartOAuth.mockResolvedValue({ redirectUrl: "https://provider.example/authorize?x=1" });
  mockUpdateWorkflow.mockImplementation(async () => ({
    ...workflow(),
    draftDefinition: {
      nodes: [...useGraphSlice.getState().pendingNodes],
      edges: [...useGraphSlice.getState().pendingEdges],
    },
    updatedAt: new Date().toISOString(),
  }));
  mockRunNow.mockResolvedValue({ runId: "run-1", enqueuedAt: "now", isTest: true, triggeredBy: "test" });
  mockActivate.mockResolvedValue({ id: "wf-guided", state: "active" });
  mockFetchOptionsSource.mockResolvedValue({
    ok: true, source: "slack:channels", items: [{ value: "C2", label: "#leads" }], hasMore: false,
  });
  mockRequest.mockResolvedValue({
    ok: true, guidanceText: "Here's the workflow.", source: "hermes-agent",
    workflowPlan: stripeSlackPlan, previewDraft: stripeSlackPreview,
  });
  useGraphSlice.getState().reset();
  useConfigSlice.getState().reset();
  useRunSlice.getState().reset();
  agentThreadRows.length = 0;
  recordedAgentChanges.length = 0;
  // A real thread: every append is stored and every load replays what was stored.
  mockGetAgentThread.mockImplementation(async () => ({
    thread: null,
    messages: agentThreadRows.map((r, i) => ({
      id: `msg-${i}`,
      safePayload: {},
      requestId: null,
      agentChangeId: null,
      baseGraphVersion: null,
      proposal: null,
      createdAt: "2026-07-29T00:00:00Z",
      ...r,
    })),
  }));
  mockAppendAgentMessage.mockImplementation(async (_wf: string, body: Record<string, unknown>) => {
    if (!agentThreadRows.some((r) => r.clientMessageId === body.clientMessageId)) {
      agentThreadRows.push(body);
    }
    return { id: `msg-${agentThreadRows.length}`, ...body };
  });
});

afterEach(() => {
  openSpy.mockRestore();
});

function renderBuilder() {
  return render(
    <WorkflowBuilder
      workflow={workflow()}
      triggerProviders={triggerProviders}
      actionProviders={actionProviders}
      requiredFieldsByType={REQUIRED_FIELDS}
      setupFieldsByType={SETUP_FIELDS}
      accountId="acct-1"
      guidanceEnabled
    />,
  );
}

async function createAndApply(user: ReturnType<typeof userEvent.setup>) {
  await user.type(screen.getByPlaceholderText(/Example:/i), "post Stripe payments to Slack");
  await user.click(screen.getByTestId("workflow-guidance-submit"));
  await user.click(await screen.findByTestId("builder-preview-apply"));
}

function slackNodeId(): string {
  const node = useGraphSlice.getState().pendingNodes.find((n) => n.provider === "slack");
  expect(node).toBeDefined();
  return node!.id;
}

// ── The journeys ────────────────────────────────────────────────────────────

it("journey 1+10 — Stripe → Slack: connect both in popups, configure Slack, activate from the rail; ONE guidance call total", async () => {
  const user = userEvent.setup();
  renderBuilder();
  await createAndApply(user);

  // Connect stage: BOTH apps appear as connection cards inside the rail.
  const card = await screen.findByTestId("guided-build-card");
  expect(card).toHaveAttribute("data-stage", "connecting");
  await screen.findByTestId("guided-connect-stripe");
  await screen.findByTestId("guided-connect-slack");
  expect(screen.getByText(/0 of 2 connected/)).toBeInTheDocument();

  // Stripe OAuth in a popup → completion message → card flips from server truth.
  await user.click(screen.getByTestId("guided-connect-stripe-button"));
  await waitFor(() => expect(openedPopups).toHaveLength(1));
  act(() => completeOAuth("stripe"));
  await screen.findByTestId("guided-connect-stripe-connected");
  expect(screen.getByTestId("guided-build-card")).toHaveAttribute("data-stage", "connecting");

  // Slack next. Both connected → Configure begins automatically.
  await user.click(screen.getByTestId("guided-connect-slack-button"));
  await waitFor(() => expect(openedPopups).toHaveLength(2));
  act(() => completeOAuth("slack"));
  await waitFor(() =>
    expect(screen.getByTestId("guided-build-card")).toHaveAttribute("data-stage", "configuring"),
  );

  // Configure stage: the Slack node's channel picker (real resolver client) +
  // message field render in the rail; values save into the DRAFT node.
  const nodeId = slackNodeId();
  expect(screen.getByTestId("guided-configure-progress")).toHaveTextContent(/set up/i);
  const channel = await screen.findByTestId(`node-setup-${nodeId}-channel`);
  await waitFor(() => expect(channel.querySelectorAll("option").length).toBe(2));
  fireEvent.change(channel, { target: { value: "C2" } });
  fireEvent.change(screen.getByTestId(`node-setup-${nodeId}-text`), {
    target: { value: "New payment received" },
  });
  await user.click(screen.getByTestId(`node-setup-${nodeId}-update`));
  await waitFor(() => {
    const node = useGraphSlice.getState().pendingNodes.find((n) => n.id === nodeId)!;
    expect(node.config).toMatchObject({ channel: "C2", text: "New payment received" });
  });

  // A Stripe-trigger workflow is not in-builder testable → readiness routes
  // straight to Activate once fields + connections are clean.
  await waitFor(() =>
    expect(screen.getByTestId("guided-build-card")).toHaveAttribute("data-stage", "ready_to_activate"),
  );

  // Activate — explicit click, real activate client, lifecycle refresh.
  await user.click(screen.getByTestId("guided-activate-button"));
  await waitFor(() => expect(mockActivate).toHaveBeenCalledTimes(1));
  expect(mockActivate).toHaveBeenCalledWith("wf-guided", {});
  expect(mockRouterRefresh).toHaveBeenCalled();

  // Journey 10 — billing: the whole deterministic journey (connect ×2,
  // configure, activate) made exactly ONE guidance call: the initial create.
  expect(mockRequest).toHaveBeenCalledTimes(1);
});

it("journey 2 — one app already connected: only the missing app asks to connect", async () => {
  connectedProviders.add("slack");
  const user = userEvent.setup();
  renderBuilder();
  await createAndApply(user);

  await screen.findByTestId("guided-connect-stripe-button");
  await screen.findByTestId("guided-connect-slack-connected");
  expect(screen.queryByTestId("guided-connect-slack-button")).toBeNull();
  expect(screen.getByText(/1 of 2 connected/)).toBeInTheDocument();
});

it("journey 3 — all apps connected: skips Connect and goes straight to Configure", async () => {
  connectedProviders.add("stripe").add("slack");
  const user = userEvent.setup();
  renderBuilder();
  await createAndApply(user);

  await waitFor(() =>
    expect(screen.getByTestId("guided-build-card")).toHaveAttribute("data-stage", "configuring"),
  );
  expect(screen.queryByTestId("guided-connect-section")).toBeNull();
});

it("journey 4 — no configuration required (manual trigger): straight to Test; a passed test unlocks Activate", async () => {
  connectedProviders.add("slack");
  mockRequest.mockResolvedValue({
    ok: true, guidanceText: "ok", source: "hermes-agent",
    workflowPlan: manualSlackPlan, previewDraft: manualSlackPreview,
  });
  // No required fields for this journey — the apply is complete as-is.
  const user = userEvent.setup();
  render(
    <WorkflowBuilder
      workflow={workflow()}
      triggerProviders={triggerProviders}
      actionProviders={actionProviders}
      requiredFieldsByType={{}}
      setupFieldsByType={SETUP_FIELDS}
      accountId="acct-1"
      guidanceEnabled
    />,
  );
  await createAndApply(user);

  await waitFor(() =>
    expect(screen.getByTestId("guided-build-card")).toHaveAttribute("data-stage", "ready_to_test"),
  );

  // Test from the rail: saves the dirty draft first, then the safe test run.
  await user.click(screen.getByTestId("guided-test-button"));
  await waitFor(() => expect(mockRunNow).toHaveBeenCalledTimes(1));
  expect(mockUpdateWorkflow).toHaveBeenCalled(); // draft persisted before the run
  expect(mockRunNow.mock.calls[0]![2]).toMatchObject({ testMode: true });

  // The run completes successfully (drive one poll tick with server truth).
  mockGetRun.mockResolvedValue({ status: "succeeded", steps: [] });
  await act(async () => {
    await useRunSlice.getState().pollOnce();
  });
  await waitFor(() =>
    expect(screen.getByTestId("guided-build-card")).toHaveAttribute("data-stage", "ready_to_activate"),
  );
  expect(screen.getByTestId("guided-activate-body")).toHaveTextContent("✓ Test passed.");

  await user.click(screen.getByTestId("guided-activate-button"));
  await waitFor(() => expect(mockActivate).toHaveBeenCalledTimes(1));
  expect(mockRequest).toHaveBeenCalledTimes(1); // still just the create call
});

it("journey 5 — OAuth canceled: the popup closes unfinished; Connect stage stays with Try again", async () => {
  const user = userEvent.setup();
  renderBuilder();
  await createAndApply(user);

  await user.click(await screen.findByTestId("guided-connect-stripe-button"));
  await waitFor(() => expect(openedPopups).toHaveLength(1));
  // User closes the popup without completing; NO completion message arrives.
  act(() => { openedPopups[0]!.closed = true; });

  await waitFor(
    () => expect(screen.getByTestId("guided-connect-stripe-button")).toHaveTextContent("Try again"),
    { timeout: 4000 },
  );
  expect(screen.getByTestId("guided-build-card")).toHaveAttribute("data-stage", "connecting");
  // The close fallback re-checked the server (still disconnected — honest).
  expect(mockGetConnectionReadiness.mock.calls.length).toBeGreaterThanOrEqual(2);
});

it("journey 6 — apply, SAVE, reload: the guided card resumes at the SAME stage from the saved workflow + readiness", async () => {
  const user = userEvent.setup();
  const first = renderBuilder();
  await createAndApply(user);
  await screen.findByTestId("guided-build-card");
  // REACT-AGENT-CONVERSATION-PERSISTENCE-1 — nothing is persisted yet: the change
  // is on the draft only, and an unsaved journey must not survive leaving.
  expect(window.localStorage.getItem("chainreact:builder:guidedBuild:wf-guided")).toBeNull();

  // The user SAVES. Only now does the guided hint exist, bound to the revision
  // the save produced.
  await act(async () => {
    await useGraphSlice.getState().save();
  });
  const savedRevision = useGraphSlice.getState().hydratedRevision!;
  await waitFor(() =>
    expect(window.localStorage.getItem("chainreact:builder:guidedBuild:wf-guided")).not.toBeNull(),
  );
  expect(JSON.parse(window.localStorage.getItem("chainreact:builder:guidedBuild:wf-guided")!)).toEqual({
    v: 2,
    savedGraphVersion: savedRevision,
  });

  // Simulate a reload: unmount everything, keep localStorage + the SAVED draft.
  const draft = {
    nodes: [...useGraphSlice.getState().savedNodes],
    edges: [...useGraphSlice.getState().savedEdges],
  };
  first.unmount();
  useGraphSlice.getState().reset();
  useConfigSlice.getState().reset();

  render(
    <WorkflowBuilder
      workflow={{ ...workflow(), draftDefinition: draft, updatedAt: savedRevision }}
      triggerProviders={triggerProviders}
      actionProviders={actionProviders}
      requiredFieldsByType={REQUIRED_FIELDS}
      setupFieldsByType={SETUP_FIELDS}
      accountId="acct-1"
      guidanceEnabled
    />,
  );

  // No new apply happened, but the restored session + re-derived readiness put
  // the card straight back into the Connect stage with both cards.
  const card = await screen.findByTestId("guided-build-card");
  await waitFor(() => expect(card).toHaveAttribute("data-stage", "connecting"));
  expect(screen.getByTestId("guided-connect-stripe")).toBeInTheDocument();
  expect(screen.getByTestId("guided-connect-slack")).toBeInTheDocument();
  // The saved nodes came back with the workflow…
  expect(useGraphSlice.getState().pendingNodes.length).toBeGreaterThan(0);
  // …and so did the conversation.
  expect(await screen.findByText("post Stripe payments to Slack")).toBeInTheDocument();
  // Restoring the transcript is a read: still exactly ONE guidance call.
  expect(mockRequest).toHaveBeenCalledTimes(1);
  // The save promoted the change on the canonical lifecycle record.
  expect(recordedAgentChanges.some((c) => c.status === "applied_saved")).toBe(true);
});

/**
 * REACT-AGENT-CONVERSATION-PERSISTENCE-1 — the reported bug, pinned end-to-end.
 *
 * Apply the preview, DON'T save, leave, come back: the canvas loads the last
 * saved workflow (empty), and "Finish setting up this workflow" must not appear.
 * Nothing in the returning session may start Connect / Configure / Test /
 * Activate, because none of those steps have anything to act on.
 */
it("applied but NOT saved → leave → return: empty canvas, and NO guided setup card", async () => {
  const user = userEvent.setup();
  const first = renderBuilder();
  await createAndApply(user);
  await screen.findByTestId("guided-build-card");
  expect(useGraphSlice.getState().pendingNodes.length).toBeGreaterThan(0);
  expect(useGraphSlice.getState().isDirty).toBe(true);

  // Leave without saving.
  first.unmount();
  useGraphSlice.getState().reset();
  useConfigSlice.getState().reset();

  // Return: the server still has the LAST SAVED (empty) workflow.
  render(
    <WorkflowBuilder
      workflow={workflow()}
      triggerProviders={triggerProviders}
      actionProviders={actionProviders}
      requiredFieldsByType={REQUIRED_FIELDS}
      setupFieldsByType={SETUP_FIELDS}
      accountId="acct-1"
      guidanceEnabled
    />,
  );

  await screen.findByTestId("builder-guidance-rail");
  await waitFor(() => expect(useGraphSlice.getState().isHydrated).toBe(true));
  // Unsaved nodes stayed discarded.
  expect(useGraphSlice.getState().pendingNodes).toHaveLength(0);
  // The conversation is still visible…
  expect(await screen.findByText("post Stripe payments to Slack")).toBeInTheDocument();
  // …but the stale setup card is gone, and the previous session never reached
  // `applied_saved`, so nothing claims the change landed.
  expect(screen.queryByTestId("guided-build-card")).toBeNull();
  expect(screen.queryByText(/Finish setting up this workflow/i)).toBeNull();
  expect(recordedAgentChanges.some((c) => c.status === "applied_saved")).toBe(false);
  // No AI request was re-issued to bring the conversation back.
  expect(mockRequest).toHaveBeenCalledTimes(1);
});

/**
 * REACT-AGENT-CONVERSATION-PERSISTENCE-1 — the legacy durable boolean.
 *
 * Sessions that ran the previous build left `"1"` in localStorage. On an empty
 * workflow that marker used to resume setup on its own; it must now be cleared
 * on sight and show nothing.
 */
it("stale legacy localStorage marker + empty workflow → marker cleared, no setup card", async () => {
  window.localStorage.setItem("chainreact:builder:guidedBuild:wf-guided", "1");
  renderBuilder();

  await screen.findByTestId("builder-guidance-rail");
  await waitFor(() =>
    expect(window.localStorage.getItem("chainreact:builder:guidedBuild:wf-guided")).toBeNull(),
  );
  expect(screen.queryByTestId("guided-build-card")).toBeNull();
});

/**
 * REACT-AGENT-AMBIGUOUS-TRIGGER-1 — the deterministic registry preview for an ambiguous
 * "Stripe payment" phrase (stripe:event_received with the exact event left as a SETUP field)
 * must ride the SAME guided flow: Apply → Connect (both apps) → Configure, where the EVENT
 * choice renders as a structured multi-select checkbox group in the rail and saves into the
 * draft trigger node. Route-level determinism (no Hermes, no credit) is pinned in
 * ai-workflow-guidance-route.test.ts; this covers the client handoff.
 */
describe("ambiguous Stripe payment → guided Connect then Configure (REACT-AGENT-AMBIGUOUS-TRIGGER-1)", () => {
  const eventReceivedPlan = {
    ...stripeSlackPlan,
    steps: [
      { ref: "s0", role: "trigger", provider: "stripe", type: "event_received", purpose: "Stripe Event Received — the event that starts this workflow.", requiredInputs: ["enabledEvents"] },
      { ref: "s1", role: "action", provider: "slack", type: "send_channel_message", purpose: "Send Channel Message.", requiredInputs: ["channel", "text"] },
    ],
  };
  const eventReceivedPreview = {
    ...stripeSlackPreview,
    nodes: [
      { previewId: "p1", role: "trigger", provider: "stripe", type: "event_received", label: "stripe:event_received", purpose: "watch", missingInputs: ["enabledEvents"], notApplied: true },
      { previewId: "p2", role: "action", provider: "slack", type: "send_channel_message", label: "slack:send_channel_message", purpose: "notify", missingInputs: ["channel", "text"], notApplied: true },
    ],
  };
  const EVENT_REQUIRED_FIELDS = {
    ...REQUIRED_FIELDS,
    "stripe:event_received": {
      displayName: "Stripe Event Received",
      requiredFields: [{ name: "enabledEvents", label: "Event Types" }],
    },
  } as const;
  const EVENT_SETUP_FIELDS = {
    ...SETUP_FIELDS,
    "stripe:event_received": [
      {
        name: "enabledEvents",
        label: "Event Types",
        type: "multi-select" as const,
        required: true,
        options: [
          { value: "payment_intent.succeeded", label: "payment_intent.succeeded" },
          { value: "invoice.paid", label: "invoice.paid" },
        ],
      },
    ],
  };

  it("applies, connects both apps, then asks the EVENT via a searchable selector and the channel via the picker", async () => {
    mockRequest.mockResolvedValue({
      ok: true,
      guidanceText: "Here's the workflow.",
      source: "registry_planner",
      workflowPlan: eventReceivedPlan,
      previewDraft: eventReceivedPreview,
    });
    const user = userEvent.setup();
    render(
      <WorkflowBuilder
        workflow={workflow()}
        triggerProviders={triggerProviders}
        actionProviders={actionProviders}
        requiredFieldsByType={EVENT_REQUIRED_FIELDS}
        setupFieldsByType={EVENT_SETUP_FIELDS}
        accountId="acct-1"
        guidanceEnabled
      />,
    );
    await createAndApply(user);

    // Connect first — both apps, from the deterministic preview's providers.
    const card = await screen.findByTestId("guided-build-card");
    expect(card).toHaveAttribute("data-stage", "connecting");
    await user.click(await screen.findByTestId("guided-connect-stripe-button"));
    await waitFor(() => expect(openedPopups).toHaveLength(1));
    act(() => completeOAuth("stripe"));
    await user.click(await screen.findByTestId("guided-connect-slack-button"));
    await waitFor(() => expect(openedPopups).toHaveLength(2));
    act(() => completeOAuth("slack"));

    // Configure — the TRIGGER node comes first: the exact Stripe event is a
    // SEARCHABLE selector (REACT-AGENT-PREAPPLY-SETUP-UX-1), not a checkbox wall,
    // not a rejection and not raw JSON. Nothing is preselected for the user.
    await waitFor(() =>
      expect(screen.getByTestId("guided-build-card")).toHaveAttribute("data-stage", "configuring"),
    );
    const triggerNode = useGraphSlice.getState().pendingNodes.find((n) => n.provider === "stripe")!;
    const eventField = `node-setup-${triggerNode.id}-enabledEvents`;
    await screen.findByTestId(`${eventField}-search`);
    await user.type(screen.getByTestId(`${eventField}-search`), "payment_intent.succeeded");
    await user.click(
      await screen.findByTestId(`${eventField}-payment_intent.succeeded`),
    );
    await user.click(screen.getByTestId(`node-setup-${triggerNode.id}-update`));
    await waitFor(() => {
      const node = useGraphSlice.getState().pendingNodes.find((n) => n.id === triggerNode.id)!;
      expect(node.config.enabledEvents).toEqual(["payment_intent.succeeded"]);
    });

    // Auto-advance to the Slack node: channel picker + message.
    const slackNode = useGraphSlice.getState().pendingNodes.find((n) => n.provider === "slack")!;
    const channel = await screen.findByTestId(`node-setup-${slackNode.id}-channel`);
    await waitFor(() => expect(channel.querySelectorAll("option").length).toBe(2));
    fireEvent.change(channel, { target: { value: "C2" } });
    fireEvent.change(screen.getByTestId(`node-setup-${slackNode.id}-text`), {
      target: { value: "Payment received" },
    });
    await user.click(screen.getByTestId(`node-setup-${slackNode.id}-update`));

    // Everything filled + connected → the webhook-trigger flow is ready to activate.
    await waitFor(() =>
      expect(screen.getByTestId("guided-build-card")).toHaveAttribute("data-stage", "ready_to_activate"),
    );
    // The whole guided path (connect ×2 + configure ×2) made ONE guidance call.
    expect(mockRequest).toHaveBeenCalledTimes(1);
  });
});
