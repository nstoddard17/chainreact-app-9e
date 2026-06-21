/**
 * @jest-environment node
 *
 * Safe credential-availability summary (HERMES-AGENT-CREDENTIAL-AVAILABILITY-CONTEXT).
 * Proves getGuidanceCredentialAvailability summarizes account-shared providers + the CURRENT user's
 * OWN private connections, EXCLUDES another member's private connections, leaks no id/token/secret/
 * owner, uses registry display names (not the row's), and degrades to EMPTY on read error.
 */

const mockListActiveByAccount = jest.fn();
jest.mock("@/repositories/integrations", () => ({
  listActiveByAccount: (...a: unknown[]) => mockListActiveByAccount(...a),
}));

import { getGuidanceCredentialAvailability } from "@/services/integrations/guidanceCredentialAvailability";

const ACCOUNT = "acc-1";
const ME = "user-me";
const OTHER = "user-other";

/** Minimal active-integration row shape the service reads (provider + connectedByUserId). Extra
 *  sensitive fields are present to prove they never reach the output. */
function row(provider: string, connectedByUserId: string | null) {
  return {
    id: `int-${provider}-${connectedByUserId}`,
    accountId: ACCOUNT,
    connectedByUserId,
    provider,
    providerAccountId: `acct-${provider}-SENSITIVE`,
    displayName: `connected-as-${connectedByUserId}@example.com`,
    accessTokenEncrypted: "TOKEN-SECRET",
    refreshTokenEncrypted: "REFRESH-SECRET",
  };
}

beforeEach(() => {
  mockListActiveByAccount.mockReset();
});

describe("getGuidanceCredentialAvailability — scoping", () => {
  it("summarizes account-shared providers and the current user's OWN private providers", async () => {
    mockListActiveByAccount.mockResolvedValue([
      row("slack", OTHER), // account-class → shared (regardless of who connected it)
      row("gmail", ME), // personal, mine → own
      row("dropbox", OTHER), // personal, ANOTHER member → excluded
    ]);
    const out = await getGuidanceCredentialAvailability({ accountId: ACCOUNT, userId: ME });
    expect(out.accountSharedProviders.map((p) => p.providerKey)).toEqual(["slack"]);
    expect(out.currentUserPrivateProviders.map((p) => p.providerKey)).toEqual(["gmail"]);
    // Another member's private provider must NOT appear anywhere.
    const all = [...out.accountSharedProviders, ...out.currentUserPrivateProviders].map((p) => p.providerKey);
    expect(all).not.toContain("dropbox");
  });

  it("uses registry display names + a literal 'available' status", async () => {
    mockListActiveByAccount.mockResolvedValue([row("slack", ME), row("gmail", ME)]);
    const out = await getGuidanceCredentialAvailability({ accountId: ACCOUNT, userId: ME });
    expect(out.accountSharedProviders[0]).toMatchObject({ providerKey: "slack", status: "available" });
    expect(typeof out.accountSharedProviders[0]!.displayName).toBe("string");
    expect(out.currentUserPrivateProviders[0]).toMatchObject({ providerKey: "gmail", status: "available" });
  });

  it("an account-class provider connected by the current user is shared, not 'own private'", async () => {
    mockListActiveByAccount.mockResolvedValue([row("notion", ME)]);
    const out = await getGuidanceCredentialAvailability({ accountId: ACCOUNT, userId: ME });
    expect(out.accountSharedProviders.map((p) => p.providerKey)).toEqual(["notion"]);
    expect(out.currentUserPrivateProviders).toEqual([]);
  });

  it("excludes everything when only other members' private connections exist", async () => {
    mockListActiveByAccount.mockResolvedValue([row("gmail", OTHER), row("dropbox", OTHER)]);
    const out = await getGuidanceCredentialAvailability({ accountId: ACCOUNT, userId: ME });
    expect(out.accountSharedProviders).toEqual([]);
    expect(out.currentUserPrivateProviders).toEqual([]);
  });
});

describe("getGuidanceCredentialAvailability — no leaks + safe degrade", () => {
  it("output never contains tokens / provider account ids / owner ids / row display names", async () => {
    mockListActiveByAccount.mockResolvedValue([row("slack", OTHER), row("gmail", ME)]);
    const out = await getGuidanceCredentialAvailability({ accountId: ACCOUNT, userId: ME });
    const s = JSON.stringify(out);
    for (const needle of ["TOKEN-SECRET", "REFRESH-SECRET", "SENSITIVE", "@example.com", OTHER, ME, "int-", ACCOUNT]) {
      expect(s).not.toContain(needle);
    }
  });

  it("degrades to EMPTY when the source throws", async () => {
    mockListActiveByAccount.mockRejectedValue(new Error("db down"));
    const out = await getGuidanceCredentialAvailability({ accountId: ACCOUNT, userId: ME });
    expect(out).toEqual({ accountSharedProviders: [], currentUserPrivateProviders: [] });
  });
});
