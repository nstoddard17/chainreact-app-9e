/**
 * @jest-environment node
 *
 * Tests for integrations/native/actions/httpRequest — Native-nodes Slice 1
 * Commit 1 (docs/slices/parity/native-nodes-1-tier-a-plan.md §10.1).
 *
 * Native action — no OAuth / no integration lookup. The handler is a
 * pure adapter over global fetch with strict schema, bounded output,
 * URL-scheme allowlist, sensitive-header sanitization, and timeout via
 * AbortController.
 */

import { ZodError } from "zod";
import {
  httpRequest,
  HttpRequestTimeoutError,
  InvalidHttpRequestUrlError,
  UnsupportedUrlSchemeError,
} from "@/integrations/native/actions/httpRequest";
import { HttpRequestConfigSchema } from "@/integrations/native/actions/httpRequest.schema";
import type { ActionHandlerInput } from "@/services/execution/handlers/types";
import type { TriggerEvent } from "@/contracts/triggerEvent";

const triggerEvent: TriggerEvent = {
  provider: "native",
  eventType: "manual.run",
  eventId: "evt-1",
  occurredAt: "2026-05-15T00:00:00Z",
  accountId: "system",
  payload: {},
};

function makeInput(config: Record<string, unknown>): ActionHandlerInput {
  return {
    workflowId: "wf-1",
    userId: "user-1",
    runId: "run-1",
    nodeId: "n-http",
    config,
    triggerEvent,
  };
}

interface CapturedFetchInit {
  method?: string;
  headers?: Headers;
  body?: string;
  signal?: AbortSignal;
}

const originalFetch = globalThis.fetch;
afterEach(() => {
  globalThis.fetch = originalFetch;
  jest.useRealTimers();
});

// ── Schema tests ────────────────────────────────────────────────────────────

describe("httpRequest schema — required fields", () => {
  it("accepts a minimal valid GET", () => {
    const parsed = HttpRequestConfigSchema.parse({
      method: "GET",
      url: "https://example.com/api",
    });
    expect(parsed.method).toBe("GET");
    expect(parsed.url).toBe("https://example.com/api");
    expect(parsed.timeoutSeconds).toBe(15);
  });

  it("accepts a valid POST with body, headers, queryParams, bearer auth", () => {
    const parsed = HttpRequestConfigSchema.parse({
      method: "POST",
      url: "https://api.example.com/v1/things",
      headers: [{ key: "X-Trace", value: "abc" }],
      queryParams: [{ key: "page", value: "1" }],
      body: '{"hello":"world"}',
      auth: { type: "bearer", token: "secret123" },
      timeoutSeconds: 5,
    });
    expect(parsed.method).toBe("POST");
    expect(parsed.body).toBe('{"hello":"world"}');
    expect(parsed.auth).toEqual({ type: "bearer", token: "secret123" });
  });

  it("rejects missing method", () => {
    expect(() =>
      HttpRequestConfigSchema.parse({ url: "https://example.com" }),
    ).toThrow(ZodError);
  });

  it("rejects missing url", () => {
    expect(() =>
      HttpRequestConfigSchema.parse({ method: "GET" }),
    ).toThrow(ZodError);
  });

  it("rejects empty url", () => {
    expect(() =>
      HttpRequestConfigSchema.parse({ method: "GET", url: "" }),
    ).toThrow(ZodError);
  });

  it("rejects an unknown method", () => {
    expect(() =>
      HttpRequestConfigSchema.parse({ method: "OPTIONS", url: "https://x" }),
    ).toThrow(ZodError);
  });

  it("rejects timeoutSeconds > 30", () => {
    expect(() =>
      HttpRequestConfigSchema.parse({
        method: "GET",
        url: "https://x",
        timeoutSeconds: 31,
      }),
    ).toThrow(ZodError);
  });

  it("rejects timeoutSeconds < 1", () => {
    expect(() =>
      HttpRequestConfigSchema.parse({
        method: "GET",
        url: "https://x",
        timeoutSeconds: 0,
      }),
    ).toThrow(ZodError);
  });

  it("rejects unknown top-level fields (.strict)", () => {
    expect(() =>
      HttpRequestConfigSchema.parse({
        method: "GET",
        url: "https://x",
        followRedirects: true,
      }),
    ).toThrow(ZodError);
  });

  it("rejects unknown fields inside header entries", () => {
    expect(() =>
      HttpRequestConfigSchema.parse({
        method: "GET",
        url: "https://x",
        headers: [{ key: "k", value: "v", isSecret: true }],
      }),
    ).toThrow(ZodError);
  });

  it("rejects more than 50 headers", () => {
    const headers = Array.from({ length: 51 }, (_, i) => ({
      key: `K${i}`,
      value: "v",
    }));
    expect(() =>
      HttpRequestConfigSchema.parse({
        method: "GET",
        url: "https://x",
        headers,
      }),
    ).toThrow(ZodError);
  });

  it("rejects an oversized body (>1 MiB)", () => {
    const oversized = "x".repeat(1_048_577);
    expect(() =>
      HttpRequestConfigSchema.parse({
        method: "POST",
        url: "https://x",
        body: oversized,
      }),
    ).toThrow(ZodError);
  });

  it("validates the auth discriminated union — basic requires username + password", () => {
    expect(() =>
      HttpRequestConfigSchema.parse({
        method: "GET",
        url: "https://x",
        auth: { type: "basic", username: "u" },
      }),
    ).toThrow(ZodError);
  });

  it("validates the auth discriminated union — apiKey requires headerName + headerValue", () => {
    expect(() =>
      HttpRequestConfigSchema.parse({
        method: "GET",
        url: "https://x",
        auth: { type: "apiKey", headerName: "X-Api-Key" },
      }),
    ).toThrow(ZodError);
  });
});

