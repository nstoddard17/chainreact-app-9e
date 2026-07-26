/**
 * @jest-environment node
 *
 * REACT-AGENT-RESOLVER-RECOVERY-1 — the pure recovery classifier + manual-ID validator.
 *
 * Business behavior under test: a resolver failure must never collapse into one undifferentiated
 * "Couldn't load options." Each distinguishable situation gets its own honest headline AND the
 * recovery set it actually supports, so the React Agent's required-details panel can never present
 * a field the user cannot finish.
 */
import {
  classifyOptionsRecovery,
  humanizeProviderSlug,
  providerFromOptionsSource,
  reconnectHrefForProvider,
  resourceNounFromOptionsSource,
  validateManualOptionId,
  MAX_MANUAL_OPTION_ID_LENGTH,
} from "@/core/workflows/options/optionsRecovery";

const typeform = { source: "typeform:forms", providerLabel: "Typeform", fieldLabel: "Form" };
const mailchimp = { source: "mailchimp:audiences", providerLabel: "Mailchimp", fieldLabel: "Audience" };

describe("option-source key helpers", () => {
  it("splits a source key into provider and a readable resource noun", () => {
    expect(providerFromOptionsSource("typeform:forms")).toBe("typeform");
    expect(resourceNounFromOptionsSource("typeform:forms")).toBe("forms");
    expect(resourceNounFromOptionsSource("hubspot:subscription_properties")).toBe(
      "subscription properties",
    );
  });

  it("tolerates a malformed key instead of composing nonsense copy", () => {
    expect(providerFromOptionsSource("nocolon")).toBeUndefined();
    expect(resourceNounFromOptionsSource("nocolon")).toBeUndefined();
    expect(providerFromOptionsSource(undefined)).toBeUndefined();
  });

  it("humanizes a multi-word provider slug for display", () => {
    expect(humanizeProviderSlug("microsoft-outlook")).toBe("Microsoft Outlook");
    expect(humanizeProviderSlug("typeform")).toBe("Typeform");
  });

  it("deep-links reconnect to the account-scoped Apps page for that provider", () => {
    expect(reconnectHrefForProvider("mailchimp")).toBe("/apps?provider=mailchimp");
    expect(reconnectHrefForProvider(undefined)).toBe("/apps");
  });
});

