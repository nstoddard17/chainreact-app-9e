import { z } from "zod";

/**
 * Cross-layer contracts for the V2 account ownership model.
 * Per docs/rules/account-ownership-model.md (canonical) +
 * docs/slices/phase-4/account-model-foundation-plan.md (slice contract).
 *
 * Phase A locks `type` to `'personal'` and `role` to `'owner'`. Phase D
 * broadens both literals in lockstep with the matching CHECK constraint
 * relaxations in supabase/migrations/.
 */

export const AccountTypeSchema = z.enum(["personal"]);
export type AccountType = z.infer<typeof AccountTypeSchema>;

export const MembershipRoleSchema = z.enum(["owner"]);
export type MembershipRole = z.infer<typeof MembershipRoleSchema>;

/**
 * 4.ACCOUNT-MODEL-10b — account deletion lifecycle state.
 * `active` is the normal operational state. `pending_deletion` means a deletion
 * was requested and the account is frozen (non-operational) during the grace
 * window; cancel returns it to `active`. Purge (10c) removes the account
 * entirely, so there is no terminal `deleted` literal on the live row.
 */
export const DeletionStatusSchema = z.enum(["active", "pending_deletion"]);
export type DeletionStatus = z.infer<typeof DeletionStatusSchema>;

export const AccountRecordSchema = z.object({
  id: z.string().uuid(),
  type: AccountTypeSchema,
  name: z.string().min(1),
  ownerUserId: z.string().uuid(),
  deletionStatus: DeletionStatusSchema,
  deletionRequestedAt: z.string().nullable(),
  purgeAfter: z.string().nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type AccountRecord = z.infer<typeof AccountRecordSchema>;

export const AccountMembershipRecordSchema = z.object({
  accountId: z.string().uuid(),
  userId: z.string().uuid(),
  role: MembershipRoleSchema,
  invitedByUserId: z.string().uuid().nullable(),
  joinedAt: z.string(),
});
export type AccountMembershipRecord = z.infer<typeof AccountMembershipRecordSchema>;
