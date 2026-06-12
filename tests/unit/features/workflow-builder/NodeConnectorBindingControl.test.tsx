/**
 * Tests for features/workflow-builder/config-modal/NodeConnectorBindingControl
 * (Slice 4.CONN-SHARE / CS-5b). Mocks the typed client so no real fetch happens.
 * Asserts the per-status copy/controls, that Save/Clear call the binding routes,
 * the invalid (unavailable) state, and a no-leak check (display names only).
 */
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const mockFetch = jest.fn();
const mockSet = jest.fn();
const mockClear = jest.fn();
jest.mock("@/lib/api/connectorBindings", () => ({
  fetchNodeConnectorBindingState: (...a: unknown[]) => mockFetch(...a),
  setNodeConnectorBinding: (...a: unknown[]) => mockSet(...a),
  clearNodeConnectorBinding: (...a: unknown[]) => mockClear(...a),
}));

import { NodeConnectorBindingControl } from "@/features/workflow-builder/config-modal/NodeConnectorBindingControl";

function renderControl() {
  render(<NodeConnectorBindingControl workflowId="wf-1" nodeId="node-7" />);
}

beforeEach(() => {
  jest.clearAllMocks();
  mockSet.mockResolvedValue({ ok: true });
  mockClear.mockResolvedValue({ ok: true });
});

describe("NodeConnectorBindingControl", () => {
  it.each(["not_applicable", "single_sharer"])("%s → renders nothing", async (status) => {
    mockFetch.mockResolvedValue({ status, connectors: [], currentConnectorDisplayName: "Alice" });
    renderControl();
    await waitFor(() => expect(mockFetch).toHaveBeenCalled());
    expect(screen.queryByTestId("connector-binding-control")).toBeNull();
  });

  it("needs_selection → ambiguous copy + safe options; Save binds the chosen connector", async () => {
    mockFetch.mockResolvedValueOnce({
      status: "needs_selection",
      connectors: [
        { userId: "alice", displayName: "Alice", role: "owner" },
        { userId: "bob", displayName: "Bob", role: "member" },
      ],
      currentConnectorDisplayName: null,
    });
    // After save, the control refetches → return a bound state.
    mockFetch.mockResolvedValueOnce({ status: "bound", connectors: [], currentConnectorDisplayName: "Bob" });
    renderControl();

    expect(await screen.findByTestId("connector-binding-picker")).toHaveTextContent(
      "Multiple team members shared this connection. Choose which one this node should use.",
    );
    await userEvent.selectOptions(screen.getByTestId("connector-binding-select"), "bob");
    await userEvent.click(screen.getByTestId("connector-binding-save"));
    expect(mockSet).toHaveBeenCalledWith("wf-1", "node-7", "bob");
  });

  it("bound → 'Using shared connection from {name}'; Stop using clears the binding", async () => {
    mockFetch.mockResolvedValueOnce({ status: "bound", connectors: [], currentConnectorDisplayName: "Alice" });
    mockFetch.mockResolvedValueOnce({ status: "needs_selection", connectors: [], currentConnectorDisplayName: null });
    renderControl();

    expect(await screen.findByTestId("connector-binding-bound")).toHaveTextContent(
      "Using shared connection from Alice.",
    );
    await userEvent.click(screen.getByTestId("connector-binding-clear"));
    expect(mockClear).toHaveBeenCalledWith("wf-1", "node-7");
  });

  it("unavailable → safe 'no longer available' copy + re-pick (never silently another connector)", async () => {
    mockFetch.mockResolvedValue({
      status: "unavailable",
      connectors: [{ userId: "bob", displayName: "Bob", role: "member" }],
      currentConnectorDisplayName: null,
    });
    renderControl();
    expect(await screen.findByTestId("connector-binding-picker")).toHaveTextContent(
      "This shared connection is no longer available. Choose another connection.",
    );
    // No auto-selection — the select starts at the placeholder.
    expect((screen.getByTestId("connector-binding-select") as HTMLSelectElement).value).toBe("");
  });

  it("NO LEAK: only display names appear (no email/provider account id)", async () => {
    mockFetch.mockResolvedValue({
      status: "needs_selection",
      connectors: [{ userId: "alice", displayName: "Alice", role: "owner" }],
      currentConnectorDisplayName: null,
    });
    const { container } = render(<NodeConnectorBindingControl workflowId="wf-1" nodeId="node-7" />);
    await screen.findByTestId("connector-binding-picker");
    expect(container.textContent ?? "").not.toMatch(/@|token|scope|T-WORKSPACE/i);
  });
});
