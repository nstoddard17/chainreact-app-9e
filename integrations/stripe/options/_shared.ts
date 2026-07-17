import {
  IntegrationActionRequiredError,
  InsufficientScopeError,
  Unauthorized401Error,
} from "@/services/oauth/refreshAndRetry";
import {
  OptionsResolverError,
  type OptionItem,
  type OptionsResolverContext,
} from "@/services/options/types";
import type { IntegrationRecord } from "@/repositories/integrations";

/**
 * Shared guards + error mapping for the Stripe options resolvers —
 * RESOLVERS-1. Mirrors the QuickBooks/Calendly `_shared` posture.
 *
 * Error sanitization (nothing provider-raw reaches the browser):
 *   - `IntegrationActionRequiredError` / leaked `Unauthorized401Error`
 *     → `INTEGRATION_DISCONNECTED` ("Reconnect Stripe…").
 *   - `InsufficientScopeError` → `PROVIDER_REAUTH_REQUIRED`.
 *   - Anything else → `PROVIDER_ERROR` with a static message (the
 *     Stripe error envelope never crosses to the client).
 *
 * Label policy: customer labels are NAMES only (never email, phone,
 * address, or balance); subscription labels are customer-name + status
 * (the sub id rides in `description`); price labels may include the
 * merchant's own catalog amount ("$29.00/month") — that is the
 * merchant's public pricing, not customer PII, and without it prices
 * are indistinguishable.
 */

export function requireStripeIntegration(
  ctx: OptionsResolverContext,
): IntegrationRecord {
  if (!ctx.integration) {
    throw new OptionsResolverError(
      "INTEGRATION_DISCONNECTED",
      "No active Stripe connection. Connect Stripe first.",
    );
  }
  return ctx.integration;
}

/** Map a wrapper/API failure to a sanitized OptionsResolverError. Never returns. */
export function mapStripeOptionsError(err: unknown, what: string): never {
  if (
    err instanceof IntegrationActionRequiredError ||
    err instanceof Unauthorized401Error
  ) {
    throw new OptionsResolverError(
      "INTEGRATION_DISCONNECTED",
      "Reconnect Stripe and try again.",
    );
  }
  if (err instanceof InsufficientScopeError) {
    throw new OptionsResolverError(
      "PROVIDER_REAUTH_REQUIRED",
      "Your Stripe connection is missing a required permission. Reconnect Stripe to grant it.",
    );
  }
  throw new OptionsResolverError(
    "PROVIDER_ERROR",
    `Couldn't load Stripe ${what}. Try again.`,
  );
}

/** Case-insensitive substring filter on labels + descriptions, then alpha sort. */
export function filterAndSortByLabel(
  items: readonly OptionItem[],
  q: string,
): OptionItem[] {
  const lowerQ = q.toLowerCase();
  const filtered =
    lowerQ.length > 0
      ? items.filter(
          (item) =>
            item.label.toLowerCase().includes(lowerQ) ||
            (item.description ?? "").toLowerCase().includes(lowerQ),
        )
      : [...items];
  return filtered.sort((a, b) => a.label.localeCompare(b.label));
}

/** "$29.00/month" style price label fragment from minor units. */
export function formatPriceAmount(
  unitAmount: number | null,
  currency: string,
  interval: string | null,
): string {
  if (unitAmount === null) return "custom pricing";
  const major = (unitAmount / 100).toFixed(2);
  const cur = currency.toUpperCase();
  return interval ? `${major} ${cur}/${interval}` : `${major} ${cur}`;
}

/**
 * "$42.00" style money label from Stripe MINOR units — RESOLVERS-2.
 *
 * Unlike `formatPriceAmount` (which hard-codes /100 for the catalog
 * price labels it already ships), this asks `Intl` for the currency's
 * real minor-unit exponent, so zero-decimal currencies are not
 * misreported by 100x — Stripe sends JPY 1000 meaning ¥1,000, not
 * ¥10.00. An unrecognized currency code falls back to the /100 + code
 * form rather than throwing (a broken picker is worse than a plain
 * label).
 */
export function formatMinorUnitAmount(
  amount: number,
  currency: string,
): string {
  const cur = currency.toUpperCase();
  try {
    const fmt = new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: cur,
    });
    const digits = fmt.resolvedOptions().maximumFractionDigits ?? 2;
    return fmt.format(amount / 10 ** digits);
  } catch {
    return `${(amount / 100).toFixed(2)} ${cur}`;
  }
}

/** "2026-07-01" from a Stripe `created` Unix-seconds timestamp. */
export function formatUnixDate(created: number): string {
  return new Date(created * 1000).toISOString().slice(0, 10);
}

/**
 * Human label for a Stripe payment method — RESOLVERS-2.
 *
 * "Visa ending 4242 — exp 08/2027" for cards; the closest equivalent
 * for the other types Stripe attaches to a customer. NEVER a full PAN
 * (Stripe only ever returns `last4` on this surface) and never the
 * cardholder's name / email / address — `billing_details` is not even
 * pinned on the wrapper's response type.
 *
 * Falls back to the humanized Stripe type (e.g. "paypal" → "Paypal")
 * for types with no last4, so every attached method stays pickable
 * rather than silently vanishing from the list.
 */
export function formatPaymentMethodLabel(pm: {
  type: string;
  card?: { brand: string; last4: string; exp_month: number; exp_year: number };
  us_bank_account?: { bank_name: string | null; last4: string | null };
  sepa_debit?: { last4: string | null };
  bacs_debit?: { last4: string | null };
  au_becs_debit?: { last4: string | null };
}): string {
  if (pm.card) {
    const brand = titleCase(pm.card.brand);
    const exp = `${String(pm.card.exp_month).padStart(2, "0")}/${pm.card.exp_year}`;
    return `${brand} ending ${pm.card.last4} — exp ${exp}`;
  }
  if (pm.us_bank_account?.last4) {
    const bank = pm.us_bank_account.bank_name ?? "Bank account";
    return `${bank} ending ${pm.us_bank_account.last4}`;
  }
  if (pm.sepa_debit?.last4) {
    return `SEPA Direct Debit ending ${pm.sepa_debit.last4}`;
  }
  if (pm.bacs_debit?.last4) {
    return `Bacs Direct Debit ending ${pm.bacs_debit.last4}`;
  }
  if (pm.au_becs_debit?.last4) {
    return `BECS Direct Debit ending ${pm.au_becs_debit.last4}`;
  }
  return titleCase(pm.type.replace(/_/g, " "));
}

function titleCase(value: string): string {
  return value
    .split(" ")
    .map((word) =>
      word.length > 0 ? word[0]!.toUpperCase() + word.slice(1) : word,
    )
    .join(" ");
}
