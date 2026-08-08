import type { FieldResourcePicker } from "@/contracts/actionMeta";
import { decryptToken } from "@/core/encryption/tokens";
import { getActiveForExecution } from "@/repositories/integrations";
import { ensurePersonalAccount } from "@/services/accounts/ensurePersonalAccount";
import { decideOptionsCredential } from "@/services/options/credentialPolicy";
import { resolveWorkflowCreatorContext } from "@/services/options/workflowCreatorContext";
import { resolveEffectiveNodeOwner } from "@/services/teamCredentials/nodeCredentialOwners";
import { credentialSharingForProvider } from "@/core/integrations/credentialSharing";
import { refresh } from "@/services/oauth/dispatcher";

/**
 * GOOGLE-OAUTH-PRODUCTION-SCOPE-CLOSEOUT-2 — short-lived browser credential for
 * a PROVIDER-HOSTED resource picker (Google Picker).
 *
 * ## Why this exists at all
 *
 * Every other ChainReact surface keeps provider credentials server-side: option
 * resolvers fetch on the server and return only `{value,label}` pairs. Google
 * Picker cannot work that way — it is a Google-hosted browser widget that
 * authenticates with `setOAuthToken(<access token>)`, and Google publishes no
 * server-mediated equivalent. Letting the user pick a file in Google's own UI is
 * what converts a RESTRICTED whole-corpus scope (`drive.metadata.readonly`) into
 * the non-sensitive per-file `drive.file` grant, so the boundary is worth
 * crossing — deliberately, narrowly, and once.
 *
 * ## The boundary this establishes (durable security decision)
 *
 * This is the ONLY path in the app that returns a provider access token to a
 * browser. It is constrained so that it can never become a general credential
 * endpoint:
 *
 *   - **Picker-keyed, not provider-keyed.** The caller passes a
 *     `FieldResourcePicker` key from the field metadata enum, not an arbitrary
 *     provider string. Only providers wired to a real picker are reachable —
 *     asking for `gmail` or `stripe` is not expressible.
 *   - **Same authorization as the options resolver.** Identical account
 *     membership + credential-sharing decision (`decideOptionsCredential`), so a
 *     team member can never mint a token against another member's private
 *     personal connection (`not-owner` returns before ANY integration lookup).
 *   - **Access token only.** The refresh token and the encrypted payloads are
 *     never read into the response. A leaked picker token dies with Google's own
 *     expiry (~1h) and cannot be renewed by the holder.
 *   - **Scope-bounded by the grant itself.** The token carries only what the
 *     connection was granted; for a narrow Sheets connection that is
 *     `spreadsheets` + `drive.file` + identity.
 *   - **POST + `no-store`.** Never a GET, so the token cannot land in a URL,
 *     browser history, referrer, or a shared cache (enforced by the route).
 *   - **Never logged.** No branch here or in the route logs the token or the
 *     decrypted value; failures return typed codes only.
 *   - **Client-side lifetime = the picker session.** The browser holds it in a
 *     local variable for the open picker and never writes it to storage.
 */

/** Which provider connection backs each picker key. */
const PICKER_PROVIDER: Readonly<Record<FieldResourcePicker, string>> = {
  "google-sheets:spreadsheet": "google-sheets",
};

/** Provider-side resource filter for each picker key (Picker view config). */
const PICKER_MIME_TYPE: Readonly<Record<FieldResourcePicker, string>> = {
  "google-sheets:spreadsheet": "application/vnd.google-apps.spreadsheet",
};

export type PickerSessionErrorCode =
  | "PICKER_NOT_SUPPORTED"
  | "PICKER_NOT_CONFIGURED"
  | "INTEGRATION_NOT_CONNECTED"
  | "NOT_WORKFLOW_OWNER"
  | "PROVIDER_REAUTH_REQUIRED"
  | "SERVER_ERROR";

export type PickerSessionResult =
  | {
      ok: true;
      /** Short-lived provider access token for the picker widget ONLY. */
      accessToken: string;
      /** Google Cloud project NUMBER — Picker's `setAppId`, a public identifier. */
      appId: string;
      /** Browser API key — Picker's `setDeveloperKey`, a public identifier. */
      apiKey: string;
      /** Provider MIME type the picker view is filtered to. */
      mimeType: string;
    }
  | { ok: false; code: PickerSessionErrorCode; message: string };

export interface PickerSessionInput {
  picker: FieldResourcePicker;
  userId: string;
  workflowId: string | null;
  nodeId: string | null;
}

