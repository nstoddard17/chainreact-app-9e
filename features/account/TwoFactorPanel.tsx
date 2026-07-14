"use client";

import { useCallback, useEffect, useState } from "react";
import {
  AccountApiError,
  getMfaStatus,
  beginMfaEnrollment,
  confirmMfaEnrollment,
  disableMfa,
  type MfaStatusView,
  type MfaEnrollmentView,
} from "@/lib/api/accounts";
import { Button } from "@/components/ui/button";

/**
 * Two-factor authentication (TOTP) control (SEC-3).
 *
 * Real enroll → verify → status → disable lifecycle over the self-scoped
 * /api/account/mfa routes. Replaces the previous "coming soon" placeholder in the
 * Security & access section. Enabling MFA arms the login challenge enforced by the
 * auth middleware — this is not a cosmetic toggle.
 *
 * SECRET DISCIPLINE: the enrollment `secret`/`qrCode`/`uri` live ONLY in this
 * component's in-memory `enrollment` state during setup; they are shown once for
 * the user to add to their app, cleared on success/cancel, and never logged,
 * persisted, or refetched. The QR is rendered from the server-provided data-URI.
 *
 * Recovery honesty: there are no self-serve recovery codes yet, so the UI says so
 * plainly (support-assisted removal) rather than implying a backup that doesn't
 * exist.
 */

function formatDate(iso: string | null): string {
  if (!iso) return "—";
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return "—";
  return new Date(t).toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  });
}

type Mode = "idle" | "enrolling" | "disabling";

