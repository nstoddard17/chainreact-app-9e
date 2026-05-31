import { render, screen, within } from "@testing-library/react";
import type { RunListItem } from "@/contracts/workflow";
import { RunRow } from "@/features/runs/RunRow";

function fixtureRun(overrides: Partial<RunListItem> = {}): RunListItem {
  // `?? `-less spread: a caller that explicitly passes `null` (e.g.
  // `durationMs: null`, `errorClassification: null`) is preserved
  // verbatim. `??` would collapse those back into the defaults.
  const base: RunListItem = {
    id: "11111111-1111-1111-1111-111111111111",
    workflowId: "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa",
    workflowName: "Slack new-lead alert",
    status: "succeeded",
    isTest: false,
    triggeredBy: "manual",
    startedAt: new Date(Date.now() - 60_000).toISOString(),
    finishedAt: new Date(Date.now()).toISOString(),
    durationMs: 60_000,
    errorClassification: null,
  };
  return { ...base, ...overrides };
}

describe("RunRow", () => {
  it("renders workflow name as a link to the builder route", () => {
    const run = fixtureRun({
      workflowId: "abcdef00-0000-0000-0000-000000000001",
      workflowName: "Reorder candle restock",
    });
    render(
      <ul>
        <RunRow run={run} />
      </ul>,
    );
    const link = screen.getByTestId(
      `runs-row-${run.id}-workflow-link`,
    ) as HTMLAnchorElement;
    expect(link).toHaveAttribute(
      "href",
      `/workflows/${encodeURIComponent(run.workflowId)}`,
    );
    expect(link).toHaveTextContent("Reorder candle restock");
  });

  it("renders the source badge for the triggered_by value", () => {
    const run = fixtureRun({ triggeredBy: "webhook" });
    render(
      <ul>
        <RunRow run={run} />
      </ul>,
    );
    expect(
      screen.getByTestId("run-source-badge-webhook"),
    ).toHaveTextContent(/webhook/i);
  });

  it("shows the Test marker only for isTest=true rows", () => {
    const real = fixtureRun({ id: "real-1", isTest: false });
    const test = fixtureRun({ id: "test-1", isTest: true });
    const { rerender } = render(
      <ul>
        <RunRow run={real} />
      </ul>,
    );
    expect(screen.queryByTestId(`runs-row-${real.id}-test-marker`)).toBeNull();
    rerender(
      <ul>
        <RunRow run={test} />
      </ul>,
    );
    expect(screen.getByTestId(`runs-row-${test.id}-test-marker`)).toBeInTheDocument();
  });

  it("renders the humanized error block when errorClassification is present (no fake action button)", () => {
    const run = fixtureRun({
      id: "err-1",
      status: "failed",
      errorClassification: {
        title: "Gmail token expired",
        description: "Reconnect Gmail to keep this workflow running.",
        hint: "Account settings → Apps → Gmail.",
        action: "reconnect",
        severity: "error",
      },
    });
    render(
      <ul>
        <RunRow run={run} />
      </ul>,
    );
    const errorBlock = screen.getByTestId(`runs-row-${run.id}-error`);
    expect(errorBlock).toHaveTextContent("Gmail token expired");
    expect(errorBlock).toHaveTextContent(/reconnect gmail/i);
    expect(errorBlock).toHaveTextContent(/account settings/i);
    // The `action` field is provided on the DTO but the row does NOT
    // render a CTA — page guide §4 forbids fake action affordances.
    expect(within(errorBlock).queryByRole("button")).toBeNull();
    expect(within(errorBlock).queryByRole("link")).toBeNull();
  });

  it("omits the error block when errorClassification is null (no fake error)", () => {
    const run = fixtureRun({ id: "ok-1", errorClassification: null });
    render(
      <ul>
        <RunRow run={run} />
      </ul>,
    );
    expect(screen.queryByTestId(`runs-row-${run.id}-error`)).toBeNull();
  });

  it("renders duration via formatRunDuration (em-dash for null)", () => {
    const noDuration = fixtureRun({ id: "nd-1", durationMs: null });
    render(
      <ul>
        <RunRow run={noDuration} />
      </ul>,
    );
    expect(
      screen.getByTestId(`runs-row-${noDuration.id}-duration`),
    ).toHaveTextContent("—");
  });
});
