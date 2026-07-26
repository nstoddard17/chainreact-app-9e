/**
 * @jest-environment node
 *
 * User-facing copy for guidance failures (REACT-AGENT-PRODUCTION-TIMEOUT-1 / -RETRY-BACKOFF-1).
 *
 * The rail renders whatever `safeErrorMessage` returns, so this is the one place that decides which
 * server codes are allowed to speak to the user in their own words and which collapse to the
 * deliberately opaque outage line. Getting this wrong is how a slow-but-healthy assistant came to
 * read as a dead one in production.
 */

import { safeErrorMessage, UNAVAILABLE_MESSAGE } from "@/features/workflows/guidancePanelShared";

describe("safeErrorMessage — actionable codes speak, everything else stays opaque", () => {
  it("(#19) GUIDANCE_TIMEOUT keeps its server copy, which tells the user to retry manually", () => {
    const message = "That took longer than the assistant could work on it. Try again, or ask for one smaller change at a time.";
    const rendered = safeErrorMessage({ code: "GUIDANCE_TIMEOUT", message });
    expect(rendered).toBe(message);
    // The manual-retry affordance IS this instruction plus the always-present composer: the user
    // resubmits. Nothing here auto-retries a timeout.
    expect(rendered).toMatch(/try again/i);
  });

  it("credit exhaustion keeps its specific, actionable copy", () => {
    const message = "You're out of AI credits for this billing period.";
    expect(safeErrorMessage({ code: "AI_CREDITS_EXHAUSTED", message })).toBe(message);
  });

  // REACT-AGENT-PREVIEW-FIRST-SERVER-ENFORCEMENT-1 — the typed no-plan failure carries its own
  // retry instruction; collapsing it to the outage copy would wrongly imply the assistant is down.
  it("PREVIEW_PLAN_MISSING keeps its retry copy (nothing changed; re-send retries)", () => {
    const message =
      "I understood the workflow you want, but couldn't produce the preview this time. Nothing was changed — send the request again and I'll build the preview with the remaining choices as setup fields.";
    const rendered = safeErrorMessage({ code: "PREVIEW_PLAN_MISSING", message });
    expect(rendered).toBe(message);
    expect(rendered).toMatch(/send the request again/i);
  });

  it.each([
    ["GUIDANCE_UNAVAILABLE", "Workflow guidance isn't available right now."],
    ["GUIDANCE_CANCELLED", "The request was cancelled."],
    ["SOMETHING_NEW", "raw internal detail that must never render"],
  ])("%s collapses to the opaque outage copy", (code, message) => {
    expect(safeErrorMessage({ code, message })).toBe(UNAVAILABLE_MESSAGE);
  });

  it("a null result (transport-level failure) is opaque too", () => {
    expect(safeErrorMessage(null)).toBe(UNAVAILABLE_MESSAGE);
  });
});
