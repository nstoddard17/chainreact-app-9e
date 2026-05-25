import { Unauthorized401Error } from "@/services/oauth/refreshAndRetry";
import { driveApiBase } from "./_base";
import { NotFoundError } from "./errors";

/**
 * Wrapper for Google Drive `permissions.create`.
 *
 * Endpoint: POST {base}/drive/v3/files/{fileId}/permissions
 *           ?sendNotificationEmail=<bool>
 *           &transferOwnership=<bool>
 *           &moveToNewOwnersRoot=<bool>
 *           &supportsAllDrives=<bool>
 * Body:     application/json — `{ type, role, emailAddress?, domain?,
 *           allowFileDiscovery? }`
 * Returns:  the created `Permission` resource.
 *
 * Used by `share_document` action (Slice 3.GDOCS-2). One permission row
 * per (file, principal) — the action loops once per email when sharing
 * with multiple users, mirroring V1's per-email loop in
 * `lib/workflows/actions/googleDocs.ts:shareGoogleDocument`.
 *
 * **`sendNotificationEmail`** is a real-world side effect (emails the
 * principal). Q11 — the share_document handler requires explicit
 * `sendNotification` before reaching this wrapper; the wrapper itself
 * accepts the boolean as a plain input and forwards verbatim.
 *
 * **`transferOwnership: true`** + `role: "owner"` is irreversible:
 * Drive transfers the file owner permanently. The wrapper forwards the
 * flag; the handler classifies the action as `riskLevel: "high"` +
 * `isDestructive: true` at the meta layer (lands in GDOCS-4).
 *
 * **`emailMessage`** — Drive's spec allows a custom notification
 * message when `sendNotificationEmail: true`. Sent as a header
 * (`Content-Type: application/json` body field per Drive docs is
 * actually NOT body — Drive uses the field name `emailMessage` in the
 * body alongside the standard fields). V2 forwards it verbatim when
 * supplied; omits when blank.
 *
 * Throws:
 *   - `Unauthorized401Error` on HTTP 401.
 *   - `NotFoundError` on HTTP 404 (file doesn't exist / no access).
 *   - generic `Error` on other failures.
 */
export interface PermissionsCreateInput {
  accessToken: string;
  fileId: string;
  body: {
    /** Drive permission type — `"user"`, `"group"`, `"domain"`, `"anyone"`. */
    type: "user" | "group" | "domain" | "anyone";
    /** Drive permission role — `"reader" | "commenter" | "writer" | "owner"`. */
    role: "reader" | "commenter" | "writer" | "owner";
    /** Required for `type: "user"` or `"group"`. */
    emailAddress?: string;
    /** Required for `type: "domain"`. */
    domain?: string;
    /** When false, hides the file from search for `anyone`-permission shares. */
    allowFileDiscovery?: boolean;
    /** Custom message included in the notification email when `sendNotificationEmail: true`. */
    emailMessage?: string;
  };
  /**
   * Whether to send the notification email. Q11 — handler must require
   * the workflow author to supply this explicitly; wrapper accepts the
   * boolean verbatim.
   */
  sendNotificationEmail: boolean;
  /**
   * `true` only for ownership transfer. Drive enforces:
   *   - role MUST be `"owner"` when this is true.
   *   - type MUST be `"user"`.
   *   - the source account must own the file at request time.
   */
  transferOwnership?: boolean;
  /**
   * When transferring ownership, move the file to the new owner's
   * "My Drive" root. Drive's default behavior; V2 surfaces it so the
   * handler can match V1's behavior verbatim.
   */
  moveToNewOwnersRoot?: boolean;
  supportsAllDrives?: boolean;
  /** Comma-separated `fields` mask; defaults to `id,type,role,emailAddress,domain`. */
  fields?: string;
}

export interface DrivePermissionResource {
  id: string;
  type?: string;
  role?: string;
  emailAddress?: string;
  domain?: string;
  allowFileDiscovery?: boolean;
  [k: string]: unknown;
}

interface DriveErrorPayload {
  error?: { code?: number; message?: string; status?: string };
}

function surfaceErrorDetail(text: string, status: number): string {
  let detail = `HTTP ${status}`;
  try {
    const parsed = JSON.parse(text) as DriveErrorPayload;
    if (parsed?.error?.message) detail = parsed.error.message;
    else if (parsed?.error?.status) detail = parsed.error.status;
  } catch {
    // not JSON
  }
  return detail;
}

export async function permissionsCreate(
  input: PermissionsCreateInput,
): Promise<DrivePermissionResource> {
  const url = new URL(
    `${driveApiBase()}/drive/v3/files/${encodeURIComponent(input.fileId)}/permissions`,
  );
  url.searchParams.set(
    "fields",
    input.fields ?? "id,type,role,emailAddress,domain,allowFileDiscovery",
  );
  url.searchParams.set(
    "supportsAllDrives",
    String(input.supportsAllDrives ?? true),
  );
  url.searchParams.set(
    "sendNotificationEmail",
    String(input.sendNotificationEmail),
  );
  if (input.transferOwnership === true) {
    url.searchParams.set("transferOwnership", "true");
  }
  if (input.moveToNewOwnersRoot !== undefined) {
    url.searchParams.set(
      "moveToNewOwnersRoot",
      String(input.moveToNewOwnersRoot),
    );
  }

  const res = await fetch(url.toString(), {
    method: "POST",
    headers: {
      Authorization: `Bearer ${input.accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(input.body),
  });

  if (res.status === 401) {
    throw new Unauthorized401Error(
      "Google Drive permissions.create returned HTTP 401",
    );
  }
  if (res.status === 404) {
    const text = await res.text();
    throw new NotFoundError(
      `file ${input.fileId}`,
      surfaceErrorDetail(text, 404),
    );
  }
  if (!res.ok) {
    const text = await res.text();
    throw new Error(
      `Google Drive permissions.create failed: ${surfaceErrorDetail(text, res.status)}`,
    );
  }

  return (await res.json()) as DrivePermissionResource;
}
