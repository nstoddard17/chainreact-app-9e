/**
 * Provider-selection guard decision table (REACT-PROVIDER-AMBIGUITY-1 · -2).
 *
 * Runs against the REAL registry (gmail + microsoft-outlook are simultaneous email-trigger
 * candidates). Pins every row of the documented decision table, the REGISTERED-vs-CONNECTED
 * distinction (-2: connection state never justifies a provider), and the order-independence
 * guarantee (no first-match behavior; candidate or connection ordering can never change a verdict).
 */
import {
  evaluateProviderChoice,
  findProviderAmbiguity,
  registeredCategoryCandidates,
} from "@/services/ai-guidance/providerSelection/providerSelectionGuard";

const EMAIL_TRIGGER = { provider: "gmail", type: "new_email", kind: "trigger" as const };
const OUTLOOK_TRIGGER = { provider: "microsoft-outlook", type: "new_email", kind: "trigger" as const };

describe("registeredCategoryCandidates", () => {
  it("exposes BOTH Gmail and Outlook as simultaneous email-trigger candidates (the precondition)", () => {
    const candidates = registeredCategoryCandidates("trigger", "email");
    expect(candidates).toEqual(expect.arrayContaining(["gmail", "microsoft-outlook"]));
    expect(candidates.length).toBeGreaterThanOrEqual(2);
  });
});

