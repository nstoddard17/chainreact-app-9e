import { notFound, redirect } from "next/navigation";
import { AppShell } from "@/components/app-shell/AppShell";
import { ReactAgentFeedbackDashboard } from "@/features/admin/react-agent/ReactAgentFeedbackDashboard";
import { loadInternalAdmin } from "@/app/api/internal/react-agent/_shared";

/**
 * /admin/react-agent — ChainReact COMPANY-internal React Agent feedback
 * dashboard (INTERNAL-FEEDBACK-1).
 *
 * Server component, gated by the internal-admin seam (`loadInternalAdmin`):
 *   - signed-out  → redirect to sign-in (so they can authenticate);
 *   - signed-in but NOT an internal admin (incl. customer account owners /
 *     team admins / org admins) → `notFound()` — the surface is undiscoverable,
 *     never a 403 that would confirm it exists;
 *   - internal admin → render the (empty) dashboard shell.
 *
 * This slice renders NO metrics; the shell shows honest empty states only. The
 * gate is the point of this page — the API at `/api/internal/react-agent/*`
 * enforces the SAME gate server-side, so access does not depend on hiding UI.
 */
export default async function ReactAgentFeedbackPage() {
  const state = await loadInternalAdmin();
  if (state.status === "anonymous") redirect("/auth/sign-in");
  if (state.status !== "ok") notFound();

  return (
    <AppShell userEmail={state.email} unreadNotifications={0} recentNotifications={[]}>
      <ReactAgentFeedbackDashboard />
    </AppShell>
  );
}
