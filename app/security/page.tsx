import type { Metadata } from "next";
import { SecurityPage } from "@/features/marketing/SecurityPage";

/**
 * Public Security / Trust page (Slice 4.SECURITY-1).
 *
 * Thin route shell. The page is a static trust surface accessible to
 * everyone (signed-in or out), so — unlike the homepage — it does no auth
 * gate and no redirect. All content + chrome lives in the feature
 * component, which carries the `[data-marketing-surface]` token scope.
 */
export const metadata: Metadata = {
  title: "Security — ChainReact",
  description:
    "How ChainReact protects your accounts, connected apps, workflows, and automation data: account-scoped access, OAuth credential protection, role-based team access, and careful AI data handling.",
};

export default function Page() {
  return <SecurityPage />;
}
