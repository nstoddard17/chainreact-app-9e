/**
 * @jest-environment node
 *
 * Tests for `_shared/facebook/api/getPageAccessToken.ts` — Slice
 * 3.FACEBOOK-2. Page-token derivation from the user token via /me/accounts.
 */
import { getPageAccessToken } from "@/integrations/_shared/facebook/api/getPageAccessToken";
import { NotFoundError } from "@/integrations/_shared/facebook/errors";

beforeEach(() => {
  process.env.FACEBOOK_CLIENT_SECRET = "fb-secret";
});
afterEach(() => {
  jest.restoreAllMocks();
  delete process.env.FACEBOOK_CLIENT_SECRET;
});

function mockPages(body: unknown, status = 200) {
  jest
    .spyOn(globalThis, "fetch")
    .mockResolvedValueOnce(new Response(JSON.stringify(body), { status }));
}

describe("getPageAccessToken", () => {
  it("returns the matching Page's access token (hits /me/accounts)", async () => {
    const spy = jest
      .spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            data: [
              { id: "p-1", name: "Page One", access_token: "PAGE_TOK_1" },
              { id: "p-2", name: "Page Two", access_token: "PAGE_TOK_2" },
            ],
          }),
          { status: 200 },
        ),
      );
    const tok = await getPageAccessToken({ accessToken: "USER_TOK", pageId: "p-2" });
    expect(tok).toBe("PAGE_TOK_2");
    expect(new URL(spy.mock.calls[0]![0] as string).pathname).toMatch(/\/me\/accounts$/);
  });

  it("throws NotFoundError when the page isn't managed by the user", async () => {
    mockPages({ data: [{ id: "p-1", access_token: "T" }] });
    await expect(
      getPageAccessToken({ accessToken: "U", pageId: "missing" }),
    ).rejects.toBeInstanceOf(NotFoundError);
  });

  it("throws NotFoundError when the page row carries no access_token", async () => {
    mockPages({ data: [{ id: "p-1", name: "No Token" }] });
    await expect(
      getPageAccessToken({ accessToken: "U", pageId: "p-1" }),
    ).rejects.toBeInstanceOf(NotFoundError);
  });

  it("does not leak the user token in a NotFoundError", async () => {
    mockPages({ data: [] });
    let caught: unknown;
    try {
      await getPageAccessToken({ accessToken: "USER_TOK_SECRET", pageId: "p-1" });
    } catch (e) {
      caught = e;
    }
    expect((caught as Error).message).not.toContain("USER_TOK_SECRET");
  });
});
