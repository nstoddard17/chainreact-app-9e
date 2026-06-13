/**
 * Tests for the "Explain with AI" diagnosis-explanation wiring in BuilderAiPanel
 * (Slice 4.AI-DIAG-2b).
 *
 * RTL component tests with `@/lib/api/ai` mocked (no fetch/network). They pin: the
 * Explain affordance appears only on the latest OK diagnosis (hidden on access
 * walls), an explicit click calls `explainDiagnosis(workflowId)` once, the pending
 * state renders, the explanation bubble renders text/priorities/missingInfo safely,
 * a successful explanation disables the button (no repeat charge), credit/model
 * failures render safe copy, no raw internals render, and no service/MCP import
 * sneaks into the diagnosis sibling.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const mockDiagnose = jest.fn();
const mockExplain = jest.fn();
const mockPlan = jest.fn();
const mockApply = jest.fn();
const mockGetThread = jest.fn();
const mockAppendThreadMessage = jest.fn();
const mockClearThread = jest.fn();
jest.mock("@/lib/api/ai", () => {
  // Real AI_CREDITS_EXHAUSTED_MESSAGE so the rendered credit copy matches production.
  const actual = jest.requireActual("@/lib/api/ai");
  return {
    planWorkflow: (...a: unknown[]) => mockPlan(...a),
    applyWorkflowPatch: (...a: unknown[]) => mockApply(...a),
    diagnoseWorkflow: (...a: unknown[]) => mockDiagnose(...a),
    explainDiagnosis: (...a: unknown[]) => mockExplain(...a),
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

jest.mock("@/lib/api/workflows", () => ({ getWorkflow: jest.fn() }));

import { AiApiError, AI_CREDITS_EXHAUSTED_MESSAGE } from "@/lib/api/ai";
import { BuilderAiPanel } from "@/features/workflow-builder/panels/BuilderAiPanel";
import { useGraphSlice } from "@/features/workflow-builder/state/graphSlice";

const okDiagnosis = {
  workflowId: "wf-1",
  access: "OK",
  overallReady: false,
  summaryText: "This workflow can't run yet because Gmail isn't connected.",
  nextSteps: ["Reconnect Gmail."],
  findings: [{ source: "connection", code: "DISCONNECTED", severity: "error", title: "x", provider: "gmail" }],
};

const explanationOk = {
  ok: true,
  explanation: "Gmail isn't connected, so the workflow can't run. Reconnect Gmail to fix it.",
  priorities: ["Reconnect Gmail"],
  missingInfo: ["Which Gmail account should be used?"],
};

// AI-DIAG-2c — a fully clean / ready diagnosis: nothing actionable to explain.
const readyCleanDiagnosis = {
  workflowId: "wf-1",
  access: "OK",
  overallReady: true,
  findings: [],
  nextSteps: [],
  summaryText: "This workflow looks ready to run.\nThe most recent run succeeded.",
};

// Ready overall, but still carries a non-blocking warning worth explaining.
const readyWithWarningDiagnosis = {
  workflowId: "wf-1",
  access: "OK",
  overallReady: true,
  findings: [
    { source: "connection", code: "TOKEN_EXPIRED", severity: "warning", title: "x", provider: "gmail" },
  ],
  nextSteps: [],
  summaryText: "This workflow looks ready to run.",
};

beforeEach(() => {
  mockDiagnose.mockReset();
  mockDiagnose.mockResolvedValue(okDiagnosis);
  mockExplain.mockReset();
  mockExplain.mockResolvedValue(explanationOk);
  mockPlan.mockReset();
  mockApply.mockReset();
  mockGetThread.mockReset();
  mockGetThread.mockResolvedValue({
    thread: { id: "t", workflowId: "wf-1", createdAt: "now", updatedAt: "now" },
    messages: [],
  });
  mockAppendThreadMessage.mockReset();
  mockAppendThreadMessage.mockResolvedValue({ id: "m", role: "user", kind: "prompt", content: "", safePayload: {}, createdAt: "now" });
  mockClearThread.mockReset();
  mockClearThread.mockResolvedValue({ ok: true, deletedCount: 0 });
  useGraphSlice.getState().reset();
  useGraphSlice.getState().hydrate("wf-1", { nodes: [], edges: [] });
});

/** Run a successful "Check workflow" and return the userEvent instance. */
async function check(diagnosis: unknown = okDiagnosis) {
  const user = userEvent.setup();
  mockDiagnose.mockResolvedValue(diagnosis);
  render(<BuilderAiPanel />);
  await user.click(screen.getByTestId("builder-ai-check-button"));
  await screen.findByTestId("builder-ai-diagnosis");
  return user;
}

