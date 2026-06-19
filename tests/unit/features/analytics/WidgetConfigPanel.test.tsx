jest.mock("@/lib/api/options", () => ({ fetchOptionsSource: jest.fn() }));

import { render, screen, fireEvent } from "@testing-library/react";
import { WidgetConfigPanel } from "@/features/analytics/WidgetConfigPanel";
import { fetchOptionsSource } from "@/lib/api/options";
import type { AnalyticsWidget } from "@/contracts/analytics";

/**
 * Config panel data-source selection (Slice ANALYTICS-SOURCES-SLACK-UI-1):
 * Slack offered for compatible widget types, GitHub NOT offered (held back),
 * channel picker + conditional keyword input, internal path unchanged.
 */

const mockFetchOptions = fetchOptionsSource as jest.MockedFunction<typeof fetchOptionsSource>;

function widget(type: AnalyticsWidget["type"], config: AnalyticsWidget["config"]): AnalyticsWidget {
  return { id: "w1", type, size: "s", title: "Widget", config };
}

function renderPanel(w: AnalyticsWidget, connectedProviders: Record<string, boolean> = { slack: true }) {
  const onSave = jest.fn();
  const onClose = jest.fn();
  render(
    <WidgetConfigPanel
      widget={w}
      workflows={[]}
      connectedProviders={connectedProviders}
      onClose={onClose}
      onSave={onSave}
    />,
  );
  return { onSave, onClose };
}

beforeEach(() => {
  jest.clearAllMocks();
  mockFetchOptions.mockResolvedValue({
    ok: true,
    source: "slack:channels",
    items: [
      { value: "C012AB3CD", label: "#general" },
      { value: "C0987ZYXW", label: "#random" },
    ],
    hasMore: false,
  });
});

describe("WidgetConfigPanel — connected-app exposure", () => {
  it("offers BOTH Slack and GitHub for a stat widget", () => {
    renderPanel(widget("stat", { source: "any", metric: "runs" }));
    expect(screen.getByText("Data source")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Slack" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "GitHub" })).toBeInTheDocument();
  });

  it("offers GitHub for line/bar but NOT for donut/table", () => {
    renderPanel(widget("line", { source: "any", metric: "runs_over_time" }));
    expect(screen.getByRole("button", { name: "GitHub" })).toBeInTheDocument();
  });

  it("does NOT offer a connected app for an unsupported widget type (donut)", () => {
    renderPanel(widget("donut", { source: "any", metric: "outcomes" }));
    expect(screen.queryByText("Data source")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "GitHub" })).not.toBeInTheDocument();
  });

  it("internal path is unchanged — saves metric, no dataSource", () => {
    const { onSave } = renderPanel(widget("stat", { source: "any", metric: "runs" }));
    fireEvent.click(screen.getByRole("button", { name: /save widget/i }));
    expect(onSave).toHaveBeenCalledWith({ source: "any", metric: "runs" });
  });
});

describe("WidgetConfigPanel — GitHub repo", () => {
  it("validates owner/repo and saves a connected_app github config (no Slack channel fetch)", () => {
    const { onSave } = renderPanel(widget("stat", { source: "any", metric: "runs" }), {
      slack: true,
      github: true,
    });
    fireEvent.click(screen.getByRole("button", { name: "GitHub" }));

    const saveBtn = screen.getByRole("button", { name: /save widget/i });
    // No repo yet → disabled.
    expect(saveBtn).toBeDisabled();

    const repo = screen.getByLabelText("GitHub repository");
    fireEvent.change(repo, { target: { value: "not a repo" } });
    expect(saveBtn).toBeDisabled();
    expect(screen.getByText(/valid/i)).toBeInTheDocument();

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
    // GitHub config must not trigger the Slack channel options fetch.
    expect(mockFetchOptions).not.toHaveBeenCalled();
  });

  it("shows a Connect note when GitHub isn't connected (viewer's own connection)", () => {
    renderPanel(widget("stat", { source: "any", metric: "runs" }), {
      slack: true,
      github: false,
    });
    fireEvent.click(screen.getByRole("button", { name: "GitHub" }));
    expect(screen.getByText(/your own connection/i)).toBeInTheDocument();
  });
});

describe("WidgetConfigPanel — Slack channel + keyword", () => {
  it("requires a channel selection, then saves a connected_app config", async () => {
    const { onSave } = renderPanel(widget("stat", { source: "any", metric: "runs" }));
    fireEvent.click(screen.getByRole("button", { name: "Slack" }));

    const saveBtn = screen.getByRole("button", { name: /save widget/i });
    // No channel chosen yet → disabled.
    expect(saveBtn).toBeDisabled();

    // Channel picker loads from the options source.
    const select = await screen.findByLabelText("Slack channel");
    fireEvent.change(select, { target: { value: "C012AB3CD" } });

    expect(saveBtn).not.toBeDisabled();
    fireEvent.click(saveBtn);
    expect(onSave).toHaveBeenCalledWith({
      source: "any",
      dataSource: {
        kind: "connected_app",
        provider: "slack",
        metricKey: "channel_activity_count",
        filters: { channel: "C012AB3CD" },
      },
    });
  });

  it("keyword_mentions (line) requires channel AND keyword", async () => {
    const { onSave } = renderPanel(widget("line", { source: "any", metric: "runs_over_time" }));
    fireEvent.click(screen.getByRole("button", { name: "Slack" }));
    fireEvent.click(screen.getByRole("button", { name: /Keyword mentions over time/i }));

    const select = await screen.findByLabelText("Slack channel");
    fireEvent.change(select, { target: { value: "C012AB3CD" } });

    const saveBtn = screen.getByRole("button", { name: /save widget/i });
    // Channel set but no keyword → still disabled.
    expect(saveBtn).toBeDisabled();

    fireEvent.change(screen.getByLabelText("Keyword"), { target: { value: "launch" } });
    expect(saveBtn).not.toBeDisabled();
    fireEvent.click(saveBtn);
    expect(onSave).toHaveBeenCalledWith({
      source: "any",
      dataSource: {
        kind: "connected_app",
        provider: "slack",
        metricKey: "keyword_mentions",
        filters: { channel: "C012AB3CD", keyword: "launch" },
      },
    });
  });

  it("shows a connect note + no channel list when Slack isn't connected", () => {
    renderPanel(widget("stat", { source: "any", metric: "runs" }), { slack: false });
    fireEvent.click(screen.getByRole("button", { name: "Slack" }));
    expect(screen.getByText(/Connect it in Apps/i)).toBeInTheDocument();
    expect(screen.getByText(/Connect Slack to choose a channel/i)).toBeInTheDocument();
    expect(mockFetchOptions).not.toHaveBeenCalled();
  });
});
