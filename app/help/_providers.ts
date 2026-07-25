import { getProvider, providerIconUrl } from "@/integrations/_registry";
import { descriptionFor } from "@/lib/apps/providerCategories";
import {
  HELP_PROVIDER_IDS,
  helpArticleForProvider,
} from "@/features/marketing/help/helpCatalog";
import type { HelpProviderEntry } from "@/features/marketing/help/helpTypes";

/**
 * Server-side builder for the Help Center's "Integration help" entries
 * (HELP-CENTER-1).
 *
 * Single source of truth: names come from the provider registry
 * (`integrations/_registry.ts` manifests), icons from `providerIconUrl`,
 * descriptions from the Apps page's `lib/apps/providerCategories.ts` map.
 * The Help Center never hardcodes provider names/icons of its own.
 *
 * Visibility: an entry renders only when the provider is registered,
 * enabled, and not experimental — the same `isEnabled && !isExperimental`
 * rule as the Apps catalog (`isCatalogVisible` in app/apps/_shared.ts).
 * That helper stays module-private and its MCP-preview carve-out doesn't
 * apply to this curated list, so the rule is restated here rather than
 * importing the whole Apps route module. An entry also needs a dedicated
 * help article (`providerId` in the catalog) — no article, no card.
 */
export function buildHelpProviderEntries(
  ids: readonly string[] = HELP_PROVIDER_IDS,
): HelpProviderEntry[] {
  const entries: HelpProviderEntry[] = [];
  for (const id of ids) {
    const manifest = getProvider(id);
    if (!manifest) continue;
    if (!manifest.isEnabled || manifest.isExperimental) continue;
    const article = helpArticleForProvider(id);
    if (!article) continue;
    entries.push({
      id,
      name: manifest.displayName,
      description: descriptionFor(id),
      iconUrl: providerIconUrl(id),
      articleSlug: article.slug,
    });
  }
  return entries;
}
