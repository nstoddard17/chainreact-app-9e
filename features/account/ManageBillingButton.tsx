"use client";

import { useState } from "react";
import { startBillingPortal } from "@/lib/api/billingCheckout";
import { AccountApiError } from "@/lib/api/accounts";
import { Button } from "@/components/ui/button";

/**
 * "Manage billing" affordance (Slice 4.PLATFORM-BILLING-UI-1).
 *
 * Opens the Stripe Customer Portal (update card / view invoices / cancel) via the existing
 * CS-3 portal route — this slice adds no backend and never calls Stripe directly. The
 * parent BillingSection gates visibility (owner/admin, not frozen, and a synced subscription
 * exists; billing is live — no feature-flag gate). On success it redirects to the Stripe-hosted portal
 * url ONLY — no Stripe customer/subscription id is read or shown.
 *
 * Defensive: if the account somehow has no Stripe customer yet (route → 409 `CONFLICT`),
 * it shows honest "start a paid plan first" copy instead of an error; any other failure
 * shows a generic message (never a raw Stripe/DB error).
 */
interface Props {
  accountId: string;
  /** True when the account is frozen — the trigger is disabled. */
  frozen?: boolean;
  /** Redirect seam (injectable for tests). Defaults to window.location.assign. */
  redirect?: (url: string) => void;
}

export function ManageBillingButton({ accountId, frozen = false, redirect }: Props) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [noCustomer, setNoCustomer] = useState(false);
  const go = redirect ?? ((url: string) => window.location.assign(url));

  async function onClick() {
    if (frozen || busy) return;
    setBusy(true);
    setError(null);
    setNoCustomer(false);
    try {
      const { url } = await startBillingPortal(accountId);
      go(url);
    } catch (err) {
      if (err instanceof AccountApiError && err.code === "CONFLICT") {
        // No Stripe customer yet — not an error, just not available until checkout.
        setNoCustomer(true);
      } else {
        setError(
          err instanceof AccountApiError
            ? err.message
            : "Couldn't open the billing portal. Try again.",
        );
      }
      setBusy(false);
    }
  }

  return (
    <div data-testid="manage-billing" className="flex flex-col gap-2">
      <div>
        <Button
          type="button"
          size="sm"
          variant="outline"
          data-testid="manage-billing-trigger"
          disabled={frozen || busy}
          onClick={() => void onClick()}
        >
          {busy ? "Opening…" : "Manage billing"}
        </Button>
      </div>

      {noCustomer && (
        <p data-testid="manage-billing-no-customer" className="text-xs text-muted-foreground">
          Billing management becomes available after you start a paid plan.
        </p>
      )}

      {error && (
        <p role="alert" data-testid="manage-billing-error" className="text-xs text-destructive">
          {error}
        </p>
      )}
    </div>
  );
}
