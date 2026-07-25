import type { Metadata } from "next";
import { HelpCenterPage } from "@/features/marketing/HelpCenterPage";
import { buildHelpProviderEntries } from "./_providers";

/**
 * Public Help Center route (HELP-CENTER-1).
 *
 * Thin route shell in the marketing static-page idiom (pricing/privacy/
 * security): no auth gate, no redirect — the page works signed-in or
 * signed-out. Provider entries for the "Integration help" section are
 * built here on the server from the real provider registry, so the client
 * bundle never imports provider manifests.
 */
export const metadata: Metadata = {
  title: "Help Center — ChainReact",
  description:
    "Learn how to connect your apps, build and test workflows, and troubleshoot problems — plus answers about accounts, teams, billing, and usage.",
};

export default function Page() {
  return <HelpCenterPage providers={buildHelpProviderEntries()} />;
}
