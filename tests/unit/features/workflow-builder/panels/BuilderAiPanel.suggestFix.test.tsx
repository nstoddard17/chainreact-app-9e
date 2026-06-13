/**
 * Tests for the "Suggest a fix" repair-proposal UI in BuilderAiPanel
 * (Slice 4.AI-REPAIR-1c).
 *
 * RTL component tests with `@/lib/api/ai` mocked (no fetch/network). They pin: the
 * Suggest-a-fix affordance appears only on the latest OK diagnosis with real issues
 * (hidden on clean/ready + access walls), an explicit click calls
 * `planWorkflowRepair(workflowId)` once, the proposal bubble renders the safe fields
 * + the immutable UI-owned "nothing changed" notice, a success disables the button
 * (no repeat charge), credit/model failures render safe copy, and NO graph
 * mutation / save / run is triggered.
 */
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const mockDiagnose = jest.fn();
const mockRepair = jest.fn();
const mockExplain = jest.fn();
const mockGetThread = jest.fn();
const mockAppendThreadMessage = jest.fn();
const mockClearThread = jest.fn();
jest.mock("@/lib/api/ai", () => {
  const actual = jest.requireActual("@/lib/api/ai");
  return {
    planWorkflow: jest.fn(),
    applyWorkflowPatch: jest.fn(),
    diagnoseWorkflow: (...a: unknown[]) => mockDiagnose(...a),
    explainDiagnosis: (...a: unknown[]) => mockExplain(...a),
    planWorkflowRepair: (...a: unknown[]) => mockRepair(...a),
    getBuilderAgentThread: (...a: unknown[]) => mockGetThread(...a),
    appendBuilderAgentMessage: (...a: unknown[]) => mockAppendThreadMessage(...a),
    clearBuilderAgentThread: (...a: unknown[]) => mockClearThread(...a),
    AI_CREDITS_EXHAUSTED_MESSAGE: actual.AI_CREDITS_EXHAUSTED_MESSAGE,
    AiApiError: class AiApiError extends Error {
      status: number;
      constructor(message: string, status: number) {
        super(message);
        this.name = "AiApiError";
        this.status = status;
      }
    },
  };
});

const mockGetWorkflow = jest.fn();
jest.mock("@/lib/api/workflows", () => ({ getWorkflow: (...a: unknown[]) => mockGetWorkflow(...a) }));

import { AI_CREDITS_EXHAUSTED_MESSAGE } from "@/lib/api/ai";
import { BuilderAiPanel } from "@/features/workflow-builder/panels/BuilderAiPanel";
import { useGraphSlice } from "@/features/workflow-builder/state/graphSlice";

const issueDiagnosis = {
  workflowId: "wf-1",
  access: "OK",
  overallReady: false,
  summaryText: "This workflow can't run yet because Gmail isn't connected.",
  nextSteps: ["Reconnect Gmail."],
  findings: [{ source: "connection", code: "DISCONNECTED", severity: "error", title: "x", provider: "gmail" }],
};

const readyWithWarningDiagnosis = {
  workflowId: "wf-1",
  access: "OK",
  overallReady: true,
  summaryText: "This workflow looks ready to run.",
  nextSteps: [],
  findings: [{ source: "connection", code: "TOKEN_EXPIRED", severity: "warning", title: "x", provider: "gmail" }],
};

const cleanReadyDiagnosis = {
  workflowId: "wf-1",
  access: "OK",
  overallReady: true,
  findings: [],
  nextSteps: [],
  summaryText: "This workflow looks ready to run.",
};

const proposalOk = {
  ok: true,
  proposal: {
    summary: "Gmail is disconnected — reconnect it, then re-check.",
    recommendedActions: ["Reconnect the Gmail account", "Re-run Check workflow"],
    affectedNodes: ["Gmail — Send Email"],
    missingInfo: ["Which Gmail account should this use?"],
    riskLevel: "low",
    canAutoPatchLater: false,
    requiresUserAction: true,
    // A deliberately DIFFERENT server notice — the UI must render its OWN constant.
    notAppliedNotice: "server-supplied notice that must NOT be trusted",
  },
};

