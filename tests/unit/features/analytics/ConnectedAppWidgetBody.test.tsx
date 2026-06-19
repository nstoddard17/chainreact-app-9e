jest.mock("next/link", () => ({
  __esModule: true,
  default: ({ children, href }: { children: import("react").ReactNode; href: string }) => (
    <a href={href}>{children}</a>
  ),
}));
jest.mock("@/lib/api/analytics", () => ({ querySourceData: jest.fn() }));

import { render, screen, waitFor } from "@testing-library/react";
import { ConnectedAppWidgetBody } from "@/features/analytics/ConnectedAppWidgetBody";
import { querySourceData } from "@/lib/api/analytics";
import type { AnalyticsWidget } from "@/contracts/analytics";
import type { NormalizedAnalyticsResult } from "@/services/analytics/sources/types";

const mockQuery = querySourceData as jest.MockedFunction<typeof querySourceData>;

const WIDGET: AnalyticsWidget = {
  id: "w1",
  type: "stat",
  size: "s",
  title: "Open issues",
  config: {
    source: "any",
    dataSource: { kind: "connected_app", provider: "github", metricKey: "open_issues", filters: { repo: "octocat/hello" } },
  },
};

function scalar(): NormalizedAnalyticsResult {
  return {
    shape: "scalar",
    dimensions: [],
    measures: ["open_issues"],
    rows: [{ open_issues: 1843 }],
    totals: { open_issues: 1843 },
    generatedAt: "2026-06-17T00:00:00Z",
    freshness: { cached: false, ageSeconds: 0, ttlSeconds: 600 },
    warnings: [],
    truncated: false,
  };
}

beforeEach(() => jest.clearAllMocks());

it("renders the scalar value on success + a 'Your GitHub' attribution", async () => {
  mockQuery.mockResolvedValue({ ok: true, result: scalar() });
  render(<ConnectedAppWidgetBody widget={WIDGET} range="7d" reloadKey={0} />);
  expect(await screen.findByText("1,843")).toBeInTheDocument();
  expect(screen.getByText(/Your GitHub · octocat\/hello/)).toBeInTheDocument();
});

it("renders a Connect GitHub CTA on MISSING_CREDENTIAL (no fake data, no crash)", async () => {
  mockQuery.mockResolvedValue({ ok: false, code: "MISSING_CREDENTIAL", message: "connect" });
  render(<ConnectedAppWidgetBody widget={WIDGET} range="7d" reloadKey={0} />);
  expect(await screen.findByText(/Connect your GitHub account/i)).toBeInTheDocument();
  expect(screen.getByRole("link", { name: /Connect GitHub/i })).toHaveAttribute("href", "/apps");
});

it("renders a safe error message on a provider error", async () => {
  mockQuery.mockResolvedValue({ ok: false, code: "RATE_LIMITED", message: "GitHub rate limit reached." });
  render(<ConnectedAppWidgetBody widget={WIDGET} range="7d" reloadKey={0} />);
  expect(await screen.findByText("GitHub rate limit reached.")).toBeInTheDocument();
});

it("surfaces a stale-cache warning", async () => {
  const r = scalar();
  r.freshness.stale = true;
  mockQuery.mockResolvedValue({ ok: true, result: r });
  render(<ConnectedAppWidgetBody widget={WIDGET} range="7d" reloadKey={0} />);
  expect(await screen.findByText(/recently cached data/i)).toBeInTheDocument();
});

