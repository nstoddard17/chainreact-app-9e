/**
 * Slice 4.AI-30 — deterministic provider narrowing for the planner catalog.
 *
 * Why this exists:
 *   AI-27 measured the planner input cost at ~38k input tokens / request,
 *   ~88% of which (~33.6k tokens) is the full 26-provider catalog. Sending
 *   every provider on every request is the single biggest cost driver
 *   measured. This helper computes a SAFE subset of providers for one
 *   planning call, based ONLY on signals already present in the planner
 *   input (user request text, connected integrations, current canvas).
 *   No model classifier — that would re-introduce the cost it's meant to
 *   cut. A future AI-31 may layer a classifier on top, but AI-30 starts
 *   with the cheaper, fully-testable deterministic path.
 *
 * Safety invariants (the no-substitution rule wins over the cost lever):
 *   1. EXPLICIT MENTIONS — every provider the user names (literal id,
 *      manifest display name, or known alias) MUST be included; even an
 *      "extras cap" can never drop one.
 *   2. CURRENT CANVAS — every provider on the user's current builder
 *      canvas MUST be included; the planner needs them to edit / extend
 *      the existing workflow without substituting.
 *   3. CONNECTED INTEGRATIONS — every connected provider MUST be included;
 *      omitting one would silently invalidate the "Send a Slack DM"
 *      class of requests where the user already has the integration.
 *   4. NATIVE — the synthetic `native` provider (manual / schedule / delay
 *      / branch / route / filter / condition / loop) is tiny and
 *      universally useful; always included in narrowed mode.
 *   5. AMBIGUOUS BROAD REQUESTS — when the user names nothing (e.g.
 *      "create an automation", "build a workflow", "help me") we DO NOT
 *      narrow — we fall through to the full catalog so the planner can
 *      surface the right provider. Narrowing on an ambiguous prompt would
 *      hide providers the user actually wanted.
 *   6. COMPLEX CANVAS + VAGUE EDIT — a populated canvas plus a very short
 *      vague edit prompt ("add a step", "fix this") also falls through;
 *      we can't safely guess which provider the edit refers to.
 *
 * Output: a {@link NarrowProvidersResult} describing what was kept, why,
 * and (if narrowing was skipped) the reason. The caller filters the
 * catalog and threads metadata into `PlannerPromptAttribution` so
 * `ai_cost_events` dashboards can attribute cost savings.
 *
 * No-leak: the helper consumes the same plaintext sources the prompt
 * builder already ships to the model — no new PII or secret-shaped data
 * crosses the boundary. Decision metadata returned is structural (ids /
 * counts / enum reasons), never raw user-prompt strings.
 *
 * Rollback: `process.env.ENABLE_AI_PROVIDER_NARROWING === "false"` skips
 * narrowing for one rollout cycle. Default (env unset OR any other value)
 * is ON. Read at call-time so unit tests can flip it per case without a
 * module reload.
 */

import type { CurrentWorkflowGraphView } from "./types";
import type { ConnectedIntegrationView } from "@/services/ai/tools/integrations";
import type { ProviderCatalogView } from "@/services/ai/tools/providerCatalog";

// ─── Public types ────────────────────────────────────────────────────────────

export interface NarrowProvidersInput {
  readonly userRequest: string;
  readonly catalog: ProviderCatalogView;
  readonly connectedIntegrations: readonly ConnectedIntegrationView[];
  readonly currentGraph?: CurrentWorkflowGraphView;
}

/**
 * Why narrowing was skipped (or `null` when narrowing was applied).
 * Stable string enum — folded into `PlannerPromptAttribution` and
 * surfaced in `ai_cost_events.metadata.providerNarrowingReason`.
 */
export type NarrowingFallbackReason =
  | "narrowing_disabled" // env flag set to "false"
  | "empty_user_request" // request is blank / whitespace only
  | "empty_catalog" // catalog has no providers (registry failure)
  | "no_provider_mention" // user named no provider, alias, or capability term that points at one
  | "ambiguous_broad_request" // request is a generic ask with no specific intent ("create automation")
  | "complex_canvas_vague_edit"; // populated canvas + very short vague edit prompt

