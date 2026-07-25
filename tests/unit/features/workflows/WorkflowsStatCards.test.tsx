/**
 * Tests for features/workflows/WorkflowsStatCards.
 *
 * Asserts the dashboard's four stat cards (Slice 4.WORKFLOWS-PAGE-1) are
 * derived from real list data (counts + lifetime run aggregates) — never
 * mock data and never time-bucketed "today" copy.
 */
import { render, screen } from "@testing-library/react";
import { WorkflowsStatCards } from "@/features/workflows/WorkflowsStatCards";
import { computeAccountUsageSummary } from "@/core/billing/accountUsageSummary";
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

  // DASHBOARD-USAGE-VISIBILITY-1 — the optional tasks / AI-credits usage cards.
  const NOW = new Date("2026-07-15T12:00:00Z");
  const usageOf = (
    tasks: { used: number; limit: number } | null,
    aiCredits: { used: number; limit: number } | null,
    billingMode: "standard" | "internal_free" = "standard",
  ) =>
    computeAccountUsageSummary({
      billingMode,
      tasks: tasks ? { ...tasks, periodStartedAt: "2026-07-01T00:00:00Z" } : null,
      aiCredits: aiCredits
        ? { ...aiCredits, periodStartedAt: "2026-07-01T00:00:00Z" }
        : null,
      now: NOW,
    });

  it("renders tasks-left and AI-credits-left cards from real usage", () => {
    render(
      <WorkflowsStatCards
        workflows={[wf("1", "active", 10, 10)]}
        usage={usageOf({ used: 30, limit: 100 }, { used: 5, limit: 200 })}
      />,
    );
    const tasksCard = screen.getByTestId("workflows-stat-tasks-left");
    expect(tasksCard).toHaveTextContent("70");
    expect(tasksCard).toHaveTextContent("30 of 100 used");
    expect(tasksCard.textContent).toMatch(/resets Aug 1/);
    const aiCard = screen.getByTestId("workflows-stat-ai-credits-left");
    expect(aiCard).toHaveTextContent("195");
    expect(aiCard).toHaveTextContent("5 of 200 used");
  });

  it("shows exhaustion copy when a dimension is over its limit", () => {
    render(
      <WorkflowsStatCards
        workflows={[wf("1", "active", 10, 10)]}
        usage={usageOf({ used: 100, limit: 100 }, { used: 0, limit: 200 })}
      />,
    );
    const tasksCard = screen.getByTestId("workflows-stat-tasks-left");
    expect(tasksCard).toHaveTextContent("0");
    expect(tasksCard.textContent).toMatch(/No tasks left this period/);
  });

  it("omits usage cards entirely when usage is absent or unavailable — never fakes zeros", () => {
    const { rerender } = render(
      <WorkflowsStatCards workflows={[wf("1", "active", 10, 10)]} />,
    );
    expect(screen.queryByTestId("workflows-stat-tasks-left")).toBeNull();
    expect(screen.queryByTestId("workflows-stat-ai-credits-left")).toBeNull();

    rerender(
      <WorkflowsStatCards
        workflows={[wf("1", "active", 10, 10)]}
        usage={usageOf(null, null)}
      />,
    );
    expect(screen.queryByTestId("workflows-stat-tasks-left")).toBeNull();
    expect(screen.queryByTestId("workflows-stat-ai-credits-left")).toBeNull();
  });

  it("labels an internal_free account's usage as not billed", () => {
    render(
      <WorkflowsStatCards
        workflows={[wf("1", "active", 10, 10)]}
        usage={usageOf({ used: 1, limit: 100 }, { used: 0, limit: 200 }, "internal_free")}
      />,
    );
    expect(
      screen.getByTestId("workflows-stat-tasks-left").textContent,
    ).toMatch(/not billed/);
  });
});
