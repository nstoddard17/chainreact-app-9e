import { z } from "zod";

/**
 * Safe integration-health summary — a mobile-owned projection deliberately
 * NARROWER than the web `contracts/apps.ts` catalog item. Mobile v1 answers
 * one question per provider: "is anything here silently breaking my
 * workflows?" It carries derived booleans and counts only — no per-connection
 * rows, no sharing/permission flags, no display names of individual
 * connections, and (like the web contract) never tokens, scopes, provider
 * account ids, timestamps, or metadata.
 */
export const MobileIntegrationHealthItemSchema = z
  .object({
    providerId: z.string(),
    name: z.string(),
    iconUrl: z.string().nullable(),
    isConnected: z.boolean(),
    /** OR across the account's active connections for this provider. */
    needsReconnect: z.boolean(),
    connectionCount: z.number().int().nonnegative(),
  })
  .strict();
export type MobileIntegrationHealthItem = z.infer<
  typeof MobileIntegrationHealthItemSchema
>;

export const MobileIntegrationHealthSummarySchema = z
  .object({
    /** Connected providers only — mobile is not a connect surface. */
    items: z.array(MobileIntegrationHealthItemSchema),
    needsAttentionCount: z.number().int().nonnegative(),
  })
  .strict();
export type MobileIntegrationHealthSummary = z.infer<
  typeof MobileIntegrationHealthSummarySchema
>;
