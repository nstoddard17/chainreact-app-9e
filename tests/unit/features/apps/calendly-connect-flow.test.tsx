/**
 * Focused end-to-end CLIENT-chain proof for Connect Calendly — Slice
 * 5.CALENDLY-1 (mirrors the asana/typeform connect-flow suites, which
 * exist because ASANA-1 shipped an Apps-catalog gap).
 *
 * Renders the REAL AppCard + REAL ConnectButton + REAL startOAuth client
 * and mocks ONLY `fetch` — proving the whole chain the Apps page uses:
 *
 *   resolveAppCatalog (real registry) marks calendly connectable
 *     → AppCard renders a Connect Calendly button
 *     → click POSTs /api/integrations/oauth/calendly/connect
 *     → `{ redirectUrl }` is consumed via window.location.assign
 *     → a failed connect renders a VISIBLE role="alert" error.
 */
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

// AppCard calls useRouter() for the disconnect refresh path (unused here).
jest.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: jest.fn() }),
}));

import { resolveAppCatalog } from "@/app/apps/_shared";
import { AppCard } from "@/features/apps/AppCard";

const CALENDLY_AUTHORIZE_URL =
  "https://auth.calendly.com/oauth/authorize?client_id=x&state=s";

let fetchSpy: jest.Mock;
let assignSpy: jest.Mock;

function jsonResponse(status: number, body: unknown) {
  return { ok: status >= 200 && status < 300, status, json: async () => body };
}

beforeEach(() => {
  fetchSpy = jest.fn();
  Object.defineProperty(globalThis, "fetch", {
    configurable: true,
    writable: true,
    value: fetchSpy,
  });
  assignSpy = jest.fn();
  Object.defineProperty(window, "location", {
    configurable: true,
    value: { assign: assignSpy, href: "http://localhost/" },
  });
});

function calendlyCatalogItem() {
  // REAL registry + real projection — the same code path the Apps page runs.
  const item = resolveAppCatalog([]).find((i) => i.providerId === "calendly");
  if (!item) throw new Error("calendly missing from the resolved app catalog");
  return item;
}

describe("Apps catalog — calendly is connectable", () => {
  it("resolveAppCatalog lists calendly with canConnect=true for any member (personal provider)", () => {
    const item = calendlyCatalogItem();
    expect(item.canConnect).toBe(true);
    expect(item.isConnected).toBe(false);
    expect(item.restrictedToAdmins).toBe(false);
    expect(item.name).toBe("Calendly");
    expect(item.iconUrl).toBe("/integrations/calendly.svg");
    expect(item.category).toBe("Productivity");
    // Non-tenant provider — no connect-time prompt.
    expect(item.connectInput).toBeUndefined();
  });
});

describe("Connect Calendly — real ConnectButton + real startOAuth (fetch-mocked)", () => {
  it("clicking Connect Calendly POSTs the generic connect route and navigates to the returned redirectUrl", async () => {
    fetchSpy.mockResolvedValueOnce(
      jsonResponse(200, { redirectUrl: CALENDLY_AUTHORIZE_URL }),
    );
    const user = userEvent.setup();
    render(<AppCard app={calendlyCatalogItem()} accountId="acct-1" />);

    await user.click(screen.getByRole("button", { name: /connect calendly/i }));

    await waitFor(() => {
      expect(fetchSpy).toHaveBeenCalledTimes(1);
      const [url, init] = fetchSpy.mock.calls[0]!;
      expect(String(url)).toBe("/api/integrations/oauth/calendly/connect");
      expect((init as { method?: string } | undefined)?.method).toBe("POST");
      expect(assignSpy).toHaveBeenCalledWith(CALENDLY_AUTHORIZE_URL);
    });
  });

  it("a connect-route failure surfaces a VISIBLE error (role=alert) instead of silently doing nothing", async () => {
    fetchSpy.mockResolvedValueOnce(jsonResponse(400, { error: "connect_failed" }));
    const user = userEvent.setup();
    render(<AppCard app={calendlyCatalogItem()} accountId="acct-1" />);

    await user.click(screen.getByRole("button", { name: /connect calendly/i }));

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent(/connect_failed/);
    expect(assignSpy).not.toHaveBeenCalled();
    expect(
      screen.getByRole("button", { name: /connect calendly/i }),
    ).not.toBeDisabled();
  });
});