beforeEach(() => {
  mockDiagnose.mockReset();
  mockDiagnose.mockResolvedValue(issueDiagnosis);
  mockRepair.mockReset();
  mockRepair.mockResolvedValue(proposalOk);
  mockExplain.mockReset();
  mockGetThread.mockReset();
  mockGetThread.mockResolvedValue({
    thread: { id: "t", workflowId: "wf-1", createdAt: "now", updatedAt: "now" },
    messages: [],
  });
  mockAppendThreadMessage.mockReset();
  mockAppendThreadMessage.mockResolvedValue({ id: "m", role: "user", kind: "prompt", content: "", safePayload: {}, createdAt: "now" });
  mockClearThread.mockReset();
  mockClearThread.mockResolvedValue({ ok: true, deletedCount: 0 });
  mockGetWorkflow.mockReset();
  useGraphSlice.getState().reset();
  useGraphSlice.getState().hydrate("wf-1", { nodes: [], edges: [] });
});

/** Run a successful "Check workflow" with the given diagnosis and return the user. */
async function check(diagnosis: unknown = issueDiagnosis) {
  const user = userEvent.setup();
  mockDiagnose.mockResolvedValue(diagnosis);
  render(<BuilderAiPanel />);
  await user.click(screen.getByTestId("builder-ai-check-button"));
  await screen.findByTestId("builder-ai-diagnosis");
  return user;
}

describe("Suggest a fix — affordance visibility", () => {
  it("appears on the latest diagnosis with a BLOCKING issue", async () => {
    await check(issueDiagnosis);
    const btn = screen.getByTestId("builder-ai-suggest-fix-button");
    expect(btn).toBeEnabled();
    expect(btn.textContent).toContain("Suggest a fix");
    expect(mockRepair).not.toHaveBeenCalled(); // not auto-called
  });

  it("appears on a ready diagnosis that still carries a WARNING finding", async () => {
    await check(readyWithWarningDiagnosis);
    expect(screen.getByTestId("builder-ai-suggest-fix-button")).toBeEnabled();
  });

  it("is HIDDEN on a clean/ready diagnosis (card still renders)", async () => {
    await check(cleanReadyDiagnosis);
    expect(screen.getByTestId("builder-ai-diagnosis")).not.toBeNull();
    expect(screen.queryByTestId("builder-ai-suggest-fix-button")).toBeNull();
    expect(screen.queryByTestId("builder-ai-diagnosis-suggest-fix")).toBeNull();
  });

  it("is HIDDEN on a NO_ACCESS wall", async () => {
    await check({ workflowId: "wf-1", access: "NO_ACCESS" });
    expect(screen.queryByTestId("builder-ai-suggest-fix-button")).toBeNull();
  });

  it("is HIDDEN on a NOT_FOUND wall", async () => {
    await check({ workflowId: "wf-1", access: "NOT_FOUND" });
    expect(screen.queryByTestId("builder-ai-suggest-fix-button")).toBeNull();
  });
});

