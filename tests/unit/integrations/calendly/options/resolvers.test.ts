/**
 * @jest-environment node
 *
 * Tests for the Calendly options resolver — Slice 5.CALENDLY-1.
 * Mocks refreshAndRetry + the event-types/users API wrappers; proves
 * UUID value mapping, metadata-first user-URI resolution with the
 * /users/me fallback, local q-filtering, sanitized error mapping, and
 * the no-integration denial.
 */
const mockRefreshAndRetry = jest.fn();
const mockEventTypesList = jest.fn();
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

jest.mock("@/integrations/_shared/calendly/api/eventTypes", () => ({
  eventTypesList: (...args: unknown[]) => mockEventTypesList(...args),
}));

jest.mock("@/integrations/_shared/calendly/api/users", () => ({
  usersMe: (...args: unknown[]) => mockUsersMe(...args),
}));

import {
  IntegrationActionRequiredError,
  InsufficientScopeError,
} from "@/services/oauth/refreshAndRetry";
import { OptionsResolverError } from "@/services/options/types";
import { calendlyEventTypesResolver } from "@/integrations/calendly/options/eventTypes";

const USER_URI = "https://api.calendly.com/users/USER123";

function ctx(overrides: Record<string, unknown> = {}) {
  return {
    integration: {
      id: "int-1",
      accountId: "acct-1",
      provider: "calendly",
      providerAccountId: "marcus@example.test",
      accountMetadata: { calendlyUserUri: USER_URI },
    },
    deps: {},
    q: "",
    ...overrides,
  } as never;
}

beforeEach(() => {
  mockRefreshAndRetry.mockReset();
  mockEventTypesList.mockReset();
  mockUsersMe.mockReset();
  mockRefreshAndRetry.mockImplementation(
    async (i: { apiCall: (t: string) => Promise<unknown> }) => i.apiCall("tok"),
  );
});

describe("calendly:event_types resolver", () => {
  it("maps event types to UUID value / name label items, sorted, with hasMore", async () => {
    mockEventTypesList.mockResolvedValueOnce({
      items: [
        { uri: "https://api.calendly.com/event_types/ET2", name: "Zeta sync" },
        { uri: "https://api.calendly.com/event_types/ET1", name: "Alpha call" },
        { uri: "https://api.calendly.com/event_types/ET3", name: "" }, // id label fallback
        { uri: "", name: "dropped (no uri)" },
      ],
      hasMore: true,
      nextPageToken: "tok-2",
    });
    const result = await calendlyEventTypesResolver.resolve(ctx());
    expect(result.items).toEqual([
      { value: "ET1", label: "Alpha call" },
      { value: "ET3", label: "ET3" },
      { value: "ET2", label: "Zeta sync" },
    ]);
    expect(result.hasMore).toBe(true);
    // User URI came from account metadata — NO /users/me round-trip,
    // and values are UUIDs, never raw API URIs.
    expect(mockUsersMe).not.toHaveBeenCalled();
    expect(mockEventTypesList.mock.calls[0]![0]).toMatchObject({
      userUri: USER_URI,
    });
    expect(JSON.stringify(result.items)).not.toContain("api.calendly.com");
  });

  it("filters locally by ctx.q (Calendly documents no server-side search)", async () => {
    mockEventTypesList.mockResolvedValueOnce({
      items: [
        { uri: "https://api.calendly.com/event_types/ET1", name: "Discovery Call" },
        { uri: "https://api.calendly.com/event_types/ET2", name: "Retro" },
      ],
      hasMore: false,
      nextPageToken: null,
    });
    const result = await calendlyEventTypesResolver.resolve(ctx({ q: "disco" }));
    expect(result.items).toEqual([{ value: "ET1", label: "Discovery Call" }]);
  });

  it("falls back to GET /users/me when account metadata lacks the user URI", async () => {
    mockUsersMe.mockResolvedValueOnce({ uri: USER_URI });
    mockEventTypesList.mockResolvedValueOnce({
      items: [],
      hasMore: false,
      nextPageToken: null,
    });
    await calendlyEventTypesResolver.resolve(
      ctx({
        integration: {
          id: "int-1",
          accountId: "acct-1",
          provider: "calendly",
          providerAccountId: "m@example.test",
          accountMetadata: {},
        },
      }),
    );
    expect(mockUsersMe).toHaveBeenCalledTimes(1);
    expect(mockEventTypesList.mock.calls[0]![0]).toMatchObject({
      userUri: USER_URI,
    });
  });

  it("denies without an integration (INTEGRATION_DISCONNECTED)", async () => {
    await expect(
      calendlyEventTypesResolver.resolve(ctx({ integration: null })),
    ).rejects.toMatchObject({
      code: "INTEGRATION_DISCONNECTED",
    });
  });

  it("maps a dead credential to INTEGRATION_DISCONNECTED (sanitized)", async () => {
    mockEventTypesList.mockRejectedValueOnce(
      new IntegrationActionRequiredError("dead"),
    );
    await expect(
      calendlyEventTypesResolver.resolve(ctx()),
    ).rejects.toMatchObject({
      code: "INTEGRATION_DISCONNECTED",
      message: expect.stringContaining("Reconnect Calendly"),
    });
  });

  it("maps a 403 to PROVIDER_REAUTH_REQUIRED (re-consent, not refresh)", async () => {
    mockEventTypesList.mockRejectedValueOnce(
      new InsufficientScopeError("HTTP 403"),
    );
    await expect(
      calendlyEventTypesResolver.resolve(ctx()),
    ).rejects.toMatchObject({
      code: "PROVIDER_REAUTH_REQUIRED",
    });
  });

  it("maps unknown failures to a static PROVIDER_ERROR (no raw provider text)", async () => {
    mockEventTypesList.mockRejectedValueOnce(
      new Error("raw provider stack trace with secrets"),
    );
    let caught: unknown;
    try {
      await calendlyEventTypesResolver.resolve(ctx());
    } catch (err) {
      caught = err;
    }
    expect(caught).toBeInstanceOf(OptionsResolverError);
    expect((caught as OptionsResolverError).code).toBe("PROVIDER_ERROR");
    expect((caught as Error).message).not.toContain("stack trace");
  });
});
