"use client";

import { useState } from "react";
import { AuthShell, AuthHeading } from "@/features/auth/AuthShell";
import { AuthFormError } from "@/features/auth/AuthControls";
import {
  acceptInvitation,
  AcceptInvitationError,
  type AcceptInvitationErrorCode,
} from "@/lib/api/invitations";

/**
 * Explicit invitation acceptance (5.ONBOARD-4).
 *
 * The accept is a user-initiated POST, never an effect of rendering — see the
 * page's doc comment for why (single-use tokens vs. mail scanners and prefetch).
 *
 * On success we hard-navigate to /workflows rather than router.push: the accept
 * auto-activates the joined account server-side, and a full load makes the app
 * shell, the account switcher, and the server-rendered onboarding checklists all
 * re-derive against the NEW active account. A soft push would leave the previous
 * account's server-rendered state on screen — including the wrong onboarding
 * card, which is exactly what "a member must never briefly see the owner
 * checklist" forbids.
 */

/**
 * Friendly, non-disclosing copy per failure. Deliberately uniform in what they
 * REVEAL: none of them says whether the account exists, who invited the user, or
 * what address the invite was sent to. `INVITATION_EMAIL_MISMATCH` in particular
 * tells the signed-in user their OWN address is wrong for this invite — it never
 * echoes the invited address back, which would turn any leaked link into an
 * email-address disclosure.
 */
const MESSAGE: Record<AcceptInvitationErrorCode, string> = {
  INVITATION_NOT_FOUND:
    "This invite link isn't valid. Ask whoever invited you to send a new one.",
  INVITATION_EXPIRED:
    "This invite has expired. Ask whoever invited you to send a new one.",
  INVITATION_REVOKED:
    "This invite is no longer active. Ask whoever invited you to send a new one.",
  INVITATION_ALREADY_ACCEPTED:
    "This invite has already been used. Ask whoever invited you to send a new one.",
  INVITATION_EMAIL_MISMATCH:
    "This invite was sent to a different email address. Sign in with the address it was sent to, then open the link again.",
  ACCOUNT_PENDING_DELETION:
    "This account isn't accepting new members right now.",
  TEAM_MEMBER_LIMIT_REACHED:
    "This account is full and can't add another member right now. Ask an admin to free up a seat.",
  UNAUTHENTICATED: "Please sign in again, then reopen the invite link.",
  BAD_REQUEST: "This invite link isn't valid. Ask whoever invited you to send a new one.",
  UNKNOWN: "Couldn't accept this invite just now. Please try again.",
};

export function AcceptInvitationCard({
  token,
  email,
}: {
  token: string;
  /** The signed-in address, so the user can see WHICH identity is accepting. */
  email: string | null;
}) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onAccept() {
    setError(null);
    setPending(true);
    try {
      await acceptInvitation(token);
      // Full load so the newly-activated account re-renders everything.
      window.location.assign("/workflows");
    } catch (err) {
      setError(
        err instanceof AcceptInvitationError
          ? MESSAGE[err.code]
          : MESSAGE.UNKNOWN,
      );
      setPending(false);
    }
  }

  return (
    <AuthShell showcase="sign-in">
      <AuthHeading eyebrow="Invitation" title="Join your team on ChainReact">
        You&apos;ve been invited to collaborate. Accept to join the shared
        workspace.
      </AuthHeading>

      {email && (
        <p data-testid="accept-invitation-identity" className="au-note">
          Accepting as <strong>{email}</strong>
        </p>
      )}

      {/* Reuses the shared auth error surface (role="alert" + au-alert), so an
          invite failure is announced and styled exactly like a sign-in failure. */}
      {error && (
        <AuthFormError data-testid="accept-invitation-error">{error}</AuthFormError>
      )}

      <button
        type="button"
        onClick={() => void onAccept()}
        disabled={pending}
        data-testid="accept-invitation-submit"
        className="au-submit"
      >
        {pending ? "Joining…" : "Accept invitation"}
      </button>
    </AuthShell>
  );
}