// ── URL scheme guard ────────────────────────────────────────────────────────

describe("httpRequest — URL scheme allowlist", () => {
  it("rejects file:// URLs", async () => {
    await expect(
      httpRequest(makeInput({ method: "GET", url: "file:///etc/passwd" })),
    ).rejects.toBeInstanceOf(UnsupportedUrlSchemeError);
  });

  it("rejects ftp:// URLs", async () => {
    await expect(
      httpRequest(makeInput({ method: "GET", url: "ftp://example.com/" })),
    ).rejects.toBeInstanceOf(UnsupportedUrlSchemeError);
  });

  it("rejects data: URLs", async () => {
    await expect(
      httpRequest(makeInput({ method: "GET", url: "data:text/plain,hi" })),
    ).rejects.toBeInstanceOf(UnsupportedUrlSchemeError);
  });

  it("rejects javascript: URLs", async () => {
    await expect(
      httpRequest(makeInput({ method: "GET", url: "javascript:alert(1)" })),
    ).rejects.toBeInstanceOf(UnsupportedUrlSchemeError);
  });

  it("throws InvalidHttpRequestUrlError on a non-URL string", async () => {
    await expect(
      httpRequest(makeInput({ method: "GET", url: "not a url" })),
    ).rejects.toBeInstanceOf(InvalidHttpRequestUrlError);
  });

  it("accepts http:// URLs", async () => {
    const fetchMock: jest.Mock = jest.fn(async () => new Response("", { status: 200 }));
    globalThis.fetch = fetchMock as unknown as typeof fetch;
    await httpRequest(makeInput({ method: "GET", url: "http://example.com/" }));
    expect(fetchMock).toHaveBeenCalled();
  });

  it("accepts https:// URLs", async () => {
    const fetchMock: jest.Mock = jest.fn(async () => new Response("", { status: 200 }));
    globalThis.fetch = fetchMock as unknown as typeof fetch;
    await httpRequest(makeInput({ method: "GET", url: "https://example.com/" }));
    expect(fetchMock).toHaveBeenCalled();
  });
});

// ── Request dispatch ────────────────────────────────────────────────────────