describe("Suggest a fix — happy path", () => {
  it("explicit click calls planWorkflowRepair(workflowId) once and renders the proposal + immutable UI notice", async () => {
    const user = await check();
    await user.click(screen.getByTestId("builder-ai-suggest-fix-button"));
    expect(mockRepair).toHaveBeenCalledTimes(1);
    expect(mockRepair).toHaveBeenCalledWith("wf-1");

    await screen.findByTestId("builder-ai-repair-proposal");
    expect(screen.getByTestId("builder-ai-repair-summary").textContent).toContain("reconnect it");
    expect(screen.getByTestId("builder-ai-repair-actions").textContent).toContain("Reconnect the Gmail account");
    expect(screen.getByTestId("builder-ai-repair-affected").textContent).toContain("Gmail — Send Email");
    expect(screen.getByTestId("builder-ai-repair-missing").textContent).toContain("Which Gmail account");
    expect(screen.getByTestId("builder-ai-repair-risk").textContent).toMatch(/risk estimate/i);

    // Immutable UI-owned notice — NOT the server-supplied notAppliedNotice.
    const notice = screen.getByTestId("builder-ai-repair-not-applied");
    expect(notice.textContent).toContain("wasn't changed, saved, or run");
    expect(notice.textContent).not.toContain("must NOT be trusted");
  });

  it("renders a pending 'Suggesting a fix…' indicator while in flight", async () => {
    const user = await check();
    let resolveRepair: (v: unknown) => void = () => {};
    mockRepair.mockReturnValue(new Promise((res) => { resolveRepair = res; }));
    await user.click(screen.getByTestId("builder-ai-suggest-fix-button"));
    await screen.findByTestId("builder-ai-suggesting");
    expect(screen.getByTestId("builder-ai-suggest-fix-button")).toBeDisabled();
    expect(screen.getByTestId("builder-ai-suggest-fix-button").textContent).toContain("Suggesting");
    resolveRepair(proposalOk);
    await waitFor(() => expect(screen.queryByTestId("builder-ai-suggesting")).toBeNull());
  });

  it("after a successful proposal the button is disabled + 'Suggested'; a repeat click does not re-call", async () => {
    const user = await check();
    await user.click(screen.getByTestId("builder-ai-suggest-fix-button"));
    await screen.findByTestId("builder-ai-repair-proposal");
    const btn = screen.getByTestId("builder-ai-suggest-fix-button");
    expect(btn).toBeDisabled();
    expect(btn.textContent).toContain("Suggested");
    await user.click(btn); // disabled → no-op
    expect(mockRepair).toHaveBeenCalledTimes(1);
  });

  it("triggers NO workflow save / graph hydrate / run (proposal-only)", async () => {
    const user = await check();
    await user.click(screen.getByTestId("builder-ai-suggest-fix-button"));
    await screen.findByTestId("builder-ai-repair-proposal");
    // The only graph-hydrate path (post-apply) goes through getWorkflow — never hit here.
    expect(mockGetWorkflow).not.toHaveBeenCalled();
    // No apply affordance is ever rendered for a repair proposal.
    expect(screen.queryByTestId("builder-ai-apply-button")).toBeNull();
    expect(screen.queryByTestId("builder-ai-apply-success")).toBeNull();
  });
});

describe("Suggest a fix — failures render safe copy", () => {
  it("AI_CREDITS_EXHAUSTED renders the shared safe credit message (button stays retryable)", async () => {
    const user = await check();
    mockRepair.mockResolvedValueOnce({ ok: false, code: "AI_CREDITS_EXHAUSTED", message: "ignored" });
    await user.click(screen.getByTestId("builder-ai-suggest-fix-button"));
    const err = await screen.findByTestId("builder-ai-error-message");
    expect(err.textContent).toBe(AI_CREDITS_EXHAUSTED_MESSAGE);
    // Not marked suggested — the user can retry.
    expect(screen.getByTestId("builder-ai-suggest-fix-button")).toBeEnabled();
  });

  it("model/gate failure renders safe generic copy, no internals", async () => {
    const user = await check();
    mockRepair.mockResolvedValueOnce({ ok: false, code: "MODEL_FAILED", message: "boom: SECRET-INTERNAL" });
    await user.click(screen.getByTestId("builder-ai-suggest-fix-button"));
    const err = await screen.findByTestId("builder-ai-error-message");
    expect(err.textContent).toContain("Couldn’t suggest a fix");
    expect(err.textContent).not.toContain("SECRET-INTERNAL");
    expect(err.textContent).not.toContain("MODEL_FAILED");
  });

  it("a 401 transport throw renders a sign-in prompt", async () => {
    const user = await check();
    const { AiApiError } = await import("@/lib/api/ai");
    mockRepair.mockRejectedValueOnce(new AiApiError("unauthenticated", 401));
    await user.click(screen.getByTestId("builder-ai-suggest-fix-button"));
    const err = await screen.findByTestId("builder-ai-error-message");
    expect(err.textContent).toContain("sign in");
  });
});

describe("Suggest a fix — no-leak", () => {
  it("the proposal bubble renders no ids / model metadata / codes", async () => {
    const user = await check();
    await user.click(screen.getByTestId("builder-ai-suggest-fix-button"));
    const body = await screen.findByTestId("builder-ai-repair-proposal");
    const t = body.textContent ?? "";
    for (const needle of ["wf-1", "acct-", "gpt-", "MODEL_FAILED", "inputTokens", "node-"]) {
      expect(t).not.toContain(needle);
    }
  });
});
