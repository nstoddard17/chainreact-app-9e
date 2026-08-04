/**
 * REACT-AGENT-VISUAL-THINKING-BUBBLE-1 — the canvas thinking bubble against the REAL builder.
 *
 * Drives WorkflowBuilder end-to-end (rail submit → mocked guidance API) and proves the bubble:
 * appears while the request is pending, disappears on every terminal outcome (preview,
 * clarification, typed error, timeout, rejection/cancellation), never mounts in Document mode,
 * and never touches the workflow graph or calls a mutation API.
 *
 * "Cancellation" note: the guidance hook has no client-side abort — an abandoned request surfaces
 * as a rejected promise, which is exactly what the rejection case here exercises.
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

import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { WorkflowBuilder } from "@/features/workflow-builder/WorkflowBuilder";
import { useGraphSlice } from "@/features/workflow-builder/state/graphSlice";
import { useConfigSlice } from "@/features/workflow-builder/state/configSlice";
import type { WorkflowDetail } from "@/contracts/workflow";

const baseWorkflow: WorkflowDetail = {
  id: "wf-1",
  name: "Test",
  state: "draft",
  disabledReason: null,
  disabledContext: null,
  activeRevisionId: null,
  draftDefinition: { nodes: [], edges: [] },
  deletedAt: null,
  createdAt: "2026-05-17T00:00:00Z",
  updatedAt: "2026-05-17T00:00:00Z",
};

const triggerProviders = [{ id: "slack", displayName: "Slack" }];
const actionProviders = [{ id: "github", displayName: "GitHub" }];

const previewDraft = {
  version: 1,
  title: "Lead follow-up",
  summary: "Watch then notify.",
  notice: "Preview only — your workflow has not changed.",
  notApplied: true,
  nodes: [
    { previewId: "preview-step-1", role: "trigger", provider: "gmail", type: "new_email", label: "gmail:new_email", purpose: "watch", notApplied: true },
  ],
  edges: [],
};

const PLAN_REPLY = {
  ok: true,
  guidanceText: "Here's an idea.",
  source: "hermes-agent",
  workflowPlan: {
    schemaVersion: 1,
    title: "Lead follow-up",
    summary: "",
    notApplied: true,
    steps: [{ ref: "s0", role: "trigger", provider: "gmail", type: "new_email", purpose: "watch" }],
  },
  previewDraft,
};

/** A promise the test resolves/rejects on demand — the "request in flight" window. */
function deferred<T>() {
  let resolve!: (v: T) => void;
  let reject!: (e: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

beforeEach(() => {
  mockUpdateWorkflow.mockReset();
  mockRequest.mockReset().mockResolvedValue(PLAN_REPLY);
  useGraphSlice.getState().reset();
  useConfigSlice.getState().reset();
  window.localStorage.clear();
});

function renderBuilder(extraProps: Record<string, unknown> = {}) {
  return render(
    <WorkflowBuilder
      workflow={baseWorkflow}
      triggerProviders={triggerProviders}
      actionProviders={actionProviders}
      accountId="acct-1"
      guidanceEnabled
      {...extraProps}
    />,
  );
}

async function submitGoal(user: ReturnType<typeof userEvent.setup>, text = "follow up with leads") {
  await user.click(screen.getByPlaceholderText(/Example:/i));
  await user.paste(text);
  await user.click(screen.getByTestId("workflow-guidance-submit"));
}

const bubble = () => screen.queryByTestId("visual-agent-thinking-bubble");

describe("visual thinking bubble — request lifecycle in the real builder", () => {
  it("(#1) hidden while idle; the persistent status region is mounted and silent", () => {
    renderBuilder();
    expect(bubble()).toBeNull();
    expect(screen.getByTestId("visual-agent-thinking-status")).toHaveTextContent("");
  });

  it("(#2,#3,#4) appears while the request (incl. any internal repair — same request) is pending, disappears when the preview arrives", async () => {
    const gate = deferred<typeof PLAN_REPLY>();
    mockRequest.mockReturnValueOnce(gate.promise);
    const user = userEvent.setup();
    renderBuilder();
    await submitGoal(user);

    // Visible after the anti-flicker delay, while the promise is unresolved.
    await screen.findByTestId("visual-agent-thinking-bubble");
    expect(screen.getByTestId("visual-agent-thinking-status")).toHaveTextContent(
      /React Agent is preparing a response/,
    );

    gate.resolve(PLAN_REPLY);
    await screen.findByTestId("builder-preview-overlay");
    // (#15) the existing preview flow rendered; the bubble is gone — never both at once.
    expect(bubble()).toBeNull();
    expect(screen.getByTestId("visual-agent-thinking-status")).toHaveTextContent("");
  });

  it("(#5) disappears when a CLARIFICATION (no plan) arrives", async () => {
    const gate = deferred<unknown>();
    mockRequest.mockReturnValueOnce(gate.promise);
    const user = userEvent.setup();
    renderBuilder();
    await submitGoal(user);
    await screen.findByTestId("visual-agent-thinking-bubble");

    gate.resolve({ ok: true, guidanceText: "Which app should send the email?", source: "hermes-agent", workflowPlan: null, previewDraft: null });
    await screen.findByText(/Which app should send the email\?/);
    await waitFor(() => expect(bubble()).toBeNull());
  });

  it("(#6) disappears when a TYPED error arrives (ok:false body)", async () => {
    const gate = deferred<unknown>();
    mockRequest.mockReturnValueOnce(gate.promise);
    const user = userEvent.setup();
    renderBuilder();
    await submitGoal(user);
    await screen.findByTestId("visual-agent-thinking-bubble");

    gate.resolve({ ok: false, code: "PREVIEW_PLAN_MISSING", message: "I understood the workflow you want, but couldn't produce the preview this time." });
    await waitFor(() => expect(bubble()).toBeNull());
    // The existing error presentation appears INSTEAD of the bubble.
    await screen.findByText(/couldn't produce the preview/i);
  });

  it("(#7) disappears after a TIMEOUT typed error", async () => {
    const gate = deferred<unknown>();
    mockRequest.mockReturnValueOnce(gate.promise);
    const user = userEvent.setup();
    renderBuilder();
    await submitGoal(user);
    await screen.findByTestId("visual-agent-thinking-bubble");

    gate.resolve({ ok: false, code: "GUIDANCE_TIMEOUT", message: "That took longer than the assistant could work on it." });
    await waitFor(() => expect(bubble()).toBeNull());
    await screen.findByText(/took longer than the assistant/i);
  });

  it("(#8) disappears when the request REJECTS (the cancellation/abandonment shape)", async () => {
    const gate = deferred<unknown>();
    mockRequest.mockReturnValueOnce(gate.promise);
    const user = userEvent.setup();
    renderBuilder();
    await submitGoal(user);
    await screen.findByTestId("visual-agent-thinking-bubble");

    gate.reject(new Error("aborted"));
    await waitFor(() => expect(bubble()).toBeNull());
  });

  it("(#12) the bubble is an overlay, not graph state: no react-flow node, no save, graph untouched", async () => {
    const gate = deferred<typeof PLAN_REPLY>();
    mockRequest.mockReturnValueOnce(gate.promise);
    const user = userEvent.setup();
    renderBuilder();
    const nodesBefore = useGraphSlice.getState().pendingNodes;
    await submitGoal(user);
    const el = await screen.findByTestId("visual-agent-thinking-bubble");

    expect(el.closest(".react-flow")).toBeNull(); // never inside the graph pane
    expect(el.closest(".react-flow__node")).toBeNull();
    expect(useGraphSlice.getState().pendingNodes).toBe(nodesBefore); // graph state untouched
    expect(mockUpdateWorkflow).not.toHaveBeenCalled(); // nothing persisted
    gate.resolve(PLAN_REPLY);
    await waitFor(() => expect(bubble()).toBeNull());
    expect(mockUpdateWorkflow).not.toHaveBeenCalled();
  });
});

describe("visual thinking bubble — Document mode isolation (#9)", () => {
  it("Document mode never mounts the bubble (not even its live region)", async () => {
    renderBuilder({ documentBuilderEnabled: true, defaultBuilderView: "document" });
    // The document surface is active…
    await screen.findByTestId("document-view");
    // …and the canvas bubble component is entirely absent (its persistent status region included).
    expect(screen.queryByTestId("visual-agent-thinking-status")).toBeNull();
    expect(bubble()).toBeNull();
  });

  it("Visual mode with the document flag ON still mounts the (idle, silent) bubble component", () => {
    renderBuilder({ documentBuilderEnabled: true, defaultBuilderView: "visual" });
    expect(screen.getByTestId("visual-agent-thinking-status")).toBeInTheDocument();
    expect(bubble()).toBeNull();
  });
});
