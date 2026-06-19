/**
 * Tests for the Builder AI single-shot workflow-diagnosis Q&A behavior, driven through
 * the ONE composer (Slice 4.AI-DIAG-QA-3 backend rendering + AI-DIAG-QA-AUTOROUTE CS-4).
 *
 * After CS-4 the separate mini Q&A box is gone — a diagnostic question typed into the
 * single composer auto-routes to Q&A. RTL component tests with `@/lib/api/ai` mocked
 * (no fetch/network). They pin: only ONE composer input exists (no mini box); a routed
 * Q&A calls `askDiagnosisQuestion(workflowId, question, draft, selectedNodeId?)` with NO
 * raw DTO; a successful answer renders question + answer + optional pointers +
 * needsUserDecision safely; 402 / 403 / 503 / transport failures render safe copy with no
 * internals; the answer bubble introduces no Apply / Preview control; and no raw
 * ids/secrets from the response reach the DOM.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const mockDiagnose = jest.fn();
const mockExplain = jest.fn();
const mockAsk = jest.fn();
const mockPlan = jest.fn();
const mockApply = jest.fn();
const mockGetThread = jest.fn();
const mockAppendThreadMessage = jest.fn();
const mockClearThread = jest.fn();
jest.mock("@/lib/api/ai", () => {
  const actual = jest.requireActual("@/lib/api/ai");
  return {
    planWorkflow: (...a: unknown[]) => mockPlan(...a),
    applyWorkflowPatch: (...a: unknown[]) => mockApply(...a),
    diagnoseWorkflow: (...a: unknown[]) => mockDiagnose(...a),
    explainDiagnosis: (...a: unknown[]) => mockExplain(...a),
    askDiagnosisQuestion: (...a: unknown[]) => mockAsk(...a),
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
import { useConfigSlice } from "@/features/workflow-builder/state/configSlice";

const answerOk = {
  ok: true,
  answer: "Gmail isn't connected, so the workflow can't run. Reconnect Gmail to fix it.",
  pointers: ["Reconnect Gmail in Apps", "Then re-check the workflow"],
  needsUserDecision: false,
};

beforeEach(() => {
  mockDiagnose.mockReset();
  mockExplain.mockReset();
  mockAsk.mockReset();
  mockAsk.mockResolvedValue(answerOk);
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
  useConfigSlice.getState().reset();
});

/**
 * Type a diagnostic question into the ONE composer and return the userEvent instance
 * + the send button. After CS-4 there is no mini Q&A box — a diagnostic question
 * auto-routes to Q&A through the single composer.
 */
async function ask(question: string) {
  const user = userEvent.setup();
  render(<BuilderAiPanel />);
  await user.type(screen.getByTestId("builder-ai-prompt"), question);
  return { user, submit: screen.getByTestId("builder-ai-plan-button") };
}

describe("Workflow Q&A — one composer (no mini box)", () => {
  it("the Builder AI panel exposes exactly ONE composer input and no separate Q&A mini-box", () => {
    render(<BuilderAiPanel />);
    expect(screen.getByTestId("builder-ai-prompt")).not.toBeNull();
    // CS-4 — the mini Q&A box is gone.
    expect(screen.queryByTestId("builder-ai-qa")).toBeNull();
    expect(screen.queryByTestId("builder-ai-qa-input")).toBeNull();
    expect(screen.queryByTestId("builder-ai-qa-submit")).toBeNull();
  });

  it("the composer send is disabled while a routed Q&A is in flight; not stuck after", async () => {
    let resolveAsk: (v: unknown) => void = () => {};
    mockAsk.mockReturnValue(new Promise((res) => { resolveAsk = res; }));
    const { user, submit } = await ask("Why won't this run?");
    expect(submit).toBeEnabled();
    await user.click(submit);
    // In flight (`asking`) → the single send is disabled (no conflicting op can start).
    await waitFor(() => expect(screen.getByTestId("builder-ai-plan-button")).toBeDisabled());
    resolveAsk(answerOk);
    await screen.findByTestId("builder-ai-diagnosis-qa");
    // Composer cleared on submit; typing a new prompt re-enables send (not stuck disabled).
    await user.type(screen.getByTestId("builder-ai-prompt"), "What next?");
    await waitFor(() => expect(screen.getByTestId("builder-ai-plan-button")).toBeEnabled());
  });
});

