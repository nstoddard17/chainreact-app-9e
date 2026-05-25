/**
 * @jest-environment node
 *
 * Tests for the shared Trello API request helper —
 * `integrations/trello/api/_request.ts`.
 *
 * Covers:
 *   - Auth params (key + token) appended to the URL.
 *   - JSON body serialization + content-type header.
 *   - Base URL override (TRELLO_API_BASE) honored.
 *   - 401 → Unauthorized401Error.
 *   - 404 → TrelloNotFoundError.
 *   - Other non-OK → generic Error.
 *   - Token NEVER appears in thrown error messages.
 */
import { trelloRequest } from "@/integrations/trello/api/_request";
import { Unauthorized401Error } from "@/services/oauth/refreshAndRetry";
import { TrelloNotFoundError } from "@/integrations/_shared/trello/api/errors";

const ORIGINAL_FETCH = global.fetch;

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

interface CapturedRequest {
  url?: string;
  method?: string;
  headers?: Record<string, string>;
  body?: string;
}

function captureFetch(response: Response): CapturedRequest {
  const captured: CapturedRequest = {};
  global.fetch = jest.fn(async (input: unknown, init?: Parameters<typeof fetch>[1]) => {
    captured.url =
      typeof input === "string"
        ? input
        : (input as { toString: () => string }).toString();
    captured.method = init?.method;
    captured.headers = (init?.headers ?? {}) as Record<string, string>;
    if (typeof init?.body === "string") {
      captured.body = init.body;
    }
    return response;
  }) as unknown as typeof fetch;
  return captured;
}

beforeEach(() => {
  process.env.TRELLO_CLIENT_ID = "test-app-key";
});

afterEach(() => {
  delete process.env.TRELLO_CLIENT_ID;
  delete process.env.TRELLO_API_BASE;
  global.fetch = ORIGINAL_FETCH;
});

describe("trelloRequest — auth + URL construction", () => {
  it("appends key and token query params to the URL", async () => {
    const captured = captureFetch(jsonResponse(200, { id: "x" }));
    await trelloRequest<unknown>({
      accessToken: "user-token-1234",
      method: "GET",
      path: "/1/cards/abc",
      resourceForNotFound: "card abc",
    });
    const u = new URL(captured.url!);
    expect(u.origin + u.pathname).toBe("https://api.trello.com/1/cards/abc");
    expect(u.searchParams.get("key")).toBe("test-app-key");
    expect(u.searchParams.get("token")).toBe("user-token-1234");
  });

  it("merges caller's query params with key/token (no clobbering)", async () => {
    const captured = captureFetch(jsonResponse(200, { id: "x" }));
    await trelloRequest<unknown>({
      accessToken: "t",
      method: "POST",
      path: "/1/cards/abc/idLabels",
      query: new URLSearchParams({ value: "label-1" }),
      resourceForNotFound: "card abc",
    });
    const u = new URL(captured.url!);
    expect(u.searchParams.get("value")).toBe("label-1");
    expect(u.searchParams.get("key")).toBe("test-app-key");
    expect(u.searchParams.get("token")).toBe("t");
  });

  it("uses TRELLO_API_BASE override when set (e2e seam)", async () => {
    process.env.TRELLO_API_BASE = "http://localhost:9885";
    const captured = captureFetch(jsonResponse(200, { id: "x" }));
    await trelloRequest<unknown>({
      accessToken: "t",
      method: "GET",
      path: "/1/members/me",
      resourceForNotFound: "members/me",
    });
    expect(new URL(captured.url!).origin).toBe("http://localhost:9885");
  });

  it("throws when TRELLO_CLIENT_ID is missing", async () => {
    delete process.env.TRELLO_CLIENT_ID;
    captureFetch(jsonResponse(200, {}));
    await expect(
      trelloRequest<unknown>({
        accessToken: "t",
        method: "GET",
        path: "/1/cards",
        resourceForNotFound: "cards",
      }),
    ).rejects.toThrow(/TRELLO_CLIENT_ID/);
  });
});

