import type { AccountType } from "@/contracts/accounts";
import * as accountsRepo from "@/repositories/accounts";
import * as membershipsRepo from "@/repositories/accountMemberships";
import * as accountBillingRepo from "@/repositories/accountBilling";
import { setActiveAccount } from "@/services/accounts/activeAccount";

/**
 * Team account creation service (4.ACCOUNT-MODEL-13, Phase D).
 *
 * Creates a SEPARATE team account — it never converts or touches the caller's
 * personal account, and never moves/copies any personal workflows, integrations,
 * runs, or billing. A user may create many teams. Mirrors the signup trigger's
 * shape (account → owner membership → free billing) but for `type='team'`, and
 * auto-activates the new team through the existing active-account foundation.
 *
 * Backend-only this slice: no visible UI, no invitations, no role assignment
 * (creator is the sole `owner`), no organization creation, no paid billing.
 *
 * All writes are service-role (no client write path on accounts/memberships/
 * billing). `userId` is the authenticated caller, supplied by the route from the
 * session — never request input — so a caller can only create a team they own.
 */

export interface CreateTeamAccountInput {
  userId: string;
  name: string;
}

export interface CreatedTeamAccount {
  id: string;
  name: string;
  type: AccountType;
}

export async function createTeamAccount(
  input: CreateTeamAccountInput,
): Promise<CreatedTeamAccount> {
  const name = input.name.trim();
  if (name.length === 0) {
    // The route validates first; this is a defensive floor.
    throw new Error("createTeamAccount: name is required.");
  }

  // 1. The team account (service-role; not bound by the personal-only index).
  const account = await accountsRepo.createTeamAccountServiceRole({
    name,
    ownerUserId: input.userId,
  });

  // 2. Owner membership for the creator.
  await membershipsRepo.insertOwnerMembershipServiceRole(account.id, input.userId);

  // 3. Free billing root (defaults = 100 tasks; no Stripe).
  await accountBillingRepo.initAccountBillingServiceRole(account.id);

  // 4. Auto-activate via the existing foundation (membership + freeze re-checked
  //    inside setActiveAccount; the row was just committed service-role, so the
  //    session client sees it). Best-effort: the team exists regardless of the
  //    pointer write, so a rare activation miss does not fail creation.
  const activated = await setActiveAccount(input.userId, account.id);
  if (!activated.ok) {
    console.warn(
      JSON.stringify({
        event: "account.team.create.activate_failed",
        reason: activated.reason,
      }),
    );
  }

  console.info(JSON.stringify({ event: "account.team.create.ok", type: account.type }));

  return { id: account.id, name: account.name, type: account.type };
}
