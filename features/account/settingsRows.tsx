import type { ReactNode } from "react";
import { SettingRow } from "@/features/team/SettingRow";
import type { AccountSummary } from "@/lib/api/accounts";

/**
 * Shared Account-settings row primitives (extracted from AccountSections.tsx in
 * 4.ACCOUNT-SETTINGS-BILLING-REFACTOR-1). Pure presentational helpers reused by the
 * Account / Security / Billing / API section bodies. No behavior — extraction only.
 */

/** Facts about the ACTIVE account shared across section bodies. */
export interface ActiveAccountView {
  name: string;
  type: AccountSummary["type"];
  role: AccountSummary["role"];
}

/** A non-interactive "coming soon" pill used to mark deferred controls. */
export function ComingSoon() {
  return (
    <span
      data-testid="account-coming-soon"
      className="inline-flex items-center rounded-full border border-dashed border-border px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground/70"
    >
      Coming soon
    </span>
  );
}

/** A read-only setting row whose control slot is a coming-soon marker. */
export function ComingSoonRow({ label, desc }: { label: string; desc?: string }) {
  return (
    <SettingRow label={label} desc={desc}>
      <ComingSoon />
    </SettingRow>
  );
}

/** A read-only value row (no edit affordance). */
export function ReadOnlyRow({
  label,
  desc,
  value,
}: {
  label: string;
  desc?: string;
  value: ReactNode;
}) {
  return (
    <SettingRow label={label} desc={desc}>
      <span className="text-sm font-medium text-foreground">{value}</span>
    </SettingRow>
  );
}
