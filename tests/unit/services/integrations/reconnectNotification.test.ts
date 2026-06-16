/**
 * @jest-environment node
 *
 * Tests for services/integrations/reconnectNotification.notifyReconnectNeeded
 * (V2-READY-28B). Verifies recipient selection, safe copy, no-leak, and
 * best-effort behavior. Duplicate-prevention is upstream (the conditional
 * markNeedsReconnect UPDATE) — this helper is only ever called on a true
 * first-mark, so it always creates exactly one notification when a recipient
 * exists.
 */

const mockCreate = jest.fn();
jest.mock("@/repositories/notifications", () => ({
  create: (...args: unknown[]) => mockCreate(...args),
}));

const mockGetProvider = jest.fn();
jest.mock("@/integrations/_registry", () => ({
  getProvider: (...args: unknown[]) => mockGetProvider(...args),
}));

import { notifyReconnectNeeded } from "@/services/integrations/reconnectNotification";
import type { IntegrationRecord } from "@/repositories/integrations";

function integration(over: Partial<IntegrationRecord> = {}): IntegrationRecord {
  return {
    id: "int-1",
    accountId: "acct-9f2c",
    connectedByUserId: "user-connector",
    provider: "slack",
    providerAccountId: "T0SECRETTEAM",
    displayName: "Acme Workspace · alice@example.com",
    accessTokenEncrypted: (["xoxb", "SECRET"].join("-")),
    refreshTokenEncrypted: null,
    accessTokenExpiresAt: null,
    scopes: ["channels:read", "chat:write"],
    accountMetadata: { teamId: "T0SECRETTEAM" },
    disconnectedAt: null,
    needsReconnectAt: "2026-06-14T00:00:00Z",
    createdAt: "2026-04-15T12:00:00Z",
    updatedAt: "2026-05-30T12:00:00Z",
    ...over,
  };
}

beforeEach(() => {
  mockCreate.mockReset();
  mockCreate.mockResolvedValue({ id: "notif-1" });
  mockGetProvider.mockReset();
  mockGetProvider.mockReturnValue({ displayName: "Slack" });
});

describe("notifyReconnectNeeded", () => {
  it("creates ONE notification for the connector with safe, action-oriented copy", async () => {
    await notifyReconnectNeeded(integration({ connectedByUserId: "user-connector" }));
    expect(mockCreate).toHaveBeenCalledTimes(1);
    expect(mockCreate).toHaveBeenCalledWith({
      userId: "user-connector",
      type: "integration_reconnect_needed",
      severity: "warning",
      title: "Reconnect Slack",
      body: "Slack needs to be reconnected before ChainReact can use it.",
      actionUrl: "/apps",
      metadata: {},
    });
  });

  it("recipient is the connected_by user for an account/service provider (Slack)", async () => {
    await notifyReconnectNeeded(integration({ provider: "slack", connectedByUserId: "u-slack-admin" }));
    expect(mockCreate.mock.calls[0]![0].userId).toBe("u-slack-admin");
  });

  it("recipient is the connector for a personal provider too", async () => {
    mockGetProvider.mockReturnValue({ displayName: "Gmail" });
    await notifyReconnectNeeded(integration({ provider: "gmail", connectedByUserId: "u-personal" }));
    expect(mockCreate.mock.calls[0]![0].userId).toBe("u-personal");
    expect(mockCreate.mock.calls[0]![0].title).toBe("Reconnect Gmail");
  });

  it("falls back to the provider slug when no manifest display name is registered", async () => {
    mockGetProvider.mockReturnValue(undefined);
    await notifyReconnectNeeded(integration({ provider: "slack" }));
    expect(mockCreate.mock.calls[0]![0].title).toBe("Reconnect slack");
  });

  it("does NOT notify when there is no connector (connected_by_user_id is null) — no escalation/guessing", async () => {
    await notifyReconnectNeeded(integration({ connectedByUserId: null }));
    expect(mockCreate).not.toHaveBeenCalled();
  });

  it("leaks NO provider identifiers in the notification payload", async () => {
    await notifyReconnectNeeded(integration());
    const serialized = JSON.stringify(mockCreate.mock.calls[0]![0]);
    for (const frag of [
      "T0SECRETTEAM",
      (["xoxb", "SECRET"].join("-")),
      "alice@example.com",
      "acct-9f2c",
      "channels:read",
      "chat:write",
      "2026-06-14T00:00:00Z", // the needs_reconnect_at timestamp
    ]) {
      expect(serialized).not.toContain(frag);
    }
  });

  it("is best-effort: a notifications.create failure is swallowed (never breaks the caller)", async () => {
    const warnSpy = jest.spyOn(console, "warn").mockImplementation(() => {});
    mockCreate.mockRejectedValueOnce(new Error("notifications.create failed: db down"));
    await expect(notifyReconnectNeeded(integration())).resolves.toBeUndefined();
    // The swallow path logs safely (provider slug only) — no raw identifiers.
    const logged = String(warnSpy.mock.calls[0]?.[0] ?? "");
    expect(logged).toContain("integration.reconnect_notification.error");
    expect(logged).not.toContain((["xoxb", "SECRET"].join("-")));
    warnSpy.mockRestore();
  });
});
