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
  it("(#19) GUIDANCE_TIMEOUT keeps its server copy, which suggests a smaller request", () => {
    const message =
      "That took longer than the assistant could work on it. Nothing was changed, and no AI credit was used. Try asking for one smaller change at a time.";
    const rendered = safeErrorMessage({ code: "GUIDANCE_TIMEOUT", message });
    expect(rendered).toBe(message);
    // A timeout is genuinely transient, so a narrower re-ask is a real remedy — unlike
    // PREVIEW_PLAN_MISSING below, where re-sending IDENTICAL text is not.
    expect(rendered).toMatch(/smaller/i);
  });

  it("credit exhaustion keeps its specific, actionable copy", () => {
    const message = "You're out of AI credits for this billing period.";
    expect(safeErrorMessage({ code: "AI_CREDITS_EXHAUSTED", message })).toBe(message);
  });

  // REACT-AGENT-PREVIEW-FIRST-SERVER-ENFORCEMENT-1 — the typed no-plan failure speaks in its own
  // words; collapsing it to the outage copy would wrongly imply the assistant is down.
  // REACT-AGENT-FIRST-TURN-1 — and it must NOT ask for an identical resubmission.
  it("PREVIEW_PLAN_MISSING speaks, and never asks for the same request again", () => {
    const message =
      "I understood the workflow, but couldn't create a valid preview. Nothing was changed, and no AI credit was used. Try describing it as a single trigger and one or two steps, naming the apps you want to use.";
    const rendered = safeErrorMessage({ code: "PREVIEW_PLAN_MISSING", message });
    expect(rendered).toBe(message);
    expect(rendered).not.toMatch(/send the request again|resend|try again/i);
    expect(rendered).toMatch(/nothing was changed/i);
    expect(rendered).toMatch(/no AI credit was used/i);
  });

  it("the typed categories stay DISTINCT — one message must not serve for all of them", () => {
    const timeout = "That took longer than the assistant could work on it.";
    const planMissing = "I understood the workflow, but couldn't create a valid preview.";
    const credits = "You've used all AI credits for this billing period.";
    const rendered = [
      safeErrorMessage({ code: "GUIDANCE_TIMEOUT", message: timeout }),
      safeErrorMessage({ code: "PREVIEW_PLAN_MISSING", message: planMissing }),
      safeErrorMessage({ code: "AI_CREDITS_EXHAUSTED", message: credits }),
      safeErrorMessage({ code: "GUIDANCE_UNAVAILABLE", message: "x" }),
    ];
    expect(new Set(rendered).size).toBe(4);
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
