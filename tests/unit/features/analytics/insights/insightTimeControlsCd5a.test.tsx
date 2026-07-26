import { fireEvent, render, screen, within } from "@testing-library/react";
import { InsightTimeControls } from "@/features/analytics/insights/InsightTimeControls";
import {
  emptyInsightDraft,
  reconcileInsightDraft,
  type InsightDraft,
} from "@/features/analytics/insights/reconcileInsightConfig";
import {
  insightConfigFromDraft,
  insightDraftIssues,
  insightQueryFromConfig,
} from "@/features/analytics/insights/insightQueryFromConfig";
import { findDataset, findMeasure, findSource } from "@/features/analytics/insights/insightCatalog";
import { FIXTURE_CATALOG } from "./fixtures";

/**
 * CD-5A — the finished date-range and time-grain experience.
 *
 * Everything is driven by the catalog, so these tests use the deliberately
 * fictional "acme" fixture source: if any of this passed only for a real
 * provider, there would be provider-specific logic in the builder.
 */

const NOW = Date.parse("2026-07-15T13:45:30.000Z");

const source = findSource(FIXTURE_CATALOG, "acme")!;
const dataset = findDataset(source, "orders")!;
const measure = findMeasure(dataset, "order_count")!;

function draft(overrides: Partial<InsightDraft> = {}): InsightDraft {
  return {
    ...emptyInsightDraft(),
    source: "acme",
    dataset: "orders",
    measure: "order_count",
    dimension: "time",
    chart: "line",
    ...overrides,
  };
}

function renderControls(d: InsightDraft, onPatch = jest.fn()) {
  render(
    <InsightTimeControls
      dataset={dataset}
      measure={measure}
      draft={d}
      onPatch={onPatch}
      now={NOW}
    />,
  );
  return onPatch;
}

describe("presets", () => {
  it("offers the calendar presets in plain language", () => {
    renderControls(draft());
    // "Year to date" and "Last 12 months" are absent here on purpose — the
    // fixture dataset caps at 90 days (asserted in the next test).
    for (const label of [
      "Today",
      "Yesterday",
      "Last 7 days",
      "Last 30 days",
      "Last 90 days",
      "This month",
      "Last month",
      "Custom",
    ]) {
      expect(screen.getByRole("button", { name: label })).toBeTruthy();
    }
  });

  it("marks the selected preset as pressed", () => {
    renderControls(draft({ range: { preset: "last_month" } }));
    expect(
      screen.getByRole("button", { name: "Last month" }).getAttribute("aria-pressed"),
    ).toBe("true");
    expect(screen.getByRole("button", { name: "Today" }).getAttribute("aria-pressed")).toBe(
      "false",
    );
  });

  it("hides presets the dataset's own maximum could never accept", () => {
    // The fixture "acme" dataset caps at 90 days.
    expect(dataset.limits.maxRangeDays).toBe(90);
    renderControls(draft());
    expect(screen.getByRole("button", { name: "Last 90 days" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Year to date" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Last 12 months" })).toBeNull();
  });

  it("selects a preset by its id, not its label", () => {
    const onPatch = renderControls(draft());
    fireEvent.click(screen.getByRole("button", { name: "Yesterday" }));
    expect(onPatch).toHaveBeenCalledWith({ range: { preset: "yesterday" } });
  });

  it("states the window a preset resolves to, in UTC", () => {
    renderControls(draft({ range: { preset: "yesterday" } }));
    const note = screen.getAllByRole("note").map((n) => n.textContent ?? "");
    expect(note.some((t) => t.includes("Jul 14, 2026") && t.includes("UTC"))).toBe(true);
  });
});

