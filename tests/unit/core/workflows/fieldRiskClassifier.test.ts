/** @jest-environment node */
/**
 * classifyFieldRisk — deterministic, conservative high-risk classification of one changed config
 * field for the React Agent preview rail (REACT-AGENT-PREVIEW-FIELD-REASONS).
 *
 * These tests protect: declarative metadata sensitivity wins; conservative key-name heuristics cover
 * the clear recipient / connection / action-effect / secret cases when metadata is absent; a trigger
 * field change is always flagged; and cosmetic fields return null so the rail stays quiet. The
 * classifier reads only the key name / sensitivity / secret flag / node kind — never a value.
 */
import { classifyFieldRisk, fieldRiskPhrase } from "@/core/workflows/fieldRiskClassifier";

describe("classifyFieldRisk (REACT-AGENT-PREVIEW-FIELD-REASONS)", () => {
  it("honors declarative metadata sensitivity ahead of heuristics", () => {
    expect(classifyFieldRisk({ name: "anything", secret: false, sensitivity: "recipient" })).toBe("recipient");
    expect(classifyFieldRisk({ name: "anything", secret: true, sensitivity: "connection" })).toBe("connection");
    expect(classifyFieldRisk({ name: "anything", secret: true, sensitivity: "secret" })).toBe("secret");
  });

  it("flags recipient/destination fields by conservative key name", () => {
    for (const name of ["to", "cc", "bcc", "channel", "recipients", "attendees", "webhookUrl", "destinationFolder"]) {
      expect(classifyFieldRisk({ name, secret: false })).toBe("recipient");
    }
  });

  it("flags secret / connection / action-effect fields by key name when metadata is absent", () => {
    expect(classifyFieldRisk({ name: "apiKey", secret: false })).toBe("secret");
    expect(classifyFieldRisk({ name: "accessToken", secret: false })).toBe("secret");
    expect(classifyFieldRisk({ name: "field", secret: true })).toBe("secret"); // diff redaction flag
    expect(classifyFieldRisk({ name: "connectionId", secret: false })).toBe("connection");
    expect(classifyFieldRisk({ name: "integration", secret: false })).toBe("connection");
    expect(classifyFieldRisk({ name: "publish", secret: false })).toBe("action_effect");
    expect(classifyFieldRisk({ name: "sendNotification", secret: false })).toBe("action_effect");
  });

  it("flags ANY field on a trigger as trigger_config", () => {
    expect(classifyFieldRisk({ name: "labelFilter", secret: false, nodeKind: "trigger" })).toBe("trigger_config");
  });

  it("returns null for cosmetic fields on an action (no noise)", () => {
    for (const name of ["subject", "message", "body", "name", "title", "note", "color"]) {
      expect(classifyFieldRisk({ name, secret: false, nodeKind: "action" })).toBeNull();
    }
  });

  it("does not misclassify innocuous look-alikes", () => {
    // "oauth" is a single token, not the secret WORD "auth".
    expect(classifyFieldRisk({ name: "oauthLabel", secret: false })).toBeNull();
    // A bare "subject" recipient-less field stays null.
    expect(classifyFieldRisk({ name: "subject", secret: false })).toBeNull();
  });

  it("exposes a fixed, value-free phrase per category", () => {
    expect(fieldRiskPhrase("recipient")).toBe("controls where this sends");
    expect(fieldRiskPhrase("connection")).toBe("changes the connected account");
    expect(fieldRiskPhrase("secret")).toBe("credential or auth material");
    expect(fieldRiskPhrase("action_effect")).toBe("affects what this action does");
    expect(fieldRiskPhrase("trigger_config")).toBe("affects when this runs");
  });
});
