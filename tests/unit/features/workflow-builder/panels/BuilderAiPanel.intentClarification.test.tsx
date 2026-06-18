/**
 * Tests for the intent-clarification message kind + renderer
 * (Slice 4.AI-DIAG-QA-AUTOROUTE-1, CS-2).
 *
 * CS-2 adds the session-local `intent_clarification` bubble (copy + two quick
 * actions) and its dispatch in the message feed — NO composer routing yet. These
 * tests pin: the bubble renders in the feed via MessageItem; the copy + both
 * accessible buttons render; the quick-action callbacks fire with the message id;
 * resolved disables both buttons; the message is never persisted/rehydrated; there
 * are no Apply/Preview controls; no raw ids/secrets from the (un-rendered) retained
 * prompt reach the DOM; and the existing diagnosis_qa bubble still renders.
 */
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MessageItem } from "@/features/workflow-builder/panels/_BuilderAiPanelMessageItem";
import { IntentClarificationBody } from "@/features/workflow-builder/panels/_BuilderAiPanelClarification";
import {
  persistedMessageToChat,
  type ChatMessage,
} from "@/features/workflow-builder/panels/_BuilderAiPanelChat";

// A complete MessageItem prop set; per-test we override `message` + the handlers we assert.
function baseItemProps() {
  return {
    latestPlanMessageId: null,
    latestDiagnosisMessageId: null,
    latestRepairProposalMessageId: null,
    latestRepairPreviewMessageId: null,
    repairGoToNodeId: null,
    applying: false,
    busy: false,
    riskAcknowledged: false,
    onRiskAcknowledgeChange: jest.fn(),
    onApply: jest.fn(),
    onRerunPlan: jest.fn(),
    onReset: jest.fn(),
    stagedAnswers: new Map(),
    onStagedAnswerChange: jest.fn(),
    onSubmitDetails: jest.fn(),
    canSubmitDetails: false,
    submittingDetails: false,
    onExplainDiagnosis: jest.fn(),
    explaining: false,
    explainedDiagnosisIds: new Set<string>(),
    onSuggestFix: jest.fn(),
    suggesting: false,
    suggestedDiagnosisIds: new Set<string>(),
    onPreviewFix: jest.fn(),
    previewing: false,
    previewedProposalIds: new Set<string>(),
    onPreviewSelectedFix: jest.fn(),
    onPreviewDanglingEdgeFix: jest.fn(),
    onPreviewSelfLoopEdgeFix: jest.fn(),
    onPreviewDuplicateEdgeFix: jest.fn(),
    onApplyRepair: jest.fn(),
    applyingId: null,
    appliedPreviewIds: new Set<string>(),
    applyErrorByPreviewId: new Map<string, string>(),
    onConfirmFill: jest.fn(),
    onCancelFill: jest.fn(),
    resolvedFillIds: new Set<string>(),
    onClarifyExplain: jest.fn(),
    onClarifyPlan: jest.fn(),
    resolvedClarificationIds: new Set<string>(),
  };
}

describe("IntentClarificationBody — renderer", () => {
  it("renders the clarification copy + both quick actions with accessible names", () => {
    render(<IntentClarificationBody resolved={false} onExplain={jest.fn()} onPlan={jest.fn()} />);
    expect(screen.getByTestId("builder-ai-intent-clarification").textContent).toMatch(
      /explain what.?s wrong, or i can plan changes to fix it/i,
    );
    expect(screen.getByRole("button", { name: "Explain the issue" })).toBeEnabled();
    expect(screen.getByRole("button", { name: "Plan a fix" })).toBeEnabled();
  });

  it("fires the typed callbacks on click", async () => {
    const onExplain = jest.fn();
    const onPlan = jest.fn();
    const user = userEvent.setup();
    render(<IntentClarificationBody resolved={false} onExplain={onExplain} onPlan={onPlan} />);
    await user.click(screen.getByTestId("builder-ai-clarify-explain"));
    await user.click(screen.getByTestId("builder-ai-clarify-plan"));
    expect(onExplain).toHaveBeenCalledTimes(1);
    expect(onPlan).toHaveBeenCalledTimes(1);
  });

  it("disables both buttons once resolved", () => {
    render(<IntentClarificationBody resolved onExplain={jest.fn()} onPlan={jest.fn()} />);
    expect(screen.getByTestId("builder-ai-clarify-explain")).toBeDisabled();
    expect(screen.getByTestId("builder-ai-clarify-plan")).toBeDisabled();
  });

  it("introduces NO Apply / Preview / Save / Run control", () => {
    render(<IntentClarificationBody resolved={false} onExplain={jest.fn()} onPlan={jest.fn()} />);
    expect(screen.queryByTestId("builder-ai-apply-button")).toBeNull();
    expect(screen.queryByText(/preview fix/i)).toBeNull();
    expect(screen.queryByText(/\bapply\b/i)).toBeNull();
    expect(screen.queryByText(/\bsave\b/i)).toBeNull();
    expect(screen.queryByText(/\brun\b/i)).toBeNull();
  });
});

