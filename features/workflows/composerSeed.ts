"use client";

import { useEffect, useRef } from "react";

/**
 * 5.DUAL-BUILDER-1 CS-7 — the ONE keyed/versioned seed contract between Document
 * controls and the single existing React Agent composer (WorkflowGuidancePanel).
 *
 * Replaces the one-shot `initialComposerValue` behaviour. There is still exactly
 * ONE conversation and ONE composer; a seed only ever fills that composer — it
 * NEVER auto-sends, never opens a second conversation, and never touches the
 * preview/transcript. Every Document Ask React control (empty-state, persistent
 * bar, insertion menu) is an EXPLICIT user action and mints a NEW version, so a
 * second rapid request reliably supersedes the first UNSENT seeded text instead
 * of being silently ignored. An unrelated re-render carries the SAME version and
 * is a no-op, so text the user typed by hand is never clobbered by rendering.
 *
 * The `restore` source (ANON-BUILDER-2 anonymous-draft handoff) is NOT an
 * explicit editing action, so it only FILLS an empty composer — it must not
 * overwrite whatever the user has already typed.
 */
export type ComposerSeedSource =
  | "document-empty"
  | "document-bar"
  | "document-insert"
  | "restore";

export interface ComposerSeed {
  /** The plain-language text to place in the composer (never auto-sent). */
  readonly value: string;
  /** Monotonically increasing; a strictly higher version supersedes. */
  readonly version: number;
  /** Where the seed came from — decides overwrite vs. fill-if-empty. */
  readonly source: ComposerSeedSource;
}

/**
 * Pure rule: an explicit Document Ask React action REPLACES the composer (it may
 * overwrite unsent seeded OR manually-typed text — the user asked for it); a
 * restore seed only fills an empty composer.
 */
export function composerSeedApplyMode(
  source: ComposerSeedSource,
): "replace" | "fill-if-empty" {
  return source === "restore" ? "fill-if-empty" : "replace";
}

/**
 * Wire a versioned seed to a composer's `setInput`. Applies each version at most
 * once (monotonic), so unrelated renders never re-seed. Never auto-sends.
 *
 * `setInput` must accept both a value and an updater (React `useState` setter),
 * so the fill-if-empty path can read the latest input without a dependency.
 */
export function useComposerSeed(
  seed: ComposerSeed | undefined,
  setInput: (next: string | ((current: string) => string)) => void,
): void {
  const appliedVersionRef = useRef(0);
  useEffect(() => {
    if (!seed) return;
    if (seed.version <= appliedVersionRef.current) return;
    // Mark processed BEFORE applying so a re-render with the same version (or a
    // superseded lower version arriving late) is ignored — the latest wins.
    appliedVersionRef.current = seed.version;
    if (composerSeedApplyMode(seed.source) === "replace") {
      setInput(seed.value);
    } else {
      setInput((current) => (current.trim().length === 0 ? seed.value : current));
    }
    // Intentionally keyed on the seed object identity: WorkflowBuilder produces a
    // new object only when a NEW seed version is minted.
  }, [seed, setInput]);
}
