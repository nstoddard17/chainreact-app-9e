import type { Metadata } from "next";
import { PrivacyPage } from "@/features/marketing/PrivacyPage";

/**
 * Public Privacy page (Slice 4.PRIVACY-1).
 *
 * Thin route shell. The page is a static legal/trust surface accessible to
 * everyone (signed-in or out), so — like /security and unlike the homepage —
 * it does no auth gate and no redirect. All content + chrome lives in the
 * feature component, which carries the `[data-marketing-surface]` token scope.
 */
export const metadata: Metadata = {
  title: "Privacy — ChainReact",
  description:
    "How ChainReact collects and uses account, workflow, integration, billing, and run data, how connected app data powers authorized workflows, and how AI features use limited, safe context. We do not sell connected app data.",
};

export default function Page() {
  return <PrivacyPage />;
}
