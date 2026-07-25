"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { fetchOptionsSource } from "@/lib/api/options";
import { AnalyticsIcon } from "@/components/analytics/icons";

/**
 * Generic entity picker for Custom Insights (CD-3A) — search, single/multi
 * select up to `max`, stable ids, visible selections that survive search
 * changes, clear, keyboard use (native buttons/inputs only).
 *
 * Option supply is METADATA-driven, never entity-specific:
 *   - `options`   → a caller-provided safe listing (e.g. the account workflow
 *                   list the page already loads) filtered locally.
 *   - `optionsSource` → a registered options resolver, queried through the
 *                   typed options API client with debounce + abort (never a
 *                   request per keystroke).
 * Workflows are just one caller of this — nothing here knows what a
 * "workflow" is.
 */

export interface InsightEntityOption {
  value: string;
  label: string;
}

const SEARCH_DEBOUNCE_MS = 350;

export function InsightEntityPicker({
  label,
  selected,
  max,
  onChange,
  options,
  optionsSource,
}: {
  label: string;
  selected: readonly string[];
  max: number;
  onChange: (ids: string[]) => void;
  options?: readonly InsightEntityOption[];
  optionsSource?: string | null;
}) {
  const [query, setQuery] = useState("");
  const [remote, setRemote] = useState<readonly InsightEntityOption[]>([]);
  const [remoteState, setRemoteState] = useState<"idle" | "loading" | "error">("idle");
  // Labels for every option ever seen, so selected chips stay labeled when
  // the search changes or remote pages move on. Ids are the stable identity.
  const knownLabels = useRef(new Map<string, string>());

  const remoteMode = !options && typeof optionsSource === "string" && optionsSource.length > 0;

  useEffect(() => {
    if (!remoteMode) return;
    let cancelled = false;
    const controller = new AbortController();
    setRemoteState("loading");
    const timer = setTimeout(() => {
      fetchOptionsSource(optionsSource!, {
        q: query.trim(),
        signal: controller.signal,
      })
        .then((res) => {
          if (cancelled) return;
          if (res.ok) {
            const items = res.items.map((i) => ({ value: i.value, label: i.label }));
            for (const item of items) knownLabels.current.set(item.value, item.label);
            setRemote(items);
            setRemoteState("idle");
          } else {
            setRemoteState("error");
          }
        })
        .catch(() => {
          if (!cancelled) setRemoteState("error");
        });
    }, SEARCH_DEBOUNCE_MS);
    return () => {
      cancelled = true;
      controller.abort();
      clearTimeout(timer);
    };
  }, [remoteMode, optionsSource, query]);

  const localFiltered = useMemo(() => {
    if (!options) return [];
    for (const o of options) knownLabels.current.set(o.value, o.label);
    const q = query.trim().toLowerCase();
    return q ? options.filter((o) => o.label.toLowerCase().includes(q)) : options;
  }, [options, query]);

  const visible = remoteMode ? remote : localFiltered;
  const atCap = selected.length >= max;

  const toggle = (value: string) => {
    if (selected.includes(value)) {
      onChange(selected.filter((v) => v !== value));
    } else if (max === 1) {
      onChange([value]);
    } else if (!atCap) {
      onChange([...selected, value]);
    }
  };

  return (
    <div className="flex flex-col gap-1.5">
      {selected.length > 0 && (
        <div className="flex flex-wrap items-center gap-1">
          {selected.map((id) => (
            <span
              key={id}
              className="inline-flex max-w-full items-center gap-1 rounded-md border border-primary/40 bg-primary/10 px-1.5 py-0.5 text-[11px] text-foreground"
            >
              <span className="truncate">{knownLabels.current.get(id) ?? id}</span>
              <button
                type="button"
                className="text-muted-foreground hover:text-foreground"
                onClick={() => toggle(id)}
                aria-label={`Remove ${knownLabels.current.get(id) ?? id}`}
              >
                <AnalyticsIcon name="X" size={9} />
              </button>
            </span>
          ))}
          <button
            type="button"
            className="text-[10.5px] text-muted-foreground hover:text-foreground"
            onClick={() => onChange([])}
          >
            Clear
          </button>
        </div>
      )}

      <div className="flex items-center gap-1.5 rounded-md border border-border bg-muted px-2 py-1">
        <span className="text-muted-foreground">
          <AnalyticsIcon name="Search" size={11} />
        </span>
        <input
          className="w-full bg-transparent text-[12px] text-foreground outline-none placeholder:text-muted-foreground"
          placeholder={`Search ${label.toLowerCase()}…`}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          aria-label={`Search ${label}`}
        />
      </div>

      <div className="max-h-[150px] overflow-y-auto rounded-md border border-border" role="listbox" aria-label={label}>
        {remoteMode && remoteState === "loading" && (
          <div className="px-2 py-2 text-[11px] text-muted-foreground">Searching…</div>
        )}
        {remoteMode && remoteState === "error" && (
          <div className="px-2 py-2 text-[11px] text-muted-foreground">
            Couldn't load choices. Adjust the search to try again.
          </div>
        )}
        {visible.map((o) => {
          const on = selected.includes(o.value);
          return (
            <button
              key={o.value}
              type="button"
              role="option"
              aria-selected={on}
              className={
                "flex w-full items-center justify-between gap-2 px-2 py-1.5 text-left text-[12px] hover:bg-muted disabled:opacity-40 " +
                (on ? "text-primary" : "text-foreground/85")
              }
              onClick={() => toggle(o.value)}
              disabled={!on && max > 1 && atCap}
            >
              <span className="truncate">{o.label}</span>
              {on && <AnalyticsIcon name="Check" size={11} />}
            </button>
          );
        })}
        {visible.length === 0 && (!remoteMode || remoteState === "idle") && (
          <div className="px-2 py-2 text-[11px] text-muted-foreground">No matches.</div>
        )}
      </div>
      {max > 1 && (
        <div className="text-[10.5px] text-muted-foreground">
          {selected.length}/{max} selected
        </div>
      )}
    </div>
  );
}
