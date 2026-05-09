import type { NotionBlockBody } from "@/integrations/_shared/notion/blocks";
import type { NotionPropertyValue } from "@/integrations/_shared/notion/properties";
import { notionRequest } from "./_request";

/**
 * Notion Pages API wrappers — Slice 9.
 *
 * Three endpoints:
 *   - `pagesCreate` — POST /v1/pages
 *   - `pagesRetrieve` — GET /v1/pages/{id}
 *   - `pagesUpdate` — PATCH /v1/pages/{id}
 *
 * Used by:
 *   - `actions/createPage.ts` + `actions/createDatabaseEntry.ts` →
 *     `pagesCreate`
 *   - `actions/getPage.ts` → `pagesRetrieve`
 *   - `actions/updatePage.ts` → `pagesUpdate`
 *
 * All wrappers route through `notionRequest` so 401 / 404 mapping +
 * Notion-Version pin live in one place.
 */

// ─── Shared shapes ─────────────────────────────────────────────────────

/**
 * Notion's parent reference. Discriminated by the parent type:
 *   - `{ database_id }` for pages whose parent is a database (rows).
 *   - `{ page_id }` for pages whose parent is another page.
 *   - `{ workspace: true }` for top-level workspace pages (not used by
 *     Slice 9 actions but documented for completeness).
 */
export type NotionParent =
  | { database_id: string }
  | { page_id: string }
  | { workspace: true };

export type NotionIcon =
  | { type: "emoji"; emoji: string }
  | { type: "external"; external: { url: string } };

export type NotionCover = { type: "external"; external: { url: string } };

/**
 * Notion's page response shape. Subset of the full page object — only
 * fields V2 reads.
 */
export interface NotionPage {
  object: "page";
  id: string;
  /** ISO-8601 timestamps. */
  created_time?: string;
  last_edited_time?: string;
  archived?: boolean;
  url?: string;
  /** Public URL used for the page; new for some workspaces. */
  public_url?: string | null;
  parent?: NotionParent;
  properties?: Record<string, unknown>;
  icon?: NotionIcon | null;
  cover?: NotionCover | null;
}

// ─── pagesCreate ─────────────────────────────────────────────────────────

export interface PagesCreateInput {
  accessToken: string;
  parent: NotionParent;
  properties: Record<string, NotionPropertyValue>;
  /** Optional initial children blocks (max 100 per the Notion API). */
  children?: ReadonlyArray<NotionBlockBody>;
  icon?: NotionIcon;
  cover?: NotionCover;
}

export async function pagesCreate(
  input: PagesCreateInput,
): Promise<NotionPage> {
  const body: Record<string, unknown> = {
    parent: input.parent,
    properties: input.properties,
  };
  if (input.children && input.children.length > 0) {
    body.children = input.children;
  }
  if (input.icon) body.icon = input.icon;
  if (input.cover) body.cover = input.cover;

  return notionRequest<NotionPage>({
    accessToken: input.accessToken,
    method: "POST",
    path: "/v1/pages",
    body,
    resourceForNotFound: "page-parent",
  });
}

// ─── pagesRetrieve ───────────────────────────────────────────────────────

export interface PagesRetrieveInput {
  accessToken: string;
  pageId: string;
}

export async function pagesRetrieve(
  input: PagesRetrieveInput,
): Promise<NotionPage> {
  return notionRequest<NotionPage>({
    accessToken: input.accessToken,
    method: "GET",
    path: `/v1/pages/${encodeURIComponent(input.pageId)}`,
    resourceForNotFound: `page ${input.pageId}`,
  });
}

// ─── pagesUpdate ─────────────────────────────────────────────────────────

export interface PagesUpdateInput {
  accessToken: string;
  pageId: string;
  /** Optional — when omitted, no property changes. */
  properties?: Record<string, NotionPropertyValue>;
  /** Optional — undefined leaves archived state unchanged (Q11). */
  archived?: boolean;
  icon?: NotionIcon | null;
  cover?: NotionCover | null;
}

export async function pagesUpdate(
  input: PagesUpdateInput,
): Promise<NotionPage> {
  const body: Record<string, unknown> = {};
  if (input.properties !== undefined) body.properties = input.properties;
  if (input.archived !== undefined) body.archived = input.archived;
  if (input.icon !== undefined) body.icon = input.icon;
  if (input.cover !== undefined) body.cover = input.cover;

  return notionRequest<NotionPage>({
    accessToken: input.accessToken,
    method: "PATCH",
    path: `/v1/pages/${encodeURIComponent(input.pageId)}`,
    body,
    resourceForNotFound: `page ${input.pageId}`,
  });
}