describe("httpRequest — request dispatch", () => {
  it("forwards the method to fetch", async () => {
    const fetchMock: jest.Mock = jest.fn(
      async () => new Response("{}", { status: 200, headers: { "content-type": "application/json" } }),
    );
    globalThis.fetch = fetchMock as unknown as typeof fetch;
    await httpRequest(makeInput({ method: "PATCH", url: "https://example.com/r" }));
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const init = fetchMock.mock.calls[0]![1] as CapturedFetchInit;
    expect(init.method).toBe("PATCH");
  });

  it("sends the body on POST/PUT/PATCH/DELETE", async () => {
    const fetchMock: jest.Mock = jest.fn(async () => new Response("", { status: 201 }));
    globalThis.fetch = fetchMock as unknown as typeof fetch;
    await httpRequest(
      makeInput({
        method: "POST",
        url: "https://example.com/r",
        body: '{"a":1}',
      }),
    );
    const init = fetchMock.mock.calls[0]![1] as CapturedFetchInit;
    expect(init.body).toBe('{"a":1}');
  });

  it("does NOT send a body on GET even when body is in config", async () => {
    const fetchMock: jest.Mock = jest.fn(async () => new Response("", { status: 200 }));
    globalThis.fetch = fetchMock as unknown as typeof fetch;
    await httpRequest(
      makeInput({
        method: "GET",
        url: "https://example.com/r",
        body: "should be dropped",
      }),
    );
    const init = fetchMock.mock.calls[0]![1] as CapturedFetchInit;
    expect(init.body).toBeUndefined();
  });

  it("appends query params to the URL", async () => {
    const fetchMock: jest.Mock = jest.fn(async () => new Response("", { status: 200 }));
    globalThis.fetch = fetchMock as unknown as typeof fetch;
    await httpRequest(
      makeInput({
        method: "GET",
        url: "https://example.com/r",
        queryParams: [
          { key: "page", value: "2" },
          { key: "filter", value: "open" },
        ],
      }),
    );
    const url = fetchMock.mock.calls[0]![0] as string;
    expect(url).toBe("https://example.com/r?page=2&filter=open");
  });

  it("forwards custom request headers", async () => {
    const fetchMock: jest.Mock = jest.fn(async () => new Response("", { status: 200 }));
    globalThis.fetch = fetchMock as unknown as typeof fetch;
    await httpRequest(
      makeInput({
        method: "GET",
        url: "https://example.com/r",
        headers: [
          { key: "X-Trace-Id", value: "abc" },
          { key: "Accept", value: "application/json" },
        ],
      }),
    );
    const init = fetchMock.mock.calls[0]![1] as CapturedFetchInit;
    const headers = init.headers as Headers;
    expect(headers.get("x-trace-id")).toBe("abc");
    expect(headers.get("accept")).toBe("application/json");
  });

  it("sets Authorization: Bearer <token> for bearer auth", async () => {
    const fetchMock: jest.Mock = jest.fn(async () => new Response("", { status: 200 }));
    globalThis.fetch = fetchMock as unknown as typeof fetch;
    await httpRequest(
      makeInput({
        method: "GET",
        url: "https://example.com/r",
        auth: { type: "bearer", token: "secret-token" },
      }),
    );
    const headers = (fetchMock.mock.calls[0]![1] as CapturedFetchInit).headers as Headers;
    expect(headers.get("authorization")).toBe("Bearer secret-token");
  });

  it("sets Authorization: Basic <base64> for basic auth", async () => {
    const fetchMock: jest.Mock = jest.fn(async () => new Response("", { status: 200 }));
    globalThis.fetch = fetchMock as unknown as typeof fetch;
    await httpRequest(
      makeInput({
        method: "GET",
        url: "https://example.com/r",
        auth: { type: "basic", username: "user", password: "pass" },
      }),
    );
    const headers = (fetchMock.mock.calls[0]![1] as CapturedFetchInit).headers as Headers;
    const expected = `Basic ${Buffer.from("user:pass", "utf8").toString("base64")}`;
    expect(headers.get("authorization")).toBe(expected);
  });

  it("sets a custom header for apiKey auth", async () => {
    const fetchMock: jest.Mock = jest.fn(async () => new Response("", { status: 200 }));
    globalThis.fetch = fetchMock as unknown as typeof fetch;
    await httpRequest(
      makeInput({
        method: "GET",
        url: "https://example.com/r",
        auth: {
          type: "apiKey",
          headerName: "X-Api-Key",
          headerValue: "key-abc-123",
        },
      }),
    );
    const headers = (fetchMock.mock.calls[0]![1] as CapturedFetchInit).headers as Headers;
    expect(headers.get("x-api-key")).toBe("key-abc-123");
  });

  it("auth-scheme Authorization overrides any user-supplied Authorization header", async () => {
    const fetchMock: jest.Mock = jest.fn(async () => new Response("", { status: 200 }));
    globalThis.fetch = fetchMock as unknown as typeof fetch;
    await httpRequest(
      makeInput({
        method: "GET",
        url: "https://example.com/r",
        headers: [{ key: "Authorization", value: "Bearer attacker-supplied" }],
        auth: { type: "bearer", token: "real-token" },
      }),
    );
    const headers = (fetchMock.mock.calls[0]![1] as CapturedFetchInit).headers as Headers;
    expect(headers.get("authorization")).toBe("Bearer real-token");
  });

  it("none auth produces no Authorization header", async () => {
    const fetchMock: jest.Mock = jest.fn(async () => new Response("", { status: 200 }));
    globalThis.fetch = fetchMock as unknown as typeof fetch;
    await httpRequest(
      makeInput({
        method: "GET",
        url: "https://example.com/r",
        auth: { type: "none" },
      }),
    );
    const headers = (fetchMock.mock.calls[0]![1] as CapturedFetchInit).headers as Headers;
    expect(headers.get("authorization")).toBeNull();
  });
});

