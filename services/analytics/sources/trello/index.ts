import { getActiveForExecution } from "@/repositories/integrations";
import { decryptToken } from "@/core/encryption/tokens";
import { Unauthorized401Error } from "@/services/oauth/refreshAndRetry";
import { TrelloNotFoundError } from "@/integrations/_shared/trello/api/errors";
import {
  AnalyticsSourceError,
  type AnalyticsSourceAdapter,
  type AnalyticsSourceContext,
  type AnalyticsSourceMetric,
  type AnalyticsSourceQuery,
  type NormalizedAnalyticsResult,
} from "../types";
import { MAX_CARDS, fetchBoardCards, fetchBoardLists } from "./api";
import { bucketIndexForMs, parseBoardId, planBuckets, type TrelloTimeBucket } from "./buckets";

/**
 * Trello connected-app analytics source — v1 (Slice ANALYTICS-SOURCES-TRELLO-1).
 *
 * READ-ONLY. Reduces a BOUNDED read of one board's cards to numeric project-activity
 * aggregates (counts + over-time + per-list breakdown). Never executes a workflow
 * node, never takes a raw Trello query from widget config (the board is a validated
 * 24-hex id from the picker), never reads card name, description, comments,
 * checklists, members, attachments, or url. Approved metrics only (validated upstream).
 *
 * CREDENTIAL MODEL (personal provider, per core/integrations/credentialSharing.ts):
 * Trello is PERSONAL, so this resolves the REQUESTING USER'S OWN connection
 * (`connected_by_user_id = ctx.userId`) and decrypts that row's token — never a
 * co-member's. The cache layer keys personal providers with
 * `source_user_id = ctx.userId`, so each member's snapshot is distinct. No Trello
 * connection → typed MISSING_CREDENTIAL. Trello is NON-REFRESHABLE → a 401 maps to
 * MISSING_CREDENTIAL (reconnect), never a refresh attempt.
 *
 * PRIVACY: only card COUNTS / created+due TIMING / list-name labels are computed
 * and cached. No card names, descriptions, comments, checklist content, member
 * names, attachments, urls, card ids, or raw Trello payloads are returned or
 * stored. (List NAMES are board-structure labels — like Slack channel names — and
 * are the only text surfaced, on the cards_by_list breakdown.)
 *
 * SCOPES: uses only the already-granted `read` permission (board cards + lists).
 * No new scope is requested.
 */

const PROVIDER_KEY = "trello";

const BOARD_FILTER = ["board"] as const;

const METRICS: readonly AnalyticsSourceMetric[] = [
  {
    key: "open_cards_count",
    label: "Open cards",
    description: "Open (non-archived) cards on the board.",
    visualizations: ["scalar"],
    supportedGroupBy: [],
    supportedFilters: BOARD_FILTER,
  },
  {
    key: "closed_cards_count",
    label: "Archived cards",
    description: "Archived (closed) cards on the board.",
    visualizations: ["scalar"],
    supportedGroupBy: [],
    supportedFilters: BOARD_FILTER,
  },
  {
    key: "overdue_cards_count",
    label: "Overdue cards",
    description: "Open cards past their due date and not marked complete.",
    visualizations: ["scalar"],
    supportedGroupBy: [],
    supportedFilters: BOARD_FILTER,
  },
  {
    key: "cards_created_over_time",
    label: "Cards created over time",
    description: "Cards created per time bucket.",
    visualizations: ["series"],
    supportedGroupBy: [],
    supportedFilters: BOARD_FILTER,
  },
  {
    key: "cards_by_list",
    label: "Cards by list",
    description: "Open cards grouped by list.",
    visualizations: ["series"],
    supportedGroupBy: [],
    supportedFilters: BOARD_FILTER,
  },
];

function liveFreshness(): NormalizedAnalyticsResult["freshness"] {
  return { cached: false, ageSeconds: 0, ttlSeconds: null };
}

/** Map any error from a Trello read into a typed, leak-free AnalyticsSourceError. */
function classifyTrelloError(err: unknown): AnalyticsSourceError {
  if (err instanceof AnalyticsSourceError) return err;
  // 401 (token rejected) or 404 (board gone / access lost) → reconnect / re-pick.
  if (err instanceof Unauthorized401Error) {
    return new AnalyticsSourceError("Reconnect Trello before this widget can load.", "MISSING_CREDENTIAL");
  }
  if (err instanceof TrelloNotFoundError) {
    return new AnalyticsSourceError(
      "ChainReact can't read that Trello board. Check the board or your access.",
      "INVALID_QUERY",
    );
  }
  const message = err instanceof Error ? err.message : String(err);
  if (/rate.?limit|too many requests|HTTP 429|\b429\b/i.test(message)) {
    return new AnalyticsSourceError("Trello's rate limit was reached. Try again shortly.", "RATE_LIMITED");
  }
  // No raw Trello error body / token / payload leaks — a generic, safe message.
  return new AnalyticsSourceError("Couldn't load Trello data.", "PROVIDER_ERROR");
}

/** Resolve the requesting user's OWN Trello token (or MISSING_CREDENTIAL). */
async function resolveOwnTrelloToken(ctx: AnalyticsSourceContext): Promise<string> {
  const integration = await getActiveForExecution(ctx.accountId, PROVIDER_KEY, null, {
    connectedByUserId: ctx.userId,
  });
  if (!integration) {
    throw new AnalyticsSourceError("Connect Trello to use this widget.", "MISSING_CREDENTIAL");
  }
  try {
    return decryptToken(integration.accessTokenEncrypted);
  } catch {
    throw new AnalyticsSourceError("Reconnect Trello before this widget can load.", "MISSING_CREDENTIAL");
  }
}

