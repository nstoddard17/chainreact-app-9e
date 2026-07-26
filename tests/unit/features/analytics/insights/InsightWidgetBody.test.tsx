jest.mock("next/link", () => ({
  __esModule: true,
  default: ({ children, href }: { children: import("react").ReactNode; href: string }) => (
    <a href={href}>{children}</a>
  ),
}));
jest.mock("@/lib/api/analytics", () => ({ queryInsight: jest.fn() }));

import { render, screen, waitFor } from "@testing-library/react";
import { queryInsight } from "@/lib/api/analytics";
import { InsightWidgetBody } from "@/features/analytics/insights/InsightWidgetBody";
import type { AnalyticsWidget, InsightWidgetConfig } from "@/contracts/analytics";
import { FIXTURE_CATALOG, kpiResult } from "./fixtures";

const mockQuery = queryInsight as jest.MockedFunction<typeof queryInsight>;

const CONFIG: InsightWidgetConfig = {
  source: "acme",
  dataset: "orders",
  measure: "order_count",
  dimension: null,
  range: { preset: "30d" },
  chart: "kpi",
};

function widget(insight?: InsightWidgetConfig | undefined): AnalyticsWidget {
  return {
    id: "w1",
    type: "insight",
    size: "m",
    title: "Orders",
    config: { source: "any", ...(insight ? { insight } : {}) },
  };
}

function renderBody(
  w: AnalyticsWidget,
  opts: { connected?: Record<string, boolean>; canManage?: boolean } = {},
) {
  return render(
    <InsightWidgetBody
      widget={w}
      catalog={FIXTURE_CATALOG}
      connectedProviders={opts.connected ?? { acme: true }}
      canManage={opts.canManage ?? true}
      reloadKey={0}
    />,
  );
}

beforeEach(() => mockQuery.mockReset());

describe("InsightWidgetBody", () => {
  it("unconfigured widget shows guided setup, sends no query", () => {
    renderBody(widget(undefined));
    expect(screen.getByText("Finish setting up this insight")).toBeTruthy();
    expect(mockQuery).not.toHaveBeenCalled();
  });

  it("an obsolete config (source gone from the catalog) is an isolated safe state", () => {
    renderBody(widget({ ...CONFIG, source: "gone" }));
    expect(screen.getByText("Settings need an update")).toBeTruthy();
    expect(screen.getByText(/no longer available. Edit the widget/)).toBeTruthy();
    expect(mockQuery).not.toHaveBeenCalled();
  });

  it("a disconnected required source shows a connect action, never a request", () => {
    renderBody(widget(CONFIG), { connected: { acme: false } });
    expect(screen.getByText("Connect Acme to see this data in Analytics.")).toBeTruthy();
    expect(screen.getByRole("link", { name: /Connect Acme/ })).toBeTruthy();
    expect(mockQuery).not.toHaveBeenCalled();
  });

  it("queries EXACTLY the persisted question and renders the result", async () => {
    mockQuery.mockResolvedValue({ ok: true, result: kpiResult() });
    renderBody(widget(CONFIG));
    await waitFor(() => expect(screen.getByText("1,234")).toBeTruthy());
    expect(mockQuery).toHaveBeenCalledTimes(1);
    expect(mockQuery.mock.calls[0]![0]).toEqual({
      source: "acme",
      dataset: "orders",
      measure: "order_count",
      dimension: null,
      range: { preset: "30d" },
      chart: "kpi",
    });
    // Cached dataset → freshness shown with a refresh action.
    expect(screen.getByText("Updated 5 minutes ago")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Refresh" })).toBeTruthy();
  });

  it("maps typed rate-limit errors to safe copy with a retry", async () => {
    mockQuery.mockResolvedValue({
      ok: false,
      code: "RATE_LIMITED",
      message: "server text not shown",
      retryAfterSeconds: 30,
    });
    renderBody(widget(CONFIG));
    await waitFor(() =>
      expect(screen.getByText(/refreshed several times recently/)).toBeTruthy(),
    );
    expect(screen.queryByText("server text not shown")).toBeNull();
    expect(screen.getByRole("button", { name: "Try again" })).toBeTruthy();
  });

  it("maps MISSING_CREDENTIAL (server-detected) to the connect state", async () => {
    mockQuery.mockResolvedValue({
      ok: false,
      code: "MISSING_CREDENTIAL",
      message: "x",
    });
    renderBody(widget(CONFIG));
    await waitFor(() =>
      expect(screen.getByText("Connect Acme to use this data in Analytics.")).toBeTruthy(),
    );
  });

  it("maps an obsolete server-side config (UNKNOWN_DATASET) to the edit state", async () => {
    mockQuery.mockResolvedValue({ ok: false, code: "UNKNOWN_DATASET", message: "x" });
    renderBody(widget(CONFIG));
    await waitFor(() =>
      expect(
        screen.getByText("This insight uses settings that are no longer available. Edit the widget to update it."),
      ).toBeTruthy(),
    );
  });

  it("one widget's failure never breaks a sibling widget", async () => {
    mockQuery
      .mockResolvedValueOnce({ ok: false, code: "PROVIDER_ERROR", message: "down" })
      .mockResolvedValueOnce({ ok: true, result: kpiResult({ value: 7 }) });
    render(
      <>
        <InsightWidgetBody
          widget={widget(CONFIG)}
          catalog={FIXTURE_CATALOG}
          connectedProviders={{ acme: true }}
          canManage
          reloadKey={0}
        />
        <InsightWidgetBody
          widget={{ ...widget(CONFIG), id: "w2" }}
          catalog={FIXTURE_CATALOG}
          connectedProviders={{ acme: true }}
          canManage
          reloadKey={0}
        />
      </>,
    );
    await waitFor(() => expect(screen.getByText("7")).toBeTruthy());
    expect(screen.getByText(/couldn't be reached right now/)).toBeTruthy();
  });
});