export interface NarrowProvidersResult {
  /** narrowed: a strict subset; full-catalog: every provider is included. */
  readonly mode: "narrowed" | "full-catalog";
  /** Provider ids the caller should keep when filtering the catalog. */
  readonly providerIds: ReadonlySet<string>;
  /** Providers named explicitly in the request (literal id / displayName / alias). */
  readonly explicitlyMentionedProviderIds: readonly string[];
  /** Providers matched via alias rather than literal id (subset of explicit). */
  readonly aliasMatchedProviderIds: readonly string[];
  /** Providers added because the request implied them ambiguously (e.g. "email" → gmail + outlook). */
  readonly ambiguousInclusions: readonly string[];
  /** Providers added because the user has them connected. */
  readonly connectedProviderIds: readonly string[];
  /** Providers added because they're on the current canvas. */
  readonly canvasProviderIds: readonly string[];
  /** True when `native` was added to the narrowed set. */
  readonly nativeIncluded: boolean;
  /** Set when `mode === "full-catalog"`; null when `mode === "narrowed"`. */
  readonly fallbackReason: NarrowingFallbackReason | null;
  /** Count of catalog providers the filter would drop. 0 in full-catalog mode. */
  readonly omittedProviderCount: number;
}

// ─── Alias tables (deterministic, metadata-driven where possible) ────────────

/**
 * Surface-form → provider-id alias map. Each entry's left-hand side is a
 * lowercased substring tested against the lowercased user-request text;
 * the right-hand side is the canonical provider id from the registry
 * (`integrations/_registry.ts`). Aliases are intentionally narrow — they
 * must point AT a single provider with high confidence. Ambiguous terms
 * ("email", "calendar") live in their own ambiguous-token tables below so
 * we can route them to multiple candidates safely instead of guessing.
 *
 * Word-boundary matching is performed on each alias (regex `\b<alias>\b`)
 * so substrings inside larger words (e.g. "monthly" ≠ "month") don't
 * false-trigger. Multi-word aliases match as literal substrings inside
 * the lowercased request — the boundary check is applied to the start
 * and end characters of the alias.
 *
 * Order: aliases are evaluated longest-first within a provider so
 * "google sheets" matches before the bare "sheets" would have a chance
 * to fall through (handled implicitly because each alias is checked
 * independently; provider order is irrelevant).
 */
const PROVIDER_ALIASES: ReadonlyArray<{
  readonly providerId: string;
  readonly aliases: readonly string[];
}> = [
  { providerId: "gmail", aliases: ["gmail", "google mail", "googlemail"] },
  {
    providerId: "microsoft-outlook",
    aliases: [
      "outlook mail",
      "microsoft outlook",
      "ms outlook",
      "office 365 mail",
      "o365 mail",
      "outlook email",
    ],
  },
  {
    providerId: "microsoft-outlook-calendar",
    aliases: [
      "outlook calendar",
      "outlook cal",
      "ms outlook calendar",
      "microsoft outlook calendar",
    ],
  },
  {
    providerId: "google-calendar",
    aliases: ["google calendar", "gcal", "google cal"],
  },
  {
    providerId: "google-sheets",
    aliases: ["google sheets", "google sheet", "gsheet", "gsheets", "sheets"],
  },
  {
    providerId: "google-drive",
    aliases: ["google drive", "gdrive", "g drive"],
  },
  {
    providerId: "google-docs",
    aliases: ["google docs", "google doc", "gdoc", "gdocs"],
  },
  {
    providerId: "google-analytics",
    aliases: ["google analytics", "ga4"],
  },
  {
    providerId: "microsoft-teams",
    aliases: ["microsoft teams", "ms teams", "msteams", "teams"],
  },
  {
    providerId: "microsoft-excel",
    aliases: ["microsoft excel", "excel", "xlsx"],
  },
  {
    providerId: "microsoft-onedrive",
    aliases: ["onedrive", "one drive"],
  },
  {
    providerId: "microsoft-onenote",
    aliases: ["onenote", "one note"],
  },
  { providerId: "slack", aliases: ["slack"] },
  { providerId: "discord", aliases: ["discord"] },
  {
    providerId: "stripe",
    aliases: [
      "stripe",
      "stripe payment",
      "stripe charge",
      "stripe invoice",
      "stripe subscription",
    ],
  },
  { providerId: "shopify", aliases: ["shopify"] },
  { providerId: "notion", aliases: ["notion"] },
  { providerId: "trello", aliases: ["trello"] },
  { providerId: "airtable", aliases: ["airtable"] },
  { providerId: "hubspot", aliases: ["hubspot", "hub spot"] },
  { providerId: "mailchimp", aliases: ["mailchimp", "mail chimp"] },
  // Bare "monday" is heavily overloaded ("Monday morning", "every Monday")
  // — only match when the user explicitly says "monday.com" or the
  // "monday board" / "monday board" verb form. "monday board" is
  // safe because "monday" alone never appears in that bigram.
  {
    providerId: "monday",
    aliases: ["monday.com", "monday board", "monday item"],
  },
  { providerId: "github", aliases: ["github", "git hub"] },
  // "facebook" alone is the safe trigger; "fb" / "meta" are too overloaded
  // for general English (FB = "feedback", meta = "metadata"), so we only
  // match the literal brand name here.
  { providerId: "facebook", aliases: ["facebook"] },
  { providerId: "dropbox", aliases: ["dropbox", "drop box"] },
  // `native` has its own logic-keyword path further down — no alias here.
];

