import { dropboxRpc } from "./_request";
import type { DropboxEntry } from "./_types";

/**
 * Dropbox `/2/files/search_v2` — Slice 3.DROPBOX-2.
 *
 * Searches `query`, optionally scoped to a folder `path`. Dropbox nests
 * each hit as `matches[].metadata.metadata` (a wrapper around the entry);
 * this wrapper flattens to a `DropboxEntry[]` for the handler.
 */

interface SearchV2Response {
  matches?: Array<{
    metadata?: { metadata?: DropboxEntry } | DropboxEntry;
  }>;
  has_more?: boolean;
  cursor?: string;
}

export interface DropboxSearchResult {
  entries: DropboxEntry[];
  hasMore: boolean;
  cursor: string | null;
}

function extractEntry(match: {
  metadata?: { metadata?: DropboxEntry } | DropboxEntry;
}): DropboxEntry | null {
  const m = match.metadata;
  if (!m) return null;
  // search_v2 wraps the entry one level deep: { metadata: { metadata } }.
  if ("metadata" in m && m.metadata) return m.metadata;
  return m as DropboxEntry;
}

export async function filesSearch(input: {
  accessToken: string;
  query: string;
  path?: string;
  maxResults?: number;
}): Promise<DropboxSearchResult> {
  const options: Record<string, unknown> = {};
  if (input.path !== undefined) options.path = input.path;
  if (typeof input.maxResults === "number") options.max_results = input.maxResults;

  const res = await dropboxRpc<SearchV2Response>({
    accessToken: input.accessToken,
    endpoint: "/2/files/search_v2",
    args:
      Object.keys(options).length > 0
        ? { query: input.query, options }
        : { query: input.query },
  });
  const entries: DropboxEntry[] = [];
  for (const m of res.matches ?? []) {
    const entry = extractEntry(m);
    if (entry) entries.push(entry);
  }
  return {
    entries,
    hasMore: res.has_more ?? false,
    cursor: res.cursor ?? null,
  };
}
