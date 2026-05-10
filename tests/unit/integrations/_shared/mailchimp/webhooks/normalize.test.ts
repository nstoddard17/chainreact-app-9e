/**
 * @jest-environment node
 *
 * Tests for the Mailchimp webhook form-body parser + canonical
 * TriggerEvent normalizer — Slice 14 Commit 4.
 *
 * Verifies:
 *   - `parseMailchimpFormBody` extracts `type`, `fired_at`, and
 *     `data[...]` fields into a structured shape.
 *   - Nested `data[merges][KEY]` fields are pulled into a separate
 *     `merges` map for convenience.
 *   - URL-encoding (spaces as `+`, percent-escapes) is decoded.
 *   - Empty / malformed bodies parse to an empty shape without throwing.
 *   - `mailchimpDedupKey` is a stable sha256 hex.
 *   - `normalizeMailchimpEvent` produces a canonical TriggerEvent
 *     with the right type, eventId (= dedup key), occurredAt, accountId,
 *     and payload fields.
 *   - subscriberHash vs campaignId mapping based on `type` discriminator.
 */
import {
  mailchimpDedupKey,
  normalizeMailchimpEvent,
  parseMailchimpFormBody,
} from "@/integrations/_shared/mailchimp/webhooks/normalize";

// Mailchimp's documented subscribe-event body shape.
const SUBSCRIBE_BODY =
  "type=subscribe" +
  "&fired_at=2025-05-10+12%3A34%3A56" +
  "&data%5Bid%5D=abcdef0123" +
  "&data%5Blist_id%5D=1a2b3c4d5e" +
  "&data%5Bemail%5D=urist%40example.com" +
  "&data%5Bemail_type%5D=html" +
  "&data%5Bmerges%5D%5BFNAME%5D=Urist" +
  "&data%5Bmerges%5D%5BLNAME%5D=McVankab" +
  "&data%5Bip_opt%5D=192.0.2.1";

const CAMPAIGN_BODY =
  "type=campaign" +
  "&fired_at=2025-05-10+12%3A34%3A56" +
  "&data%5Bid%5D=campaign-xyz" +
  "&data%5Blist_id%5D=1a2b3c4d5e" +
  "&data%5Bsubject%5D=Hello+World" +
  "&data%5Bstatus%5D=sent";

describe("parseMailchimpFormBody", () => {
  it("extracts type, fired_at, and data fields", () => {
    const result = parseMailchimpFormBody(SUBSCRIBE_BODY);
    expect(result.type).toBe("subscribe");
    expect(result.firedAt).toBe("2025-05-10 12:34:56");
    expect(result.data.id).toBe("abcdef0123");
    expect(result.data.list_id).toBe("1a2b3c4d5e");
    expect(result.data.email).toBe("urist@example.com");
    expect(result.data.email_type).toBe("html");
    expect(result.data.ip_opt).toBe("192.0.2.1");
  });

  it("extracts nested data[merges][KEY] into the merges map", () => {
    const result = parseMailchimpFormBody(SUBSCRIBE_BODY);
    expect(result.merges).toEqual({
      FNAME: "Urist",
      LNAME: "McVankab",
    });
  });

  it("URL-decodes values (spaces, @, percent-escapes)", () => {
    const result = parseMailchimpFormBody(CAMPAIGN_BODY);
    expect(result.data.subject).toBe("Hello World");
  });

  it("returns empty / null fields on empty body without throwing", () => {
    const result = parseMailchimpFormBody("");
    expect(result.type).toBe("");
    expect(result.firedAt).toBeNull();
    expect(result.data).toEqual({});
    expect(result.merges).toEqual({});
  });

  it("returns empty data when only top-level fields present", () => {
    const result = parseMailchimpFormBody("type=subscribe&fired_at=now");
    expect(result.type).toBe("subscribe");
    expect(result.firedAt).toBe("now");
    expect(result.data).toEqual({});
  });

  it("handles malformed body (no = sign) without throwing", () => {
    const result = parseMailchimpFormBody("garbage");
    expect(result.type).toBe("");
    expect(result.firedAt).toBeNull();
  });
});

describe("mailchimpDedupKey", () => {
  it("returns 64-character lowercase hex sha256 of the raw body", () => {
    const key = mailchimpDedupKey(SUBSCRIBE_BODY);
    expect(key).toMatch(/^[0-9a-f]{64}$/);
  });

  it("is stable across identical bodies (cross-retry dedup)", () => {
    const a = mailchimpDedupKey(SUBSCRIBE_BODY);
    const b = mailchimpDedupKey(SUBSCRIBE_BODY);
    expect(a).toBe(b);
  });

  it("differs for different bodies", () => {
    const a = mailchimpDedupKey(SUBSCRIBE_BODY);
    const b = mailchimpDedupKey(CAMPAIGN_BODY);
    expect(a).not.toBe(b);
  });

  it("differs for body with a single character changed", () => {
    const a = mailchimpDedupKey(SUBSCRIBE_BODY);
    const b = mailchimpDedupKey(SUBSCRIBE_BODY + "x");
    expect(a).not.toBe(b);
  });
});

describe("normalizeMailchimpEvent", () => {
  it("returns canonical TriggerEvent with sha256 eventId and parsed payload", () => {
    const parsed = parseMailchimpFormBody(SUBSCRIBE_BODY);
    const event = normalizeMailchimpEvent({
      rawBody: SUBSCRIBE_BODY,
      parsed,
      accountId: "mc_account_xyz",
    });
    expect(event.provider).toBe("mailchimp");
    expect(event.eventType).toBe("audience_event");
    expect(event.eventId).toBe(mailchimpDedupKey(SUBSCRIBE_BODY));
    expect(event.occurredAt).toBe("2025-05-10 12:34:56");
    expect(event.accountId).toBe("mc_account_xyz");
    expect(event.payload.type).toBe("subscribe");
    expect(event.payload.audienceId).toBe("1a2b3c4d5e");
    expect(event.payload.email).toBe("urist@example.com");
    expect(event.payload.subscriberHash).toBe("abcdef0123");
    expect(event.payload.campaignId).toBeNull();
    expect(event.payload.firedAt).toBe("2025-05-10 12:34:56");
  });

  it("maps data[id] to campaignId (not subscriberHash) for campaign events", () => {
    const parsed = parseMailchimpFormBody(CAMPAIGN_BODY);
    const event = normalizeMailchimpEvent({
      rawBody: CAMPAIGN_BODY,
      parsed,
      accountId: "mc",
    });
    expect(event.payload.type).toBe("campaign");
    expect(event.payload.campaignId).toBe("campaign-xyz");
    expect(event.payload.subscriberHash).toBeNull();
  });

  it("falls back to now() when fired_at is absent", () => {
    const before = Date.now();
    const event = normalizeMailchimpEvent({
      rawBody: "type=subscribe",
      parsed: parseMailchimpFormBody("type=subscribe"),
      accountId: "mc",
    });
    const after = Date.now();
    const ts = Date.parse(event.occurredAt as string);
    expect(ts).toBeGreaterThanOrEqual(before - 1000);
    expect(ts).toBeLessThanOrEqual(after + 1000);
  });

  it("preserves parsed (raw) form fields under payload.parsed", () => {
    const parsed = parseMailchimpFormBody(SUBSCRIBE_BODY);
    const event = normalizeMailchimpEvent({
      rawBody: SUBSCRIBE_BODY,
      parsed,
      accountId: "mc",
    });
    expect(event.payload.parsed).toEqual(parsed);
  });
});