describe("classifyOptionsRecovery — distinguishable states", () => {
  it("never returns the old dead-end copy for ANY state", () => {
    const inputs = [
      { status: "disconnected" as const },
      { status: "needs-reconnect" as const },
      { status: "owner-gated" as const },
      { status: "owner-must-connect" as const },
      { status: "empty" as const },
      ...(
        [
          "UNAUTHENTICATED",
          "INTEGRATION_DISCONNECTED",
          "SOURCE_NOT_FOUND",
          "MISSING_DEPENDENCY",
          "PROVIDER_ERROR",
          "PROVIDER_REAUTH_REQUIRED",
          "SERVER_ERROR",
          "NOT_WORKFLOW_OWNER",
          "OWNER_MUST_CONNECT",
          "UNKNOWN",
        ] as const
      ).map((code) => ({ status: "error" as const, code })),
    ];
    const headlines = new Set<string>();
    for (const input of inputs) {
      const d = classifyOptionsRecovery({ ...typeform, ...input });
      expect(d.headline).not.toMatch(/couldn't load options/i);
      expect(d.headline).not.toMatch(/finish this in the step editor/i);
      expect(d.headline.length).toBeGreaterThan(0);
      headlines.add(d.headline);
    }
    // Distinct situations must not all read the same.
    expect(headlines.size).toBeGreaterThanOrEqual(6);
  });

  it("a missing connection asks the user to connect and offers reconnect + retry + manual entry", () => {
    const d = classifyOptionsRecovery({ ...typeform, status: "disconnected" });
    expect(d.kind).toBe("connection-missing");
    expect(d.headline).toMatch(/Typeform isn't connected/i);
    expect(d).toMatchObject({ canRetry: true, canReconnect: true, canEnterManually: true });
    expect(d.reconnectProvider).toBe("typeform");
  });

  it("a rejected token / missing scope becomes a reconnect state and shows the server's reason", () => {
    // The Typeform resolver maps InsufficientScopeError → PROVIDER_REAUTH_REQUIRED with exactly
    // this sanitized message; the classifier must surface WHICH problem it is, not a generic retry.
    const d = classifyOptionsRecovery({
      ...typeform,
      status: "needs-reconnect",
      serverMessage:
        "Your Typeform connection is missing a required permission. Reconnect Typeform to grant it.",
    });
    expect(d.kind).toBe("reconnect-required");
    expect(d.headline).toMatch(/needs to be renewed/i);
    expect(d.detail).toMatch(/missing a required permission/i);
    expect(d.canReconnect).toBe(true);
  });

  it("an owner-managed personal credential offers no pointless retry but still lets the user type an ID", () => {
    const d = classifyOptionsRecovery({ ...typeform, status: "owner-gated" });
    expect(d.kind).toBe("owner-managed");
    expect(d.canRetry).toBe(false);
    expect(d.canReconnect).toBe(false);
    // The critical anti-dead-end guarantee: a non-owner is NOT trapped.
    expect(d.canEnterManually).toBe(true);
  });

  it("distinguishes an EMPTY provider result from a failed request", () => {
    const empty = classifyOptionsRecovery({ ...mailchimp, status: "empty" });
    const failed = classifyOptionsRecovery({ ...mailchimp, status: "error", code: "PROVIDER_ERROR" });
    expect(empty.kind).toBe("no-results");
    expect(empty.headline).toMatch(/No audiences found in your Mailchimp account/i);
    expect(failed.kind).toBe("provider-unavailable");
    expect(failed.headline).toMatch(/Mailchimp is temporarily unavailable/i);
    expect(empty.headline).not.toBe(failed.headline);
  });

  it("separates a transport failure from a server failure", () => {
    const network = classifyOptionsRecovery({ ...mailchimp, status: "error", code: "UNKNOWN" });
    const server = classifyOptionsRecovery({ ...mailchimp, status: "error", code: "SERVER_ERROR" });
    expect(network.headline).toMatch(/couldn't reach ChainReact/i);
    expect(server.headline).not.toBe(network.headline);
    expect(network.canRetry && server.canRetry).toBe(true);
  });

  it("an unset dependsOn parent names the parent and does NOT offer a meaningless manual ID", () => {
    const d = classifyOptionsRecovery({
      ...mailchimp,
      status: "error",
      code: "MISSING_DEPENDENCY",
      missingDependency: "listId",
    });
    expect(d.kind).toBe("parent-required");
    expect(d.headline).toMatch(/Choose listId first/i);
    expect(d.canEnterManually).toBe(false);
  });

  it("an expired session is not presented as a provider problem", () => {
    const d = classifyOptionsRecovery({ ...typeform, status: "error", code: "UNAUTHENTICATED" });
    expect(d.kind).toBe("sign-in-required");
    expect(d.canRetry).toBe(false);
    expect(d.canEnterManually).toBe(false);
  });

  it("falls back to a humanized provider slug when no display label is supplied", () => {
    const d = classifyOptionsRecovery({ source: "microsoft-outlook:folders", status: "disconnected" });
    expect(d.headline).toMatch(/Microsoft Outlook isn't connected/i);
  });
});

describe("classifyOptionsRecovery — safety", () => {
  it("never echoes a provider body / token / stack even if one is passed as the server message", () => {
    // Defense in depth: the options contract already forbids provider bodies in `message`, and the
    // renderer only forwards typed states. A generic `error` arm must not pass one through.
    const leaky = 'HTTP 500 {"access_token":"tf_live_SECRET","trace":"at forms.ts:12"}';
    const d = classifyOptionsRecovery({
      ...typeform,
      status: "error",
      code: "PROVIDER_ERROR",
      serverMessage: leaky,
    });
    const rendered = `${d.headline} ${d.detail ?? ""}`;
    expect(rendered).not.toContain("tf_live_SECRET");
    expect(rendered).not.toContain("access_token");
    expect(rendered).not.toContain("forms.ts");
  });
});

describe("validateManualOptionId", () => {
  const opts = { fieldLabel: "Form", providerLabel: "Typeform" };

  it("accepts a real provider identifier and returns it trimmed", () => {
    expect(validateManualOptionId("  aBcD1234 ", opts)).toEqual({ ok: true, value: "aBcD1234" });
    expect(validateManualOptionId("4a9b2c1d-77e0-4a0f-9f1e-1234567890ab", opts)).toEqual({
      ok: true,
      value: "4a9b2c1d-77e0-4a0f-9f1e-1234567890ab",
    });
  });

  it("rejects a blank value with an actionable message", () => {
    const r = validateManualOptionId("   ", opts);
    expect(r.ok).toBe(false);
    expect(r.ok === false && r.message).toMatch(/can't be blank/i);
  });

  it("refuses to pretend a DISPLAY NAME is an id", () => {
    const r = validateManualOptionId("Customer Feedback Survey", opts);
    expect(r.ok).toBe(false);
    expect(r.ok === false && r.message).toMatch(/looks like a name, not an ID/i);
    expect(r.ok === false && r.message).toMatch(/Typeform/);
  });

  it("rejects a variable token here and points at the step editor instead", () => {
    const r = validateManualOptionId("{{trigger.formId}}", opts);
    expect(r.ok).toBe(false);
    expect(r.ok === false && r.message).toMatch(/step editor/i);
  });

  it("rejects markup / control characters and absurd lengths", () => {
    expect(validateManualOptionId("<script>", opts).ok).toBe(false);
    expect(validateManualOptionId("a".repeat(MAX_MANUAL_OPTION_ID_LENGTH + 1), opts).ok).toBe(false);
    expect(validateManualOptionId("a".repeat(MAX_MANUAL_OPTION_ID_LENGTH), opts).ok).toBe(true);
  });
});
