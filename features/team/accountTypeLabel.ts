import type { AccountSummary } from "@/lib/api/accounts";

/**
 * User-facing tier label for an account type (Slice 4.ACCOUNT-MODEL-TRANSFER-LEAVE-6 / TL-5).
 *
 * The internal account type stays `organization`, but the product surfaces the
 * tier as **Business** — we never show the raw "Organization" word as a tier
 * label. Mirrors the server-side `accountTypeLabel` used by the deletion guard
 * (`app/api/account/delete/route.ts`). Tiers: Personal / Team / Business
 * (Enterprise is future and has no internal type yet).
 */
export function accountTypeLabel(type: AccountSummary["type"]): string {
  if (type === "organization") return "Business";
  if (type === "personal") return "Personal";
  return "Team";
}
