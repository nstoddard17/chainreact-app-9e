/**
 * @jest-environment node
 *
 * Tests for the shared Microsoft Graph validation-handshake helper.
 * Used by every Microsoft webhook receive route to short-circuit
 * Graph's validation POST within the 10-second budget without DB I/O.
 */
import { checkValidationHandshake } from "@/integrations/_shared/microsoft/webhooks/validation";

function makeRequest(opts: {
  url?: string;
  method?: string;
  contentType?: string;
  body?: string;
}): Request {
  return new Request(opts.url ?? "https://app.example.test/api/webhooks/microsoft-outlook", {
    method: opts.method ?? "POST",
    headers: opts.contentType
      ? { "Content-Type": opts.contentType }
      : { "Content-Type": "application/json" },
    body: opts.body,
  });
}

describe("checkValidationHandshake", () => {
  it("returns the validation token from ?validationToken= query", async () => {
    const req = makeRequest({
      url: "https://app.example.test/api/webhooks/microsoft-outlook?validationToken=foo-bar",
    });

    const result = await checkValidationHandshake(req);

    expect(result.validationToken).toBe("foo-bar");
    // Query-token validation must NOT consume the body — empty bodyText.
    expect(result.bodyText).toBe("");
  });

  it("accepts the legacy lowercase ?validationtoken= variant", async () => {
    const req = makeRequest({
      url: "https://app.example.test/api/webhooks/microsoft-outlook?validationtoken=lc-token",
    });

    const result = await checkValidationHandshake(req);

    expect(result.validationToken).toBe("lc-token");
  });

  it("returns the body as token when content-type is text/plain (alternate format)", async () => {
    const req = makeRequest({
      contentType: "text/plain",
      body: "validation-body-token",
    });

    const result = await checkValidationHandshake(req);

    expect(result.validationToken).toBe("validation-body-token");
    expect(result.bodyText).toBe("validation-body-token");
  });

  it("ignores text/plain validation when body is empty / whitespace-only", async () => {
    const req = makeRequest({
      contentType: "text/plain",
      body: "   ",
    });

    const result = await checkValidationHandshake(req);

    expect(result.validationToken).toBeNull();
    expect(result.bodyText).toBe("   ");
  });

  it("returns null token + bodyText for normal JSON notification requests", async () => {
    const req = makeRequest({
      body: JSON.stringify({ value: [{ subscriptionId: "sub-1" }] }),
    });

    const result = await checkValidationHandshake(req);

    expect(result.validationToken).toBeNull();
    expect(result.bodyText).toBe(
      JSON.stringify({ value: [{ subscriptionId: "sub-1" }] }),
    );
  });

  it("does not require a body for query-token validation (avoids unnecessary read)", async () => {
    // Microsoft's query-token validation requests have no body. We must
    // not block on .text() when the query token is present.
    const req = new Request(
      "https://app.example.test/api/webhooks/microsoft-outlook?validationToken=tok",
      { method: "POST" },
    );

    const result = await checkValidationHandshake(req);

    expect(result.validationToken).toBe("tok");
    expect(result.bodyText).toBe("");
  });

  it("query-token wins over text/plain body when both are present", async () => {
    // Edge case: if a request has BOTH ?validationToken= AND a text/plain
    // body, the query token is authoritative. Helps callers keep their
    // contract simple.
    const req = makeRequest({
      url: "https://app.example.test/api/webhooks/microsoft-outlook?validationToken=query-wins",
      contentType: "text/plain",
      body: "body-loses",
    });

    const result = await checkValidationHandshake(req);

    expect(result.validationToken).toBe("query-wins");
  });
});
