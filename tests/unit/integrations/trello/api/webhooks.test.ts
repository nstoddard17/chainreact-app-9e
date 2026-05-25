/**
 * @jest-environment node
 */
import {
  webhooksCreate,
  webhooksDelete,
} from "@/integrations/trello/api/webhooks";

const ORIGINAL_FETCH = global.fetch;

interface CapturedRequest {
  url?: string;
  method?: string;
  body?: string;
}

function captureFetch(responseBody: unknown, status = 200): CapturedRequest {
  const captured: CapturedRequest = {};
  global.fetch = jest.fn(async (input: unknown, init?: Parameters<typeof fetch>[1]) => {
    captured.url =
      typeof input === "string"
        ? input
        : (input as { toString: () => string }).toString();
    captured.method = init?.method;
    if (typeof init?.body === "string") captured.body = init.body;
    return new Response(JSON.stringify(responseBody), {
      status,
      headers: { "Content-Type": "application/json" },
    });
  }) as unknown as typeof fetch;
  return captured;
}

beforeEach(() => {
  process.env.TRELLO_CLIENT_ID = "test-key";
});

afterEach(() => {
  delete process.env.TRELLO_CLIENT_ID;
  global.fetch = ORIGINAL_FETCH;
});

describe("webhooksCreate", () => {
  it("POSTs /1/webhooks with idModel + callbackURL + description", async () => {
    const captured = captureFetch({
      id: "wh-1",
      idModel: "b1",
      callbackURL: "https://x/cb",
    });
    const wh = await webhooksCreate({
      accessToken: "t",
      idModel: "b1",
      callbackURL: "https://x/cb",
      description: "ChainReact new_card",
    });
    expect(captured.method).toBe("POST");
    expect(new URL(captured.url!).pathname).toBe("/1/webhooks");
    const body = JSON.parse(captured.body!);
    expect(body.idModel).toBe("b1");
    expect(body.callbackURL).toBe("https://x/cb");
    expect(body.description).toBe("ChainReact new_card");
    expect(wh.id).toBe("wh-1");
  });
});

describe("webhooksDelete", () => {
  it("DELETEs /1/webhooks/{id} (URL-encoded)", async () => {
    const captured = captureFetch({});
    await webhooksDelete({ accessToken: "t", webhookId: "wh/abc" });
    expect(captured.method).toBe("DELETE");
    expect(new URL(captured.url!).pathname).toBe("/1/webhooks/wh%2Fabc");
  });
});
