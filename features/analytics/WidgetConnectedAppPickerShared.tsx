"use client";

import { useEffect, useState } from "react";
import { fetchOptionsSource, type OptionItem } from "@/lib/api/options";
import { SectionHeading } from "./widgetConfigParts";

/**
 * Shared primitive for the connected-app picker field components (split out of
 * WidgetConnectedAppPickers.tsx in the Monday-slice cleanup to keep each
 * provider-group module under the leaf line-count cap). Pure move — NO behavior
 * change.
 *
 * Options-backed `<select>` picker: loads a single page from an options source and
 * renders disconnected / loading / error / select states. No free-text entry — only
 * a selected option value is written. Used by the dep-less option pickers (Slack
 * channel, Gmail label, Outlook folder, Outlook calendar, Trello board, Airtable
 * base, Monday board); each pins the analytics query to a real, viewer-owned id.
 */
export function OptionsSelectField({
  source,
  icon,
  sectionLabel,
  hint,
  disconnectedHint,
  loadingNoun,
  errorFallback,
  ariaLabel,
  placeholder,
  value,
  onChange,
  connected,
}: {
  source: string;
  icon: string;
  sectionLabel: string;
  hint: string;
  disconnectedHint: string;
  loadingNoun: string;
  errorFallback: string;
  ariaLabel: string;
  placeholder: string;
  value: string;
  onChange: (v: string) => void;
  connected: boolean;
}) {
  type LoadState =
    | { status: "loading" }
    | { status: "ok"; items: readonly OptionItem[] }
    | { status: "error"; message: string };
  const [state, setState] = useState<LoadState>({ status: "loading" });

  useEffect(() => {
    if (!connected) return;
    let cancelled = false;
    setState({ status: "loading" });
    fetchOptionsSource(source)
      .then((res) => {
        if (cancelled) return;
        if (res.ok) setState({ status: "ok", items: res.items });
        else setState({ status: "error", message: res.message });
      })
      .catch(() => {
        if (!cancelled) setState({ status: "error", message: errorFallback });
      });
    return () => {
      cancelled = true;
    };
  }, [connected, source, errorFallback]);

  return (
    <section className="flex flex-col gap-2">
      <SectionHeading icon={icon} label={sectionLabel} />
      <p className="text-xs text-muted-foreground">{hint}</p>
      {!connected ? (
        <div className="rounded-lg border border-border bg-muted px-3 py-2 text-[12px] text-muted-foreground">
          {disconnectedHint}
        </div>
      ) : state.status === "loading" ? (
        <div className="animate-pulse rounded-lg border border-border bg-muted px-3 py-2 text-[12px] text-muted-foreground">
          Loading {loadingNoun}…
        </div>
      ) : state.status === "error" ? (
        <div className="rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2 text-[12px] text-muted-foreground">
          {state.message}
        </div>
      ) : (
        <select
          className="w-full rounded-lg border border-border bg-muted px-3 py-2 text-[13px] text-foreground outline-none focus:border-primary"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          aria-label={ariaLabel}
        >
          <option value="">{placeholder}</option>
          {state.items.map((item) => (
            <option key={item.value} value={item.value}>
              {item.label}
            </option>
          ))}
        </select>
      )}
    </section>
  );
}
