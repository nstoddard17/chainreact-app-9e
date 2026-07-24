/**
 * @jest-environment jsdom
 *
 * Suggested matches + stale-link health UI (5.TRUCK-BRIDGE-1 CS-5).
 *
 * REAL: the dashboard, the Suggested section, the Linked table's health
 * rendering, and the real copy modules. MOCKED: only the typed client API
 * module (the HTTP boundary).
 *
 * Business rules protected:
 *   - every row shows its EVIDENCE verbatim, and no score/percentage anywhere.
 *   - nothing is saved because the tab rendered — every write needs a click.
 *   - an AMBIGUOUS row cannot be confirmed as proposed; it forces a pick.
 *   - dismissing removes only that row and never writes a link.
 *   - the bulk-confirm button is ABSENT while its gate is closed, and the copy
 *     says why without dead-ending the user.
 *   - "list unavailable" is worded distinctly from "no matches".
 *   - stale-link warnings render as guidance and never auto-archive; an OUTAGE
 *     is worded as unknown, never as deleted.
 *   - members see suggestions but no Confirm/Dismiss/bulk affordances.
 */
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { VehicleLinkView } from "@/contracts/vehicleLinks";
import type {
  VehicleSuggestionView,
  VehicleSuggestionsView,
} from "@/contracts/vehicleSuggestions";

const mockCreate = jest.fn();
const mockArchive = jest.fn();
const mockOptions = jest.fn();
const mockConfirmSuggestion = jest.fn();
const mockDismissSuggestion = jest.fn();
const mockBulkConfirm = jest.fn();

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
    confirmSuggestion: (...a: unknown[]) => mockConfirmSuggestion(...a),
    dismissSuggestion: (...a: unknown[]) => mockDismissSuggestion(...a),
    bulkConfirmVinMatches: (...a: unknown[]) => mockBulkConfirm(...a),
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

const VIN_SUGGESTION: VehicleSuggestionView = {
  sourceVehicleId: "motive-1",
  sourceLabel: "Unit 205",
  targetVehicleId: "907",
  targetLabel: "Truck 205",
  tier: "vin",
  confidence: "exact",
  evidence: "VIN 1FUJGLDR… matches",
  evidenceFingerprint: "vin|VIN 1FUJGLDR… matches",
  ambiguous: false,
  bulkConfirmable: true,
};

const WEAK_SUGGESTION: VehicleSuggestionView = {
  sourceVehicleId: "motive-2",
  sourceLabel: "Unit 306",
  targetVehicleId: "908",
  targetLabel: "Truck 306",
  tier: "name",
  confidence: "weak",
  evidence: 'Unit 306 appears in "Truck 306"',
  evidenceFingerprint: 'name|Unit 306 appears in "Truck 306"',
  ambiguous: false,
  bulkConfirmable: false,
};

const AMBIGUOUS_SUGGESTION: VehicleSuggestionView = {
  ...WEAK_SUGGESTION,
  sourceVehicleId: "motive-3",
  sourceLabel: "Unit 407",
  targetVehicleId: "909",
  targetLabel: "Truck 407 A",
  evidenceFingerprint: 'name|Unit 407 appears in "Truck 407 A"',
  evidence: 'Unit 407 appears in "Truck 407 A"',
  ambiguous: true,
  bulkConfirmable: false,
};

function suggestionsView(over: Partial<VehicleSuggestionsView> = {}): VehicleSuggestionsView {
  return {
    status: "ok",
    suggestions: [VIN_SUGGESTION, WEAK_SUGGESTION],
    bulkConfirmEnabled: false,
    bulkConfirmableCount: 1,
    partialInventory: false,
    ...over,
  };
}

function renderDashboard(over: Partial<Parameters<typeof VehicleLinksDashboard>[0]> = {}) {
  return render(
    <VehicleLinksDashboard
      accountId={ACCOUNT}
      canManage
      links={[LINK]}
      motiveStatus="ok"
      motiveHasMore={false}
      unlinked={[]}
      suggestions={suggestionsView()}
      health={[{ linkId: "link-1", statuses: ["ok"], needsAttention: false }]}
      {...over}
    />,
  );
}

