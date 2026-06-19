import type { Metadata } from "next";
import { TermsPage } from "@/features/marketing/TermsPage";

/**
 * Public Terms of Service page (Slice 4.TERMS-1).
 *
 * Thin route shell. The page is a static legal surface accessible to everyone
 * (signed-in or out), so — like /privacy and /security and unlike the homepage
 * — it does no auth gate and no redirect. All content + chrome lives in the
 * feature component, which carries the `[data-marketing-surface]` token scope.
 *
 * Fixes the missing /terms route (previously a 404, e.g. for the Slack
 * Marketplace listing at chainreact.app/terms).
 */
export const metadata: Metadata = {
  title: "Terms of Service - ChainReact",
  description:
    "The terms that govern your access to and use of ChainReact: accounts, connected integrations, workflows, acceptable use, billing, AI features, disclaimers, and liability.",
};

export default function Page() {
  return <TermsPage />;
}
