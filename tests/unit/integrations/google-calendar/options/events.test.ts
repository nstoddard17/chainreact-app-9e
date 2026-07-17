/**
 * @jest-environment node
 *
 * Tests for `integrations/google-calendar/options/events.ts` (Slice RESOLVERS-2).
 *
 * Pin:
 *   - Shape (source / provider / requiresIntegration / requiredDeps).
 *   - The events.list query: 30-days-back timeMin, orderBy=startTime,
 *     singleEvents=true, showDeleted=false, server-side `q`.
 *   - Labels: "<title> - <Weekday DD Mon YYYY, HH:MM>"; all-day + no-title
 *     fallbacks; NEVER the raw id.
 *   - Cancelled + id-less events dropped; hasMore from nextPageToken.
 *   - MISSING_DEPENDENCY when calendarId is absent (no provider call).
 *   - NotFoundError parent calendar → EMPTY picker, not an error.
 *   - InsufficientScope → PROVIDER_REAUTH_REQUIRED; 401 /
 *     IntegrationActionRequired → INTEGRATION_DISCONNECTED; other →
 *     PROVIDER_ERROR. No token / raw-body leak in any arm.
 */

const mockEventsList = jest.fn();
jest.mock("@/integrations/google-calendar/api/eventsList", () => ({
  __esModule: true,
  eventsList: (...args: unknown[]) => mockEventsList(...args),
}));

const mockRefreshAndRetry = jest.fn();
jest.mock("@/services/oauth/refreshAndRetry", () => {
  const actual = jest.requireActual("@/services/oauth/refreshAndRetry");
  return {
    ...actual,
    refreshAndRetry: (...args: unknown[]) => mockRefreshAndRetry(...args),
  };
});

import { googleCalendarEventsResolver } from "@/integrations/google-calendar/options/events";
import { NotFoundError } from "@/integrations/google-calendar/api/errors";
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
  return {
    userId: "user-1",
    integration,
    q: "",
    deps: { calendarId: "primary" },
    ...overrides,
  };
}

beforeEach(() => {
  jest.clearAllMocks();
  mockRefreshAndRetry.mockImplementation(
    (input: { apiCall: (t: string) => unknown }) => input.apiCall("gcal-access-token"),
  );
});

describe("googleCalendarEventsResolver — shape + query", () => {
  it("declares the canonical source / provider / requiresIntegration / requiredDeps", () => {
    expect(googleCalendarEventsResolver.source).toBe("google-calendar:events");
    expect(googleCalendarEventsResolver.provider).toBe("google-calendar");
    expect(googleCalendarEventsResolver.requiresIntegration).toBe(true);
    // Dep name is pinned VERBATIM to the runtime Zod schema field.
    expect(googleCalendarEventsResolver.requiredDeps).toEqual(["calendarId"]);
  });

  it("lists a bounded, chronological, recurrence-expanded window from ~30 days ago", async () => {
    mockEventsList.mockResolvedValueOnce({ items: [] });
    const before = Date.now();
    await googleCalendarEventsResolver.resolve(ctx({ deps: { calendarId: "team@group.calendar.google.com" } }));

    const refreshCall = mockRefreshAndRetry.mock.calls[0]![0]!;
    expect(refreshCall.accountId).toBe("acct-user-1");
    expect(refreshCall.provider).toBe("google-calendar");
    expect(refreshCall.providerAccountId).toBe(null);

    const arg = mockEventsList.mock.calls[0]![0]!;
    expect(arg.calendarId).toBe("team@group.calendar.google.com");
    expect(arg.orderBy).toBe("startTime");
    expect(arg.singleEvents).toBe(true);
    expect(arg.showDeleted).toBe(false);
    expect(arg.maxResults).toBe(100);
    expect(arg.timeMax).toBeUndefined();

    const timeMinMs = Date.parse(arg.timeMin);
    const thirtyDays = 30 * 24 * 60 * 60 * 1000;
    expect(timeMinMs).toBeGreaterThanOrEqual(before - thirtyDays - 5_000);
    expect(timeMinMs).toBeLessThanOrEqual(Date.now() - thirtyDays + 5_000);
  });

  it("passes ctx.q to Google's server-side `q` param (not a client-side filter)", async () => {
    mockEventsList.mockResolvedValueOnce({ items: [] });
    await googleCalendarEventsResolver.resolve(ctx({ q: "standup" }));
    expect(mockEventsList.mock.calls[0]![0]!.q).toBe("standup");
  });

  it("omits `q` entirely when the search box is empty", async () => {
    mockEventsList.mockResolvedValueOnce({ items: [] });
    await googleCalendarEventsResolver.resolve(ctx({ q: "" }));
    expect(mockEventsList.mock.calls[0]![0]!.q).toBeUndefined();
  });
});

