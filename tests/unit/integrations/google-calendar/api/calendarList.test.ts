/**
 * @jest-environment node
 *
 * Tests for `integrations/google-calendar/api/calendarList.ts`
 * (CONFIG-FIELD-UX-SWEEP-4). Proves the missing-scope contract at the source:
 * HTTP 403 → InsufficientScopeError (reconnect, not refresh); 401 →
 * Unauthorized401Error; happy path returns the parsed calendar list; the access
 * token is sent as a bearer and never echoed back.
 */
import { calendarListList } from "@/integrations/google-calendar/api/calendarList";
import {
  InsufficientScopeError,
  Unauthorized401Error,
} from "@/services/oauth/refreshAndRetry";

const realFetch = global.fetch;
afterEach(() => {
  global.fetch = realFetch;
  jest.clearAllMocks();
});

function mockFetchOnce(status: number, body: unknown) {
  global.fetch = jest.fn(async () => ({
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
    text: async () => JSON.stringify(body),
  })) as unknown as typeof fetch;
}

describe("calendarListList", () => {
  it("returns the parsed calendar list on 200", async () => {
    mockFetchOnce(200, {
      kind: "calendar#calendarList",
      items: [{ id: "primary", summary: "you@gmail.com", primary: true }],
    });
    const res = await calendarListList({ accessToken: "tok-abc" });
    expect(res.items?.[0]?.id).toBe("primary");
  });

  it("sends the access token as a bearer (and never returns it)", async () => {
    let sentAuth: string | undefined;
    global.fetch = jest.fn(async (_url: string, init?: RequestInit) => {
      sentAuth = (init?.headers as Record<string, string>)?.Authorization;
      return { ok: true, status: 200, json: async () => ({ items: [] }), text: async () => "{}" } as unknown as Response;
    }) as unknown as typeof fetch;
    const res = await calendarListList({ accessToken: "SECRET-TOKEN-XYZ" });
    expect(sentAuth).toBe("Bearer SECRET-TOKEN-XYZ");
    expect(JSON.stringify(res)).not.toContain("SECRET-TOKEN-XYZ");
  });

  it("maps HTTP 403 to InsufficientScopeError (missing calendar.readonly → reconnect)", async () => {
    mockFetchOnce(403, {
      error: { code: 403, status: "PERMISSION_DENIED", message: "insufficient authentication scopes" },
    });
    await expect(calendarListList({ accessToken: "tok" })).rejects.toBeInstanceOf(
      InsufficientScopeError,
    );
  });

  it("does NOT leak Google's 403 body into the thrown error", async () => {
    mockFetchOnce(403, { error: { message: "granted=calendar.events required=calendar.readonly leak" } });
    try {
      await calendarListList({ accessToken: "tok" });
      throw new Error("expected throw");
    } catch (err) {
      expect((err as Error).message).not.toContain("leak");
    }
  });

  it("maps HTTP 401 to Unauthorized401Error (refresh+retry can fix)", async () => {
    mockFetchOnce(401, { error: { code: 401 } });
    await expect(calendarListList({ accessToken: "tok" })).rejects.toBeInstanceOf(
      Unauthorized401Error,
    );
  });
});
