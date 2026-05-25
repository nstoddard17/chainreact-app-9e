/**
 * @jest-environment node
 *
 * Tests for `app/api/webhooks/dropbox/route.ts` — Slice 3.DROPBOX-5.
 * GET challenge echo; POST signature verification (fail-closed) + account
 * fan-out to the reconciler. No secret / raw-body leakage.
 */
import { createHmac } from "node:crypto";

const mockReconcile = jest.fn();

// Neutralize the side-effect registry import (keeps the test light + avoids
// loading the whole provider graph).
jest.mock("@/integrations/_registry", () => ({}));
jest.mock("@/integrations/dropbox/triggers/newFile/reconcile", () => ({
  reconcileDropboxAccounts: (...a: unknown[]) => mockReconcile(...a),
}));

import { GET, POST } from "@/app/api/webhooks/dropbox/route";

const SECRET = "dropbox-test-app-secret";

function sign(body: string, secret = SECRET): string {
  return createHmac("sha256", secret).update(body, "utf8").digest("hex");
}

function postReq(body: string, headers: Record<string, string> = {}): Request {
  return new Request("https://app.test/api/webhooks/dropbox", {
    method: "POST",
    body,
    headers,
  });
}

beforeEach(() => {
  jest.clearAllMocks();
  process.env.DROPBOX_CLIENT_SECRET = SECRET;
  mockReconcile.mockResolvedValue({ reconciled: 1, dispatched: 2 });
});

describe("GET /api/webhooks/dropbox — verification handshake", () => {
  it("echoes ?challenge as text/plain with nosniff", async () => {
    const res = await GET(
      new Request("https://app.test/api/webhooks/dropbox?challenge=abc123"),
    );
    expect(res.status).toBe(200);
    expect(await res.text()).toBe("abc123");
    expect(res.headers.get("content-type")).toContain("text/plain");
    expect(res.headers.get("x-content-type-options")).toBe("nosniff");
  });

  it("returns service info JSON when no challenge is present", async () => {
    const res = await GET(new Request("https://app.test/api/webhooks/dropbox"));
    expect(res.status).toBe(200);
    const body = (await res.json()) as { service: string };
    expect(body.service).toBe("dropbox webhook");
  });
});

describe("POST /api/webhooks/dropbox — signature + dispatch", () => {
  it("valid signature → invokes reconcile with parsed account ids → 200", async () => {
    const body = JSON.stringify({ list_folder: { accounts: ["dbid:1", "dbid:2"] } });
    const res = await POST(postReq(body, { "X-Dropbox-Signature": sign(body) }));
    expect(res.status).toBe(200);
    expect(mockReconcile).toHaveBeenCalledWith(["dbid:1", "dbid:2"]);
    const json = (await res.json()) as { ok: boolean; dispatched: number };
    expect(json).toMatchObject({ ok: true, reconciled: 1, dispatched: 2 });
  });

  it("invalid signature → 401, reconcile NOT invoked", async () => {
    const body = JSON.stringify({ list_folder: { accounts: ["dbid:1"] } });
    const res = await POST(
      postReq(body, { "X-Dropbox-Signature": sign("different body") }),
    );
    expect(res.status).toBe(401);
    expect(mockReconcile).not.toHaveBeenCalled();
    expect(JSON.stringify(await res.json())).not.toContain(SECRET);
  });

  it("missing signature header → 401", async () => {
    const body = JSON.stringify({ list_folder: { accounts: ["dbid:1"] } });
    const res = await POST(postReq(body));
    expect(res.status).toBe(401);
    expect(mockReconcile).not.toHaveBeenCalled();
  });

  it("missing app secret → 503 (fail closed)", async () => {
    delete process.env.DROPBOX_CLIENT_SECRET;
    const body = JSON.stringify({ list_folder: { accounts: ["dbid:1"] } });
    const res = await POST(postReq(body, { "X-Dropbox-Signature": sign(body) }));
    expect(res.status).toBe(503);
    expect(mockReconcile).not.toHaveBeenCalled();
  });

  it("verifies over the RAW body — a re-serialized body fails", async () => {
    const body = '{ "list_folder": { "accounts": ["dbid:1"] } }';
    const sig = sign(body); // signed over the spaced original
    const reserialized = JSON.stringify(JSON.parse(body));
    const res = await POST(
      postReq(reserialized, { "X-Dropbox-Signature": sig }),
    );
    expect(res.status).toBe(401);
  });

  it("verified body with no accounts → 200, reconcile called with []", async () => {
    mockReconcile.mockResolvedValue({ reconciled: 0, dispatched: 0 });
    const body = JSON.stringify({ list_folder: { accounts: [] } });
    const res = await POST(postReq(body, { "X-Dropbox-Signature": sign(body) }));
    expect(res.status).toBe(200);
    expect(mockReconcile).toHaveBeenCalledWith([]);
  });

  it("verified but malformed (non-account-shaped) body → 200, empty fan-out", async () => {
    mockReconcile.mockResolvedValue({ reconciled: 0, dispatched: 0 });
    const body = JSON.stringify({ something: "else" });
    const res = await POST(postReq(body, { "X-Dropbox-Signature": sign(body) }));
    expect(res.status).toBe(200);
    expect(mockReconcile).toHaveBeenCalledWith([]);
  });

  it("reconcile failure → 500 (so Dropbox retries), no leak", async () => {
    mockReconcile.mockRejectedValue(new Error("db down"));
    const body = JSON.stringify({ list_folder: { accounts: ["dbid:1"] } });
    const res = await POST(postReq(body, { "X-Dropbox-Signature": sign(body) }));
    expect(res.status).toBe(500);
    const text = JSON.stringify(await res.json());
    expect(text).not.toContain(SECRET);
    expect(text).not.toContain("db down");
  });
});
