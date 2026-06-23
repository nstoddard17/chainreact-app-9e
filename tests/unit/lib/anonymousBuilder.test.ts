/**
 * ANON-BUILDER-1 — sessionStorage prompt handoff helpers.
 *
 * Covers: set/read/consume/clear round-trip, trim + length bound, empty clears,
 * and that nothing throws when storage is unavailable.
 */
import {
  ANON_PROMPT_MAX_LENGTH,
  clearAnonPrompt,
  consumeAnonPrompt,
  readAnonPrompt,
  setAnonPrompt,
} from "@/lib/anonymousBuilder";

beforeEach(() => {
  window.sessionStorage.clear();
});

describe("anonymousBuilder prompt handoff", () => {
  it("stores and reads back a prompt", () => {
    setAnonPrompt("Email me my Shopify sales each morning");
    expect(readAnonPrompt()).toBe("Email me my Shopify sales each morning");
  });

  it("trims whitespace before storing", () => {
    setAnonPrompt("   ping #wins on a 5-star review   ");
    expect(readAnonPrompt()).toBe("ping #wins on a 5-star review");
  });

  it("an empty / whitespace-only prompt clears any stored value", () => {
    setAnonPrompt("something");
    setAnonPrompt("   ");
    expect(readAnonPrompt()).toBe("");
  });

  it("bounds the stored length", () => {
    setAnonPrompt("x".repeat(ANON_PROMPT_MAX_LENGTH + 500));
    expect(readAnonPrompt().length).toBe(ANON_PROMPT_MAX_LENGTH);
  });

  it("consume reads then clears (one-shot)", () => {
    setAnonPrompt("build me a thing");
    expect(consumeAnonPrompt()).toBe("build me a thing");
    expect(readAnonPrompt()).toBe("");
  });

  it("clear removes the stored prompt", () => {
    setAnonPrompt("build me a thing");
    clearAnonPrompt();
    expect(readAnonPrompt()).toBe("");
  });

  it("reading when nothing is stored returns empty string", () => {
    expect(readAnonPrompt()).toBe("");
    expect(consumeAnonPrompt()).toBe("");
  });
});
