/**
 * Tests for features/apps/AppStatusPill.
 *
 * Three states conveyed by icon + text + Badge variant (never color alone):
 * Connected / Reconnect needed (V2-READY-28) / Not connected.
 */
import { render, screen } from "@testing-library/react";
import { AppStatusPill } from "@/features/apps/AppStatusPill";

describe("AppStatusPill", () => {
  it("renders Connected when connected and not needing reconnect", () => {
    render(<AppStatusPill isConnected />);
    const pill = screen.getByTestId("app-status-pill");
    expect(pill).toHaveAttribute("data-state", "connected");
    expect(pill).toHaveTextContent(/^Connected$/);
  });

  it("renders Reconnect needed when connected AND needsReconnect (V2-READY-28)", () => {
    render(<AppStatusPill isConnected needsReconnect />);
    const pill = screen.getByTestId("app-status-pill");
    expect(pill).toHaveAttribute("data-state", "needs-reconnect");
    expect(pill).toHaveTextContent(/reconnect needed/i);
    expect(pill).toHaveAttribute("aria-label", "Status: reconnect needed");
  });

  it("renders Not connected when not connected (needsReconnect ignored)", () => {
    render(<AppStatusPill isConnected={false} needsReconnect />);
    const pill = screen.getByTestId("app-status-pill");
    expect(pill).toHaveAttribute("data-state", "not-connected");
    expect(pill).toHaveTextContent(/not connected/i);
  });

  it("needsReconnect defaults to the Connected state when omitted", () => {
    render(<AppStatusPill isConnected />);
    expect(screen.getByTestId("app-status-pill")).toHaveAttribute("data-state", "connected");
  });
});
