/**
 * @jest-environment jsdom
 *
 * Vehicle Links dashboard UI (5.TRUCK-BRIDGE-1 CS-4).
 *
 * REAL: the dashboard, the Linked table, the Unlinked list, the Fleetio picker,
 * and the real error-copy mapping. MOCKED: only the typed client API module
 * (`lib/api/vehicleLinks`) — the HTTP boundary.
 *
 * Business rules protected:
 *   - the Linked section leads with HUMAN names; raw ids live only in Details.
 *   - manual pairing needs no typed id and no JSON.
 *   - a source conflict surfaces friendly copy and only THEN offers an explicit
 *     "Replace link" — nothing is silently overwritten.
 *   - a target conflict never offers a Replace button.
 *   - Remove asks first, then archives; the vehicle returns to Unlinked.
 *   - a member sees data with no mutation affordances.
 *   - disconnected vs. error are distinct states, and neither shows raw text.
 *   - no fake suggestions: the Suggested section shows a disabled "Coming next".
 */
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { VehicleLinkView } from "@/contracts/vehicleLinks";

const mockCreate = jest.fn();
const mockArchive = jest.fn();
const mockOptions = jest.fn();

jest.mock("@/lib/api/vehicleLinks", () => {
  class VehicleLinkApiError extends Error {
    code: string;
    status: number;
    conflict: unknown;
    constructor(code: string, status: number, conflict: unknown = null) {
      super(code);
      this.name = "VehicleLinkApiError";
      this.code = code;
      this.status = status;
      this.conflict = conflict;
    }
  }
  return {
    VehicleLinkApiError,
    createVehicleLink: (...a: unknown[]) => mockCreate(...a),
    archiveVehicleLink: (...a: unknown[]) => mockArchive(...a),
    fetchVehicleOptions: (...a: unknown[]) => mockOptions(...a),
  };
});

import { VehicleLinksDashboard } from "@/features/apps/vehicleLinks/VehicleLinksDashboard";
import { VehicleLinkApiError } from "@/lib/api/vehicleLinks";

const ACCOUNT = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";

const LINK: VehicleLinkView = {
  id: "link-1",
  sourceVehicleId: "motive-veh-88231",
  sourceLabel: "Unit 104",
  targetVehicleId: "42",
  targetLabel: "Truck 104",
  matchBasis: "manual",
  confirmedByLabel: "Dana Owner",
  confirmedAt: "2026-07-20T10:00:00.000Z",
};

const UNLINKED = [
  { sourceVehicleId: "motive-veh-99999", label: "Unit 205" },
];

const FLEETIO_OPTIONS = {
  status: "ok" as const,
  items: [
    { value: "907", label: "Rig 7", description: "Active" },
    { value: "42", label: "Truck 104" },
  ],
  hasMore: false,
};

function renderDashboard(over: Partial<Parameters<typeof VehicleLinksDashboard>[0]> = {}) {
  return render(
    <VehicleLinksDashboard
      accountId={ACCOUNT}
      canManage
      links={[LINK]}
      motiveStatus="ok"
      motiveHasMore={false}
      unlinked={UNLINKED}
      {...over}
    />,
  );
}

beforeEach(() => {
  jest.useFakeTimers({ advanceTimers: true });
  mockCreate.mockReset();
  mockArchive.mockReset();
  mockOptions.mockReset();
  mockOptions.mockResolvedValue(FLEETIO_OPTIONS);
});
afterEach(() => {
  jest.useRealTimers();
});

describe("Linked section", () => {
  it("leads with human names and keeps raw ids inside Details only", () => {
    renderDashboard();
    const row = screen.getByTestId("linked-row");
    expect(row).toHaveTextContent("Unit 104");
    expect(row).toHaveTextContent("Truck 104");
    expect(row).toHaveTextContent("Linked by hand");
    expect(row).toHaveTextContent("Confirmed by Dana Owner");

    // Raw ids exist for support, inside the collapsed disclosure — not as the
    // row's identity, and never required for any task.
    const details = row.querySelector("details");
    expect(details).not.toBeNull();
    expect(details).toHaveTextContent("motive-veh-88231");
    expect(details).toHaveTextContent("42");
    expect(details!.hasAttribute("open")).toBe(false);
  });

  it("says the names are snapshots, so a rename doesn't read as corruption", () => {
    renderDashboard();
    expect(screen.getByText(/were\s+saved when each link was confirmed/i)).toBeInTheDocument();
  });

  it("shows an empty state when nothing is linked", () => {
    renderDashboard({ links: [] });
    expect(screen.getByTestId("linked-empty")).toHaveTextContent(/No vehicles are linked yet/i);
  });

  it("asks for confirmation before removing, then archives and returns the vehicle to Unlinked", async () => {
    const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });
    mockArchive.mockResolvedValueOnce(undefined);
    renderDashboard();

    await user.click(screen.getByTestId("remove-link"));
    // Nothing has been sent yet — the click only opened the confirmation.
    expect(mockArchive).not.toHaveBeenCalled();
    expect(screen.getByText(/Remove this link\?/i)).toBeInTheDocument();

    await user.click(screen.getByTestId("confirm-remove"));
    await waitFor(() => expect(mockArchive).toHaveBeenCalledWith(ACCOUNT, "link-1"));
    await waitFor(() => expect(screen.getByTestId("linked-empty")).toBeInTheDocument());

    // The truck becomes re-linkable, so it reappears in the Unlinked list.
    expect(screen.getByTestId("unlinked-list")).toHaveTextContent("Unit 104");
  });

  it("'Keep' cancels the removal", async () => {
    const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });
    renderDashboard();
    await user.click(screen.getByTestId("remove-link"));
    await user.click(screen.getByRole("button", { name: "Keep" }));
    expect(mockArchive).not.toHaveBeenCalled();
    expect(screen.getByTestId("linked-row")).toBeInTheDocument();
  });

  it("shows friendly copy — never raw server text — when removal fails", async () => {
    const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });
    mockArchive.mockRejectedValueOnce(new VehicleLinkApiError("NOT_FOUND", 404));
    renderDashboard();
    await user.click(screen.getByTestId("remove-link"));
    await user.click(screen.getByTestId("confirm-remove"));
    await waitFor(() =>
      expect(screen.getByTestId("dashboard-error")).toHaveTextContent(
        /That link no longer exists/i,
      ),
    );
    expect(screen.getByTestId("dashboard-error")).not.toHaveTextContent("NOT_FOUND");
  });
});

