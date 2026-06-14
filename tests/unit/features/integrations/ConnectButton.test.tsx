/**
 * Tests for features/integrations/ConnectButton.
 *
 * Verifies the data-access pattern: the component calls the typed client API
 * (`startOAuth`), never raw fetch. On success it navigates the browser via
 * `window.location.assign`. On failure it renders an inline error.
 */
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const mockStartOAuth = jest.fn();
jest.mock("@/lib/api/integrations", () => ({
  startOAuth: (...args: unknown[]) => mockStartOAuth(...args),
}));

import { ConnectButton } from "@/features/integrations/ConnectButton";

let assignSpy: jest.Mock;

beforeEach(() => {
  mockStartOAuth.mockReset();
  assignSpy = jest.fn();
  Object.defineProperty(window, "location", {
    configurable: true,
    value: { assign: assignSpy, href: "http://localhost/" },
  });
});

describe("ConnectButton", () => {
  it("calls startOAuth with the provider id and navigates to redirectUrl", async () => {
    mockStartOAuth.mockResolvedValueOnce({ redirectUrl: "https://slack.com/oauth/v2/authorize?x=1" });
    const user = userEvent.setup();
    render(<ConnectButton provider="slack" label="Connect Slack" />);
    await user.click(screen.getByRole("button", { name: /connect slack/i }));
    await waitFor(() => {
      // Plain Connect passes the optional reconnect arg slot as `undefined`
      // (APPS-RECONNECT extended startOAuth's signature). Assert the exact call.
      expect(mockStartOAuth).toHaveBeenCalledWith("slack", undefined);
      expect(assignSpy).toHaveBeenCalledWith("https://slack.com/oauth/v2/authorize?x=1");
    });
  });

  it("disables the button while the request is in flight", async () => {
    let resolveCall: (v: { redirectUrl: string }) => void = () => {};
    mockStartOAuth.mockImplementationOnce(
      () => new Promise((resolve) => (resolveCall = resolve)),
    );
    const user = userEvent.setup();
    render(<ConnectButton provider="slack" label="Connect Slack" />);
    const btn = screen.getByRole("button", { name: /connect slack/i });
    await user.click(btn);
    expect(btn).toBeDisabled();
    expect(btn.textContent).toMatch(/redirecting/i);
    resolveCall({ redirectUrl: "https://x" });
    await waitFor(() => expect(assignSpy).toHaveBeenCalled());
  });

  it("renders a user-facing error and re-enables the button on failure", async () => {
    mockStartOAuth.mockRejectedValueOnce(new Error("Provider 'slack' is disabled."));
    const user = userEvent.setup();
    render(<ConnectButton provider="slack" label="Connect Slack" />);
    await user.click(screen.getByRole("button", { name: /connect slack/i }));
    expect(await screen.findByRole("alert")).toHaveTextContent(/disabled/i);
    expect(screen.getByRole("button", { name: /connect slack/i })).not.toBeDisabled();
    expect(assignSpy).not.toHaveBeenCalled();
  });

  it("the Reconnect variant (reconnect + testId + title) starts the SAME OAuth flow", async () => {
    mockStartOAuth.mockResolvedValueOnce({
      redirectUrl: "https://slack.com/oauth/v2/authorize?x=2",
    });
    const user = userEvent.setup();
    render(
      <ConnectButton
        provider="slack"
        label="Reconnect"
        variant="reconnect"
        title="Refresh this connection"
        testId="app-card-reconnect"
      />,
    );
    const btn = screen.getByTestId("app-card-reconnect");
    expect(btn).toHaveTextContent("Reconnect");
    // Stronger affordance: native tooltip + leading refresh glyph.
    expect(btn).toHaveAttribute("title", "Refresh this connection");
    expect(btn.querySelector("svg")).not.toBeNull();
    await user.click(btn);
    await waitFor(() => {
      // The `reconnect` VARIANT is visual only; without the `reconnect` PROP the
      // OAuth call is identical to plain Connect — provider + undefined arg slot.
      expect(mockStartOAuth).toHaveBeenCalledWith("slack", undefined);
      expect(assignSpy).toHaveBeenCalledWith(
        "https://slack.com/oauth/v2/authorize?x=2",
      );
    });
  });

  const shopHint = {
    hintKey: "shop",
    label: "Shopify store domain",
    placeholder: "your-store.myshopify.com",
    help: "Enter your .myshopify.com domain.",
  };

  it("per-tenant: clicking Connect reveals a prompt instead of starting OAuth immediately", async () => {
    const user = userEvent.setup();
    render(
      <ConnectButton provider="shopify" label="Connect Shopify" connectInput={shopHint} />,
    );
    await user.click(screen.getByRole("button", { name: /connect shopify/i }));
    // No OAuth yet — we need the shop domain first.
    expect(mockStartOAuth).not.toHaveBeenCalled();
    expect(screen.getByTestId("connect-hint-input")).toBeInTheDocument();
    expect(screen.getByText(shopHint.label)).toBeInTheDocument();
  });

  it("per-tenant: submitting the shop domain starts OAuth with providerHint and navigates", async () => {
    mockStartOAuth.mockResolvedValueOnce({
      redirectUrl: "https://store.myshopify.com/admin/oauth/authorize?x=1",
    });
    const user = userEvent.setup();
    render(
      <ConnectButton provider="shopify" label="Connect Shopify" connectInput={shopHint} />,
    );
    await user.click(screen.getByRole("button", { name: /connect shopify/i }));
    await user.type(screen.getByTestId("connect-hint-input"), "store.myshopify.com");
    await user.click(screen.getByTestId("connect-hint-submit"));
    await waitFor(() => {
      expect(mockStartOAuth).toHaveBeenCalledWith("shopify", {
        providerHint: { shop: "store.myshopify.com" },
      });
      expect(assignSpy).toHaveBeenCalledWith(
        "https://store.myshopify.com/admin/oauth/authorize?x=1",
      );
    });
  });

  it("per-tenant: empty shop domain shows an error and does not call startOAuth", async () => {
    const user = userEvent.setup();
    render(
      <ConnectButton provider="shopify" label="Connect Shopify" connectInput={shopHint} />,
    );
    await user.click(screen.getByRole("button", { name: /connect shopify/i }));
    await user.click(screen.getByTestId("connect-hint-submit"));
    expect(await screen.findByRole("alert")).toBeInTheDocument();
    expect(mockStartOAuth).not.toHaveBeenCalled();
  });

  it("per-tenant in RECONNECT mode: no prompt — server rebuilds the hint (immediate OAuth)", async () => {
    mockStartOAuth.mockResolvedValueOnce({ redirectUrl: "https://store.myshopify.com/x" });
    const user = userEvent.setup();
    render(
      <ConnectButton
        provider="shopify"
        label="Reconnect"
        variant="reconnect"
        testId="app-card-reconnect"
        connectInput={shopHint}
        reconnect={{ integrationId: "int-9", accountId: "acct-1" }}
      />,
    );
    await user.click(screen.getByTestId("app-card-reconnect"));
    await waitFor(() => {
      expect(mockStartOAuth).toHaveBeenCalledWith("shopify", {
        reconnect: { integrationId: "int-9", accountId: "acct-1" },
      });
    });
    expect(screen.queryByTestId("connect-hint-input")).not.toBeInTheDocument();
  });

  it("4.APPS-RECONNECT — forwards the reconnect bundle (opaque ids only) to startOAuth", async () => {
    mockStartOAuth.mockResolvedValueOnce({
      redirectUrl: "https://accounts.google.com/o/oauth2/v2/auth?x=3",
    });
    const user = userEvent.setup();
    render(
      <ConnectButton
        provider="gmail"
        label="Reconnect"
        variant="reconnect"
        title="Reconnect this account"
        testId="app-card-reconnect"
        reconnect={{ integrationId: "int-77", accountId: "team-acct" }}
      />,
    );
    await user.click(screen.getByTestId("app-card-reconnect"));
    await waitFor(() => {
      expect(mockStartOAuth).toHaveBeenCalledWith("gmail", {
        reconnect: { integrationId: "int-77", accountId: "team-acct" },
      });
    });
  });
});
