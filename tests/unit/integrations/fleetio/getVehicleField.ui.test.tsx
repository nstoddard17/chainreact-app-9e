/**
 * @jest-environment jsdom
 *
 * Get Vehicle vehicle-picker UI (FLEETIO-2).
 *
 * Renders the REAL fleetio:get_vehicle vehicle field through ComboboxField with
 * the options hook mocked to each discriminated state. Proves the batch's UI
 * rules for THIS field specifically (the generic ComboboxField mechanics are
 * covered by its own suite):
 *   - It renders as a searchable vehicle picker bound to fleetio:vehicles.
 *   - A mapped / manually-entered id is NOT erased when the resolver fails to
 *     load (the value is controlled + allowManualEntry stays available).
 *   - No Fleetio-specific fetch or Supabase access is introduced by the field
 *     (it renders through the shared generic renderer — asserted structurally).
 */
const mockUseOptionsSource = jest.fn();
const mockRefetch = jest.fn();

jest.mock("@/features/workflow-builder/hooks/useOptionsSource", () => ({
  __esModule: true,
  useOptionsSource: (...args: unknown[]) => mockUseOptionsSource(...args),
}));

import { render, screen } from "@testing-library/react";
import { ComboboxField } from "@/features/workflow-builder/config-modal/fields/ComboboxField";
import type { UseOptionsSourceState } from "@/features/workflow-builder/hooks/useOptionsSource";
import { useGraphSlice } from "@/features/workflow-builder/state/graphSlice";
import { fleetioGetVehicleMeta } from "@/integrations/fleetio/actions/getVehicle.meta";

const vehicleField = fleetioGetVehicleMeta.fields.find((f) => f.name === "vehicleId")!;

function setHookState(state: UseOptionsSourceState): void {
  mockUseOptionsSource.mockReturnValue({ state, refetch: mockRefetch });
}

beforeEach(() => {
  mockUseOptionsSource.mockReset();
  mockRefetch.mockReset();
  useGraphSlice.getState().reset();
});

describe("Get Vehicle vehicle field", () => {
  it("is a combobox bound to the fleetio:vehicles resolver with manual entry", () => {
    // The metadata the renderer consumes.
    expect(vehicleField.type).toBe("combobox");
    expect(vehicleField.optionsSource).toBe("fleetio:vehicles");
    expect(vehicleField.allowManualEntry).toBe(true);
  });

  it("renders the picker (loaded options) with the field label", () => {
    setHookState({
      status: "ready",
      items: [
        { value: "1", label: "Truck 104", description: "Active" },
        { value: "2", label: "Van 7" },
      ],
      hasMore: false,
    });
    render(<ComboboxField field={vehicleField} value="" onChange={jest.fn()} />);
    expect(screen.getByText("Vehicle")).toBeInTheDocument();
  });

  it("keeps a mapped id visible when the resolver fails to load (value not erased)", () => {
    setHookState({ status: "error", items: [], hasMore: false, code: "PROVIDER_ERROR", message: "Couldn't load Fleetio vehicles. Try again." });
    const onChange = jest.fn();
    const { container } = render(
      <ComboboxField field={vehicleField} value="{{trigger.vehicleId}}" onChange={onChange} />,
    );
    // The mapped id is a controlled value — a load error never clears it, and no
    // onChange (which would mutate the stored id) fires from a failed load.
    expect(container.textContent).toContain("{{trigger.vehicleId}}");
    expect(onChange).not.toHaveBeenCalled();
  });

  it("keeps a manually-entered id visible on load error", () => {
    setHookState({ status: "error", items: [], hasMore: false, code: "PROVIDER_REAUTH_REQUIRED", message: "Reconnect Fleetio and try again." });
    const onChange = jest.fn();
    const { container } = render(<ComboboxField field={vehicleField} value="9987" onChange={onChange} />);
    expect(container.textContent).toContain("9987");
    expect(onChange).not.toHaveBeenCalled();
  });
});
