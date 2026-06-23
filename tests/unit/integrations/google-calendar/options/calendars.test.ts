/**
 * @jest-environment node
 *
 * Tests for `integrations/google-calendar/options/calendars.ts`
 * (CONFIG-FIELD-UX-SWEEP-4).
 *
 * Pin:
 *   - Shape (source / provider / requiresIntegration).
 *   - refreshAndRetry called with provider="google-calendar", accountId, and a
 *     calendarListList closure.
 *   - Mapping: id → value, summaryOverride ?? summary ?? id → label, primary →
 *     "Primary calendar" description; deleted dropped; id-less dropped.
 *   - Case-insensitive q filter over label + value.
 *   - MISSING-SCOPE / RECONNECT: InsufficientScopeError (HTTP 403 — old token
 *     without calendar.readonly) → PROVIDER_REAUTH_REQUIRED.
 *   - 401 / IntegrationActionRequired → INTEGRATION_DISCONNECTED.
 *   - INTEGRATION_DISCONNECTED when ctx.integration is null.
 *   - No raw provider payload leaks (only value/label/description).
 */

const mockRefreshAndRetry = jest.fn();
jest.mock("@/services/oauth/refreshAndRetry", () => {
  const actual = jest.requireActual("@/services/oauth/refreshAndRetry");
  return {
    ...actual,
    refreshAndRetry: (...args: unknown[]) => mockRefreshAndRetry(...args),
  };
});

import { googleCalendarCalendarsResolver } from "@/integrations/google-calendar/options/calendars";
import {
  InsufficientScopeError,
  IntegrationActionRequiredError,
  Unauthorized401Error,
} from "@/services/oauth/refreshAndRetry";
import {
  OptionsResolverError,
  type OptionsResolverContext,
} from "@/services/options/types";
import type { IntegrationRecord } from "@/repositories/integrations";

const integration: IntegrationRecord = {
  id: "int-1",
  accountId: "acct-user-1",
  connectedByUserId: "user-1",
  provider: "google-calendar",
  providerAccountId: "you@gmail.com",
  displayName: "you@gmail.com",
  accessTokenEncrypted: "enc:gcal-token-cipher",
  refreshTokenEncrypted: "enc:gcal-refresh-cipher",
  accessTokenExpiresAt: "2026-06-01T00:00:00Z",
  scopes: ["calendar.events", "calendar.readonly"],
  accountMetadata: {},
  disconnectedAt: null,
  createdAt: "2026-05-22T00:00:00Z",
  updatedAt: "2026-05-22T00:00:00Z",
};

function ctx(overrides: Partial<OptionsResolverContext> = {}): OptionsResolverContext {
  return { userId: "user-1", integration, q: "", deps: {}, ...overrides };
}

beforeEach(() => mockRefreshAndRetry.mockReset());

describe("googleCalendarCalendarsResolver — shape", () => {
  it("declares the canonical source / provider / requiresIntegration", () => {
    expect(googleCalendarCalendarsResolver.source).toBe("google-calendar:calendars");
    expect(googleCalendarCalendarsResolver.provider).toBe("google-calendar");
    expect(googleCalendarCalendarsResolver.requiresIntegration).toBe(true);
  });

  it("calls refreshAndRetry with provider='google-calendar', accountId, calendarListList closure", async () => {
    mockRefreshAndRetry.mockResolvedValueOnce({ items: [] });
    await googleCalendarCalendarsResolver.resolve(ctx());
    const call = mockRefreshAndRetry.mock.calls[0]![0]!;
    expect(call.accountId).toBe("acct-user-1");
    expect(call.provider).toBe("google-calendar");
    expect(call.providerAccountId).toBe(null);
    expect(typeof call.apiCall).toBe("function");
  });
});

