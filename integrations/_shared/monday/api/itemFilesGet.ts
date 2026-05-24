import { mondayRequest } from "./_request";

/**
 * Wrapper for Monday GraphQL item-files read — Slice 3.MONDAY-4.
 *
 * Backs the `download_file` action's asset resolution. Monday exposes
 * an item's files in three places:
 *   - `item.assets` — files attached directly to the item.
 *   - `item.updates[].assets` — files attached to the item's updates.
 *   - file-typed `column_values` — the `value` JSON carries
 *     `{ files: [{ assetId }] }`; resolving those to full asset objects
 *     needs a follow-up `assets(ids:)` lookup (see `assetsGet`).
 *
 * This wrapper fetches the item with all three sources in one query so
 * the handler can resolve the requested file (by `__item_files__`
 * sentinel or a specific file column) without multiple round-trips for
 * the common cases.
 *
 * Returns null when the item doesn't exist (handler maps to NotFound).
 */

export interface MondayAsset {
  id: string;
  name: string | null;
  url: string | null;
  public_url: string | null;
  file_size: number | null;
  file_extension: string | null;
}

export interface ItemFilesGetInput {
  accessToken: string;
  itemId: string;
}

export interface MondayItemFileColumnValue {
  id: string;
  type: string | null;
  value: string | null;
}

export interface ItemFilesGetOutput {
  itemId: string;
  itemName: string | null;
  /** Direct item-level assets. */
  assets: MondayAsset[];
  /** Assets attached to the item's updates (flattened). */
  updateAssets: MondayAsset[];
  /** Raw column_values so the handler can parse file-column assetIds. */
  columnValues: MondayItemFileColumnValue[];
}

const QUERY = `
  query($itemId: [ID!]) {
    items(ids: $itemId) {
      id
      name
      assets {
        id
        name
        url
        public_url
        file_size
        file_extension
      }
      column_values {
        id
        type
        value
      }
      updates(limit: 100) {
        id
        assets {
          id
          name
          url
          public_url
          file_size
          file_extension
        }
      }
    }
  }
`;

interface QueryData {
  items:
    | Array<{
        id: string;
        name: string | null;
        assets: MondayAsset[] | null;
        column_values: MondayItemFileColumnValue[] | null;
        updates: Array<{ id: string; assets: MondayAsset[] | null }> | null;
      }>
    | null;
}

export async function itemFilesGet(
  input: ItemFilesGetInput,
): Promise<ItemFilesGetOutput | null> {
  const data = await mondayRequest<QueryData>({
    accessToken: input.accessToken,
    query: QUERY,
    variables: { itemId: [input.itemId] },
  });
  const item = data.items && data.items.length > 0 ? data.items[0]! : null;
  if (!item) return null;
  const updateAssets: MondayAsset[] = [];
  for (const update of item.updates ?? []) {
    for (const asset of update.assets ?? []) {
      updateAssets.push(asset);
    }
  }
  return {
    itemId: item.id,
    itemName: item.name,
    assets: item.assets ?? [],
    updateAssets,
    columnValues: item.column_values ?? [],
  };
}
