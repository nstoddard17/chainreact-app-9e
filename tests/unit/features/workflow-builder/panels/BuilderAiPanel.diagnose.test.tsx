/**
 * Tests for the "Check this workflow" read-only diagnosis wiring in
 * BuilderAiPanel (Slice 4.AI-DIAG-1b).
 *
 * RTL component tests with the AI API client mocked (no fetch, no network). They
 * pin: the button calls `diagnoseWorkflow(workflowId)`, the in-flight state
 * disables duplicate checks + planning, the assistant diagnosis message renders
 * `summaryText` + `nextSteps`, access walls render safely, API errors render safe
 * copy, no raw JSON/secrets are rendered, and the panel never imports a service
 * or MCP module (it goes through `lib/api/ai`).
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const mockDiagnose = jest.fn();
const mockPlan = jest.fn();
const mockApply = jest.fn();
const mockGetThread = jest.fn();
const mockAppendThreadMessage = jest.fn();
const mockClearThread = jest.fn();
jest.mock("@/lib/api/ai", () => ({
  planWorkflow: (...a: unknown[]) => mockPlan(...a),
  applyWorkflowPatch: (...a: unknown[]) => mockApply(...a),
  diagnoseWorkflow: (...a: unknown[]) => mockDiagnose(...a),
  getBuilderAgentThread: (...a: unknown[]) => mockGetThread(...a),
  appendBuilderAgentMessage: (...a: unknown[]) => mockAppendThreadMessage(...a),
  clearBuilderAgentThread: (...a: unknown[]) => mockClearThread(...a),
  AiApiError: class AiApiError extends Error {
    status: number;
    constructor(message: string, status: number) {
      super(message);
      this.name = "AiApiError";
      this.status = status;
    }
  },
}));

const mockGetWorkflow = jest.fn();
jest.mock("@/lib/api/workflows", () => ({
  getWorkflow: (...a: unknown[]) => mockGetWorkflow(...a),
}));

import { AiApiError } from "@/lib/api/ai";
import { BuilderAiPanel } from "@/features/workflow-builder/panels/BuilderAiPanel";
import { useGraphSlice } from "@/features/workflow-builder/state/graphSlice";

const readyDiagnosis = {
  workflowId: "wf-1",
  access: "OK",
  overallReady: false,
  runnable: false,
  allRequiredConnected: false,
  findings: [
    {
      source: "connection",
      code: "DISCONNECTED",
      severity: "error",
      title: "The provider isn't connected.",
      provider: "gmail",
      providerName: "Gmail",
      nodeIds: ["n2"],
      credentialClass: "personal",
    },
  ],
  summaryText:
    "This workflow can't run yet because one or more providers aren't connected.\n- The provider isn't connected. (Gmail; nodes: n2)",
  nextSteps: ["Reconnect Gmail."],
};

beforeEach(() => {
  mockDiagnose.mockReset();
  mockPlan.mockReset();
  mockApply.mockReset();
  mockGetWorkflow.mockReset();
  mockGetThread.mockReset();
  mockGetThread.mockResolvedValue({
    thread: { id: "t", workflowId: "wf-1", createdAt: "now", updatedAt: "now" },
    messages: [],
  });
  mockAppendThreadMessage.mockReset();
  mockAppendThreadMessage.mockResolvedValue({
    id: "m",
    role: "user",
    kind: "prompt",
    content: "",
    safePayload: {},
    createdAt: "now",
  });
  mockClearThread.mockReset();
  mockClearThread.mockResolvedValue({ ok: true, deletedCount: 0 });
  useGraphSlice.getState().reset();
  useGraphSlice.getState().hydrate("wf-1", { nodes: [], edges: [] });
});

describe("Check workflow — happy path", () => {
  it("calls diagnoseWorkflow(workflowId) and renders summaryText + nextSteps", async () => {
    const user = userEvent.setup();
    mockDiagnose.mockResolvedValue(readyDiagnosis);
    render(<BuilderAiPanel />);

    await user.click(screen.getByTestId("builder-ai-check-button"));

    // AI-DIAG-FIX-1 — Check sends the CURRENT builder draft snapshot (nodes+edges).
    expect(mockDiagnose).toHaveBeenCalledWith(
      "wf-1",
      expect.objectContaining({ nodes: [], edges: [] }),
    );
    await screen.findByTestId("builder-ai-diagnosis");
    expect(screen.getByTestId("builder-ai-diagnosis-summary").textContent).toContain(
      "can't run yet",
    );
    expect(screen.getByTestId("builder-ai-diagnosis-next-steps").textContent).toContain(
      "Reconnect Gmail.",
    );
    // The user-gesture marker rendered as a user bubble (kind="action").
    const userBubbles = screen.getAllByTestId("builder-ai-message-user");
    expect(userBubbles.some((b) => b.getAttribute("data-kind") === "action")).toBe(true);
  });

  it("does not render raw findings JSON / config — only safe text", async () => {
    const user = userEvent.setup();
    mockDiagnose.mockResolvedValue(readyDiagnosis);
    render(<BuilderAiPanel />);
    await user.click(screen.getByTestId("builder-ai-check-button"));
    const body = await screen.findByTestId("builder-ai-diagnosis");
    // No JSON object dump of the finding.
    expect(body.textContent).not.toContain('"code"');
    expect(body.textContent).not.toContain('"source"');
    expect(body.textContent).not.toContain("credentialClass");
  });
});

describe("Check workflow — loading state", () => {
  it("disables the check + plan buttons while in flight; calls once", async () => {
    const user = userEvent.setup();
    let resolveDiag: (v: unknown) => void = () => {};
    mockDiagnose.mockReturnValue(new Promise((res) => { resolveDiag = res; }));
    render(<BuilderAiPanel />);

    const checkBtn = screen.getByTestId("builder-ai-check-button");
    await user.click(checkBtn);

    // In-flight: indicator visible, button disabled + relabelled, plan disabled.
    await screen.findByTestId("builder-ai-checking");
    expect(checkBtn).toBeDisabled();
    expect(checkBtn.textContent).toContain("Checking");
    expect(screen.getByTestId("builder-ai-plan-button")).toBeDisabled();

    // A second click while disabled does nothing.
    await user.click(checkBtn);
    expect(mockDiagnose).toHaveBeenCalledTimes(1);

    resolveDiag(readyDiagnosis);
    await waitFor(() => expect(screen.queryByTestId("builder-ai-checking")).toBeNull());
    expect(screen.getByTestId("builder-ai-check-button")).not.toBeDisabled();
  });
});

describe("Check workflow — access walls + errors render safely", () => {
  it("NO_ACCESS renders only a safe line (no hidden data)", async () => {
    const user = userEvent.setup();
    mockDiagnose.mockResolvedValue({ workflowId: "wf-1", access: "NO_ACCESS" });
    render(<BuilderAiPanel />);
    await user.click(screen.getByTestId("builder-ai-check-button"));
    const summary = await screen.findByTestId("builder-ai-diagnosis-summary");
    expect(summary.textContent).toContain("don’t have access");
    expect(screen.queryByTestId("builder-ai-diagnosis-next-steps")).toBeNull();
  });

  it("NOT_FOUND renders a safe not-found line", async () => {
    const user = userEvent.setup();
    mockDiagnose.mockResolvedValue({ workflowId: "wf-1", access: "NOT_FOUND" });
    render(<BuilderAiPanel />);
    await user.click(screen.getByTestId("builder-ai-check-button"));
    const summary = await screen.findByTestId("builder-ai-diagnosis-summary");
    expect(summary.textContent).toContain("couldn’t be found");
  });

  it("401 renders a sign-in prompt", async () => {
    const user = userEvent.setup();
    mockDiagnose.mockRejectedValue(new AiApiError("unauthenticated", 401));
    render(<BuilderAiPanel />);
    await user.click(screen.getByTestId("builder-ai-check-button"));
    const err = await screen.findByTestId("builder-ai-error-message");
    expect(err.textContent).toContain("sign in");
  });

  it("500 (or transport throw) renders safe generic copy, no internals", async () => {
    const user = userEvent.setup();
    mockDiagnose.mockRejectedValue(new AiApiError("getServiceRoleClient: SECRET", 500));
    render(<BuilderAiPanel />);
    await user.click(screen.getByTestId("builder-ai-check-button"));
    const err = await screen.findByTestId("builder-ai-error-message");
    expect(err.textContent).toContain("Couldn’t check this workflow");
    expect(err.textContent).not.toContain("SECRET");
  });
});

describe("Check workflow — client boundary", () => {
  it("the panel + its siblings import no service or MCP module (uses lib/api/ai)", () => {
    const importSpec = /(?:import\s[^"']*?from\s*|import\s*|require\s*\(\s*)["']([^"']+)["']/g;
    for (const rel of [
      "features/workflow-builder/panels/BuilderAiPanel.tsx",
      "features/workflow-builder/panels/_BuilderAiPanelChat.tsx",
      "features/workflow-builder/panels/_BuilderAiPanelComposer.tsx",
      "features/workflow-builder/panels/_BuilderAiPanelMessageList.tsx",
    ]) {
      const src = readFileSync(resolve(process.cwd(), rel), "utf8");
      const specs = [...src.matchAll(importSpec)].map((m) => m[1]);
      for (const spec of specs) {
        expect(spec).not.toMatch(/^@\/services\//);
        expect(spec).not.toMatch(/scripts\/mcp/);
      }
    }
  });
});
