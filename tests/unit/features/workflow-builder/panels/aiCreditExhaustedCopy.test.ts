/**
 * BUILDER-AI-CREDIT-UX-POLISH-1 — the AI-credit-exhausted copy must be friendly AND
 * leak-free, and the diagnosis/repair failure mappers must never surface a raw gate
 * code / model / server message. These are pure-string assertions (no DOM).
 */
import { AI_CREDITS_EXHAUSTED_MESSAGE } from "@/lib/api/ai";
import {
  diagnosisQaFailureMessage,
  repairPreviewFailureMessage,
} from "@/features/workflow-builder/panels/_BuilderAiPanelDiagnosisMessages";

describe("AI_CREDITS_EXHAUSTED_MESSAGE — friendly + safe copy", () => {
  it("clearly says the account is out of AI credits", () => {
    expect(AI_CREDITS_EXHAUSTED_MESSAGE).toMatch(/AI credits/i);
    expect(AI_CREDITS_EXHAUSTED_MESSAGE).toMatch(/out of|used all|no .*credits/i);
  });

  it("reassures that deterministic checks still work for free", () => {
    expect(AI_CREDITS_EXHAUSTED_MESSAGE).toMatch(/check workflow/i);
    expect(AI_CREDITS_EXHAUSTED_MESSAGE).toMatch(/free/i);
  });

  it("names a path to billing/account usage", () => {
    expect(AI_CREDITS_EXHAUSTED_MESSAGE).toMatch(/account settings|plan & billing/i);
  });

  it("never leaks raw HTTP status, gate codes, or internals", () => {
    expect(AI_CREDITS_EXHAUSTED_MESSAGE).not.toContain("402");
    expect(AI_CREDITS_EXHAUSTED_MESSAGE).not.toContain("AI_CREDITS_EXHAUSTED");
    expect(AI_CREDITS_EXHAUSTED_MESSAGE).not.toMatch(/gate|stack|undefined|null|account[_ ]?id/i);
  });
});

describe("diagnosisQaFailureMessage — safe code mapping (defense in depth)", () => {
  it("maps AI_CREDITS_EXHAUSTED to the shared friendly message", () => {
    expect(diagnosisQaFailureMessage("AI_CREDITS_EXHAUSTED")).toBe(AI_CREDITS_EXHAUSTED_MESSAGE);
  });

  it("maps pending-deletion to a fixed account line", () => {
    expect(diagnosisQaFailureMessage("ACCOUNT_PENDING_DELETION")).toMatch(/pending deletion/i);
  });

  it("collapses model/gate/unknown codes to one generic retry line — never echoing the code", () => {
    for (const code of ["MODEL_FAILED", "AI_GATE_ERROR", "PARSE_FAILED", "something_weird"]) {
      const msg = diagnosisQaFailureMessage(code);
      expect(msg).toMatch(/try again/i);
      expect(msg).not.toContain(code);
    }
  });
});

describe("repairPreviewFailureMessage — exhausted maps to shared message, no raw leak", () => {
  it("uses the shared exhausted copy, not the raw server message", () => {
    const out = repairPreviewFailureMessage({
      ok: false,
      code: "AI_CREDITS_EXHAUSTED",
      message: "RAW: account 123 over ai_credits_limit (gate)",
    });
    expect(out).toBe(AI_CREDITS_EXHAUSTED_MESSAGE);
    expect(out).not.toMatch(/RAW|gate|ai_credits_limit|123/);
  });
});
