/**
 * @jest-environment node
 *
 * Structural scope guard for TL-2 (transfer ownership service + route). Asserts
 * this slice did NOT smuggle in transfer-and-leave offboarding, a leave-team
 * route, or a deletion-guard change — those are TL-3 / TL-4. Reads source as
 * text (no imports executed); comments are stripped so a doc-comment mentioning
 * "transfer and leave" doesn't trip the symbol checks.
 */

import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const ROOT = resolve(__dirname, "../..");

function codeOf(rel: string): string {
  return readFileSync(resolve(ROOT, rel), "utf8").replace(
    /\/\*[\s\S]*?\*\/|\/\/[^\n]*/g,
    "",
  );
}

const SERVICE = "services/accounts/transferOwnership.ts";
const ROUTE = "app/api/accounts/[id]/transfer-ownership/route.ts";

describe("TL-2 — transfer ownership stays in scope (structural)", () => {
  it("transfer service does NOT perform offboarding / credential soft-disconnect", () => {
    const code = codeOf(SERVICE);
    expect(code).not.toMatch(/softDisconnectPersonalForMember/);
    expect(code).not.toMatch(/removeMembershipServiceRole/);
    expect(code).not.toMatch(/offboard/i);
    expect(code).not.toMatch(/clearActiveAccount/);
  });

  it("transfer route does NOT perform offboarding or touch the deletion guard", () => {
    const code = codeOf(ROUTE);
    expect(code).not.toMatch(/softDisconnect|offboard/i);
    expect(code).not.toMatch(/listOwnedTeamOrgAccountIds|ACCOUNT_HAS_OWNED_TEAMS/);
  });

  it("the ACCOUNT_HAS_OWNED_TEAMS deletion guard still exists (TL-4 owns its remediation)", () => {
    // ACCOUNT-BILLING-LIFECYCLE-2 moved ENFORCEMENT from the route into the deletion
    // SERVICE, so the route no longer carries the literal — it projects the service's typed
    // refusal. The guarantee this tripwire protects is unchanged ("TL-2 did not remove the
    // deletion guard"), so it now checks the guard's canonical home plus the route's
    // projection of it. Both must hold; a future slice deleting either still fails here.
    const service = readFileSync(
      resolve(ROOT, "services/accounts/accountDeletion.ts"),
      "utf8",
    );
    expect(service).toMatch(/ACCOUNT_HAS_OWNED_TEAMS/);
    expect(service).toMatch(/listOwnedTeamOrgAccountSummaries/);

    const del = readFileSync(resolve(ROOT, "app/api/account/delete/route.ts"), "utf8");
    expect(del).toMatch(/OwnedAccountsBlockDeletionError/);
  });
});
