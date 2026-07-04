/**
 * Focused end-to-end CLIENT-chain proof for Connect Typeform — Slice
 * 5.TYPEFORM-1 (mirrors the asana-connect-flow suite, which exists
 * because ASANA-1 shipped an Apps-catalog gap).
 *
 * Renders the REAL AppCard + REAL ConnectButton + REAL startOAuth client
 * and mocks ONLY `fetch` — proving the whole chain the Apps page uses:
 *
 *   resolveAppCatalog (real registry) marks typeform connectable
 *     → AppCard renders a Connect Typeform button
 *     → click POSTs /api/integrations/oauth/typeform/connect
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

const TYPEFORM_AUTHORIZE_URL =
  "https://api.typeform.com/oauth/authorize?client_id=x&state=s";

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

function typeformCatalogItem() {
  // REAL registry + real projection — the same code path the Apps page runs.
  const item = resolveAppCatalog([]).find((i) => i.providerId === "typeform");
  if (!item) throw new Error("typeform missing from the resolved app catalog");
  return item;
}

describe("Apps catalog — typeform is connectable", () => {
  it("resolveAppCatalog lists typeform with canConnect=true for any member (personal provider)", () => {
    const item = typeformCatalogItem();
    expect(item.canConnect).toBe(true);
    expect(item.isConnected).toBe(false);
    expect(item.restrictedToAdmins).toBe(false);
    expect(item.name).toBe("Typeform");
    expect(item.iconUrl).toBe("/integrations/typeform.svg");
    expect(item.category).toBe("Forms");
    // Non-tenant provider — no connect-time prompt.
    expect(item.connectInput).toBeUndefined();
  });
});

describe("Connect Typeform — real ConnectButton + real startOAuth (fetch-mocked)", () => {
  it("clicking Connect Typeform POSTs the generic connect route and navigates to the returned redirectUrl", async () => {
    fetchSpy.mockResolvedValueOnce(
      jsonResponse(200, { redirectUrl: TYPEFORM_AUTHORIZE_URL }),
    );
    const user = userEvent.setup();
    render(<AppCard app={typeformCatalogItem()} accountId="acct-1" />);

    await user.click(screen.getByRole("button", { name: /connect typeform/i }));

    await waitFor(() => {
      expect(fetchSpy).toHaveBeenCalledTimes(1);
      const [url, init] = fetchSpy.mock.calls[0]!;
      expect(String(url)).toBe("/api/integrations/oauth/typeform/connect");
      expect((init as { method?: string } | undefined)?.method).toBe("POST");
      expect(assignSpy).toHaveBeenCalledWith(TYPEFORM_AUTHORIZE_URL);
    });
  });

  it("a connect-route failure surfaces a VISIBLE error (role=alert) instead of silently doing nothing", async () => {
    fetchSpy.mockResolvedValueOnce(jsonResponse(400, { error: "connect_failed" }));
    const user = userEvent.setup();
    render(<AppCard app={typeformCatalogItem()} accountId="acct-1" />);

    await user.click(screen.getByRole("button", { name: /connect typeform/i }));

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent(/connect_failed/);
    expect(assignSpy).not.toHaveBeenCalled();
    expect(
      screen.getByRole("button", { name: /connect typeform/i }),
    ).not.toBeDisabled();
  });
});
