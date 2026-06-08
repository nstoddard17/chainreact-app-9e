/**
 * @jest-environment node
 *
 * Workflow portability / templates rollout flags (CS-XT-1). Both DEFAULT OFF, true ONLY when the
 * env var is exactly "true" (not "1"/"TRUE"/"yes"), read at call time, and independent of each
 * other.
 */
import {
  EXPORT_TIER_GATING_FLAG,
  WORKFLOW_TEMPLATES_FLAG,
  isExportTierGatingEnabled,
  isWorkflowTemplatesEnabled,
} from "@/services/workflows/portabilityFlags";

const ORIGINAL_EXPORT = process.env[EXPORT_TIER_GATING_FLAG];
const ORIGINAL_TEMPLATES = process.env[WORKFLOW_TEMPLATES_FLAG];

afterEach(() => {
  if (ORIGINAL_EXPORT === undefined) delete process.env[EXPORT_TIER_GATING_FLAG];
  else process.env[EXPORT_TIER_GATING_FLAG] = ORIGINAL_EXPORT;
  if (ORIGINAL_TEMPLATES === undefined) delete process.env[WORKFLOW_TEMPLATES_FLAG];
  else process.env[WORKFLOW_TEMPLATES_FLAG] = ORIGINAL_TEMPLATES;
});

describe("isExportTierGatingEnabled", () => {
  it("defaults to false when unset", () => {
    delete process.env[EXPORT_TIER_GATING_FLAG];
    expect(isExportTierGatingEnabled()).toBe(false);
  });

  it("is true only when the env var is exactly 'true'", () => {
    process.env[EXPORT_TIER_GATING_FLAG] = "true";
    expect(isExportTierGatingEnabled()).toBe(true);
  });

  it.each(["1", "TRUE", "True", "yes", "on", "", "false"])(
    "is false for non-canonical value %p",
    (val) => {
      process.env[EXPORT_TIER_GATING_FLAG] = val;
      expect(isExportTierGatingEnabled()).toBe(false);
    },
  );

  it("is read at call time (toggle without re-import)", () => {
    process.env[EXPORT_TIER_GATING_FLAG] = "true";
    expect(isExportTierGatingEnabled()).toBe(true);
    process.env[EXPORT_TIER_GATING_FLAG] = "false";
    expect(isExportTierGatingEnabled()).toBe(false);
  });
});

describe("isWorkflowTemplatesEnabled", () => {
  it("defaults to false when unset", () => {
    delete process.env[WORKFLOW_TEMPLATES_FLAG];
    expect(isWorkflowTemplatesEnabled()).toBe(false);
  });

  it("is true only when the env var is exactly 'true'", () => {
    process.env[WORKFLOW_TEMPLATES_FLAG] = "true";
    expect(isWorkflowTemplatesEnabled()).toBe(true);
  });

  it.each(["1", "TRUE", "yes", "", "false"])("is false for non-canonical value %p", (val) => {
    process.env[WORKFLOW_TEMPLATES_FLAG] = val;
    expect(isWorkflowTemplatesEnabled()).toBe(false);
  });
});

describe("the two flags are independent", () => {
  it("export gating ON does not turn templates ON", () => {
    delete process.env[WORKFLOW_TEMPLATES_FLAG];
    process.env[EXPORT_TIER_GATING_FLAG] = "true";
    expect(isExportTierGatingEnabled()).toBe(true);
    expect(isWorkflowTemplatesEnabled()).toBe(false);
  });
});
