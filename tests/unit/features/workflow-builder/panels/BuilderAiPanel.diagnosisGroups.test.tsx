/**
 * Integration test for CHECK-ACTIONS-2 — the Check workflow result reads as a grouped
 * health panel. A single deterministic check renders the type-specific groups together
 * with clear headings + helper text:
 *   - "Needs your input"  (missing field → Open field)        "Fill these fields…"
 *   - "Needs setup"       (connection/auth → Apps link)        "Reconnect or update app access."
 *   - "Needs attention"   (structural/run → guidance, no button) "Review these issues manually."
 *   - "AI can help"       (Explain / Suggest — visually separate, optional)
 *
 * Renders the real BuilderAiPanel with `@/lib/api/ai` + `@/lib/api/workflows` mocked
 * (no network). Proves the groups coexist cleanly, the redundant generic "Next steps"
 * list is suppressed (no duplicate copy), the AI affordances are separated from the
 * deterministic actions, and the check consumes NO model round-trip / AI credit.
 */
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ActionMeta } from "@/contracts/actionMeta";

const mockDiagnose = jest.fn();
const mockRepair = jest.fn();
const mockPreview = jest.fn();
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
    previewWorkflowRepair: (...a: unknown[]) => mockPreview(...a),
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

const SLACK_META = {
  key: "slack:send_channel_message",
  provider: "slack",
  type: "send_channel_message",
  displayName: "Send Channel Message",
  description: "Post a message",
  category: "messaging",
  requiresIntegration: true,
  fields: [
    { name: "channel", label: "Channel", type: "combobox", required: true },
    { name: "text", label: "Message", type: "textarea", required: true },
  ],
  outputs: [],
  producesFileRef: false,
  consumesFileRef: false,
  displayOrder: null,
  isDestructive: false,
  requiresConfirmation: false,
} as unknown as ActionMeta;

jest.mock("@/features/workflow-builder/hooks/useNativeActions", () => ({
  useNativeActions: () => ({ actions: [], loading: false, error: null }),
  findNativeActionByKey: () => undefined,
}));
jest.mock("@/features/workflow-builder/hooks/useNativeTriggers", () => ({
  useNativeTriggers: () => ({ triggers: [], loading: false, error: null }),
  findNativeTriggerByKey: () => undefined,
}));
jest.mock("@/features/workflow-builder/hooks/useProviderActions", () => ({
  useProviderActions: () => ({ actions: [SLACK_META], loading: false, error: null }),
  findProviderActionByKey: (actions: ActionMeta[], key: string) => actions.find((a) => a.key === key),
}));
jest.mock("@/features/workflow-builder/hooks/useProviderTriggers", () => ({
  useProviderTriggers: () => ({ triggers: [], loading: false, error: null }),
  findProviderTriggerByKey: () => undefined,
}));

import { BuilderAiPanel } from "@/features/workflow-builder/panels/BuilderAiPanel";
import { useGraphSlice } from "@/features/workflow-builder/state/graphSlice";
import { useConfigSlice } from "@/features/workflow-builder/state/configSlice";

const SLACK_NODE = {
  id: "slack1",
  kind: "action" as const,
  provider: "slack",
  type: "send_channel_message",
  config: { channel: "C1", text: "" }, // Message empty → the targetable missing field
  position: { x: 0, y: 0 },
};

// A check result spanning THREE deterministic groups: a missing field, a Slack
// reconnect/connection problem, and a structural (graph) issue.
const groupedDiagnosis = {
  workflowId: "wf-1",
  access: "OK",
  overallReady: false,
  summaryText:
    "This workflow can't run yet because its configuration is incomplete and one or more providers aren't connected.",
  nextSteps: [
    "Fill in the required fields on the flagged nodes.",
    "Reconnect Slack.",
    "Add a trigger to start the workflow.",
  ],
  findings: [
    {
      source: "field",
      code: "MISSING_REQUIRED_FIELD",
      severity: "error",
      title: "Required fields are missing.",
      nodeIds: ["slack1"],
      nodeLabels: ["Send Channel Message"],
      missingFields: ["Message"],
    },
    {
      source: "connection",
      code: "RECONNECT_REQUIRED",
      severity: "error",
      title: "The connection expired and needs reconnecting.",
      provider: "slack",
      providerName: "Slack",
      nodeIds: ["slack1"],
      credentialClass: "account",
    },
    {
      source: "graph",
      code: "no_trigger",
      severity: "error",
      title: "The workflow has no trigger.",
    },
  ],
};

beforeEach(() => {
  mockDiagnose.mockReset();
  mockDiagnose.mockResolvedValue(groupedDiagnosis);
  mockRepair.mockReset();
  mockPreview.mockReset();
  mockExplain.mockReset();
  mockGetThread.mockReset();
  mockGetThread.mockResolvedValue({ thread: { id: "t", workflowId: "wf-1", createdAt: "now", updatedAt: "now" }, messages: [] });
  mockAppendThreadMessage.mockReset();
  mockAppendThreadMessage.mockResolvedValue({ id: "m", role: "user", kind: "prompt", content: "", safePayload: {}, createdAt: "now" });
  mockClearThread.mockReset();
  mockClearThread.mockResolvedValue({ ok: true, deletedCount: 0 });
  mockGetWorkflow.mockReset();
  useConfigSlice.getState().reset();
  useGraphSlice.getState().reset();
  useGraphSlice.getState().hydrate("wf-1", { nodes: [SLACK_NODE], edges: [] }, "rev-1");
});

