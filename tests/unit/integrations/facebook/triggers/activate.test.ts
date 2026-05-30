/**
 * @jest-environment node
 *
 * Tests for the shared Facebook trigger activation hook
 * (`triggers/_shared/activate.ts`) — Slice 3.FACEBOOK-5. Derives the Page
 * token, subscribes the Page to the app (subscribed_apps), returns the
 * config patch.
 */
const mockRefreshAndRetry = jest.fn();
const mockGetPageAccessToken = jest.fn();
const mockSubscribe = jest.fn();

jest.mock("@/services/oauth/refreshAndRetry", () => {
  const actual = jest.requireActual("@/services/oauth/refreshAndRetry");
  return {
    ...actual,
    refreshAndRetry: (...args: unknown[]) => mockRefreshAndRetry(...args),
  };
});
jest.mock("@/integrations/_shared/facebook/api/getPageAccessToken", () => ({
  getPageAccessToken: (...args: unknown[]) => mockGetPageAccessToken(...args),
}));
jest.mock("@/integrations/_shared/facebook/api/subscribedApps", () => ({
  subscribePageToApp: (...args: unknown[]) => mockSubscribe(...args),
  unsubscribePageFromApp: jest.fn(),
}));

import { facebookSharedActivate } from "@/integrations/facebook/triggers/_shared/activate";
import type { IntegrationRecord } from "@/repositories/integrations";

const integration: IntegrationRecord = {
  id: "int-1",
  accountId: "acct-user-1",
  connectedByUserId: "user-1",
  provider: "facebook",
  providerAccountId: "fb-user-1",
  displayName: "Alice",
  accessTokenEncrypted: "enc:at",
  refreshTokenEncrypted: null,
  accessTokenExpiresAt: null,
  scopes: ["pages_manage_metadata"],
  accountMetadata: {},
  disconnectedAt: null,
  createdAt: "2026-05-25T00:00:00Z",
  updatedAt: "2026-05-25T00:00:00Z",
};

function node(config: Record<string, unknown>) {
  return {
    id: "node-1",
    kind: "trigger" as const,
    provider: "facebook",
    type: "new_post",
    config,
  };
}

beforeEach(() => {
  mockRefreshAndRetry.mockReset();
  mockGetPageAccessToken.mockReset();
  mockSubscribe.mockReset();
  mockRefreshAndRetry.mockImplementation(
    async (i: { apiCall: (t: string) => Promise<unknown> }) => i.apiCall("user-tok"),
  );
  mockGetPageAccessToken.mockResolvedValue("page-tok");
  mockSubscribe.mockResolvedValue({ success: true });
});

describe("facebookSharedActivate", () => {
  it("derives the Page token then subscribes the Page via subscribed_apps(feed)", async () => {
    const patch = await facebookSharedActivate({
      node: node({ pageId: "page-1" }) as unknown as Parameters<typeof facebookSharedActivate>[0]["node"],
      integration,
      workflowId: "wf-1",
    });
    expect(mockRefreshAndRetry.mock.calls[0]![0]).toMatchObject({
      provider: "facebook",
      accountId: "fb-user-1",
      userId: "user-1",
    });
    expect(mockGetPageAccessToken).toHaveBeenCalledWith({
      accessToken: "user-tok",
      pageId: "page-1",
    });
    expect(mockSubscribe.mock.calls[0]![0]).toMatchObject({
      pageAccessToken: "page-tok",
      pageId: "page-1",
      fields: ["feed"],
    });
    // Config patch stored on the trigger row.
    expect(patch).toMatchObject({ pageId: "page-1", subscribedFields: ["feed"] });
    expect(typeof patch.subscribedAt).toBe("string");
  });

  it("throws (aborts activation) when pageId is missing", async () => {
    await expect(
      facebookSharedActivate({
        node: node({}) as unknown as Parameters<typeof facebookSharedActivate>[0]["node"],
        integration,
        workflowId: "wf-1",
      }),
    ).rejects.toThrow(/pageId is required/);
    expect(mockSubscribe).not.toHaveBeenCalled();
  });
});
