/**
 * @jest-environment node
 *
 * Slice 3.MONDAY-2 — Tests for the shared Monday GraphQL request layer.
 *
 * Coverage:
 *   - POSTs to ${apiBase}/v2 with Bearer token + JSON Content-Type +
 *     API-Version header.
 *   - HTTP 401 → Unauthorized401Error.
 *   - HTTP 429 → RateLimitError with parsed Retry-After.
 *   - HTTP 4xx/5xx → MondayApiError with status.
 *   - HTTP 200 + errors[] of rate-limit shape → RateLimitError.
 *   - HTTP 200 + errors[] of not-found shape → NotFoundError.
 *   - HTTP 200 + other errors[] → MondayApiError.
 *   - HTTP 200 + happy data → returns data.
 *   - apiVersion override is forwarded.
 *   - MONDAY_API_BASE env override is honored.
 *   - Token NEVER appears in thrown error messages (sanitization).
 */
import {
  MondayApiError,
  NotFoundError,
  RateLimitError,
} from "@/integrations/_shared/monday/errors";
import {
  mondayApiBase,
  mondayRequest,
} from "@/integrations/_shared/monday/api/_request";
import { Unauthorized401Error } from "@/services/oauth/refreshAndRetry";

const SECRET_TOKEN = "secret-token-DO-NOT-LEAK";

afterEach(() => {
  jest.restoreAllMocks();
  delete process.env.MONDAY_API_BASE;
});

function mockOnce(response: {
  status?: number;
  body: string;
  headers?: Record<string, string>;
}) {
  jest.spyOn(globalThis, "fetch").mockResolvedValueOnce(
    new Response(response.body, {
      status: response.status ?? 200,
      headers: response.headers,
    }),
  );
}

describe("mondayApiBase", () => {
  it("defaults to https://api.monday.com", () => {
    expect(mondayApiBase()).toBe("https://api.monday.com");
  });

  it("honors MONDAY_API_BASE env override", () => {
    process.env.MONDAY_API_BASE = "https://mock.monday.local";
    expect(mondayApiBase()).toBe("https://mock.monday.local");
  });
});

describe("mondayRequest happy path", () => {
  it("POSTs to /v2 with Bearer token + JSON body + API-Version header", async () => {
    const fetchSpy = jest
      .spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({ data: { boards: [{ id: "b-1" }] } }),
          { status: 200 },
        ),
      );
    const result = await mondayRequest<{ boards: Array<{ id: string }> }>({
      accessToken: SECRET_TOKEN,
      query: "{ boards { id } }",
    });
    expect(result.boards[0]!.id).toBe("b-1");
    const url = fetchSpy.mock.calls[0]![0];
    const init = fetchSpy.mock.calls[0]![1]!;
    expect(url).toBe("https://api.monday.com/v2");
    const headers = init.headers as Record<string, string>;
    expect(headers.Authorization).toBe(`Bearer ${SECRET_TOKEN}`);
    expect(headers["Content-Type"]).toBe("application/json");
    expect(headers["API-Version"]).toBe("2024-01");
    expect(init.method).toBe("POST");
    const body = JSON.parse(String(init.body)) as {
      query: string;
      variables: Record<string, unknown>;
    };
    expect(body.query).toBe("{ boards { id } }");
    expect(body.variables).toEqual({});
  });

  it("forwards variables", async () => {
    const fetchSpy = jest
      .spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ data: { ok: true } }), {
          status: 200,
        }),
      );
    await mondayRequest({
      accessToken: SECRET_TOKEN,
      query: "query($id: ID!) { ok }",
      variables: { id: "42" },
    });
    const body = JSON.parse(String(fetchSpy.mock.calls[0]![1]!.body));
    expect(body.variables).toEqual({ id: "42" });
  });

  it("honors apiVersion override", async () => {
    const fetchSpy = jest
      .spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ data: {} }), { status: 200 }),
      );
    await mondayRequest({
      accessToken: SECRET_TOKEN,
      query: "{ ok }",
      apiVersion: "2025-04",
    });
    const headers = fetchSpy.mock.calls[0]![1]!.headers as Record<
      string,
      string
    >;
    expect(headers["API-Version"]).toBe("2025-04");
  });
});