describe("decision table", () => {
  it("native is always justified (platform capability, not an app choice)", () => {
    const v = evaluateProviderChoice(
      { provider: "native", type: "manual.run", kind: "trigger" },
      { texts: ["when I get an email"] },
    );
    expect(v).toEqual({ justified: true, rule: "native" });
  });

  it("explicit mention justifies — 'Gmail' → gmail, 'Outlook' → microsoft-outlook, 'Microsoft email' → microsoft-outlook", () => {
    expect(evaluateProviderChoice(EMAIL_TRIGGER, { texts: ["when I receive a Gmail email"] })).toEqual({
      justified: true,
      rule: "explicit",
    });
    expect(
      evaluateProviderChoice(OUTLOOK_TRIGGER, { texts: ["when an email arrives in Outlook"] }),
    ).toEqual({ justified: true, rule: "explicit" });
    expect(evaluateProviderChoice(OUTLOOK_TRIGGER, { texts: ["use my Microsoft email"] })).toEqual({
      justified: true,
      rule: "explicit",
    });
  });

  it("a generic 'email' request does NOT justify Gmail — and does not justify Outlook either", () => {
    const ctx = { texts: ["When I receive an email from someone, post it to Slack"] };
    const gmail = evaluateProviderChoice(EMAIL_TRIGGER, ctx);
    const outlook = evaluateProviderChoice(OUTLOOK_TRIGGER, ctx);
    expect(gmail.justified).toBe(false);
    expect(outlook.justified).toBe(false);
    if (gmail.justified || outlook.justified) return;
    // Stable ids + user-facing names, both candidates present.
    expect(gmail.clarification.options.map((o) => o.providerId)).toEqual(
      expect.arrayContaining(["gmail", "microsoft-outlook"]),
    );
    expect(gmail.clarification.question).toContain("Gmail");
    expect(gmail.clarification.question).toContain("Microsoft Outlook");
    expect(gmail.clarification.question).toContain("email service");
  });

  it("existing-node context justifies (canvas provider preserved, never swapped)", () => {
    const v = evaluateProviderChoice(OUTLOOK_TRIGGER, {
      texts: ["only trigger when it comes from vendor@example.com"],
      canvasProviders: ["microsoft-outlook", "slack"],
    });
    expect(v).toEqual({ justified: true, rule: "canvas" });
  });

  // REACT-PROVIDER-AMBIGUITY-2 — connection state NEVER justifies a provider choice. Every
  // connection permutation over 2 registered candidates must still clarify, for BOTH candidates.
  it.each([
    ["zero connected", [] as string[]],
    ["exactly ONE connected (the removed sole-connected inference)", ["gmail"]],
    ["the OTHER one connected", ["microsoft-outlook"]],
    ["BOTH connected", ["gmail", "microsoft-outlook"]],
  ])("2 registered candidates + %s → still ambiguous for either provider", (_label, connectedProviders) => {
    const ctx = { texts: ["when I receive an email"], connectedProviders: [...connectedProviders, "slack"] };
    expect(evaluateProviderChoice(EMAIL_TRIGGER, ctx).justified).toBe(false);
    expect(evaluateProviderChoice(OUTLOOK_TRIGGER, ctx).justified).toBe(false);
  });

  it("the clarification MENTIONS the connected provider (copy only) and flags it via isConnected — without removing or preselecting an option", () => {
    const v = evaluateProviderChoice(EMAIL_TRIGGER, {
      texts: ["when I receive an email"],
      connectedProviders: ["gmail", "slack"],
    });
    expect(v.justified).toBe(false);
    if (v.justified) return;
    expect(v.clarification.question).toContain("Gmail is already connected");
    const byId = new Map(v.clarification.options.map((o) => [o.providerId, o]));
    expect(byId.get("gmail")!.isConnected).toBe(true);
    expect(byId.get("microsoft-outlook")!.isConnected).toBe(false);
    // BOTH stay on offer — connection decorates, never filters.
    expect(byId.size).toBeGreaterThanOrEqual(2);
  });

  it("REGISTERED vs CONNECTED — one REGISTERED total is justified; one CONNECTED among two registered is not", () => {
    const ctx = { texts: ["when I receive an email"], connectedProviders: ["gmail"] };
    // Exactly ONE registered candidate (platform-capability fact) → automatic selection allowed…
    expect(evaluateProviderChoice(EMAIL_TRIGGER, ctx, ["gmail"])).toEqual({
      justified: true,
      rule: "sole-registered",
    });
    // …but the SAME single connection with TWO registered candidates must clarify.
    expect(evaluateProviderChoice(EMAIL_TRIGGER, ctx, ["gmail", "microsoft-outlook"]).justified).toBe(false);
  });

  it("sole-registered is independent of connection status (an UNCONNECTED sole provider is still selectable)", () => {
    const v = evaluateProviderChoice(EMAIL_TRIGGER, { texts: ["when I receive an email"], connectedProviders: [] }, [
      "gmail",
    ]);
    expect(v).toEqual({ justified: true, rule: "sole-registered" });
  });

  it("explicit mention beats connection state entirely (named provider wins even when only the OTHER is connected)", () => {
    const v = evaluateProviderChoice(OUTLOOK_TRIGGER, {
      texts: ["when an email arrives in Outlook"],
      connectedProviders: ["gmail"],
    });
    expect(v).toEqual({ justified: true, rule: "explicit" });
  });

  it("ORDER INDEPENDENCE — reversed candidate AND connection order yields identical verdicts and identical sorted options", () => {
    const forward = evaluateProviderChoice(
      EMAIL_TRIGGER,
      { texts: ["when I receive an email"], connectedProviders: ["gmail", "slack"] },
      ["gmail", "microsoft-outlook"],
    );
    const reversed = evaluateProviderChoice(
      EMAIL_TRIGGER,
      { texts: ["when I receive an email"], connectedProviders: ["slack", "gmail"] },
      ["microsoft-outlook", "gmail"],
    );
    expect(forward).toEqual(reversed);
    if (forward.justified || reversed.justified) throw new Error("expected ambiguity");
    expect(forward.clarification.options).toEqual(reversed.clarification.options);
    // Options are label-sorted — never registry / connection order.
    const labels = forward.clarification.options.map((o) => o.label);
    expect(labels).toEqual([...labels].sort((a, b) => a.localeCompare(b)));
  });
});

describe("findProviderAmbiguity", () => {
  it("returns the FIRST ambiguous choice, skipping justified (native) nodes", () => {
    const generic = findProviderAmbiguity(
      [
        { provider: "native", type: "manual.run", kind: "trigger" },
        EMAIL_TRIGGER,
        { provider: "slack", type: "send_channel_message", kind: "action" },
      ],
      { texts: ["when I receive an email, post it to Slack"] },
    );
    expect(generic.clarification).not.toBeNull();
    expect(generic.clarification!.kind).toBe("trigger");
  });

  it("a sole CONNECTED provider no longer passes silently — it now produces the question (no notice channel)", () => {
    const result = findProviderAmbiguity([OUTLOOK_TRIGGER], {
      texts: ["when I receive an email"],
      connectedProviders: ["microsoft-outlook"],
    });
    expect(result.clarification).not.toBeNull();
    expect(result.clarification!.question).toContain("Microsoft Outlook is already connected");
    expect(result).not.toHaveProperty("notices");
  });
});
