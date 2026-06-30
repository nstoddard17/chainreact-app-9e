/**
 * AgentReadinessSummary — the React Agent readiness verdict header (REACT-AGENT-READINESS-1).
 *
 * The panel is presentational: it renders the pre-computed verdict from
 * `computeAgentReadiness`. These tests protect: the status pill + summary render,
 * blockers are GROUPED BY TYPE with their next steps, a "Ready after" checklist
 * appears, the `unknown` verdict renders nothing, compact mode hides group detail,
 * and no raw value/secret ever reaches the DOM.
 */
import { render, screen } from "@testing-library/react";
import { AgentReadinessSummary } from "@/features/workflow-builder/panels/AgentReadinessSummary";
import type { AgentReadinessVerdict } from "@/core/workflows/agentReadiness";

function verdict(over: Partial<AgentReadinessVerdict> = {}): AgentReadinessVerdict {
  return {
    status: "not_ready",
    title: "Not ready yet",
    summary: "Gmail needs a To.",
    blockers: [],
    warnings: [],
    nextActions: [],
    lastTestStatus: "not_tested",
    ...over,
  };
}

describe("AgentReadinessSummary", () => {
  it("renders nothing for an unknown (no-change) verdict", () => {
    const { container } = render(
      <AgentReadinessSummary verdict={verdict({ status: "unknown", title: "Readiness unavailable" })} />,
    );
    expect(container).toBeEmptyDOMElement();
  });

  it("shows the status pill and one-line summary", () => {
    render(<AgentReadinessSummary verdict={verdict({ status: "ready_to_test", title: "Ready to test", summary: "All set." })} />);
    expect(screen.getByTestId("agent-readiness")).toHaveAttribute("data-status", "ready_to_test");
    expect(screen.getByTestId("agent-readiness-pill")).toHaveTextContent("Ready to test");
    expect(screen.getByTestId("agent-readiness-summary")).toHaveTextContent("All set.");
  });

  it("groups blockers by type and shows a Ready after checklist", () => {
    render(
      <AgentReadinessSummary
        verdict={verdict({
          status: "blocked",
          title: "Blocked",
          summary: "2 issues to resolve.",
          blockers: [
            { kind: "missing_required_field", message: "Gmail needs a To.", nextStep: "Fill in the required field, then check again.", blocking: true, nodeId: "n1" },
            { kind: "missing_connection", message: "Slack isn't connected.", nextStep: "Connect Slack in Apps.", blocking: true, nodeId: "n2" },
          ],
          nextActions: ["fill_missing_fields", "connect_app"],
        })}
      />,
    );
    expect(screen.getByTestId("agent-readiness-group-fields")).toBeInTheDocument();
    expect(screen.getByTestId("agent-readiness-group-connection")).toBeInTheDocument();
    expect(screen.getAllByTestId("agent-readiness-blocker")).toHaveLength(2);
    const steps = screen.getAllByTestId("agent-readiness-next-step").map((el) => el.textContent);
    expect(steps).toEqual(
      expect.arrayContaining(["Fill in the required field, then check again.", "Connect Slack in Apps."]),
    );
  });

  it("compact mode shows the pill + summary but hides the blocker group detail", () => {
    render(
      <AgentReadinessSummary
        compact
        verdict={verdict({
          status: "blocked",
          blockers: [
            { kind: "missing_connection", message: "Slack isn't connected.", nextStep: "Connect Slack in Apps.", blocking: true },
          ],
        })}
      />,
    );
    expect(screen.getByTestId("agent-readiness-pill")).toBeInTheDocument();
    expect(screen.queryByTestId("agent-readiness-blockers")).not.toBeInTheDocument();
  });

  it("never renders a raw config value or secret (no-leak)", () => {
    const { container } = render(
      <AgentReadinessSummary
        verdict={verdict({
          status: "blocked",
          blockers: [
            { kind: "invalid_connection", message: "Slack: the connection expired.", nextStep: "Reconnect Slack in Apps.", blocking: true },
          ],
        })}
      />,
    );
    const html = container.innerHTML.toLowerCase();
    for (const forbidden of ["token", "bearer", "secret", "password", "xoxb"]) {
      expect(html).not.toContain(forbidden);
    }
  });
});
