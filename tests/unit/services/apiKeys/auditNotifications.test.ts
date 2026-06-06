/**
 * @jest-environment node
 *
 * Tests for services/apiKeys/auditNotifications (Slice 4.API-KEYS-AUDIT-1). Mocks the
 * notifications repo to assert the SAFE payload (type + recipient + name/prefix/ids,
 * never a raw key / hash / token) and the best-effort contract: a notifications
 * failure NEVER throws and NEVER logs a secret.
 */

const mockCreate = jest.fn();
jest.mock("@/repositories/notifications", () => ({
  create: (...a: unknown[]) => mockCreate(...a),
}));

import {
  recordApiKeyCreatedNotification,
  recordApiKeyRevokedNotification,
} from "@/services/apiKeys/auditNotifications";

const INPUT = {
  recipientUserId: "user-1",
  accountId: "acct-1",
  keyId: "key-1",
  name: "CI trigger",
  prefix: "crk_live_AbCd1234",
  actorUserId: "user-1",
};

beforeEach(() => mockCreate.mockReset().mockResolvedValue({ id: "n1" }));

describe("recordApiKeyCreatedNotification", () => {
  it("writes an api_key_created notice to the recipient with safe fields only", async () => {
    await recordApiKeyCreatedNotification(INPUT);
    expect(mockCreate).toHaveBeenCalledTimes(1);
    const payload = mockCreate.mock.calls[0]![0] as Record<string, unknown>;
    expect(payload.userId).toBe("user-1");
    expect(payload.type).toBe("api_key_created");
    expect(payload.title).toContain("CI trigger");
    expect(payload.actionUrl).toBe("/account?section=api");
    expect(payload.metadata).toMatchObject({
      action: "created",
      keyId: "key-1",
      prefix: "crk_live_AbCd1234",
      name: "CI trigger",
      accountId: "acct-1",
      actorUserId: "user-1",
    });
    // No-leak: nothing secret in the whole payload.
    const serialized = JSON.stringify(payload);
    expect(serialized).not.toMatch(/key_?hash/i);
    expect(serialized).not.toMatch(/access_token|refresh_token|secret/i);
  });
});

describe("recordApiKeyRevokedNotification", () => {
  it("writes an api_key_revoked notice", async () => {
    await recordApiKeyRevokedNotification(INPUT);
    const payload = mockCreate.mock.calls[0]![0] as Record<string, unknown>;
    expect(payload.type).toBe("api_key_revoked");
    expect((payload.metadata as Record<string, unknown>).action).toBe("revoked");
  });
});

describe("best-effort failure handling", () => {
  it("a notifications failure resolves (never throws) and logs ids only — no secret", async () => {
    mockCreate.mockRejectedValue(new Error("db down"));
    const warn = jest.spyOn(console, "warn").mockImplementation(() => {});
    await expect(recordApiKeyCreatedNotification(INPUT)).resolves.toBeUndefined();
    expect(warn).toHaveBeenCalledTimes(1);
    const logged = String(warn.mock.calls[0]![0]);
    expect(logged).toContain("api_key.audit_notification_failed");
    expect(logged).toContain("key-1");
    // The warning must not carry the raw key / hash / token.
    expect(logged).not.toMatch(/key_?hash/i);
    expect(logged).not.toMatch(/crk_live_[A-Za-z0-9_-]{20,}/);
    warn.mockRestore();
  });
});