export function TwoFactorPanel() {
  const [status, setStatus] = useState<MfaStatusView | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [mode, setMode] = useState<Mode>("idle");

  // Enrollment state (sensitive material lives only here, during setup).
  const [enrollment, setEnrollment] = useState<MfaEnrollmentView | null>(null);
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  // Disable state.
  const [password, setPassword] = useState("");

  const load = useCallback(async () => {
    setLoadError(null);
    try {
      setStatus(await getMfaStatus());
    } catch (err) {
      setStatus(null);
      setLoadError(
        err instanceof AccountApiError ? err.message : "Couldn't load two-factor status.",
      );
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  function resetTransient() {
    setEnrollment(null);
    setCode("");
    setPassword("");
    setActionError(null);
    setBusy(false);
  }

  async function startEnroll() {
    setMode("enrolling");
    setActionError(null);
    setBusy(true);
    try {
      setEnrollment(await beginMfaEnrollment());
    } catch (err) {
      setActionError(
        err instanceof AccountApiError ? err.message : "Couldn't start setup. Try again.",
      );
      setMode("idle");
    } finally {
      setBusy(false);
    }
  }

  async function confirmEnroll() {
    if (!enrollment) return;
    const clean = code.replace(/\s+/g, "");
    if (!/^\d{6}$/.test(clean)) {
      setActionError("Enter the 6-digit code from your app.");
      return;
    }
    setBusy(true);
    setActionError(null);
    try {
      await confirmMfaEnrollment({ factorId: enrollment.factorId, code: clean });
      resetTransient();
      setMode("idle");
      await load();
    } catch (err) {
      setActionError(
        err instanceof AccountApiError ? err.message : "Couldn't verify that code. Try again.",
      );
      setBusy(false);
    }
  }

  async function confirmDisable() {
    if (password.length === 0) {
      setActionError("Enter your password to turn off two-factor.");
      return;
    }
    setBusy(true);
    setActionError(null);
    try {
      await disableMfa(password);
      resetTransient();
      setMode("idle");
      await load();
    } catch (err) {
      setActionError(
        err instanceof AccountApiError ? err.message : "Couldn't turn off two-factor. Try again.",
      );
      setBusy(false);
    }
  }

  function cancel() {
    resetTransient();
    setMode("idle");
  }

  // ── Render ──────────────────────────────────────────────────────────────────
  if (status === null && !loadError) {
    return (
      <p data-testid="mfa-loading" className="text-sm text-muted-foreground">
        Loading…
      </p>
    );
  }

  if (loadError) {
    return (
      <div data-testid="mfa-load-error" className="flex flex-col gap-2">
        <p role="alert" className="text-xs text-destructive">
          {loadError}
        </p>
        <div>
          <Button type="button" size="sm" variant="outline" data-testid="mfa-retry" onClick={() => void load()}>
            Retry
          </Button>
        </div>
      </div>
    );
  }

  const enabled = status?.enabled ?? false;

  return (
    <div data-testid="mfa-panel" className="flex w-full max-w-sm flex-col gap-3">
      <div className="flex items-center gap-2">
        <span
          data-testid="mfa-status"
          className={
            enabled
              ? "inline-flex items-center rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2 py-0.5 text-[11px] font-semibold text-emerald-600 dark:text-emerald-400"
              : "inline-flex items-center rounded-full border border-border bg-muted/40 px-2 py-0.5 text-[11px] font-semibold text-muted-foreground"
          }
        >
          {enabled ? "On" : "Off"}
        </span>
        {enabled && status?.factor && (
          <span className="text-xs text-muted-foreground">
            Enabled {formatDate(status.factor.createdAt)}
          </span>
        )}
      </div>

      {/* Enabled → offer disable. */}
      {enabled && mode === "idle" && (
        <div>
          <Button type="button" size="sm" variant="outline" data-testid="mfa-disable-open" onClick={() => setMode("disabling")}>
            Turn off two-factor
          </Button>
        </div>
      )}

      {/* Not enabled → offer setup. */}
      {!enabled && mode === "idle" && (
        <div className="flex flex-col gap-2">
          <p className="text-xs text-muted-foreground">
            Protect your account with a time-based code from an authenticator app (Google
            Authenticator, 1Password, Authy…). You&apos;ll be asked for a code when you sign in.
          </p>
          <div>
            <Button type="button" size="sm" data-testid="mfa-setup-open" onClick={() => void startEnroll()}>
              Set up two-factor
            </Button>
          </div>
        </div>
      )}

      {/* Enrollment flow. */}
      {mode === "enrolling" && (
        <div data-testid="mfa-enroll-form" className="flex flex-col gap-3 rounded-xl border border-border bg-background/40 p-4">
          {busy && !enrollment ? (
            <p className="text-xs text-muted-foreground">Preparing setup…</p>
          ) : enrollment ? (
            <>
              <p className="text-xs font-medium text-foreground">
                1. Scan this QR code with your authenticator app
              </p>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={enrollment.qrCode}
                alt="Two-factor QR code"
                data-testid="mfa-qr"
                className="h-40 w-40 self-center rounded bg-white p-2"
              />
              <p className="text-xs text-muted-foreground">
                Or enter this key manually:
              </p>
              <input
                readOnly
                aria-label="Setup key"
                data-testid="mfa-secret"
                value={enrollment.secret}
                onFocus={(e) => e.target.select()}
                className="h-9 rounded-md border border-input bg-background px-3 font-mono text-xs text-foreground"
              />
              <label className="flex flex-col gap-1 text-xs font-medium text-foreground">
                2. Enter the 6-digit code
                <input
                  type="text"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  aria-label="Verification code"
                  data-testid="mfa-enroll-code"
                  value={code}
                  maxLength={7}
                  disabled={busy}
                  onChange={(e) => {
                    setCode(e.target.value);
                    setActionError(null);
                  }}
                  className="h-9 rounded-md border border-input bg-background px-3 tracking-widest text-sm"
                />
              </label>
              {actionError && (
                <p role="alert" data-testid="mfa-action-error" className="text-xs text-destructive">
                  {actionError}
                </p>
              )}
              <div className="flex items-center gap-2">
                <Button type="button" size="sm" data-testid="mfa-enroll-confirm" disabled={busy} onClick={() => void confirmEnroll()}>
                  {busy ? "Verifying…" : "Turn on two-factor"}
                </Button>
                <Button type="button" size="sm" variant="ghost" data-testid="mfa-enroll-cancel" disabled={busy} onClick={cancel}>
                  Cancel
                </Button>
              </div>
            </>
          ) : (
            actionError && (
              <p role="alert" className="text-xs text-destructive">
                {actionError}
              </p>
            )
          )}
        </div>
      )}

      {/* Disable flow (password step-up). */}
      {mode === "disabling" && (
        <div data-testid="mfa-disable-form" className="flex flex-col gap-3 rounded-xl border border-border bg-background/40 p-4">
          <p className="text-xs text-muted-foreground">
            Enter your password to turn off two-factor authentication.
          </p>
          <input
            type="password"
            aria-label="Current password"
            data-testid="mfa-disable-password"
            value={password}
            disabled={busy}
            autoComplete="current-password"
            onChange={(e) => {
              setPassword(e.target.value);
              setActionError(null);
            }}
            className="h-9 rounded-md border border-input bg-background px-3 text-sm"
          />
          {actionError && (
            <p role="alert" data-testid="mfa-action-error" className="text-xs text-destructive">
              {actionError}
            </p>
          )}
          <div className="flex items-center gap-2">
            <Button type="button" size="sm" variant="destructive" data-testid="mfa-disable-confirm" disabled={busy} onClick={() => void confirmDisable()}>
              {busy ? "Turning off…" : "Turn off"}
            </Button>
            <Button type="button" size="sm" variant="ghost" data-testid="mfa-disable-cancel" disabled={busy} onClick={cancel}>
              Cancel
            </Button>
          </div>
        </div>
      )}

      <p data-testid="mfa-recovery-note" className="text-[11px] text-muted-foreground">
        Lost access to your authenticator? There are no self-serve backup codes yet — contact{" "}
        <a href="mailto:support@chainreact.app" className="underline">
          support@chainreact.app
        </a>{" "}
        to verify your identity and remove the factor.
      </p>
    </div>
  );
}