it("does not throw when the fetch itself rejects (no dashboard crash)", async () => {
  mockQuery.mockRejectedValue(new Error("network"));
  render(<ConnectedAppWidgetBody widget={WIDGET} range="7d" reloadKey={0} />);
  await waitFor(() => expect(screen.getByText(/Couldn't load this data/i)).toBeInTheDocument());
});

it("GitHub widget: manual Refresh (reloadKey change) bypasses cache; initial load doesn't", async () => {
  mockQuery.mockResolvedValue({ ok: true, result: scalar() });
  const { rerender } = render(<ConnectedAppWidgetBody widget={WIDGET} range="7d" reloadKey={0} />);
  await screen.findByText("1,843");
  expect(mockQuery.mock.calls[0]![0]).not.toHaveProperty("refresh", true);

  rerender(<ConnectedAppWidgetBody widget={WIDGET} range="7d" reloadKey={1} />);
  await waitFor(() =>
    expect(mockQuery).toHaveBeenCalledWith(
      expect.objectContaining({ provider: "github", refresh: true }),
    ),
  );
});

// ── Slack (account-shared) ───────────────────────────────────────────────────
const SLACK_WIDGET: AnalyticsWidget = {
  id: "w2",
  type: "stat",
  size: "s",
  title: "Channel activity",
  config: {
    source: "any",
    dataSource: {
      kind: "connected_app",
      provider: "slack",
      metricKey: "channel_activity_count",
      filters: { channel: "C012AB3CD" },
    },
  },
};

function slackScalar(): NormalizedAnalyticsResult {
  return {
    shape: "scalar",
    dimensions: [],
    measures: ["channel_activity_count"],
    rows: [{ channel_activity_count: 57 }],
    totals: { channel_activity_count: 57 },
    generatedAt: "2026-06-17T00:00:00Z",
    freshness: { cached: false, ageSeconds: 0, ttlSeconds: 600 },
    warnings: [],
    truncated: false,
  };
}

it("renders a Slack scalar with an ACCOUNT 'Slack workspace' attribution (no raw channel id)", async () => {
  mockQuery.mockResolvedValue({ ok: true, result: slackScalar() });
  render(<ConnectedAppWidgetBody widget={SLACK_WIDGET} range="7d" reloadKey={0} />);
  expect(await screen.findByText("57")).toBeInTheDocument();
  expect(screen.getByText("Slack workspace")).toBeInTheDocument();
  // The opaque channel id is never surfaced in attribution.
  expect(screen.queryByText(/C012AB3CD/)).not.toBeInTheDocument();
});

it("forwards Slack filters (channel) to the source query", async () => {
  mockQuery.mockResolvedValue({ ok: true, result: slackScalar() });
  render(<ConnectedAppWidgetBody widget={SLACK_WIDGET} range="7d" reloadKey={0} />);
  await screen.findByText("57");
  expect(mockQuery).toHaveBeenCalledWith(
    expect.objectContaining({ provider: "slack", metric: "channel_activity_count", filters: { channel: "C012AB3CD" } }),
  );
});

it("initial load is cache-first; a manual Refresh (reloadKey change) bypasses cache", async () => {
  mockQuery.mockResolvedValue({ ok: true, result: slackScalar() });
  const { rerender } = render(<ConnectedAppWidgetBody widget={SLACK_WIDGET} range="7d" reloadKey={0} />);
  await screen.findByText("57");
  // First load does NOT force a refresh (cache-first — avoids provider rate limits).
  expect(mockQuery.mock.calls[0]![0]).not.toHaveProperty("refresh", true);

  // Dashboard Refresh bumps reloadKey → the widget re-queries bypassing the cache.
  rerender(<ConnectedAppWidgetBody widget={SLACK_WIDGET} range="7d" reloadKey={1} />);
  await waitFor(() =>
    expect(mockQuery).toHaveBeenCalledWith(expect.objectContaining({ refresh: true })),
  );
});

it("renders a Connect Slack CTA on MISSING_CREDENTIAL", async () => {
  mockQuery.mockResolvedValue({ ok: false, code: "MISSING_CREDENTIAL", message: "connect" });
  render(<ConnectedAppWidgetBody widget={SLACK_WIDGET} range="7d" reloadKey={0} />);
  expect(await screen.findByText(/Connect your Slack workspace/i)).toBeInTheDocument();
  expect(screen.getByRole("link", { name: /Connect Slack/i })).toHaveAttribute("href", "/apps");
});
