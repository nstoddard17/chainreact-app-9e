import { redirect } from "next/navigation";
import { createClient } from "@/utils/supabase/server";
import { AcceptInvitationCard } from "@/features/invitations/AcceptInvitationCard";
import { AuthShell, AuthHeading } from "@/features/auth/AuthShell";

/**
 * Invitation acceptance route (5.ONBOARD-4 — closes the 4.ACCOUNT-MODEL-15 gap).
 *
 * WHY THIS EXISTS: `services/accounts/invitations.ts` has always minted
 * `acceptPath = "/invitations/accept?token=…"` and used it as the notification
 * `actionUrl`, but no page ever existed at that path — every invite link 404'd.
 * The whole server side (token hashing, expiry, single-use, email binding, seat
 * limits, auto-activation) was already correct and is UNCHANGED here; this route
 * is the missing front door to it.
 *
 * ── FLOW ──────────────────────────────────────────────────────────────────────
 *   1. No token          → a generic "link isn't valid" page. We do NOT say
 *                          whether a token exists, so the page reveals nothing.
 *   2. Not signed in     → bounce through /auth/sign-in with `returnTo` carrying
 *                          this exact URL, so the user lands back here after
 *                          signing in OR signing up. The invite deliberately does
 *                          not pre-create the user (invitations.ts), so the
 *                          sign-up path has to work — and it does, because the
 *                          token rides in the URL across the whole auth round
 *                          trip. This uses the EXISTING `returnTo` convention and
 *                          its `safeReturnPath` open-redirect sanitizer; no new
 *                          redirect surface is introduced.
 *   3. Signed in         → render the accept card. Acceptance is an explicit
 *                          POST the user triggers, never a side effect of this
 *                          GET. That matters: an invite token is SINGLE-USE, and
 *                          mail scanners / link previewers / browser prefetch
 *                          routinely issue GETs. Auto-accepting on render would
 *                          let a security scanner burn the invite before the
 *                          human ever clicked, and would also mutate on a method
 *                          that must stay safe.
 *
 * ── NO-LEAK ───────────────────────────────────────────────────────────────────
 * This page renders NOTHING derived from the token. It does not look the invite
 * up, so it cannot disclose the inviting account's name or existence, the invitee
 * address, the role, or whether the token is even real — to a signed-out visitor,
 * a stranger, or a wrong-account user alike. Every such fact is revealed only by
 * the POST, which the service gates on a session-email match. The account name
 * arrives only in the success response, after the caller has proven they are the
 * intended recipient.
 */
export default async function AcceptInvitationPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string | string[] }>;
}) {
  const params = await searchParams;
  const raw = Array.isArray(params.token) ? params.token[0] : params.token;
  const token = typeof raw === "string" && raw.length > 0 ? raw : null;

  if (!token) {
    return (
      <AuthShell showcase="sign-in">
        <AuthHeading eyebrow="Invitation" title="This link isn't valid">
          The invite link looks incomplete. Ask whoever invited you to send a new
          one.
        </AuthHeading>
      </AuthShell>
    );
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    // Round-trip through auth and come back to this exact URL. `returnTo` is
    // sanitized by `safeReturnPath` on the way out of the auth pages, so this
    // cannot become an open redirect.
    // No `reason=` param: that union is the anonymous-builder gate vocabulary
    // (features/auth/authReturnReason.ts) and inventing a member for it would
    // change unrelated auth copy. The sign-in page keeps its default heading.
    const returnTo = `/invitations/accept?token=${encodeURIComponent(token)}`;
    redirect(`/auth/sign-in?returnTo=${encodeURIComponent(returnTo)}`);
  }

  return <AcceptInvitationCard token={token} email={user.email ?? null} />;
}
