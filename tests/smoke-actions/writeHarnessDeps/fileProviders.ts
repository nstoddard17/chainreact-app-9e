/**
 * Write smoke harness deps — Dropbox + OneDrive existence-probe read-backs.
 *
 * Extracted from writeHarnessDeps.ts (structure-only split; behavior unchanged).
 * Both are delete-verification probes: a typed NotFoundError maps to `exists:false`;
 * ANY other error RE-THROWS (so a permission/API failure never reads as "deleted").
 * Each provider read runs through `refreshAndRetry`.
 */
import { getActiveForExecution } from "@/repositories/integrations";
import { refreshAndRetry } from "@/services/oauth/refreshAndRetry";
import { filesGetMetadata } from "@/integrations/_shared/dropbox/api/filesGetMetadata";
import { normalizeDropboxEntry } from "@/integrations/_shared/dropbox/api/_types";
import { NotFoundError as DropboxNotFoundError } from "@/integrations/_shared/dropbox/errors";
import { driveItemsGet } from "@/integrations/microsoft-onedrive/api/driveItemsGet";
import { NotFoundError as GraphNotFoundError } from "@/integrations/_shared/microsoft/api/errors";
import type { StepRunOutcome } from "../writeHarness";
import type { SmokeReaderContext, SmokeReaderInput } from "./context";

/**
 * Smoke read-back: `dropbox:path_metadata` + `microsoft-onedrive:item_metadata` —
 * existence probes for the create/delete folder + upload fixtures. Returns null for
 * any other (provider, action).
 */
export async function fileProvidersSmokeReadBack(
  ctx: SmokeReaderContext,
  input: SmokeReaderInput,
): Promise<StepRunOutcome | null> {
  if (input.provider === "dropbox" && input.action === "path_metadata") {
    const integration = await getActiveForExecution(ctx.accountId, "dropbox", null, {
      connectedByUserId: ctx.userId,
    });
    if (!integration) return { ok: false, output: null, reason: "dropbox not connected" };
    const path = input.config.path;
    if (typeof path !== "string" || path.length === 0) {
      return { ok: false, output: null, reason: "dropbox path_metadata read-back: missing path" };
    }
    // Existence probe for delete verification. get_metadata SUCCEEDS for a
    // live path; a DELETED (trashed) path surfaces a TYPED NotFoundError
    // (409 path/not_found) — distinct from a permission/other error, which
    // RE-THROWS to the outer catch -> ok:false -> honest VERIFY_FAILED, never
    // a false "deleted". refreshAndRetry mirrors the Dropbox handlers' path.
    try {
      const entry = await refreshAndRetry({
        accountId: ctx.accountId,
        provider: "dropbox",
        providerAccountId: integration.providerAccountId,
        apiCall: (accessToken) => filesGetMetadata({ accessToken, path }),
      });
      const n = normalizeDropboxEntry(entry);
      // Bounded, sanitized: only the existence flag + structural fields a
      // verify reads (name for the create-folder marker check, isFolder).
      return { ok: true, output: { exists: true, name: n.name, isFolder: n.isFolder }, reason: null };
    } catch (err) {
      if (err instanceof DropboxNotFoundError) {
        return { ok: true, output: { exists: false }, reason: null };
      }
      throw err;
    }
  }

  if (input.provider === "microsoft-onedrive" && input.action === "item_metadata") {
    const integration = await getActiveForExecution(ctx.accountId, "microsoft-onedrive", null, {
      connectedByUserId: ctx.userId,
    });
    if (!integration) return { ok: false, output: null, reason: "microsoft-onedrive not connected" };
    const itemId = input.config.itemId;
    if (typeof itemId !== "string" || itemId.length === 0) {
      return { ok: false, output: null, reason: "onedrive item_metadata read-back: missing itemId" };
    }
    // Existence probe for delete verification. GET /me/drive/items/{id}
    // SUCCEEDS for a live item; a DELETED item (in the recycle bin) returns
    // Graph 404 -> TYPED NotFoundError. Any other error RE-THROWS -> ok:false
    // -> honest VERIFY_FAILED. We created + own the item, so a 404 after our
    // own delete reliably means deleted (never a permission artifact).
    try {
      const item = await refreshAndRetry({
        accountId: ctx.accountId,
        provider: "microsoft-onedrive",
        providerAccountId: integration.providerAccountId,
        apiCall: (accessToken) => driveItemsGet({ accessToken, itemId }),
      });
      return {
        ok: true,
        output: { exists: true, name: item.name ?? "", kind: item.folder ? "folder" : "file" },
        reason: null,
      };
    } catch (err) {
      if (err instanceof GraphNotFoundError) {
        return { ok: true, output: { exists: false }, reason: null };
      }
      throw err;
    }
  }

  return null;
}