// ── Response output ─────────────────────────────────────────────────────────

describe("httpRequest — response output shape", () => {
  it("returns the success shape with bounded fields on 200 JSON", async () => {
    const fetchMock: jest.Mock = jest.fn(
      async () =>
        new Response('{"id":42,"name":"thing"}', {
          status: 200,
          statusText: "OK",
          headers: { "content-type": "application/json" },
        }),
    );
    globalThis.fetch = fetchMock as unknown as typeof fetch;
    const result = await httpRequest(
      makeInput({ method: "GET", url: "https://api.example.com/things/42" }),
    );
    expect(result.output).toMatchObject({
      status: 200,
      ok: true,
      statusText: "OK",
      urlHost: "api.example.com",
      body: '{"id":42,"name":"thing"}',
      bodyJson: { id: 42, name: "thing" },
      bodyTruncated: false,
      bytesCaptured: 24,
    });
    expect(typeof (result.output as { durationMs: number }).durationMs).toBe(
      "number",
    );
    expect((result.output as { headers: Record<string, string> }).headers["content-type"]).toBe(
      "application/json",
    );
  });

  it("returns ok:false on a non-2xx response WITHOUT throwing", async () => {
    const fetchMock: jest.Mock = jest.fn(
      async () =>
        new Response("not found", {
          status: 404,
          statusText: "Not Found",
          headers: { "content-type": "text/plain" },
        }),
    );
    globalThis.fetch = fetchMock as unknown as typeof fetch;
    const result = await httpRequest(
      makeInput({ method: "GET", url: "https://example.com/missing" }),
    );
    expect(result.output).toMatchObject({
      status: 404,
      ok: false,
      statusText: "Not Found",
      body: "not found",
      bodyJson: null,
    });
  });

  it("returns bodyJson: null for non-JSON content-types", async () => {
    const fetchMock: jest.Mock = jest.fn(
      async () =>
        new Response("plain text body", {
          status: 200,
          headers: { "content-type": "text/plain" },
        }),
    );
    globalThis.fetch = fetchMock as unknown as typeof fetch;
    const result = await httpRequest(
      makeInput({ method: "GET", url: "https://example.com/r" }),
    );
    expect((result.output as { bodyJson: unknown }).bodyJson).toBeNull();
  });

  it("parses bodyJson for application/json variants (e.g. application/vnd.api+json)", async () => {
    const fetchMock: jest.Mock = jest.fn(
      async () =>
        new Response('{"data":1}', {
          status: 200,
          headers: { "content-type": "application/vnd.api+json; charset=utf-8" },
        }),
    );
    globalThis.fetch = fetchMock as unknown as typeof fetch;
    const result = await httpRequest(
      makeInput({ method: "GET", url: "https://example.com/r" }),
    );
    expect((result.output as { bodyJson: unknown }).bodyJson).toEqual({ data: 1 });
  });

  it("returns bodyJson: null when content-type is JSON but body is malformed", async () => {
    const fetchMock: jest.Mock = jest.fn(
      async () =>
        new Response("not json", {
          status: 200,
          headers: { "content-type": "application/json" },
        }),
    );
    globalThis.fetch = fetchMock as unknown as typeof fetch;
    const result = await httpRequest(
      makeInput({ method: "GET", url: "https://example.com/r" }),
    );
    expect((result.output as { bodyJson: unknown }).bodyJson).toBeNull();
  });

  it("caps response body at 256 KiB and marks bodyTruncated", async () => {
    const huge = "A".repeat(300 * 1024); // 300 KiB
    const fetchMock: jest.Mock = jest.fn(
      async () =>
        new Response(huge, {
          status: 200,
          headers: { "content-type": "text/plain" },
        }),
    );
    globalThis.fetch = fetchMock as unknown as typeof fetch;
    const result = await httpRequest(
      makeInput({ method: "GET", url: "https://example.com/r" }),
    );
    const out = result.output as {
      body: string;
      bodyTruncated: boolean;
      bytesCaptured: number;
      bodyJson: unknown;
    };
    expect(out.bodyTruncated).toBe(true);
    expect(out.bytesCaptured).toBe(256 * 1024);
    expect(out.body.length).toBe(256 * 1024);
    expect(out.bodyJson).toBeNull();
  });

  it("drops set-cookie / authorization / proxy-authenticate / www-authenticate from output headers", async () => {
    const fetchMock: jest.Mock = jest.fn(
      async () =>
        new Response("", {
          status: 200,
          headers: {
            "x-custom": "ok",
            "Set-Cookie": "session=abc",
            "Authorization": "Bearer leaked",
            "Proxy-Authenticate": "Basic realm=x",
            "WWW-Authenticate": "Bearer realm=x",
          },
        }),
    );
    globalThis.fetch = fetchMock as unknown as typeof fetch;
    const result = await httpRequest(
      makeInput({ method: "GET", url: "https://example.com/r" }),
    );
    const headers = (result.output as { headers: Record<string, string> }).headers;
    expect(headers["x-custom"]).toBe("ok");
    expect(headers["set-cookie"]).toBeUndefined();
    expect(headers["authorization"]).toBeUndefined();
    expect(headers["proxy-authenticate"]).toBeUndefined();
    expect(headers["www-authenticate"]).toBeUndefined();
  });

  it("drops response header values longer than 2 KiB", async () => {
    const long = "x".repeat(3000);
    const fetchMock: jest.Mock = jest.fn(
      async () =>
        new Response("", {
          status: 200,
          headers: { "x-huge": long, "x-ok": "fine" },
        }),
    );
    globalThis.fetch = fetchMock as unknown as typeof fetch;
    const result = await httpRequest(
      makeInput({ method: "GET", url: "https://example.com/r" }),
    );
    const headers = (result.output as { headers: Record<string, string> }).headers;
    expect(headers["x-huge"]).toBeUndefined();
    expect(headers["x-ok"]).toBe("fine");
  });

  it("does not echo Authorization / bearer / basic / apiKey config values anywhere in output", async () => {
    const fetchMock: jest.Mock = jest.fn(
      async () => new Response("body", { status: 200 }),
    );
    globalThis.fetch = fetchMock as unknown as typeof fetch;
    const result = await httpRequest(
      makeInput({
        method: "GET",
        url: "https://example.com/r",
        auth: { type: "bearer", token: "super-secret-token" },
      }),
    );
    const json = JSON.stringify(result.output);
    expect(json).not.toContain("super-secret-token");
  });
});

