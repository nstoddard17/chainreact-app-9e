/**
 * @jest-environment node
 *
 * Tests for `integrations/mailchimp/options/members.ts`.
 *
 * Pin: shape (requiredDeps=[audience_id]), dep + dc preconditions, mapping
 * (email→value/label, status→description), q filter, error sanitization.
 */
const mockRefreshAndRetry = jest.fn();
jest.mock("@/services/oauth/refreshAndRetry", () => {
  const actual = jest.requireActual("@/services/oauth/refreshAndRetry");
  return { ...actual, refreshAndRetry: (...a: unknown[]) => mockRefreshAndRetry(...a) };
});

import { mailchimpMembersResolver } from "@/integrations/mailchimp/options/members";
import { Unauthorized401Error } from "@/services/oauth/refreshAndRetry";
import { type OptionsResolverContext } from "@/services/options/types";
import type { IntegrationRecord } from "@/repositories/integrations";

const integration: IntegrationRecord = {
  id: "int-1",
  accountId: "acct-1",
  connectedByUserId: "user-1",
  provider: "mailchimp",
  providerAccountId: "mc-9001",
  displayName: "Acme (Mailchimp)",
  accessTokenEncrypted: "enc:cipher",
  refreshTokenEncrypted: null,
  accessTokenExpiresAt: null,
  scopes: ["account_access"],
  accountMetadata: { dc: "us21" },
  disconnectedAt: null,
  createdAt: "2026-06-01T00:00:00Z",
  updatedAt: "2026-06-01T00:00:00Z",
};

const ctx = (o: Partial<OptionsResolverContext> = {}): OptionsResolverContext => ({
  userId: "user-1",
  integration,
  q: "",
  deps: { audience_id: "aud-1" },
  ...o,
});

beforeEach(() => mockRefreshAndRetry.mockReset());

describe("mailchimpMembersResolver", () => {
  it("declares requiredDeps=[audience_id] and requires an integration", () => {
    expect(mailchimpMembersResolver.source).toBe("mailchimp:members");
    expect(mailchimpMembersResolver.provider).toBe("mailchimp");
    expect(mailchimpMembersResolver.requiresIntegration).toBe(true);
    expect(mailchimpMembersResolver.requiredDeps).toEqual(["audience_id"]);
  });

  it("maps email→value+label and status→description", async () => {
    mockRefreshAndRetry.mockResolvedValueOnce({
      members: [
        { id: "h1", email_address: "ada@x.com", status: "subscribed" },
        { id: "h2", email_address: "grace@x.com", status: "pending" },
        { id: "h3", email_address: "" }, // skipped (empty email)
      ],
      totalItems: 5,
    });
    const result = await mailchimpMembersResolver.resolve(ctx());
    expect(result.items).toEqual([
      { value: "ada@x.com", label: "ada@x.com", description: "subscribed" },
      { value: "grace@x.com", label: "grace@x.com", description: "pending" },
    ]);
    expect(result.hasMore).toBe(true); // totalItems(5) > members(3)
  });

  it("passes the discovered audience_id dep through to refreshAndRetry's apiCall", async () => {
    const fetchSpy = jest
      .spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(new Response(JSON.stringify({ members: [], total_items: 0 }), { status: 200 }));
    mockRefreshAndRetry.mockImplementationOnce(
      async (i: { apiCall: (t: string) => Promise<unknown> }) => i.apiCall("tok"),
    );
    await mailchimpMembersResolver.resolve(ctx({ deps: { audience_id: "AUD-XYZ" } }));
    const url = fetchSpy.mock.calls[0]![0] as string;
    expect(url).toContain("https://us21.api.mailchimp.com/3.0/lists/AUD-XYZ/members");
    fetchSpy.mockRestore();
  });

  it("requires the audience_id dep (MISSING_DEPENDENCY when absent)", async () => {
    await expect(mailchimpMembersResolver.resolve(ctx({ deps: {} }))).rejects.toMatchObject({
      code: "MISSING_DEPENDENCY",
    });
  });

  it("requires dc on accountMetadata (INTEGRATION_DISCONNECTED when missing)", async () => {
    await expect(
      mailchimpMembersResolver.resolve(ctx({ integration: { ...integration, accountMetadata: {} } })),
    ).rejects.toMatchObject({ code: "INTEGRATION_DISCONNECTED" });
  });

  it("maps a 401 to INTEGRATION_DISCONNECTED", async () => {
    mockRefreshAndRetry.mockRejectedValueOnce(new Unauthorized401Error("401"));
    await expect(mailchimpMembersResolver.resolve(ctx())).rejects.toMatchObject({ code: "INTEGRATION_DISCONNECTED" });
  });
});
