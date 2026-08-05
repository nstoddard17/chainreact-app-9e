/** @jest-environment node */
/**
 * DEV-CONNECTION-TRANSPLANT-UTILITY-1 — config-file contract: non-secret
 * selection data only, unknown keys refused, typed owner confirmation
 * validated verbatim.
 */
import { parseConfig } from "@/scripts/integrations-transplant/config";
import {
  expectedOwnerConfirmation,
  TransplantRefusalError,
} from "@/scripts/integrations-transplant/types";
import {
  DEST_ACCOUNT_ID,
  DEST_USER_ID,
  DEV_REF,
  PROD_REF,
  SOURCE_ACCOUNT_ID,
} from "./helpers";

function baseConfigObject(): Record<string, unknown> {
  return {
    sourceProjectRef: PROD_REF,
    destProjectRef: DEV_REF,
    sourceAccountId: SOURCE_ACCOUNT_ID,
    destAccountId: DEST_ACCOUNT_ID,
    destConnectedByUserId: DEST_USER_ID,
    providerAllowlist: ["gmail"],
    conflictStrategy: "fail",
    verificationMode: "strict",
    ownerConfirmation: expectedOwnerConfirmation({
      sourceAccountId: SOURCE_ACCOUNT_ID,
      destAccountId: DEST_ACCOUNT_ID,
    }),
  };
}

function expectCode(raw: unknown, code: string): void {
  let caught: unknown;
  try {
    parseConfig(JSON.stringify(raw));
  } catch (err) {
    caught = err;
  }
  expect(caught).toBeInstanceOf(TransplantRefusalError);
  expect((caught as TransplantRefusalError).code).toBe(code);
}

describe("parseConfig", () => {
  it("accepts a fully valid config", () => {
    const cfg = parseConfig(JSON.stringify(baseConfigObject()));
    expect(cfg.providerAllowlist).toEqual(["gmail"]);
    expect(cfg.conflictStrategy).toBe("fail");
  });

  it("refuses unknown keys (typos cannot relax safety fields)", () => {
    expectCode({ ...baseConfigObject(), conflictStratgy: "replace" }, "config_invalid");
  });

  it("refuses secret-shaped keys and implausibly long values", () => {
    expectCode({ ...baseConfigObject(), sourceIntegrationIds: ["a".repeat(300)] }, "config_invalid");
  });

  it("requires a non-empty provider allowlist", () => {
    expectCode({ ...baseConfigObject(), providerAllowlist: [] }, "config_invalid");
  });

  it("defaulting is impossible: conflictStrategy must be explicit and valid", () => {
    const { conflictStrategy: _omit, ...rest } = baseConfigObject();
    expectCode(rest, "config_invalid");
    expectCode({ ...baseConfigObject(), conflictStrategy: "replace" }, "config_invalid");
  });

  it("refuses a wrong or missing owner confirmation verbatim", () => {
    expectCode(
      { ...baseConfigObject(), ownerConfirmation: "yes please" },
      "owner_confirmation_missing_or_wrong",
    );
    const { ownerConfirmation: _omit, ...rest } = baseConfigObject();
    expectCode(rest, "config_invalid");
  });

  it("validates uuid / ref shapes", () => {
    expectCode({ ...baseConfigObject(), sourceAccountId: "not-a-uuid" }, "config_invalid");
    expectCode({ ...baseConfigObject(), destProjectRef: "SHORT" }, "config_invalid");
  });
});
