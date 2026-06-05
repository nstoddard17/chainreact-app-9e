"use client";

import { useState } from "react";
import { AccountApiError, changePassword } from "@/lib/api/accounts";
import { Button } from "@/components/ui/button";

/**
 * Change-password control (Slice 4.ACCOUNT-SETTINGS-7 / SEC-2).
 *
 * Lives inside the read-only Security & access section's Password row. Collapsed,
 * it's a "Change password" button; expanded, an inline form (current / new /
 * confirm) — consistent with the Profile + Danger-zone inline pattern (no modal
 * primitive). Save is gated on a min-length new password that differs from the
 * current and matches the confirmation. Calls `changePassword` (which reuses the
 * shared current-password step-up server-side). Fields clear on success.
 */

const MIN_PASSWORD_LENGTH = 8; // mirrors the server MIN_PASSWORD_LENGTH

export function ChangePasswordForm() {
  const [open, setOpen] = useState(false);
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const tooShort = next.length > 0 && next.length < MIN_PASSWORD_LENGTH;
  const mismatch = confirm.length > 0 && next !== confirm;
  const sameAsCurrent = next.length > 0 && next === current;
  const canSave =
    !busy &&
    current.length > 0 &&
    next.length >= MIN_PASSWORD_LENGTH &&
    next === confirm &&
    next !== current;

  function reset() {
    setCurrent("");
    setNext("");
    setConfirm("");
    setError(null);
  }

  function openForm() {
    setSaved(false);
    reset();
    setOpen(true);
  }

  function cancel() {
    setOpen(false);
    reset();
  }

  async function save() {
    if (!canSave) return;
    setBusy(true);
    setError(null);
    setSaved(false);
    try {
      await changePassword({ currentPassword: current, newPassword: next });
      reset();
      setOpen(false);
      setSaved(true);
    } catch (err) {
      setError(
        err instanceof AccountApiError ? err.message : "Couldn't update your password. Try again.",
      );
    } finally {
      setBusy(false);
    }
  }

  if (!open) {
    return (
      <div className="flex flex-col gap-1">
        <Button
          type="button"
          size="sm"
          variant="outline"
          data-testid="security-change-password-open"
          onClick={openForm}
        >
          Change password
        </Button>
        {saved && (
          <p role="status" data-testid="security-password-saved" className="text-xs text-emerald-600 dark:text-emerald-400">
            Password updated.
          </p>
        )}
      </div>
    );
  }

  return (
    <div
      data-testid="security-change-password-form"
      className="flex w-full max-w-sm flex-col gap-3 rounded-xl border border-border bg-background/40 p-4"
    >
      <label className="flex flex-col gap-1 text-xs font-medium text-foreground">
        Current password
        <input
          type="password"
          aria-label="Current password"
          data-testid="security-current-password"
          value={current}
          disabled={busy}
          autoComplete="current-password"
          onChange={(e) => {
            setCurrent(e.target.value);
            setError(null);
          }}
          className="h-9 rounded-md border border-input bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50"
        />
      </label>

      <label className="flex flex-col gap-1 text-xs font-medium text-foreground">
        New password
        <input
          type="password"
          aria-label="New password"
          data-testid="security-new-password"
          value={next}
          disabled={busy}
          autoComplete="new-password"
          onChange={(e) => {
            setNext(e.target.value);
            setError(null);
          }}
          className="h-9 rounded-md border border-input bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50"
        />
      </label>

      <label className="flex flex-col gap-1 text-xs font-medium text-foreground">
        Confirm new password
        <input
          type="password"
          aria-label="Confirm new password"
          data-testid="security-confirm-password"
          value={confirm}
          disabled={busy}
          autoComplete="new-password"
          onChange={(e) => {
            setConfirm(e.target.value);
            setError(null);
          }}
          className="h-9 rounded-md border border-input bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50"
        />
      </label>

      {tooShort && (
        <p data-testid="security-password-tooshort" className="text-xs text-muted-foreground">
          New password must be at least {MIN_PASSWORD_LENGTH} characters.
        </p>
      )}
      {sameAsCurrent && (
        <p data-testid="security-password-same" className="text-xs text-muted-foreground">
          New password must be different from your current password.
        </p>
      )}
      {mismatch && (
        <p data-testid="security-password-mismatch" className="text-xs text-muted-foreground">
          Passwords don't match.
        </p>
      )}
      {error && (
        <p role="alert" data-testid="security-password-error" className="text-xs text-destructive">
          {error}
        </p>
      )}

      <div className="flex items-center gap-2">
        <Button
          type="button"
          size="sm"
          data-testid="security-change-password-save"
          disabled={!canSave}
          onClick={save}
        >
          {busy ? "Saving…" : "Update password"}
        </Button>
        <Button
          type="button"
          size="sm"
          variant="ghost"
          data-testid="security-change-password-cancel"
          disabled={busy}
          onClick={cancel}
        >
          Cancel
        </Button>
      </div>
    </div>
  );
}
