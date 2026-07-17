/**
 * @jest-environment node
 *
 * Tests for `integrations/microsoft-outlook-calendar/options/events.ts`
 * (Slice RESOLVERS-2).
 *
 * Pin:
 *   - Shape (source / provider / requiresIntegration) and — deliberately — NO
 *     `requiredDeps`: the three Outlook Calendar actions have no `calendarId`
 *     field and address /me/events (the default calendar), so there is no
 *     sibling calendar field to depend on.
 *   - The calendarView query: both bounds supplied (⇒ recurrence-expanding
 *     /me/calendarView), 30 days back → 180 days forward, orderBy=start,
 *     top=100.
 *   - Labels: "<subject> - <Weekday DD Mon YYYY, HH:MM>"; no-title fallback;
 *     NEVER the raw id.
 *   - `hasMore` from Graph's @odata.nextLink; q filters the fetched page.
 *   - NotFoundError → EMPTY picker, not an error.
 *   - 401 / IntegrationActionRequired → INTEGRATION_DISCONNECTED; other →
 *     PROVIDER_ERROR. No token / raw-body leak in any arm.
 */

const mockEventsList = jest.fn();
jest.mock("@/integrations/microsoft-outlook-calendar/api/eventsList", () => ({
  __esModule: true,
  eventsList: (...args: unknown[]) => mockEventsList(...args),
}));

const mockRefresh = jest.fn();
jest.mock("@/services/oauth/refreshAndRetry", () => {
  const actual = jest.requireActual("@/services/oauth/refreshAndRetry");
  return { ...actual, refreshAndRetry: (input: unknown) => mockRefresh(input) };
});

import { outlookCalendarEventsResolver } from "@/integrations/microsoft-outlook-calendar/options/events";
import { NotFoundError } from "@/integrations/_shared/microsoft/api/errors";
import {
  IntegrationActionRequiredError,
  Unauthorized401Error,
} from "@/services/oauth/refreshAndRetry";
import {
  OptionsResolverError,
  type OptionsResolverContext,
} from "@/services/options/types";
import type { IntegrationRecord } from "@/repositories/integrations";

const integration = {
  accountId: "acct-1",
  accessTokenEncrypted: "enc:outlook-cipher",
} as unknown as IntegrationRecord;

function ctx(overrides: Partial<OptionsResolverContext> = {}): OptionsResolverContext {
  return { userId: "user-1", integration, q: "", deps: {}, ...overrides };
}

beforeEach(() => {
  jest.clearAllMocks();
  jest.spyOn(console, "warn").mockImplementation(() => {});
  mockRefresh.mockImplementation((input: { apiCall: (t: string) => unknown }) =>
    input.apiCall("graph-access-token"),
  );
});

afterEach(() => jest.restoreAllMocks());

describe("outlookCalendarEventsResolver — shape + query", () => {
  it("declares the canonical source / provider / requiresIntegration, and NO requiredDeps", () => {
    expect(outlookCalendarEventsResolver.source).toBe("microsoft-outlook-calendar:events");
    expect(outlookCalendarEventsResolver.provider).toBe("microsoft-outlook-calendar");
    expect(outlookCalendarEventsResolver.requiresIntegration).toBe(true);
    // The actions have no calendarId field — see the resolver's NO PARENT DEP note.
    expect(outlookCalendarEventsResolver.requiredDeps).toBeUndefined();
  });

  it("queries a bounded chronological window (30d back → 180d forward) via calendarView", async () => {
    mockEventsList.mockResolvedValueOnce({ events: [], nextLink: null });
    const before = Date.now();
    await outlookCalendarEventsResolver.resolve(ctx());

    const refreshCall = mockRefresh.mock.calls[0]![0]!;
    expect(refreshCall.accountId).toBe("acct-1");
    expect(refreshCall.provider).toBe("microsoft-outlook-calendar");
    expect(refreshCall.providerAccountId).toBe(null);

    const arg = mockEventsList.mock.calls[0]![0]!;
    // BOTH bounds ⇒ the wrapper uses /me/calendarView (expands recurrences,
    // orders by start/dateTime). Omitting one would silently fall back to
    // /me/events, which returns series masters ordered by createdDateTime.
    expect(typeof arg.startDateTime).toBe("string");
    expect(typeof arg.endDateTime).toBe("string");
    expect(arg.orderBy).toBe("start");
    expect(arg.top).toBe(100);
    // Server-side subject filtering is deliberately NOT used (Graph rejects
    // contains() + $orderby=start/dateTime).
    expect(arg.subjectFilter).toBeUndefined();

    const day = 24 * 60 * 60 * 1000;
    expect(Date.parse(arg.startDateTime)).toBeGreaterThanOrEqual(before - 30 * day - 5_000);
    expect(Date.parse(arg.startDateTime)).toBeLessThanOrEqual(Date.now() - 30 * day + 5_000);
    expect(Date.parse(arg.endDateTime)).toBeGreaterThanOrEqual(before + 180 * day - 5_000);
    expect(Date.parse(arg.endDateTime)).toBeLessThanOrEqual(Date.now() + 180 * day + 5_000);
  });
});

