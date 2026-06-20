/**
 * @jest-environment node
 *
 * Microsoft Graph GET /me profile wrapper (action-facing variant).
 *
 * Unlike the OAuth-callback `getMe` helper, this wrapper throws
 * Unauthorized401Error on 401 so refreshAndRetry can refresh + retry, and
 * surfaces a token-free Graph message on other failures. The spec pins the
 * URL ($select identity fields only — no mailbox contents) + error mapping.
 */
import { getMailboxProfile } from "@/integrations/microsoft-outlook/api/getMailboxProfile";
import { Unauthorized401Error } from "@/services/oauth/refreshAndRetry";

beforeEach(() => {
  delete process.env.MICROSOFT_GRAPH_API_BASE;
});

afterEach(() => {
  jest.restoreAllMocks();
  delete process.env.MICROSOFT_GRAPH_API_BASE;
});

function mockFetchOnce(status: number, bodyText: string) {
  return jest
    .spyOn(globalThis, "fetch")
    .mockResolvedValueOnce(new Response(bodyText, { status }));
}

describe("getMailboxProfile wrapper", () => {
  it("GETs /v1.0/me selecting identity fields only (no mailbox contents)", async () => {
    const fetchSpy = mockFetchOnce(
      200,
      '{"id":"guid-1","mail":"a@b.test","userPrincipalName":"a@b.test","displayName":"A B"}',
    );

    const result = await getMailboxProfile({ accessToken: "t" });

    const url = new URL(fetchSpy.mock.calls[0]![0] as string);
    expect(url.pathname).toBe("/v1.0/me");
    expect(url.searchParams.get("$select")).toBe("mail,userPrincipalName,id,displayName");
    expect(result.mail).toBe("a@b.test");
    expect(result.id).toBe("guid-1");
  });

  it("throws Unauthorized401Error on HTTP 401 (so refreshAndRetry refreshes)", async () => {
    mockFetchOnce(401, "{}");
    await expect(getMailboxProfile({ accessToken: "stale" })).rejects.toThrow(
      Unauthorized401Error,
    );
  });

  it("surfaces the Graph error message (token-free) on other non-OK status", async () => {
    mockFetchOnce(
      403,
      '{"error":{"code":"ErrorAccessDenied","message":"Access is denied."}}',
    );
    await expect(getMailboxProfile({ accessToken: "t" })).rejects.toThrow(/Access is denied/);
  });
});
