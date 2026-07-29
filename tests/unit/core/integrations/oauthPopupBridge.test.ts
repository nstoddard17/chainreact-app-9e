import {
  OAUTH_POPUP_MESSAGE_TYPE,
  OAUTH_POPUP_COMPLETE_PATH,
  buildOAuthPopupCompletePath,
  buildOAuthPopupMessage,
  isValidOAuthReturnContext,
  parseOAuthPopupMessage,
  sanitizeOAuthPopupCompleteParams,
} from "@/core/integrations/oauthPopupBridge";

describe("isValidOAuthReturnContext", () => {
  it("accepts the allow-listed builder_popup surface with a URL-safe nonce", () => {
    expect(
      isValidOAuthReturnContext({ surface: "builder_popup", nonce: "abc12345" }),
    ).toBe(true);
  });

  it.each([
    ["null", null],
    ["array", []],
    ["string", "builder_popup"],
    ["wrong surface", { surface: "apps_page", nonce: "abc12345" }],
    ["url surface", { surface: "https://evil.example", nonce: "abc12345" }],
    ["missing nonce", { surface: "builder_popup" }],
    ["short nonce", { surface: "builder_popup", nonce: "abc" }],
    ["long nonce", { surface: "builder_popup", nonce: "a".repeat(65) }],
    ["markup nonce", { surface: "builder_popup", nonce: "<script>alert" }],
    ["non-string nonce", { surface: "builder_popup", nonce: 42 }],
  ])("rejects %s", (_label, value) => {
    expect(isValidOAuthReturnContext(value)).toBe(false);
  });
});

describe("buildOAuthPopupCompletePath", () => {
  it("builds the fixed internal path with encoded params", () => {
    const path = buildOAuthPopupCompletePath({
      provider: "slack",
      status: "connected",
      nonce: "abc12345",
    });
    expect(path.startsWith(`${OAUTH_POPUP_COMPLETE_PATH}?`)).toBe(true);
    const url = new URL(path, "http://localhost");
    expect(url.pathname).toBe(OAUTH_POPUP_COMPLETE_PATH);
    expect(url.searchParams.get("provider")).toBe("slack");
    expect(url.searchParams.get("status")).toBe("connected");
    expect(url.searchParams.get("nonce")).toBe("abc12345");
    expect(url.searchParams.get("code")).toBeNull();
  });

  it("carries a stable error code on error", () => {
    const url = new URL(
      buildOAuthPopupCompletePath({
        provider: "stripe",
        status: "error",
        nonce: "abc12345",
        errorCode: "callback_failed",
      }),
      "http://localhost",
    );
    expect(url.searchParams.get("status")).toBe("error");
    expect(url.searchParams.get("code")).toBe("callback_failed");
  });
});

describe("parseOAuthPopupMessage", () => {
  const valid = buildOAuthPopupMessage({
    provider: "slack",
    status: "connected",
    nonce: "abc12345",
  });

  it("round-trips a message built by buildOAuthPopupMessage", () => {
    expect(parseOAuthPopupMessage(valid)).toEqual(valid);
  });

  it("round-trips an error message with a code", () => {
    const err = buildOAuthPopupMessage({
      provider: "stripe",
      status: "error",
      nonce: "abc12345",
      errorCode: "access_denied",
    });
    expect(parseOAuthPopupMessage(err)).toEqual(err);
  });

  it.each([
    ["null", null],
    ["string", "hello"],
    ["wrong type", { ...valid, type: "other" }],
    ["missing provider", { ...valid, provider: undefined }],
    ["uppercase provider", { ...valid, provider: "Slack" }],
    ["bad status", { ...valid, status: "maybe" }],
    ["bad nonce", { ...valid, nonce: "<x>" }],
    ["object errorCode", { ...valid, errorCode: {} }],
    ["oversized errorCode", { ...valid, errorCode: "x".repeat(65) }],
  ])("rejects %s", (_label, value) => {
    expect(parseOAuthPopupMessage(value)).toBeNull();
  });
});

describe("sanitizeOAuthPopupCompleteParams", () => {
  it("produces a postable message from valid params", () => {
    const msg = sanitizeOAuthPopupCompleteParams({
      provider: "slack",
      status: "connected",
      nonce: "abc12345",
      code: undefined,
    });
    expect(msg).toEqual({
      type: OAUTH_POPUP_MESSAGE_TYPE,
      provider: "slack",
      status: "connected",
      nonce: "abc12345",
    });
  });

  it("drops an unsafe error code but keeps the error status", () => {
    const msg = sanitizeOAuthPopupCompleteParams({
      provider: "slack",
      status: "error",
      nonce: "abc12345",
      code: "<img src=x>",
    });
    expect(msg).toEqual({
      type: OAUTH_POPUP_MESSAGE_TYPE,
      provider: "slack",
      status: "error",
      nonce: "abc12345",
    });
  });

  it.each([
    ["missing provider", { status: "connected", nonce: "abc12345" }],
    ["bad provider", { provider: "Bad Provider", status: "connected", nonce: "abc12345" }],
    ["bad status", { provider: "slack", status: "done", nonce: "abc12345" }],
    ["missing nonce", { provider: "slack", status: "connected" }],
    ["bad nonce", { provider: "slack", status: "connected", nonce: "no good" }],
  ])("collapses %s to null", (_label, params) => {
    expect(
      sanitizeOAuthPopupCompleteParams(
        params as Parameters<typeof sanitizeOAuthPopupCompleteParams>[0],
      ),
    ).toBeNull();
  });
});
