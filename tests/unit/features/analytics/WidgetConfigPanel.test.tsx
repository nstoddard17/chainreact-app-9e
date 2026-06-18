import { render, screen, fireEvent } from "@testing-library/react";
import { WidgetConfigPanel } from "@/features/analytics/WidgetConfigPanel";
import type { AnalyticsWidget } from "@/contracts/analytics";

/**
 * Config panel data-source selection (Slice ANALYTICS-SOURCES-GITHUB-UI-1):
 * GitHub source offered for compatible widget types, repo validated client-side,
 * connect note when the viewer isn't connected, internal path unchanged.
 */

function widget(type: AnalyticsWidget["type"], config: AnalyticsWidget["config"]): AnalyticsWidget {
  return { id: "w1", type, size: "s", title: "Widget", config };
}

function renderPanel(w: AnalyticsWidget, githubConnected = true) {
  const onSave = jest.fn();
  const onClose = jest.fn();
  render(
    <WidgetConfigPanel
      widget={w}
      workflows={[]}
      githubConnected={githubConnected}
      onClose={onClose}
      onSave={onSave}
    />,
  );
  return { onSave, onClose };
}

describe("WidgetConfigPanel — GitHub source", () => {
  it("offers a GitHub data source for a stat widget", () => {
    renderPanel(widget("stat", { source: "any", metric: "runs" }));
    expect(screen.getByText("Data source")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /GitHub/i })).toBeInTheDocument();
  });

  it("does NOT offer GitHub for an unsupported widget type (donut)", () => {
    renderPanel(widget("donut", { source: "any", metric: "outcomes" }));
    expect(screen.queryByText("Data source")).not.toBeInTheDocument();
  });

  it("validates the repo and only saves a connected_app config when valid", () => {
    const { onSave } = renderPanel(widget("stat", { source: "any", metric: "runs" }));
    fireEvent.click(screen.getByRole("button", { name: /^GitHub$/i }));
    const saveBtn = screen.getByRole("button", { name: /save widget/i });

    // No repo yet → save disabled.
    expect(saveBtn).toBeDisabled();

    // Invalid repo → still disabled.
    const repo = screen.getByLabelText("GitHub repository");
    fireEvent.change(repo, { target: { value: "not a repo" } });
    expect(saveBtn).toBeDisabled();
    expect(screen.getByText(/valid/i)).toBeInTheDocument();

    // Valid repo → enabled; save writes the connected_app config.
    fireEvent.change(repo, { target: { value: "octocat/hello" } });
    expect(saveBtn).not.toBeDisabled();
    fireEvent.click(saveBtn);
    expect(onSave).toHaveBeenCalledWith({
      source: "any",
      dataSource: {
        kind: "connected_app",
        provider: "github",
        metricKey: "open_issues",
        filters: { repo: "octocat/hello" },
      },
    });
  });

  it("shows a connect note when the viewer hasn't connected GitHub", () => {
    renderPanel(widget("stat", { source: "any", metric: "runs" }), false);
    fireEvent.click(screen.getByRole("button", { name: /^GitHub$/i }));
    expect(screen.getByText(/haven't connected GitHub/i)).toBeInTheDocument();
  });

  it("internal path is unchanged — saves metric, no dataSource", () => {
    const { onSave } = renderPanel(widget("stat", { source: "any", metric: "runs" }));
    fireEvent.click(screen.getByRole("button", { name: /save widget/i }));
    expect(onSave).toHaveBeenCalledWith({ source: "any", metric: "runs" });
  });
});
