"use client";

import { useEffect, useState } from "react";
import {
  getDefaultBuilderView,
  updateDefaultBuilderView,
  type DefaultBuilderView,
} from "@/lib/api/accounts";

/**
 * Default-builder-view selector (BUILDER-VIEW-DEFAULT-1).
 *
 * The ONE control for the per-user default view, reused by Account settings
 * (BuilderPreferencesSection) and the builder's Settings tab. Three honest
 * options: Ask each time (null — new workflows show the chooser), Visual,
 * Document. Loads the stored value on mount; saves optimistically with
 * revert-on-error (same posture as NotificationsSection). Only rendered on
 * surfaces where the Document Builder flag is on — with one view there is
 * nothing to choose.
 */

const OPTIONS: ReadonlyArray<{ value: "ask" | "visual" | "document"; label: string }> = [
  { value: "ask", label: "Ask each time (on new workflows)" },
  { value: "visual", label: "Visual builder" },
  { value: "document", label: "Document builder" },
];

export function DefaultBuilderViewControl() {
  const [value, setValue] = useState<DefaultBuilderView | "loading">("loading");
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    let active = true;
    getDefaultBuilderView()
      .then((v) => {
        if (active) setValue(v);
      })
      .catch(() => {
        if (active) {
          setValue(null);
          setError("Couldn't load your saved preference.");
        }
      });
    return () => {
      active = false;
    };
  }, []);

  async function handleChange(raw: string) {
    const next: DefaultBuilderView =
      raw === "visual" || raw === "document" ? raw : null;
    const prev = value === "loading" ? null : value;
    setValue(next);
    setError(null);
    setSaved(false);
    try {
      await updateDefaultBuilderView(next);
      setSaved(true);
    } catch {
      setValue(prev);
      setError("Couldn't save your preference. Try again.");
    }
  }

  const selectValue = value === "loading" ? "ask" : (value ?? "ask");

  return (
    <div className="flex flex-col items-start gap-1">
      <select
        data-testid="default-builder-view-select"
        aria-label="Default builder view"
        value={selectValue}
        disabled={value === "loading"}
        onChange={(e) => void handleChange(e.target.value)}
        className="h-9 rounded-md border border-input bg-background px-2 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-60"
      >
        {OPTIONS.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
      {error && (
        <span role="alert" data-testid="default-builder-view-error" className="text-xs text-destructive">
          {error}
        </span>
      )}
      {saved && !error && (
        <span data-testid="default-builder-view-saved" className="text-xs text-muted-foreground">
          Saved.
        </span>
      )}
    </div>
  );
}