describe("Explain with AI — affordance visibility", () => {
  it("shows the Explain button after a latest successful OK diagnosis", async () => {
    await check();
    const btn = screen.getByTestId("builder-ai-explain-button");
    expect(btn).toBeEnabled();
    expect(btn.textContent).toContain("Explain with AI");
    // Not auto-called — only on explicit click.
    expect(mockExplain).not.toHaveBeenCalled();
  });

  it("is hidden on a NO_ACCESS wall", async () => {
    await check({ workflowId: "wf-1", access: "NO_ACCESS" });
    expect(screen.queryByTestId("builder-ai-explain-button")).toBeNull();
  });

  it("is hidden on a NOT_FOUND wall", async () => {
    await check({ workflowId: "wf-1", access: "NOT_FOUND" });
    expect(screen.queryByTestId("builder-ai-explain-button")).toBeNull();
  });

  it("AI-DIAG-2c — is HIDDEN on a clean/ready diagnosis, but the diagnosis card still renders", async () => {
    await check(readyCleanDiagnosis);
    // The deterministic card is still shown (we never hide the diagnosis itself).
    expect(screen.getByTestId("builder-ai-diagnosis")).not.toBeNull();
    expect(screen.getByTestId("builder-ai-diagnosis-summary").textContent).toContain(
      "ready to run",
    );
    // The paid affordance (and its wrapper) is gone — nothing useful to explain.
    expect(screen.queryByTestId("builder-ai-explain-button")).toBeNull();
    expect(screen.queryByTestId("builder-ai-diagnosis-explain")).toBeNull();
  });

  it("AI-DIAG-2c — is SHOWN on a ready diagnosis that still carries a warning finding", async () => {
    await check(readyWithWarningDiagnosis);
    expect(screen.getByTestId("builder-ai-explain-button")).toBeEnabled();
  });
});

describe("Explain with AI — happy path", () => {
  it("explicit click calls explainDiagnosis(workflowId) once and renders text/priorities/missingInfo", async () => {
    const user = await check();
    await user.click(screen.getByTestId("builder-ai-explain-button"));
    expect(mockExplain).toHaveBeenCalledTimes(1);
    expect(mockExplain).toHaveBeenCalledWith("wf-1");
    const body = await screen.findByTestId("builder-ai-diagnosis-explanation");
    expect(screen.getByTestId("builder-ai-diagnosis-explanation-text").textContent).toContain("Reconnect Gmail");
    expect(screen.getByTestId("builder-ai-diagnosis-explanation-priorities").textContent).toContain("Reconnect Gmail");
    expect(screen.getByTestId("builder-ai-diagnosis-explanation-missing").textContent).toContain("Which Gmail account");
    // Explanation-only: states plainly nothing was changed/run.
    expect(body.textContent).toMatch(/wasn.t changed or run/i);
  });

  it("renders a pending 'Explaining this check…' indicator while in flight", async () => {
    const user = await check();
    let resolveExplain: (v: unknown) => void = () => {};
    mockExplain.mockReturnValue(new Promise((res) => { resolveExplain = res; }));
    await user.click(screen.getByTestId("builder-ai-explain-button"));
    await screen.findByTestId("builder-ai-explaining");
    expect(screen.getByTestId("builder-ai-explain-button")).toBeDisabled();
    expect(screen.getByTestId("builder-ai-explain-button").textContent).toContain("Explaining");
    resolveExplain(explanationOk);
    await waitFor(() => expect(screen.queryByTestId("builder-ai-explaining")).toBeNull());
  });

  it("after a successful explanation the button is disabled + 'Explained'; a repeat click does not re-call", async () => {
    const user = await check();
    await user.click(screen.getByTestId("builder-ai-explain-button"));
    await screen.findByTestId("builder-ai-diagnosis-explanation");
    const btn = screen.getByTestId("builder-ai-explain-button");
    expect(btn).toBeDisabled();
    expect(btn.textContent).toContain("Explained");
    await user.click(btn); // disabled → no-op
    expect(mockExplain).toHaveBeenCalledTimes(1);
  });
});

