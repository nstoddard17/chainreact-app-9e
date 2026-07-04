/**
 * Focused end-to-end CLIENT-chain proof for Connect Asana (ASANA-1 Apps
 * debug follow-up).
 *
 * Unlike AppCard.test.tsx (which mocks ConnectButton) this suite renders the
 * REAL AppCard + REAL ConnectButton + REAL startOAuth client and mocks ONLY
 * `fetch` — proving the whole chain the Apps page uses:
 *
 *   resolveAppCatalog (real registry) marks asana connectable
 *     → AppCard renders a Connect Asana button
 *     → click POSTs /api/integrations/oauth/asana/connect (the generic route)
 *     → `{ redirectUrl }` is consumed via window.location.assign
 *     → a failed connect renders a VISIBLE role="alert" error (never silent).
 *
 * If any layer grew a provider allowlist that excludes asana, or the
 * route/DTO shape drifted, these fail.
 */
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

// AppCard calls useRouter() for the disconnect refresh path (unused here).
jest.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: jest.fn() }),
}));

import { resolveAppCatalog } from "@/app/apps/_shared";
import { AppCard } from "@/features/apps/AppCard";

const ASANA_AUTHORIZE_URL =
  "https://app.asana.com/-/oauth_authorize?client_id=x&state=s";

// jsdom ships no global fetch/Response — install a jest.fn and stub the
// minimal response surface startOAuth consumes ({ ok, status, json }).
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

function asanaCatalogItem() {
  // REAL registry + real projection — the same code path the Apps page runs.
  const item = resolveAppCatalog([]).find((i) => i.providerId === "asana");
  if (!item) throw new Error("asana missing from the resolved app catalog");
  return item;
}

describe("Apps catalog — asana is connectable", () => {
  it("resolveAppCatalog lists asana with canConnect=true for any member (personal provider)", () => {
    const item = asanaCatalogItem();
    expect(item.canConnect).toBe(true);
    expect(item.isConnected).toBe(false);
    expect(item.restrictedToAdmins).toBe(false);
    expect(item.name).toBe("Asana");
    expect(item.iconUrl).toBe("/integrations/asana.svg");
    expect(item.category).toBe("Productivity");
    // Non-tenant provider — no connect-time prompt; the button redirects
    // immediately.
    expect(item.connectInput).toBeUndefined();
  });
});

describe("Connect Asana — real ConnectButton + real startOAuth (fetch-mocked)", () => {
  it("clicking Connect Asana POSTs the generic connect route and navigates to the returned redirectUrl", async () => {
    fetchSpy.mockResolvedValueOnce(
      jsonResponse(200, { redirectUrl: ASANA_AUTHORIZE_URL }),
    );
    const user = userEvent.setup();
    render(<AppCard app={asanaCatalogItem()} accountId="acct-1" />);

    await user.click(screen.getByRole("button", { name: /connect asana/i }));

    await waitFor(() => {
      expect(fetchSpy).toHaveBeenCalledTimes(1);
      const [url, init] = fetchSpy.mock.calls[0]!;
      expect(String(url)).toBe("/api/integrations/oauth/asana/connect");
      expect((init as { method?: string } | undefined)?.method).toBe("POST");
      expect(assignSpy).toHaveBeenCalledWith(ASANA_AUTHORIZE_URL);
    });
  });

  it("a connect-route failure surfaces a VISIBLE error (role=alert) instead of silently doing nothing", async () => {
    // The route's redacted failure shape (V2-READY-21): 400 { error: <code> } —
    // e.g. what a stale dev server missing ASANA_CLIENT_ID produces.
    fetchSpy.mockResolvedValueOnce(jsonResponse(400, { error: "connect_failed" }));
    const user = userEvent.setup();
    render(<AppCard app={asanaCatalogItem()} accountId="acct-1" />);

    await user.click(screen.getByRole("button", { name: /connect asana/i }));

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent(/connect_failed/);
    expect(assignSpy).not.toHaveBeenCalled();
    // Button recovers so the user can retry.
    expect(
      screen.getByRole("button", { name: /connect asana/i }),
    ).not.toBeDisabled();
  });
});
