import { redirect } from "next/navigation";
import { createClient } from "@/utils/supabase/server";
import * as integrationsRepo from "@/repositories/integrations";
import { ConnectionStatusBanner } from "@/features/integrations/ConnectionStatusBanner";
import { AppsDashboard } from "@/features/apps/AppsDashboard";
import { AppShell } from "@/components/app-shell/AppShell";
import { buildCategoryList, resolveAppCatalog } from "./_shared";

interface Props {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

/**
 * Apps dashboard route (Slice 4.APPS-PAGE-1).
 *
 * Thin server component: auth gate → parallel fetch (provider catalog is a
 * pure registry read, no I/O; integrations is one user-scoped query) →
 * project to the route-safe `AppCatalogItem[]` shape → render the client
 * `AppsDashboard`. The page reuses the existing `ConnectionStatusBanner`
 * so the post-OAuth toast keeps working at the new route.
 *
 * The OAuth callback (`/api/integrations/oauth/[provider]/callback`) was
 * updated in this slice to redirect to `/apps?integration=connected&
 * provider=<id>` so this banner is the right home for that toast.
 */
export default async function AppsPage({ searchParams }: Props) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/auth/sign-in");

  const params = await searchParams;
  const records = await integrationsRepo.listActiveByUser(user.id);
  const items = resolveAppCatalog(records);
  const categories = buildCategoryList(items);

  return (
    <AppShell userEmail={user.email ?? ""}>
      <main className="mx-auto flex w-full max-w-7xl flex-col gap-6 p-6 sm:p-8">
        <ConnectionStatusBanner searchParams={params} />
        <AppsDashboard items={items} categories={categories} />
      </main>
    </AppShell>
  );
}
