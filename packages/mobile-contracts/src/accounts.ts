import { z } from "zod";

/**
 * Account context primitives.
 *
 * The enums mirror `contracts/accounts.ts` in ChainReactV2 exactly (parity
 * tests in the web repo pin them). `MobileAccountSummary` is a mobile-owned
 * projection of the account list — it carries what the account switcher and
 * role-aware UI need and nothing else: no owner user ids, no membership
 * provenance, no deletion timestamps.
 */
export const MOBILE_ACCOUNT_TYPES = ["personal", "team", "organization"] as const;
export const MobileAccountTypeSchema = z.enum(MOBILE_ACCOUNT_TYPES);
export type MobileAccountType = z.infer<typeof MobileAccountTypeSchema>;

export const MOBILE_MEMBERSHIP_ROLES = ["owner", "admin", "member"] as const;
export const MobileMembershipRoleSchema = z.enum(MOBILE_MEMBERSHIP_ROLES);
export type MobileMembershipRole = z.infer<typeof MobileMembershipRoleSchema>;

export const MobileAccountIdSchema = z.string().uuid();
export type MobileAccountId = z.infer<typeof MobileAccountIdSchema>;

/**
 * Server-computed capability booleans — the SERVER's authorization rules
 * projected for rendering. Mobile never re-derives these from `role`.
 */
export const MobileAccountCapabilitiesSchema = z
  .object({
    /** Owner/admin per the server's account-management authorization rule. */
    canManageAccount: z.boolean(),
  })
  .strict();
export type MobileAccountCapabilities = z.infer<
  typeof MobileAccountCapabilitiesSchema
>;

export const MobileAccountSummarySchema = z.object({
  id: MobileAccountIdSchema,
  name: z.string(),
  type: MobileAccountTypeSchema,
  /** The CALLER's role in this account. */
  role: MobileMembershipRoleSchema,
  /** Pending deletion — render read-only, controls disabled. */
  isFrozen: z.boolean(),
  /**
   * Always populated by the server (M1+); `.optional()` only so M0-shaped
   * fixtures/consumers keep parsing — the web contracts' back-compat idiom.
   */
  capabilities: MobileAccountCapabilitiesSchema.optional(),
});
export type MobileAccountSummary = z.infer<typeof MobileAccountSummarySchema>;

/** `GET /api/mobile/v1/session` response. */
export const MobileSessionSchema = z.object({
  userId: z.string().uuid(),
  /** Display identity only — never used for authorization decisions. */
  email: z.string().nullable(),
  accounts: z.array(MobileAccountSummarySchema),
  /** Server-suggested initial selection (the web active account when valid). */
  defaultAccountId: MobileAccountIdSchema.nullable(),
});
export type MobileSession = z.infer<typeof MobileSessionSchema>;
