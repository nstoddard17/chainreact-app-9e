/**
 * 4.TEAM-WORKFLOWS-2 (TW-2) — the AI required-input options control threads the
 * open workflow's id (from graphSlice) into useOptionsSource, and renders the
 * owner-gated credential states distinctly.
 *
 * useOptionsSource is mocked so we drive its discriminated state directly.
 */
const mockUseOptionsSource = jest.fn();
jest.mock("@/features/workflow-builder/hooks/useOptionsSource", () => ({
  __esModule: true,
  useOptionsSource: (...args: unknown[]) => mockUseOptionsSource(...args),
}));

import { render, screen } from "@testing-library/react";
import type { AiRequiredUserInput } from "@/lib/api/ai";
import type { UseOptionsSourceState } from "@/features/workflow-builder/hooks/useOptionsSource";
import { RequiredInputOptionsSourceControl } from "@/features/workflow-builder/ai/RequiredInputOptionsSourceControl";
import { useGraphSlice } from "@/features/workflow-builder/state/graphSlice";

function input(overrides: Partial<AiRequiredUserInput> = {}): AiRequiredUserInput {
  return {
    key: "channelId",
    label: "Channel",
    optionsSource: "slack:channels",
    ...overrides,
  } as AiRequiredUserInput;
}

function setHookState(state: UseOptionsSourceState): void {
  mockUseOptionsSource.mockReturnValue({ state, refetch: jest.fn() });
}

function renderControl(): void {
  render(
    <RequiredInputOptionsSourceControl
      input={input()}
      answer={undefined}
      onChange={jest.fn()}
      inputKey="channelId"
      fieldLabel="Channel"
      placeholderText="Search…"
      deps={undefined}
    />,
  );
}

beforeEach(() => {
  mockUseOptionsSource.mockReset();
  useGraphSlice.getState().reset();
});

describe("RequiredInputOptionsSourceControl — TW-2 workflow context", () => {
  it("threads the open workflow's id into useOptionsSource", () => {
    useGraphSlice.getState().hydrate("wf-9", { nodes: [], edges: [] });
    setHookState({ status: "idle", items: [], hasMore: false });
    renderControl();
    expect(mockUseOptionsSource).toHaveBeenCalledWith(
      expect.objectContaining({ source: "slack:channels", workflowId: "wf-9" }),
    );
  });

  it("omits workflowId when no workflow is loaded", () => {
    setHookState({ status: "idle", items: [], hasMore: false });
    renderControl();
    const arg = mockUseOptionsSource.mock.calls[0]![0];
    expect(arg).not.toHaveProperty("workflowId");
  });

  it("renders the owner-gated message (non-creator) distinctly", () => {
    setHookState({
      status: "owner-gated",
      items: [],
      hasMore: false,
      provider: "gmail",
      message: "This step runs under the workflow owner's gmail connection.",
    });
    renderControl();
    expect(
      screen.getByTestId("builder-ai-required-input-owner-gated"),
    ).toHaveTextContent(/workflow owner/i);
  });

  it("renders the owner-must-connect message distinctly", () => {
    setHookState({
      status: "owner-must-connect",
      items: [],
      hasMore: false,
      provider: "gmail",
      message: "Connect gmail to configure and run this workflow.",
    });
    renderControl();
    expect(
      screen.getByTestId("builder-ai-required-input-owner-must-connect"),
    ).toHaveTextContent(/Connect gmail/i);
  });
});
