/**
 * @jest-environment node
 */
import {
  EmailFlaggedTriggerFilterSchema,
  extractEmailFlaggedFilterFields,
  EMAIL_FLAGGED_FILTER_FIELDS,
} from "@/integrations/microsoft-outlook/triggers/emailFlagged/configSchema";

describe("EmailFlaggedTriggerFilterSchema", () => {
  it("accepts an empty config (folder optional)", () => {
    const parsed = EmailFlaggedTriggerFilterSchema.parse({});
    expect(parsed.folder).toBeUndefined();
  });

  it("accepts a folder string", () => {
    const parsed = EmailFlaggedTriggerFilterSchema.parse({
      folder: "inbox",
    });
    expect(parsed.folder).toBe("inbox");
  });

  it("rejects an empty-string folder", () => {
    expect(() =>
      EmailFlaggedTriggerFilterSchema.parse({ folder: "" }),
    ).toThrow();
  });

  it("rejects unknown fields (strict mode)", () => {
    expect(() =>
      EmailFlaggedTriggerFilterSchema.parse({ leak: "x" }),
    ).toThrow();
  });

  it("rejects subscription-state keys (extract first, then parse)", () => {
    expect(() =>
      EmailFlaggedTriggerFilterSchema.parse({ subscriptionId: "sub-1" }),
    ).toThrow();
  });

  it("exports the canonical filter field list (folder only)", () => {
    expect([...EMAIL_FLAGGED_FILTER_FIELDS]).toEqual(["folder"]);
  });
});

describe("extractEmailFlaggedFilterFields", () => {
  it("extracts only the filter subset", () => {
    expect(
      extractEmailFlaggedFilterFields({
        type: "subscription-watch",
        subscriptionId: "sub-1",
        folder: "inbox",
      }),
    ).toEqual({ folder: "inbox" });
  });

  it("returns empty object when no filter keys are present", () => {
    expect(
      extractEmailFlaggedFilterFields({
        type: "subscription-watch",
        subscriptionId: "sub-1",
      }),
    ).toEqual({});
  });
});