beforeEach(() => {
  jest.useFakeTimers({ advanceTimers: true });
  for (const m of [
    mockCreate,
    mockArchive,
    mockOptions,
    mockConfirmSuggestion,
    mockDismissSuggestion,
    mockBulkConfirm,
  ]) {
    m.mockReset();
  }
  mockOptions.mockResolvedValue({
    status: "ok",
    items: [{ value: "909", label: "Truck 407 A" }, { value: "910", label: "Truck 407 B" }],
    hasMore: false,
  });
});
afterEach(() => {
  jest.useRealTimers();
});

describe("evidence, never scores", () => {
  it("shows each row's evidence sentence verbatim", () => {
    renderDashboard();
    const evidence = screen.getAllByTestId("suggestion-evidence").map((e) => e.textContent);
    expect(evidence).toEqual(["VIN 1FUJGLDR… matches", 'Unit 306 appears in "Truck 306"']);
  });

  it("leads with human names on both sides, not raw provider ids", () => {
    renderDashboard();
    const [row] = screen.getAllByTestId("suggestion-row");
    expect(row).toHaveTextContent("Unit 205");
    expect(row).toHaveTextContent("Truck 205");
    // The ids exist in props but are not the row's headline.
    expect(row!.querySelector(".font-medium")!.textContent).not.toContain("motive-1");
    expect(row!.querySelector(".font-medium")!.textContent).not.toContain("907");
  });

  it("shows a match TYPE and a word-based confidence — never a percentage", () => {
    renderDashboard();
    const [row] = screen.getAllByTestId("suggestion-row");
    expect(row).toHaveTextContent("VIN");
    expect(row).toHaveTextContent("Exact match");
    expect(screen.getByTestId("suggestions-list").textContent).not.toMatch(/%|\b0\.\d+\b/);
  });

  it("renders nothing that saves on its own", () => {
    renderDashboard();
    expect(mockConfirmSuggestion).not.toHaveBeenCalled();
    expect(mockDismissSuggestion).not.toHaveBeenCalled();
    expect(mockBulkConfirm).not.toHaveBeenCalled();
  });
});

describe("confirm", () => {
  it("confirms a proposed pair and moves it into Linked", async () => {
    const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });
    mockConfirmSuggestion.mockResolvedValueOnce({
      ...LINK,
      id: "link-2",
      sourceVehicleId: "motive-1",
      sourceLabel: "Unit 205",
      targetVehicleId: "907",
      targetLabel: "Truck 205",
      matchBasis: "suggested_vin",
    });
    renderDashboard();

    await user.click(screen.getAllByTestId("suggestion-confirm")[0]!);
    await waitFor(() =>
      expect(mockConfirmSuggestion).toHaveBeenCalledWith(ACCOUNT, {
        sourceVehicleId: "motive-1",
        targetVehicleId: "907",
      }),
    );
    // The confirmed row leaves Suggested and appears in Linked.
    await waitFor(() => expect(screen.getAllByTestId("suggestion-row")).toHaveLength(1));
    expect(screen.getAllByTestId("linked-row")).toHaveLength(2);
  });

  it("shows friendly copy — never a raw code — when a confirm conflicts", async () => {
    const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });
    mockConfirmSuggestion.mockRejectedValueOnce(
      new VehicleLinkApiError("TARGET_ALREADY_LINKED", 409),
    );
    renderDashboard();

    await user.click(screen.getAllByTestId("suggestion-confirm")[0]!);
    await waitFor(() =>
      expect(screen.getByTestId("suggestion-error")).toHaveTextContent(
        /already linked to a different Motive vehicle/i,
      ),
    );
    expect(screen.getByTestId("suggestion-error")).not.toHaveTextContent("TARGET_ALREADY_LINKED");
    // The row stays so the user can dismiss it or fix the other link.
    expect(screen.getAllByTestId("suggestion-row")).toHaveLength(2);
  });
});

describe("ambiguous rows force a human choice", () => {
  it("cannot be confirmed until a specific Fleetio vehicle is picked", async () => {
    const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });
    renderDashboard({
      suggestions: suggestionsView({
        suggestions: [AMBIGUOUS_SUGGESTION],
        bulkConfirmableCount: 0,
      }),
    });

    const row = screen.getByTestId("suggestion-row");
    expect(within(row).getByTestId("suggestion-ambiguous")).toHaveTextContent(
      /won't pick for you/i,
    );
    // Confirm is disabled until the user names the vehicle.
    expect(within(row).getByTestId("suggestion-confirm")).toBeDisabled();

    await waitFor(() =>
      expect(within(row).getByRole("option", { name: /Truck 407 B/ })).toBeInTheDocument(),
    );
    await user.click(within(row).getByRole("option", { name: /Truck 407 B/ }));
    expect(within(row).getByTestId("suggestion-confirm")).toBeEnabled();

    mockConfirmSuggestion.mockResolvedValueOnce({ ...LINK, id: "link-9" });
    await user.click(within(row).getByTestId("suggestion-confirm"));
    // The CHOSEN vehicle is sent — not the proposed one.
    await waitFor(() =>
      expect(mockConfirmSuggestion).toHaveBeenCalledWith(ACCOUNT, {
        sourceVehicleId: "motive-3",
        targetVehicleId: "910",
      }),
    );
  });
});

