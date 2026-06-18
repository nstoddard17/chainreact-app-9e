import type { Metadata } from "next";
import { PricingPage } from "@/features/marketing/PricingPage";

/**
 * Public Pricing page (Slice 4.PRICING-1).
 *
 * Thin route shell. Like /privacy and /security (and unlike the homepage),
 * this is a static public marketing surface accessible to everyone, with no
 * auth gate or redirect. All content + chrome lives in the feature component,
 * which carries the `[data-marketing-surface]` token scope.
 */
export const metadata: Metadata = {
  title: "Pricing — ChainReact",
  description:
    "ChainReact pricing across Free, Pro, Team, Business, and Enterprise plans. Start free and upgrade as your workflows, team, and AI usage grow. Workflow tasks and AI credits are metered separately.",
};

export default function Page() {
  return <PricingPage />;
}
