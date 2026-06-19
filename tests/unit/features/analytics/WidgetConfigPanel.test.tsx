jest.mock("@/lib/api/options", () => ({ fetchOptionsSource: jest.fn() }));

import { render, screen, fireEvent } from "@testing-library/react";
import { WidgetConfigPanel } from "@/features/analytics/WidgetConfigPanel";
import { fetchOptionsSource } from "@/lib/api/options";
import type { AnalyticsWidget } from "@/contracts/analytics";

/**
 * Config panel data-source selection (Slice ANALYTICS-SOURCES-SLACK-UI-1;
 * GitHub re-exposed in ...-GITHUB-UI-2; GitHub repo picker in ...-GITHUB-UI-3):
 * Slack + GitHub offered for compatible widget types, Slack channel picker +
 * keyword input, GitHub repo combobox + manual fallback, internal unchanged.
 */

const mockFetchOptions = fetchOptionsSource as jest.MockedFunction<typeof fetchOptionsSource>;

const GITHUB_REPOS = [
  { value: "octocat/hello-world", label: "octocat/hello-world" },
  { value: "octocat/spoon-knife", label: "octocat/spoon-knife", description: "Private" },
];
const SLACK_CHANNELS = [
  { value: "C012AB3CD", label: "#general" },
  { value: "C0987ZYXW", label: "#random" },
];

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
  mockFetchOptions.mockImplementation((source: string) =>
    Promise.resolve({
      ok: true,
      source,
      items: source === "github:repos" ? GITHUB_REPOS : SLACK_CHANNELS,
      hasMore: false,
    }),
  );
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
  it("manual owner/repo entry: validates + saves the github connected_app config", () => {
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

    // Manual entry of a repo NOT in the picker still works (fallback path).
    fireEvent.change(repo, { target: { value: "myorg/private-thing" } });
    expect(saveBtn).not.toBeDisabled();
    fireEvent.click(saveBtn);
    expect(onSave).toHaveBeenCalledWith({
      source: "any",
      dataSource: {
        kind: "connected_app",
        provider: "github",
        metricKey: "open_issues",
        filters: { repo: "myorg/private-thing" },
      },
    });
    // GitHub config fetches the repo picker — NOT the Slack channel source.
    expect(mockFetchOptions).toHaveBeenCalledWith("github:repos");
    expect(mockFetchOptions).not.toHaveBeenCalledWith("slack:channels");
  });

  it("picker: selecting a fetched repo fills owner/repo and saves it", async () => {
    const { onSave } = renderPanel(widget("line", { source: "any", metric: "runs_over_time" }), {
      slack: true,
      github: true,
    });
    fireEvent.click(screen.getByRole("button", { name: "GitHub" }));

    const repo = screen.getByLabelText("GitHub repository");
    fireEvent.focus(repo);
    // Suggestion appears from the github:repos fetch; pick it (mousedown — fires before blur).
    const option = await screen.findByText("octocat/hello-world");
    fireEvent.mouseDown(option);

    expect((repo as HTMLInputElement).value).toBe("octocat/hello-world");
    fireEvent.click(screen.getByRole("button", { name: /save widget/i }));
    expect(onSave).toHaveBeenCalledWith({
      source: "any",
      dataSource: {
        kind: "connected_app",
        provider: "github",
        metricKey: "issues_opened",
        filters: { repo: "octocat/hello-world" },
      },
    });
  });

  it("shows a Connect note + no repo fetch when GitHub isn't connected (manual entry still works)", () => {
    const { onSave } = renderPanel(widget("stat", { source: "any", metric: "runs" }), {
      slack: true,
      github: false,
    });
    fireEvent.click(screen.getByRole("button", { name: "GitHub" }));
    expect(screen.getByText(/your own connection/i)).toBeInTheDocument();
    // Disconnected → no repo picker fetch, but manual owner/repo still saves.
    expect(mockFetchOptions).not.toHaveBeenCalledWith("github:repos");
    fireEvent.change(screen.getByLabelText("GitHub repository"), {
      target: { value: "octocat/hello" },
    });
    fireEvent.click(screen.getByRole("button", { name: /save widget/i }));
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

describe("WidgetConfigPanel — Google Calendar", () => {
  it("offers Google Calendar for stat/line/bar but not donut", () => {
    renderPanel(widget("stat", { source: "any", metric: "runs" }), {
      slack: true,
      "google-calendar": true,
    });
    expect(screen.getByRole("button", { name: "Google Calendar" })).toBeInTheDocument();
  });

  it("defaults the calendar to primary and saves immediately (no guessing, no options fetch)", () => {
    const { onSave } = renderPanel(widget("stat", { source: "any", metric: "runs" }), {
      slack: true,
      "google-calendar": true,
    });
    fireEvent.click(screen.getByRole("button", { name: "Google Calendar" }));

    // Calendar pre-filled with "primary" → save enabled right away.
    const cal = screen.getByLabelText("Google Calendar ID") as HTMLInputElement;
    expect(cal.value).toBe("primary");
    const saveBtn = screen.getByRole("button", { name: /save widget/i });
    expect(saveBtn).not.toBeDisabled();
    fireEvent.click(saveBtn);
    expect(onSave).toHaveBeenCalledWith({
      source: "any",
      dataSource: {
        kind: "connected_app",
        provider: "google-calendar",
        metricKey: "upcoming_meetings_count",
        filters: { calendar: "primary" },
      },
    });
    // No calendar-list options call — there's no list scope (manual id only).
    expect(mockFetchOptions).not.toHaveBeenCalledWith("google-calendar:calendars");
  });

  it("manual calendar id override persists", () => {
    const { onSave } = renderPanel(widget("line", { source: "any", metric: "runs_over_time" }), {
      slack: true,
      "google-calendar": true,
    });
    fireEvent.click(screen.getByRole("button", { name: "Google Calendar" }));
    fireEvent.change(screen.getByLabelText("Google Calendar ID"), {
      target: { value: "team@group.calendar.google.com" },
    });
    fireEvent.click(screen.getByRole("button", { name: /save widget/i }));
    expect(onSave).toHaveBeenCalledWith({
      source: "any",
      dataSource: {
        kind: "connected_app",
        provider: "google-calendar",
        metricKey: "meetings_over_time",
        filters: { calendar: "team@group.calendar.google.com" },
      },
    });
  });
});
