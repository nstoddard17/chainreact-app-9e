/**
 * Tests for features/apps/DisconnectDialog (Slice 4.APPS-DISCONNECT / CD-3).
 *
 * Proves: the dialog loads workflow-impact on open BEFORE any confirm; renders
 * zero vs nonzero vs unavailable copy; Confirm calls disconnectIntegration and on
 * success fires onDisconnected + onClose; a failure shows a SAFE generic message
 * and keeps the dialog open; and no token / raw provider error / config ever
 * appears in the rendered UI.
 */
import type { ComponentProps } from "react";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const mockGetImpact = jest.fn();
const mockDisconnect = jest.fn();
jest.mock("@/lib/api/integrations", () => ({
  getIntegrationWorkflowImpact: (...a: unknown[]) => mockGetImpact(...a),
  disconnectIntegration: (...a: unknown[]) => mockDisconnect(...a),
}));

import { DisconnectDialog } from "@/features/apps/DisconnectDialog";

function renderDialog(over: Partial<ComponentProps<typeof DisconnectDialog>> = {}) {
  const onClose = jest.fn();
  const onDisconnected = jest.fn();
  render(
    <DisconnectDialog
      accountId="acc-1"
      integrationId="int-1"
      appName="Slack"
      accountLabel="Acme · ops@example.com"
      onClose={onClose}
      onDisconnected={onDisconnected}
      {...over}
    />,
  );
  return { onClose, onDisconnected };
}

beforeEach(() => {
  mockGetImpact.mockReset();
  mockDisconnect.mockReset().mockResolvedValue({
    disconnected: true,
    alreadyDisconnected: false,
    providerRevoked: true,
    workflowsDisabled: 0,
  });
});

describe("DisconnectDialog", () => {
  it("calls workflow-impact on open, BEFORE any confirm", async () => {
    mockGetImpact.mockResolvedValueOnce({ affectedWorkflowCount: 0, workflows: [] });
    renderDialog();
    await waitFor(() => expect(mockGetImpact).toHaveBeenCalledWith("acc-1", "int-1"));
    expect(mockDisconnect).not.toHaveBeenCalled();
  });

  it("shows the lighter zero-impact copy when no workflows are affected", async () => {
    mockGetImpact.mockResolvedValueOnce({ affectedWorkflowCount: 0, workflows: [] });
    renderDialog();
    expect(await screen.findByTestId("disconnect-impact-zero")).toHaveTextContent(
      /no active or paused workflows/i,
    );
  });

  it("shows the warning copy + count + no-auto-resume note for nonzero impact", async () => {
    mockGetImpact.mockResolvedValueOnce({
      affectedWorkflowCount: 3,
      workflows: [{ id: "w1", name: "A" }, { id: "w2", name: "B" }, { id: "w3", name: "C" }],
    });
    renderDialog();
    const block = await screen.findByTestId("disconnect-impact-nonzero");
    expect(screen.getByTestId("disconnect-impact-count")).toHaveTextContent("3");
    expect(block).toHaveTextContent(/will not resume automatically/i);
    expect(block).toHaveTextContent(/resumed manually/i);
  });

  it("falls back to neutral advisory copy when the impact check fails (never the raw error)", async () => {
    mockGetImpact.mockRejectedValueOnce(new Error("boom-secret-internal"));
    renderDialog();
    const note = await screen.findByTestId("disconnect-impact-unavailable");
    expect(note).toHaveTextContent(/may disable workflows/i);
    expect(note.textContent ?? "").not.toContain("boom-secret-internal");
  });

  it("Confirm calls disconnectIntegration; success fires onDisconnected + onClose", async () => {
    mockGetImpact.mockResolvedValueOnce({ affectedWorkflowCount: 0, workflows: [] });
    const user = userEvent.setup();
    const { onClose, onDisconnected } = renderDialog();
    await screen.findByTestId("disconnect-impact-zero");
    await user.click(screen.getByTestId("disconnect-confirm"));
    await waitFor(() => expect(mockDisconnect).toHaveBeenCalledWith("acc-1", "int-1"));
    expect(onDisconnected).toHaveBeenCalledTimes(1);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("on failure shows a SAFE generic error and keeps the dialog open", async () => {
    mockGetImpact.mockResolvedValueOnce({ affectedWorkflowCount: 0, workflows: [] });
    mockDisconnect.mockRejectedValueOnce(new Error(`${(["xoxb", "secret", "token"].join("-"))} / provider 500 body`));
    const user = userEvent.setup();
    const { onClose, onDisconnected } = renderDialog();
    await screen.findByTestId("disconnect-impact-zero");
    await user.click(screen.getByTestId("disconnect-confirm"));
    const err = await screen.findByTestId("disconnect-error");
    expect(err).toHaveTextContent(/couldn't disconnect this app/i);
    expect(err.textContent ?? "").not.toContain((["xoxb", "secret", "token"].join("-")));
    expect(err.textContent ?? "").not.toContain("provider 500");
    expect(onDisconnected).not.toHaveBeenCalled();
    expect(onClose).not.toHaveBeenCalled();
  });

  it("NO LEAK: the rendered dialog never shows a token, raw provider body, or config", async () => {
    mockGetImpact.mockResolvedValueOnce({ affectedWorkflowCount: 1, workflows: [{ id: "w1", name: "Daily digest" }] });
    const { container } = render(
      <DisconnectDialog
        accountId="acc-1"
        integrationId="int-1"
        appName="Slack"
        accountLabel="Acme · ops@example.com"
        onClose={jest.fn()}
        onDisconnected={jest.fn()}
      />,
    );
    await screen.findByTestId("disconnect-impact-nonzero");
    const text = container.textContent ?? "";
    expect(text).not.toMatch(/xox[a-z]-|token|secret|access_token|refresh_token/i);
  });
});