function truncationWarnings(truncated: boolean): string[] {
  return truncated
    ? [`Based on the first ${MAX_CARDS} cards — this board has more than that.`]
    : [];
}

function scalarResult(
  metricKey: string,
  value: number,
  generatedAt: string,
  warnings: string[],
  truncated: boolean,
): NormalizedAnalyticsResult {
  return {
    shape: "scalar",
    dimensions: [],
    measures: [metricKey],
    rows: [{ [metricKey]: value }],
    totals: { [metricKey]: value },
    generatedAt,
    freshness: liveFreshness(),
    warnings,
    truncated,
  };
}

export const trelloAnalyticsSource: AnalyticsSourceAdapter = {
  providerKey: PROVIDER_KEY,
  displayName: "Trello",
  connectedApp: true,
  cacheTtlSeconds: 600,
  metrics: METRICS,

  async query(
    query: AnalyticsSourceQuery,
    ctx: AnalyticsSourceContext,
  ): Promise<NormalizedAnalyticsResult> {
    const metric = METRICS.find((m) => m.key === query.metricKey);
    if (!metric) {
      throw new AnalyticsSourceError(`Unknown Trello metric: ${query.metricKey}`, "UNKNOWN_METRIC");
    }

    // Validate the board filter server-side BEFORE any I/O (required).
    let boardId: string;
    try {
      boardId = parseBoardId(query.filters?.board);
    } catch (err) {
      throw new AnalyticsSourceError(
        err instanceof Error ? err.message : "Pick a Trello board.",
        "INVALID_QUERY",
      );
    }

    const generatedAt = new Date().toISOString();
    const token = await resolveOwnTrelloToken(ctx);

    try {
      // ── Count scalars ──────────────────────────────────────────────────────
      if (query.metricKey === "open_cards_count") {
        const { facts, truncated } = await fetchBoardCards(token, boardId, "open");
        return scalarResult("open_cards_count", facts.length, generatedAt, truncationWarnings(truncated), truncated);
      }
      if (query.metricKey === "closed_cards_count") {
        const { facts, truncated } = await fetchBoardCards(token, boardId, "closed");
        return scalarResult("closed_cards_count", facts.length, generatedAt, truncationWarnings(truncated), truncated);
      }
      if (query.metricKey === "overdue_cards_count") {
        const { facts, truncated } = await fetchBoardCards(token, boardId, "open");
        const nowMs = Date.now();
        const overdue = facts.filter((f) => {
          if (f.dueComplete || f.due === null) return false;
          const dueMs = Date.parse(f.due);
          return !Number.isNaN(dueMs) && dueMs < nowMs;
        }).length;
        return scalarResult("overdue_cards_count", overdue, generatedAt, truncationWarnings(truncated), truncated);
      }

      // ── Breakdown: cards by list (open cards grouped by list name) ───────────
      if (query.metricKey === "cards_by_list") {
        const [{ facts, truncated }, lists] = await Promise.all([
          fetchBoardCards(token, boardId, "open"),
          fetchBoardLists(token, boardId),
        ]);
        const nameById = new Map<string, string>();
        for (const l of lists) {
          if (typeof l.id === "string" && typeof l.name === "string") nameById.set(l.id, l.name);
        }
        const countByList = new Map<string, number>();
        for (const f of facts) {
          if (f.idList === null) continue;
          countByList.set(f.idList, (countByList.get(f.idList) ?? 0) + 1);
        }
        // Preserve the board's list order; only include lists that still exist.
        const rows = lists
          .filter((l) => typeof l.id === "string")
          .map((l) => ({ date: nameById.get(l.id) ?? l.id, count: countByList.get(l.id) ?? 0 }));
        return {
          shape: "series",
          dimensions: ["list"],
          measures: ["count"],
          rows,
          totals: { count: rows.reduce((a, r) => a + (typeof r.count === "number" ? r.count : 0), 0) },
          generatedAt,
          freshness: liveFreshness(),
          warnings: truncationWarnings(truncated),
          truncated,
        };
      }

      // ── Series: cards created over time (created derived from card id) ───────
      const buckets = planBuckets(query.range.since, query.range.until);
      if (buckets.length === 0) {
        return {
          shape: "series",
          dimensions: ["date"],
          measures: ["count"],
          rows: [],
          totals: { count: 0 },
          generatedAt,
          freshness: liveFreshness(),
          warnings: ["The selected date range is empty or invalid."],
          truncated: false,
        };
      }
      const { facts, truncated } = await fetchBoardCards(token, boardId, "all");
      const counts = new Array<number>(buckets.length).fill(0);
      for (const f of facts) {
        const idx = bucketIndexForMs(buckets, f.createdMs);
        if (idx >= 0) counts[idx]! += 1;
      }
      return seriesResult(buckets, counts, generatedAt, truncationWarnings(truncated), truncated);
    } catch (err) {
      throw classifyTrelloError(err);
    }
  },
};

function seriesResult(
  buckets: readonly TrelloTimeBucket[],
  counts: readonly number[],
  generatedAt: string,
  warnings: string[],
  truncated: boolean,
): NormalizedAnalyticsResult {
  return {
    shape: "series",
    dimensions: ["date"],
    measures: ["count"],
    rows: buckets.map((b, i) => ({ date: b.key, count: counts[i] ?? 0 })),
    totals: { count: counts.reduce((a, b) => a + b, 0) },
    generatedAt,
    freshness: liveFreshness(),
    warnings,
    truncated,
  };
}
