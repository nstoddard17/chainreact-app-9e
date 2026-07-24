/**
 * @jest-environment jsdom
 *
 * Update Vehicle Status field UI (FLEETIO-3).
 *
 * Renders the REAL update-vehicle-status fields through ComboboxField with the
 * options hook mocked, proving for THESE fields specifically (generic
 * ComboboxField mechanics are covered by its own suite):
 *   - New status is a combobox bound to fleetio:vehicle_statuses.
 *   - A mapped / manually-entered status id is NOT erased when the resolver
 *     fails to load (value is controlled; no onChange fires from a failed load).
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
import { fleetioUpdateVehicleStatusMeta } from "@/integrations/fleetio/actions/updateVehicleStatus.meta";

const statusField = fleetioUpdateVehicleStatusMeta.fields.find((f) => f.name === "vehicleStatusId")!;

function setHookState(state: UseOptionsSourceState): void {
  mockUseOptionsSource.mockReturnValue({ state, refetch: mockRefetch });
}

beforeEach(() => {
  mockUseOptionsSource.mockReset();
  mockRefetch.mockReset();
  useGraphSlice.getState().reset();
});

describe("Update Vehicle Status — New status field", () => {
  it("is a combobox bound to fleetio:vehicle_statuses with manual entry", () => {
    expect(statusField.type).toBe("combobox");
    expect(statusField.optionsSource).toBe("fleetio:vehicle_statuses");
    expect(statusField.allowManualEntry).toBe(true);
    expect(statusField.required).toBe(true);
  });

  it("renders loaded statuses with the 'New status' label", () => {
    setHookState({
      status: "ready",
      items: [
        { value: "1", label: "Active" },
        { value: "8", label: "Out of Service" },
      ],
      hasMore: false,
    });
    render(<ComboboxField field={statusField} value="" onChange={jest.fn()} />);
    expect(screen.getByText("New status")).toBeInTheDocument();
  });

  it("keeps a mapped status id visible when the resolver fails to load", () => {
    setHookState({ status: "error", items: [], hasMore: false, code: "PROVIDER_ERROR", message: "Couldn't load Fleetio vehicle statuses. Try again." });
    const onChange = jest.fn();
    const { container } = render(
      <ComboboxField field={statusField} value="{{previous.statusId}}" onChange={onChange} />,
    );
    expect(container.textContent).toContain("{{previous.statusId}}");
    expect(onChange).not.toHaveBeenCalled();
  });

  it("keeps a manually-entered status id visible on load error", () => {
    setHookState({ status: "error", items: [], hasMore: false, code: "PROVIDER_REAUTH_REQUIRED", message: "Reconnect Fleetio and try again." });
    const onChange = jest.fn();
    const { container } = render(<ComboboxField field={statusField} value="8" onChange={onChange} />);
    expect(container.textContent).toContain("8");
    expect(onChange).not.toHaveBeenCalled();
  });
});
