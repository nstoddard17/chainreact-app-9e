import { redirect } from "next/navigation";
import { createClient } from "@/utils/supabase/server";
import { getProvider, providerIconUrl } from "@/integrations/_registry";
import { MarketingHome } from "@/features/marketing/MarketingHome";
import type { MarketingMarqueeProvider } from "@/features/marketing/marqueeProviders";

/**
 * Public marketing landing page (Slice 4.HOMEPAGE-V2-1).
 *
 * Thin server component:
 *   - Signed-in users → server-redirect to `/workflows` (their real home).
 *   - Signed-out users → render the `Homepage v2` marketing surface.
 *
 * Resolves the LogoMarquee's provider strip server-side via the
 * `@/integrations/_registry` (project structure rules forbid `features/`
 * from importing `integrations/`; route shells can). Unregistered ids
 * drop out of the list so a future rename can't render a broken chip.
 */
const MARQUEE_PROVIDER_IDS: readonly string[] = [
  "stripe",
  "slack",
  "notion",
  "gmail",
  "github",
  "hubspot",
  "mailchimp",
  "microsoft-outlook",
  "shopify",
  "airtable",
  "discord",
  "trello",
];

function resolveMarqueeProviders(): readonly MarketingMarqueeProvider[] {
  return MARQUEE_PROVIDER_IDS.flatMap((id) => {
    const m = getProvider(id);
    if (!m) return [];
    return [{ id, label: m.displayName, iconUrl: providerIconUrl(id) ?? null }];
  });
}

export default async function HomePage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (user) redirect("/workflows");

  const providers = resolveMarqueeProviders();
  return <MarketingHome marqueeProviders={providers} />;
}
