/**
 * @jest-environment node
 *
 * REACT-AGENT-TIMEOUT-FALLBACK-RELIABILITY-1 — local recovery of a gateway TIMEOUT. Runs against
 * the REAL provider registry (no mocks). The contract: recovery synthesizes a skeletal plan ONLY
 * for a NEW-workflow turn whose preview-first classification and registry match are both
 * unambiguous; everything else returns null so the typed GUIDANCE_TIMEOUT stands.
 */
import {
  recoverGuidanceTimeoutWithFallback,
  TIMEOUT_FALLBACK_LEAD_IN,
} from "@/services/ai-guidance/previewFirst/recoverTimeoutFallback";
import { GUIDANCE_LOCAL_RESERVE_MS } from "@/services/ai-guidance/gateway/gatewayConfig";

const PRODUCTION_PROMPT =
  "When someone submits our Typeform contact form, add them to Mailchimp, create a HubSpot " +
  "contact, and send me a Gmail message summarizing their answers. Use the submitted email, " +
  "first name, last name, company, and message wherever appropriate.";

let infoSpy: jest.SpyInstance;
beforeEach(() => {
  infoSpy = jest.spyOn(console, "info").mockImplementation(() => {});
});
afterEach(() => infoSpy.mockRestore());

describe("recoverGuidanceTimeoutWithFallback", () => {
  it("recovers the production prompt: honest timeout lead-in + the four-node skeletal plan", () => {
    const r = recoverGuidanceTimeoutWithFallback({
      safeGoalText: PRODUCTION_PROMPT,
      editing: false,
      requestId: "req-1",
      elapsedMs: 45_012,
    });
    expect(r).not.toBeNull();
    expect(r!.guidanceText).toBe(TIMEOUT_FALLBACK_LEAD_IN);
    expect(r!.workflowPlan.steps.map((s) => `${s.provider}:${s.type}`)).toEqual([
      "typeform:new_response_in_form",
      "mailchimp:add_subscriber",
      "hubspot:create_contact",
      "gmail:send_email",
    ]);
    expect(r!.workflowPlan.notApplied).toBe(true);
  });

  it("declines an editing turn — the edit pipeline owns edits, timeout or not", () => {
    expect(
      recoverGuidanceTimeoutWithFallback({
        safeGoalText: PRODUCTION_PROMPT,
        editing: true,
        requestId: "req-2",
        elapsedMs: 45_000,
      }),
    ).toBeNull();
  });

  it("declines when classification is not preview-expected (no named providers)", () => {
    expect(
      recoverGuidanceTimeoutWithFallback({
        safeGoalText: "When I get an email, save it somewhere",
        editing: false,
        requestId: "req-3",
        elapsedMs: 45_000,
      }),
    ).toBeNull();
  });

  it("declines when the registry match is ambiguous — never guesses under a timeout", () => {
    expect(
      recoverGuidanceTimeoutWithFallback({
        safeGoalText: "When a Typeform response arrives, add a note and a tag in Mailchimp",
        editing: false,
        requestId: "req-4",
        elapsedMs: 45_000,
      }),
    ).toBeNull();
  });

  it("logs one SAFE decision line per attempt — enums/counts only, never the goal text", () => {
    recoverGuidanceTimeoutWithFallback({
      safeGoalText: PRODUCTION_PROMPT,
      editing: false,
      requestId: "req-5",
      elapsedMs: 45_000,
    });
    expect(infoSpy).toHaveBeenCalledTimes(1);
    const line = String(infoSpy.mock.calls[0]![0]);
    expect(line).toContain("timeout_fallback requestId=req-5");
    expect(line).toContain("fallbackUsed=true");
    expect(line).toMatch(/namedProviders=4/);
    expect(line).not.toContain("Typeform contact form"); // no goal text
  });

  it("(#8) completes well inside the reserved local budget — it is registry-only work", () => {
    const start = performance.now();
    recoverGuidanceTimeoutWithFallback({
      safeGoalText: PRODUCTION_PROMPT,
      editing: false,
      requestId: "req-6",
      elapsedMs: 45_000,
    });
    const elapsed = performance.now() - start;
    expect(elapsed).toBeLessThan(GUIDANCE_LOCAL_RESERVE_MS);
    expect(elapsed).toBeLessThan(500); // realistically sub-ms; 500ms is a generous CI bound
  });
});