describe("custom range", () => {
  const custom = draft({ range: { from: "2026-07-01", to: "2026-07-31" } });

  it("labels the inputs Start date and End date and says both are included", () => {
    renderControls(custom);
    expect(screen.getByText("Start date")).toBeTruthy();
    expect(screen.getByText("End date")).toBeTruthy();
    expect(screen.getByText(/Both dates are included/i)).toBeTruthy();
  });

  it("reads the picked window back with an INCLUSIVE last day", () => {
    renderControls(draft({ range: { from: "2026-07-01", to: "2026-07-20" } }));
    const notes = screen.getAllByRole("note").map((n) => n.textContent ?? "");
    expect(notes.some((t) => t.includes("Jul 1, 2026") && t.includes("Jul 20, 2026"))).toBe(true);
  });

  it("names the dataset's limit rather than a generic number", () => {
    renderControls(custom);
    expect(screen.getByText(/Up to 90 days at a time/i)).toBeTruthy();
  });

  it("flags a backwards range as an alert and withholds the resolved window", () => {
    renderControls(draft({ range: { from: "2026-07-31", to: "2026-07-01" } }));
    expect(screen.getByRole("alert").textContent).toMatch(/on or before the end date/i);
    const notes = screen.queryAllByRole("note").map((n) => n.textContent ?? "");
    expect(notes.some((t) => t.startsWith("Showing"))).toBe(false);
  });

  it("flags a range beyond the dataset ceiling", () => {
    renderControls(draft({ range: { from: "2026-01-01", to: "2026-07-01" } }));
    expect(screen.getByRole("alert").textContent).toMatch(/at most 90 days/i);
  });

  it("marks the inputs invalid and describes them for assistive tech", () => {
    renderControls(draft({ range: { from: "2026-07-31", to: "2026-07-01" } }));
    const inputs = screen.getAllByLabelText(/date/i, { selector: "input" });
    for (const input of inputs) {
      expect(input.getAttribute("aria-invalid")).toBe("true");
      expect(input.getAttribute("aria-describedby")).toBe("insight-range-help");
    }
  });

  it("seeds a 30-day window that actually includes today", () => {
    const onPatch = renderControls(draft());
    fireEvent.click(screen.getByRole("button", { name: "Custom" }));
    const patch = onPatch.mock.calls[0]![0] as { range: { from: string; to: string } };
    expect(patch.range.to).toBe("2026-07-15"); // today, and it counts
    expect(patch.range.from).toBe("2026-06-16");
  });
});

describe("time grain", () => {
  it("explains what Automatic does", () => {
    renderControls(draft({ range: { preset: "30d" } }));
    expect(screen.getByText(/Automatic picks a readable grouping/i)).toBeTruthy();
  });

  it("offers only grains that suit the chosen span", () => {
    renderControls(draft({ range: { preset: "today" } }));
    const select = screen.getByRole("combobox", { name: /Group by/i });
    const options = within(select).getAllByRole("option").map((o) => o.textContent);
    // One day cannot be grouped weekly or monthly.
    expect(options).toEqual(["Automatic", "Daily"]);
  });

  it("offers the full ladder for a long enough span", () => {
    renderControls(draft({ range: { preset: "90d" } }));
    const select = screen.getByRole("combobox", { name: /Group by/i });
    const options = within(select).getAllByRole("option").map((o) => o.textContent);
    expect(options).toEqual(["Automatic", "Daily", "Weekly", "Monthly"]);
  });

  it("is hidden entirely when the chart is not over time", () => {
    renderControls(draft({ dimension: "status", chart: "bar" }));
    expect(screen.queryByRole("combobox", { name: /Group by/i })).toBeNull();
  });
});

describe("comparison control", () => {
  it("states the dates the comparison will cover before saving", () => {
    renderControls(draft({ dimension: null, chart: "kpi", compare: true }));
    const notes = screen.getAllByRole("note").map((n) => n.textContent ?? "");
    expect(notes.some((t) => t.startsWith("Compared with"))).toBe(true);
  });

  it("says nothing about a comparison that is switched off", () => {
    renderControls(draft({ dimension: null, chart: "kpi", compare: false }));
    const notes = screen.getAllByRole("note").map((n) => n.textContent ?? "");
    expect(notes.some((t) => t.startsWith("Compared with"))).toBe(false);
  });

  it("is not offered for a measure that declares no comparison", () => {
    const avg = findMeasure(dataset, "avg_amount")!;
    render(
      <InsightTimeControls
        dataset={dataset}
        measure={avg}
        draft={draft({ dimension: null, chart: "kpi" })}
        onPatch={jest.fn()}
        now={NOW}
      />,
    );
    expect(screen.queryByText(/Compare with the previous period/i)).toBeNull();
  });
});

describe("current-state datasets never show date controls", () => {
  it("renders nothing when the dataset declares no historical date field", () => {
    const currentStateDataset = { ...dataset, dateFields: [] };
    const { container } = render(
      <InsightTimeControls
        dataset={currentStateDataset}
        measure={measure}
        draft={draft()}
        onPatch={jest.fn()}
        now={NOW}
      />,
    );
    expect(container.firstChild).toBeNull();
  });
});

