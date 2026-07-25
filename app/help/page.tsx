import type { Metadata } from "next";
import { createClient } from "@/utils/supabase/server";
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
 *
 * Unlike the other marketing pages, the session IS resolved (read-only,
 * never a redirect) so the header can show "Open ChainReact" to a
 * signed-in user instead of Sign in / Try it free — the Help Center is
 * linked from inside the authenticated app.
 */
export const metadata: Metadata = {
  title: "Help Center — ChainReact",
  description:
    "Learn how to connect your apps, build and test workflows, and troubleshoot problems — plus answers about accounts, teams, billing, and usage.",
};

export default async function Page() {
  return (
    <HelpCenterPage
      providers={buildHelpProviderEntries()}
      authenticated={await resolveViewerAuthenticated()}
    />
  );
}

/**
 * Read-only viewer-session check (header CTA variant only — never a gate or
 * redirect). Lives in page.tsx per the PR-AUTH-7 lint carve-out for the
 * canonical zero-arg SSR getUser(). Fail-safe: any error renders the
 * signed-out header, never a broken page.
 */
async function resolveViewerAuthenticated(): Promise<boolean> {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    return user != null;
  } catch {
    return false;
  }
}
