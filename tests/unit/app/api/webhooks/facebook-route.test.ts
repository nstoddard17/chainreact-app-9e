/**
 * @jest-environment node
 *
 * Tests for `app/api/webhooks/facebook/route.ts` — Slice 3.FACEBOOK-5.
 * GET hub.challenge verification; POST X-Hub-Signature-256 verification
 * (fail-closed) + page-payload fan-out. No secret / verify-token / raw-body
 * leakage.
 */
import { createHmac } from "node:crypto";

const mockDispatch = jest.fn();

// Neutralize the side-effect trigger-index imports (keeps the test light +
// avoids pulling the registries/filters into this unit).
jest.mock("@/integrations/facebook/triggers/newPost", () => ({}));
jest.mock("@/integrations/facebook/triggers/newComment", () => ({}));
jest.mock("@/integrations/facebook/triggers/_shared/dispatch", () => ({
  dispatchFacebookPagePayload: (...a: unknown[]) => mockDispatch(...a),
}));

import { GET, POST } from "@/app/api/webhooks/facebook/route";

const SECRET = "fb-test-app-secret";
const VERIFY_TOKEN = "fb-verify-token";

function sign(body: string, secret = SECRET): string {
  return "sha256=" + createHmac("sha256", secret).update(body, "utf8").digest("hex");
}

function postReq(body: string, headers: Record<string, string> = {}): Request {
  return new Request("https://app.test/api/webhooks/facebook", {
    method: "POST",
    body,
    headers,
  });
}

beforeEach(() => {
  jest.clearAllMocks();
  process.env.FACEBOOK_CLIENT_SECRET = SECRET;
  process.env.FACEBOOK_WEBHOOK_VERIFY_TOKEN = VERIFY_TOKEN;
  mockDispatch.mockResolvedValue({ ignored: false, entries: 1, changes: 1, enqueued: 2 });
});

describe("GET /api/webhooks/facebook — verification handshake", () => {
  it("echoes hub.challenge as text/plain when the verify token matches", async () => {
    const res = await GET(
      new Request(
        "https://app.test/api/webhooks/facebook?hub.mode=subscribe&hub.verify_token=" +
          VERIFY_TOKEN +
          "&hub.challenge=PING42",
      ),
    );
    expect(res.status).toBe(200);
    expect(await res.text()).toBe("PING42");
    expect(res.headers.get("content-type")).toContain("text/plain");
  });

  it("403 when the verify token does not match (token not leaked)", async () => {
    const res = await GET(
      new Request(
        "https://app.test/api/webhooks/facebook?hub.mode=subscribe&hub.verify_token=wrong&hub.challenge=PING42",
      ),
    );
    expect(res.status).toBe(403);
    expect(await res.text()).not.toContain(VERIFY_TOKEN);
  });

  it("403 when FACEBOOK_WEBHOOK_VERIFY_TOKEN is not configured (fail-closed)", async () => {
    delete process.env.FACEBOOK_WEBHOOK_VERIFY_TOKEN;
    const res = await GET(
      new Request(
        "https://app.test/api/webhooks/facebook?hub.mode=subscribe&hub.verify_token=anything&hub.challenge=PING42",
      ),
    );
    expect(res.status).toBe(403);
  });

  it("returns service info JSON when no hub.mode is present", async () => {
    const res = await GET(new Request("https://app.test/api/webhooks/facebook"));
    expect(res.status).toBe(200);
    const body = (await res.json()) as { service: string };
    expect(body.service).toBe("facebook webhook");
  });
});

describe("POST /api/webhooks/facebook — signature + dispatch", () => {
  const pageBody = JSON.stringify({
    object: "page",
    entry: [{ id: "page-1", time: 1, changes: [] }],
  });

  it("valid signature → dispatches the parsed body → 200", async () => {
    const res = await POST(postReq(pageBody, { "X-Hub-Signature-256": sign(pageBody) }));
    expect(res.status).toBe(200);
    expect(mockDispatch).toHaveBeenCalledTimes(1);
    expect(mockDispatch.mock.calls[0]![0]).toMatchObject({ object: "page" });
    const json = (await res.json()) as { ok: boolean; enqueued: number };
    expect(json).toMatchObject({ ok: true, enqueued: 2 });
  });

  it("invalid signature → 401, dispatch NOT invoked, secret not leaked", async () => {
    const res = await POST(
      postReq(pageBody, { "X-Hub-Signature-256": sign("tampered") }),
    );
    expect(res.status).toBe(401);
    expect(mockDispatch).not.toHaveBeenCalled();
    expect(JSON.stringify(await res.json())).not.toContain(SECRET);
  });

  it("missing signature header → 401", async () => {
    const res = await POST(postReq(pageBody));
    expect(res.status).toBe(401);
    expect(mockDispatch).not.toHaveBeenCalled();
  });

  it("missing app secret → 503 (fail closed)", async () => {
    delete process.env.FACEBOOK_CLIENT_SECRET;
    const res = await POST(postReq(pageBody, { "X-Hub-Signature-256": sign(pageBody) }));
    expect(res.status).toBe(503);
    expect(mockDispatch).not.toHaveBeenCalled();
  });

  it("verifies over the RAW body — a re-serialized body fails", async () => {
    const spaced = '{ "object": "page", "entry": [] }';
    const sig = sign(spaced);
    const res = await POST(
      postReq(JSON.stringify(JSON.parse(spaced)), { "X-Hub-Signature-256": sig }),
    );
    expect(res.status).toBe(401);
  });

  it("non-page object → 200 quiet ack (dispatch reports ignored)", async () => {
    mockDispatch.mockResolvedValueOnce({ ignored: true, entries: 0, changes: 0, enqueued: 0 });
    const body = JSON.stringify({ object: "user", entry: [] });
    const res = await POST(postReq(body, { "X-Hub-Signature-256": sign(body) }));
    expect(res.status).toBe(200);
    const json = (await res.json()) as { ok: boolean; ignored: boolean };
    expect(json).toMatchObject({ ok: true, ignored: true });
  });

  it("dispatch failure → 500 (so Facebook retries), no leak", async () => {
    mockDispatch.mockRejectedValueOnce(new Error("queue down"));
    const res = await POST(postReq(pageBody, { "X-Hub-Signature-256": sign(pageBody) }));
    expect(res.status).toBe(500);
    const text = JSON.stringify(await res.json());
    expect(text).not.toContain(SECRET);
    expect(text).not.toContain("queue down");
  });
});
