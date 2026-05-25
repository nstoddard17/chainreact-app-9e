/**
 * @jest-environment node
 *
 * Tests for the new_email trigger filter schema (Outlook Mail 2.3 Commit 2).
 * D-OM3 — 5 V1 filters; folder routes via subscription resource (handled
 * in activate.ts); the rest are receive-time. V1 defaults preserved.
 */
import {
  NewEmailTriggerFilterSchema,
  extractNewEmailFilterFields,
  NEW_EMAIL_FILTER_FIELDS,
} from "@/integrations/microsoft-outlook/triggers/newEmail/configSchema";

describe("NewEmailTriggerFilterSchema", () => {
  it("accepts an empty config (Slice 6 backward compat)", () => {
    const parsed = NewEmailTriggerFilterSchema.parse({});
    expect(parsed.folder).toBeUndefined();
    expect(parsed.from).toBeUndefined();
    expect(parsed.subject).toBeUndefined();
    // Defaults (D-OM3 V1-parity).
    expect(parsed.subjectExactMatch).toBe(true);
    expect(parsed.hasAttachment).toBe("any");
    expect(parsed.importance).toBe("any");
  });

  it("preserves D-OM3 V1 defaults when filters omitted", () => {
    const parsed = NewEmailTriggerFilterSchema.parse({});
    expect(parsed).toEqual({
      subjectExactMatch: true,
      hasAttachment: "any",
      importance: "any",
    });
  });

  it("accepts a folder string", () => {
    const parsed = NewEmailTriggerFilterSchema.parse({ folder: "inbox" });
    expect(parsed.folder).toBe("inbox");
  });

  it("rejects an empty-string folder", () => {
    expect(() =>
      NewEmailTriggerFilterSchema.parse({ folder: "" }),
    ).toThrow();
  });

  it("accepts a custom folder id", () => {
    const parsed = NewEmailTriggerFilterSchema.parse({
      folder: "AQMkAGE-folder-id",
    });
    expect(parsed.folder).toBe("AQMkAGE-folder-id");
  });

  it("accepts a from address", () => {
    const parsed = NewEmailTriggerFilterSchema.parse({
      from: "alice@example.test",
    });
    expect(parsed.from).toBe("alice@example.test");
  });

  it("rejects an empty-string from", () => {
    expect(() =>
      NewEmailTriggerFilterSchema.parse({ from: "" }),
    ).toThrow();
  });

  it("accepts a subject string", () => {
    const parsed = NewEmailTriggerFilterSchema.parse({
      subject: "Quarterly report",
    });
    expect(parsed.subject).toBe("Quarterly report");
  });

  it("accepts an empty subject string (handler treats as no-filter)", () => {
    // Per V1-parity, the receive-route's filter logic ignores empty
    // strings — schema-level validation only catches the "no field at
    // all" case (which is the same as empty for filtering purposes).
    const parsed = NewEmailTriggerFilterSchema.parse({ subject: "" });
    expect(parsed.subject).toBe("");
  });

  it("accepts subjectExactMatch as false (substring mode)", () => {
    const parsed = NewEmailTriggerFilterSchema.parse({
      subjectExactMatch: false,
    });
    expect(parsed.subjectExactMatch).toBe(false);
  });

  it("rejects non-boolean subjectExactMatch", () => {
    expect(() =>
      NewEmailTriggerFilterSchema.parse({
        subjectExactMatch: "true" as unknown as boolean,
      }),
    ).toThrow();
  });

  it("accepts each hasAttachment enum value", () => {
    for (const v of ["any", "yes", "no"] as const) {
      expect(() =>
        NewEmailTriggerFilterSchema.parse({ hasAttachment: v }),
      ).not.toThrow();
    }
  });

  it("rejects boolean hasAttachment (legacy V1 might pass true/false)", () => {
    expect(() =>
      NewEmailTriggerFilterSchema.parse({
        hasAttachment: true as unknown as "yes",
      }),
    ).toThrow();
  });

  it("accepts each importance enum value", () => {
    for (const v of ["any", "high", "normal", "low"] as const) {
      expect(() =>
        NewEmailTriggerFilterSchema.parse({ importance: v }),
      ).not.toThrow();
    }
  });

  it("rejects unknown importance values", () => {
    expect(() =>
      NewEmailTriggerFilterSchema.parse({
        importance: "urgent" as unknown as "high",
      }),
    ).toThrow();
  });

  it("rejects unknown fields (strict mode)", () => {
    expect(() =>
      NewEmailTriggerFilterSchema.parse({
        unknownExtra: "leak",
      }),
    ).toThrow();
  });

  it("rejects subscription-state keys (they belong outside the filter subset)", () => {
    // Subscription state is in the same row but NOT a filter field.
    // Strict mode rejects to keep drift visible.
    expect(() =>
      NewEmailTriggerFilterSchema.parse({
        subscriptionId: "sub-1",
      }),
    ).toThrow();
    expect(() =>
      NewEmailTriggerFilterSchema.parse({
        clientState: "deadbeef",
      }),
    ).toThrow();
  });

  it("accepts a fully-populated filter", () => {
    const parsed = NewEmailTriggerFilterSchema.parse({
      folder: "inbox",
      from: "alice@example.test",
      subject: "Q3 review",
      subjectExactMatch: false,
      hasAttachment: "yes",
      importance: "high",
    });
    expect(parsed).toEqual({
      folder: "inbox",
      from: "alice@example.test",
      subject: "Q3 review",
      subjectExactMatch: false,
      hasAttachment: "yes",
      importance: "high",
    });
  });
});

describe("extractNewEmailFilterFields", () => {
  it("extracts only filter fields from a full trigger config", () => {
    const config = {
      type: "subscription-watch",
      subscriptionId: "sub-1",
      clientState: "deadbeef",
      resource: "/me/messages",
      expiresAt: "2026-05-20T12:00:00Z",
      folder: "inbox",
      from: "alice@example.test",
      subject: "Report",
      subjectExactMatch: false,
      hasAttachment: "yes",
      importance: "high",
    };
    expect(extractNewEmailFilterFields(config)).toEqual({
      folder: "inbox",
      from: "alice@example.test",
      subject: "Report",
      subjectExactMatch: false,
      hasAttachment: "yes",
      importance: "high",
    });
  });

  it("drops undefined values (Zod default application requires absence, not undefined)", () => {
    const config = {
      type: "subscription-watch",
      folder: undefined,
      from: undefined,
    };
    expect(extractNewEmailFilterFields(config)).toEqual({});
  });

  it("returns empty object for Slice 6 baseline config (no filter keys)", () => {
    const config = {
      type: "subscription-watch",
      subscriptionId: "sub-1",
      clientState: "deadbeef",
      resource: "/me/messages",
      expiresAt: "2026-05-20T12:00:00Z",
    };
    expect(extractNewEmailFilterFields(config)).toEqual({});
  });

  it("exports the canonical filter field list", () => {
    expect([...NEW_EMAIL_FILTER_FIELDS].sort()).toEqual(
      [
        "folder",
        "from",
        "subject",
        "subjectExactMatch",
        "hasAttachment",
        "importance",
      ].sort(),
    );
  });
});
