/**
 * @jest-environment node
 *
 * Tests for `_shared/monday/api/webhooksCreate.ts` +
 * `webhooksDelete.ts` — GraphQL document shape, enum inlining, config
 * handling, API-Version pin (Slice 3.MONDAY-7). Mocks `fetch` (the
 * shared `mondayRequest` transport).
 */
import { webhooksCreate } from "@/integrations/_shared/monday/api/webhooksCreate";
import { webhooksDelete } from "@/integrations/_shared/monday/api/webhooksDelete";

afterEach(() => jest.restoreAllMocks());

function mockFetchOnce(data: unknown, status = 200): jest.SpyInstance {
  return jest
    .spyOn(globalThis, "fetch")
    .mockResolvedValueOnce(new Response(JSON.stringify({ data }), { status }));
}

function lastInit(spy: jest.SpyInstance): {
  body?: unknown;
  headers?: Record<string, string>;
} {
  return spy.mock.calls[0]![1] as {
    body?: unknown;
    headers?: Record<string, string>;
  };
}

function lastBody(spy: jest.SpyInstance): {
  query: string;
  variables: Record<string, unknown>;
} {
  return JSON.parse(lastInit(spy).body as string);
}

function lastHeaders(spy: jest.SpyInstance): Record<string, string> {
  return lastInit(spy).headers ?? {};
}

describe("webhooksCreate", () => {
  it("POSTs create_webhook with the event enum INLINED (not quoted/variable) and returns id", async () => {
    const spy = mockFetchOnce({
      create_webhook: { id: "987", board_id: "123" },
    });
    const result = await webhooksCreate({
      accessToken: "tok",
      boardId: "123",
      url: "https://app.test/api/webhooks/monday?workflowId=wf&nodeId=n",
      event: "create_item",
      apiVersion: "2025-04",
    });
    expect(result).toEqual({ id: "987", board_id: "123" });

    const { query, variables } = lastBody(spy);
    // Enum literal is inlined, unquoted.
    expect(query).toContain("event: create_item");
    expect(query).not.toContain('event: "create_item"');
    // No config arg in the no-filter variant.
    expect(query).not.toContain("config");
    expect(variables).toEqual({
      boardId: "123",
      url: "https://app.test/api/webhooks/monday?workflowId=wf&nodeId=n",
    });
  });

  it("includes a JSON config variable when configJson is provided (column filter)", async () => {
    const spy = mockFetchOnce({
      create_webhook: { id: "1", board_id: "123" },
    });
    await webhooksCreate({
      accessToken: "tok",
      boardId: "123",
      url: "https://app.test/api/webhooks/monday?workflowId=wf&nodeId=n",
      event: "change_specific_column_value",
      configJson: '{"columnId":"status"}',
      apiVersion: "2025-04",
    });
    const { query, variables } = lastBody(spy);
    expect(query).toContain("event: change_specific_column_value");
    expect(query).toContain("config: $config");
    expect(variables.config).toBe('{"columnId":"status"}');
  });

  it("pins API-Version 2025-04 on the request header", async () => {
    const spy = mockFetchOnce({
      create_webhook: { id: "1", board_id: "123" },
    });
    await webhooksCreate({
      accessToken: "tok",
      boardId: "123",
      url: "x",
      event: "create_item",
      apiVersion: "2025-04",
    });
    expect(lastHeaders(spy)["API-Version"]).toBe("2025-04");
  });

  it("refuses to inline an unexpected (non-allowlist-shaped) event enum", async () => {
    const spy = jest.spyOn(globalThis, "fetch");
    await expect(
      webhooksCreate({
        accessToken: "tok",
        boardId: "123",
        url: "x",
        event: "create_item) { id } evil(",
      }),
    ).rejects.toThrow(/refusing to inline/);
    expect(spy).not.toHaveBeenCalled();
  });
});

describe("webhooksDelete", () => {
  it("POSTs delete_webhook with the id variable + 2025-04 header", async () => {
    const spy = mockFetchOnce({ delete_webhook: { id: "987" } });
    await webhooksDelete({
      accessToken: "tok",
      webhookId: "987",
      apiVersion: "2025-04",
    });
    const { query, variables } = lastBody(spy);
    expect(query).toContain("delete_webhook(id: $id)");
    expect(variables).toEqual({ id: "987" });
    expect(lastHeaders(spy)["API-Version"]).toBe("2025-04");
  });
});