describe("Workflow Q&A — happy path", () => {
  it("explicit submit calls askDiagnosisQuestion(id, question, draft) once and renders question + answer", async () => {
    const { user, submit } = await ask("Why won't this run?");
    await user.click(submit);
    expect(mockAsk).toHaveBeenCalledTimes(1);
    const args = mockAsk.mock.calls[0];
    expect(args[0]).toBe("wf-1");
    expect(args[1]).toBe("Why won't this run?");
    // The current builder draft rides along (re-derivation only); no raw DTO is sent.
    expect(args[2]).toEqual(expect.objectContaining({ nodes: [], edges: [] }));
    // No selected node open → selectedNodeId omitted (undefined).
    expect(args[3]).toBeUndefined();

    const body = await screen.findByTestId("builder-ai-diagnosis-qa");
    expect(screen.getByTestId("builder-ai-diagnosis-qa-question").textContent).toContain("Why won't this run?");
    expect(screen.getByTestId("builder-ai-diagnosis-qa-answer").textContent).toContain("Reconnect Gmail");
    expect(body.textContent).toMatch(/wasn.t changed or run/i);
    // Composer cleared after the routed Q&A submit.
    expect((screen.getByTestId("builder-ai-prompt") as HTMLTextAreaElement).value).toBe("");
  });

  it("renders optional pointers safely", async () => {
    const { user, submit } = await ask("What should I fix first?");
    await user.click(submit);
    const pointers = await screen.findByTestId("builder-ai-diagnosis-qa-pointers");
    expect(pointers.textContent).toContain("Reconnect Gmail in Apps");
    expect(pointers.textContent).toContain("re-check the workflow");
  });

  it("renders the needsUserDecision indicator when the answer needs a user choice", async () => {
    mockAsk.mockResolvedValueOnce({
      ok: true,
      answer: "There are two valid recipients; pick which one you intend.",
      needsUserDecision: true,
    });
    const { user, submit } = await ask("Who should this email go to?");
    await user.click(submit);
    const note = await screen.findByTestId("builder-ai-diagnosis-qa-needs-decision");
    expect(note.textContent).toMatch(/decision only you can make/i);
  });

  it("forwards the currently-open config node as selectedNodeId (existing selection, never rendered)", async () => {
    useConfigSlice.getState().openNode({ nodeId: "node-abc", initialValues: {} });
    const { user, submit } = await ask("What's wrong with this step?");
    await user.click(submit);
    expect(mockAsk.mock.calls[0][3]).toBe("node-abc");
    // The selected node id is a hint only — it must NEVER appear in the rendered answer.
    const body = await screen.findByTestId("builder-ai-diagnosis-qa");
    expect(body.textContent ?? "").not.toContain("node-abc");
  });
});

describe("Workflow Q&A — failures render safe copy", () => {
  it("402 AI_CREDITS_EXHAUSTED renders the shared credit message", async () => {
    mockAsk.mockResolvedValueOnce({ ok: false, code: "AI_CREDITS_EXHAUSTED", message: "ignored" });
    const { user, submit } = await ask("Why?");
    await user.click(submit);
    const err = await screen.findByTestId("builder-ai-error-message");
    expect(err.textContent).toBe(AI_CREDITS_EXHAUSTED_MESSAGE);
  });

  it("403 ACCOUNT_PENDING_DELETION renders a safe account line, no internals", async () => {
    mockAsk.mockResolvedValueOnce({ ok: false, code: "ACCOUNT_PENDING_DELETION", message: "acct-SECRET frozen" });
    const { user, submit } = await ask("Why?");
    await user.click(submit);
    const err = await screen.findByTestId("builder-ai-error-message");
    expect(err.textContent).toContain("pending deletion");
    expect(err.textContent).not.toContain("acct-SECRET");
  });

  it("503 MODEL_FAILED / AI_GATE_ERROR render safe generic copy, no internals", async () => {
    mockAsk.mockResolvedValueOnce({ ok: false, code: "MODEL_FAILED", message: "boom: SECRET-INTERNAL" });
    const { user, submit } = await ask("Why?");
    await user.click(submit);
    const err = await screen.findByTestId("builder-ai-error-message");
    expect(err.textContent).toContain("Couldn’t answer that right now");
    expect(err.textContent).not.toContain("SECRET-INTERNAL");
    expect(err.textContent).not.toContain("MODEL_FAILED");
  });

  it("a transport throw (500) renders safe generic copy with no internals", async () => {
    mockAsk.mockRejectedValueOnce(new AiApiError("getServiceRoleClient: SECRET", 500));
    const { user, submit } = await ask("Why?");
    await user.click(submit);
    const err = await screen.findByTestId("builder-ai-error-message");
    expect(err.textContent).toContain("Couldn’t answer that right now");
    expect(err.textContent).not.toContain("SECRET");
  });

  it("a 401 transport throw renders a sign-in prompt", async () => {
    mockAsk.mockRejectedValueOnce(new AiApiError("unauthenticated", 401));
    const { user, submit } = await ask("Why?");
    await user.click(submit);
    const err = await screen.findByTestId("builder-ai-error-message");
    expect(err.textContent).toContain("sign in");
  });
});

