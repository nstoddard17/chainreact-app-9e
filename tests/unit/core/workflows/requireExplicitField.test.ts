import { requireExplicitField } from "@/core/workflows/requireExplicitField";

describe("requireExplicitField (Q11)", () => {
  it("returns ok with value when field is set", () => {
    const r = requireExplicitField("all", "sendNotifications");
    expect(r).toEqual({ ok: true, value: "all" });
  });

  it("fails with standardized config-failure shape on undefined", () => {
    const r = requireExplicitField(undefined, "sendNotifications");
    expect(r).toEqual({
      ok: false,
      failure: {
        success: false,
        category: "config",
        error: {
          code: "MISSING_REQUIRED_FIELD",
          path: "sendNotifications",
        },
        message: expect.stringContaining("sendNotifications"),
      },
    });
  });

  it("fails on null", () => {
    const r = requireExplicitField(null, "guestsCanInviteOthers");
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.failure.error.code).toBe("MISSING_REQUIRED_FIELD");
      expect(r.failure.error.path).toBe("guestsCanInviteOthers");
    }
  });

  it("preserves the explicit value 0 (Q11: 0 is a valid choice)", () => {
    const r = requireExplicitField(0, "minDelayMinutes");
    expect(r).toEqual({ ok: true, value: 0 });
  });

  it("preserves the explicit value false (Q11: false is a valid choice)", () => {
    const r = requireExplicitField(false, "guestsCanInviteOthers");
    expect(r).toEqual({ ok: true, value: false });
  });

  it("preserves the explicit empty string (Q11: presence not content)", () => {
    const r = requireExplicitField("", "description");
    expect(r).toEqual({ ok: true, value: "" });
  });

  it("uses displayName in the message when provided", () => {
    const r = requireExplicitField(undefined, "sendNotifications", "Send notifications");
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.failure.message).toContain("Send notifications");
    }
  });
});
