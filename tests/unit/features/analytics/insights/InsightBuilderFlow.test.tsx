jest.mock("next/link", () => ({
  __esModule: true,
  default: ({ children, href }: { children: import("react").ReactNode; href: string }) => (
    <a href={href}>{children}</a>
  ),
}));
jest.mock("@/lib/api/analytics", () => ({ queryInsight: jest.fn() }));
jest.mock("@/lib/api/options", () => ({ fetchOptionsSource: jest.fn() }));

import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { queryInsight } from "@/lib/api/analytics";
import { fetchOptionsSource } from "@/lib/api/options";
import { InsightConfigPanel } from "@/features/analytics/insights/InsightConfigPanel";
import type { AnalyticsWidget, AnalyticsWidgetConfig } from "@/contracts/analytics";
import { FIXTURE_CATALOG, kpiResult, timeSeriesResult } from "./fixtures";

const mockQuery = queryInsight as jest.MockedFunction<typeof queryInsight>;
const mockOptions = fetchOptionsSource as jest.MockedFunction<typeof fetchOptionsSource>;

const NEW_WIDGET: AnalyticsWidget = {
  id: "w1",
  type: "insight",
  size: "m",
  title: "Custom insight",
  config: { source: "any" },
};

function renderPanel(
  overrides: {
    widget?: AnalyticsWidget;
    connected?: Record<string, boolean>;
    onSave?: (c: AnalyticsWidgetConfig) => void;
  } = {},
) {
  return render(
    <InsightConfigPanel
      widget={overrides.widget ?? NEW_WIDGET}
      catalog={FIXTURE_CATALOG}
      connectedProviders={overrides.connected ?? { acme: true, previewsrc: true }}
      internalEntityOptions={[
        { value: "wf-1", label: "Daily digest" },
        { value: "wf-2", label: "Lead sync" },
      ]}
      onClose={() => {}}
      onSave={overrides.onSave ?? (() => {})}
    />,
  );
}

beforeEach(() => {
  mockQuery.mockReset();
  mockOptions.mockReset();
  mockOptions.mockResolvedValue({ ok: true, source: "acme:items", items: [], hasMore: false });
});

