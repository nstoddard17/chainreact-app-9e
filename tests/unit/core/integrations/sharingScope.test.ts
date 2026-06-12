/**
 * @jest-environment node
 *
 * Pure-helper unit tests for explicit connection sharing scope
 * (Slice 4.CONN-SHARE / CS-1). No DB, no I/O — these assert ONLY the pure
 * classification logic. The helpers are behavior-inert in CS-1 (nothing wires
 * them into runtime paths yet).
 */

import {
  effectiveIntegrationSharingScope,
  isProviderShareable,
  isRowShareable,
  INTEGRATION_SHARING_SCOPE_VALUES,
} from "@/core/integrations/sharingScope";

// Representative providers from core/integrations/credentialSharing.ts POLICY.
const PERSONAL = "gmail";
const ACCOUNT = "slack";
const UNKNOWN = "totally-unregistered-provider"; // classifies personal (fail-safe)

describe("CS-1 — effectiveIntegrationSharingScope", () => {
  describe("personal provider", () => {
    it("NULL → private_to_connector (derived default)", () => {
      expect(effectiveIntegrationSharingScope(PERSONAL, null)).toBe("private_to_connector");
    });

    it("undefined → private_to_connector (derived default)", () => {
      expect(effectiveIntegrationSharingScope(PERSONAL, undefined)).toBe("private_to_connector");
    });

    it('"private_to_connector" → private_to_connector', () => {
      expect(effectiveIntegrationSharingScope(PERSONAL, "private_to_connector")).toBe(
        "private_to_connector",
      );
    });

    it('"shared_with_account" → shared_with_account', () => {
      expect(effectiveIntegrationSharingScope(PERSONAL, "shared_with_account")).toBe(
        "shared_with_account",
      );
    });

    it("invalid / unknown value → private_to_connector (fail safe, never widens access)", () => {
      for (const bad of ["", "SHARED_WITH_ACCOUNT", "shared", "public", "true", "1", "null"]) {
        expect(effectiveIntegrationSharingScope(PERSONAL, bad)).toBe("private_to_connector");
      }
    });

    it("unknown provider (fail-safe personal) follows the personal rules", () => {
      expect(effectiveIntegrationSharingScope(UNKNOWN, null)).toBe("private_to_connector");
      expect(effectiveIntegrationSharingScope(UNKNOWN, "shared_with_account")).toBe(
        "shared_with_account",
      );
      expect(effectiveIntegrationSharingScope(UNKNOWN, "garbage")).toBe("private_to_connector");
    });
  });

  describe("account provider (ignores the column — shared by classification)", () => {
    it("NULL → shared_with_account", () => {
      expect(effectiveIntegrationSharingScope(ACCOUNT, null)).toBe("shared_with_account");
    });

    it('"private_to_connector" is IGNORED → still shared_with_account', () => {
      expect(effectiveIntegrationSharingScope(ACCOUNT, "private_to_connector")).toBe(
        "shared_with_account",
      );
    });

    it("invalid value is IGNORED → still shared_with_account", () => {
      expect(effectiveIntegrationSharingScope(ACCOUNT, "garbage")).toBe("shared_with_account");
    });
  });
});

describe("CS-1 — isProviderShareable", () => {
  it("personal providers are shareable through this feature", () => {
    expect(isProviderShareable(PERSONAL)).toBe(true);
    expect(isProviderShareable("microsoft-outlook")).toBe(true);
    expect(isProviderShareable("google-drive")).toBe(true);
  });

  it("account/service providers are NOT shareable through this feature (already account-shared)", () => {
    expect(isProviderShareable(ACCOUNT)).toBe(false);
    expect(isProviderShareable("stripe")).toBe(false);
    expect(isProviderShareable("notion")).toBe(false);
  });

  it("unknown providers classify personal (fail-safe) → shareable", () => {
    expect(isProviderShareable(UNKNOWN)).toBe(true);
  });
});

describe("CS-1 — isRowShareable", () => {
  it("active personal-provider row is shareable", () => {
    expect(isRowShareable({ provider: PERSONAL, disconnectedAt: null })).toBe(true);
  });

  it("disconnected personal-provider row is NOT shareable (no usable credential)", () => {
    expect(
      isRowShareable({ provider: PERSONAL, disconnectedAt: "2026-06-22T00:00:00.000Z" }),
    ).toBe(false);
  });

  it("account-provider row is NOT shareable, active or not", () => {
    expect(isRowShareable({ provider: ACCOUNT, disconnectedAt: null })).toBe(false);
    expect(
      isRowShareable({ provider: ACCOUNT, disconnectedAt: "2026-06-22T00:00:00.000Z" }),
    ).toBe(false);
  });
});

describe("CS-1 — INTEGRATION_SHARING_SCOPE_VALUES", () => {
  it("is exactly the two CHECK-constraint values (NULL is a separate DB-layer state)", () => {
    expect([...INTEGRATION_SHARING_SCOPE_VALUES]).toEqual([
      "private_to_connector",
      "shared_with_account",
    ]);
  });
});
