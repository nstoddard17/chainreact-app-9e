/**
 * Two-sided compatibility fixtures for @chainreact/mobile-contracts
 * (MOBILE-COMPANION-M0-CONTRACTS-FOUNDATION-1).
 *
 * Every shipped fixture must parse with its schema (the same files ship in
 * the package and are parsed again in the mobile repo's CI — that pair is the
 * drift alarm). Every negative fixture must FAIL to parse: run output,
 * trigger events, fatal errors, error details, smuggled tokens, and raw
 * integration metadata are rejected structurally, not by convention.
 */
import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import {
  MobileAppConfigSchema,
  MobileSessionSchema,
  MobileWorkflowSummarySchema,
  MobileRunSummarySchema,
  MobileRunDetailSchema,
  MobileRunStepSchema,
  MobileHumanizedErrorSchema,
  MobileIntegrationHealthSummarySchema,
  MobileUsageSummarySchema,
  MobileDeepLinkTargetSchema,
  MobilePushDataSchema,
  MobileConfirmationRequiredDetailSchema,
} from "../../../../packages/mobile-contracts/src/index";

const FIXTURES = resolve(
  __dirname,
  "../../../../packages/mobile-contracts/fixtures/v1",
);

function loadFixture(name: string): unknown {
  return JSON.parse(readFileSync(join(FIXTURES, name), "utf8"));
}

describe("mobile-contracts fixtures — positive (must parse)", () => {
  const cases: Array<[string, { safeParse: (v: unknown) => { success: boolean } }]> = [
    ["app-config.json", MobileAppConfigSchema],
    ["session.json", MobileSessionSchema],
    ["workflow-summary.json", MobileWorkflowSummarySchema],
    ["run-summary-queued.json", MobileRunSummarySchema],
    ["run-summary-failed.json", MobileRunSummarySchema],
    ["run-detail-failed.json", MobileRunDetailSchema],
    ["humanized-error.json", MobileHumanizedErrorSchema],
    ["integration-health.json", MobileIntegrationHealthSummarySchema],
    ["usage-summary.json", MobileUsageSummarySchema],
    ["deep-link-run-detail.json", MobileDeepLinkTargetSchema],
    ["push-workflow-failed.json", MobilePushDataSchema],
    ["confirmation-required.json", MobileConfirmationRequiredDetailSchema],
  ];

  it.each(cases)("%s parses", (name, schema) => {
    const result = schema.safeParse(loadFixture(name));
    expect(result.success).toBe(true);
  });

  it("a queued run parses as non-terminal with nothing finished yet", () => {
    const parsed = MobileRunSummarySchema.parse(loadFixture("run-summary-queued.json"));
    expect(parsed.status).toBe("queued");
    expect(parsed.finishedAt).toBeNull();
    expect(parsed.errorClassification).toBeNull();
  });

  it("a failed run detail carries the humanized explanation and sanitized step errors only", () => {
    const parsed = MobileRunDetailSchema.parse(loadFixture("run-detail-failed.json"));
    expect(parsed.errorClassification?.action).toBe("reconnect");
    const failed = parsed.steps.find((s) => s.status === "failed");
    expect(failed?.error).toEqual({
      code: "INTEGRATION_REAUTH_REQUIRED",
      message: "The Example Chat connection needs to be reconnected.",
    });
    // Structural guarantee, restated as data: no step has an output key.
    for (const step of parsed.steps) {
      expect(Object.keys(step).sort()).toEqual(["displayName", "error", "nodeId", "status"]);
    }
  });
});

describe("mobile-contracts fixtures — negative (must be rejected)", () => {
  const cases: Array<[string, { safeParse: (v: unknown) => { success: boolean } }]> = [
    ["negative/run-detail-with-step-output.json", MobileRunDetailSchema],
    ["negative/run-detail-with-trigger-event.json", MobileRunDetailSchema],
    ["negative/run-detail-with-fatal-error.json", MobileRunDetailSchema],
    ["negative/run-step-error-with-details.json", MobileRunStepSchema],
    ["negative/push-with-token.json", MobilePushDataSchema],
    ["negative/integration-health-with-oauth.json", MobileIntegrationHealthSummarySchema],
  ];

  it.each(cases)("%s is rejected", (name, schema) => {
    const result = schema.safeParse(loadFixture(name));
    expect(result.success).toBe(false);
  });
});

describe("mobile-contracts — hostile nested payloads (constructed, not fixtures)", () => {
  it("rejects a run step smuggling credentials inside the error object", () => {
    const hostile = {
      nodeId: "node-2",
      displayName: "Send channel message",
      status: "failed",
      error: {
        code: "HANDLER_FAILED",
        message: "The step failed.",
        // Renamed/nested variants must still die on .strict().
        oauth: { accessToken: ["FAKE", "TOKEN"].join("-") },
      },
    };
    expect(MobileRunStepSchema.safeParse(hostile).success).toBe(false);
  });

  it("rejects a deep link carrying an extra token-shaped field", () => {
    const hostile = {
      screen: "run-detail",
      accountId: "00000000-0000-4000-8000-0000000000a2",
      workflowId: "00000000-0000-4000-8000-0000000000b1",
      runId: "00000000-0000-4000-8000-0000000000c2",
      sessionToken: ["FAKE", "SESSION"].join("-"),
    };
    expect(MobileDeepLinkTargetSchema.safeParse(hostile).success).toBe(false);
  });

  it("rejects push data whose schema generation is not v1", () => {
    const future = {
      v: 2,
      type: "workflow_failed",
      accountId: "00000000-0000-4000-8000-0000000000a2",
      notificationId: "00000000-0000-4000-8000-0000000000d1",
    };
    expect(MobilePushDataSchema.safeParse(future).success).toBe(false);
  });

  it("rejects an app-config with a non-semver version (no lexical version games)", () => {
    const hostile = {
      apiVersion: "v1",
      minSupportedVersion: "latest",
      latestVersion: "0.1.0",
      forceUpdate: false,
    };
    expect(MobileAppConfigSchema.safeParse(hostile).success).toBe(false);
  });
});
