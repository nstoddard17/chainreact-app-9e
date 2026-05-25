/**
 * Shared Dropbox metadata shapes + normalizer — Slice 3.DROPBOX-2.
 *
 * Dropbox returns one metadata shape for files and folders (discriminated
 * by the `.tag` field). `normalizeDropboxEntry` maps it into the
 * consistent V2 output shape every Dropbox action emits, so downstream
 * variable references (`{{node.entries.0.path}}`) are stable across
 * actions. Bytes / content never appear here.
 */

/** Raw Dropbox file/folder metadata (subset we consume). */
export interface DropboxEntry {
  ".tag"?: "file" | "folder" | "deleted";
  id?: string;
  name?: string;
  path_display?: string;
  path_lower?: string;
  size?: number;
  rev?: string;
  client_modified?: string;
  server_modified?: string;
  content_hash?: string;
}

/** Normalized V2 file/folder descriptor. All fields stable, null-filled. */
export interface NormalizedDropboxEntry {
  id: string | null;
  name: string | null;
  path: string | null;
  isFolder: boolean;
  sizeBytes: number | null;
  rev: string | null;
  clientModified: string | null;
  serverModified: string | null;
  contentHash: string | null;
}

export function normalizeDropboxEntry(e: DropboxEntry): NormalizedDropboxEntry {
  return {
    id: e.id ?? null,
    name: e.name ?? null,
    path: e.path_display ?? e.path_lower ?? null,
    isFolder: e[".tag"] === "folder",
    sizeBytes: typeof e.size === "number" ? e.size : null,
    rev: e.rev ?? null,
    clientModified: e.client_modified ?? null,
    serverModified: e.server_modified ?? null,
    contentHash: e.content_hash ?? null,
  };
}

/** Raw Dropbox shared-link metadata (subset). */
export interface DropboxSharedLink {
  url?: string;
  id?: string;
  name?: string;
  path_lower?: string;
  ".tag"?: string;
}
