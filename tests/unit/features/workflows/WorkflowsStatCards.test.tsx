/**
 * Tests for features/workflows/WorkflowsStatCards.
 *
 * Asserts the dashboard's four stat cards (Slice 4.WORKFLOWS-PAGE-1) are
 * derived from real list data (counts + lifetime run aggregates) — never
 * mock data and never time-bucketed "today" copy.
 */
import { render, screen } from "@testing-library/react";
import { WorkflowsStatCards } from "@/features/workflows/WorkflowsStatCards";
import type { WorkflowListItem } from "@/contracts/workflow";

function wf(
  id: string,
  state: WorkflowListItem["state"],
  total: number,
  succeeded: number,
): WorkflowListItem {
  return {
    id,
    name: `wf-${id}`,
    state,
    disabledReason: null,
    disabledContext: null,
    deletedAt: null,
    folderId: null,
    createdAt: "2026-05-29T00:00:00Z",
    updatedAt: "2026-05-29T00:00:00Z",
    providers: [],
    triggerCount: 0,
    actionCount: 0,
    runStats: {
      total,
      succeeded,
      successRate: total > 0 ? succeeded / total : 0,
      lastRunAt: null,
      lastRunStatus: null,
    },
  };
}

describe("WorkflowsStatCards", () => {
  it("renders four cards with derived real-data totals", () => {
    const workflows = [
      wf("1", "active", 100, 95),
      wf("2", "active", 50, 50),
      wf("3", "draft", 0, 0),
      wf("4", "paused", 200, 180),
    ];
    render(<WorkflowsStatCards workflows={workflows} />);

    expect(screen.getByTestId("workflows-stat-running")).toHaveTextContent("2");
    expect(screen.getByTestId("workflows-stat-running")).toHaveTextContent(
      "of 4 total",
    );
    expect(screen.getByTestId("workflows-stat-total")).toHaveTextContent("4");
    // 100 + 50 + 0 + 200 = 350
    expect(screen.getByTestId("workflows-stat-runs")).toHaveTextContent("350");
    // (95 + 50 + 0 + 180) / 350 = 92.857 → 93%
    expect(screen.getByTestId("workflows-stat-success")).toHaveTextContent("93%");
  });

  it("shows '—' + 'No runs yet' on the success card when there are zero runs", () => {
    const workflows = [wf("1", "draft", 0, 0), wf("2", "draft", 0, 0)];
    render(<WorkflowsStatCards workflows={workflows} />);
    const success = screen.getByTestId("workflows-stat-success");
    expect(success).toHaveTextContent("—");
    expect(success).toHaveTextContent(/No runs yet/i);
  });

  it("renders 'lifetime' copy — NEVER 'today' or '24h'", () => {
    render(
      <WorkflowsStatCards workflows={[wf("1", "active", 10, 10)]} />,
    );
    const cards = screen.getByTestId("workflows-stat-cards");
    expect(cards.textContent).toMatch(/lifetime/i);
    expect(cards.textContent).not.toMatch(/today/i);
    expect(cards.textContent).not.toMatch(/24h/i);
  });
});