describe("Explain with AI — failures render safe copy", () => {
  it("AI_CREDITS_EXHAUSTED renders the shared credit message (button stays retryable)", async () => {
    const user = await check();
    mockExplain.mockResolvedValueOnce({ ok: false, code: "AI_CREDITS_EXHAUSTED", message: "ignored" });
    await user.click(screen.getByTestId("builder-ai-explain-button"));
    const err = await screen.findByTestId("builder-ai-error-message");
    expect(err.textContent).toBe(AI_CREDITS_EXHAUSTED_MESSAGE);
    // Not marked explained — the user can retry.
    expect(screen.getByTestId("builder-ai-explain-button")).toBeEnabled();
  });

  it("model failure (503 MODEL_FAILED) renders safe retry copy, no internals", async () => {
    const user = await check();
    mockExplain.mockResolvedValueOnce({ ok: false, code: "MODEL_FAILED", message: "boom: SECRET-INTERNAL" });
    await user.click(screen.getByTestId("builder-ai-explain-button"));
    const err = await screen.findByTestId("builder-ai-error-message");
    expect(err.textContent).toContain("Couldn’t generate an explanation");
    expect(err.textContent).not.toContain("SECRET-INTERNAL");
    expect(err.textContent).not.toContain("MODEL_FAILED");
  });

  it("a transport throw renders safe generic copy", async () => {
    const user = await check();
    mockExplain.mockRejectedValueOnce(new AiApiError("getServiceRoleClient: SECRET", 500));
    await user.click(screen.getByTestId("builder-ai-explain-button"));
    const err = await screen.findByTestId("builder-ai-error-message");
    expect(err.textContent).toContain("Couldn’t generate an explanation");
    expect(err.textContent).not.toContain("SECRET");
  });

  it("a 401 transport throw renders a sign-in prompt", async () => {
    const user = await check();
    mockExplain.mockRejectedValueOnce(new AiApiError("unauthenticated", 401));
    await user.click(screen.getByTestId("builder-ai-explain-button"));
    const err = await screen.findByTestId("builder-ai-error-message");
    expect(err.textContent).toContain("sign in");
  });
});

describe("Explain with AI — no-leak + boundaries", () => {
  it("the explanation bubble renders no ids / model metadata / codes", async () => {
    const user = await check();
    await user.click(screen.getByTestId("builder-ai-explain-button"));
    const body = await screen.findByTestId("builder-ai-diagnosis-explanation");
    const t = body.textContent ?? "";
    for (const needle of ["wf-1", "acct-", "gpt-", "MODEL_FAILED", "inputTokens", "workflow_explanation"]) {
      expect(t).not.toContain(needle);
    }
  });

  it("the diagnosis sibling imports no service or MCP module (uses lib/api/ai)", () => {
    const importSpec = /(?:import\s[^"']*?from\s*|import\s*|require\s*\(\s*)["']([^"']+)["']/g;
    const src = readFileSync(
      resolve(process.cwd(), "features/workflow-builder/panels/_BuilderAiPanelDiagnosis.tsx"),
      "utf8",
    );
    for (const m of src.matchAll(importSpec)) {
      expect(m[1]).not.toMatch(/^@\/services\//);
      expect(m[1]).not.toMatch(/scripts\/mcp/);
    }
  });
});
