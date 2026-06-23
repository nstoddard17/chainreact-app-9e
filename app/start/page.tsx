import { redirect } from "next/navigation";
import { createClient } from "@/utils/supabase/server";
import { listProviders, providerIconUrl } from "@/integrations/_registry";
import { buildRequiredFieldsByType } from "@/features/workflow-builder/validation/buildRequiredFieldsByType";
import { buildPreviewSetupFields } from "@/core/workflows/previewSetupFields";
import {
  listAllActionMetas,
  listAllTriggerMetas,
} from "@/services/discovery/_registry";
import { AnonymousBuilder } from "@/features/workflow-builder/AnonymousBuilder";

/**
 * Public anonymous "build locally" route (ANON-BUILDER-1), served at `/start`.
 *
 * The marketing homepage prompt sends logged-out visitors here so they can lay
 * out a workflow in the real builder WITHOUT signing in. The page is public —
 * unlike `/workflows/[id]`, there is no auth redirect. It does NOT create a
 * workflow, touch an account, or write anything: the builder mounts in
 * `localOnly` mode against an in-memory-only draft, and every identity action
 * (save / connect / run / activate / paid AI) is gated to sign-up.
 *
 * Logged-in users have account-scoped builders, so the local-only experience is
 * for logged-out visitors only — authenticated users are sent to their real
 * workflows home.
 *
 * Provider + required-field metadata is built from the discovery registry, which
 * is static and needs no auth (the same lookups the authenticated builder route
 * does). No per-user data is read for an anonymous visitor.
 *
 * NOTE: the route lives at `/start` rather than `/build` because the repo's
 * `.gitignore` ignores any directory named `build`, which would silently drop an
 * `app/build/` route from version control + deploys.
 */
export default async function StartPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (user) redirect("/workflows");

  const requiredFieldsByType = buildRequiredFieldsByType(
    listAllActionMetas(),
    listAllTriggerMetas(),
  );
  const setupFieldsByType = buildPreviewSetupFields(
    listAllActionMetas(),
    listAllTriggerMetas(),
  );

  const providers = listProviders();
  const triggerProviders = providers
    .filter((p) => p.isEnabled && p.capabilities.webhookTrigger)
    .map((p) => ({
      id: p.id,
      displayName: p.displayName,
      iconUrl: providerIconUrl(p.id),
    }));
  const actionProviders = providers
    .filter((p) => p.isEnabled && p.capabilities.actions)
    .map((p) => ({
      id: p.id,
      displayName: p.displayName,
      iconUrl: providerIconUrl(p.id),
    }));

  return (
    <main
      data-testid="anonymous-builder-route"
      data-builder-surface
      className="flex h-screen flex-col overflow-hidden"
    >
      <AnonymousBuilder
        triggerProviders={triggerProviders}
        actionProviders={actionProviders}
        requiredFieldsByType={requiredFieldsByType}
        setupFieldsByType={setupFieldsByType}
      />
    </main>
  );
}
