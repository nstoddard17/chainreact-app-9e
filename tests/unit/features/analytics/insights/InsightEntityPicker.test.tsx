jest.mock("@/lib/api/options", () => ({ fetchOptionsSource: jest.fn() }));

import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { fetchOptionsSource } from "@/lib/api/options";
import { InsightEntityPicker } from "@/features/analytics/insights/InsightEntityPicker";

const mockOptions = fetchOptionsSource as jest.MockedFunction<typeof fetchOptionsSource>;

const OPTIONS = [
  { value: "e-1", label: "Alpha" },
  { value: "e-2", label: "Beta" },
  { value: "e-3", label: "Gamma" },
];

beforeEach(() => mockOptions.mockReset());

describe("InsightEntityPicker (generic — nothing entity-specific)", () => {
  it("filters local options by search; selections survive a search change", () => {
    const onChange = jest.fn();
    const { rerender } = render(
      <InsightEntityPicker label="Items" selected={["e-2"]} max={8} onChange={onChange} options={OPTIONS} />,
    );
    // Selected chip visible with its label (stable id underneath).
    expect(screen.getByRole("button", { name: "Remove Beta" })).toBeTruthy();
    fireEvent.change(screen.getByLabelText("Search Items"), { target: { value: "alp" } });
    expect(screen.getByRole("option", { name: /Alpha/ })).toBeTruthy();
    expect(screen.queryByRole("option", { name: /Gamma/ })).toBeNull();
    // Chip still visible although Beta is filtered out of the list.
    expect(screen.getByRole("button", { name: "Remove Beta" })).toBeTruthy();
    fireEvent.click(screen.getByRole("option", { name: /Alpha/ }));
    expect(onChange).toHaveBeenCalledWith(["e-2", "e-1"]);
    rerender(
      <InsightEntityPicker label="Items" selected={["e-2", "e-1"]} max={8} onChange={onChange} options={OPTIONS} />,
    );
    expect(screen.getByText("2/8 selected")).toBeTruthy();
  });

  it("enforces the maximum selection count", () => {
    const onChange = jest.fn();
    render(
      <InsightEntityPicker
        label="Items"
        selected={["e-1", "e-2"]}
        max={2}
        onChange={onChange}
        options={OPTIONS}
      />,
    );
    const gamma = screen.getByRole("option", { name: /Gamma/ }) as HTMLButtonElement;
    expect(gamma.disabled).toBe(true);
  });

  it("single-select (max 1) replaces instead of appending", () => {
    const onChange = jest.fn();
    render(
      <InsightEntityPicker label="Customer" selected={["e-1"]} max={1} onChange={onChange} options={OPTIONS} />,
    );
    fireEvent.click(screen.getByRole("option", { name: /Beta/ }));
    expect(onChange).toHaveBeenCalledWith(["e-2"]);
  });

  it("Clear empties the selection", () => {
    const onChange = jest.fn();
    render(
      <InsightEntityPicker label="Items" selected={["e-1", "e-2"]} max={8} onChange={onChange} options={OPTIONS} />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Clear" }));
    expect(onChange).toHaveBeenCalledWith([]);
  });

  it("options-source mode searches through the typed client with debounce (no per-keystroke fetch)", async () => {
    jest.useFakeTimers();
    try {
      mockOptions.mockResolvedValue({
        ok: true,
        source: "acme:items",
        items: [{ value: "r-1", label: "Remote One" }],
        hasMore: false,
      });
      const onChange = jest.fn();
      render(
        <InsightEntityPicker
          label="Items"
          selected={[]}
          max={8}
          onChange={onChange}
          optionsSource="acme:items"
        />,
      );
      const input = screen.getByLabelText("Search Items");
      fireEvent.change(input, { target: { value: "r" } });
      fireEvent.change(input, { target: { value: "re" } });
      fireEvent.change(input, { target: { value: "rem" } });
      await jest.advanceTimersByTimeAsync(400);
      // Initial mount + one debounced search — never one per keystroke.
      expect(mockOptions.mock.calls.length).toBeLessThanOrEqual(2);
      expect(mockOptions.mock.calls.at(-1)![1]).toMatchObject({ q: "rem" });
    } finally {
      jest.useRealTimers();
    }
  });

  it("renamed labels come from the option source, ids stay stable", async () => {
    mockOptions.mockResolvedValue({
      ok: true,
      source: "acme:items",
      items: [{ value: "r-1", label: "Renamed Thing" }],
      hasMore: false,
    });
    const onChange = jest.fn();
    render(
      <InsightEntityPicker
        label="Items"
        selected={["r-1"]}
        max={8}
        onChange={onChange}
        optionsSource="acme:items"
      />,
    );
    // Once the source responds, the chip shows the CURRENT label for the id.
    await waitFor(() => expect(screen.getAllByText("Renamed Thing").length).toBeGreaterThan(0));
    fireEvent.click(screen.getByRole("option", { name: /Renamed Thing/ }));
    expect(onChange).toHaveBeenCalledWith([]);
  });
});
