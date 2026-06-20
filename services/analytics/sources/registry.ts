import type { AnalyticsSourceAdapter, AnalyticsSourceMetric } from "./types";
import { internalAnalyticsSource } from "./internal";
import { githubAnalyticsSource } from "./github";
import { slackAnalyticsSource } from "./slack";
import { googleCalendarAnalyticsSource } from "./google-calendar";
import { gmailAnalyticsSource } from "./gmail";
import { stripeAnalyticsSource } from "./stripe";
import { microsoftOutlookAnalyticsSource } from "./microsoft-outlook";
import { microsoftOutlookCalendarAnalyticsSource } from "./microsoft-outlook-calendar";
import { notionAnalyticsSource } from "./notion";
import { trelloAnalyticsSource } from "./trello";
import { airtableAnalyticsSource } from "./airtable";
import { mondayAnalyticsSource } from "./monday";
import { hubspotAnalyticsSource } from "./hubspot";
import { shopifyAnalyticsSource } from "./shopify";
import { mailchimpAnalyticsSource } from "./mailchimp";
import { dropboxAnalyticsSource } from "./dropbox";

/**
 * Analytics SOURCE registry (Slice ANALYTICS-SOURCES-1).
 *
 * The single source of truth for which providers + metrics are APPROVED for
 * read-only analytics. SEPARATE from the trigger/action node registries by
 * design: registering a source here grants ONLY read/aggregate access through the
 * adapter's `query()`, never workflow-node execution.
 *
 * Adapters are registered statically (code), so widget config can reference a
 * provider/metric by KEY but can never name an arbitrary provider method, URL, or
 * node. Unknown provider/metric is rejected (`null` / not-approved) — callers
 * surface that as a widget error, never a crash.
 *
 * Registered sources:
 *   - INTERNAL ChainReact reference adapter (real account data, no OAuth).
 *   - GITHUB (connected app, read-only Search API, requesting-user-pinned
 *     personal credential) — ANALYTICS-SOURCES-GITHUB-1.
 *   - SLACK (connected app, read-only conversations.history, account-shared
 *     workspace bot token) — ANALYTICS-SOURCES-SLACK-1.
 *   - GOOGLE CALENDAR (connected app, read-only events.list, personal
 *     refreshable credential) — ANALYTICS-SOURCES-GCAL-1.
 *   - GMAIL (connected app, read-only messages.list COUNT queries, personal
 *     refreshable credential) — ANALYTICS-SOURCES-GMAIL-1.
 *   - STRIPE (connected app, read-only /v1/charges window scan → payment
 *     count/volume aggregates, account-shared refreshable credential) —
 *     ANALYTICS-SOURCES-STRIPE-1.
 *   - MICROSOFT OUTLOOK (connected app, read-only Graph /me/messages COUNT
 *     queries, personal refreshable credential) — ANALYTICS-SOURCES-OUTLOOK-1.
 *   - MICROSOFT OUTLOOK CALENDAR (connected app, read-only Graph calendarView
 *     window → meeting count/hours aggregates, personal refreshable credential) —
 *     ANALYTICS-SOURCES-OUTLOOK-CAL-1.
 *   - NOTION (connected app, read-only /v1/search page scan → workspace
 *     page-activity aggregates, account-shared non-refreshable credential) —
 *     ANALYTICS-SOURCES-NOTION-1.
 *   - TRELLO (connected app, read-only board-cards read → project-activity
 *     aggregates, personal non-refreshable credential) — ANALYTICS-SOURCES-TRELLO-1.
 *   - AIRTABLE (connected app, read-only records list + base schema → record
 *     count/created + table count, personal refreshable credential) —
 *     ANALYTICS-SOURCES-AIRTABLE-1.
 *   - MONDAY (connected app, read-only board items_count + items_page → item
 *     count/created + by-group, personal refreshable credential) —
 *     ANALYTICS-SOURCES-MONDAY-1.
 *   - HUBSPOT (connected app, read-only CRM Search `total` counts → open/closed-won
 *     deal scalars + contacts/deals/companies/tickets created-over-time, account-
 *     shared refreshable credential, strictly count-only, no record data read) —
 *     ANALYTICS-SOURCES-HUBSPOT-1.
 *   - SHOPIFY (connected app, read-only `/orders.json` window scan → order count /
 *     paid count / revenue sum + orders/revenue over-time, account-shared
 *     non-refreshable credential, count/sum-only, no customer/order detail read) —
 *     ANALYTICS-SOURCES-SHOPIFY-1.
 *   - MAILCHIMP (connected app, read-only aggregate reads → audience member count +
 *     sent-campaign count / over-time, account-shared non-refreshable credential,
 *     count-only, no subscriber/campaign content read) — ANALYTICS-SOURCES-MAILCHIMP-1.
 *   - DROPBOX (connected app, read-only bounded recursive list_folder scan → file /
 *     folder counts + files-modified over-time + files-by-type, personal refreshable
 *     credential, metadata-only, no file name/path/content read) —
 *     ANALYTICS-SOURCES-DROPBOX-1.
 *
 * NOTE: registration here grants only READ/AGGREGATE access through the adapter.
 * Whether a provider is actually EXPOSED in the widget config UI is a SEPARATE
 * switch in features/analytics/connectedAppSources.ts — GitHub is registered but
 * held back from the UI until it's smoke-testable.
 *
 * Further connected-app adapters (Stripe, Gmail, …) get added here in their own
 * security-reviewed slices once their credential-scope + rate-limit +
 * error-normalization behavior is proven.
 */

