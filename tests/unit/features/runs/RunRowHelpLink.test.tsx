/**
 * HELP-CENTER-CONTEXTUAL-1 — failed-run Help Center links on the Runs page.
 *
 * Pins: a classified failure renders the expected article link as a
 * SECONDARY affordance (the primary CTA is unchanged), unknown/legacy
 * actions fall back to the general troubleshooting article, review_pending
 * deliberately renders no help link, the generated URL/label never carries
 * internal error details, and successful runs gain nothing.
 */
import { render, screen, within } from "@testing-library/react";
import type { RunListItem } from "@/contracts/workflow";
import { RunRow } from "@/features/runs/RunRow";

function fixtureRun(overrides: Partial<RunListItem> = {}): RunListItem {
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

function renderRun(run: RunListItem) {
  return render(
    <ul>
      <RunRow run={run} />
    </ul>,
  );
}

function failedWith(
  action: NonNullable<RunListItem["errorClassification"]>["action"] | undefined,
): RunListItem {
  return fixtureRun({
    status: "failed",
    errorClassification: {
      title: "An app needs to be reconnected",
      description: "A connected app rejected the request.",
      hint: "Reconnect the app on the Apps page.",
      ...(action !== undefined && { action }),
      severity: "error",
    },
  });
}

describe("RunRow — failed-run Help Center link", () => {
  it("reconnect failure renders the disconnected-app article beside the unchanged primary CTA", () => {
    const run = failedWith("reconnect");
    renderRun(run);
    // Primary CTA unchanged.
    const cta = screen.getByTestId(`runs-row-${run.id}-cta`);
    expect(cta).toHaveAttribute("href", "/apps");
    expect(cta).toHaveTextContent("Reconnect app");
    // Secondary help link.
    const help = screen.getByTestId(`runs-row-${run.id}-help-link`);
    expect(help).toHaveAttribute("href", "/help/fix-a-disconnected-app");
    expect(help).toHaveTextContent("Read troubleshooting guide");
  });

  it("open_node failure links the setup-issues article; upgrade_plan links task usage", () => {
    const openNode = failedWith("open_node");
    const { unmount } = renderRun(openNode);
    expect(screen.getByTestId(`runs-row-${openNode.id}-help-link`)).toHaveAttribute(
      "href",
      "/help/fix-workflow-setup-issues",
    );
    unmount();
    const upgrade = failedWith("upgrade_plan");
    renderRun(upgrade);
    expect(screen.getByTestId(`runs-row-${upgrade.id}-help-link`)).toHaveAttribute(
      "href",
      "/help/understand-task-usage",
    );
  });

  it("guidance-only and unknown/legacy actions fall back to the general troubleshooting article", () => {
    for (const action of [
      "retry_later",
      "contact_support",
      undefined,
    ] as const) {
      const run = failedWith(action);
      const { unmount } = renderRun(run);
      expect(screen.getByTestId(`runs-row-${run.id}-help-link`)).toHaveAttribute(
        "href",
        "/help/troubleshoot-a-failed-run",
      );
      unmount();
    }
  });

  it("review_pending deliberately renders NO help link (no user action is needed)", () => {
    const run = failedWith("review_pending");
    renderRun(run);
    expect(
      screen.queryByTestId(`runs-row-${run.id}-help-link`),
    ).not.toBeInTheDocument();
    // The guidance text CTA still renders.
    expect(screen.getByTestId(`runs-row-${run.id}-cta`)).toHaveTextContent(
      "ChainReact is reviewing this",
    );
  });

  it("help link URL and label never echo error details", () => {
    const run = fixtureRun({
      status: "failed",
      errorClassification: {
        title: "An app needs to be reconnected",
        description: "token=SECRET provider_account=12345",
        action: "reconnect",
        severity: "error",
      },
    });
    renderRun(run);
    const help = screen.getByTestId(`runs-row-${run.id}-help-link`);
    expect(help.getAttribute("href")).toBe("/help/fix-a-disconnected-app");
    expect(help.textContent).toBe("Read troubleshooting guide");
  });

  it("successful runs render no error block and no help link", () => {
    const run = fixtureRun();
    renderRun(run);
    const row = screen.getByTestId(`runs-row-${run.id}`);
    expect(within(row).queryByTestId(`runs-row-${run.id}-error`)).not.toBeInTheDocument();
    expect(
      within(row).queryByTestId(`runs-row-${run.id}-help-link`),
    ).not.toBeInTheDocument();
  });
});