describe("dismiss", () => {
  it("dismisses only that row, sending the evidence fingerprint", async () => {
    const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });
    mockDismissSuggestion.mockResolvedValueOnce(undefined);
    renderDashboard();

    await user.click(screen.getAllByTestId("suggestion-dismiss")[0]!);
    await waitFor(() =>
      expect(mockDismissSuggestion).toHaveBeenCalledWith(ACCOUNT, {
        sourceVehicleId: "motive-1",
        targetVehicleId: "907",
        tier: "vin",
        evidenceFingerprint: "vin|VIN 1FUJGLDR… matches",
      }),
    );
    await waitFor(() => expect(screen.getAllByTestId("suggestion-row")).toHaveLength(1));
    // Dismissing is NOT a link.
    expect(mockConfirmSuggestion).not.toHaveBeenCalled();
    expect(screen.getAllByTestId("linked-row")).toHaveLength(1);
  });
});

describe("bulk confirm gate", () => {
  it("renders NO bulk button while the gate is closed, and says why", () => {
    renderDashboard();
    expect(screen.queryByTestId("bulk-confirm-vin")).toBeNull();
    expect(screen.getByTestId("bulk-confirm-unavailable")).toHaveTextContent(
      /1 exact VIN match found.*individually/i,
    );
  });

  it("renders the bulk button ONLY when the gate is open", async () => {
    const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });
    mockBulkConfirm.mockResolvedValueOnce({ confirmed: [], skipped: 0 });
    renderDashboard({ suggestions: suggestionsView({ bulkConfirmEnabled: true }) });

    const button = screen.getByTestId("bulk-confirm-vin");
    expect(button).toHaveTextContent("Confirm all exact VIN matches (1)");
    await user.click(button);
    await waitFor(() => expect(mockBulkConfirm).toHaveBeenCalledWith(ACCOUNT));
  });

  it("offers no bulk affordance at all when nothing is bulk-eligible", () => {
    renderDashboard({
      suggestions: suggestionsView({
        suggestions: [WEAK_SUGGESTION],
        bulkConfirmEnabled: true,
        bulkConfirmableCount: 0,
      }),
    });
    expect(screen.queryByTestId("bulk-confirm-vin")).toBeNull();
    expect(screen.queryByTestId("bulk-confirm-unavailable")).toBeNull();
  });

  it("reports skipped rows honestly after a bulk run", async () => {
    const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });
    mockBulkConfirm.mockResolvedValueOnce({
      confirmed: [{ ...LINK, id: "link-5", sourceVehicleId: "motive-1", targetVehicleId: "907" }],
      skipped: 2,
    });
    renderDashboard({ suggestions: suggestionsView({ bulkConfirmEnabled: true }) });
    await user.click(screen.getByTestId("bulk-confirm-vin"));
    await waitFor(() =>
      expect(screen.getByTestId("dashboard-error")).toHaveTextContent(
        /1 linked\. 2 were skipped/i,
      ),
    );
  });
});

