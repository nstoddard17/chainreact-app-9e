import { mondayRequest } from "./_request";
import type { MondayAsset } from "./itemFilesGet";

/**
 * Wrapper for Monday GraphQL `assets(ids: $assetIds)` — Slice 3.MONDAY-4.
 *
 * Resolves asset ids (extracted from a file column's `value` JSON) to
 * full asset objects with `public_url`. Used by `download_file` when the
 * requested file lives in a specific file column rather than the item's
 * general files area.
 *
 * Returned shape: array of assets (may be shorter than the input ids if
 * some were deleted).
 */

export interface AssetsGetInput {
  accessToken: string;
  assetIds: string[];
}

const QUERY = `
  query($assetIds: [ID!]) {
    assets(ids: $assetIds) {
      id
      name
      url
      public_url
      file_size
      file_extension
    }
  }
`;

export async function assetsGet(
  input: AssetsGetInput,
): Promise<MondayAsset[]> {
  if (input.assetIds.length === 0) return [];
  const data = await mondayRequest<{ assets: MondayAsset[] | null }>({
    accessToken: input.accessToken,
    query: QUERY,
    variables: { assetIds: input.assetIds },
  });
  return data.assets ?? [];
}
