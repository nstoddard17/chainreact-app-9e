/**
 * @jest-environment node
 *
 * Tests for the Gmail buildReplyContext helper. Pure function — no
 * mocks needed; assert against the derived shape.
 */
import { buildReplyContext } from "@/integrations/gmail/utils/buildReplyContext";
import type { UsersMessagesGetResult } from "@/integrations/gmail/api/usersMessagesGet";

function makeOriginal(overrides: {
  threadId?: string;
  headers?: ReadonlyArray<{ name: string; value: string }>;
} = {}): UsersMessagesGetResult {
  return {
    id: "orig-1",
    threadId: overrides.threadId ?? "thr-original",
    labelIds: ["INBOX"],
    snippet: "...",
    internalDate: "1700000000000",
    sizeEstimate: 1024,
    payload: {
      mimeType: "text/plain",
      headers: overrides.headers ?? [
        { name: "From", value: "Alice <alice@example.com>" },
        { name: "To", value: "me@example.com" },
        { name: "Subject", value: "Original topic" },
        { name: "Message-ID", value: "<orig-msg-id@example.com>" },
      ],
    },
  };
}

describe("buildReplyContext", () => {
  it("auto-prefixes Subject with 'Re: ' when no custom subject supplied", () => {
    const ctx = buildReplyContext({ original: makeOriginal() });
    expect(ctx.subject).toBe("Re: Original topic");
  });

  it("does NOT double-prefix when original subject already starts with 'Re: '", () => {
    const ctx = buildReplyContext({
      original: makeOriginal({
        headers: [
          { name: "From", value: "Alice <alice@example.com>" },
          { name: "Subject", value: "Re: Already a reply" },
          { name: "Message-ID", value: "<m@x.com>" },
        ],
      }),
    });
    expect(ctx.subject).toBe("Re: Already a reply");
  });

  it("overrides Subject when a non-empty customSubject is provided", () => {
    const ctx = buildReplyContext({
      original: makeOriginal(),
      customSubject: "My custom subject",
    });
    expect(ctx.subject).toBe("My custom subject");
  });

  it("ignores whitespace-only customSubject and falls back to auto 'Re: '", () => {
    const ctx = buildReplyContext({
      original: makeOriginal(),
      customSubject: "   ",
    });
    expect(ctx.subject).toBe("Re: Original topic");
  });

  it("derives `to` from the original From header verbatim (display-name form preserved)", () => {
    const ctx = buildReplyContext({ original: makeOriginal() });
    expect(ctx.to).toBe("Alice <alice@example.com>");
  });

  it("derives In-Reply-To and References from the original Message-ID header", () => {
    const ctx = buildReplyContext({ original: makeOriginal() });
    expect(ctx.inReplyTo).toBe("<orig-msg-id@example.com>");
    expect(ctx.references).toBe("<orig-msg-id@example.com>");
  });

  it("uses case-insensitive header matching (Gmail returns mixed-case)", () => {
    const ctx = buildReplyContext({
      original: makeOriginal({
        headers: [
          { name: "from", value: "lowercase@example.com" },
          { name: "MESSAGE-ID", value: "<upper@example.com>" },
          { name: "Subject", value: "Topic" },
        ],
      }),
    });
    expect(ctx.to).toBe("lowercase@example.com");
    expect(ctx.inReplyTo).toBe("<upper@example.com>");
  });

  it("returns empty strings for missing From / Message-ID rather than throwing", () => {
    const ctx = buildReplyContext({
      original: makeOriginal({
        headers: [{ name: "Subject", value: "Only subject" }],
      }),
    });
    expect(ctx.to).toBe("");
    expect(ctx.inReplyTo).toBe("");
    expect(ctx.references).toBe("");
    // Subject still works because the header is present.
    expect(ctx.subject).toBe("Re: Only subject");
  });

  it("threadId comes from the original.threadId (NOT from any header)", () => {
    const ctx = buildReplyContext({
      original: makeOriginal({ threadId: "thr-12345" }),
    });
    expect(ctx.threadId).toBe("thr-12345");
  });
});