describe("manual pairing", () => {
  it("pairs from two real pickers with NO typed id and NO JSON", async () => {
    const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });
    mockCreate.mockResolvedValueOnce({
      ...LINK,
      id: "link-2",
      sourceVehicleId: "motive-veh-99999",
      sourceLabel: "Unit 205",
      targetVehicleId: "907",
      targetLabel: "Rig 7",
    });
    renderDashboard();

    await user.click(screen.getByTestId("pair-toggle"));
    await waitFor(() => expect(screen.getByTestId("fleetio-vehicle-picker")).toBeInTheDocument());
    await waitFor(() => expect(screen.getByRole("option", { name: /Rig 7/ })).toBeInTheDocument());

    // Link is disabled until a Fleetio vehicle is chosen.
    expect(screen.getByTestId("confirm-link")).toBeDisabled();
    await user.click(screen.getByRole("option", { name: /Rig 7/ }));
    expect(screen.getByTestId("confirm-link")).toBeEnabled();
    await user.click(screen.getByTestId("confirm-link"));

    await waitFor(() =>
      expect(mockCreate).toHaveBeenCalledWith(ACCOUNT, {
        sourceVehicleId: "motive-veh-99999",
        sourceLabel: "Unit 205",
        targetVehicleId: "907",
        targetLabel: "Rig 7",
      }),
    );
    // No `replaceExisting` on a first attempt — replacement is never implicit.
    expect(mockCreate.mock.calls[0]![1]).not.toHaveProperty("replaceExisting");

    // The new mapping appears in Linked and leaves Unlinked.
    await waitFor(() => expect(screen.getByTestId("unlinked-empty")).toBeInTheDocument());
    expect(screen.getAllByTestId("linked-row")).toHaveLength(2);

    // Nothing in the UI ever asked the user to type an id or edit JSON.
    expect(screen.queryByRole("textbox", { name: /vehicle id/i })).toBeNull();
    expect(document.body.textContent).not.toMatch(/paste .*json/i);
  });

  it("a SOURCE conflict shows friendly copy and only THEN offers an explicit Replace", async () => {
    const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });
    mockCreate.mockRejectedValueOnce(
      new VehicleLinkApiError("SOURCE_ALREADY_LINKED", 409, {
        sourceLabel: "Unit 205",
        targetLabel: "Truck 104",
      }),
    );
    renderDashboard();

    await user.click(screen.getByTestId("pair-toggle"));
    await waitFor(() => expect(screen.getByRole("option", { name: /Rig 7/ })).toBeInTheDocument());
    await user.click(screen.getByRole("option", { name: /Rig 7/ }));
    await user.click(screen.getByTestId("confirm-link"));

    await waitFor(() =>
      expect(screen.getByTestId("row-error")).toHaveTextContent(
        /already linked to “Truck 104”/i,
      ),
    );
    // The plain "Link" button is gone; the ONLY way forward is a button that
    // says Replace — so replacement is always a deliberate second action.
    expect(screen.queryByTestId("confirm-link")).toBeNull();
    const replace = screen.getByTestId("replace-link");
    expect(replace).toHaveTextContent("Replace link");

    mockCreate.mockResolvedValueOnce({
      ...LINK,
      id: "link-3",
      sourceVehicleId: "motive-veh-99999",
      sourceLabel: "Unit 205",
      targetVehicleId: "907",
      targetLabel: "Rig 7",
    });
    await user.click(replace);
    await waitFor(() => expect(mockCreate).toHaveBeenCalledTimes(2));
    expect(mockCreate.mock.calls[1]![1]).toMatchObject({ replaceExisting: true });
  });

  it("a TARGET conflict never unlocks a Replace button", async () => {
    const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });
    mockCreate.mockRejectedValueOnce(
      new VehicleLinkApiError("TARGET_ALREADY_LINKED", 409, {
        sourceLabel: "Unit 104",
        targetLabel: "Truck 104",
      }),
    );
    renderDashboard();

    await user.click(screen.getByTestId("pair-toggle"));
    await waitFor(() => expect(screen.getByRole("option", { name: /Truck 104/ })).toBeInTheDocument());
    await user.click(screen.getByRole("option", { name: /Truck 104/ }));
    await user.click(screen.getByTestId("confirm-link"));

    await waitFor(() =>
      expect(screen.getByTestId("row-error")).toHaveTextContent(
        /already linked to “Unit 104”.*Remove that link first/i,
      ),
    );
    expect(screen.queryByTestId("replace-link")).toBeNull();
    expect(screen.getByTestId("confirm-link")).toBeInTheDocument();
  });
});

