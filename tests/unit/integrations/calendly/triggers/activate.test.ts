/**
 * @jest-environment node
 *
 * Tests for the shared Calendly activation factory — Slice 5.CALENDLY-1.
 *
 * The Calendly lifecycle has NO creation handshake: activate resolves
 * the user/org URIs (account metadata first, /users/me fallback), mints
 * the signing key itself, POSTs the subscription, and returns the full
 * config patch (no pre-upsert, no read-back — Typeform posture).
 */
const mockRefreshAndRetry = jest.fn();
const mockSubscriptionCreate = jest.fn();
const mockUsersMe = jest.fn();

jest.mock("@/services/oauth/refreshAndRetry", () => {
  class Unauthorized401Error extends Error {}
  class InsufficientScopeError extends Error {}
  class IntegrationActionRequiredError extends Error {}
  return {
    refreshAndRetry: (...args: unknown[]) => mockRefreshAndRetry(...args),
    Unauthorized401Error,
    InsufficientScopeError,
    IntegrationActionRequiredError,
  };
});

jest.mock("@/integrations/_shared/calendly/api/webhookSubscriptions", () => ({
  webhookSubscriptionCreate: (...args: unknown[]) =>
    mockSubscriptionCreate(...args),
  webhookSubscriptionDelete: jest.fn(),
}));

jest.mock("@/integrations/_shared/calendly/api/users", () => ({
  usersMe: (...args: unknown[]) => mockUsersMe(...args),
}));

jest.mock("@/core/encryption/tokens", () => ({
  encryptToken: (s: string) => `enc(${s})`,
  decryptToken: (s: string) => s.slice(4, -1),
}));

import { InsufficientScopeError } from "@/services/oauth/refreshAndRetry";
import { ConflictError } from "@/integrations/_shared/calendly/errors";
import { makeCalendlyActivate } from "@/integrations/calendly/triggers/_shared/activate";

const USER_URI = "https://api.calendly.com/users/USER123";
const ORG_URI = "https://api.calendly.com/organizations/ORG456";
const SUB_URI = "https://api.calendly.com/webhook_subscriptions/SUB789";

function integration(overrides: Record<string, unknown> = {}) {
  return {
    id: "int-1",
    accountId: "acct-1",
    connectedByUserId: "user-1",
    provider: "calendly",
    providerAccountId: "marcus@example.test",
    accountMetadata: {
      calendlyUserUri: USER_URI,
      organizationUri: ORG_URI,
    },
    ...overrides,
  } as never;
}

function node(config: Record<string, unknown>) {
  return {
    id: "node-1",
    kind: "trigger",
    provider: "calendly",
    type: "event_scheduled",
    config,
  } as never;
}

const activateScheduled = makeCalendlyActivate("event_scheduled");
const activateCanceled = makeCalendlyActivate("event_canceled");

beforeEach(() => {
  mockRefreshAndRetry.mockReset();
  mockSubscriptionCreate.mockReset();
  mockUsersMe.mockReset();
  process.env.NEXT_PUBLIC_APP_URL = "https://app.example.test";
  mockRefreshAndRetry.mockImplementation(
    async (i: { apiCall: (t: string) => Promise<unknown> }) => i.apiCall("tok"),
  );
});

afterEach(() => {
  delete process.env.NEXT_PUBLIC_APP_URL;
  delete process.env.CALENDLY_WEBHOOK_URL;
});

