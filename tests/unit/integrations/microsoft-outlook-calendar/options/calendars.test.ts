/**
 * @jest-environment node
 *
 * Tests for `integrations/microsoft-outlook-calendar/options/calendars.ts` — Slice
 * ANALYTICS-SOURCES-OUTLOOK-CAL-1. Pin: shape, calendar id→name mapping, q filter,
 * refresh-failure/401 → INTEGRATION_DISCONNECTED, other → PROVIDER_ERROR
 * (leak-free), missing-integration guard.
 */

const mockCalendarsList = jest.fn();
jest.mock("@/integrations/microsoft-outlook-calendar/api/listCalendars", () => ({
  __esModule: true,
  listCalendars: (...args: unknown[]) => mockCalendarsList(...args),
}));

const mockRefresh = jest.fn();
jest.mock("@/services/oauth/refreshAndRetry", () => {
  const actual = jest.requireActual("@/services/oauth/refreshAndRetry");
  return { ...actual, refreshAndRetry: (input: unknown) => mockRefresh(input) };
});

import { outlookCalendarsResolver } from "@/integrations/microsoft-outlook-calendar/options/calendars";
import {
  IntegrationActionRequiredError,
  Unauthorized401Error,
} from "@/services/oauth/refreshAndRetry";
import {
  OptionsResolverError,
  type OptionsResolverContext,
} from "@/services/options/types";
import type { IntegrationRecord } from "@/repositories/integrations";

const integration = { accountId: "acct-1", accessTokenEncrypted: "enc" } as unknown as IntegrationRecord;

function ctx(overrides: Partial<OptionsResolverContext> = {}): OptionsResolverContext {
  return { userId: "user-1", integration, q: "", deps: {}, ...overrides };
}

beforeEach(() => {
  jest.clearAllMocks();
  mockRefresh.mockImplementation((input: { apiCall: (t: string) => unknown }) => input.apiCall("tok"));
});

it("declares the canonical source / provider / requiresIntegration fields", () => {
  expect(outlookCalendarsResolver.source).toBe("microsoft-outlook-calendar:calendars");
  expect(outlookCalendarsResolver.provider).toBe("microsoft-outlook-calendar");
  expect(outlookCalendarsResolver.requiresIntegration).toBe(true);
});

it("maps calendars to {value:id, label:name}; drops id-less; filters by q", async () => {
  mockCalendarsList.mockResolvedValue({
    value: [
      { id: "AQcal_main", name: "Calendar" },
      { id: "AQcal_team", name: "Team" },
      { name: "no-id" },
    ],
  });
  const all = await outlookCalendarsResolver.resolve(ctx());
  expect(all.items).toEqual([
    { value: "AQcal_main", label: "Calendar" },
    { value: "AQcal_team", label: "Team" },
  ]);

  const filtered = await outlookCalendarsResolver.resolve(ctx({ q: "team" }));
  expect(filtered.items.map((i) => i.value)).toEqual(["AQcal_team"]);
});

it("maps refresh-failure / 401 to INTEGRATION_DISCONNECTED (reconnect)", async () => {
  for (const err of [
    new IntegrationActionRequiredError({
      accountId: "acct-1",
      provider: "microsoft-outlook-calendar",
      providerAccountId: null,
      reason: "refresh_failed",
    }),
    new Unauthorized401Error("401"),
  ]) {
    mockRefresh.mockRejectedValueOnce(err);
    const thrown = await outlookCalendarsResolver.resolve(ctx()).catch((e) => e);
    expect(thrown).toBeInstanceOf(OptionsResolverError);
    expect(thrown.code).toBe("INTEGRATION_DISCONNECTED");
    expect(thrown.message).not.toMatch(/tok|enc/);
  }
});

it("maps an unexpected provider error to PROVIDER_ERROR (leak-free)", async () => {
  mockCalendarsList.mockRejectedValueOnce(new Error("boom secret token=tok"));
  const thrown = await outlookCalendarsResolver.resolve(ctx()).catch((e) => e);
  expect(thrown).toBeInstanceOf(OptionsResolverError);
  expect(thrown.code).toBe("PROVIDER_ERROR");
  expect(thrown.message).not.toMatch(/secret|token=tok/);
});

it("throws INTEGRATION_DISCONNECTED when ctx.integration is null (no fetch)", async () => {
  const thrown = await outlookCalendarsResolver.resolve(ctx({ integration: null })).catch((e) => e);
  expect(thrown).toBeInstanceOf(OptionsResolverError);
  expect(thrown.code).toBe("INTEGRATION_DISCONNECTED");
  expect(mockRefresh).not.toHaveBeenCalled();
});
