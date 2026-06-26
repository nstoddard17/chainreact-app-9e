import type {
  MarketplaceTemplateSummary,
  TemplateCategoryKey,
} from "@/contracts/workflowTemplate";
import {
  categoryLabel,
  humanizeType,
  providerLabel,
  TRIGGER_KIND_LABELS,
} from "./templateCardMeta";

/**
 * Pure marketplace browse helpers (CS-XT-MARKETPLACE-UX-SEARCH): search, filter, and
 * deterministic sort over {@link MarketplaceTemplateSummary}. Extracted from the dashboard so the
 * matching/ordering rules are directly unit-testable and the component stays a thin orchestrator.
 *
 * SAFETY: search reads ONLY safe, already-derived fields — title, description, and the
 * credential-free card labels (category, trigger kind, required app names, humanized step
 * labels). It NEVER touches a raw definition, config value, or any id. Everything here is
 * client-safe (imports only contract types + the pure label helpers).
 */

export type TemplateSortMode = "recommended" | "name" | "fewest-steps" | "most-steps";

/** Sort options for the marketplace selector. `recommended` preserves the server's order
 *  (no client reorder). No popularity / rating / usage / "trending" ordering — those would be
 *  invented signals (official rows all share usage_count 0). */
export const TEMPLATE_SORTS: ReadonlyArray<{ key: TemplateSortMode; label: string }> = [
  { key: "recommended", label: "Recommended" },
  { key: "name", label: "Name A–Z" },
  { key: "fewest-steps", label: "Fewest steps" },
  { key: "most-steps", label: "Most steps" },
];

export interface MarketplaceFilter {
  query: string;
  category: TemplateCategoryKey | "all";
  provider: string | "all";
}

/** Lowercased searchable text from SAFE fields only. Title + description + derived card labels
 *  (category, trigger kind, required apps, humanized step labels). Never config / ids / JSON. */
export function templateSearchText(t: MarketplaceTemplateSummary): string {
  const parts: string[] = [t.name, t.description ?? ""];
  const card = t.card;
  if (card) {
    parts.push(categoryLabel(card.category));
    parts.push(TRIGGER_KIND_LABELS[card.triggerKind]);
    for (const p of card.providers) parts.push(providerLabel(p));
    for (const s of card.steps) {
      parts.push(providerLabel(s.provider));
      parts.push(humanizeType(s.type));
    }
  }
  // Join with a separator that can't bridge two fields into a false match.
  return parts.join(" • ").toLowerCase();
}

/** Case-insensitive, trimmed substring match against {@link templateSearchText}. Empty → match. */
export function templateMatchesQuery(t: MarketplaceTemplateSummary, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  return templateSearchText(t).includes(q);
}

/** Apply search + category + provider as AND conditions. Pure; returns a new array. */
export function filterMarketplaceTemplates(
  list: readonly MarketplaceTemplateSummary[],
  filter: MarketplaceFilter,
): MarketplaceTemplateSummary[] {
  return list.filter((t) => {
    if (filter.category !== "all" && t.card?.category !== filter.category) return false;
    if (filter.provider !== "all" && !(t.card?.providers ?? []).includes(filter.provider)) return false;
    if (!templateMatchesQuery(t, filter.query)) return false;
    return true;
  });
}

/** Deterministic sort. `recommended` keeps input (server) order; step modes tie-break by name so
 *  the result is stable. Returns a new array (never mutates the input). */
export function sortMarketplaceTemplates(
  list: readonly MarketplaceTemplateSummary[],
  mode: TemplateSortMode,
): MarketplaceTemplateSummary[] {
  const arr = list.slice();
  const steps = (t: MarketplaceTemplateSummary) => t.card?.stepCount ?? 0;
  switch (mode) {
    case "name":
      arr.sort((a, b) => a.name.localeCompare(b.name));
      break;
    case "fewest-steps":
      arr.sort((a, b) => steps(a) - steps(b) || a.name.localeCompare(b.name));
      break;
    case "most-steps":
      arr.sort((a, b) => steps(b) - steps(a) || a.name.localeCompare(b.name));
      break;
    case "recommended":
    default:
      break; // preserve repository order
  }
  return arr;
}

/** True when any search/filter narrows the list (drives the Clear-filters control). */
export function isMarketplaceFilterActive(filter: MarketplaceFilter): boolean {
  return filter.query.trim() !== "" || filter.category !== "all" || filter.provider !== "all";
}