describe("outlookCalendarEventsResolver — labels + mapping", () => {
  it("labels events by subject + readable start; drops id-less; hasMore from @odata.nextLink", async () => {
    mockEventsList.mockResolvedValueOnce({
      events: [
        {
          id: "AAMkAGstandup",
          subject: "Weekly Standup",
          start: { dateTime: "2026-07-20T09:00:00.0000000", timeZone: "UTC" },
        },
        {
          id: "AAMkAGreview",
          subject: "Design Review",
          start: { dateTime: "2026-07-21T14:30:00.0000000", timeZone: "UTC" },
        },
        { subject: "no-id", start: { dateTime: "2026-07-22T10:00:00.0000000" } },
      ],
      nextLink: "https://graph.microsoft.com/v1.0/me/calendarView?$skip=100",
    });

    const result = await outlookCalendarEventsResolver.resolve(ctx());
    expect(result.items).toEqual([
      {
        value: "AAMkAGstandup",
        label: "Weekly Standup - Mon 20 Jul 2026, 09:00",
        description: "UTC",
      },
      {
        value: "AAMkAGreview",
        label: "Design Review - Tue 21 Jul 2026, 14:30",
        description: "UTC",
      },
    ]);
    expect(result.hasMore).toBe(true);
    // The provider URL in nextLink must never reach the client as an option.
    expect(JSON.stringify(result.items)).not.toContain("graph.microsoft.com");
  });

  it("filters the fetched page by q (case-insensitive), leaving hasMore describing the window", async () => {
    mockEventsList.mockResolvedValueOnce({
      events: [
        { id: "ev1", subject: "Weekly Standup", start: { dateTime: "2026-07-20T09:00:00.0000000" } },
        { id: "ev2", subject: "Design Review", start: { dateTime: "2026-07-21T14:30:00.0000000" } },
      ],
      nextLink: null,
    });
    const result = await outlookCalendarEventsResolver.resolve(ctx({ q: "STANDUP" }));
    expect(result.items.map((i) => i.value)).toEqual(["ev1"]);
    expect(result.hasMore).toBe(false);
  });

  it("falls back to '(no title)' + the start — never the raw id — and never leaks the raw payload", async () => {
    mockEventsList.mockResolvedValueOnce({
      events: [
        {
          id: "AAMkAGopaque123",
          subject: "  ",
          bodyPreview: "secret event body",
          attendees: [{ emailAddress: { address: "someone@example.com" } }],
          organizer: { emailAddress: { address: "boss@example.com" } },
          start: { dateTime: "2026-07-21T14:30:00.0000000" },
        },
      ],
      nextLink: null,
    });

    const result = await outlookCalendarEventsResolver.resolve(ctx());
    expect(result.items).toEqual([
      { value: "AAMkAGopaque123", label: "(no title) - Tue 21 Jul 2026, 14:30" },
    ]);
    expect(result.items[0]!.label).not.toContain("AAMkAGopaque123");
    const serialized = JSON.stringify(result.items);
    expect(serialized).not.toContain("secret event body");
    expect(serialized).not.toContain("someone@example.com");
    expect(serialized).not.toContain("boss@example.com");
  });

  it("falls back to the bare subject when the start shape is unrecognizable", async () => {
    mockEventsList.mockResolvedValueOnce({
      events: [{ id: "ev_weird", subject: "Odd Event", start: {} }],
      nextLink: null,
    });
    const result = await outlookCalendarEventsResolver.resolve(ctx());
    expect(result.items).toEqual([{ value: "ev_weird", label: "Odd Event" }]);
  });
});

describe("outlookCalendarEventsResolver — error sanitization", () => {
  it("an inaccessible calendar (NotFoundError) → EMPTY picker, not an error", async () => {
    mockEventsList.mockRejectedValueOnce(new NotFoundError("calendar", "Not Found"));
    const result = await outlookCalendarEventsResolver.resolve(ctx());
    expect(result).toEqual({ items: [], hasMore: false });
  });

  it("401 / IntegrationActionRequired → INTEGRATION_DISCONNECTED (no token leak)", async () => {
    for (const err of [
      new Unauthorized401Error("401"),
      new IntegrationActionRequiredError({
        accountId: "acct-1",
        provider: "microsoft-outlook-calendar",
        providerAccountId: null,
        reason: "refresh_failed",
      }),
    ]) {
      mockRefresh.mockRejectedValueOnce(err);
      const thrown = await outlookCalendarEventsResolver.resolve(ctx()).catch((e) => e);
      expect(thrown).toBeInstanceOf(OptionsResolverError);
      expect(thrown.code).toBe("INTEGRATION_DISCONNECTED");
      expect(thrown.message).not.toMatch(/graph-access-token|enc:|cipher/);
    }
  });

  it("no leak: an unexpected provider error → PROVIDER_ERROR with no token / raw body", async () => {
    mockEventsList.mockRejectedValueOnce(
      new Error(
        "Microsoft Graph me/events GET failed: Bearer graph-access-token rejected; secret-detail",
      ),
    );
    const thrown = await outlookCalendarEventsResolver.resolve(ctx()).catch((e) => e);
    expect(thrown).toBeInstanceOf(OptionsResolverError);
    expect(thrown.code).toBe("PROVIDER_ERROR");
    expect(thrown.message).toBe("Couldn't load your Outlook Calendar events. Try again.");
    expect(thrown.message).not.toMatch(/graph-access-token|secret-detail|Bearer/);
    // The token-free warn breadcrumb must not carry the provider body either.
    const warned = JSON.stringify((console.warn as jest.Mock).mock.calls);
    expect(warned).not.toMatch(/graph-access-token|secret-detail/);
  });

  it("INTEGRATION_DISCONNECTED when ctx.integration is null (no provider call)", async () => {
    const thrown = await outlookCalendarEventsResolver
      .resolve(ctx({ integration: null }))
      .catch((e) => e);
    expect(thrown).toBeInstanceOf(OptionsResolverError);
    expect(thrown.code).toBe("INTEGRATION_DISCONNECTED");
    expect(mockRefresh).not.toHaveBeenCalled();
  });
});
