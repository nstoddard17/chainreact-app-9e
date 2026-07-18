import {
  createMtlsClient,
  type MtlsDispatch,
  type MtlsResponse,
} from "@/services/http/mtls/client";
import {
  MtlsError,
  CertificateExpiredError,
} from "@/services/http/mtls/errors";
import {
  TEST_CLIENT_CERT_PEM,
  TEST_CLIENT_KEY_PEM,
} from "@/tests/fixtures/mtls/testCerts";

const credential = { certPem: TEST_CLIENT_CERT_PEM, keyPem: TEST_CLIENT_KEY_PEM };
const insideWindow = new Date("2030-01-01T00:00:00Z");
const afterWindow = new Date("2200-01-01T00:00:00Z");

function okResponse(overrides: Partial<MtlsResponse> = {}): MtlsResponse {
  return { status: 200, headers: {}, body: "ok", ...overrides };
}

/** Dispatch that plays a queued script of responses/errors, counting calls. */
function scriptedDispatch(steps: Array<MtlsResponse | Error>) {
  const calls: Array<{ method: string; url: string; body?: string }> = [];
  let i = 0;
  const dispatch: MtlsDispatch = async (input) => {
    calls.push({ method: input.method, url: input.url.toString(), body: input.body });
    const step = steps[Math.min(i, steps.length - 1)] as MtlsResponse | Error;
    i++;
    if (step instanceof Error) throw step;
    return step;
  };
  return { dispatch, calls };
}

describe("mtls/client — URL + cert prechecks", () => {
  it("rejects non-https URLs before dispatching", async () => {
    const { dispatch, calls } = scriptedDispatch([okResponse()]);
    const client = createMtlsClient({ dispatch });
    await expect(
      client.request({ method: "GET", url: "http://api.example.com", credential, now: insideWindow }),
    ).rejects.toMatchObject({ code: "invalid_url" });
    expect(calls).toHaveLength(0);
  });

  it("rejects an unparseable URL", async () => {
    const { dispatch } = scriptedDispatch([okResponse()]);
    const client = createMtlsClient({ dispatch });
    await expect(
      client.request({ method: "GET", url: "::::", credential, now: insideWindow }),
    ).rejects.toBeInstanceOf(MtlsError);
  });

  it("fails fast on an expired certificate without dispatching", async () => {
    const { dispatch, calls } = scriptedDispatch([okResponse()]);
    const client = createMtlsClient({ dispatch });
    await expect(
      client.request({ method: "GET", url: "https://api.example.com", credential, now: afterWindow }),
    ).rejects.toBeInstanceOf(CertificateExpiredError);
    expect(calls).toHaveLength(0);
  });

  it("skipCertExpiryCheck bypasses the precheck", async () => {
    const { dispatch, calls } = scriptedDispatch([okResponse()]);
    const client = createMtlsClient({ dispatch });
    const res = await client.request({
      method: "GET",
      url: "https://api.example.com",
      credential,
      now: afterWindow,
      skipCertExpiryCheck: true,
    });
    expect(res.status).toBe(200);
    expect(calls).toHaveLength(1);
  });
});

describe("mtls/client — happy path + passthrough", () => {
  it("returns the dispatched response and forwards method/body", async () => {
    const { dispatch, calls } = scriptedDispatch([
      okResponse({ status: 201, headers: { "x-req-id": "abc" }, body: '{"ok":true}' }),
    ]);
    const client = createMtlsClient({ dispatch });
    const res = await client.request({
      method: "post",
      url: "https://api.example.com/v1/things",
      headers: { "content-type": "application/json" },
      body: '{"a":1}',
      credential,
      now: insideWindow,
    });
    expect(res.status).toBe(201);
    expect(res.headers["x-req-id"]).toBe("abc");
    expect(calls[0]?.method).toBe("POST");
    expect(calls[0]?.body).toBe('{"a":1}');
  });
});

describe("mtls/client — retry policy", () => {
  const base = { url: "https://api.example.com", credential, now: insideWindow, retryBaseDelayMs: 0 };

  it("retries transient connection failures then succeeds", async () => {
    const { dispatch, calls } = scriptedDispatch([
      new MtlsError("connection_failed", "boom"),
      new MtlsError("connection_failed", "boom"),
      okResponse(),
    ]);
    const client = createMtlsClient({ dispatch });
    const res = await client.request({ ...base, method: "GET", retries: 2 });
    expect(res.status).toBe(200);
    expect(calls).toHaveLength(3);
  });

  it("throws the last error when retries are exhausted", async () => {
    const { dispatch, calls } = scriptedDispatch([new MtlsError("connection_failed", "boom")]);
    const client = createMtlsClient({ dispatch });
    await expect(client.request({ ...base, method: "GET", retries: 1 })).rejects.toMatchObject({
      code: "connection_failed",
    });
    expect(calls).toHaveLength(2);
  });

  it("does NOT retry TLS handshake failures (bad cert/key is not transient)", async () => {
    const { dispatch, calls } = scriptedDispatch([new MtlsError("tls_handshake_failed", "bad")]);
    const client = createMtlsClient({ dispatch });
    await expect(client.request({ ...base, method: "GET", retries: 3 })).rejects.toMatchObject({
      code: "tls_handshake_failed",
    });
    expect(calls).toHaveLength(1);
  });

  it("retries 5xx on idempotent GET", async () => {
    const { dispatch, calls } = scriptedDispatch([okResponse({ status: 503 }), okResponse()]);
    const client = createMtlsClient({ dispatch });
    const res = await client.request({ ...base, method: "GET", retries: 1 });
    expect(res.status).toBe(200);
    expect(calls).toHaveLength(2);
  });

  it("retries 429 on idempotent GET", async () => {
    const { dispatch, calls } = scriptedDispatch([okResponse({ status: 429 }), okResponse()]);
    const client = createMtlsClient({ dispatch });
    const res = await client.request({ ...base, method: "GET", retries: 1 });
    expect(res.status).toBe(200);
    expect(calls).toHaveLength(2);
  });

  it("does NOT retry a non-idempotent POST by default (returns the 5xx)", async () => {
    const { dispatch, calls } = scriptedDispatch([okResponse({ status: 500 })]);
    const client = createMtlsClient({ dispatch });
    const res = await client.request({ ...base, method: "POST", retries: 2 });
    expect(res.status).toBe(500);
    expect(calls).toHaveLength(1);
  });

  it("retries a POST when allowRetryOnNonIdempotent is set (token-mint case)", async () => {
    const { dispatch, calls } = scriptedDispatch([okResponse({ status: 500 }), okResponse()]);
    const client = createMtlsClient({ dispatch });
    const res = await client.request({
      ...base,
      method: "POST",
      retries: 1,
      allowRetryOnNonIdempotent: true,
    });
    expect(res.status).toBe(200);
    expect(calls).toHaveLength(2);
  });
});
