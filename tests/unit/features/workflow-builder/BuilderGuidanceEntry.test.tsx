/**
 * BuilderGuidanceEntry — builder-context "Build with me" advisory entry
 * (HERMES-AGENT-GUIDANCE-UI-BUILDER).
 *
 * Proves: starts collapsed (panel hidden) so it never obscures the canvas; the toggle reveals the
 * reused WorkflowGuidancePanel; submit forwards the builder `workflowId` (+ accountId) to the
 * existing route helper; a successful response renders guidanceText; a route/transport failure shows
 * ONLY safe copy. The wrapper reuses the dashboard panel verbatim — request/render behavior is the
 * panel's; this file pins the builder-specific glue (collapsed-by-default + workflowId threading).
 */
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const mockRequest = jest.fn();
jest.mock("@/lib/api/ai/guidance", () => ({
  requestWorkflowGuidance: (...a: unknown[]) => mockRequest(...a),
}));

import { BuilderGuidanceEntry } from "@/features/workflow-builder/panels/BuilderGuidanceEntry";

beforeEach(() => {
  mockRequest.mockReset();
});

describe("BuilderGuidanceEntry — collapsed entry", () => {
  it("renders the 'Build with me' toggle and starts collapsed (no panel)", () => {
    render(<BuilderGuidanceEntry accountId="acct-1" workflowId="wf-9" />);
    const toggle = screen.getByTestId("builder-guidance-toggle");
    expect(toggle).toHaveTextContent("Build with me");
    expect(toggle).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByTestId("workflow-guidance-panel")).not.toBeInTheDocument();
  });

  it("opening the toggle reveals the reused guidance panel", async () => {
    const user = userEvent.setup();
    render(<BuilderGuidanceEntry accountId="acct-1" workflowId="wf-9" />);
    await user.click(screen.getByTestId("builder-guidance-toggle"));
    expect(screen.getByTestId("workflow-guidance-panel")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Build with me" })).toBeInTheDocument();
    expect(screen.getByTestId("builder-guidance-toggle")).toHaveAttribute("aria-expanded", "true");
  });
});

describe("BuilderGuidanceEntry — request from builder context", () => {
  it("submit forwards the builder workflowId + accountId to the route helper", async () => {
    const user = userEvent.setup();
    mockRequest.mockResolvedValue({ ok: true, guidanceText: "ok", source: "hermes-agent", workflowPlan: null });
    render(<BuilderGuidanceEntry accountId="acct-1" workflowId="wf-9" />);
    await user.click(screen.getByTestId("builder-guidance-toggle"));
    await user.type(screen.getByPlaceholderText(/Example:/i), "finish this workflow for me");
    await user.click(screen.getByTestId("workflow-guidance-submit"));
    await waitFor(() =>
      expect(mockRequest).toHaveBeenCalledWith({
        accountId: "acct-1",
        goalText: "finish this workflow for me",
        workflowId: "wf-9",
      }),
    );
  });

  it("success renders guidanceText under 'Guidance'", async () => {
    const user = userEvent.setup();
    mockRequest.mockResolvedValue({
      ok: true,
      guidanceText: "Add a delay before the follow-up step.",
      source: "hermes-agent",
      workflowPlan: null,
    });
    render(<BuilderGuidanceEntry accountId="acct-1" workflowId="wf-9" />);
    await user.click(screen.getByTestId("builder-guidance-toggle"));
    await user.type(screen.getByPlaceholderText(/Example:/i), "improve this");
    await user.click(screen.getByTestId("workflow-guidance-submit"));
    await waitFor(() => expect(screen.getByTestId("workflow-guidance-result")).toBeInTheDocument());
    expect(screen.getByText("Add a delay before the follow-up step.")).toBeInTheDocument();
  });

  it("route failure shows ONLY safe copy, never internal detail", async () => {
    const user = userEvent.setup();
    mockRequest.mockRejectedValue(new Error("AI request failed (HTTP 500): SECRET-INTERNAL"));
    render(<BuilderGuidanceEntry accountId="acct-1" workflowId="wf-9" />);
    await user.click(screen.getByTestId("builder-guidance-toggle"));
    await user.type(screen.getByPlaceholderText(/Example:/i), "improve this");
    await user.click(screen.getByTestId("workflow-guidance-submit"));
    const err = await screen.findByTestId("workflow-guidance-error");
    expect(err).toHaveTextContent("AI workflow guidance is temporarily unavailable.");
    expect(err).not.toHaveTextContent("SECRET-INTERNAL");
  });
});