describe("intent_clarification in the message feed (MessageItem dispatch)", () => {
  const clarification: ChatMessage = {
    id: "m-clar-1",
    role: "assistant",
    kind: "intent_clarification",
    prompt: "Fix this", // retained for CS-3; must NOT be rendered
  };

  it("renders the clarification bubble for an intent_clarification message", () => {
    render(<MessageItem {...baseItemProps()} message={clarification} />);
    expect(screen.getByTestId("builder-ai-intent-clarification")).not.toBeNull();
    expect(screen.getByTestId("builder-ai-clarify-explain")).not.toBeNull();
    expect(screen.getByTestId("builder-ai-clarify-plan")).not.toBeNull();
  });

  it("the quick actions call the handlers with the message id", async () => {
    const props = baseItemProps();
    const user = userEvent.setup();
    render(<MessageItem {...props} message={clarification} />);
    await user.click(screen.getByTestId("builder-ai-clarify-explain"));
    expect(props.onClarifyExplain).toHaveBeenCalledWith("m-clar-1");
    await user.click(screen.getByTestId("builder-ai-clarify-plan"));
    expect(props.onClarifyPlan).toHaveBeenCalledWith("m-clar-1");
  });

  it("buttons disable when the id is in resolvedClarificationIds", () => {
    const props = baseItemProps();
    props.resolvedClarificationIds = new Set(["m-clar-1"]);
    render(<MessageItem {...props} message={clarification} />);
    expect(screen.getByTestId("builder-ai-clarify-explain")).toBeDisabled();
    expect(screen.getByTestId("builder-ai-clarify-plan")).toBeDisabled();
  });

  it("does NOT echo the retained prompt (no raw text/ids/secrets reach the DOM)", () => {
    const hostile: ChatMessage = {
      id: "m-clar-2",
      role: "assistant",
      kind: "intent_clarification",
      prompt: "node-SECRET-ID acct-SECRET tok-SECRET {{n1.value}}",
    };
    render(<MessageItem {...baseItemProps()} message={hostile} />);
    const t = screen.getByTestId("builder-ai-intent-clarification").textContent ?? "";
    for (const needle of ["node-SECRET-ID", "acct-SECRET", "tok-SECRET", "{{"]) {
      expect(t).not.toContain(needle);
    }
  });
});

describe("intent_clarification persistence + regression", () => {
  it("is NOT rehydrated by persistedMessageToChat (session-local only)", () => {
    const persisted = persistedMessageToChat({
      id: "p1",
      role: "assistant",
      // a record claiming the clarification kind must not round-trip into the feed
      kind: "intent_clarification" as never,
      content: "Fix this",
      safePayload: {},
      createdAt: "now",
    } as never);
    expect(persisted).toBeNull();
  });

  it("the existing diagnosis_qa bubble still renders via MessageItem", () => {
    const qa: ChatMessage = {
      id: "m-qa-1",
      role: "assistant",
      kind: "diagnosis_qa",
      question: "Why won't this run?",
      answer: "Gmail isn't connected.",
    };
    render(<MessageItem {...baseItemProps()} message={qa} />);
    expect(screen.getByTestId("builder-ai-diagnosis-qa")).not.toBeNull();
    expect(screen.getByTestId("builder-ai-diagnosis-qa-answer").textContent).toContain(
      "Gmail isn't connected",
    );
  });
});
