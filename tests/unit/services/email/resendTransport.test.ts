/**
 * @jest-environment node
 *
 * Resend transport + sendTransactionalEmail seam (TEAM-INVITATION-EMAIL-1).
 * Mocks ONLY the external provider HTTP boundary (global fetch). Proves the
 * typed delivery results, the bounded transient-only retry, the
 * missing-configuration policy, and that the API key / recipient / message
 * body never leak into results or logs.
 */
import { sendViaResend, isResendConfigured } from "@/services/email/transports/resend";
import { sendTransactionalEmail } from "@/services/email/sendTransactionalEmail";
import type { TransactionalEmailMessage } from "@/services/email/transport";

const API_KEY = "re_test_secret_key_123";
const FROM = "ChainReact <invites@chainreact.test>";

const MESSAGE: TransactionalEmailMessage = {
  to: "person@example.com",
  subject: "You've been invited to join Acme on ChainReact",
  html: "<p>hi</p>",
  text: "hi",
};

const mockFetch = jest.fn();

beforeEach(() => {
  mockFetch.mockReset();
  (globalThis as unknown as { fetch: jest.Mock }).fetch = mockFetch;
  process.env.RESEND_API_KEY = API_KEY;
  process.env.TRANSACTIONAL_EMAIL_FROM = FROM;
  jest.spyOn(console, "warn").mockImplementation(() => {});
});

afterEach(() => {
  delete process.env.RESEND_API_KEY;
  delete process.env.TRANSACTIONAL_EMAIL_FROM;
  (console.warn as jest.Mock).mockRestore?.();
});

function providerResponse(status: number) {
  return { ok: status >= 200 && status < 300, status } as Response;
}

describe("isResendConfigured", () => {
  it("requires BOTH the API key and the from address", () => {
    expect(isResendConfigured()).toBe(true);
    delete process.env.RESEND_API_KEY;
    expect(isResendConfigured()).toBe(false);
    process.env.RESEND_API_KEY = API_KEY;
    delete process.env.TRANSACTIONAL_EMAIL_FROM;
    expect(isResendConfigured()).toBe(false);
  });
});

describe("sendViaResend", () => {
  it("returns 'sent' when the provider accepts (single call, authorized, full payload)", async () => {
    mockFetch.mockResolvedValueOnce(providerResponse(200));
    const result = await sendViaResend(MESSAGE);
    expect(result).toEqual({ status: "sent" });
    expect(mockFetch).toHaveBeenCalledTimes(1);
    const [url, init] = mockFetch.mock.calls[0] as [
      string,
      { headers: Record<string, string>; body: string },
    ];
    expect(url).toBe("https://api.resend.com/emails");
    expect(init.headers.Authorization).toBe(`Bearer ${API_KEY}`);
    const body = JSON.parse(init.body);
    expect(body).toMatchObject({ from: FROM, to: ["person@example.com"], subject: MESSAGE.subject });
  });

  it("retries ONCE on a 5xx and succeeds if the retry lands", async () => {
    mockFetch
      .mockResolvedValueOnce(providerResponse(503))
      .mockResolvedValueOnce(providerResponse(200));
    const result = await sendViaResend(MESSAGE);
    expect(result).toEqual({ status: "sent" });
    expect(mockFetch).toHaveBeenCalledTimes(2);
  });

  it("fails after the single bounded retry on persistent 5xx (exactly 2 calls)", async () => {
    mockFetch
      .mockResolvedValueOnce(providerResponse(500))
      .mockResolvedValueOnce(providerResponse(500));
    const result = await sendViaResend(MESSAGE);
    expect(result).toEqual({ status: "failed", reason: "provider_500" });
    expect(mockFetch).toHaveBeenCalledTimes(2);
  });

  it("does NOT retry a permanent 4xx (exactly 1 call)", async () => {
    mockFetch.mockResolvedValueOnce(providerResponse(422));
    const result = await sendViaResend(MESSAGE);
    expect(result).toEqual({ status: "failed", reason: "provider_422" });
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });

  it("treats a timeout as transient: one retry, then a typed 'timeout' failure", async () => {
    const timeoutErr = Object.assign(new Error("The operation timed out"), { name: "TimeoutError" });
    mockFetch.mockRejectedValueOnce(timeoutErr).mockRejectedValueOnce(timeoutErr);
    const result = await sendViaResend(MESSAGE);
    expect(result).toEqual({ status: "failed", reason: "timeout" });
    expect(mockFetch).toHaveBeenCalledTimes(2);
  });

  it("recovers from a transient network error on retry", async () => {
    mockFetch
      .mockRejectedValueOnce(new TypeError("fetch failed"))
      .mockResolvedValueOnce(providerResponse(200));
    const result = await sendViaResend(MESSAGE);
    expect(result).toEqual({ status: "sent" });
  });

  it("returns 'not_configured' without touching the network when env is missing", async () => {
    delete process.env.RESEND_API_KEY;
    const result = await sendViaResend(MESSAGE);
    expect(result).toEqual({ status: "not_configured" });
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it("never exposes the API key in any result", async () => {
    mockFetch.mockResolvedValue(providerResponse(500));
    const result = await sendViaResend(MESSAGE);
    expect(JSON.stringify(result)).not.toContain(API_KEY);
  });
});

describe("sendTransactionalEmail", () => {
  it("passes through 'sent' and logs nothing", async () => {
    mockFetch.mockResolvedValueOnce(providerResponse(200));
    const result = await sendTransactionalEmail(MESSAGE, { template: "team_invitation", invitationId: "inv-1" });
    expect(result).toEqual({ status: "sent" });
    expect(console.warn).not.toHaveBeenCalled();
  });

  it("logs a structured warning on failure with SAFE metadata only", async () => {
    mockFetch.mockResolvedValue(providerResponse(500));
    const result = await sendTransactionalEmail(MESSAGE, {
      template: "team_invitation",
      invitationId: "inv-1",
      accountId: "acct-1",
    });
    expect(result).toEqual({ status: "failed", reason: "provider_500" });
    const logged = (console.warn as jest.Mock).mock.calls.flat().map(String).join("\n");
    expect(logged).toContain("email.transactional.delivery_failed");
    expect(logged).toContain("inv-1");
    // Never the key, recipient, subject, or body.
    expect(logged).not.toContain(API_KEY);
    expect(logged).not.toContain("person@example.com");
    expect(logged).not.toContain(MESSAGE.subject);
    expect(logged).not.toContain(MESSAGE.html);
  });

  it("returns 'not_configured' (with a structured note) when the transport has no credentials", async () => {
    delete process.env.RESEND_API_KEY;
    const result = await sendTransactionalEmail(MESSAGE, { template: "team_invitation" });
    expect(result).toEqual({ status: "not_configured" });
    expect(mockFetch).not.toHaveBeenCalled();
    const logged = (console.warn as jest.Mock).mock.calls.flat().map(String).join("\n");
    expect(logged).toContain("email.transactional.not_configured");
  });
});
