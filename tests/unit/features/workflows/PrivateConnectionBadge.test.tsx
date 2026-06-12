/**
 * Tests for features/workflows/PrivateConnectionBadge (Slice 4.WF-RUNPERM).
 * The badge must carry the safe duplicate-hint copy and NO credential detail.
 */
import { render, screen } from "@testing-library/react";
import { PrivateConnectionBadge } from "@/features/workflows/PrivateConnectionBadge";

describe("PrivateConnectionBadge", () => {
  it("renders the abstract label + safe duplicate-hint tooltip", () => {
    render(<PrivateConnectionBadge />);
    const badge = screen.getByTestId("workflow-private-connection-badge");
    expect(badge).toHaveTextContent("Private connection");
    expect(badge).toHaveAttribute(
      "title",
      "This workflow runs with the creator's private connection. Duplicate it to use your own connection.",
    );
  });

  it("NO LEAK: no provider id, email, account label, scope, or token in the rendered output", () => {
    const { container } = render(<PrivateConnectionBadge />);
    const text = (container.textContent ?? "") + " " + (container.innerHTML ?? "");
    expect(text).not.toMatch(/gmail|outlook|@|xox|token|scope|account-?id|provider/i);
  });
});
