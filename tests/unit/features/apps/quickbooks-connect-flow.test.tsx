/**
 * Focused end-to-end CLIENT-chain proof for Connect QuickBooks —
 * QUICKBOOKS-1 (mirrors the asana/typeform/calendly connect-flow
 * suites, which exist because ASANA-1 shipped an Apps-catalog gap).
 *
 * Renders the REAL AppCard + REAL ConnectButton + REAL startOAuth client
 * and mocks ONLY `fetch` — proving the whole chain the Apps page uses:
 *
 *   resolveAppCatalog (real registry) lists quickbooks
 *     → ACCOUNT credential class: connect is owner/admin-gated
 *       (restrictedToAdmins for members; canConnect for owners)
 *     → click POSTs /api/integrations/oauth/quickbooks/connect
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

const QBO_AUTHORIZE_URL =
  "https://appcenter.intuit.com/connect/oauth2?client_id=x&state=s";

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

function quickbooksCatalogItem(role: "owner" | "member" = "owner") {
  // REAL registry + real projection — the same code path the Apps page runs.
  const item = resolveAppCatalog([], {
    callerUserId: "u-1",
    callerRole: role,
  }).find((i) => i.providerId === "quickbooks");
  if (!item) throw new Error("quickbooks missing from the resolved app catalog");
  return item;
}

describe("Apps catalog — quickbooks (ACCOUNT credential class)", () => {
  it("lists quickbooks with real category/description/icon and owner canConnect=true", () => {
    const item = quickbooksCatalogItem("owner");
    expect(item.name).toBe("QuickBooks Online");
    expect(item.category).toBe("Accounting");
    expect(item.description.length).toBeGreaterThan(0);
    expect(item.iconUrl).toBe("/integrations/quickbooks.svg");
    expect(item.canConnect).toBe(true);
    expect(item.isConnected).toBe(false);
    expect(item.restrictedToAdmins).toBe(false);
    // Non-tenant provider — no connect-time prompt (realmId comes from
    // Intuit's callback, not user input).
    expect(item.connectInput).toBeUndefined();
  });

  it("marks connect admin-restricted for a plain member (account-shared resource)", () => {
    const item = quickbooksCatalogItem("member");
    expect(item.canConnect).toBe(false);
    expect(item.restrictedToAdmins).toBe(true);
  });
});

describe("Connect QuickBooks — real ConnectButton + real startOAuth (fetch-mocked)", () => {
  it("clicking Connect POSTs the generic connect route and navigates to the returned redirectUrl", async () => {
    fetchSpy.mockResolvedValueOnce(
      jsonResponse(200, { redirectUrl: QBO_AUTHORIZE_URL }),
    );
    const user = userEvent.setup();
    render(<AppCard app={quickbooksCatalogItem("owner")} accountId="acct-1" />);

    await user.click(
      screen.getByRole("button", { name: /connect quickbooks online/i }),
    );

    await waitFor(() => {
      expect(fetchSpy).toHaveBeenCalledTimes(1);
      const [url, init] = fetchSpy.mock.calls[0]!;
      expect(String(url)).toBe("/api/integrations/oauth/quickbooks/connect");
      expect((init as { method?: string } | undefined)?.method).toBe("POST");
      expect(assignSpy).toHaveBeenCalledWith(QBO_AUTHORIZE_URL);
    });
  });

  it("a connect-route failure surfaces a VISIBLE error (role=alert) instead of silently doing nothing", async () => {
    fetchSpy.mockResolvedValueOnce(jsonResponse(400, { error: "connect_failed" }));
    const user = userEvent.setup();
    render(<AppCard app={quickbooksCatalogItem("owner")} accountId="acct-1" />);

    await user.click(
      screen.getByRole("button", { name: /connect quickbooks online/i }),
    );

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent(/connect_failed/);
    expect(assignSpy).not.toHaveBeenCalled();
  });
});