describe("Fleetio picker states", () => {
  it("shows a loading state, then the options", async () => {
    const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });
    let resolve!: (v: unknown) => void;
    mockOptions.mockReturnValueOnce(new Promise((r) => (resolve = r)));
    renderDashboard();
    await user.click(screen.getByTestId("pair-toggle"));
    expect(screen.getByTestId("fleetio-picker-loading")).toBeInTheDocument();
    resolve(FLEETIO_OPTIONS);
    await waitFor(() => expect(screen.getByRole("option", { name: /Rig 7/ })).toBeInTheDocument());
  });

  it("distinguishes DISCONNECTED from ERROR, with no provider detail in either", async () => {
    const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });

    mockOptions.mockResolvedValueOnce({ status: "disconnected", items: [], hasMore: false });
    const first = renderDashboard();
    await user.click(screen.getByTestId("pair-toggle"));
    await waitFor(() =>
      expect(screen.getByTestId("fleetio-picker-disconnected")).toHaveTextContent(
        /Fleetio isn't connected for this account yet/i,
      ),
    );
    first.unmount();

    mockOptions.mockResolvedValueOnce({ status: "error", items: [], hasMore: false });
    renderDashboard();
    await user.click(screen.getByTestId("pair-toggle"));
    await waitFor(() =>
      expect(screen.getByTestId("fleetio-picker-error")).toHaveTextContent(
        /Couldn't load Fleetio vehicles just now/i,
      ),
    );
    expect(screen.getByTestId("fleetio-picker-error").textContent).not.toMatch(
      /http|401|403|500|token/i,
    );
  });

  it("shows an empty state when no Fleetio vehicle matches", async () => {
    const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });
    mockOptions.mockResolvedValueOnce({ status: "ok", items: [], hasMore: false });
    renderDashboard();
    await user.click(screen.getByTestId("pair-toggle"));
    await waitFor(() =>
      expect(screen.getByTestId("fleetio-picker-empty")).toBeInTheDocument(),
    );
  });
});

describe("Unlinked / Motive list states", () => {
  it("shows a DISCONNECTED state instead of an empty fleet", () => {
    renderDashboard({ motiveStatus: "disconnected", unlinked: [] });
    expect(screen.getByTestId("motive-disconnected")).toHaveTextContent(
      /Motive isn't connected for this account yet/i,
    );
    expect(screen.queryByTestId("unlinked-empty")).toBeNull();
  });

  it("shows an ERROR state distinct from 'everything is linked'", () => {
    renderDashboard({ motiveStatus: "error", unlinked: [] });
    expect(screen.getByTestId("motive-error")).toHaveTextContent(/Couldn't load Motive vehicles/i);
  });

  it("shows the all-linked empty state when every vehicle is paired", () => {
    renderDashboard({ unlinked: [] });
    expect(screen.getByTestId("unlinked-empty")).toHaveTextContent(/already linked/i);
  });
});

describe("member (view-only)", () => {
  it("sees the links but no Remove, no pairing, and an explanation", () => {
    renderDashboard({ canManage: false });
    expect(screen.getByTestId("linked-row")).toHaveTextContent("Truck 104");
    expect(screen.queryByTestId("remove-link")).toBeNull();
    expect(screen.queryByTestId("pair-toggle")).toBeNull();
    expect(screen.getByTestId("view-only-note")).toHaveTextContent(
      /Only account owners and admins can change them/i,
    );
    expect(screen.getByTestId("unlinked-row")).toHaveTextContent(
      /Ask an owner or admin to link this vehicle/i,
    );
  });
});

describe("Suggested section is honestly empty", () => {
  it("renders a 'Coming next' note with NO candidate rows and no counts", () => {
    renderDashboard();
    const suggested = screen.getByTestId("suggested-placeholder");
    expect(suggested).toHaveTextContent("Suggested");
    expect(suggested).toHaveTextContent("Coming next");
    // No fake proposals, no confirm affordance, no fabricated evidence.
    expect(suggested.querySelectorAll("button")).toHaveLength(0);
    expect(suggested.textContent).not.toMatch(/VIN 1|match(ed)? on|\d+ suggestion/i);
  });
});