// ── Timeout and network errors ──────────────────────────────────────────────

describe("httpRequest — timeout and transport errors", () => {
  it("throws HttpRequestTimeoutError when the fetch is aborted by the timer", async () => {
    globalThis.fetch = (async (
      _url: unknown,
      init?: { signal?: AbortSignal },
    ) => {
      // Never resolves; throws on abort.
      return await new Promise<Response>((_resolve, reject) => {
        init?.signal?.addEventListener("abort", () => {
          const err = new Error("aborted");
          err.name = "AbortError";
          reject(err);
        });
      });
    }) as unknown as typeof fetch;
    await expect(
      httpRequest(
        makeInput({
          method: "GET",
          url: "https://example.com/slow",
          timeoutSeconds: 1,
        }),
      ),
    ).rejects.toBeInstanceOf(HttpRequestTimeoutError);
  });

  it("propagates transport errors that aren't aborts", async () => {
    globalThis.fetch = (async () => {
      throw new Error("ECONNRESET");
    }) as unknown as typeof fetch;
    await expect(
      httpRequest(makeInput({ method: "GET", url: "https://example.com/r" })),
    ).rejects.toThrow("ECONNRESET");
  });
});

// ── No-logging guarantee ────────────────────────────────────────────────────

describe("httpRequest — silent handler (no log lines)", () => {
  it("does not call console.info / console.log / console.warn / console.error on success", async () => {
    const fetchMock: jest.Mock = jest.fn(async () => new Response("ok", { status: 200 }));
    globalThis.fetch = fetchMock as unknown as typeof fetch;
    const info = jest.spyOn(console, "info").mockImplementation(() => undefined);
    const log = jest.spyOn(console, "log").mockImplementation(() => undefined);
    const warn = jest.spyOn(console, "warn").mockImplementation(() => undefined);
    const error = jest.spyOn(console, "error").mockImplementation(() => undefined);
    try {
      await httpRequest(
        makeInput({
          method: "GET",
          url: "https://example.com/r?token=secret",
          auth: { type: "bearer", token: "super-secret-token" },
        }),
      );
      expect(info).not.toHaveBeenCalled();
      expect(log).not.toHaveBeenCalled();
      expect(warn).not.toHaveBeenCalled();
      expect(error).not.toHaveBeenCalled();
    } finally {
      info.mockRestore();
      log.mockRestore();
      warn.mockRestore();
      error.mockRestore();
    }
  });
});

// ── Registry wiring ─────────────────────────────────────────────────────────

describe("httpRequest — registry wiring", () => {
  it("is registered under (native, http_request)", async () => {
    const { getActionHandler } = await import(
      "@/services/execution/handlers/_registry"
    );
    expect(getActionHandler("native", "http_request")).toBe(httpRequest);
  });
});