describe("makeCalendlyActivate — happy path", () => {
  it("POSTs the subscription with a minted signing key + strict-lookup URL and returns the full patch", async () => {
    mockSubscriptionCreate.mockResolvedValueOnce({
      uri: SUB_URI,
      state: "active",
    });

    const patch = await activateScheduled({
      node: node({}),
      integration: integration(),
      workflowId: "wf-1",
    } as never);

    // Metadata carried both URIs — NO /users/me round-trip.
    expect(mockUsersMe).not.toHaveBeenCalled();

    expect(mockSubscriptionCreate).toHaveBeenCalledTimes(1);
    const createArg = mockSubscriptionCreate.mock.calls[0]![0];
    expect(createArg.events).toEqual(["invitee.created"]);
    expect(createArg.organizationUri).toBe(ORG_URI);
    expect(createArg.userUri).toBe(USER_URI);
    expect(createArg.url).toBe(
      "https://app.example.test/api/webhooks/calendly?workflowId=wf-1&nodeId=node-1",
    );
    // Minted signing key: 32 random bytes, base64url.
    expect(typeof createArg.signingKey).toBe("string");
    expect(createArg.signingKey.length).toBeGreaterThanOrEqual(43);

    // The patch carries the ENCRYPTED key + lifecycle fields.
    expect(patch).toMatchObject({
      webhookEnabled: true,
      subscriptionUri: SUB_URI,
      hookSecretEncrypted: `enc(${createArg.signingKey})`,
      notificationUrl:
        "https://app.example.test/api/webhooks/calendly?workflowId=wf-1&nodeId=node-1",
      calendlyUserId: "USER123",
      calendlyUserUri: USER_URI,
      organizationUri: ORG_URI,
    });
    // No eventTypeId key when the builder left the filter empty.
    expect("eventTypeId" in patch).toBe(false);
    // Never persisted in plaintext.
    expect(JSON.stringify(patch)).not.toContain(`"${createArg.signingKey}"`);
  });

  it("subscribes invitee.canceled for the event_canceled trigger", async () => {
    mockSubscriptionCreate.mockResolvedValueOnce({ uri: SUB_URI });
    await activateCanceled({
      node: node({}),
      integration: integration(),
      workflowId: "wf-1",
    } as never);
    expect(mockSubscriptionCreate.mock.calls[0]![0].events).toEqual([
      "invitee.canceled",
    ]);
  });

  it("passes the optional eventTypeId filter through to the patch", async () => {
    mockSubscriptionCreate.mockResolvedValueOnce({ uri: SUB_URI });
    const patch = await activateScheduled({
      node: node({ eventTypeId: "ET123" }),
      integration: integration(),
      workflowId: "wf-1",
    } as never);
    expect(patch.eventTypeId).toBe("ET123");
  });

  it("mints a FRESH signing key per activation", async () => {
    mockSubscriptionCreate.mockResolvedValue({ uri: SUB_URI });
    await activateScheduled({
      node: node({}),
      integration: integration(),
      workflowId: "wf-1",
    } as never);
    await activateScheduled({
      node: node({}),
      integration: integration(),
      workflowId: "wf-1",
    } as never);
    const first = mockSubscriptionCreate.mock.calls[0]![0].signingKey;
    const second = mockSubscriptionCreate.mock.calls[1]![0].signingKey;
    expect(first).not.toBe(second);
  });

  it("falls back to GET /users/me when account metadata lacks the URIs", async () => {
    mockUsersMe.mockResolvedValueOnce({
      uri: USER_URI,
      current_organization: ORG_URI,
    });
    mockSubscriptionCreate.mockResolvedValueOnce({ uri: SUB_URI });

    const patch = await activateScheduled({
      node: node({}),
      integration: integration({ accountMetadata: {} }),
      workflowId: "wf-1",
    } as never);

    expect(mockUsersMe).toHaveBeenCalledTimes(1);
    expect(patch.calendlyUserId).toBe("USER123");
    expect(mockSubscriptionCreate.mock.calls[0]![0].userUri).toBe(USER_URI);
  });

  it("honors the CALENDLY_WEBHOOK_URL override and strips a doubled path", async () => {
    process.env.CALENDLY_WEBHOOK_URL =
      "https://tunnel.example.test/api/webhooks/calendly";
    mockSubscriptionCreate.mockResolvedValueOnce({ uri: SUB_URI });
    await activateScheduled({
      node: node({}),
      integration: integration(),
      workflowId: "wf-1",
    } as never);
    expect(mockSubscriptionCreate.mock.calls[0]![0].url).toBe(
      "https://tunnel.example.test/api/webhooks/calendly?workflowId=wf-1&nodeId=node-1",
    );
  });
});

describe("makeCalendlyActivate — failures", () => {
  it("throws when identity is unresolvable even via /users/me (nothing created)", async () => {
    mockUsersMe.mockResolvedValueOnce({ uri: null, current_organization: null });
    await expect(
      activateScheduled({
        node: node({}),
        integration: integration({ accountMetadata: {} }),
        workflowId: "wf-1",
      } as never),
    ).rejects.toThrow(/user\/organization URIs/);
    expect(mockSubscriptionCreate).not.toHaveBeenCalled();
  });

  it("humanizes the 403 plan/scope gate (paid plan OR missing webhooks:write)", async () => {
    mockSubscriptionCreate.mockRejectedValueOnce(
      new InsufficientScopeError("HTTP 403"),
    );
    await expect(
      activateScheduled({
        node: node({}),
        integration: integration(),
        workflowId: "wf-1",
      } as never),
    ).rejects.toThrow(/paid Calendly plan/);
  });

  it("humanizes a 409 duplicate subscription (orphan from a crashed lifecycle)", async () => {
    mockSubscriptionCreate.mockRejectedValueOnce(new ConflictError("dup"));
    await expect(
      activateScheduled({
        node: node({}),
        integration: integration(),
        workflowId: "wf-1",
      } as never),
    ).rejects.toThrow(/Deactivate the workflow/);
  });

  it("propagates a generic POST failure (activation aborts; nothing to clean up)", async () => {
    mockSubscriptionCreate.mockRejectedValueOnce(new Error("provider down"));
    await expect(
      activateScheduled({
        node: node({}),
        integration: integration(),
        workflowId: "wf-1",
      } as never),
    ).rejects.toThrow("provider down");
  });
});
