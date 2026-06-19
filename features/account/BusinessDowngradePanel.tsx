"use client";

import { useState } from "react";
import { startBusinessDowngrade } from "@/lib/api/billingCheckout";
import { AccountApiError } from "@/lib/api/accounts";
import { Button } from "@/components/ui/button";

/**
 * Business → Team downgrade affordance (Slice 4.PLATFORM-BILLING-BUSINESS-DOWNGRADE-5 / CS-BD-3).
 *
 * The explicit, owner-confirmed DESTRUCTIVE downgrade. The parent BillingSection gates eligibility
 * (Business/organization account, OWNER, not frozen, ENABLE_BUSINESS_DOWNGRADE on — this path
 * stays flag-gated because it is destructive). This component renders the full destructive warning, a "Export workflows first" download link
 * (the credential-free bulk export — CS-BD-4B), an explicit confirm checkbox, and the final
 * destructive button which calls the owner-only `POST /api/accounts/[id]/billing/downgrade-to-team`
 * route. On success it reloads so the account type/billing state re-renders.
 *
 * It calls NO Stripe API directly, reads/shows NO Stripe id, and the backend route is itself
 * owner-only (this UI gate is convenience, not the protection).
 */
interface Props {
  /** The Business (organization) account being downgraded. */
  accountId: string;
  /** True when the account is frozen — the action is disabled (parent also hides this panel). */
  frozen?: boolean;
  /** Completion seam (injectable for tests). Defaults to a full page reload. */
  onComplete?: () => void;
}

export function BusinessDowngradePanel({ accountId, frozen = false, onComplete }: Props) {
  const [confirmed, setConfirmed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const done = onComplete ?? (() => window.location.reload());
  // Downgrade-purpose export: owner-only, organization-only, and BYPASSES the normal bulk-export
  // tier gate (a destructive safety flow must never be blocked by tier policy — CS-XT-3).
  const exportHref = `/api/accounts/${encodeURIComponent(accountId)}/workflows/export?purpose=downgrade`;

  async function onSubmit() {
    if (!confirmed || frozen || busy) return;
    setBusy(true);
    setError(null);
    try {
      await startBusinessDowngrade(accountId);
      done();
    } catch (err) {
      setError(
        err instanceof AccountApiError
          ? err.message
          : "Couldn't downgrade to Team. Please try again.",
      );
      setBusy(false);
    }
  }

  return (
    <div data-testid="business-downgrade-panel" className="flex flex-col gap-3">
      <p className="text-xs text-muted-foreground">
        Downgrading to <span className="font-medium text-foreground">Team</span> keeps this same
        account but simplifies it. This is{" "}
        <span className="font-medium text-foreground">destructive</span> — review carefully:
      </p>
      <ul
        data-testid="business-downgrade-warnings"
        className="flex list-disc flex-col gap-1 pl-5 text-xs text-muted-foreground"
      >
        <li>
          <span className="font-medium text-foreground">All other members are removed</span>,
          including admins. Only you (the owner) remain.
        </li>
        <li>
          Removed members&apos; <span className="font-medium text-foreground">personal app
          connections are disconnected</span>; workflows that used them may need reconnecting.
        </li>
        <li>
          Your <span className="font-medium text-foreground">folders are removed</span> — workflows
          are <span className="font-medium text-foreground">kept</span> and moved to Uncategorized.
          Folders go to Trash (restorable for 7 days).
        </li>
        <li>
          <span className="font-medium text-foreground">Nothing is deleted</span> and nothing moves
          to your personal account. The account becomes a Team account.
        </li>
      </ul>

      <div>
        <a
          data-testid="business-downgrade-export"
          href={exportHref}
          className="text-xs font-medium text-primary underline underline-offset-2"
        >
          Export your workflows first
        </a>
      </div>

      <label className="flex items-start gap-2 text-xs text-muted-foreground">
        <input
          type="checkbox"
          data-testid="business-downgrade-confirm"
          checked={confirmed}
          disabled={frozen || busy}
          onChange={(e) => setConfirmed(e.target.checked)}
          className="mt-0.5"
        />
        <span>
          I understand all other members will be removed and my folder structure will be cleared.
        </span>
      </label>

      <div>
        <Button
          type="button"
          size="sm"
          variant="destructive"
          data-testid="business-downgrade-submit"
          disabled={!confirmed || frozen || busy}
          onClick={() => void onSubmit()}
        >
          {busy ? "Downgrading…" : "Downgrade to Team"}
        </Button>
      </div>

      {error && (
        <p role="alert" data-testid="business-downgrade-error" className="text-xs text-destructive">
          {error}
        </p>
      )}
    </div>
  );
}