/**
 * Capability tokens that imply EMAIL but are ambiguous between Gmail and
 * Outlook. When any of these appear AND the user didn't explicitly name
 * either provider, BOTH are added to the narrowed catalog so the planner
 * can choose without substituting.
 */
const AMBIGUOUS_EMAIL_TOKENS: readonly string[] = [
  "email",
  "emails",
  "e-mail",
  "e mail",
  "new mail",
  "send an email",
  "send email",
  "receive an email",
  "got an email",
  "new email",
];

/**
 * Capability tokens that imply CALENDAR but are ambiguous between
 * Google Calendar and Outlook Calendar. Same dual-inclusion rule as
 * email.
 */
const AMBIGUOUS_CALENDAR_TOKENS: readonly string[] = [
  "calendar",
  "calendar event",
  "calendar invite",
  "meeting invite",
];

/**
 * Logic-flow keywords that pull `native` into the narrowed catalog
 * (manual trigger / schedule / delay / branch / filter / loop / etc.).
 * The user explicitly asking for any of these is a signal that native
 * is INTENDED, not just convenient. `native` is also unconditionally
 * included in every narrowed result because the provider is tiny and
 * its building blocks (delay, branch, condition) are useful enough that
 * the cost of always shipping them is negligible.
 */
const NATIVE_LOGIC_TOKENS: readonly string[] = [
  "manual",
  "manually",
  "on demand",
  "on-demand",
  "test run",
  "run it manually",
  "run manually",
  "schedule",
  "scheduled",
  "cron",
  "recurring",
  "every hour",
  "every day",
  "every week",
  "every minute",
  "every month",
  "delay",
  "wait",
  "sleep",
  "pause",
  "if-then",
  "if/then",
  "condition",
  "conditional",
  "branch",
  "branches",
  "route",
  "router",
  "filter",
  "filters",
  "switch",
  "loop",
  "for each",
];

/**
 * Phrases that mean "I don't know what I want yet" — used to short-circuit
 * narrowing into a full-catalog fallback so the planner can show the user
 * the option space instead of narrowing into whatever happens to be
 * connected.
 */
const BROAD_GENERIC_PHRASES: readonly string[] = [
  "create an automation",
  "create automation",
  "build an automation",
  "build automation",
  "make an automation",
  "make automation",
  "create a workflow",
  "create workflow",
  "build a workflow",
  "build workflow",
  "make a workflow",
  "make workflow",
  "set up an automation",
  "set up automation",
  "set up a workflow",
  "set up workflow",
  "help me build",
  "help me create",
  "what can you do",
  "any workflow",
  "any automation",
];

// ─── Helpers ─────────────────────────────────────────────────────────────────

function lowerTrim(s: string): string {
  return (s ?? "").toLowerCase().trim();
}

/**
 * Word-boundary match for a lowercased alias inside a lowercased haystack.
 * Multi-word aliases are matched as substrings with character-class
 * boundaries on each end so "teams" doesn't match "esteems".
 */
