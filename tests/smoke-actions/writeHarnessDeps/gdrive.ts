/**
 * Write smoke harness deps — Google Drive smoke read-back seam.
 *
 * Owns one smoke-only read:
 *   - `file_permissions` — the sanitized permission SHAPE of one Drive file
 *     (google-docs:share_document's independent proof that an anyone-link
 *     permission actually landed). Returns ONLY flat { found, permissionTypes,
 *     permissionRoles } arrays — never emails, display names, or permission ids,
 *     so no principal PII can surface in a verify path.
 *
 * V2 has no permissions LIST wrapper (only permissionsCreate), so the seam does
 * a bounded raw GET /drive/v3/files/{id}/permissions with a types/roles-only
 * fields mask, inside `refreshAndRetry` like every other seam read
 * (seam-refresh-guard). Typed 404 maps to found:false; other errors rethrow
 * (a permission failure can never read as "not shared" — context.ts invariant).
 */
import { getActiveForExecution } from "@/repositories/integrations";
import { refreshAndRetry, Unauthorized401Error } from "@/services/oauth/refreshAndRetry";
import { driveApiBase } from "@/integrations/google-drive/api/_base";
import type { StepRunOutcome } from "../writeHarness";
import type { SmokeReaderContext, SmokeReaderInput } from "./context";

interface PermissionLite {
  type?: string;
  role?: string;
}

async function readDriveFilePermissions(
  ctx: SmokeReaderContext,
  input: SmokeReaderInput,
): Promise<StepRunOutcome> {
  const fileId = typeof input.config.fileId === "string" ? input.config.fileId : "";
  if (!fileId) {
    return { ok: false, output: null, reason: "gdrive file_permissions: missing fileId" };
  }
  // share_document shares a google-docs document, but the permission surface is
  // Drive's — the seam resolves the DRIVE integration row (same account family;
  // mirrors the cross-provider delete_file cleanup the docs fixtures already use).
  const integration =
    (await getActiveForExecution(ctx.accountId, "google-docs", null, {
      connectedByUserId: ctx.userId,
    })) ??
    (await getActiveForExecution(ctx.accountId, "google-drive", null, {
      connectedByUserId: ctx.userId,
    }));
  if (!integration) return { ok: false, output: null, reason: "google docs/drive not connected" };
  const permissions = await refreshAndRetry({
      accountId: ctx.accountId,
      provider: integration.provider,
      providerAccountId: integration.providerAccountId,
      apiCall: async (accessToken) => {
        // Fields mask keeps the response types/roles-only — never emails/names.
        const url =
          `${driveApiBase()}/drive/v3/files/${encodeURIComponent(fileId)}/permissions` +
          `?fields=${encodeURIComponent("permissions(type,role)")}`;
        const res = await fetch(url, {
          method: "GET",
          headers: { Authorization: `Bearer ${accessToken}` },
        });
        if (res.status === 401) {
          throw new Unauthorized401Error("Drive permissions GET returned HTTP 401");
        }
        if (res.status === 404) return null;
        if (!res.ok) {
          throw new Error(`Drive permissions GET failed: HTTP ${res.status}`);
        }
        return ((await res.json()) as { permissions?: PermissionLite[] }).permissions ?? [];
      },
    });
  if (permissions === null) {
    return {
      ok: true,
      output: { found: false, permissionTypes: [], permissionRoles: [] },
      reason: null,
    };
  }
  return {
    ok: true,
    output: {
      found: true,
      permissionTypes: permissions.map((p) => p.type ?? "unknown"),
      permissionRoles: permissions.map((p) => p.role ?? "unknown"),
    },
    reason: null,
  };
}

/**
 * Google Drive smoke read-back seam. Owns `file_permissions` for the
 * google-docs / google-drive family. Returns null for any other (provider,
 * action). Bounded + sanitized (types/roles only).
 */
export async function gdriveSmokeReadBack(
  ctx: SmokeReaderContext,
  input: SmokeReaderInput,
): Promise<StepRunOutcome | null> {
  if (input.provider !== "google-docs" && input.provider !== "google-drive") return null;
  if (input.action === "file_permissions") return readDriveFilePermissions(ctx, input);
  return null;
}
