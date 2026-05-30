import type { ActionHandler } from "@/services/execution/handlers/types";
import { refreshAndRetry } from "@/services/oauth/refreshAndRetry";
import { stageFileToStorage } from "@/services/files/stageFileToStorage";
import { itemFilesGet } from "@/integrations/_shared/monday/api/itemFilesGet";
import { assetsGet } from "@/integrations/_shared/monday/api/assetsGet";
import type { MondayAsset } from "@/integrations/_shared/monday/api/itemFilesGet";
import { NotFoundError } from "@/integrations/_shared/monday/errors";
import {
  DownloadFileConfigSchema,
  ITEM_FILES_SENTINEL,
} from "./downloadFile.schema";

/**
 * Monday `download_file` action handler — Slice 3.MONDAY-4 (FileRef
 * producer).
 *
 * Resolves a file on a Monday item, downloads its bytes, and stages them
 * into V2 storage — returning a `FileRef(kind=v2_storage, provider=
 * "monday")`. Mirrors the Slack/Gmail download pattern (durable staged
 * ref that any downstream FileRef consumer — airtable:add_attachment,
 * slack:upload_file, monday:add_file — can use). Bytes never appear in
 * the action output.
 *
 * Asset resolution:
 *   - `columnId === "__item_files__"` → candidates are the item's
 *     general assets + its update assets.
 *   - specific file column → parse that column's `value` JSON for
 *     `files[].assetId`, then resolve those ids via `assets(ids:)`.
 *     Falls back to the item's general assets if the column carries
 *     none (matches V1's resilience).
 *   - `fileId` (optional) selects a specific asset; otherwise the first.
 *
 * Bytes are fetched from the asset's `public_url` (Monday's temporary
 * public link — fetchable without auth). If absent, the handler fails
 * with a clear error rather than leaking the auth-bound `url`.
 *
 * Output:
 *   { file: FileRef(v2_storage), fileId, fileName, mimeType, sizeBytes }
 */

interface ParsedFileColumnRef {
  assetIds: string[];
}

function parseFileColumnAssetIds(value: string | null): ParsedFileColumnRef {
  if (!value) return { assetIds: [] };
  try {
    const parsed = JSON.parse(value) as { files?: unknown };
    const files = Array.isArray(parsed.files) ? parsed.files : [];
    const assetIds: string[] = [];
    for (const f of files) {
      if (f && typeof f === "object") {
        const rec = f as Record<string, unknown>;
        const id = rec.assetId ?? rec.id;
        if (typeof id === "string" && id.length > 0) assetIds.push(id);
        else if (typeof id === "number") assetIds.push(String(id));
      }
    }
    return { assetIds };
  } catch {
    return { assetIds: [] };
  }
}

function pickAsset(
  assets: MondayAsset[],
  fileId: string | undefined,
): MondayAsset | null {
  if (assets.length === 0) return null;
  if (fileId !== undefined) {
    return assets.find((a) => a.id === fileId) ?? null;
  }
  return assets[0]!;
}

async function fetchAssetBytes(publicUrl: string): Promise<Uint8Array> {
  let res: Response;
  try {
    res = await fetch(publicUrl, { method: "GET" });
  } catch {
    // The thrown cause may echo the URL — drop it.
    throw new Error("Monday file download failed (transport error).");
  }
  if (!res.ok) {
    // Status only — never the URL.
    throw new Error(`Monday file download failed (HTTP ${res.status}).`);
  }
  return new Uint8Array(await res.arrayBuffer());
}

export const downloadFile: ActionHandler = async (input) => {
  const config = DownloadFileConfigSchema.parse(input.config);

  const providerAccountId =
    input.triggerEvent.provider === "monday"
      ? input.triggerEvent.providerAccountId
      : null;

  // 1) Fetch the item's file sources.
  const itemFiles = await refreshAndRetry({
    accountId: input.accountId,
    provider: "monday",
    providerAccountId,
    apiCall: (accessToken) =>
      itemFilesGet({ accessToken, itemId: config.itemId }),
  });
  if (itemFiles === null) {
    throw new NotFoundError(`item ${config.itemId}`);
  }

  // 2) Build the candidate asset list based on the column selection.
  let candidates: MondayAsset[];
  if (config.columnId === ITEM_FILES_SENTINEL) {
    candidates = [...itemFiles.assets, ...itemFiles.updateAssets];
  } else {
    const column = itemFiles.columnValues.find(
      (c) => c.id === config.columnId,
    );
    const { assetIds } = parseFileColumnAssetIds(column?.value ?? null);
    if (assetIds.length > 0) {
      candidates = await refreshAndRetry({
        accountId: input.accountId,
        provider: "monday",
        providerAccountId,
        apiCall: (accessToken) => assetsGet({ accessToken, assetIds }),
      });
    } else {
      // Column has no parseable file refs — fall back to item assets.
      candidates = [...itemFiles.assets, ...itemFiles.updateAssets];
    }
  }

  // 3) Select the target asset.
  const asset = pickAsset(candidates, config.fileId);
  if (asset === null) {
    throw new NotFoundError(
      config.fileId !== undefined
        ? `file ${config.fileId} on item ${config.itemId}`
        : `files on item ${config.itemId}`,
    );
  }

  // 4) Download bytes via the temporary public URL (no auth needed).
  if (!asset.public_url) {
    throw new Error(
      "Monday asset has no public_url; cannot download the file.",
    );
  }
  const bytes = await fetchAssetBytes(asset.public_url);

  const fileName = asset.name ?? `monday-file-${asset.id}`;
  // Monday returns file_extension, not a MIME type — store it in
  // metadata and use the generic octet-stream MIME (honest default).
  const mimeType = "application/octet-stream";

  // 5) Stage → FileRef(v2_storage, provider="monday").
  const staged = await stageFileToStorage({
    userId: input.userId,
    workflowId: input.workflowId,
    runId: input.runId,
    nodeId: input.nodeId,
    fileName,
    mimeType,
    bytes,
    ...(asset.file_size !== null && { sizeBytes: asset.file_size }),
    provider: "monday",
    metadata: {
      itemId: config.itemId,
      columnId: config.columnId,
      ...(asset.file_extension !== null && {
        fileExtension: asset.file_extension,
      }),
    },
  });

  return {
    output: {
      file: staged.ref,
      fileId: asset.id,
      fileName,
      mimeType,
      sizeBytes: bytes.byteLength,
    },
  };
};
