import { mondayRequest } from "@/integrations/_shared/monday/api/_request";
import { groupsList } from "@/integrations/_shared/monday/api/groupsList";

/**
 * Bounded, READ-ONLY Monday reader for the analytics source
 * (Slice ANALYTICS-SOURCES-MONDAY-1).
 *
 * PRIVACY: deliberately does NOT reuse the workflow `itemsList` / `itemsListSummary`
 * wrappers — those query `name` + `column_values` + `creator` (sensitive). These
 * documents request ONLY `id` (transient pagination), `created_at`, `group { id }`,
 * and `state`. Each item is projected to a transient {@link ItemFact}; item names,
 * column values, updates, files, assignees, and the raw payload are never read into
 * a fact, returned, or cached. `board.items_count` is a server-side count — no item
 * data is fetched at all for the open-items scalar.
 *
 * SAFETY — bounded to prevent an unbounded board scan: a HARD page cap
 * ({@link MAX_PAGES} × {@link PAGE_SIZE}). Past the cap we stop and report
 * `truncated: true` rather than walking the whole board.
 *
 * No raw GraphQL document comes from widget config — the board id is a validated
 * numeric variable and the queries are fixed server-side constants.
 */

export const PAGE_SIZE = 500; // Monday's items_page ceiling.
/** ≤ 4 pages = 2000 items per scan before truncation. */
export const MAX_PAGES = 4;

/** Transient, non-identifying projection of one item. Never cached/returned to client. */
export interface ItemFact {
  /** created_at epoch ms (null when absent/unparseable). */
  createdMs: number | null;
  /** The id of the group the item sits in (structural; used to group by group). */
  groupId: string | null;
  /** Monday item state ("active" | "archived" | "deleted"). */
  state: string | null;
}

export interface ScanResult {
  facts: ItemFact[];
  /** True when there were more items than the page cap. */
  truncated: boolean;
}

function parseMs(value: unknown): number | null {
  if (typeof value !== "string") return null;
  const ms = Date.parse(value);
  return Number.isNaN(ms) ? null : ms;
}

// ─── board.items_count (open items scalar) ────────────────────────────────────

const ITEMS_COUNT_QUERY = `
  query($boardId: ID!) {
    boards(ids: [$boardId]) {
      id
      items_count
    }
  }
`;

interface ItemsCountData {
  boards: Array<{ id: string; items_count: number | null }> | null;
}

/** Server-side active-item count for a board (no item data fetched). */
export async function fetchItemCount(accessToken: string, boardId: string): Promise<number> {
  const data = await mondayRequest<ItemsCountData>({
    accessToken,
    query: ITEMS_COUNT_QUERY,
    variables: { boardId },
  });
  const board = data.boards && data.boards.length > 0 ? data.boards[0]! : null;
  return typeof board?.items_count === "number" ? board.items_count : 0;
}

// ─── items scan (created-over-time + by-group) ────────────────────────────────

const FIRST_PAGE_QUERY = `
  query($boardId: ID!, $limit: Int!) {
    boards(ids: [$boardId]) {
      id
      items_page(limit: $limit) {
        cursor
        items { id created_at group { id } state }
      }
    }
  }
`;

const NEXT_PAGE_QUERY = `
  query($cursor: String!) {
    next_items_page(cursor: $cursor) {
      cursor
      items { id created_at group { id } state }
    }
  }
`;

interface RawItem {
  id?: unknown;
  created_at?: unknown;
  group?: { id?: unknown } | null;
  state?: unknown;
}

interface FirstPageData {
  boards: Array<{ id: string; items_page: { cursor: string | null; items: RawItem[] | null } | null }> | null;
}

interface NextPageData {
  next_items_page: { cursor: string | null; items: RawItem[] | null } | null;
}

function project(raw: RawItem): ItemFact {
  return {
    createdMs: parseMs(raw.created_at),
    groupId: raw.group && typeof raw.group.id === "string" ? raw.group.id : null,
    state: typeof raw.state === "string" ? raw.state : null,
  };
}

/**
 * Scan a board's items (cursor-paginated), projecting each to a {@link ItemFact}.
 * Exact under the cap; `truncated: true` beyond it. Throws `Unauthorized401Error` /
 * `NotFoundError` / `RateLimitError` / `MondayApiError`; the adapter classifies them.
 */
export async function scanItems(
  accessToken: string,
  boardId: string,
  input: { maxPages?: number } = {},
): Promise<ScanResult> {
  const maxPages = input.maxPages ?? MAX_PAGES;
  const facts: ItemFact[] = [];

  const first = await mondayRequest<FirstPageData>({
    accessToken,
    query: FIRST_PAGE_QUERY,
    variables: { boardId, limit: PAGE_SIZE },
  });
  const board = first.boards && first.boards.length > 0 ? first.boards[0]! : null;
  for (const raw of board?.items_page?.items ?? []) facts.push(project(raw));
  let cursor: string | null = board?.items_page?.cursor ?? null;
  if (!cursor) return { facts, truncated: false };

  // Pages 2..maxPages via the cursor-driven next_items_page entry point.
  for (let page = 1; page < maxPages; page++) {
    const next: NextPageData = await mondayRequest<NextPageData>({
      accessToken,
      query: NEXT_PAGE_QUERY,
      variables: { cursor },
    });
    for (const raw of next.next_items_page?.items ?? []) facts.push(project(raw));
    cursor = next.next_items_page?.cursor ?? null;
    if (!cursor) return { facts, truncated: false };
  }

  return { facts, truncated: cursor !== null };
}

// ─── groups (labels for items_by_group) ───────────────────────────────────────

/** Fetch a board's groups as `{ id, title }` (titles are board-structure labels). */
export async function fetchGroups(
  accessToken: string,
  boardId: string,
): Promise<ReadonlyArray<{ id: string; title: string | null }>> {
  const result = await groupsList({ accessToken, boardId });
  return result.groups.map((g) => ({ id: g.id, title: g.title }));
}
