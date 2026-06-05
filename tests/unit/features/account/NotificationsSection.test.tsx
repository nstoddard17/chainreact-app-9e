/**
 * Tests for features/account/NotificationsSection (Slice 4.ACCOUNT-SETTINGS-4).
 *
 * Loads preferences from the API on mount, renders a switch per preference, and
 * auto-saves on toggle (optimistic; reverts + errors on failure). The client is
 * mocked — we assert the load, toggle save, success/error/loading states.
 */
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { NotificationsSection } from "@/features/account/NotificationsSection";

const mockGet = jest.fn();
const mockUpdate = jest.fn();
jest.mock("@/lib/api/accounts", () => {
  class AccountApiError extends Error {
    code: string;
    status: number;
    constructor(message: string, code = "VALIDATION", status = 400) {
      super(message);
      this.code = code;
      this.status = status;
    }
  }
  return {
    AccountApiError,
    getNotificationPreferences: (...a: unknown[]) => mockGet(...a),
    updateNotificationPreferences: (...a: unknown[]) => mockUpdate(...a),
  };
});

import { AccountApiError } from "@/lib/api/accounts";

const LOADED = { productUpdates: false, workflowAlerts: true, teamActivity: false };

beforeEach(() => {
  mockGet.mockReset();
  mockUpdate.mockReset();
});

describe("NotificationsSection", () => {
  it("loads preferences from the API and reflects them in the switches", async () => {
    mockGet.mockResolvedValue(LOADED);
    render(<NotificationsSection />);
    expect(mockGet).toHaveBeenCalledTimes(1);

    const workflow = await screen.findByTestId("notify-toggle-workflowAlerts");
    expect(workflow).toHaveAttribute("aria-checked", "true");
    expect(screen.getByTestId("notify-toggle-teamActivity")).toHaveAttribute("aria-checked", "false");
    expect(screen.getByTestId("notify-toggle-productUpdates")).toHaveAttribute("aria-checked", "false");
  });

  it("shows a loading state before the preferences arrive", () => {
    mockGet.mockReturnValue(new Promise(() => {})); // never resolves
    render(<NotificationsSection />);
    expect(screen.getByTestId("notify-loading")).toBeInTheDocument();
  });

  it("toggles a preference, saves via the API, and shows the success state", async () => {
    mockGet.mockResolvedValue(LOADED);
    mockUpdate.mockResolvedValue({ ...LOADED, teamActivity: true });
    const user = userEvent.setup();
    render(<NotificationsSection />);
    const teamToggle = await screen.findByTestId("notify-toggle-teamActivity");

    await user.click(teamToggle);
    await waitFor(() =>
      expect(mockUpdate).toHaveBeenCalledWith({
        productUpdates: false,
        workflowAlerts: true,
        teamActivity: true,
      }),
    );
    expect(await screen.findByTestId("notify-saved")).toBeInTheDocument();
    expect(screen.getByTestId("notify-toggle-teamActivity")).toHaveAttribute("aria-checked", "true");
  });

  it("reverts the toggle and shows an error when the save fails", async () => {
    mockGet.mockResolvedValue(LOADED);
    mockUpdate.mockRejectedValue(new AccountApiError("Couldn't save.", "SERVER_ERROR", 500));
    const user = userEvent.setup();
    render(<NotificationsSection />);
    const workflowToggle = await screen.findByTestId("notify-toggle-workflowAlerts");
    expect(workflowToggle).toHaveAttribute("aria-checked", "true");

    await user.click(workflowToggle); // attempt to turn OFF
    expect(await screen.findByTestId("notify-error")).toBeInTheDocument();
    // Reverted to the pre-toggle value.
    expect(screen.getByTestId("notify-toggle-workflowAlerts")).toHaveAttribute("aria-checked", "true");
  });

  it("shows an error + retry when the initial load fails", async () => {
    mockGet.mockRejectedValueOnce(new Error("boom")).mockResolvedValueOnce(LOADED);
    const user = userEvent.setup();
    render(<NotificationsSection />);
    expect(await screen.findByTestId("notify-load-error")).toBeInTheDocument();

    await user.click(screen.getByTestId("notify-retry"));
    expect(await screen.findByTestId("notify-toggle-workflowAlerts")).toBeInTheDocument();
  });
});
