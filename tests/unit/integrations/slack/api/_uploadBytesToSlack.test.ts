/**
 * @jest-environment node
 *
 * Tests for integrations/slack/api/_uploadBytesToSlack (Slack 2.4 Commit 2).
 *
 * This wrapper POSTs raw bytes to a Slack-issued one-shot upload URL
 * (not a `slack.com/api/*` endpoint). The destination is treated as
 * secret-equivalent — every thrown error MUST avoid leaking the URL
 * or the bytes payload.
 */
import { uploadBytesToSlack } from "@/integrations/slack/api/_uploadBytesToSlack";

const SECRET_UPLOAD_URL =
  "https://files.slack.com/upload/v1/super-secret-token-abc123";
const SENTINEL_BYTES = new Uint8Array([0xde, 0xad, 0xbe, 0xef]);

beforeEach(() => {
  jest.spyOn(globalThis, "fetch").mockReset();
});

afterEach(() => {
  jest.restoreAllMocks();
});

describe("uploadBytesToSlack — request shape", () => {
  it("POSTs bytes to the supplied upload URL with default content-type application/octet-stream", async () => {
    const fetchSpy = jest.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response("", { status: 200 }),
    );

    await uploadBytesToSlack({
      uploadUrl: SECRET_UPLOAD_URL,
      bytes: SENTINEL_BYTES,
    });

    expect(fetchSpy).toHaveBeenCalledTimes(1);
    const [url, init] = fetchSpy.mock.calls[0]!;
    expect(String(url)).toBe(SECRET_UPLOAD_URL);
    expect(init?.method).toBe("POST");
    const headers = init?.headers as Record<string, string>;
    expect(headers["content-type"]).toBe("application/octet-stream");
    // No Authorization header — the URL is one-shot pre-signed.
    expect(headers.authorization).toBeUndefined();
    // Body is the raw Uint8Array (forwarded; not re-wrapped).
    expect(init?.body).toBe(SENTINEL_BYTES);
  });

  it("honors a caller-supplied contentType override", async () => {
    const fetchSpy = jest.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response("", { status: 200 }),
    );
    await uploadBytesToSlack({
      uploadUrl: SECRET_UPLOAD_URL,
      bytes: SENTINEL_BYTES,
      contentType: "application/pdf",
    });
    const [, init] = fetchSpy.mock.calls[0]!;
    const headers = init?.headers as Record<string, string>;
    expect(headers["content-type"]).toBe("application/pdf");
  });
});

describe("uploadBytesToSlack — error secrecy", () => {
  it("throws SlackApiError('upload_failed') on non-2xx WITHOUT leaking the upload URL", async () => {
    jest.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response("<Error>S3 detail with bucket=xyz path=abc</Error>", {
        status: 403,
      }),
    );
    try {
      await uploadBytesToSlack({
        uploadUrl: SECRET_UPLOAD_URL,
        bytes: SENTINEL_BYTES,
      });
      throw new Error("expected throw");
    } catch (err) {
      const msg = (err as Error).message;
      expect((err as { slackErrorCode?: string }).slackErrorCode).toBe(
        "upload_failed",
      );
      expect(msg).not.toContain("super-secret-token");
      expect(msg).not.toContain(SECRET_UPLOAD_URL);
      expect(msg).not.toContain("files.slack.com");
      // S3 error body content must not bleed through.
      expect(msg).not.toContain("bucket=xyz");
      expect(msg).not.toContain("S3 detail");
    }
  });

  it("throws SlackApiError('upload_transport_error') on fetch rejection WITHOUT leaking the upload URL", async () => {
    jest.spyOn(globalThis, "fetch").mockRejectedValueOnce(
      new Error(
        `ECONNRESET while POSTing to ${SECRET_UPLOAD_URL} with token=secret`,
      ),
    );
    try {
      await uploadBytesToSlack({
        uploadUrl: SECRET_UPLOAD_URL,
        bytes: SENTINEL_BYTES,
      });
      throw new Error("expected throw");
    } catch (err) {
      const msg = (err as Error).message;
      expect((err as { slackErrorCode?: string }).slackErrorCode).toBe(
        "upload_transport_error",
      );
      expect(msg).not.toContain("super-secret-token");
      expect(msg).not.toContain(SECRET_UPLOAD_URL);
      // Underlying-error fields (the original cause's URL fragment)
      // must not bleed through either.
      expect(msg).not.toContain("ECONNRESET");
      expect(msg).not.toContain("token=secret");
    }
  });
});

describe("uploadBytesToSlack — no byte leakage", () => {
  it("never logs the bytes payload via any console channel", async () => {
    jest.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response("", { status: 200 }),
    );

    const calls: unknown[][] = [];
    const channels = ["log", "info", "warn", "error"] as const;
    const spies = channels.map((c) =>
      jest.spyOn(console, c).mockImplementation((...args: unknown[]) => {
        calls.push(args);
      }),
    );

    try {
      await uploadBytesToSlack({
        uploadUrl: SECRET_UPLOAD_URL,
        bytes: SENTINEL_BYTES,
      });
      for (const args of calls) {
        for (const a of args) {
          const s = typeof a === "string" ? a : JSON.stringify(a);
          // 0xdeadbeef sentinel in hex / json-array form.
          expect(s).not.toMatch(/deadbeef/i);
          expect(s).not.toMatch(/\[\s*222\s*,\s*173\s*,\s*190\s*,\s*239\s*\]/);
          // Upload URL also never appears in any log call.
          expect(s).not.toContain(SECRET_UPLOAD_URL);
        }
      }
    } finally {
      for (const s of spies) s.mockRestore();
    }
  });
});
