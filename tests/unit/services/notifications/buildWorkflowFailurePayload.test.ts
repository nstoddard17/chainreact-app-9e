/** @jest-environment node */
/**
 * Tests for services/notifications/buildWorkflowFailurePayload.ts.
 *
 * Pure function — no mocks needed. Covers the CTA URL routing per
 * humanizer action and the payload field passthrough that all channels
 * downstream rely on.
 */
import {
  buildWorkflowFailurePayload,
  buildPlainTextBody,
} from "@/services/notifications/buildWorkflowFailurePayload";
import {
  GENERIC_ACTION_ERROR_TITLE,
  type HumanizedError,
} from "@/core/errors/humanizeActionError";

const baseInput = {
  workflowId: "wf-1",
  workflowName: "Daily Standup Reminder",
  runId: "run-1",
};

function makeErr(overrides: Partial<HumanizedError> = {}): HumanizedError {
  return {
    title: "Workflow step failed",
    description: "Something went wrong.",
    severity: "error",
    ...overrides,
  };
}

describe("buildWorkflowFailurePayload — passthrough", () => {
  it("passes workflow + run identifiers + classification through unchanged", () => {
    const errorClassification = makeErr();
    const payload = buildWorkflowFailurePayload({
      ...baseInput,
      errorClassification,
    });
    expect(payload.workflowId).toBe("wf-1");
    expect(payload.workflowName).toBe("Daily Standup Reminder");
    expect(payload.runId).toBe("run-1");
    expect(payload.errorClassification).toBe(errorClassification);
  });

  it("is deterministic for the same input (pure function contract)", () => {
    const errorClassification = makeErr();
    const a = buildWorkflowFailurePayload({ ...baseInput, errorClassification });
    const b = buildWorkflowFailurePayload({ ...baseInput, errorClassification });
    expect(a).toEqual(b);
  });
});

describe("buildWorkflowFailurePayload — CTA URL routing per humanizer action", () => {
  it("action='reconnect' → /apps + 'Reconnect' label (Slice 4.APPS-PAGE-1 — repointed from legacy /integrations)", () => {
    const payload = buildWorkflowFailurePayload({
      ...baseInput,
      errorClassification: makeErr({ action: "reconnect" }),
    });
    expect(payload.ctaUrl).toBe("/apps");
    expect(payload.ctaLabel).toBe("Reconnect");
  });

  // TEST-SUITE-GREEN-1 — was pinned to "/subscription", which is not a route in
  // V2: there is no app/subscription page, and the canonical mapping in
  // core/errors/failedRunCta.ts sends upgrade_plan to /account (the billing /
  // plan surface), as do the Runs row and the builder run-detail. The product
  // was right and this expectation was the last "/subscription" string in the
  // codebase — a stale link would have sent a billing-blocked user to a 404.
  it("action='upgrade_plan' → /account + 'Upgrade plan' label", () => {
    const payload = buildWorkflowFailurePayload({
      ...baseInput,
      errorClassification: makeErr({ action: "upgrade_plan" }),
    });
    expect(payload.ctaUrl).toBe("/account");
    expect(payload.ctaLabel).toBe("Upgrade plan");
  });

  it("action='open_node' → workflow detail with run highlighted + 'View workflow' label", () => {
    const payload = buildWorkflowFailurePayload({
      ...baseInput,
      errorClassification: makeErr({ action: "open_node" }),
    });
    expect(payload.ctaUrl).toBe("/workflows/wf-1?historyRun=run-1");
    expect(payload.ctaLabel).toBe("View workflow");
  });

  it("action=undefined → run-history fallback (matches V1's null-action behavior)", () => {
    const payload = buildWorkflowFailurePayload({
      ...baseInput,
      errorClassification: makeErr({ action: undefined }),
    });
    expect(payload.ctaUrl).toBe("/workflows/wf-1?historyRun=run-1");
    expect(payload.ctaLabel).toBe("View run");
  });

  it("CTA URL embeds the actual workflow + run ids (not hardcoded)", () => {
    const payload = buildWorkflowFailurePayload({
      workflowId: "wf-abc-123",
      workflowName: "x",
      runId: "run-xyz-789",
      errorClassification: makeErr({ action: "open_node" }),
    });
    expect(payload.ctaUrl).toBe("/workflows/wf-abc-123?historyRun=run-xyz-789");
  });
});

describe("buildPlainTextBody", () => {
  it("inlines hint after description when hint is present", () => {
    const body = buildPlainTextBody({
      title: "x",
      description: "Slack rejected the bot token.",
      hint: "Reconnect Slack on the integrations page.",
      severity: "error",
      action: "reconnect",
    });
    expect(body).toBe(
      "Slack rejected the bot token. Reconnect Slack on the integrations page.",
    );
  });

  it("returns just the description when no hint is present", () => {
    const body = buildPlainTextBody({
      title: "x",
      description: "The workflow was deleted while a webhook event was waiting.",
      severity: "warning",
    });
    expect(body).toBe(
      "The workflow was deleted while a webhook event was waiting.",
    );
  });

  // V2-READY-8: the generic humanizer fallback is the ONE branch whose
  // description echoes the raw thrown handler message. The body builder must
  // surface the safe generic title instead — mirroring run-detail's
  // toSafeStepError — so the notification feed never leaks identifiers the
  // run-detail endpoint already strips.
  it("redacts the generic-fallback body: a raw handler message with ids/email/token/scope/JSON surfaces only the safe title", () => {
    const body = buildPlainTextBody({
      title: GENERIC_ACTION_ERROR_TITLE,
      description:
        "Integration action required: refresh_failed (account=acc-uuid-123, " +
        "provider=gmail, provider-account=victim@example.com). " +
        'token=ya29.FAKE scope=gmail.send {"error":"invalid_grant"}',
      severity: "error",
    });
    expect(body).toBe(GENERIC_ACTION_ERROR_TITLE);
    expect(body).not.toMatch(
      /acc-uuid-123|victim@example\.com|provider-account|ya29|gmail\.send|invalid_grant/i,
    );
  });

  it("does NOT redact typed classifications: a non-generic title keeps its useful description + hint", () => {
    const body = buildPlainTextBody({
      title: "Slack needs to be reconnected",
      description: "Slack rejected the bot token.",
      hint: "Reconnect Slack in Apps.",
      severity: "error",
      action: "reconnect",
    });
    expect(body).toBe("Slack rejected the bot token. Reconnect Slack in Apps.");
  });
});
