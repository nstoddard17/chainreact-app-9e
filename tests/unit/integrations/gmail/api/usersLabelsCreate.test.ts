/**
 * @jest-environment node
 *
 * Tests for the Gmail users.labels.create API wrapper. Mocks fetch
 * and verifies request shape, body construction (optional-field
 * inclusion rules), response passthrough, and the 401-throws-
 * Unauthorized401Error contract.
 */
import { usersLabelsCreate } from "@/integrations/gmail/api/usersLabelsCreate";
import { Unauthorized401Error } from "@/services/oauth/refreshAndRetry";

beforeEach(() => {
  jest.spyOn(globalThis, "fetch").mockReset?.();
});

afterEach(() => {
  jest.restoreAllMocks();
  delete process.env.GMAIL_API_BASE;
});

function mockFetchOnce(response: { ok: boolean; status?: number; json: unknown }) {
  return jest
    .spyOn(globalThis, "fetch")
    .mockResolvedValueOnce(
      new Response(
        typeof response.json === "string"
          ? response.json
          : JSON.stringify(response.json),
        { status: response.status ?? (response.ok ? 200 : 500) },
      ),
    );
}

describe("usersLabelsCreate — request shape", () => {
  it("POSTs to the Gmail labels endpoint with Bearer auth + JSON body", async () => {
    const fetchSpy = mockFetchOnce({
      ok: true,
      json: { id: "Label_1", name: "Hello", type: "user" },
    });

    await usersLabelsCreate({
      accessToken: "ya29.access-token",
      name: "Hello",
    });

    expect(fetchSpy).toHaveBeenCalledTimes(1);
    expect(fetchSpy).toHaveBeenCalledWith(
      "https://gmail.googleapis.com/gmail/v1/users/me/labels",
      expect.objectContaining({
        method: "POST",
        headers: {
          Authorization: "Bearer ya29.access-token",
          "Content-Type": "application/json",
        },
      }),
    );
    const body = fetchSpy.mock.calls[0]![1]!.body as string;
    expect(JSON.parse(body)).toEqual({ name: "Hello" });
  });

  it("forwards labelListVisibility when provided", async () => {
    const fetchSpy = mockFetchOnce({
      ok: true,
      json: { id: "L", name: "X", labelListVisibility: "labelHide" },
    });

    await usersLabelsCreate({
      accessToken: "x",
      name: "X",
      labelListVisibility: "labelHide",
    });

    const body = fetchSpy.mock.calls[0]![1]!.body as string;
    expect(JSON.parse(body)).toEqual({
      name: "X",
      labelListVisibility: "labelHide",
    });
  });

  it("forwards messageListVisibility when provided", async () => {
    const fetchSpy = mockFetchOnce({
      ok: true,
      json: { id: "L", name: "X" },
    });

    await usersLabelsCreate({
      accessToken: "x",
      name: "X",
      messageListVisibility: "hide",
    });

    const body = fetchSpy.mock.calls[0]![1]!.body as string;
    expect(JSON.parse(body)).toEqual({
      name: "X",
      messageListVisibility: "hide",
    });
  });

  it("forwards the color object when provided", async () => {
    const fetchSpy = mockFetchOnce({
      ok: true,
      json: { id: "L", name: "X", color: {} },
    });

    await usersLabelsCreate({
      accessToken: "x",
      name: "X",
      color: {
        backgroundColor: "#16a766",
        textColor: "#ffffff",
      },
    });

    const body = fetchSpy.mock.calls[0]![1]!.body as string;
    expect(JSON.parse(body)).toEqual({
      name: "X",
      color: {
        backgroundColor: "#16a766",
        textColor: "#ffffff",
      },
    });
  });

  it("omits optional fields when they are not provided (no silent default substitution)", async () => {
    const fetchSpy = mockFetchOnce({
      ok: true,
      json: { id: "L", name: "Just a name" },
    });

    await usersLabelsCreate({ accessToken: "x", name: "Just a name" });

    const body = fetchSpy.mock.calls[0]![1]!.body as string;
    const parsed = JSON.parse(body);
    expect(parsed).toEqual({ name: "Just a name" });
    expect(parsed).not.toHaveProperty("labelListVisibility");
    expect(parsed).not.toHaveProperty("messageListVisibility");
    expect(parsed).not.toHaveProperty("color");
  });

  it("returns the parsed response (id + name + optional fields)", async () => {
    mockFetchOnce({
      ok: true,
      json: {
        id: "Label_88",
        name: "Imports",
        type: "user",
        labelListVisibility: "labelShow",
        messageListVisibility: "show",
        color: { backgroundColor: "#16a766", textColor: "#ffffff" },
      },
    });

    const result = await usersLabelsCreate({
      accessToken: "x",
      name: "Imports",
    });

    expect(result).toEqual({
      id: "Label_88",
      name: "Imports",
      type: "user",
      labelListVisibility: "labelShow",
      messageListVisibility: "show",
      color: { backgroundColor: "#16a766", textColor: "#ffffff" },
    });
  });

  it("respects GMAIL_API_BASE override (e2e mock surface)", async () => {
    process.env.GMAIL_API_BASE = "http://127.0.0.1:9877";
    const fetchSpy = mockFetchOnce({
      ok: true,
      json: { id: "L", name: "X" },
    });

    await usersLabelsCreate({ accessToken: "x", name: "X" });

    expect(fetchSpy.mock.calls[0]![0]).toBe(
      "http://127.0.0.1:9877/gmail/v1/users/me/labels",
    );
  });
});

describe("usersLabelsCreate — error handling", () => {
  it("throws Unauthorized401Error on HTTP 401 (refreshAndRetry contract)", async () => {
    mockFetchOnce({
      ok: false,
      status: 401,
      json: { error: { code: 401, message: "invalid_token" } },
    });

    await expect(
      usersLabelsCreate({ accessToken: "stale", name: "X" }),
    ).rejects.toBeInstanceOf(Unauthorized401Error);
  });

  it("surfaces Google's error.message on 4xx (e.g. 409 already exists — V2 does NOT swallow)", async () => {
    mockFetchOnce({
      ok: false,
      status: 409,
      json: {
        error: {
          code: 409,
          message: "Label name exists or conflicts with system label.",
          status: "ALREADY_EXISTS",
        },
      },
    });

    await expect(
      usersLabelsCreate({ accessToken: "x", name: "INBOX" }),
    ).rejects.toThrow(/Label name exists/);
  });

  it("falls back to Google's error.status when message is missing", async () => {
    mockFetchOnce({
      ok: false,
      status: 403,
      json: { error: { code: 403, status: "PERMISSION_DENIED" } },
    });

    await expect(
      usersLabelsCreate({ accessToken: "x", name: "X" }),
    ).rejects.toThrow(/PERMISSION_DENIED/);
  });

  it("falls back to HTTP status when response is not JSON", async () => {
    mockFetchOnce({ ok: false, status: 502, json: "Bad Gateway plain text" });

    await expect(
      usersLabelsCreate({ accessToken: "x", name: "X" }),
    ).rejects.toThrow(/HTTP 502/);
  });
});
