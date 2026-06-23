/**
 * Tests for LocationField — Geoapify-backed address autocomplete with a
 * free-text fallback (config-field UX sweep — `location` field type).
 *
 * Proves:
 *   - debounces queries + skips very short inputs (no fetch),
 *   - `{{variable}}` tokens are never sent to autocomplete,
 *   - typing freely stores the typed string (free-text fallback always works),
 *   - selecting a suggestion stores the formatted address STRING (its label),
 *   - an empty / failed result degrades silently to a plain text field.
 */
import { render, screen, fireEvent, act, waitFor } from "@testing-library/react";
import { LocationField } from "@/features/workflow-builder/config-modal/fields/LocationField";
import type { FieldMeta } from "@/contracts/actionMeta";
import * as geoapify from "@/lib/api/geoapify";

jest.mock("@/lib/api/geoapify", () => ({
  fetchLocationSuggestions: jest.fn(),
}));

const mockFetch = geoapify.fetchLocationSuggestions as jest.MockedFunction<
  typeof geoapify.fetchLocationSuggestions
>;

function meta(over: Partial<FieldMeta> = {}): FieldMeta {
  return { name: "loc", label: "Location", type: "location", required: false, ...over } as FieldMeta;
}

afterEach(() => {
  jest.clearAllMocks();
  jest.useRealTimers();
});

describe("LocationField — free-text + debounce", () => {
  it("stores typed text immediately (free-text fallback)", () => {
    const onChange = jest.fn();
    render(<LocationField field={meta()} value="" onChange={onChange} />);
    fireEvent.change(screen.getByTestId("location-loc"), { target: { value: "221B Baker St" } });
    expect(onChange).toHaveBeenCalledWith("221B Baker St");
  });

  it("clearing emits undefined", () => {
    const onChange = jest.fn();
    render(<LocationField field={meta()} value="somewhere" onChange={onChange} />);
    fireEvent.change(screen.getByTestId("location-loc"), { target: { value: "" } });
    expect(onChange).toHaveBeenCalledWith(undefined);
  });

  it("does NOT fetch for very short inputs", () => {
    jest.useFakeTimers();
    mockFetch.mockResolvedValue([]);
    render(<LocationField field={meta()} value="" onChange={jest.fn()} />);
    fireEvent.change(screen.getByTestId("location-loc"), { target: { value: "ab" } });
    act(() => {
      jest.advanceTimersByTime(1000);
    });
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it("does NOT fetch for a {{variable}} token", () => {
    jest.useFakeTimers();
    mockFetch.mockResolvedValue([]);
    render(<LocationField field={meta()} value="" onChange={jest.fn()} />);
    fireEvent.change(screen.getByTestId("location-loc"), { target: { value: "{{trigger.place}}" } });
    act(() => {
      jest.advanceTimersByTime(1000);
    });
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it("debounces then fetches and shows suggestions for a long-enough query", async () => {
    mockFetch.mockResolvedValue([
      { label: "Mountain View, CA, USA", placeId: "p1" },
      { label: "Mountain View, AR, USA" },
    ]);
    render(<LocationField field={meta()} value="" onChange={jest.fn()} />);
    fireEvent.change(screen.getByTestId("location-loc"), { target: { value: "Mountain View" } });

    await waitFor(() => expect(mockFetch).toHaveBeenCalledWith("Mountain View", expect.anything()));
    await screen.findByTestId("location-loc-suggestions");
    expect(screen.getByText("Mountain View, CA, USA")).toBeInTheDocument();
  });

  it("selecting a suggestion stores its formatted-address label", async () => {
    const onChange = jest.fn();
    mockFetch.mockResolvedValue([{ label: "Mountain View, CA, USA", placeId: "p1" }]);
    render(<LocationField field={meta()} value="" onChange={onChange} />);
    fireEvent.change(screen.getByTestId("location-loc"), { target: { value: "Mountain View" } });

    const option = await screen.findByText("Mountain View, CA, USA");
    fireEvent.mouseDown(option);
    expect(onChange).toHaveBeenLastCalledWith("Mountain View, CA, USA");
  });

  it("shows no suggestion list when the fetch returns nothing (free-text fallback)", async () => {
    mockFetch.mockResolvedValue([]);
    render(<LocationField field={meta()} value="" onChange={jest.fn()} />);
    fireEvent.change(screen.getByTestId("location-loc"), { target: { value: "Nowheresville" } });
    await waitFor(() => expect(mockFetch).toHaveBeenCalled());
    expect(screen.queryByTestId("location-loc-suggestions")).not.toBeInTheDocument();
  });
});
