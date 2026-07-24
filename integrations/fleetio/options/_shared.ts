import {
  OptionsResolverError,
  type OptionsResolverContext,
} from "@/services/options/types";
import { Unauthorized401Error } from "@/services/oauth/refreshAndRetry";
import type { IntegrationRecord } from "@/repositories/integrations";
import {
  decryptFleetioCredentials,
  FleetioCredentialShapeError,
  type FleetioCredentials,
} from "../credentials";
import {
  FleetioForbiddenError,
  FleetioRateLimitError,
} from "../api/_request";

/**
 * Shared guards + error mapping for the Fleetio options resolvers (FLEETIO-2).
 * Mirrors the Motive `_shared` posture.
 *
 * Account scoping is CENTRAL: `fleetio` is an ACCOUNT credential
 * (core/integrations/credentialSharing.ts), so
 * `services/options/resolveOptionsSource.ts` resolves `ctx.integration` from the
 * WORKFLOW's account (never the editor's personal connection, never
 * `connected_by_user_id`). The resolver adds NO auth logic — it only decodes the
 * already-account-scoped row's credentials and calls the API. Cross-account
 * isolation is therefore a property of the shared route, proven by its own tests.
 *
 * Error sanitization (nothing provider-raw or credential-bearing reaches the
 * browser):
 *   - missing/disconnected row      → INTEGRATION_DISCONNECTED
 *   - 401 (dead key) / malformed
 *     credential blob                → PROVIDER_REAUTH_REQUIRED (reconnect)
 *   - 403 (role gap)                → PROVIDER_REAUTH_REQUIRED (reconnect to a
 *                                     Fleetio user whose role allows API access)
 *   - 429 / 5xx / timeout / other   → PROVIDER_ERROR (static "try again")
 */

/**
 * Resolve the account-scoped Fleetio credentials for a resolver call. Throws a
 * typed `OptionsResolverError` when the row is absent or its credential blob is
 * malformed. Never logs or surfaces a credential value.
 */
export function requireFleetioCredentials(
  ctx: OptionsResolverContext,
): { integration: IntegrationRecord; credentials: FleetioCredentials } {
  if (!ctx.integration) {
    throw new OptionsResolverError(
      "INTEGRATION_DISCONNECTED",
      "No active Fleetio connection. Connect Fleetio first.",
    );
  }
  try {
    return {
      integration: ctx.integration,
      credentials: decryptFleetioCredentials(ctx.integration),
    };
  } catch (err) {
    if (err instanceof FleetioCredentialShapeError) {
      // The stored credential can't be decoded — reconnect is the fix.
      throw new OptionsResolverError(
        "PROVIDER_REAUTH_REQUIRED",
        "Your Fleetio connection needs to be reconnected.",
      );
    }
    throw err;
  }
}

/** Map a wrapper/API failure to a sanitized OptionsResolverError. Never returns. */
export function mapFleetioOptionsError(err: unknown, what: string): never {
  if (err instanceof Unauthorized401Error) {
    throw new OptionsResolverError(
      "PROVIDER_REAUTH_REQUIRED",
      "Reconnect Fleetio and try again.",
    );
  }
  if (err instanceof FleetioForbiddenError) {
    throw new OptionsResolverError(
      "PROVIDER_REAUTH_REQUIRED",
      "This Fleetio user's role can't access the API. Reconnect with a Fleetio user that has API access.",
    );
  }
  if (err instanceof FleetioRateLimitError) {
    throw new OptionsResolverError(
      "PROVIDER_ERROR",
      `Fleetio is rate limiting requests. Try loading ${what} again in a moment.`,
    );
  }
  throw new OptionsResolverError(
    "PROVIDER_ERROR",
    `Couldn't load Fleetio ${what}. Try again.`,
  );
}
