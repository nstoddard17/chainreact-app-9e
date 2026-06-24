import { redirect } from "next/navigation";
import { createClient } from "@/utils/supabase/server";
import { AnonymousDraftRestorer } from "@/features/workflow-builder/AnonymousDraftRestorer";

/**
 * ANON-BUILDER-2 — controlled post-auth restore route.
 *
 * The anonymous-builder gates (`/start`) send logged-out visitors to sign-up/
 * sign-in with `returnTo=/start/continue`. After auth they land here, where the
 * client restorer turns their saved local draft into a REAL account-owned
 * workflow (draft only) and forwards them into the real builder.
 *
 * This route is AUTH-GATED: if a user somehow reaches it logged out, we bounce
 * them to sign-in (carrying the reason for contextual copy) — no anonymous work
 * happens here. The actual create/update uses the authenticated typed client
 * inside the restorer, so all RLS/auth/account rules apply normally.
 */
export default async function StartContinuePage({
  searchParams,
}: {
  searchParams: Promise<{ reason?: string }>;
}) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    const { reason } = await searchParams;
    redirect(
      `/auth/sign-in?returnTo=${encodeURIComponent("/start/continue")}${reason ? `&reason=${encodeURIComponent(reason)}` : ""}`,
    );
  }

  return (
    <main
      data-testid="anonymous-restore-route"
      className="flex min-h-screen items-center justify-center p-8"
    >
      <AnonymousDraftRestorer />
    </main>
  );
}
