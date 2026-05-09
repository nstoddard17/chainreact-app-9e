/**
 * Shared TypeScript types for the Microsoft Graph DriveItem resource.
 *
 * Subset of the full Graph DriveItem schema — only the fields V2 reads
 * in responses + writes in create/update/copy bodies. Adding a new
 * field that V2 needs to read goes here, not in each per-wrapper file.
 *
 * Graph reference:
 *   https://learn.microsoft.com/graph/api/resources/driveitem
 */

export interface DriveItemReference {
  /** Drive id (e.g. "b!Lz9...") — present on every item. */
  driveId?: string;
  /** Drive type, "personal" / "business" / "documentLibrary". */
  driveType?: string;
  /** Item id of the parent. */
  id?: string;
  /** Path string, e.g. "/drive/root:/Folder/Sub". */
  path?: string;
  /** Display name of the parent. */
  name?: string;
}

export interface DriveItemFileFacet {
  /** MIME type — present on file items. */
  mimeType?: string;
  hashes?: { quickXorHash?: string; sha1Hash?: string; sha256Hash?: string };
}

export interface DriveItemFolderFacet {
  /** Direct child count. */
  childCount?: number;
}

export interface DriveItem {
  id: string;
  name?: string;
  /** Bytes for files; sum of children for folders. */
  size?: number;
  webUrl?: string;
  /**
   * Short-lived (~1h) pre-signed download URL Graph emits on item
   * metadata for file items. Use promptly. Folders / inaccessible items
   * return without this field.
   */
  "@microsoft.graph.downloadUrl"?: string;
  /** Present iff the item is a file (mutually exclusive with `folder`). */
  file?: DriveItemFileFacet;
  /** Present iff the item is a folder (mutually exclusive with `file`). */
  folder?: DriveItemFolderFacet;
  parentReference?: DriveItemReference;
  createdDateTime?: string;
  lastModifiedDateTime?: string;
  /**
   * `@microsoft.graph.conflictBehavior`: "rename" | "fail" | "replace".
   * Slice 8 sets this explicitly per Q11 (`fail` for create_folder /
   * `rename` for move/copy when newName is supplied).
   */
}

/**
 * Body shape for `POST /me/drive/items/{parentId}/children` when
 * creating a folder.
 */
export interface DriveItemCreateFolderBody {
  name: string;
  folder: Record<string, never>;
  "@microsoft.graph.conflictBehavior": "rename" | "fail" | "replace";
}

/**
 * Body shape for `PATCH /me/drive/items/{id}` when moving and/or
 * renaming. Slice 8 sends only the fields that change.
 */
export interface DriveItemPatchBody {
  name?: string;
  parentReference?: { id: string };
}

/**
 * Body shape for `POST /me/drive/items/{id}/copy`. Graph requires at
 * least one of `parentReference` or `name`; Slice 8's schema requires
 * `parentReference.id`.
 */
export interface DriveItemCopyBody {
  parentReference: { id: string };
  name?: string;
  "@microsoft.graph.conflictBehavior"?: "rename" | "fail" | "replace";
}
