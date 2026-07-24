/**
 * @jest-environment node
 *
 * Structural scope guard for TL-3 (leave-team service + routes). Asserts the
 * leave path reuses the existing offboarding repos and does NOT smuggle in
 * workflow-creator reassignment, billing, owner-transfer, or a deletion-guard
 * change. Reads source as text (no imports executed); comments stripped.
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

const SERVICE = "services/accounts/leaveAccount.ts";
const LEAVE_ROUTE = "app/api/accounts/[id]/leave/route.ts";
const IMPACT_ROUTE = "app/api/accounts/[id]/leave-impact/route.ts";

describe("TL-3 — leave-team stays in scope (structural)", () => {
  it("the service reuses the existing offboarding sequence (no new mechanism)", () => {
    const code = codeOf(SERVICE);
    expect(code).toMatch(/softDisconnectPersonalForMember/);
    expect(code).toMatch(/removeMembershipServiceRole/);
    expect(code).toMatch(/clearActiveAccountIfMatchesServiceRole/);
  });

  it("the service does NOT touch workflows / creators, billing, or owner transfer", () => {
    const code = codeOf(SERVICE);
    expect(code).not.toMatch(/createdByUserId|created_by/i);
    expect(code).not.toMatch(/updateWorkflow|workflowsRepo/);
    expect(code).not.toMatch(/transfer_account_ownership|transferAccountOwnership/);
    expect(code).not.toMatch(/billing|stripe/i);
  });

  it("the impact route is count-only and self-scoped (no workflow details, no target input)", () => {
    const code = codeOf(IMPACT_ROUTE);
    expect(code).toMatch(/countImpactedWorkflowsForMember\(accountId,\s*auth\.userId\)/);
    expect(code).toMatch(/affectedWorkflowCount/);
    // Self only — never reads a target id from the request body/query.
    expect(code).not.toMatch(/targetUserId|request\.json|searchParams/);
  });

  it("neither route touches the deletion guard or billing", () => {
    for (const rel of [LEAVE_ROUTE, IMPACT_ROUTE]) {
      const code = codeOf(rel);
      expect(code).not.toMatch(/listOwnedTeamOrgAccountIds|ACCOUNT_HAS_OWNED_TEAMS/);
      expect(code).not.toMatch(/billing|stripe/i);
    }
  });

  it("the ACCOUNT_HAS_OWNED_TEAMS deletion guard still exists (TL-4 owns its remediation)", () => {
    // ACCOUNT-BILLING-LIFECYCLE-2 moved ENFORCEMENT from the route into the deletion
    // SERVICE, so the route no longer carries the literal — it projects the service's typed
    // refusal. The guarantee this tripwire protects is unchanged ("TL-3 did not remove the
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
