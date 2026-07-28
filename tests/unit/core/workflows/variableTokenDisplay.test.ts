/**
 * REACT-AGENT-FRIENDLY-VARIABLE-DISPLAY-1 — friendly rendering of `{{nodeId.path}}` tokens.
 *
 * The contract these tests pin down is a no-leak one as much as a cosmetic one: a raw node id must
 * never reach a label, and an unresolvable source degrades to a neutral phrase rather than exposing
 * the id it could not resolve.
 */

import {
  containsVariableToken,
  describeVariableToken,
  humanizeVariableTokens,
} from "@/core/workflows/variables/variableTokenDisplay";

describe("describeVariableToken", () => {
  it("renders the trigger alias as 'Trigger → path'", () => {
    const d = describeVariableToken("{{trigger.customer.email}}");
    expect(d.text).toBe("Trigger → customer.email");
    expect(d.sourceLabel).toBe("Trigger");
    expect(d.path).toBe("customer.email");
    expect(d.resolved).toBe(true);
    // The raw token is still carried for copy / a show-token affordance — just not as the label.
    expect(d.token).toBe("{{trigger.customer.email}}");
  });

  it("prefers a supplied label for the trigger alias over the generic word", () => {
    const d = describeVariableToken("{{trigger.id}}", { trigger: "Stripe Event Received" });
    expect(d.text).toBe("Stripe Event Received → id");
  });

  it("names an upstream node by its supplied label", () => {
    const d = describeVariableToken("{{n_4f2a.messageId}}", { n_4f2a: "Send Channel Message" });
    expect(d.text).toBe("Send Channel Message → messageId");
    expect(d.resolved).toBe(true);
  });

  it("degrades an unknown source to 'Earlier step' and NEVER to the raw node id", () => {
    const d = describeVariableToken("{{n_deadbeef.id}}");
    expect(d.text).toBe("Earlier step → id");
    expect(d.sourceLabel).toBe("Earlier step");
    expect(d.text).not.toContain("n_deadbeef");
    expect(d.resolved).toBe(false);
  });

  it("renders a whole-node reference as just the source, with no dangling arrow", () => {
    const d = describeVariableToken("{{trigger}}");
    expect(d.text).toBe("Trigger");
    expect(d.path).toBe("");
  });

  it("echoes a non-reference string unchanged rather than inventing a label", () => {
    const d = describeVariableToken("not a token");
    expect(d.text).toBe("not a token");
    expect(d.resolved).toBe(false);
  });

  it("preserves bracket-index paths exactly as written", () => {
    expect(describeVariableToken("{{trigger.items[0].sku}}").text).toBe("Trigger → items[0].sku");
  });
});

describe("humanizeVariableTokens", () => {
  it("substitutes a reference inline and leaves the surrounding text untouched", () => {
    expect(humanizeVariableTokens("New order from {{trigger.customer.name}}!")).toBe(
      "New order from Trigger → customer.name!",
    );
  });

  it("substitutes every reference in a multi-variable string", () => {
    expect(
      humanizeVariableTokens("{{trigger.id}} paid {{n_1.amount}}", { n_1: "Create Invoice" }),
    ).toBe("Trigger → id paid Create Invoice → amount");
  });

  it("returns a string with no references unchanged", () => {
    expect(humanizeVariableTokens("plain text")).toBe("plain text");
  });

  it("leaves a malformed token verbatim instead of mangling it", () => {
    // The parser skips `{{}}` (no node id), so nothing is substituted.
    expect(humanizeVariableTokens("a {{}} b")).toBe("a {{}} b");
  });

  it("does not rewrite AI_FIELD tokens (an agent construct, not an author reference)", () => {
    expect(humanizeVariableTokens("{{AI_FIELD:subject}}")).toBe("{{AI_FIELD:subject}}");
  });

  it("stringifies a non-string value without throwing", () => {
    expect(humanizeVariableTokens(42)).toBe("42");
    expect(humanizeVariableTokens(true)).toBe("true");
  });
});

describe("containsVariableToken", () => {
  it("detects a real reference and ignores non-references", () => {
    expect(containsVariableToken("hi {{trigger.a}}")).toBe(true);
    expect(containsVariableToken("hi")).toBe(false);
    expect(containsVariableToken(undefined)).toBe(false);
    expect(containsVariableToken("{{AI_FIELD:x}}")).toBe(false);
  });
});