describe("googleCalendarEventsResolver — labels + mapping", () => {
  it("labels events by title + readable start; drops cancelled + id-less; hasMore from nextPageToken", async () => {
    mockEventsList.mockResolvedValueOnce({
      items: [
        {
          id: "ev_standup_1",
          summary: "Weekly Standup",
          start: { dateTime: "2026-07-20T09:00:00+01:00", timeZone: "Europe/London" },
        },
        {
          id: "ev_allday",
          summary: "Company Offsite",
          start: { date: "2026-08-03" },
        },
        { id: "ev_cancelled", summary: "Gone", status: "cancelled", start: { date: "2026-08-04" } },
        { summary: "no-id", start: { date: "2026-08-05" } },
      ],
      nextPageToken: "page2",
    });

    const result = await googleCalendarEventsResolver.resolve(ctx());
    expect(result.items).toEqual([
      {
        value: "ev_standup_1",
        label: "Weekly Standup - Mon 20 Jul 2026, 09:00",
        description: "Europe/London",
      },
      { value: "ev_allday", label: "Company Offsite - Mon 3 Aug 2026 (all day)" },
    ]);
    expect(result.hasMore).toBe(true);
  });

  it("falls back to '(no title)' + the start — never the raw id — and never leaks the raw payload", async () => {
    mockEventsList.mockResolvedValueOnce({
      items: [
        {
          id: "ev_opaque_abc123",
          summary: "   ",
          description: "secret event body",
          attendees: [{ email: "someone@example.com" }],
          start: { dateTime: "2026-07-21T14:30:00Z" },
        },
      ],
    });

    const result = await googleCalendarEventsResolver.resolve(ctx());
    expect(result.items).toEqual([
      { value: "ev_opaque_abc123", label: "(no title) - Tue 21 Jul 2026, 14:30" },
    ]);
    // The id is the VALUE, never the label.
    expect(result.items[0]!.label).not.toContain("ev_opaque_abc123");
    // Bounded mapping — no body / attendee PII rides along into options.
    const serialized = JSON.stringify(result.items);
    expect(serialized).not.toContain("secret event body");
    expect(serialized).not.toContain("someone@example.com");
    expect(result.hasMore).toBe(false);
  });

  it("falls back to the bare title when the start shape is unrecognizable", async () => {
    mockEventsList.mockResolvedValueOnce({
      items: [{ id: "ev_weird", summary: "Odd Event", start: {} }],
    });
    const result = await googleCalendarEventsResolver.resolve(ctx());
    expect(result.items).toEqual([{ value: "ev_weird", label: "Odd Event" }]);
  });
});

describe("googleCalendarEventsResolver — dependency + error sanitization", () => {
  it("MISSING_DEPENDENCY when calendarId is absent/blank (no provider call)", async () => {
    const cases: Array<Readonly<Record<string, string>>> = [{}, { calendarId: "" }];
    for (const deps of cases) {
      const thrown = await googleCalendarEventsResolver.resolve(ctx({ deps })).catch((e) => e);
      expect(thrown).toBeInstanceOf(OptionsResolverError);
      expect(thrown.code).toBe("MISSING_DEPENDENCY");
    }
    expect(mockRefreshAndRetry).not.toHaveBeenCalled();
  });

  it("a deleted / inaccessible parent calendar (NotFoundError) → EMPTY picker, not an error", async () => {
    mockEventsList.mockRejectedValueOnce(new NotFoundError("calendar", "Not Found"));
    const result = await googleCalendarEventsResolver.resolve(ctx());
    expect(result).toEqual({ items: [], hasMore: false });
  });

  it("InsufficientScopeError (403 — token predating calendar.readonly) → PROVIDER_REAUTH_REQUIRED", async () => {
    mockRefreshAndRetry.mockRejectedValueOnce(
      new InsufficientScopeError("HTTP 403", "google-calendar"),
    );
    const thrown = await googleCalendarEventsResolver.resolve(ctx()).catch((e) => e);
    expect(thrown).toBeInstanceOf(OptionsResolverError);
    expect(thrown.code).toBe("PROVIDER_REAUTH_REQUIRED");
  });

  it("401 / IntegrationActionRequired → INTEGRATION_DISCONNECTED (no token leak)", async () => {
    for (const err of [
      new Unauthorized401Error("401"),
      new IntegrationActionRequiredError({
        accountId: "acct-user-1",
        provider: "google-calendar",
        providerAccountId: null,
        reason: "refresh_failed",
      }),
    ]) {
      mockRefreshAndRetry.mockRejectedValueOnce(err);
      const thrown = await googleCalendarEventsResolver.resolve(ctx()).catch((e) => e);
      expect(thrown).toBeInstanceOf(OptionsResolverError);
      expect(thrown.code).toBe("INTEGRATION_DISCONNECTED");
      expect(thrown.message).not.toMatch(/gcal-access-token|enc:|cipher/);
    }
  });

  it("no leak: an unexpected provider error → PROVIDER_ERROR with no token / raw body", async () => {
    mockEventsList.mockRejectedValueOnce(
      new Error(
        "Google Calendar events.list failed: Bearer gcal-access-token rejected; secret-detail",
      ),
    );
    const thrown = await googleCalendarEventsResolver.resolve(ctx()).catch((e) => e);
    expect(thrown).toBeInstanceOf(OptionsResolverError);
    expect(thrown.code).toBe("PROVIDER_ERROR");
    expect(thrown.message).toBe("Couldn't load Google Calendar events. Try again.");
    expect(thrown.message).not.toMatch(/gcal-access-token|secret-detail|Bearer/);
  });

  it("INTEGRATION_DISCONNECTED when ctx.integration is null (no provider call)", async () => {
    const thrown = await googleCalendarEventsResolver
      .resolve(ctx({ integration: null }))
      .catch((e) => e);
    expect(thrown).toBeInstanceOf(OptionsResolverError);
    expect(thrown.code).toBe("INTEGRATION_DISCONNECTED");
    expect(mockRefreshAndRetry).not.toHaveBeenCalled();
  });
});