function containsAlias(haystack: string, alias: string): boolean {
  if (alias.length === 0) return false;
  // For multi-word aliases or aliases with non-word chars (e.g. "monday.com"),
  // fall back to a plain substring check — the surrounding tokens are
  // sufficient signal and a strict regex is hard to get right cross-locale.
  if (/[^a-z0-9]/.test(alias)) {
    return haystack.includes(alias);
  }
  // Build a word-boundary regex around the alias. The boundary chars are
  // ASCII-letter / digit / underscore on each side; escapes are
  // unnecessary because PROVIDER_ALIASES values are static, but we still
  // escape defensively.
  const re = new RegExp(`(^|[^a-z0-9])${escapeRegex(alias)}([^a-z0-9]|$)`, "i");
  return re.test(haystack);
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function uniquePreserveOrder<T>(items: Iterable<T>): T[] {
  const seen = new Set<T>();
  const out: T[] = [];
  for (const item of items) {
    if (!seen.has(item)) {
      seen.add(item);
      out.push(item);
    }
  }
  return out;
}

function fullCatalogResult(
  input: NarrowProvidersInput,
  reason: NarrowingFallbackReason,
): NarrowProvidersResult {
  return {
    mode: "full-catalog",
    providerIds: new Set(input.catalog.providers.map((p) => p.id)),
    explicitlyMentionedProviderIds: [],
    aliasMatchedProviderIds: [],
    ambiguousInclusions: [],
    connectedProviderIds: uniquePreserveOrder(
      input.connectedIntegrations.map((i) => i.provider),
    ),
    canvasProviderIds: uniquePreserveOrder(
      (input.currentGraph?.nodes ?? []).map((n) => n.provider),
    ),
    nativeIncluded: input.catalog.providers.some((p) => p.id === "native"),
    fallbackReason: reason,
    omittedProviderCount: 0,
  };
}

// ─── Main entry ──────────────────────────────────────────────────────────────

/**
 * Decide which subset of `catalog.providers` to ship to the planner for
 * one request. See the file-level JSDoc for the safety invariants and the
 * fallback policy. Deterministic, no model calls, no I/O.
 */
export function narrowProvidersForPlan(
  input: NarrowProvidersInput,
): NarrowProvidersResult {
  // Rollback path — env flag off keeps the full catalog. Read at
  // call-time so unit tests can flip it per case without a module reload.
  if (process.env.ENABLE_AI_PROVIDER_NARROWING === "false") {
    return fullCatalogResult(input, "narrowing_disabled");
  }

  if (input.catalog.providers.length === 0) {
    return fullCatalogResult(input, "empty_catalog");
  }

  const request = lowerTrim(input.userRequest);
  if (request.length === 0) {
    return fullCatalogResult(input, "empty_user_request");
  }

  const catalogIds = new Set(input.catalog.providers.map((p) => p.id));

  // Always-included sources.
  const connectedProviderIds = uniquePreserveOrder(
    input.connectedIntegrations
      .map((i) => i.provider)
      .filter((id) => catalogIds.has(id)),
  );
  const canvasProviderIds = uniquePreserveOrder(
    (input.currentGraph?.nodes ?? [])
      .map((n) => n.provider)
      .filter((id) => catalogIds.has(id)),
  );

  // Explicit + alias matching against the request text.
  const explicitlyMentionedProviderIds: string[] = [];
  const aliasMatchedProviderIds: string[] = [];
  for (const { providerId, aliases } of PROVIDER_ALIASES) {
    if (!catalogIds.has(providerId)) continue;
    // Manifest-id exact match (e.g. "google-sheets" inside the request) or
    // the canonical display name (rare but cheap to check) counts as
    // explicit. Aliases count as alias-matched.
    const idMentioned = containsAlias(request, providerId);
    const aliasMentioned = aliases.some((a) => containsAlias(request, a));
    if (idMentioned) {
      explicitlyMentionedProviderIds.push(providerId);
    } else if (aliasMentioned) {
      aliasMatchedProviderIds.push(providerId);
    }
  }

  // Ambiguous capability tokens add a SET of candidates only when the user
  // didn't already specify one of them by name. "Send a Gmail email" →
  // user said Gmail → no Outlook addition; "Send an email" → both.
  const ambiguousInclusions: string[] = [];
  const emailHit = AMBIGUOUS_EMAIL_TOKENS.some((t) => containsAlias(request, t));
  if (emailHit) {
    const namedAlready =
      explicitlyMentionedProviderIds.includes("gmail") ||
      explicitlyMentionedProviderIds.includes("microsoft-outlook") ||
      aliasMatchedProviderIds.includes("gmail") ||
      aliasMatchedProviderIds.includes("microsoft-outlook");
    if (!namedAlready) {
      if (catalogIds.has("gmail")) ambiguousInclusions.push("gmail");
      if (catalogIds.has("microsoft-outlook")) ambiguousInclusions.push("microsoft-outlook");
    }
  }
  const calendarHit = AMBIGUOUS_CALENDAR_TOKENS.some((t) =>
    containsAlias(request, t),
  );
  if (calendarHit) {
    const namedAlready =
      explicitlyMentionedProviderIds.includes("google-calendar") ||
      explicitlyMentionedProviderIds.includes("microsoft-outlook-calendar") ||
      aliasMatchedProviderIds.includes("google-calendar") ||
      aliasMatchedProviderIds.includes("microsoft-outlook-calendar");
    if (!namedAlready) {
      if (catalogIds.has("google-calendar")) ambiguousInclusions.push("google-calendar");
      if (catalogIds.has("microsoft-outlook-calendar")) {
        ambiguousInclusions.push("microsoft-outlook-calendar");
      }
    }
  }

  // Did the user actually express a provider intent? Connected /
  // canvas alone do NOT count — a user with 10 connected providers
  // typing "hi" should not narrow into those 10 and hide every other
  // option. Native counts only when the user used a logic keyword;
  // see below.
  const nativeLogicHit = NATIVE_LOGIC_TOKENS.some((t) => containsAlias(request, t));
  const hasProviderMention =
    explicitlyMentionedProviderIds.length > 0 ||
    aliasMatchedProviderIds.length > 0 ||
    ambiguousInclusions.length > 0 ||
    nativeLogicHit;

  // Fallback ladder — order from most specific to least specific so the
  // metadata reason reflects the strongest reason, not just the first
  // trip-wire. Broad-generic and complex-canvas-vague-edit fallbacks
  // both imply "no provider mention" but encode WHY narrowing was unsafe
  // in this context (the planner has more to work with than a bare-no-
  // mention case).

  const hasExplicitOrAliasMention =
    explicitlyMentionedProviderIds.length > 0 ||
    aliasMatchedProviderIds.length > 0 ||
    ambiguousInclusions.length > 0;

  // Broad generic phrasing always falls back when the user didn't also
  // name a real provider. "create a workflow using Slack" keeps slack
  // because the alias mention overrides the broad-phrase heuristic.
  if (
    !hasExplicitOrAliasMention &&
    BROAD_GENERIC_PHRASES.some((p) => request.includes(p))
  ) {
    return fullCatalogResult(input, "ambiguous_broad_request");
  }

  // Complex-canvas + vague-edit fallback: a populated canvas plus an
  // extremely short prompt with no explicit provider mention almost
  // always means "edit something on this canvas" — and we can't tell
  // which provider the edit refers to without seeing more. Fall back
  // so the planner has the full option space to interpret the edit.
  const canvasNodeCount = input.currentGraph?.nodes.length ?? 0;
  const requestWordCount = request.split(/\s+/).filter(Boolean).length;
  const vagueEditOnComplexCanvas =
    canvasNodeCount >= 4 &&
    requestWordCount <= 4 &&
    !hasExplicitOrAliasMention;
  if (vagueEditOnComplexCanvas) {
    return fullCatalogResult(input, "complex_canvas_vague_edit");
  }

  // Did the user actually express a provider intent? Connected /
  // canvas alone do NOT count — a user with 10 connected providers
  // typing "hi" should not narrow into those 10 and hide every other
  // option. Native counts only when the user used a logic keyword;
  // see the nativeLogicHit computed above.
  if (!hasProviderMention) {
    return fullCatalogResult(input, "no_provider_mention");
  }

  // Compose the narrowed set. Order of insertion drives the deduped
  // metadata arrays surfaced on the result; the Set itself is unordered.
  const narrowedSet = new Set<string>();
  for (const id of explicitlyMentionedProviderIds) narrowedSet.add(id);
  for (const id of aliasMatchedProviderIds) narrowedSet.add(id);
  for (const id of ambiguousInclusions) narrowedSet.add(id);
  for (const id of connectedProviderIds) narrowedSet.add(id);
  for (const id of canvasProviderIds) narrowedSet.add(id);

  // Native: always include when it exists in the catalog. The provider
  // is small (manual / schedule / delay / branch / filter / route /
  // loop / etc.) and its building blocks are useful in almost any
  // narrowed plan. Tagged `nativeIncluded` so attribution can record
  // the always-on behavior separately from logic-keyword signals.
  const nativeIncluded = catalogIds.has("native");
  if (nativeIncluded) narrowedSet.add("native");

  const omittedProviderCount = input.catalog.providers.reduce(
    (n, p) => (narrowedSet.has(p.id) ? n : n + 1),
    0,
  );

  return {
    mode: "narrowed",
    providerIds: narrowedSet,
    explicitlyMentionedProviderIds,
    aliasMatchedProviderIds,
    ambiguousInclusions,
    connectedProviderIds,
    canvasProviderIds,
    nativeIncluded,
    fallbackReason: null,
    omittedProviderCount,
  };
}

/**
 * Filter `catalog.providers` to the narrowed subset. Pure passthrough
 * when `result.mode === "full-catalog"`. Pulled out so prompt builders
 * (V1 + V2) can share the catalog-shape transformation.
 */
export function filterCatalogToNarrowed(
  catalog: ProviderCatalogView,
  result: NarrowProvidersResult,
): ProviderCatalogView {
  if (result.mode === "full-catalog") return catalog;
  return {
    providers: catalog.providers.filter((p) => result.providerIds.has(p.id)),
  };
}