async function check() {
  const user = userEvent.setup();
  render(<BuilderAiPanel />);
  await user.click(screen.getByTestId("builder-ai-check-button"));
  await screen.findByTestId("builder-ai-diagnosis");
  return user;
}

describe("Check workflow → grouped health panel (CHECK-ACTIONS-2)", () => {
  it("renders all three deterministic groups with headings + helper text", async () => {
    await check();

    const input = screen.getByTestId("builder-ai-diagnosis-open-field");
    expect(input.textContent).toContain("Needs your input");
    expect(input.textContent).toContain("Fill these fields before this workflow can run.");
    expect(screen.getByTestId("builder-ai-diagnosis-open-field-button").textContent).toBe("Open Message field");

    const setup = screen.getByTestId("builder-ai-diagnosis-setup");
    expect(setup.textContent).toContain("Needs setup");
    expect(setup.textContent).toContain("Reconnect or update app access.");
    expect(screen.getByTestId("builder-ai-diagnosis-setup-link").textContent).toBe("Reconnect Slack in Apps");

    const attention = screen.getByTestId("builder-ai-diagnosis-attention");
    expect(attention.textContent).toContain("Needs attention");
    expect(attention.textContent).toContain("Review these issues manually.");
    expect(attention.textContent).toContain("Add a trigger");
  });

  it("suppresses the redundant generic 'Next steps' list (no duplicate copy)", async () => {
    await check();
    expect(screen.queryByTestId("builder-ai-diagnosis-next-steps")).toBeNull();
  });

  it("AI affordances are grouped + visually separate from deterministic actions", async () => {
    await check();
    const aiHelp = screen.getByTestId("builder-ai-diagnosis-ai-help");
    expect(aiHelp.textContent).toContain("AI can help");
    // Suggest + Explain live INSIDE the separated AI section, not beside the free actions.
    expect(aiHelp.querySelector('[data-testid="builder-ai-suggest-fix-button"]')).not.toBeNull();
    expect(aiHelp.querySelector('[data-testid="builder-ai-explain-button"]')).not.toBeNull();
    // The deterministic open-field action is NOT inside the AI section.
    expect(aiHelp.querySelector('[data-testid="builder-ai-diagnosis-open-field-button"]')).toBeNull();
    expect(screen.getByTestId("builder-ai-suggest-fix-button")).toBeEnabled();
  });

  it("consumes NO model call and shows no Apply control", async () => {
    await check();
    expect(mockDiagnose).toHaveBeenCalledTimes(1);
    expect(mockRepair).not.toHaveBeenCalled();
    expect(mockPreview).not.toHaveBeenCalled();
    expect(mockExplain).not.toHaveBeenCalled();
    expect(screen.queryByTestId("builder-ai-apply-button")).toBeNull();
  });

  it("renders no raw node id / field key / provider code in any group", async () => {
    await check();
    const body = (await screen.findByTestId("builder-ai-diagnosis")).textContent ?? "";
    expect(body).not.toContain("slack1");
    expect(body).not.toContain("RECONNECT_REQUIRED");
    expect(body).not.toContain("no_trigger");
    expect(body).not.toMatch(/\btext\b/); // the field KEY; label "Message" is shown instead
  });
});

describe("Check workflow → single-group results render cleanly (CHECK-ACTIONS-2)", () => {
  it("only a missing field → Needs your input, no setup/attention groups", async () => {
    mockDiagnose.mockResolvedValue({
      workflowId: "wf-1",
      access: "OK",
      overallReady: false,
      summaryText: "Send Channel Message is missing its Message.",
      nextSteps: ["Fill in the required fields on the flagged nodes."],
      findings: [groupedDiagnosis.findings[0]],
    });
    await check();
    expect(screen.getByTestId("builder-ai-diagnosis-open-field")).toBeInTheDocument();
    expect(screen.queryByTestId("builder-ai-diagnosis-setup")).toBeNull();
    expect(screen.queryByTestId("builder-ai-diagnosis-attention")).toBeNull();
  });

  it("only a setup issue → Needs setup, no input/attention groups", async () => {
    mockDiagnose.mockResolvedValue({
      workflowId: "wf-1",
      access: "OK",
      overallReady: false,
      summaryText: "Slack needs reconnecting.",
      nextSteps: ["Reconnect Slack."],
      findings: [groupedDiagnosis.findings[1]],
    });
    await check();
    expect(screen.getByTestId("builder-ai-diagnosis-setup")).toBeInTheDocument();
    expect(screen.queryByTestId("builder-ai-diagnosis-open-field")).toBeNull();
    expect(screen.queryByTestId("builder-ai-diagnosis-attention")).toBeNull();
  });

  it("a non-targetable structural issue → Needs attention guidance, no broken button", async () => {
    mockDiagnose.mockResolvedValue({
      workflowId: "wf-1",
      access: "OK",
      overallReady: false,
      summaryText: "The workflow has no trigger.",
      nextSteps: ["Add a trigger to start the workflow."],
      findings: [groupedDiagnosis.findings[2]],
    });
    await check();
    const attention = screen.getByTestId("builder-ai-diagnosis-attention");
    expect(attention.textContent).toContain("Add a trigger");
    expect(attention.querySelector("button")).toBeNull();
    expect(attention.querySelector("a")).toBeNull();
    expect(screen.queryByTestId("builder-ai-diagnosis-open-field")).toBeNull();
    expect(screen.queryByTestId("builder-ai-diagnosis-setup")).toBeNull();
  });
});
