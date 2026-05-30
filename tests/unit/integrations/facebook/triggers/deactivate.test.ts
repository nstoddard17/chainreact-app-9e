/**
 * @jest-environment node
 *
 * Tests for the shared Facebook trigger deactivation hook
 * (`triggers/_shared/deactivate.ts`) — Slice 3.FACEBOOK-5.
 *
 * The shared-subscription safety contract: `subscribed_apps` is page-level,
 * so unsubscribe ONLY when no OTHER workflow still watches the Page.
 */
const mockRefreshAndRetry = jest.fn();
const mockGetPageAccessToken = jest.fn();
const mockUnsubscribe = jest.fn();
const mockListByConfigContains = jest.fn();

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
  subscribePageToApp: jest.fn(),
  unsubscribePageFromApp: (...args: unknown[]) => mockUnsubscribe(...args),
}));
jest.mock("@/repositories/triggerResources", () => ({
  listByConfigContains: (...args: unknown[]) => mockListByConfigContains(...args),
}));

import { facebookSharedDeactivate } from "@/integrations/facebook/triggers/_shared/deactivate";
import { NotFoundError } from "@/integrations/_shared/facebook/errors";
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
  scopes: [],
  accountMetadata: {},
  disconnectedAt: null,
  createdAt: "",
  updatedAt: "",
};

function trigger(config: Record<string, unknown>, workflowId = "wf-1") {
  return {
    id: "tr-1",
    workflowId,
    workflowAccountId: "acct-user-1",
    userId: "user-1",
    provider: "facebook",
    eventType: "new_post",
    nodeId: "node-1",
    config,
    providerAccountId: null,
    registeredAt: "",
    expiresAt: null,
    lastRenewedAt: null,
    createdAt: "",
    updatedAt: "",
  };
}

function row(workflowId: string, provider = "facebook", pageId = "page-1") {
  return { ...trigger({ pageId }, workflowId), provider };
}

beforeEach(() => {
  mockRefreshAndRetry.mockReset();
  mockGetPageAccessToken.mockReset();
  mockUnsubscribe.mockReset();
  mockListByConfigContains.mockReset();
  mockRefreshAndRetry.mockImplementation(
    async (i: { apiCall: (t: string) => Promise<unknown> }) => i.apiCall("user-tok"),
  );
  mockGetPageAccessToken.mockResolvedValue("page-tok");
  mockUnsubscribe.mockResolvedValue({ success: true });
});

describe("facebookSharedDeactivate — reference-count safety", () => {
  it("UNSUBSCRIBES when this is the last workflow watching the Page", async () => {
    // listByConfigContains returns only this workflow's own row.
    mockListByConfigContains.mockResolvedValueOnce([row("wf-1")]);
    await facebookSharedDeactivate({ trigger: trigger({ pageId: "page-1" }), integration });
    expect(mockGetPageAccessToken).toHaveBeenCalledWith({
      accessToken: "user-tok",
      pageId: "page-1",
    });
    expect(mockUnsubscribe.mock.calls[0]![0]).toMatchObject({
      pageAccessToken: "page-tok",
      pageId: "page-1",
    });
  });

  it("SKIPS unsubscribe when ANOTHER workflow still watches the same Page", async () => {
    mockListByConfigContains.mockResolvedValueOnce([row("wf-1"), row("wf-2")]);
    await facebookSharedDeactivate({ trigger: trigger({ pageId: "page-1" }), integration });
    expect(mockUnsubscribe).not.toHaveBeenCalled();
  });

  it("ignores rows from other providers that happen to carry the same pageId value", async () => {
    mockListByConfigContains.mockResolvedValueOnce([
      row("wf-1"),
      row("wf-9", "monday"), // different provider — not a Facebook page subscription.
    ]);
    await facebookSharedDeactivate({ trigger: trigger({ pageId: "page-1" }), integration });
    // No OTHER facebook workflow → still unsubscribe.
    expect(mockUnsubscribe).toHaveBeenCalledTimes(1);
  });

  it("treats the same workflow's other trigger nodes as NOT blocking (whole workflow is going away)", async () => {
    // Same workflow, second fb trigger node on the same page.
    mockListByConfigContains.mockResolvedValueOnce([
      row("wf-1"),
      { ...row("wf-1"), nodeId: "node-2", eventType: "new_comment" },
    ]);
    await facebookSharedDeactivate({ trigger: trigger({ pageId: "page-1" }), integration });
    expect(mockUnsubscribe).toHaveBeenCalledTimes(1);
  });

  it("no-op when the trigger row carries no pageId", async () => {
    await facebookSharedDeactivate({ trigger: trigger({}), integration });
    expect(mockListByConfigContains).not.toHaveBeenCalled();
    expect(mockUnsubscribe).not.toHaveBeenCalled();
  });
});

describe("facebookSharedDeactivate — best-effort remote call", () => {
  it("swallows NotFoundError (page already unsubscribed / gone)", async () => {
    mockListByConfigContains.mockResolvedValueOnce([row("wf-1")]);
    mockUnsubscribe.mockRejectedValueOnce(new NotFoundError("page/page-1"));
    await expect(
      facebookSharedDeactivate({ trigger: trigger({ pageId: "page-1" }), integration }),
    ).resolves.toBeUndefined();
  });

  it("swallows Unauthorized401Error (token revoked — re-auth won't help)", async () => {
    mockListByConfigContains.mockResolvedValueOnce([row("wf-1")]);
    const err = new Error("401");
    err.name = "Unauthorized401Error";
    mockUnsubscribe.mockRejectedValueOnce(err);
    await expect(
      facebookSharedDeactivate({ trigger: trigger({ pageId: "page-1" }), integration }),
    ).resolves.toBeUndefined();
  });

  it("propagates other errors (lifecycle orchestrator catches + still deletes the row)", async () => {
    mockListByConfigContains.mockResolvedValueOnce([row("wf-1")]);
    mockUnsubscribe.mockRejectedValueOnce(new Error("graph 500"));
    await expect(
      facebookSharedDeactivate({ trigger: trigger({ pageId: "page-1" }), integration }),
    ).rejects.toThrow("graph 500");
  });
});
