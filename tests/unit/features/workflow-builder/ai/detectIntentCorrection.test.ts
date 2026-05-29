/**
 * Tests for features/workflow-builder/ai/detectIntentCorrection.ts (Slice 4.AI-35I).
 *
 * Pure-function tests. The detector decides whether the user's latest follow-up
 * is an explicit shape-changing correction (which must force a model re-plan
 * with override context) vs a plain field answer (which may complete
 * deterministically). Tuned for recall — a false positive is harmless (free
 * text already re-plans), a false negative re-introduces the stale-intent bug.
 */
import { detectIntentCorrection } from "@/features/workflow-builder/ai/detectIntentCorrection";

describe("detectIntentCorrection — corrections (should flag)", () => {
  const corrections: ReadonlyArray<[string, string]> = [
    ["This is to a channel", "to-a-channel"],
    ["send to a channel", "to-a-channel"],
    ["post it in a channel", "to-a-channel"],
    ["No, this is a DM but post as a channel message", "to-a-channel"],
    ["not a DM", "not-a-dm"],
    ["this is not a direct message", "not-a-dm"],
    ["I said channel", "i-said"],
    ["I said this is to a channel", "to-a-channel"],
    ["No, use Outlook", "no-contrast"],
    ["No. Use Gmail instead", "no-contrast"],
    ["Actually send an email instead", "actually"],
    ["actually use Outlook", "actually"],
    ["use Gmail rather than Slack", "rather-than"],
    ["change that to a channel message", "change-to"],
    ["switch to a channel message", "switch-to"],
    ["make it manual", "make-it"],
    ["make it a channel", "make-it"],
    ["send a channel message instead of a DM", "instead"],
  ];

  it.each(corrections)("flags %p (signal %p)", (text, signal) => {
    const result = detectIntentCorrection(text);
    expect(result.isCorrection).toBe(true);
    expect(result.signals).toContain(signal);
  });

  it("matches provider corrections without enumerating providers", () => {
    expect(detectIntentCorrection("No, use Outlook").isCorrection).toBe(true);
    expect(detectIntentCorrection("Actually send an email, not Slack").isCorrection).toBe(true);
  });
});

describe("detectIntentCorrection — plain answers (should NOT flag)", () => {
  const plain: readonly string[] = [
    "Hey",
    "#general",
    "Use #general and say Test from ChainReact AI.",
    "Say 'hello'",
    "The message should say good morning",
    "C123456",
    "John Doe",
    "",
    "   ",
    "every morning at 9am",
  ];

  it.each(plain)("does not flag %p", (text) => {
    const result = detectIntentCorrection(text);
    expect(result.isCorrection).toBe(false);
    expect(result.signals).toHaveLength(0);
  });
});

describe("detectIntentCorrection — normalization", () => {
  it("is case-insensitive and whitespace-tolerant", () => {
    expect(detectIntentCorrection("  THIS  IS   TO  A  CHANNEL  ").isCorrection).toBe(true);
    expect(detectIntentCorrection("ACTUALLY use Gmail").signals).toContain("actually");
  });

  it("can return multiple signals", () => {
    const result = detectIntentCorrection("No, I said this is to a channel, not a DM");
    expect(result.isCorrection).toBe(true);
    expect(result.signals).toEqual(
      expect.arrayContaining(["no-contrast", "i-said", "to-a-channel", "not-a-dm"]),
    );
  });
});
