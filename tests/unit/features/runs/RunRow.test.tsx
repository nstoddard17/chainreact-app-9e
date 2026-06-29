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
    triggeredByApiKeyPrefix: null,
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

  it("renders an api_key run with the prefix-aware copy (RH-3)", () => {
    const run = fixtureRun({
      triggeredBy: "api_key",
      triggeredByApiKeyPrefix: "crk_live_ab12…wxyz",
    });
    render(
      <ul>
        <RunRow run={run} />
      </ul>,
    );
    const badge = screen.getByTestId("run-source-badge-api_key");
    expect(badge).toHaveTextContent("Triggered via API key · crk_live_ab12…wxyz");
    expect(badge.textContent ?? "").not.toMatch(/key_?hash/i);
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

  it("renders the humanized error block + one reconnect CTA when action=reconnect (CR-FAILREASON-2)", () => {
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
    // CR-FAILREASON-2 — exactly ONE primary CTA, linking to the Apps page.
    const cta = screen.getByTestId(`runs-row-${run.id}-cta`) as HTMLAnchorElement;
    expect(cta).toHaveAttribute("href", "/apps");
    expect(cta).toHaveTextContent("Reconnect app");
    expect(within(errorBlock).getAllByRole("link")).toHaveLength(1);
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

  // RUN-VISIBILITY-1 — non-terminal runs are now visible with a clear status
  // badge + helper copy, so a just-started run isn't invisible on /runs.
  it("renders a queued run with the Queued badge + 'Waiting to start…' copy", () => {
    const run = fixtureRun({
      id: "q-1",
      status: "queued",
      startedAt: new Date(Date.now() - 3_000).toISOString(),
      finishedAt: null,
      durationMs: null,
    });
    render(
      <ul>
        <RunRow run={run} />
      </ul>,
    );
    expect(screen.getByTestId(`runs-row-${run.id}`)).toHaveAttribute(
      "data-status",
      "queued",
    );
    expect(screen.getByTestId("run-status-badge-queued")).toHaveTextContent(
      /queued/i,
    );
    expect(screen.getByTestId(`runs-row-${run.id}-pending`)).toHaveTextContent(
      "Waiting to start…",
    );
  });

  it("renders a running run with the Running badge + 'Workflow is running…' copy", () => {
    const run = fixtureRun({
      id: "r-1",
      status: "running",
      finishedAt: null,
      durationMs: null,
    });
    render(
      <ul>
        <RunRow run={run} />
      </ul>,
    );
    expect(screen.getByTestId("run-status-badge-running")).toHaveTextContent(
      /running/i,
    );
    expect(screen.getByTestId(`runs-row-${run.id}-pending`)).toHaveTextContent(
      "Workflow is running…",
    );
  });

  it("shows the stale-queued note for a run queued well past the threshold", () => {
    const run = fixtureRun({
      id: "stale-1",
      status: "queued",
      // 10 minutes ago — past the 5-minute stale threshold.
      startedAt: new Date(Date.now() - 10 * 60_000).toISOString(),
      finishedAt: null,
      durationMs: null,
    });
    render(
      <ul>
        <RunRow run={run} />
      </ul>,
    );
    expect(screen.getByTestId(`runs-row-${run.id}-pending`)).toHaveTextContent(
      /taking longer than usual/i,
    );
  });

  it("renders NO pending copy for terminal runs (succeeded/failed unchanged)", () => {
    const ok = fixtureRun({ id: "term-1", status: "succeeded" });
    render(
      <ul>
        <RunRow run={ok} />
      </ul>,
    );
    expect(screen.queryByTestId(`runs-row-${ok.id}-pending`)).toBeNull();
  });
});

describe("RunRow — failed-run CTA (CR-FAILREASON-2)", () => {
  function failedRun(
    action: NonNullable<RunListItem["errorClassification"]>["action"],
    overrides: Partial<RunListItem> = {},
  ): RunListItem {
    return fixtureRun({
      id: "cta-1",
      status: "failed",
      errorClassification: {
        title: "Something went wrong",
        description: "A step in this workflow failed.",
        action,
        severity: "error",
      },
      ...overrides,
    });
  }

  it.each([
    ["reconnect", "/apps", "Reconnect app"],
    ["upgrade_plan", "/account", "Upgrade plan"],
  ] as const)(
    "%s renders one link CTA → %s",
    (action, href, label) => {
      const run = failedRun(action);
      render(
        <ul>
          <RunRow run={run} />
        </ul>,
      );
      const cta = screen.getByTestId(`runs-row-${run.id}-cta`) as HTMLAnchorElement;
      expect(cta).toHaveAttribute("href", href);
      expect(cta).toHaveTextContent(label);
      expect(cta.getAttribute("data-cta-action")).toBe(action);
      // exactly one CTA in the error block
      const errorBlock = screen.getByTestId(`runs-row-${run.id}-error`);
      expect(within(errorBlock).getAllByRole("link")).toHaveLength(1);
    },
  );

  it("open_node links to the builder ('Fix workflow setup') since no node is addressable here", () => {
    const run = failedRun("open_node", {
      workflowId: "abcdef00-0000-0000-0000-000000000099",
    });
    render(
      <ul>
        <RunRow run={run} />
      </ul>,
    );
    const cta = screen.getByTestId(`runs-row-${run.id}-cta`) as HTMLAnchorElement;
    expect(cta).toHaveAttribute(
      "href",
      `/workflows/${encodeURIComponent(run.workflowId)}`,
    );
    expect(cta).toHaveTextContent("Fix workflow setup");
  });

  it.each([
    ["retry_later", "Try again later"],
    ["contact_support", "Contact support"],
  ] as const)(
    "%s renders guidance TEXT (no link, no retry/support route invented)",
    (action, label) => {
      const run = failedRun(action);
      render(
        <ul>
          <RunRow run={run} />
        </ul>,
      );
      const cta = screen.getByTestId(`runs-row-${run.id}-cta`);
      expect(cta).toHaveTextContent(label);
      // guidance only — NOT a link/button
      const errorBlock = screen.getByTestId(`runs-row-${run.id}-error`);
      expect(within(errorBlock).queryByRole("link")).toBeNull();
      expect(within(errorBlock).queryByRole("button")).toBeNull();
    },
  );

  it("renders NO CTA for a legacy/missing action (no misleading affordance, no crash)", () => {
    const run = failedRun(undefined);
    render(
      <ul>
        <RunRow run={run} />
      </ul>,
    );
    expect(screen.queryByTestId(`runs-row-${run.id}-cta`)).toBeNull();
    // reason still renders
    expect(screen.getByTestId(`runs-row-${run.id}-error`)).toHaveTextContent(
      "Something went wrong",
    );
  });

  it("no-leak: a CTA's href/label never carries raw provider text seeded into the classification", () => {
    const SECRET = "xoxb-99-LEAKED-token jane@example.com team_T0ABCDEF99";
    const run = failedRun("reconnect", {
      errorClassification: {
        title: "Auth failed",
        description: `Provider said: ${SECRET}`,
        action: "reconnect",
        severity: "error",
      },
    });
    render(
      <ul>
        <RunRow run={run} />
      </ul>,
    );
    const cta = screen.getByTestId(`runs-row-${run.id}-cta`) as HTMLAnchorElement;
    expect(cta.getAttribute("href")).toBe("/apps");
    expect(cta.getAttribute("href") ?? "").not.toMatch(/xoxb|jane@example\.com|T0ABCDEF99/);
    expect(cta.textContent ?? "").not.toMatch(/xoxb|jane@example\.com|T0ABCDEF99/);
  });
});