describe("mondayRequest error mapping", () => {
  it("HTTP 401 → Unauthorized401Error (refreshAndRetry contract)", async () => {
    mockOnce({ status: 401, body: '{"error":"bad token"}' });
    await expect(
      mondayRequest({ accessToken: SECRET_TOKEN, query: "{ x }" }),
    ).rejects.toBeInstanceOf(Unauthorized401Error);
  });

  it("HTTP 429 → RateLimitError with Retry-After parsed", async () => {
    mockOnce({
      status: 429,
      body: "{}",
      headers: { "Retry-After": "60" },
    });
    await expect(
      mondayRequest({ accessToken: SECRET_TOKEN, query: "{ x }" }),
    ).rejects.toMatchObject({
      name: "RateLimitError",
      retryAfterSeconds: 60,
    });
  });

  it("HTTP 5xx → MondayApiError with status", async () => {
    mockOnce({
      status: 503,
      body: '{"errors":[{"message":"server down"}]}',
    });
    let caught: unknown;
    try {
      await mondayRequest({ accessToken: SECRET_TOKEN, query: "{ x }" });
    } catch (e) {
      caught = e;
    }
    expect(caught).toBeInstanceOf(MondayApiError);
    expect((caught as MondayApiError).status).toBe(503);
  });

  it("HTTP 200 + errors[] with ComplexityException → RateLimitError", async () => {
    mockOnce({
      status: 200,
      body: JSON.stringify({
        errors: [
          {
            message: "complexity 5000 exceeded",
            extensions: { code: "ComplexityException" },
          },
        ],
      }),
    });
    await expect(
      mondayRequest({ accessToken: SECRET_TOKEN, query: "{ x }" }),
    ).rejects.toBeInstanceOf(RateLimitError);
  });

  it("HTTP 200 + errors[] with ResourceNotFoundException → NotFoundError", async () => {
    mockOnce({
      status: 200,
      body: JSON.stringify({
        errors: [
          {
            message: "Item not found",
            extensions: { code: "ResourceNotFoundException" },
          },
        ],
      }),
    });
    await expect(
      mondayRequest({ accessToken: SECRET_TOKEN, query: "{ x }" }),
    ).rejects.toBeInstanceOf(NotFoundError);
  });

  it("HTTP 200 + errors[] with InvalidArgument 'not found' → NotFoundError", async () => {
    mockOnce({
      status: 200,
      body: JSON.stringify({
        errors: [
          {
            message: "Resource does not exist",
            extensions: { code: "InvalidArgumentException" },
          },
        ],
      }),
    });
    await expect(
      mondayRequest({ accessToken: SECRET_TOKEN, query: "{ x }" }),
    ).rejects.toBeInstanceOf(NotFoundError);
  });

  it("HTTP 200 + other errors[] → MondayApiError", async () => {
    mockOnce({
      status: 200,
      body: JSON.stringify({
        errors: [
          {
            message: "Validation failed",
            extensions: { code: "ValidationException" },
          },
        ],
      }),
    });
    await expect(
      mondayRequest({ accessToken: SECRET_TOKEN, query: "{ x }" }),
    ).rejects.toMatchObject({
      name: "MondayApiError",
      message: expect.stringContaining("ValidationException"),
    });
  });

  it("HTTP 200 + legacy error_message → MondayApiError", async () => {
    mockOnce({
      status: 200,
      body: JSON.stringify({
        error_message: "Account suspended",
        error_code: "SUSPENDED",
      }),
    });
    await expect(
      mondayRequest({ accessToken: SECRET_TOKEN, query: "{ x }" }),
    ).rejects.toMatchObject({
      name: "MondayApiError",
      message: expect.stringContaining("SUSPENDED"),
    });
  });

  it("HTTP 200 + missing data field → MondayApiError", async () => {
    mockOnce({ status: 200, body: "{}" });
    await expect(
      mondayRequest({ accessToken: SECRET_TOKEN, query: "{ x }" }),
    ).rejects.toMatchObject({
      message: expect.stringContaining("missing `data`"),
    });
  });

  it("never leaks the access token in thrown error messages", async () => {
    mockOnce({
      status: 200,
      body: JSON.stringify({
        errors: [{ message: "bad" }],
      }),
    });
    let caught: unknown;
    try {
      await mondayRequest({ accessToken: SECRET_TOKEN, query: "{ x }" });
    } catch (e) {
      caught = e;
    }
    expect((caught as Error).message).not.toContain(SECRET_TOKEN);
  });

  it("never leaks the request body in thrown error messages", async () => {
    mockOnce({
      status: 500,
      body: "{}",
    });
    let caught: unknown;
    try {
      await mondayRequest({
        accessToken: SECRET_TOKEN,
        query: "mutation { create_item(group_id: $secret_group) { id } }",
        variables: { secret_group: "do-not-leak-group" },
      });
    } catch (e) {
      caught = e;
    }
    expect((caught as Error).message).not.toContain("do-not-leak-group");
  });
});
