/**
 * Safe credential-availability summary for AI guidance (HERMES-AGENT-CREDENTIAL-AVAILABILITY-CONTEXT).
 *
 * Produces a SANITIZED summary of which providers are usable for a guidance request, so Hermes can
 * suggest connections that actually exist (or ask the user to connect one) — WITHOUT learning any
 * credential detail. It reads active integrations for the account and reduces them to provider KEYS
 * (+ registry display names), keyed by the existing credential-sharing semantics:
 *
 *   - ACCOUNT-class providers (slack/notion/stripe/…) are account-shared → summarized for the account.
 *   - PERSONAL-class providers are summarized ONLY when connected by the CURRENT user (their own).
 *   - A personal provider connected by ANOTHER member is EXCLUDED entirely (no key, no identity).
 *
 * STRICTLY SANITIZED OUTPUT — provider key + registry display name + a literal `"available"` status.
 * NEVER any token/secret, provider account id, integration id, owner user id/email/name, account id,
 * sharing scope, scopes, or raw row. The registry display name (e.g. "Gmail") is used, never the
 * integration row's `displayName` (which can be the connected account's email/name).
 *
 * `listActiveByAccount` is service-role, but the caller (route) has already authorized the user as an
 * account member, and this function returns only the safe derived summary above — matching the
 * existing service-role-with-sanitized-output pattern. It degrades SAFELY: any read error yields an
 * EMPTY summary (no credential context) rather than blocking guidance.
 *
 * Conservative limitation: EXPLICITLY-shared personal connections (a teammate's personal provider
 * shared with the account) are NOT yet summarized as account-shared here — only account-class
 * providers are. Under-reporting availability is safe; a future slice can widen this deliberately.
 */

import * as integrationsRepo from "@/repositories/integrations";
import { getProvider } from "@/integrations/_registry";
import {
  isAccountCredentialProvider,
  isPersonalCredentialProvider,
} from "@/core/integrations/credentialSharing";

export interface GuidanceProviderAvailability {
  /** Provider registry key (e.g. "slack", "gmail"). NOT an integration/account id. */
  readonly providerKey: string;
  /** Registry display name (e.g. "Slack"). Never the connected account's name. */
  readonly displayName?: string;
  readonly status: "available";
}

export interface GuidanceCredentialAvailability {
  readonly accountSharedProviders: readonly GuidanceProviderAvailability[];
  readonly currentUserPrivateProviders: readonly GuidanceProviderAvailability[];
  /** Optional generic notice (no member identity). Reserved; the workflow-node guard owns the
   *  foreign-private-connection notice today. */
  readonly unavailableOrPrivateNotice?: string;
}

const EMPTY: GuidanceCredentialAvailability = Object.freeze({
  accountSharedProviders: [],
  currentUserPrivateProviders: [],
});

/** Provider key → safe availability summary (registry display name only). */
function toSummary(providerKey: string): GuidanceProviderAvailability {
  const displayName = getProvider(providerKey)?.displayName;
  return { providerKey, ...(displayName ? { displayName } : {}), status: "available" };
}

/**
 * Build the sanitized credential-availability summary for (accountId, userId). Deterministic given
 * the integration set; never throws (read errors → EMPTY).
 */
export async function getGuidanceCredentialAvailability(input: {
  accountId: string;
  userId: string;
}): Promise<GuidanceCredentialAvailability> {
  try {
    const rows = await integrationsRepo.listActiveByAccount(input.accountId);

    const shared = new Set<string>();
    const own = new Set<string>();
    for (const row of rows) {
      const provider = row.provider;
      if (!provider) continue;
      if (isAccountCredentialProvider(provider)) {
        // Account/service credential — shared with the whole account.
        shared.add(provider);
      } else if (isPersonalCredentialProvider(provider) && row.connectedByUserId === input.userId) {
        // The CURRENT user's OWN personal connection. Another member's is intentionally skipped.
        own.add(provider);
      }
    }
    // An account-shared provider must not also be reported as the user's private one.
    for (const p of shared) own.delete(p);

    return {
      accountSharedProviders: Array.from(shared).sort().map(toSummary),
      currentUserPrivateProviders: Array.from(own).sort().map(toSummary),
    };
  } catch {
    // Degrade safely — guidance proceeds with no credential context rather than failing.
    return EMPTY;
  }
}
