"use client";

import { useEffect, useRef, useState } from "react";
import {
  AccountApiError,
  getNotificationPreferences,
  updateNotificationPreferences,
  type NotificationPreferences,
} from "@/lib/api/accounts";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Panel } from "@/features/team/Panel";
import { SettingRow } from "@/features/team/SettingRow";

/**
 * Notification preferences section (Slice 4.ACCOUNT-SETTINGS-4).
 *
 * User-level boolean toggles, loaded from and saved to
 * `/api/account/notification-preferences`. Each toggle auto-saves on change
 * (optimistic; reverts + surfaces an error on failure) — matching the design's
 * instant switches. PREFERENCE flags only: this UI stores intent; no email /
 * push / Slack delivery, no per-account rules.
 */

interface PrefField {
  key: keyof NotificationPreferences;
  label: string;
  desc: string;
}

// Operational signals first; news last (matches the on/on/off default weighting).
const FIELDS: readonly PrefField[] = [
  {
    key: "workflowAlerts",
    label: "Workflow alerts",
    desc: "When a workflow run fails or needs your attention.",
  },
  {
    key: "teamActivity",
    label: "Team & member activity",
    desc: "Invites, joins, and role changes on your accounts.",
  },
  {
    key: "productUpdates",
    label: "Product updates",
    desc: "Occasional news about new ChainReact features.",
  },
];

export function NotificationsSection() {
  const [prefs, setPrefs] = useState<NotificationPreferences | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [busyKey, setBusyKey] = useState<keyof NotificationPreferences | null>(null);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fetchedRef = useRef(false);

  async function load() {
    setLoadError(false);
    try {
      setPrefs(await getNotificationPreferences());
    } catch {
      setLoadError(true);
    }
  }

  useEffect(() => {
    if (fetchedRef.current) return;
    fetchedRef.current = true;
    void load();
  }, []);

  async function toggle(key: keyof NotificationPreferences) {
    if (!prefs || busyKey) return;
    const previous = prefs;
    const next = { ...prefs, [key]: !prefs[key] };
    setPrefs(next); // optimistic
    setBusyKey(key);
    setSaved(false);
    setError(null);
    try {
      const stored = await updateNotificationPreferences(next);
      setPrefs(stored);
      setSaved(true);
    } catch (err) {
      setPrefs(previous); // revert
      setError(
        err instanceof AccountApiError ? err.message : "Couldn't save. Try again.",
      );
    } finally {
      setBusyKey(null);
    }
  }

  return (
    <div data-testid="account-section-notifications" className="flex flex-col gap-5">
      <Panel
        title="Notifications"
        desc="Choose what ChainReact tells you about. Changes save automatically."
      >
        {prefs === null ? (
          loadError ? (
            <div className="flex flex-col items-start gap-2 py-2">
              <p data-testid="notify-load-error" role="alert" className="text-sm text-destructive">
                Couldn't load your notification preferences.
              </p>
              <Button type="button" size="sm" variant="outline" data-testid="notify-retry" onClick={load}>
                Retry
              </Button>
            </div>
          ) : (
            <p data-testid="notify-loading" className="py-2 text-sm text-muted-foreground">
              Loading preferences…
            </p>
          )
        ) : (
          <>
            {FIELDS.map((f) => (
              <SettingRow key={f.key} label={f.label} desc={f.desc}>
                <Switch
                  data-testid={`notify-toggle-${f.key}`}
                  aria-label={f.label}
                  checked={prefs[f.key]}
                  disabled={busyKey !== null}
                  onCheckedChange={() => toggle(f.key)}
                />
              </SettingRow>
            ))}

            {saved && (
              <p role="status" data-testid="notify-saved" className="pt-3 text-xs text-emerald-600 dark:text-emerald-400">
                Preferences saved.
              </p>
            )}
            {error && (
              <p role="alert" data-testid="notify-error" className="pt-3 text-xs text-destructive">
                {error}
              </p>
            )}
          </>
        )}
      </Panel>
    </div>
  );
}
