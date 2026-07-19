/**
 * Provider-selection guard decision table (REACT-PROVIDER-AMBIGUITY-1).
 *
 * Runs against the REAL registry (gmail + microsoft-outlook are simultaneous email-trigger
 * candidates). Pins every row of the documented decision table and the order-independence
 * guarantee (no first-match behavior; candidate ordering can never change the verdict).
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

  it("sole-connected narrowing justifies ONLY the connected candidate — a different pick still clarifies (no substitution)", () => {
    const connectedOutlookOnly = {
      texts: ["when I receive an email"],
      connectedProviders: ["microsoft-outlook", "slack"],
    };
    expect(evaluateProviderChoice(OUTLOOK_TRIGGER, connectedOutlookOnly)).toEqual({
      justified: true,
      rule: "sole-connected",
    });
    // The model picked gmail while only Outlook is connected → clarify, never substitute.
    expect(evaluateProviderChoice(EMAIL_TRIGGER, connectedOutlookOnly).justified).toBe(false);
  });

  it("BOTH candidates connected → still ambiguous (connected narrowing needs exactly one)", () => {
    const v = evaluateProviderChoice(EMAIL_TRIGGER, {
      texts: ["when I receive an email"],
      connectedProviders: ["gmail", "microsoft-outlook"],
    });
    expect(v.justified).toBe(false);
  });

  it("zero connected candidates → ambiguous (never defaults to Gmail)", () => {
    const v = evaluateProviderChoice(EMAIL_TRIGGER, { texts: ["when I receive an email"], connectedProviders: [] });
    expect(v.justified).toBe(false);
  });

  it("sole-registered candidate is justified (documented rule; visible via the preview's provider label)", () => {
    // Simulated via the candidates override: pretend gmail were the only registered email provider.
    const v = evaluateProviderChoice(EMAIL_TRIGGER, { texts: ["when I receive an email"] }, ["gmail"]);
    expect(v).toEqual({ justified: true, rule: "sole-registered" });
  });

  it("ORDER INDEPENDENCE — reversed/shuffled candidate order yields the identical verdict and identical sorted options", () => {
    const ctx = { texts: ["when I receive an email"] };
    const forward = evaluateProviderChoice(EMAIL_TRIGGER, ctx, ["gmail", "microsoft-outlook"]);
    const reversed = evaluateProviderChoice(EMAIL_TRIGGER, ctx, ["microsoft-outlook", "gmail"]);
    expect(forward).toEqual(reversed);
    if (forward.justified || reversed.justified) throw new Error("expected ambiguity");
    expect(forward.clarification.options).toEqual(reversed.clarification.options);
    // Options are label-sorted — never registry order.
    const labels = forward.clarification.options.map((o) => o.label);
    expect(labels).toEqual([...labels].sort((a, b) => a.localeCompare(b)));
  });
});

describe("findProviderAmbiguity", () => {
  it("returns the FIRST ambiguous choice and no notices; justified sets pass with sole-connected notices", () => {
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

    const narrowed = findProviderAmbiguity([OUTLOOK_TRIGGER], {
      texts: ["when I receive an email"],
      connectedProviders: ["microsoft-outlook"],
    });
    expect(narrowed.clarification).toBeNull();
    expect(narrowed.notices.join(" ")).toContain("Microsoft Outlook");
  });
});
