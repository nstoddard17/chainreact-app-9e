/**
 * @jest-environment node
 *
 * Tests for app/notifications/credentialRequestNotice.ts (CS-8). The derived,
 * non-persisted NotificationBell notice for pending credential-reassignment
 * requests. Mocks the flag, the active-account resolver, and the inbox count.
 * Proves: flag gating (no account/DB work when off), self-scoped count → item,
 * singular/plural copy, count-only no-leak shape, fail-quiet, and the merge.
 */

const mockFlag = jest.fn();
jest.mock("@/services/teamCredentials/flags", () => ({
  isNodeCredentialReassignmentEnabled: () => mockFlag(),
}));

const mockResolve = jest.fn();
jest.mock("@/services/accounts/activeAccount", () => ({
  resolveActiveAccount: (...a: unknown[]) => mockResolve(...a),
}));

const mockCount = jest.fn();
jest.mock("@/services/teamCredentials/credentialRequestsInbox", () => ({
  countIncomingCredentialRequests: (...a: unknown[]) => mockCount(...a),
}));

import {
  getCredentialRequestBellNotice,
  applyCredentialRequestNotice,
  CREDENTIAL_REQUEST_NOTICE_ID,
} from "@/app/notifications/credentialRequestNotice";
import type { NotificationPreview } from "@/components/app-shell/notificationPreview";

const USER = "user-me";

beforeEach(() => {
  mockFlag.mockReset().mockReturnValue(true);
  mockResolve.mockReset().mockResolvedValue({ ok: true, account: { id: "acct-1" } });
  mockCount.mockReset().mockResolvedValue(0);
});

describe("getCredentialRequestBellNotice", () => {
  it("returns the empty notice WITHOUT resolving the account when the flag is OFF", async () => {
    mockFlag.mockReturnValue(false);
    const notice = await getCredentialRequestBellNotice(USER);
    expect(notice).toEqual({ count: 0, item: null });
    expect(mockResolve).not.toHaveBeenCalled();
    expect(mockCount).not.toHaveBeenCalled();
  });

  it("returns the empty notice when the active account can't be resolved (never counts)", async () => {
    mockResolve.mockResolvedValue({ ok: false, reason: "not_member" });
    const notice = await getCredentialRequestBellNotice(USER);
    expect(notice).toEqual({ count: 0, item: null });
    expect(mockCount).not.toHaveBeenCalled();
  });

  it("returns the empty notice when there are no pending requests", async () => {
    mockCount.mockResolvedValue(0);
    expect(await getCredentialRequestBellNotice(USER)).toEqual({ count: 0, item: null });
  });

  it("builds a count-only item linking to /team when there are pending requests", async () => {
    mockCount.mockResolvedValue(3);
    const notice = await getCredentialRequestBellNotice(USER);
    expect(notice.count).toBe(3);
    expect(mockCount).toHaveBeenCalledWith({ accountId: "acct-1", userId: USER });
    expect(notice.item).toMatchObject({
      id: CREDENTIAL_REQUEST_NOTICE_ID,
      title: "3 credential reassignment requests",
      severity: "warning",
      actionUrl: "/team",
      isUnread: true,
      createdAt: "",
    });
    expect(notice.item!.body).toMatch(/Team page/i);
    // No-leak: only the documented count-only fields, no provider/requester/token.
    const serialized = JSON.stringify(notice.item).toLowerCase();
    for (const banned of ["token", "scope", "email", "gmail", "@"]) {
      expect(serialized).not.toContain(banned);
    }
  });

  it("uses singular copy for exactly one request", async () => {
    mockCount.mockResolvedValue(1);
    const notice = await getCredentialRequestBellNotice(USER);
    expect(notice.item!.title).toBe("1 credential reassignment request");
  });

  it("fails quiet (empty notice) when resolution throws", async () => {
    mockResolve.mockRejectedValue(new Error("boom"));
    expect(await getCredentialRequestBellNotice(USER)).toEqual({ count: 0, item: null });
  });

  it("fails quiet (empty notice) when the count throws", async () => {
    mockCount.mockRejectedValue(new Error("boom"));
    expect(await getCredentialRequestBellNotice(USER)).toEqual({ count: 0, item: null });
  });
});

describe("applyCredentialRequestNotice", () => {
  function preview(id: string): NotificationPreview {
    return {
      id,
      title: `n-${id}`,
      body: "b",
      severity: "warning",
      actionUrl: null,
      isUnread: true,
      createdAt: "2026-06-06T00:00:00Z",
    };
  }

  it("passes through unchanged when there is no notice (flag off / none pending)", async () => {
    mockFlag.mockReturnValue(false);
    const base = [preview("a"), preview("b")];
    const result = await applyCredentialRequestNotice(USER, 4, base);
    expect(result.unreadNotifications).toBe(4);
    expect(result.recentNotifications).toBe(base); // same reference — untouched
  });

  it("adds the count to the badge and prepends the derived row", async () => {
    mockCount.mockResolvedValue(2);
    const base = [preview("a"), preview("b")];
    const result = await applyCredentialRequestNotice(USER, 4, base);
    expect(result.unreadNotifications).toBe(6); // 4 + 2
    expect(result.recentNotifications[0]!.id).toBe(CREDENTIAL_REQUEST_NOTICE_ID);
    expect(result.recentNotifications.map((n) => n.id)).toEqual([
      CREDENTIAL_REQUEST_NOTICE_ID,
      "a",
      "b",
    ]);
  });

  it("re-caps the prepended list to the popover preview limit (5)", async () => {
    mockCount.mockResolvedValue(1);
    const base = ["a", "b", "c", "d", "e"].map(preview); // already 5
    const result = await applyCredentialRequestNotice(USER, 0, base);
    expect(result.recentNotifications).toHaveLength(5);
    expect(result.recentNotifications[0]!.id).toBe(CREDENTIAL_REQUEST_NOTICE_ID);
    // The oldest persisted preview ("e") is dropped from the popover preview.
    expect(result.recentNotifications.map((n) => n.id)).toEqual([
      CREDENTIAL_REQUEST_NOTICE_ID,
      "a",
      "b",
      "c",
      "d",
    ]);
  });
});
