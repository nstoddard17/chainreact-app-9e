/**
 * @jest-environment node
 *
 * Tests for `_shared/facebook/api/_request.ts` — Slice 3.FACEBOOK-2.
 * Version pin, appsecret_proof, auth header, error mapping, no leakage.
 */
import { createHmac } from "node:crypto";
import {
  graphRequest,
  graphMultipart,
  GRAPH_API_VERSION,
} from "@/integrations/_shared/facebook/api/_request";
import { Unauthorized401Error } from "@/services/oauth/refreshAndRetry";
import {
  FacebookApiError,
  FacebookPermissionError,
  RateLimitError,
} from "@/integrations/_shared/facebook/errors";

const SECRET = "fb-app-secret";

beforeEach(() => {
  process.env.FACEBOOK_CLIENT_SECRET = SECRET;
  delete process.env.FACEBOOK_GRAPH_BASE;
});
afterEach(() => {
  jest.restoreAllMocks();
  delete process.env.FACEBOOK_CLIENT_SECRET;
});

function mockOnce(body: unknown, status = 200) {
  const spy = jest.spyOn(globalThis, "fetch");
  spy.mockResolvedValueOnce(new Response(JSON.stringify(body), { status }));
  return spy;
}

describe("graphRequest — URL + auth + proof", () => {
  it("pins the Graph version, appends appsecret_proof, sends Bearer auth", async () => {
    const spy = mockOnce({ id: "me-1" });
    await graphRequest({ accessToken: "TOK", path: "/me", query: { fields: "id" } });
    const url = new URL(spy.mock.calls[0]![0] as string);
    expect(url.pathname).toBe(`/${GRAPH_API_VERSION}/me`);
    expect(url.searchParams.get("fields")).toBe("id");
    const expectedProof = createHmac("sha256", SECRET).update("TOK").digest("hex");
    expect(url.searchParams.get("appsecret_proof")).toBe(expectedProof);
    const init = spy.mock.calls[0]![1]!;
    expect((init.headers as Record<string, string>).Authorization).toBe("Bearer TOK");
  });

  it("omits appsecret_proof when the app secret is unset", async () => {
    delete process.env.FACEBOOK_CLIENT_SECRET;
    const spy = mockOnce({ id: "x" });
    await graphRequest({ accessToken: "TOK", path: "/me" });
    const url = new URL(spy.mock.calls[0]![0] as string);
    expect(url.searchParams.has("appsecret_proof")).toBe(false);
  });

  it("sends a JSON body on POST", async () => {
    const spy = mockOnce({ id: "p1" });
    await graphRequest({
      accessToken: "TOK",
      method: "POST",
      path: "/123/feed",
      body: { message: "hi" },
    });
    const init = spy.mock.calls[0]![1]!;
    expect((init.headers as Record<string, string>)["Content-Type"]).toBe("application/json");
    expect(String(init.body)).toBe(JSON.stringify({ message: "hi" }));
  });

  it("honors FACEBOOK_GRAPH_BASE for e2e", async () => {
    process.env.FACEBOOK_GRAPH_BASE = "https://mock.graph.local";
    const spy = mockOnce({ id: "x" });
    await graphRequest({ accessToken: "T", path: "/me" });
    expect(String(spy.mock.calls[0]![0])).toContain("https://mock.graph.local/");
  });
});

describe("graphRequest — error mapping (sanitized)", () => {
  it("HTTP 401 → Unauthorized401Error", async () => {
    mockOnce({ error: { type: "OAuthException", code: 190 } }, 401);
    await expect(graphRequest({ accessToken: "T", path: "/me" })).rejects.toBeInstanceOf(
      Unauthorized401Error,
    );
  });

  it("Graph code 190 on a 400 → Unauthorized401Error", async () => {
    mockOnce({ error: { type: "OAuthException", code: 190 } }, 400);
    await expect(graphRequest({ accessToken: "T", path: "/me" })).rejects.toBeInstanceOf(
      Unauthorized401Error,
    );
  });

  it("permission code 200 → FacebookPermissionError", async () => {
    mockOnce({ error: { type: "OAuthException", code: 200 } }, 403);
    await expect(graphRequest({ accessToken: "T", path: "/p/feed", method: "POST", body: {} })).rejects.toBeInstanceOf(
      FacebookPermissionError,
    );
  });

  it("rate code 4 → RateLimitError", async () => {
    mockOnce({ error: { type: "OAuthException", code: 4 } }, 400);
    await expect(graphRequest({ accessToken: "T", path: "/me" })).rejects.toBeInstanceOf(
      RateLimitError,
    );
  });

  it("other 5xx → FacebookApiError", async () => {
    mockOnce({ error: { type: "ServerError", code: 2 } }, 500);
    await expect(graphRequest({ accessToken: "T", path: "/me" })).rejects.toBeInstanceOf(
      FacebookApiError,
    );
  });

  it("never leaks the token / secret / proof / Graph message in the thrown error", async () => {
    const leak = "(#200) hidden message with TOKEN-VALUE";
    mockOnce({ error: { type: "OAuthException", code: 17, message: leak } }, 400);
    let caught: unknown;
    try {
      await graphRequest({ accessToken: "TOKEN-VALUE", path: "/me" });
    } catch (e) {
      caught = e;
    }
    const msg = (caught as Error).message;
    expect(msg).not.toContain("TOKEN-VALUE");
    expect(msg).not.toContain(SECRET);
    expect(msg).not.toContain("hidden message");
  });
});

describe("graphMultipart", () => {
  it("posts FormData (no manual Content-Type), version-pinned, with proof", async () => {
    const spy = mockOnce({ id: "ph1", post_id: "pg_ph1" });
    await graphMultipart({
      accessToken: "TOK",
      path: "/123/photos",
      fields: { caption: "hi", published: "true" },
      file: {
        fieldName: "source",
        bytes: new Uint8Array([1, 2, 3]),
        filename: "p.jpg",
        contentType: "image/jpeg",
      },
    });
    const url = new URL(spy.mock.calls[0]![0] as string);
    expect(url.pathname).toBe(`/${GRAPH_API_VERSION}/123/photos`);
    expect(url.searchParams.has("appsecret_proof")).toBe(true);
    const init = spy.mock.calls[0]![1]!;
    expect(init.body).toBeInstanceOf(FormData);
    expect((init.headers as Record<string, string>)["Content-Type"]).toBeUndefined();
    expect((init.headers as Record<string, string>).Authorization).toBe("Bearer TOK");
  });
});
