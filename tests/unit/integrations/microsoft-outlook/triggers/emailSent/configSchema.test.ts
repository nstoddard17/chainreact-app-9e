/**
 * @jest-environment node
 */
import {
  EmailSentTriggerFilterSchema,
  extractEmailSentFilterFields,
  EMAIL_SENT_FILTER_FIELDS,
} from "@/integrations/microsoft-outlook/triggers/emailSent/configSchema";

describe("EmailSentTriggerFilterSchema", () => {
  it("accepts an empty config (V1 marked `to` required but mega-route only filters when set)", () => {
    const parsed = EmailSentTriggerFilterSchema.parse({});
    expect(parsed.subjectExactMatch).toBe(true);
    expect(parsed.to).toBeUndefined();
    expect(parsed.subject).toBeUndefined();
  });

  it("accepts to as a single email string", () => {
    const parsed = EmailSentTriggerFilterSchema.parse({
      to: "alice@example.test",
    });
    expect(parsed.to).toBe("alice@example.test");
  });

  it("accepts to as a CSV string", () => {
    const parsed = EmailSentTriggerFilterSchema.parse({
      to: "alice@x.com, bob@x.com",
    });
    expect(parsed.to).toBe("alice@x.com, bob@x.com");
  });

  it("accepts to as an array of strings", () => {
    const parsed = EmailSentTriggerFilterSchema.parse({
      to: ["alice@x.com", "bob@x.com"],
    });
    expect(parsed.to).toEqual(["alice@x.com", "bob@x.com"]);
  });

  it("rejects to as an empty string", () => {
    expect(() =>
      EmailSentTriggerFilterSchema.parse({ to: "" }),
    ).toThrow();
  });

  it("rejects to as an empty array", () => {
    expect(() =>
      EmailSentTriggerFilterSchema.parse({ to: [] }),
    ).toThrow();
  });

  it("preserves D-OM3 default subjectExactMatch=true", () => {
    expect(
      EmailSentTriggerFilterSchema.parse({}).subjectExactMatch,
    ).toBe(true);
  });

  it("accepts subjectExactMatch=false", () => {
    expect(
      EmailSentTriggerFilterSchema.parse({ subjectExactMatch: false })
        .subjectExactMatch,
    ).toBe(false);
  });

  it("rejects unknown fields (strict mode)", () => {
    expect(() =>
      EmailSentTriggerFilterSchema.parse({ unknownExtra: "leak" }),
    ).toThrow();
  });

  it("rejects subscription-state keys (extract first, then parse)", () => {
    expect(() =>
      EmailSentTriggerFilterSchema.parse({ subscriptionId: "sub-1" }),
    ).toThrow();
  });
});

describe("extractEmailSentFilterFields", () => {
  it("extracts only the filter subset from a full trigger config", () => {
    const config = {
      type: "subscription-watch",
      subscriptionId: "sub-1",
      clientState: "deadbeef",
      resource: "/me/mailFolders/SentItems/messages",
      expiresAt: "2026-05-20T12:00:00Z",
      to: "alice@example.test",
      subject: "Report",
      subjectExactMatch: false,
    };
    expect(extractEmailSentFilterFields(config)).toEqual({
      to: "alice@example.test",
      subject: "Report",
      subjectExactMatch: false,
    });
  });

  it("returns empty object for baseline config (no filter keys)", () => {
    expect(
      extractEmailSentFilterFields({
        type: "subscription-watch",
        subscriptionId: "sub-1",
      }),
    ).toEqual({});
  });

  it("exports the canonical filter field list", () => {
    expect([...EMAIL_SENT_FILTER_FIELDS].sort()).toEqual(
      ["subject", "subjectExactMatch", "to"].sort(),
    );
  });
});
