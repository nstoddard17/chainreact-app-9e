/**
 * @jest-environment node
 *
 * Slice 4.PLATFORM-BILLING-BUSINESS-DOWNGRADE-6 / CS-BD-2 — static guard.
 *
 * Reads the Stripe billing webhook source and asserts it references NONE of the destructive
 * downgrade / workspace-mutation seams. This is a regression lock: the Business → Team downgrade
 * is owner-confirmed UI only, NEVER webhook-driven. A future edit that wires any of these into the
 * webhook fails here loudly.
 */

import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const SRC = readFileSync(
  resolve(process.cwd(), "services/billing/stripeBillingWebhook.ts"),
  "utf8",
);

describe("stripeBillingWebhook — no destructive downgrade wiring", () => {
  it.each([
    "downgradeBusinessToTeam", // the CS-BD-1 orchestration
    "applyBusinessDowngrade", // the CS-BD-1 atomic flip RPC wrapper
    "apply_business_downgrade", // the RPC name
    "removeMember", // member offboarding
    "softDisconnectPersonalForMember", // credential offboarding
    "revokeLiveForMember", // node-credential revoke
    "deleteFolder", // folder trash
    "updateFolder", // workflow reparent
  ])("does not reference %s", (symbol) => {
    expect(SRC).not.toContain(symbol);
  });

  it("only imports billing-sync + upgrade repositories from accountBilling (no downgrade primitive)", () => {
    // The webhook may sync billing + apply the (additive) Business upgrade; it must not import the
    // destructive downgrade primitive.
    expect(SRC).toContain("applyBillingSubscriptionSyncServiceRole");
    expect(SRC).toContain("applyBusinessUpgradeServiceRole");
    expect(SRC).not.toContain("applyBusinessDowngradeServiceRole");
  });
});