describe("Workflow Q&A — no Apply/Preview + no-leak", () => {
  it("the answer bubble introduces no Apply or Preview control", async () => {
    const { user, submit } = await ask("Why won't this run?");
    await user.click(submit);
    await screen.findByTestId("builder-ai-diagnosis-qa");
    expect(screen.queryByTestId("builder-ai-apply-button")).toBeNull();
    expect(screen.queryByTestId("builder-ai-qa-apply")).toBeNull();
    expect(screen.queryByTestId("builder-ai-qa-preview")).toBeNull();
    // No Preview-fix affordance anywhere from the Q&A flow.
    expect(screen.queryByText(/preview fix/i)).toBeNull();
  });

  it("renders only the safe response fields — no ids / config / tokens reach the DOM", async () => {
    // A hostile mock that smuggles unsafe-looking strings outside the allow-listed fields.
    mockAsk.mockResolvedValueOnce({
      ok: true,
      answer: "Reconnect Gmail to fix it.",
      pointers: ["Open the Send Email step"],
      needsUserDecision: false,
      // Fields the body must ignore entirely:
      nodeId: "node-SECRET-ID",
      accountId: "acct-SECRET",
      token: "tok-SECRET",
      rawConfig: { apiKey: "key-SECRET" },
    });
    const { user, submit } = await ask("Why won't this run?");
    await user.click(submit);
    const body = await screen.findByTestId("builder-ai-diagnosis-qa");
    const t = body.textContent ?? "";
    for (const needle of ["node-SECRET-ID", "acct-SECRET", "tok-SECRET", "key-SECRET", "rawConfig", "{{"]) {
      expect(t).not.toContain(needle);
    }
    expect(t).toContain("Reconnect Gmail");
  });

  it("the Q&A answer siblings import no service or MCP module (uses lib/api/ai)", () => {
    const importSpec = /(?:import\s[^"']*?from\s*|import\s*|require\s*\(\s*)["']([^"']+)["']/g;
    for (const rel of [
      "features/workflow-builder/panels/_BuilderAiPanelDiagnosis.tsx",
      "features/workflow-builder/panels/_BuilderAiPanelDiagnosisMessages.ts",
    ]) {
      const src = readFileSync(resolve(process.cwd(), rel), "utf8");
      for (const m of src.matchAll(importSpec)) {
        expect(m[1]).not.toMatch(/^@\/services\//);
        expect(m[1]).not.toMatch(/scripts\/mcp/);
      }
    }
  });
});

describe("Workflow Q&A — Explain regression", () => {
  it("Explain with AI still works alongside the one composer", async () => {
    mockDiagnose.mockResolvedValue({
      workflowId: "wf-1",
      access: "OK",
      overallReady: false,
      summaryText: "This workflow can't run yet because Gmail isn't connected.",
      nextSteps: ["Reconnect Gmail."],
      findings: [{ source: "connection", code: "DISCONNECTED", severity: "error", title: "x", provider: "gmail" }],
    });
    mockExplain.mockResolvedValue({ ok: true, explanation: "Gmail isn't connected." });
    const user = userEvent.setup();
    render(<BuilderAiPanel />);
    await user.click(screen.getByTestId("builder-ai-check-button"));
    await screen.findByTestId("builder-ai-diagnosis");
    await user.click(screen.getByTestId("builder-ai-explain-button"));
    expect(mockExplain).toHaveBeenCalledTimes(1);
    await screen.findByTestId("builder-ai-diagnosis-explanation");
  });
});
