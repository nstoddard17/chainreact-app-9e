/**
 * Security & access summary (Slice 4.ACCOUNT-SETTINGS-6 / SEC-1).
 *
 * Pure, I/O-free derivation of the read-only Security section's values from the
 * already-resolved session user. Per the SEC plan, V2 is email + password only
 * today, so `signInMethod` resolves to "Email & password" and `hasPassword` is
 * true — but the provider derivation is written to stay correct once OAuth/SSO
 * lands (it reads the user's auth providers rather than assuming).
 */

/** Minimal structural shape of the supabase session user this helper needs. */
export interface SecurityUserLike {
  email: string | null;
  /** `user.email_confirmed_at` — ISO string when verified, null/undefined otherwise. */
  emailConfirmedAt: string | null | undefined;
  /** The user's auth providers (e.g. `user.app_metadata.providers`). */
  providers?: readonly string[];
}

export interface SecurityAccessSummary {
  email: string;
  emailVerified: boolean;
  /** Whether the user can authenticate with a password (drives password step-up). */
  hasPassword: boolean;
  /** User-facing sign-in method label, e.g. "Email & password". */
  signInMethod: string;
}

const PROVIDER_LABELS: Record<string, string> = {
  email: "Email & password",
  google: "Google",
  github: "GitHub",
  azure: "Microsoft",
  gitlab: "GitLab",
  bitbucket: "Bitbucket",
};

function providerLabel(provider: string): string {
  return PROVIDER_LABELS[provider] ?? provider.charAt(0).toUpperCase() + provider.slice(1);
}

export function getSecurityAccessSummary(user: SecurityUserLike): SecurityAccessSummary {
  const providers = (user.providers ?? []).filter((p) => typeof p === "string" && p.length > 0);

  // Email/password is the floor today: with no provider data, assume password.
  const hasPassword = providers.length === 0 || providers.includes("email");
  const oauth = providers.filter((p) => p !== "email");

  let signInMethod: string;
  if (oauth.length === 0) {
    signInMethod = "Email & password";
  } else {
    const oauthLabels = oauth.map(providerLabel);
    signInMethod = hasPassword
      ? ["Email & password", ...oauthLabels].join(", ")
      : oauthLabels.join(", ");
  }

  return {
    email: user.email ?? "",
    emailVerified: Boolean(user.emailConfirmedAt),
    hasPassword,
    signInMethod,
  };
}