describe("suggestion list states", () => {
  it("distinguishes 'lists unavailable' from 'no matches'", () => {
    renderDashboard({ suggestions: suggestionsView({ status: "unavailable", suggestions: [] }) });
    const note = screen.getByTestId("suggestions-unavailable");
    expect(note).toHaveTextContent(/couldn't be loaded/i);
    // The crucial wording: absence of evidence is not evidence of absence.
    expect(note).toHaveTextContent(/does not mean there are no matches/i);
    expect(screen.queryByTestId("suggestions-empty")).toBeNull();
  });

  it("shows a genuine empty state when both lists loaded and nothing matched", () => {
    renderDashboard({ suggestions: suggestionsView({ suggestions: [], bulkConfirmableCount: 0 }) });
    expect(screen.getByTestId("suggestions-empty")).toHaveTextContent(/No suggested matches/i);
  });

  it("says so when a provider is not connected", () => {
    renderDashboard({ suggestions: suggestionsView({ status: "disconnected", suggestions: [] }) });
    expect(screen.getByTestId("suggestions-disconnected")).toHaveTextContent(
      /Connect both Motive and Fleetio/i,
    );
  });

  it("warns when the inventory page was truncated", () => {
    renderDashboard({ suggestions: suggestionsView({ partialInventory: true }) });
    expect(screen.getByTestId("suggestions-partial")).toHaveTextContent(/first page/i);
  });
});

describe("member (view-only)", () => {
  it("sees suggestions and evidence but no Confirm, Dismiss, or bulk action", () => {
    renderDashboard({
      canManage: false,
      suggestions: suggestionsView({ bulkConfirmEnabled: true }),
    });
    expect(screen.getAllByTestId("suggestion-row")).toHaveLength(2);
    expect(screen.getAllByTestId("suggestion-evidence")).toHaveLength(2);
    expect(screen.queryByTestId("suggestion-confirm")).toBeNull();
    expect(screen.queryByTestId("suggestion-dismiss")).toBeNull();
    expect(screen.queryByTestId("bulk-confirm-vin")).toBeNull();
  });
});

describe("stale-link health", () => {
  it("warns about a missing Fleetio target and offers Re-link (never auto-archives)", () => {
    renderDashboard({
      health: [{ linkId: "link-1", statuses: ["target_missing"], needsAttention: true }],
    });
    expect(screen.getByTestId("link-health-target_missing")).toHaveTextContent(
      /no longer in your Fleetio vehicle list/i,
    );
    expect(screen.getByTestId("relink")).toBeInTheDocument();
    // The mapping is still shown, with its stored snapshot names.
    expect(screen.getByTestId("linked-row")).toHaveTextContent("Unit 104");
    expect(screen.getByTestId("linked-row")).toHaveTextContent("Truck 104");
    expect(mockArchive).not.toHaveBeenCalled();
  });

  it("warns about a missing Motive source", () => {
    renderDashboard({
      health: [{ linkId: "link-1", statuses: ["source_missing"], needsAttention: true }],
    });
    expect(screen.getByTestId("link-health-source_missing")).toHaveTextContent(
      /no longer in your Motive vehicle list/i,
    );
  });

  it("warns about an ARCHIVED Fleetio target distinctly from missing", () => {
    renderDashboard({
      health: [{ linkId: "link-1", statuses: ["target_archived"], needsAttention: true }],
    });
    expect(screen.getByTestId("link-health-target_archived")).toHaveTextContent(
      /archived in Fleetio/i,
    );
    expect(screen.queryByTestId("link-health-target_missing")).toBeNull();
  });

  it("an OUTAGE reads as 'can't check', never as deleted, and offers no Re-link", () => {
    renderDashboard({
      health: [
        { linkId: "link-1", statuses: ["source_unknown", "target_unknown"], needsAttention: false },
      ],
    });
    const health = screen.getByTestId("link-health");
    expect(health).toHaveTextContent(/couldn't be loaded/i);
    expect(health).toHaveTextContent(/The link is unchanged/i);
    expect(health.textContent).not.toMatch(/no longer|deleted|removed/i);
    // Nothing to act on ⇒ no Re-link button.
    expect(screen.queryByTestId("relink")).toBeNull();
  });

  it("Re-link archives the mapping so the truck returns to Unlinked", async () => {
    const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });
    mockArchive.mockResolvedValueOnce(undefined);
    renderDashboard({
      health: [{ linkId: "link-1", statuses: ["target_missing"], needsAttention: true }],
    });
    await user.click(screen.getByTestId("relink"));
    await waitFor(() => expect(mockArchive).toHaveBeenCalledWith(ACCOUNT, "link-1"));
    await waitFor(() => expect(screen.getByTestId("linked-empty")).toBeInTheDocument());
    expect(screen.getByTestId("unlinked-list")).toHaveTextContent("Unit 104");
  });

  it("a healthy link renders no warning at all", () => {
    renderDashboard();
    expect(screen.queryByTestId("link-health")).toBeNull();
    expect(screen.getByTestId("linked-row")).toHaveAttribute("data-health", "ok");
  });
});