describe("InsightConfigPanel — catalog-driven builder", () => {
  it("opens with the guided empty state; sources come from the catalog (incl. preview badge)", () => {
    renderPanel();
    expect(screen.getByText(/Start by choosing\s+where your data comes from/)).toBeTruthy();
    expect(screen.getByText("Where is the data from?")).toBeTruthy();
    // All three fixture sources render generically — none are hardcoded names.
    expect(screen.getByRole("button", { name: /Acme/ })).toBeTruthy();
    expect(screen.getByRole("button", { name: /Internal App/ })).toBeTruthy();
    const previewSource = screen.getByRole("button", { name: /Preview Source/ });
    // Exposure badge comes from catalog state, not a provider-name check.
    expect(within(previewSource).getByText("Preview")).toBeTruthy();
    // Internal sources show no connection chrome at all.
    const internal = screen.getByRole("button", { name: /Internal App/ });
    expect(internal.textContent).not.toContain("Connected");
    // No dataset step until an app is chosen; preview asks for a source.
    expect(screen.queryByText("What do you want to look at?")).toBeNull();
    expect(mockQuery).not.toHaveBeenCalled();
  });

  it("walks App → Data → Show → Group by → Chart and previews only when complete", async () => {
    mockQuery.mockResolvedValue({ ok: true, result: kpiResult() });
    renderPanel();

    fireEvent.click(screen.getByRole("button", { name: /Acme/ }));
    expect(screen.getByText("What do you want to look at?")).toBeTruthy();
    expect(mockQuery).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: /^Orders Orders placed/ }));
    expect(screen.getByText("What should the chart show?")).toBeTruthy();
    expect(mockQuery).not.toHaveBeenCalled(); // incomplete → still gated

    fireEvent.click(screen.getByRole("button", { name: "Orders" }));
    // Group-by defaults to nothing chosen; pick "one number".
    fireEvent.click(screen.getByRole("button", { name: "No grouping — one number" }));
    // Chart auto-resolves to Number (single honest choice) → complete.
    await waitFor(() => expect(mockQuery).toHaveBeenCalledTimes(1), { timeout: 3000 });
    expect(mockQuery.mock.calls[0]![0]).toMatchObject({
      source: "acme",
      dataset: "orders",
      measure: "order_count",
      dimension: null,
      chart: "kpi",
    });
    await waitFor(() => expect(screen.getByText("1,234")).toBeTruthy());
  });

  it("measures/groupings/filters/series regenerate when the dataset changes; nothing provider-specific", async () => {
    renderPanel();
    fireEvent.click(screen.getByRole("button", { name: /Acme/ }));
    fireEvent.click(screen.getByRole("button", { name: /^Orders Orders placed/ }));
    expect(screen.getByRole("button", { name: "Gross order amount" })).toBeTruthy();
    // Filters render from metadata once a measure is chosen.
    fireEvent.click(screen.getByRole("button", { name: "Orders" }));
    expect(screen.getByText("Status")).toBeTruthy(); // declared-value category filter
    expect(screen.getByLabelText("Add Currency value")).toBeTruthy(); // valueless category filter
    expect(screen.getByText("Include drafts")).toBeTruthy(); // boolean filter

    fireEvent.click(screen.getByRole("button", { name: /Audit scans/ }));
    expect(screen.queryByRole("button", { name: "Gross order amount" })).toBeNull();
    expect(screen.queryByText("Include drafts")).toBeNull();
    expect(screen.getByRole("button", { name: "Scans" })).toBeTruthy();
  });

  it("a reset explanation appears when a measure change invalidates the series", async () => {
    renderPanel();
    fireEvent.click(screen.getByRole("button", { name: /Acme/ }));
    fireEvent.click(screen.getByRole("button", { name: /^Orders Orders placed/ }));
    fireEvent.click(screen.getByRole("button", { name: "Orders" }));
    fireEvent.click(screen.getByRole("button", { name: "Over time" }));
    // Give items their own lines (choose exact).
    fireEvent.click(screen.getByRole("radio", { name: /Choose exact items/ }));
    // Now switch to a measure that can't split by item.
    fireEvent.click(screen.getByRole("button", { name: "Gross order amount" }));
    expect(screen.getByText(/can't be split into those lines/)).toBeTruthy();
  });

  it("disconnected account sources gate the preview behind a connect action", () => {
    renderPanel({ connected: { acme: false, previewsrc: true } });
    const acmeCard = screen.getByRole("button", { name: /Acme/ });
    fireEvent.click(acmeCard);
    expect(within(acmeCard).getByText("Not connected")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: /^Orders Orders placed/ }));
    fireEvent.click(screen.getByRole("button", { name: "Orders" }));
    fireEvent.click(screen.getByRole("button", { name: "No grouping — one number" }));
    expect(screen.getByText("Connect Acme to preview this data.")).toBeTruthy();
    expect(mockQuery).not.toHaveBeenCalled();
  });

  it("non-preview-safe datasets require an explicit Run preview", async () => {
    mockQuery.mockResolvedValue({ ok: true, result: kpiResult() });
    renderPanel();
    fireEvent.click(screen.getByRole("button", { name: /Acme/ }));
    fireEvent.click(screen.getByRole("button", { name: /Audit scans/ }));
    fireEvent.click(screen.getByRole("button", { name: "Scans" }));
    fireEvent.click(screen.getByRole("button", { name: "No grouping — one number" }));
    expect(screen.getByText("This preview runs on request")).toBeTruthy();
    expect(mockQuery).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Run preview" }));
    await waitFor(() => expect(mockQuery).toHaveBeenCalledTimes(1), { timeout: 3000 });
  });

  it("a typed preview failure preserves the form state", async () => {
    mockQuery.mockResolvedValue({
      ok: false,
      code: "MIXED_CURRENCY",
      message: "server copy",
    });
    renderPanel();
    fireEvent.click(screen.getByRole("button", { name: /Acme/ }));
    fireEvent.click(screen.getByRole("button", { name: /^Orders Orders placed/ }));
    fireEvent.click(screen.getByRole("button", { name: "Gross order amount" }));
    fireEvent.click(screen.getByRole("button", { name: "No grouping — one number" }));
    await waitFor(() =>
      expect(screen.getByText(/more than one currency/)).toBeTruthy(),
    );
    // Form selections are intact after the failure.
    expect(screen.getByRole("button", { name: "Gross order amount" }).getAttribute("aria-pressed")).toBe(
      "true",
    );
  });

  it("Apply is disabled until complete, then saves ONLY the question (no preview data)", async () => {
    mockQuery.mockResolvedValue({ ok: true, result: timeSeriesResult() });
    const onSave = jest.fn();
    renderPanel({ onSave });
    const apply = () => screen.getByRole("button", { name: "Apply" }) as HTMLButtonElement;
    expect(apply().disabled).toBe(true);

    fireEvent.click(screen.getByRole("button", { name: /Acme/ }));
    expect(apply().disabled).toBe(true);
    fireEvent.click(screen.getByRole("button", { name: /^Orders Orders placed/ }));
    expect(apply().disabled).toBe(true);
    // Choosing a measure completes a guided default (ungrouped number)…
    fireEvent.click(screen.getByRole("button", { name: "Orders" }));
    await waitFor(() => expect(apply().disabled).toBe(false));
    // …and the user's explicit grouping choice upgrades it to a line.
    fireEvent.click(screen.getByRole("button", { name: "Over time" }));
    await waitFor(() => expect(apply().disabled).toBe(false));

    fireEvent.click(apply());
    expect(onSave).toHaveBeenCalledTimes(1);
    const saved = onSave.mock.calls[0]![0] as AnalyticsWidgetConfig;
    expect(saved).toEqual({
      source: "any",
      insight: {
        source: "acme",
        dataset: "orders",
        measure: "order_count",
        dimension: "time",
        range: { preset: "30d" },
        chart: "line",
      },
    });
    // Nothing result-shaped leaks into persistence.
    const flat = JSON.stringify(saved);
    for (const banned of ["buckets", "values", "freshness", "warnings", "1234", "accountId"]) {
      expect(flat).not.toContain(banned);
    }
  });

  it("editing an existing widget rehydrates its saved question", () => {
    renderPanel({
      widget: {
        ...NEW_WIDGET,
        config: {
          source: "any",
          insight: {
            source: "acme",
            dataset: "orders",
            measure: "gross_amount",
            dimension: "time",
            range: { preset: "90d" },
            chart: "line",
          },
        },
      },
    });
    expect(
      screen.getByRole("button", { name: "Gross order amount" }).getAttribute("aria-pressed"),
    ).toBe("true");
    expect(screen.getByRole("button", { name: "Over time" }).getAttribute("aria-pressed")).toBe(
      "true",
    );
  });
});