describe("trelloRequest — body + headers", () => {
  it("serializes body as JSON and sets Content-Type for POST", async () => {
    const captured = captureFetch(jsonResponse(200, { id: "x" }));
    await trelloRequest<unknown>({
      accessToken: "t",
      method: "POST",
      path: "/1/cards",
      body: { idList: "list-1", name: "Test" },
      resourceForNotFound: "cards",
    });
    expect(captured.method).toBe("POST");
    expect(captured.headers!["Content-Type"]).toBe("application/json");
    expect(JSON.parse(captured.body!)).toEqual({
      idList: "list-1",
      name: "Test",
    });
  });

  it("omits Content-Type when no body (GET)", async () => {
    const captured = captureFetch(jsonResponse(200, { id: "x" }));
    await trelloRequest<unknown>({
      accessToken: "t",
      method: "GET",
      path: "/1/cards/abc",
      resourceForNotFound: "card abc",
    });
    expect(captured.headers!["Content-Type"]).toBeUndefined();
    expect(captured.body).toBeUndefined();
  });
});

describe("trelloRequest — error mapping", () => {
  it("throws Unauthorized401Error on 401", async () => {
    captureFetch(new Response("Unauthorized", { status: 401 }));
    await expect(
      trelloRequest<unknown>({
        accessToken: "t",
        method: "GET",
        path: "/1/cards/abc",
        resourceForNotFound: "card abc",
      }),
    ).rejects.toBeInstanceOf(Unauthorized401Error);
  });

  it("throws TrelloNotFoundError on 404 with the configured resource label", async () => {
    captureFetch(new Response("invalid id", { status: 404 }));
    try {
      await trelloRequest<unknown>({
        accessToken: "t",
        method: "GET",
        path: "/1/cards/missing",
        resourceForNotFound: "card missing",
      });
      throw new Error("expected throw");
    } catch (err) {
      expect(err).toBeInstanceOf(TrelloNotFoundError);
      expect((err as TrelloNotFoundError).resource).toBe("card missing");
    }
  });

  it("throws generic Error on other non-OK statuses", async () => {
    captureFetch(new Response("server boom", { status: 500 }));
    await expect(
      trelloRequest<unknown>({
        accessToken: "t",
        method: "GET",
        path: "/1/cards/abc",
        resourceForNotFound: "card abc",
      }),
    ).rejects.toThrow(/Trello GET \/1\/cards\/abc failed/);
  });

  it("throws Error on 2xx with non-JSON body", async () => {
    captureFetch(new Response("not json {", { status: 200 }));
    await expect(
      trelloRequest<unknown>({
        accessToken: "t",
        method: "GET",
        path: "/1/cards/abc",
        resourceForNotFound: "card abc",
      }),
    ).rejects.toThrow(/non-JSON 2xx body/);
  });
});

describe("trelloRequest — token leakage discipline", () => {
  it("never includes the access token in 401 error message", async () => {
    const sensitiveToken = "secret-token-9999";
    captureFetch(new Response("Unauthorized", { status: 401 }));
    try {
      await trelloRequest<unknown>({
        accessToken: sensitiveToken,
        method: "GET",
        path: "/1/cards",
        resourceForNotFound: "cards",
      });
      throw new Error("expected throw");
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      expect(message).not.toContain(sensitiveToken);
    }
  });

  it("never includes the access token in 404 error message", async () => {
    const sensitiveToken = "secret-token-9999";
    captureFetch(new Response("not found", { status: 404 }));
    try {
      await trelloRequest<unknown>({
        accessToken: sensitiveToken,
        method: "GET",
        path: "/1/cards/x",
        resourceForNotFound: "card x",
      });
      throw new Error("expected throw");
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      expect(message).not.toContain(sensitiveToken);
    }
  });

  it("never includes the access token in 5xx error message", async () => {
    const sensitiveToken = "secret-token-9999";
    captureFetch(new Response("server boom", { status: 500 }));
    try {
      await trelloRequest<unknown>({
        accessToken: sensitiveToken,
        method: "GET",
        path: "/1/cards",
        resourceForNotFound: "cards",
      });
      throw new Error("expected throw");
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      expect(message).not.toContain(sensitiveToken);
    }
  });
});
