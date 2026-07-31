"use client";

import { useState } from "react";
import {
  AccountApiError,
  updateDisplayName,
  type AccountSummary,
} from "@/lib/api/accounts";
import { Button } from "@/components/ui/button";
import { Panel } from "@/features/team/Panel";
import { SettingRow } from "@/features/team/SettingRow";
import { RoleBadge } from "@/features/team/RoleBadge";
import { DefaultBuilderViewControl } from "./DefaultBuilderViewControl";

/**
 * Profile basics section (Slice 4.ACCOUNT-SETTINGS-3).
 *
 * The first functional Account-settings section: view the signed-in email
 * (read-only) and edit the display name (`user_profiles.display_name`) via
 * `PATCH /api/account/profile`. Empty clears it (downstream identity reads fall
 * back to OAuth metadata). Avatar / username / email stay out of scope — only
 * the display name is editable here.
 */

/** Mirrors the server `MAX_DISPLAY_NAME_LENGTH` (kept in sync by hand — the
 * server is the authority and rejects anything longer). */
const MAX_DISPLAY_NAME_LENGTH = 80;

interface Props {
  email: string;
  role: AccountSummary["role"] | null;
  initialDisplayName: string | null;
  /**
   * BUILDER-VIEW-DEFAULT-1 — server-resolved ENABLE_DOCUMENT_BUILDER. The
   * default-builder-view preference renders only when two views exist to
   * choose between; flag off keeps this section byte-identical.
   */
  builderViewPreferenceEnabled?: boolean;
}

export function ProfileSection({
  email,
  role,
  initialDisplayName,
  builderViewPreferenceEnabled,
}: Props) {
  const [value, setValue] = useState(initialDisplayName ?? "");
  // Canonical stored value ("" when null) — drives the dirty check.
  const [baseline, setBaseline] = useState(initialDisplayName ?? "");
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const dirty = value.trim() !== baseline;

  async function save() {
    if (!dirty || busy) return;
    setBusy(true);
    setError(null);
    setSaved(false);
    try {
      const result = await updateDisplayName(value.trim());
      const stored = result.displayName ?? "";
      setBaseline(stored);
      setValue(stored);
      setSaved(true);
    } catch (err) {
      setError(
        err instanceof AccountApiError ? err.message : "Couldn't save. Try again.",
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <div data-testid="account-section-profile" className="flex flex-col gap-5">
      <Panel title="Profile" desc="How you appear across ChainReact.">
        <SettingRow label="Email" desc="The address you sign in with.">
          <span
            data-testid="profile-email"
            className="block break-all text-sm font-medium text-foreground"
          >
            {email || "—"}
          </span>
        </SettingRow>

        <SettingRow
          label="Display name"
          desc="Shown to teammates across ChainReact. Leave blank to use your sign-in name."
          stacked
        >
          <div className="flex min-w-0 flex-col gap-2">
            {/* WRAP. The field yields (`min-w-0`) and Save holds its label
                (`shrink-0`, and Button is `whitespace-nowrap`), so "Saving…"
                can never squeeze the label into something unreadable — the row
                drops the button to the next line instead. */}
            <div className="flex min-w-0 flex-wrap items-center gap-2">
              <input
                type="text"
                aria-label="Display name"
                data-testid="profile-display-name-input"
                value={value}
                maxLength={MAX_DISPLAY_NAME_LENGTH}
                disabled={busy}
                placeholder="Add a display name"
                onChange={(e) => {
                  setValue(e.target.value);
                  setSaved(false);
                  setError(null);
                }}
                className="h-9 w-full min-w-0 max-w-sm flex-1 rounded-md border border-input bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50"
              />
              <Button
                type="button"
                size="sm"
                className="shrink-0"
                data-testid="profile-display-name-save"
                disabled={busy || !dirty}
                onClick={save}
              >
                {busy ? "Saving…" : "Save"}
              </Button>
            </div>

            {saved && !dirty && (
              <p
                role="status"
                data-testid="profile-display-name-saved"
                className="text-xs text-emerald-600 dark:text-emerald-400"
              >
                Display name saved.
              </p>
            )}
            {error && (
              <p
                role="alert"
                data-testid="profile-display-name-error"
                className="text-xs text-destructive"
              >
                {error}
              </p>
            )}
          </div>
        </SettingRow>

        {role && (
          <SettingRow label="Role on this account">
            <RoleBadge role={role} />
          </SettingRow>
        )}

        {builderViewPreferenceEnabled && (
          <SettingRow
            label="Default builder view"
            desc="How the workflow builder opens for you. 'Ask each time' shows a one-time choice on each new workflow."
            stacked
          >
            <DefaultBuilderViewControl />
          </SettingRow>
        )}

        <SettingRow label="Profile photo" desc="Avatar uploads aren't available yet.">
          <span
            data-testid="account-coming-soon"
            className="inline-flex items-center rounded-full border border-dashed border-border px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground/70"
          >
            Coming soon
          </span>
        </SettingRow>
      </Panel>
    </div>
  );
}