describe("reconciliation", () => {
  it("resets a range the newly-chosen dataset cannot accept, and explains why", () => {
    const over = draft({ range: { from: "2026-01-01", to: "2026-07-01" } }); // 182d > 90d
    const { draft: next, resets } = reconcileInsightDraft(FIXTURE_CATALOG, over, NOW);
    expect(next.range).toEqual({ preset: "30d" });
    expect(resets.find((r) => r.field === "range")?.message).toMatch(/at most 90 days/i);
  });

  it("keeps a valid range untouched when the measure changes", () => {
    const ok = draft({ range: { from: "2026-07-01", to: "2026-07-20" } });
    const { draft: next, resets } = reconcileInsightDraft(FIXTURE_CATALOG, ok, NOW);
    expect(next.range).toEqual({ from: "2026-07-01", to: "2026-07-20" });
    expect(resets.some((r) => r.field === "range")).toBe(false);
  });

  it("falls an impossible grain back to Automatic with an explanation", () => {
    const tooCoarse = draft({ range: { preset: "today" }, timeGrain: "month" });
    const { draft: next, resets } = reconcileInsightDraft(FIXTURE_CATALOG, tooCoarse, NOW);
    expect(next.timeGrain).toBe("auto");
    expect(resets.find((r) => r.field === "timeGrain")?.message).toMatch(
      /longer than the dates you picked/i,
    );
  });

  it("preserves an explicit grain that still fits the range", () => {
    const fine = draft({ range: { preset: "90d" }, timeGrain: "week" });
    const { draft: next, resets } = reconcileInsightDraft(FIXTURE_CATALOG, fine, NOW);
    expect(next.timeGrain).toBe("week");
    expect(resets.some((r) => r.field === "timeGrain")).toBe(false);
  });

  it("clears comparison when a donut is chosen, keeping the rest of the question", () => {
    const donut = draft({
      dimension: "status",
      chart: "donut",
      compare: true,
      filters: { status: ["paid"] },
    });
    const { draft: next, resets } = reconcileInsightDraft(FIXTURE_CATALOG, donut, NOW);
    expect(next.compare).toBe(false);
    expect(next.dimension).toBe("status");
    expect(next.filters).toEqual({ status: ["paid"] });
    expect(resets.find((r) => r.field === "compare")?.message).toMatch(/donut shows a single period/i);
  });
});

describe("the query the builder sends", () => {
  it("translates the inclusive end date to the exclusive wire boundary", () => {
    const config = insightConfigFromDraft(
      draft({ dimension: null, chart: "kpi", range: { from: "2026-07-01", to: "2026-07-31" } }),
      dataset.limits.maxRangeDays,
    )!;
    // Stored: what the person picked.
    expect(config.range).toEqual({ from: "2026-07-01", to: "2026-07-31" });
    // Sent: the boundary the engine needs, so July 31 is included.
    expect(insightQueryFromConfig(config).range).toEqual({
      from: "2026-07-01",
      to: "2026-08-01T00:00:00.000Z",
    });
  });

  it("passes a preset through untouched for the server to resolve", () => {
    const config = insightConfigFromDraft(
      draft({ dimension: null, chart: "kpi", range: { preset: "last_month" } }),
      dataset.limits.maxRangeDays,
    )!;
    expect(insightQueryFromConfig(config).range).toEqual({ preset: "last_month" });
  });

  it("refuses to build a saveable config from an invalid range", () => {
    // Previously the preview was blocked but Apply stayed enabled, so a broken
    // range could be persisted and only failed later on the dashboard.
    const bad = draft({
      dimension: null,
      chart: "kpi",
      range: { from: "2026-07-31", to: "2026-07-01" },
    });
    expect(insightConfigFromDraft(bad, dataset.limits.maxRangeDays)).toBeNull();
  });

  it("treats a single-day range as valid, not as an inverted one", () => {
    const sameDay = draft({
      dimension: null,
      chart: "kpi",
      range: { from: "2026-07-15", to: "2026-07-15" },
    });
    expect(insightConfigFromDraft(sameDay, dataset.limits.maxRangeDays)).not.toBeNull();
    expect(insightDraftIssues(FIXTURE_CATALOG, sameDay)).toEqual([]);
  });

  it("blocks the preview with plain-language issues for a bad range", () => {
    const issues = insightDraftIssues(
      FIXTURE_CATALOG,
      draft({ range: { from: "2026-01-01", to: "2026-07-01" } }),
    );
    expect(issues.some((i) => /at most 90 days/i.test(i))).toBe(true);
  });
});
