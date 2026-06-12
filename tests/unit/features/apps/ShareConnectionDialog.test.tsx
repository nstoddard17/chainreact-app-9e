/**
 * Tests for features/apps/ShareConnectionDialog (Slice 4.CONN-SHARE / CS-5a).
 * Mocks the typed client so no real fetch happens; asserts the confirmation copy,
 * the correct scope per mode, success → onDone, and a SAFE generic error message.
 */
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const mockSetSharing = jest.fn();
jest.mock("@/lib/api/integrations", () => ({
  setIntegrationSharing: (...a: unknown[]) => mockSetSharing(...a),
}));

import { ShareConnectionDialog } from "@/features/apps/ShareConnectionDialog";

function setup(mode: "share" | "unshare", onDone = jest.fn(), onClose = jest.fn()) {
  render(
    <ShareConnectionDialog
      accountId="acc-1"
      integrationId="int-1"
      appName="Gmail"
      accountLabel="Personal · marcus@example.com"
      mode={mode}
      onClose={onClose}
      onDone={onDone}
    />,
  );
  return { onDone, onClose };
}

beforeEach(() => jest.clearAllMocks());

describe("ShareConnectionDialog", () => {
  it("share mode shows the run-warning copy", () => {
    setup("share");
    expect(screen.getByTestId("share-warning")).toHaveTextContent(
      "Team members will be able to run workflows using this connection.",
    );
  });

  it("unshare mode shows the creator-only warning copy", () => {
    setup("unshare");
    expect(screen.getByTestId("share-warning")).toHaveTextContent(
      "Team workflows using this connection may become creator-only again.",
    );
  });

  it("confirm (share) calls the route with shared_with_account, then onDone + onClose", async () => {
    mockSetSharing.mockResolvedValue({ scope: "shared_with_account", shared: true, changed: true });
    const { onDone, onClose } = setup("share");
    await userEvent.click(screen.getByTestId("share-confirm"));
    expect(mockSetSharing).toHaveBeenCalledWith("acc-1", "int-1", "shared_with_account");
    expect(onDone).toHaveBeenCalledTimes(1);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("confirm (unshare) calls the route with private_to_connector", async () => {
    mockSetSharing.mockResolvedValue({ scope: "private_to_connector", shared: false, changed: true });
    setup("unshare");
    await userEvent.click(screen.getByTestId("share-confirm"));
    expect(mockSetSharing).toHaveBeenCalledWith("acc-1", "int-1", "private_to_connector");
  });

  it("failure (incl. flag-off not_enabled) shows a SAFE generic error; onDone NOT called", async () => {
    mockSetSharing.mockRejectedValue(new Error("Connection sharing is not available."));
    const { onDone } = setup("share");
    await userEvent.click(screen.getByTestId("share-confirm"));
    expect(await screen.findByTestId("share-error")).toHaveTextContent(
      "Couldn't share this connection. Please try again.",
    );
    expect(onDone).not.toHaveBeenCalled();
  });
});
