import type { ActionHandler } from "@/services/execution/handlers/types";
import { requireExplicitField } from "@/core/workflows/requireExplicitField";
import { refreshAndRetry } from "@/services/oauth/refreshAndRetry";
import { permissionsCreate } from "@/integrations/google-drive/api/permissionsCreate";
import {
  ShareDocumentConfigSchema,
  type ShareDocumentConfig,
} from "./shareDocument.schema";

/**
 * Google Docs `share_document` action handler — Slice 3.GDOCS-2.
 *
 * Mutates Drive permissions on a Google Docs document. V1 reference:
 * `lib/workflows/actions/googleDocs.ts:shareGoogleDocument`.
 *
 * **Q11 — `sendNotification` REQUIRED EXPLICIT.** No silent default.
 * Handler returns a standardized `ConfigFailure` shape (matches the
 * pattern V2 already uses across other Q11-gated handlers) when the
 * field is missing — the engine's pre-call config-failure path
 * surfaces this to the workflow author at design time.
 *
 * Behavior:
 *   1. Per-user share — one `permissions.create` per email in
 *      `shareWith`. Drive permissions are 1:1 with (file, principal),
 *      so the only way to share with N users is N round-trips. V1
 *      does the same.
 *   2. Public share (`makePublic: true`) — one additional
 *      `permissions.create` with `type: "anyone"`. Honors
 *      `publicPermission` (defaults to `reader`) and
 *      `allowDiscovery` (defaults to false — file doesn't surface
 *      in public search by default).
 *   3. Ownership transfer (`transferOwnership: true`) — Drive's
 *      transfer requires a SEPARATE flow: the `transferOwnership=true`
 *      query param + `role: "owner"` + `type: "user"`. The schema
 *      already enforces `permission === "owner"` and exactly one
 *      `shareWith` recipient as preconditions. **Irreversible** — the
 *      original owner loses ownership permanently.
 *
 * Per-share failures are caught individually so one bad email
 * doesn't abort the rest. Failed entries surface in the `errors`
 * output field; successful shares accumulate in `sharedWith` +
 * `permissionIds`. Drive's most common errors here are 404 (doc not
 * found), 400 (malformed email), and 403 (insufficient permission).
 *
 * Output:
 *   - `documentId`, `documentUrl`, `sharedWith` (emails that succeeded),
 *     `isPublic`, `permissionIds`, `errors` (per-share failures with
 *     email + message).
 */

const PROVIDER_ID = "google-docs";

export const shareDocument: ActionHandler = async (input) => {
  const config: ShareDocumentConfig = ShareDocumentConfigSchema.parse(
    input.config,
  );

  // Q11 gate — sendNotification must be explicitly supplied. V2's
  // requireExplicitField returns a typed failure shape; convert to a
  // thrown error here because the ActionHandler contract emits via
  // the output shape, and engine-side wrapping turns thrown
  // ConfigFailures back into the canonical config-failure response.
  const explicit = requireExplicitField(
    config.sendNotification,
    "sendNotification",
    "Send Notification",
  );
  if (!explicit.ok) {
    throw new Error(explicit.failure.message);
  }
  const sendNotification = explicit.value;

  const providerAccountId =
    input.triggerEvent.provider === PROVIDER_ID
      ? input.triggerEvent.providerAccountId
      : null;

  const sharedWith: string[] = [];
  const permissionIds: string[] = [];
  const errors: Array<{ email?: string; type?: string; message: string }> = [];

  // 1) Per-user shares — one round-trip per email.
  for (const email of config.shareWith) {
    try {
      const perm = await refreshAndRetry({
        accountId: input.accountId,
        provider: PROVIDER_ID,
        providerAccountId,
        apiCall: (accessToken) =>
          permissionsCreate({
            accessToken,
            fileId: config.documentId,
            body: {
              type: "user",
              role: config.permission,
              emailAddress: email,
              ...(config.message !== undefined && config.message.length > 0
                ? { emailMessage: config.message }
                : {}),
            },
            sendNotificationEmail: sendNotification,
            ...(config.transferOwnership && config.permission === "owner"
              ? { transferOwnership: true, moveToNewOwnersRoot: true }
              : {}),
          }),
      });
      sharedWith.push(email);
      if (typeof perm.id === "string" && perm.id.length > 0) {
        permissionIds.push(perm.id);
      }
    } catch (err) {
      errors.push({
        email,
        message: (err as Error).message,
      });
    }
  }

  // 2) Public share (`makePublic: true`).
  let isPublic = false;
  if (config.makePublic) {
    try {
      const publicPerm = await refreshAndRetry({
        accountId: input.accountId,
        provider: PROVIDER_ID,
        providerAccountId,
        apiCall: (accessToken) =>
          permissionsCreate({
            accessToken,
            fileId: config.documentId,
            body: {
              type: "anyone",
              role: config.publicPermission,
              allowFileDiscovery: config.allowDiscovery,
            },
            // Drive ignores notification for anyone-shares; pass
            // sendNotificationEmail: false unconditionally to match
            // Drive's accepted call shape.
            sendNotificationEmail: false,
          }),
      });
      isPublic = true;
      if (typeof publicPerm.id === "string" && publicPerm.id.length > 0) {
        permissionIds.push(publicPerm.id);
      }
    } catch (err) {
      errors.push({
        type: "public",
        message: (err as Error).message,
      });
    }
  }

  return {
    output: {
      documentId: config.documentId,
      documentUrl: `https://docs.google.com/document/d/${config.documentId}/edit`,
      sharedWith,
      isPublic,
      permissionIds,
      errors,
    },
  };
};
