/**
 * @jest-environment node
 *
 * Microsoft Graph GET /me/outlook/masterCategories wrapper — RESOLVERS-1.
 *
 * Pins the URL ($select=id,displayName only — no mailbox contents, $top
 * clamped 1..100), the nextLink normalization, and the error mapping:
 * 401 → Unauthorized401Error (refreshAndRetry refreshes), 403 →
 * InsufficientScopeError (token predates the optional MailboxSettings.Read
 * scope — reconnect, never retried), other non-OK → token-free surfaced
 * Graph message.
 */
import { listMasterCategories } from "@/integrations/microsoft-outlook/api/listMasterCategories";
import {
  InsufficientScopeError,
  Unauthorized401Error,
} from "@/services/oauth/refreshAndRetry";

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

describe("listMasterCategories wrapper", () => {
  it("GETs /v1.0/me/outlook/masterCategories selecting id,displayName only", async () => {
    const fetchSpy = mockFetchOnce(
      200,
      '{"value":[{"id":"guid-1","displayName":"Red Category"}]}',
    );

    const result = await listMasterCategories({ accessToken: "t" });

    const url = new URL(fetchSpy.mock.calls[0]![0] as string);
    expect(url.pathname).toBe("/v1.0/me/outlook/masterCategories");
    expect(url.searchParams.get("$select")).toBe("id,displayName");
    expect(url.searchParams.get("$top")).toBe("100");
    expect(result.value).toEqual([{ id: "guid-1", displayName: "Red Category" }]);
    expect(result.nextLink).toBeNull();
  });

  it("clamps $top into 1..100 and normalizes @odata.nextLink", async () => {
    const fetchSpy = mockFetchOnce(
      200,
      '{"value":[],"@odata.nextLink":"https://graph.microsoft.com/v1.0/me/outlook/masterCategories?$skip=100"}',
    );
    const result = await listMasterCategories({ accessToken: "t", top: 5000 });
    const url = new URL(fetchSpy.mock.calls[0]![0] as string);
    expect(url.searchParams.get("$top")).toBe("100");
    expect(result.nextLink).toMatch(/skip=100/);
  });

  it("throws Unauthorized401Error on HTTP 401 (so refreshAndRetry refreshes)", async () => {
    mockFetchOnce(401, "{}");
    await expect(listMasterCategories({ accessToken: "stale" })).rejects.toThrow(
      Unauthorized401Error,
    );
  });

  it("throws InsufficientScopeError on HTTP 403 (missing MailboxSettings.Read — reconnect)", async () => {
    mockFetchOnce(
      403,
      '{"error":{"code":"ErrorAccessDenied","message":"Access is denied."}}',
    );
    const thrown = await listMasterCategories({ accessToken: "t" }).catch((e) => e);
    expect(thrown).toBeInstanceOf(InsufficientScopeError);
    // Graph's raw body is not passed through on the scope path.
    expect((thrown as Error).message).not.toMatch(/Access is denied/);
  });

  it("surfaces the Graph error message (token-free) on other non-OK status", async () => {
    mockFetchOnce(
      500,
      '{"error":{"code":"InternalServerError","message":"Something went wrong."}}',
    );
    const thrown = await listMasterCategories({ accessToken: "secret-tok" }).catch(
      (e) => e,
    );
    expect((thrown as Error).message).toMatch(/Something went wrong/);
    expect((thrown as Error).message).not.toMatch(/secret-tok/);
  });
});