function fail(code: PickerSessionErrorCode, message: string): PickerSessionResult {
  return { ok: false, code, message };
}

/** Access tokens within this window of expiry are refreshed before handing out. */
const EXPIRY_SKEW_MS = 5 * 60 * 1000;

/**
 * Mint a short-lived picker session. Returns typed failures (never throws) so
 * the field can render an honest recovery state.
 */
export async function createPickerSession(
  input: PickerSessionInput,
): Promise<PickerSessionResult> {
  const provider = PICKER_PROVIDER[input.picker];
  const mimeType = PICKER_MIME_TYPE[input.picker];
  if (!provider || !mimeType) {
    return fail("PICKER_NOT_SUPPORTED", "This picker isn't available.");
  }

  // Public Google identifiers. Absent config is an owner setup gap, not a user
  // error — the field falls back to manual entry rather than showing a broken
  // picker button.
  const appId = process.env.NEXT_PUBLIC_GOOGLE_PICKER_APP_ID ?? "";
  const apiKey = process.env.NEXT_PUBLIC_GOOGLE_PICKER_API_KEY ?? "";
  if (!appId || !apiKey) {
    return fail(
      "PICKER_NOT_CONFIGURED",
      "File picking isn't configured for this environment yet.",
    );
  }

  const workflowCreator =
    input.workflowId !== null
      ? await resolveWorkflowCreatorContext(input.workflowId)
      : null;

  let effectiveOwnerUserId: string | null = null;
  if (
    workflowCreator !== null &&
    input.nodeId !== null &&
    credentialSharingForProvider(provider) === "personal"
  ) {
    effectiveOwnerUserId = await resolveEffectiveNodeOwner(
      workflowCreator.workflowId,
      input.nodeId,
    );
  }

  const decision = decideOptionsCredential(
    provider,
    input.userId,
    workflowCreator,
    effectiveOwnerUserId,
  );

  // Fail BEFORE any credential lookup — a non-owner never causes another
  // member's private connection to be read, let alone tokenized.
  if (decision.kind === "not-owner") {
    return fail(
      "NOT_WORKFLOW_OWNER",
      "This step runs under the workflow owner's connection. Ask the owner to choose the file.",
    );
  }

  let integration;
  try {
    if (decision.kind === "legacy") {
      const ownerAccount = await ensurePersonalAccount(input.userId);
      integration = await getActiveForExecution(ownerAccount.id, provider, null);
    } else if (decision.kind === "account") {
      integration = await getActiveForExecution(decision.accountId, provider, null);
    } else {
      integration = await getActiveForExecution(decision.accountId, provider, null, {
        connectedByUserId: decision.connectedByUserId,
      });
    }
  } catch {
    return fail("SERVER_ERROR", "Couldn't open the picker. Try again.");
  }

  if (integration === null) {
    return fail(
      "INTEGRATION_NOT_CONNECTED",
      "Connect your Google Sheets account to choose a file.",
    );
  }

  // Refresh proactively when the stored token is expired or nearly so — the
  // picker runs in the browser and cannot retry through refreshAndRetry.
  const expiresAtMs = integration.accessTokenExpiresAt
    ? Date.parse(integration.accessTokenExpiresAt)
    : null;
  const stale =
    expiresAtMs !== null && Number.isFinite(expiresAtMs)
      ? expiresAtMs - Date.now() <= EXPIRY_SKEW_MS
      : false;

  let record = integration;
  if (stale) {
    try {
      const refreshed = await refresh({
        accountId: record.accountId,
        provider,
        providerAccountId: record.providerAccountId,
        connectedByUserId:
          decision.kind === "personal-creator" ? decision.connectedByUserId : undefined,
      });
      record = refreshed.integration;
    } catch {
      return fail(
        "PROVIDER_REAUTH_REQUIRED",
        "Your Google connection needs to be reconnected before you can choose a file.",
      );
    }
  }

  if (!record.accessTokenEncrypted) {
    return fail(
      "PROVIDER_REAUTH_REQUIRED",
      "Your Google connection needs to be reconnected before you can choose a file.",
    );
  }

  let accessToken: string;
  try {
    accessToken = decryptToken(record.accessTokenEncrypted);
  } catch {
    return fail("SERVER_ERROR", "Couldn't open the picker. Try again.");
  }

  return { ok: true, accessToken, appId, apiKey, mimeType };
}