describe("googleCalendarCalendarsResolver — mapping", () => {
  it("maps id → value, prefers summaryOverride, marks primary, drops deleted + id-less", async () => {
    mockRefreshAndRetry.mockResolvedValueOnce({
      items: [
        { id: "primary", summary: "you@gmail.com", primary: true },
        { id: "team@group.calendar.google.com", summary: "Team", summaryOverride: "My Team" },
        { id: "old@group.calendar.google.com", summary: "Old", deleted: true },
        { summary: "no-id" },
      ],
      nextPageToken: undefined,
    });
    const result = await googleCalendarCalendarsResolver.resolve(ctx());
    expect(result.items).toEqual([
      { value: "primary", label: "you@gmail.com", description: "Primary calendar" },
      { value: "team@group.calendar.google.com", label: "My Team" },
    ]);
    expect(result.hasMore).toBe(false);
    // No raw provider fields (accessRole etc.) leak.
    expect(JSON.stringify(result.items)).not.toContain("accessRole");
    expect(JSON.stringify(result.items)).not.toContain("deleted");
  });

  it("case-insensitive q filter over label + value; hasMore from nextPageToken", async () => {
    mockRefreshAndRetry.mockResolvedValueOnce({
      items: [
        { id: "primary", summary: "Work" },
        { id: "home@group.calendar.google.com", summary: "Home" },
      ],
      nextPageToken: "page2",
    });
    const result = await googleCalendarCalendarsResolver.resolve(ctx({ q: "HOME" }));
    expect(result.items.map((i) => i.value)).toEqual(["home@group.calendar.google.com"]);
    expect(result.hasMore).toBe(true);
  });
});

describe("googleCalendarCalendarsResolver — missing-scope / reconnect + errors", () => {
  it("InsufficientScopeError (403 — old token without calendar.readonly) → PROVIDER_REAUTH_REQUIRED", async () => {
    mockRefreshAndRetry.mockRejectedValueOnce(
      new InsufficientScopeError("HTTP 403", "google-calendar"),
    );
    try {
      await googleCalendarCalendarsResolver.resolve(ctx());
      throw new Error("expected throw");
    } catch (err) {
      expect(err).toBeInstanceOf(OptionsResolverError);
      expect((err as OptionsResolverError).code).toBe("PROVIDER_REAUTH_REQUIRED");
    }
  });

  it("Unauthorized401 / IntegrationActionRequired → INTEGRATION_DISCONNECTED", async () => {
    mockRefreshAndRetry.mockRejectedValueOnce(new Unauthorized401Error("401"));
    await expect(googleCalendarCalendarsResolver.resolve(ctx())).rejects.toMatchObject({
      code: "INTEGRATION_DISCONNECTED",
    });
    mockRefreshAndRetry.mockRejectedValueOnce(
      new IntegrationActionRequiredError({
        accountId: "acct-user-1",
        provider: "google-calendar",
        providerAccountId: null,
        reason: "refresh_failed",
      }),
    );
    await expect(googleCalendarCalendarsResolver.resolve(ctx())).rejects.toMatchObject({
      code: "INTEGRATION_DISCONNECTED",
    });
  });

  it("other errors → PROVIDER_ERROR with no raw body leak", async () => {
    mockRefreshAndRetry.mockRejectedValueOnce(
      new Error("Google Calendar calendarList.list failed: secret-detail"),
    );
    try {
      await googleCalendarCalendarsResolver.resolve(ctx());
      throw new Error("expected throw");
    } catch (err) {
      expect((err as OptionsResolverError).code).toBe("PROVIDER_ERROR");
      expect((err as Error).message).not.toContain("secret-detail");
    }
  });

  it("INTEGRATION_DISCONNECTED when ctx.integration is null (no provider call)", async () => {
    await expect(
      googleCalendarCalendarsResolver.resolve(ctx({ integration: null })),
    ).rejects.toMatchObject({ code: "INTEGRATION_DISCONNECTED" });
    expect(mockRefreshAndRetry).not.toHaveBeenCalled();
  });
});
