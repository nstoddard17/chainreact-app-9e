/**
 * QUICKBOOKS-INVOICES-INTEGRATION-RESOLVER-1 — the generic entity picker asks
 * the resolver to label the selection it OPENED with, so a saved choice from a
 * large catalog shows its name instead of a raw provider id.
 *
 * Provider-agnostic throughout: the picker is driven only by an `optionsSource`
 * string, exactly as it is for any other provider.
 */
import type { ComponentProps } from "react";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { InsightEntityPicker } from "@/features/analytics/insights/InsightEntityPicker";

const mockFetchOptionsSource = jest.fn();
jest.mock("@/lib/api/options", () => ({
  fetchOptionsSource: (...args: unknown[]) => mockFetchOptionsSource(...args),
}));

const SOURCE = "quickbooks:customers";

function ok(items: { value: string; label: string }[], hasMore = false) {
  return { ok: true as const, source: SOURCE, items, hasMore };
}

function renderPicker(props: Partial<ComponentProps<typeof InsightEntityPicker>> = {}) {
  const onChange = jest.fn();
  const utils = render(
    <InsightEntityPicker
      label="Customer"
      max={1}
      selected={[]}
      onChange={onChange}
      optionsSource={SOURCE}
      {...props}
    />,
  );
  return { ...utils, onChange };
}

beforeEach(() => {
  jest.useFakeTimers();
  mockFetchOptionsSource.mockReset();
  mockFetchOptionsSource.mockResolvedValue(ok([{ value: "1", label: "Aardvark Ltd" }]));
});
afterEach(() => {
  jest.runOnlyPendingTimers();
  jest.useRealTimers();
});

/** Advance past the picker's search debounce and flush the fetch promise. */
async function settle() {
  await act(async () => {
    jest.advanceTimersByTime(400);
  });
}

describe("saved-selection labelling", () => {
  it("asks the resolver to label the values it opened with", async () => {
    renderPicker({ selected: ["137"] });
    await settle();
    expect(mockFetchOptionsSource).toHaveBeenCalledWith(
      SOURCE,
      expect.objectContaining({ selected: ["137"] }),
    );
  });

  it("shows the resolved name instead of the raw id", async () => {
    mockFetchOptionsSource.mockResolvedValue(
      ok([
        { value: "137", label: "Zeta Industries" },
        { value: "1", label: "Aardvark Ltd" },
      ]),
    );
    renderPicker({ selected: ["137"] });
    await settle();
    // The name appears both as the selected chip and as its row in the list.
    await waitFor(() =>
      expect(screen.getAllByText("Zeta Industries").length).toBeGreaterThan(0),
    );
    expect(screen.getByLabelText("Remove Zeta Industries")).toBeInTheDocument();
    expect(screen.queryByText("137")).not.toBeInTheDocument();
  });

  it("sends no `selected` when the picker opens empty", async () => {
    renderPicker({ selected: [] });
    await settle();
    expect(mockFetchOptionsSource.mock.calls[0]![1]).not.toHaveProperty("selected");
  });

  it("keeps the chip labelled after a search that excludes the selection", async () => {
    mockFetchOptionsSource.mockResolvedValueOnce(
      ok([{ value: "137", label: "Zeta Industries" }]),
    );
    renderPicker({ selected: ["137"] });
    await settle();
    await waitFor(() =>
      expect(screen.getByLabelText("Remove Zeta Industries")).toBeInTheDocument(),
    );

    mockFetchOptionsSource.mockResolvedValueOnce(
      ok([{ value: "1", label: "Aardvark Ltd" }]),
    );
    fireEvent.change(screen.getByLabelText("Search Customer"), {
      target: { value: "aard" },
    });
    await settle();
    // The chip keeps its label even though the current page no longer holds it.
    expect(screen.getByLabelText("Remove Zeta Industries")).toBeInTheDocument();
  });
});

describe("fetch discipline", () => {
  it("debounces typing into a single request", async () => {
    renderPicker();
    await settle();
    const initial = mockFetchOptionsSource.mock.calls.length;

    const input = screen.getByLabelText("Search Customer");
    fireEvent.change(input, { target: { value: "z" } });
    fireEvent.change(input, { target: { value: "ze" } });
    fireEvent.change(input, { target: { value: "zet" } });
    await settle();
    expect(mockFetchOptionsSource.mock.calls.length).toBe(initial + 1);
    expect(mockFetchOptionsSource).toHaveBeenLastCalledWith(
      SOURCE,
      expect.objectContaining({ q: "zet" }),
    );
  });

  it("does not refetch when the user selects or clears an item", async () => {
    mockFetchOptionsSource.mockResolvedValue(
      ok([{ value: "1", label: "Aardvark Ltd" }]),
    );
    const { onChange, rerender } = renderPicker({ selected: [] });
    await settle();
    const afterOpen = mockFetchOptionsSource.mock.calls.length;

    fireEvent.click(screen.getByRole("option", { name: /Aardvark Ltd/ }));
    expect(onChange).toHaveBeenCalledWith(["1"]);

    rerender(
      <InsightEntityPicker
        label="Customer"
        max={1}
        selected={["1"]}
        onChange={onChange}
        optionsSource={SOURCE}
      />,
    );
    await settle();
    // Selecting must not spend another provider call.
    expect(mockFetchOptionsSource.mock.calls.length).toBe(afterOpen);
  });

  it("surfaces a safe error state without provider detail", async () => {
    mockFetchOptionsSource.mockResolvedValue({
      ok: false,
      source: SOURCE,
      code: "PROVIDER_ERROR",
      message: "raw provider detail",
    });
    renderPicker();
    await settle();
    await waitFor(() =>
      expect(screen.getByText(/Couldn't load choices/i)).toBeInTheDocument(),
    );
    expect(screen.queryByText(/raw provider detail/)).not.toBeInTheDocument();
  });
});

describe("selection behaviour is unchanged", () => {
  it("replaces the value in single-select mode", async () => {
    mockFetchOptionsSource.mockResolvedValue(
      ok([
        { value: "1", label: "Aardvark Ltd" },
        { value: "2", label: "Beta LLC" },
      ]),
    );
    const { onChange } = renderPicker({ selected: ["1"], max: 1 });
    await settle();
    fireEvent.click(screen.getByRole("option", { name: /Beta LLC/ }));
    expect(onChange).toHaveBeenCalledWith(["2"]);
  });

  it("clears a selection from its chip", async () => {
    mockFetchOptionsSource.mockResolvedValue(
      ok([{ value: "1", label: "Aardvark Ltd" }]),
    );
    const { onChange } = renderPicker({ selected: ["1"] });
    await settle();
    fireEvent.click(screen.getByLabelText("Remove Aardvark Ltd"));
    expect(onChange).toHaveBeenCalledWith([]);
  });

  it("exposes the list and its options accessibly", async () => {
    renderPicker();
    await settle();
    expect(screen.getByRole("listbox", { name: "Customer" })).toBeInTheDocument();
    await waitFor(() =>
      expect(screen.getAllByRole("option").length).toBeGreaterThan(0),
    );
    expect(screen.getByRole("option", { name: /Aardvark Ltd/ })).toHaveAttribute(
      "aria-selected",
    );
  });
});
