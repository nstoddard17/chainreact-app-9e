/**
 * @jest-environment node
 *
 * Tests for the typed account API client (4.ACCOUNT-MODEL-18). Mocks global
 * fetch so the wire shapes + error mapping are isolated from the network.
 */

import {
  listAccounts,
  createTeam,
  setActiveAccount,
  AccountApiError,
} from "@/lib/api/accounts";

const mockFetch = jest.fn();
beforeEach(() => {
  mockFetch.mockReset();
  (globalThis as unknown as { fetch: jest.Mock }).fetch = mockFetch;
});

function ok(body: unknown, status = 200) {
  return { ok: status < 400, status, json: async () => body } as unknown as Response;
}
function err(status: number, body: unknown = {}) {
  return { ok: false, status, json: async () => body } as unknown as Response;
}

describe("listAccounts", () => {
  it("GETs /api/accounts and returns the envelope", async () => {
    const payload = { activeAccountId: "p1", accounts: [{ id: "p1", name: "Personal", type: "personal", role: "owner", isActive: true, deletionStatus: "active" }] };
    mockFetch.mockResolvedValueOnce(ok(payload));
    const r = await listAccounts();
    expect(r).toEqual(payload);
    expect(mockFetch).toHaveBeenCalledWith("/api/accounts");
  });

  it("maps 401 → UNAUTHENTICATED", async () => {
    mockFetch.mockResolvedValueOnce(err(401, { error: "unauthenticated" }));
    await expect(listAccounts()).rejects.toMatchObject({ code: "UNAUTHENTICATED", status: 401 });
  });

  it("maps 500 → SERVER_ERROR", async () => {
    mockFetch.mockResolvedValueOnce(err(500));
    await expect(listAccounts()).rejects.toBeInstanceOf(AccountApiError);
    mockFetch.mockResolvedValueOnce(err(500));
    await expect(listAccounts()).rejects.toMatchObject({ code: "SERVER_ERROR" });
  });
});

describe("createTeam", () => {
  it("POSTs the name and returns the created account", async () => {
    mockFetch.mockResolvedValueOnce(ok({ ok: true, account: { id: "t1", name: "Acme", type: "team" } }, 201));
    const r = await createTeam("Acme");
    expect(r).toEqual({ id: "t1", name: "Acme", type: "team" });
    expect(mockFetch).toHaveBeenCalledWith("/api/accounts", expect.objectContaining({
      method: "POST",
      body: JSON.stringify({ name: "Acme" }),
    }));
  });

  it("maps 400 → VALIDATION", async () => {
    mockFetch.mockResolvedValueOnce(err(400, { error: "A team name is required." }));
    await expect(createTeam("")).rejects.toMatchObject({ code: "VALIDATION", status: 400 });
  });
});

describe("setActiveAccount", () => {
  it("POSTs the accountId to /api/account/active", async () => {
    mockFetch.mockResolvedValueOnce(ok({ ok: true, activeAccountId: "t1", account: { id: "t1", name: "Acme", type: "team" } }));
    await setActiveAccount("t1");
    expect(mockFetch).toHaveBeenCalledWith("/api/account/active", expect.objectContaining({
      method: "POST",
      body: JSON.stringify({ accountId: "t1" }),
    }));
  });

  it("maps 403 → FORBIDDEN (e.g. not a member / frozen)", async () => {
    mockFetch.mockResolvedValueOnce(err(403, { error: "You are not a member of this account." }));
    await expect(setActiveAccount("victim")).rejects.toMatchObject({ code: "FORBIDDEN", status: 403 });
  });
});
