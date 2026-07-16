"use client";

import { create } from "zustand";

/**
 * Resource label cache (CONFIG-UX-NODE-SUMMARY-1).
 *
 * Config stores provider IDENTIFIERS (`C123`, `cus_9`, `price_1`) because that
 * is what the runtime handlers require — that contract never changes. But the
 * builder must SHOW recognizable names ("#support-alerts"), both in the
 * config-panel overview and anywhere a node is summarized.
 *
 * This is the bridge: pickers write `(optionsSource, value) → label` here as
 * they load options or as the user selects one; summaries read it. It is a
 * pure display cache:
 *
 *   - It NEVER influences what is saved. Values are always the raw ids the
 *     picker committed.
 *   - A miss is honest: the summary shows the stored id (flagged unresolved)
 *     rather than inventing a name — same posture as the picker's
 *     "unavailable saved selection" hint.
 *   - It is session-scoped and disposable. Clearing it degrades display only.
 *   - Manual-entry values are cached label=value (the user typed the id
 *     itself), so they render consistently without pretending to be a name.
 *
 * Keyed by `source|value` so two providers can't collide on a bare id.
 */

function keyOf(source: string, value: string): string {
  return `${source}|${value}`;
}

interface ResourceLabelCacheState {
  readonly labels: Readonly<Record<string, string>>;
  /** Record one resolved label. No-op when value/label are empty. */
  setLabel: (source: string, value: string, label: string) => void;
  /** Record many at once (a picker's loaded page) in a single update. */
  setLabels: (
    source: string,
    items: ReadonlyArray<{ value: string; label: string }>,
  ) => void;
  /** Lookup; `undefined` when unknown (caller must fall back honestly). */
  getLabel: (source: string, value: string) => string | undefined;
  reset: () => void;
}

export const useResourceLabelCache = create<ResourceLabelCacheState>((set, get) => ({
  labels: {},
  setLabel: (source, value, label) => {
    if (!source || !value || !label) return;
    const k = keyOf(source, value);
    if (get().labels[k] === label) return; // no re-render for a repeat write
    set((s) => ({ labels: { ...s.labels, [k]: label } }));
  },
  setLabels: (source, items) => {
    if (!source || items.length === 0) return;
    const current = get().labels;
    let changed = false;
    const next: Record<string, string> = { ...current };
    for (const item of items) {
      if (!item.value || !item.label) continue;
      const k = keyOf(source, item.value);
      if (next[k] !== item.label) {
        next[k] = item.label;
        changed = true;
      }
    }
    if (changed) set({ labels: next });
  },
  getLabel: (source, value) => get().labels[keyOf(source, value)],
  reset: () => set({ labels: {} }),
}));

/**
 * Non-reactive reader for pure summary builders (`labelFor`). Reads the
 * current snapshot; components that must re-render on cache changes should
 * subscribe with `useResourceLabelCache((s) => s.labels)` instead.
 */
export function readResourceLabel(
  labels: Readonly<Record<string, string>>,
  source: string,
  value: string,
): string | undefined {
  return labels[keyOf(source, value)];
}