const SOURCE_LIST: readonly AnalyticsSourceAdapter[] = [
  internalAnalyticsSource,
  githubAnalyticsSource,
  slackAnalyticsSource,
  googleCalendarAnalyticsSource,
  gmailAnalyticsSource,
  stripeAnalyticsSource,
  microsoftOutlookAnalyticsSource,
  microsoftOutlookCalendarAnalyticsSource,
  notionAnalyticsSource,
  trelloAnalyticsSource,
  airtableAnalyticsSource,
  mondayAnalyticsSource,
  hubspotAnalyticsSource,
  shopifyAnalyticsSource,
  mailchimpAnalyticsSource,
  dropboxAnalyticsSource,
];

const REGISTRY: ReadonlyMap<string, AnalyticsSourceAdapter> = new Map(
  SOURCE_LIST.map((a) => [a.providerKey, a]),
);

/** The adapter for `providerKey`, or null when not registered/approved. */
export function getAnalyticsSource(
  providerKey: string,
): AnalyticsSourceAdapter | null {
  return REGISTRY.get(providerKey) ?? null;
}

/** The metric descriptor for `(providerKey, metricKey)`, or null when not approved. */
export function getAnalyticsSourceMetric(
  providerKey: string,
  metricKey: string,
): AnalyticsSourceMetric | null {
  const source = REGISTRY.get(providerKey);
  if (!source) return null;
  return source.metrics.find((m) => m.key === metricKey) ?? null;
}

/** True iff `(providerKey, metricKey)` is a registered, approved analytics source metric. */
export function isApprovedSourceMetric(
  providerKey: string,
  metricKey: string,
): boolean {
  return getAnalyticsSourceMetric(providerKey, metricKey) !== null;
}

/** Catalog of approved sources + their metrics — safe to expose to clients. */
export interface AnalyticsSourceCatalogEntry {
  providerKey: string;
  displayName: string;
  connectedApp: boolean;
  metrics: readonly AnalyticsSourceMetric[];
}

export function listAnalyticsSources(): readonly AnalyticsSourceCatalogEntry[] {
  return SOURCE_LIST.map((a) => ({
    providerKey: a.providerKey,
    displayName: a.displayName,
    connectedApp: a.connectedApp,
    metrics: a.metrics,
  }));
}
