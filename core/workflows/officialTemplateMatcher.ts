import type {
  MarketplaceTemplateSummary,
  TemplateCategoryKey,
  TemplateStepSummary,
  TemplateTriggerKind,
} from "@/contracts/workflowTemplate";
import { categoryLabel, humanizeType, providerLabel } from "./templateCardMeta";

/**
 * Deterministic official-template matcher (4.REACT-AGENT-TEMPLATE-MATCH-1).
 *
 * Given a natural-language workflow request, rank the OFFICIAL template catalog by relevance
 * using ONLY deterministic, explainable logic — NO LLM, NO embeddings, NO model/provider/DB
 * calls. The next slice can offer a confident match to React Agent so it prefers a strong
 * official template over generating from scratch.
 *
 * SAFETY: this module is PURE and reads ONLY the already-safe, credential-free
 * {@link MarketplaceTemplateSummary} / {@link TemplateCardMeta} surface — title, description,
 * derived category, trigger kind, required-app provider ids, and the humanized preview chain
 * (provider + action/trigger TYPE catalog ids). It NEVER touches a raw definition, a node
 * `config`, a `{{...}}` variable expression, or any account / user / credential / provider-resource
 * id. The output carries only those safe public-catalog facts plus a score, confidence, and
 * human-readable reasons — nothing that could leak.
 *
 * Lives in `core/workflows/` (pure, client-safe — imports only contract types + the pure label
 * helpers) so both a server service seam and tests reuse it without any I/O.
 */

// ── Public types ─────────────────────────────────────────────────────────────

/** SAFE matcher input — derived from the official `MarketplaceTemplateSummary.card`. No ids/config. */
export interface OfficialTemplateCatalogEntry {
  readonly id: string;
  readonly name: string;
  readonly description: string | null;
  readonly category: TemplateCategoryKey;
  readonly triggerKind: TemplateTriggerKind;
  /** Required-app provider ids (public catalog ids, `native` excluded). */
  readonly providers: readonly string[];
  /** Ordered preview chain (trigger → actions); each carries only provider + type catalog ids. */
  readonly steps: readonly TemplateStepSummary[];
  readonly nodeCount: number;
  readonly stepCount: number;
}

export type MatchConfidence = "high" | "medium" | "low";

export interface OfficialTemplateMatch {
  readonly templateId: string;
  readonly name: string;
  readonly description: string | null;
  /** Stable integer score (deterministic; higher = stronger). */
  readonly score: number;
  readonly confidence: MatchConfidence;
  /** Human-readable, safe match reasons (provider + humanized step labels only). */
  readonly reasons: string[];
  /** SAFE summary for a future confirmation UI — public catalog facts only. */
  readonly summary: {
    readonly providers: string[];
    readonly providerLabels: string[];
    readonly triggerKind: TemplateTriggerKind;
    readonly category: TemplateCategoryKey;
    readonly categoryLabel: string;
    readonly nodeCount: number;
    readonly stepCount: number;
    readonly steps: { kind: "trigger" | "action"; provider: string; type: string; label: string }[];
  };
}

export interface MatchOfficialTemplatesResult {
  /** Best included match's confidence, or `"none"` when nothing clears the threshold. */
  readonly confidence: MatchConfidence | "none";
  readonly matches: OfficialTemplateMatch[];
}

export interface MatchOfficialTemplatesOptions {
  /** Cap on returned matches (default 5). */
  readonly maxMatches?: number;
}

/**
 * REACT-AGENT-TEMPLATE-MATCH-4 — the EXPLICIT, three-way decision the React Agent acts on. Kept
 * separate from raw matcher scoring so the agent never has to interpret a fuzzy confidence band:
 *
 *   - `strong_match` — a template SUBSTANTIALLY matches the request (right trigger, every named app
 *     present, requested outcome produced, purpose overlaps, no unrelated apps/side-effects). An exact
 *     SINGLE-provider template can qualify; a shared provider alone never does. ONLY this outcome may
 *     lead to a template recommendation.
 *   - `weak_match`   — a template scored, but only partially (a shared app or a few keywords). The
 *     agent must NOT recommend/force it; it proceeds to build the workflow manually.
 *   - `no_match`     — nothing scored. The agent proceeds to build manually.
 *
 * A shared provider or a few matching keywords are deliberately NOT enough for `strong_match`.
 */
export const TEMPLATE_MATCH_OUTCOMES = ["strong_match", "weak_match", "no_match"] as const;
export type TemplateMatchOutcome = (typeof TEMPLATE_MATCH_OUTCOMES)[number];

/**
 * Anti-loop cap. The agent surfaces AT MOST this many template recommendations per decision — a
 * SINGLE strong match, never a menu of partial alternatives to reject. This is the guardrail that
 * prevents template lookup from becoming a loop that stalls workflow creation.
 */
export const MAX_TEMPLATE_RECOMMENDATIONS = 1;

export interface TemplateRecommendationResult {
  readonly outcome: TemplateMatchOutcome;
  /** Present ONLY for `strong_match` — the single recommended template. `null` otherwise. */
  readonly recommendation: OfficialTemplateMatch | null;
  /**
   * Safe, human-readable reasons the top candidate was NOT strong (empty for `strong_match` /
   * `no_match`). Diagnostic only — same no-leak surface as `reasons` (provider/step labels).
   */
  readonly rejectedReasons: readonly string[];
}

// ── Provider term tables ─────────────────────────────────────────────────────

/** EXPLICIT provider mentions — a named app. Missing one of these penalizes a template (no silent
 *  substitution). Multi-word phrases are checked first so "google sheets" beats a bare "sheets". */
const EXPLICIT_PROVIDER_PHRASES: ReadonlyArray<readonly [string, string]> = [
  ["google sheets", "google-sheets"],
  ["google sheet", "google-sheets"],
  ["google docs", "google-docs"],
  ["google doc", "google-docs"],
  ["google drive", "google-drive"],
  ["google calendar", "google-calendar"],
  ["google analytics", "google-analytics"],
  ["microsoft teams", "microsoft-teams"],
  ["ms teams", "microsoft-teams"],
  ["outlook calendar", "microsoft-outlook-calendar"],
];

/** EXPLICIT single-word provider terms (whole-word match against the token set). */
const EXPLICIT_PROVIDER_TERMS: Readonly<Record<string, string>> = {
  slack: "slack",
  hubspot: "hubspot",
  teams: "microsoft-teams",
  gmail: "gmail",
  outlook: "microsoft-outlook",
  shopify: "shopify",
  stripe: "stripe",
  trello: "trello",
  monday: "monday",
  notion: "notion",
  github: "github",
  mailchimp: "mailchimp",
  airtable: "airtable",
  sheets: "google-sheets",
  excel: "microsoft-excel",
  discord: "discord",
  dropbox: "dropbox",
  onenote: "microsoft-onenote",
  onedrive: "microsoft-onedrive",
};

/** AMBIGUOUS aliases — generic concept → candidate providers. These only ADD weak positive signal
 *  (never penalize), because the user did not name a specific app. Keyed by SINGULARIZED token. */
const ALIAS_PROVIDER_TERMS: Readonly<Record<string, readonly string[]>> = {
  crm: ["hubspot"],
  payment: ["stripe"],
  ecommerce: ["shopify"],
  store: ["shopify"],
  order: ["shopify"],
  email: ["gmail", "microsoft-outlook"],
  spreadsheet: ["google-sheets", "microsoft-excel"],
  chat: ["slack", "microsoft-teams"],
  document: ["google-docs", "notion", "microsoft-onenote"],
  doc: ["google-docs", "notion"],
  project: ["monday", "trello"],
  task: ["monday", "trello"],
  board: ["trello", "monday"],
  calendar: ["google-calendar", "microsoft-outlook-calendar"],
  meeting: ["google-calendar"],
};

/** Concept → category hint (a weak bonus when the template's derived category agrees). */
const CATEGORY_HINT_TERMS: Readonly<Record<string, TemplateCategoryKey>> = {
  crm: "sales-crm",
  lead: "sales-crm",
  sales: "sales-crm",
  deal: "sales-crm",
  order: "ecommerce",
  store: "ecommerce",
  ecommerce: "ecommerce",
  payment: "ecommerce",
  incident: "dev-engineering",
  issue: "dev-engineering",
  report: "reporting",
  onboarding: "team-ops",
};

/**
 * Generic / structural words that must NEVER drive a match on their own (the task's explicit list:
 * notify, update, new, create, send — plus articles, fillers, and ubiquitous structural nouns like
 * "message"/"channel"/"item" that appear in almost every template). Kept singularized.
 */
const STOPWORDS: ReadonlySet<string> = new Set([
  "a", "an", "the", "to", "and", "or", "of", "for", "in", "on", "with", "when", "then", "my", "me",
  "i", "it", "them", "they", "their", "this", "that", "into", "from", "as", "at", "is", "are", "be",
  "will", "would", "want", "need", "set", "up", "setup", "make", "made", "get", "got", "do", "doe",
  "doing", "use", "using", "via", "automate", "automation", "automatic", "automatically",
  "workflow", "business", "easier", "easy", "help", "please", "can", "you", "your", "come", "comes",
  "coming", "fire", "fired", "received", "receive", "arrive", "arrives", "new", "create", "creates",
  "creating", "send", "sends", "sending", "sent", "notify", "notifies", "notification", "alert",
  "alerts", "update", "updates", "updating", "add", "adds", "added", "log", "logs", "logging",
  "open", "opens", "message", "messages", "channel", "channels", "item", "items", "record",
  "records", "row", "rows", "step", "steps", "thing", "things", "stuff", "some", "any", "all",
  "each", "every", "automated", "build", "builds", "let", "lets", "also", "so",
]);

// ── Normalization ────────────────────────────────────────────────────────────

/** Lowercase, strip punctuation to spaces, collapse whitespace. */
function normalize(text: string): string {
  return text.toLowerCase().replace(/[^a-z0-9]+/g, " ").replace(/\s+/g, " ").trim();
}

/** Simple, conservative singularizer: `ies`→`y`, trailing `s` (not `ss`). */
function singularize(token: string): string {
  if (token.length > 4 && token.endsWith("ies")) return `${token.slice(0, -3)}y`;
  if (token.length > 3 && token.endsWith("s") && !token.endsWith("ss")) return token.slice(0, -1);
  return token;
}

function tokenize(normalized: string): string[] {
  return normalized.length === 0 ? [] : normalized.split(" ");
}

/** Non-generic, singularized content tokens of a string (for title/description/label overlap). */
function contentTokens(text: string): Set<string> {
  const out = new Set<string>();
  for (const raw of tokenize(normalize(text))) {
    const t = singularize(raw);
    if (t.length < 3) continue;
    if (STOPWORDS.has(t)) continue;
    out.add(t);
  }
  return out;
}

// ── Request analysis ─────────────────────────────────────────────────────────

interface RequestAnalysis {
  readonly explicitProviders: Set<string>;
  readonly aliasProviders: Set<string>;
  readonly categoryHints: Set<TemplateCategoryKey>;
  readonly content: Set<string>;
}

function analyzeRequest(requestText: string): RequestAnalysis {
  const normalized = normalize(requestText);
  const padded = ` ${normalized} `;
  const tokens = tokenize(normalized);
  const singularTokens = new Set(tokens.map(singularize));

  const explicitProviders = new Set<string>();
  for (const [phrase, provider] of EXPLICIT_PROVIDER_PHRASES) {
    if (padded.includes(` ${phrase} `)) explicitProviders.add(provider);
  }
  for (const tok of tokens) {
    const provider = EXPLICIT_PROVIDER_TERMS[tok];
    if (provider) explicitProviders.add(provider);
  }

  const aliasProviders = new Set<string>();
  const categoryHints = new Set<TemplateCategoryKey>();
  for (const tok of singularTokens) {
    for (const provider of ALIAS_PROVIDER_TERMS[tok] ?? []) {
      // An explicitly-named provider is never *also* counted as a weak alias.
      if (!explicitProviders.has(provider)) aliasProviders.add(provider);
    }
    const cat = CATEGORY_HINT_TERMS[tok];
    if (cat) categoryHints.add(cat);
  }

  return { explicitProviders, aliasProviders, categoryHints, content: contentTokens(requestText) };
}

// ── Scoring weights (integers → deterministic, stable score) ─────────────────

const W_EXPLICIT_PRESENT = 4;
const W_EXPLICIT_MISSING = -3;
const W_ALIAS_PRESENT = 2;
const W_ALIAS_CAP = 4;
const W_TRIGGER_SOURCE = 2;
const W_DESTINATION = 1;
const W_SOURCE_AND_DEST = 2;
const W_CONTENT_EACH = 1;
const W_CONTENT_CAP = 6;
const W_CATEGORY = 1;

const MIN_SCORE = 3;
const HIGH_SCORE = 10;
const HIGH_SCORE_WITH_TWO_APPS = 8;
const MEDIUM_SCORE = 5;
const DEFAULT_MAX_MATCHES = 5;

/** A `strong_match` requires at least this many DISTINCTIVE, non-provider content tokens shared
 *  between the request and the template (name / description / step types) — so a shared provider or a
 *  few generic keywords is never, on its own, a strong match. */
const MIN_STRONG_INTENT_OVERLAP = 1;

/** Trigger/action TYPE tokens that describe the delivery MECHANISM rather than the user-facing event
 *  or outcome (users say "when an order is created", not "webhook received"). Excluded from the
 *  type-level specificity checks so a legitimate match isn't rejected for mechanism vocabulary. */
const MECHANISM_TOKENS: ReadonlySet<string> = new Set(["webhook"]);

interface ScoredEntry {
  readonly entry: OfficialTemplateCatalogEntry;
  readonly score: number;
  readonly explicitMatches: number;
  readonly aliasMatches: number;
  readonly reasons: string[];
  readonly included: boolean;
}

function templateTokenSet(entry: OfficialTemplateCatalogEntry): Set<string> {
  const parts: string[] = [entry.name, entry.description ?? "", categoryLabel(entry.category)];
  for (const p of entry.providers) parts.push(providerLabel(p));
  for (const s of entry.steps) parts.push(humanizeType(s.type));
  return contentTokens(parts.join(" "));
}

function confidenceFor(score: number, explicitMatches: number): MatchConfidence {
  if (score >= HIGH_SCORE || (score >= HIGH_SCORE_WITH_TWO_APPS && explicitMatches >= 2)) return "high";
  if (score >= MEDIUM_SCORE) return "medium";
  return "low";
}

function scoreEntry(entry: OfficialTemplateCatalogEntry, req: RequestAnalysis): ScoredEntry {
  const providerSet = new Set(entry.providers);
  const requested = new Set<string>([...req.explicitProviders, ...req.aliasProviders]);
  const reasons: string[] = [];

  let score = 0;

  // 1. Explicit providers: reward presence, penalize a named-but-absent app (no substitution).
  let explicitMatches = 0;
  const matchedExplicitLabels: string[] = [];
  for (const p of req.explicitProviders) {
    if (providerSet.has(p)) {
      score += W_EXPLICIT_PRESENT;
      explicitMatches += 1;
      matchedExplicitLabels.push(providerLabel(p));
    } else {
      score += W_EXPLICIT_MISSING;
    }
  }

  // 2. Alias providers: weak positive only, capped.
  let aliasMatches = 0;
  let aliasScore = 0;
  for (const p of req.aliasProviders) {
    if (providerSet.has(p)) {
      aliasMatches += 1;
      aliasScore = Math.min(W_ALIAS_CAP, aliasScore + W_ALIAS_PRESENT);
    }
  }
  score += aliasScore;

  // 3. Trigger-source + destination intent (prefer satisfying BOTH ends).
  const triggerStep = entry.steps.find((s) => s.kind === "trigger");
  const triggerSatisfied =
    triggerStep !== undefined && triggerStep.provider !== "native" && requested.has(triggerStep.provider);
  const destinationSatisfied = entry.steps.some(
    (s) => s.kind === "action" && requested.has(s.provider),
  );
  if (triggerSatisfied) {
    score += W_TRIGGER_SOURCE;
    reasons.push(
      `Matches the ${providerLabel(triggerStep!.provider)} ${humanizeType(triggerStep!.type).toLowerCase()} trigger`,
    );
  }
  if (destinationSatisfied) score += W_DESTINATION;
  if (triggerSatisfied && destinationSatisfied) score += W_SOURCE_AND_DEST;

  // 4. Content-token overlap (business-outcome language), excluding generic words; capped.
  const tplTokens = templateTokenSet(entry);
  let contentMatches = 0;
  for (const t of req.content) {
    if (tplTokens.has(t)) contentMatches += 1;
  }
  score += Math.min(W_CONTENT_CAP, contentMatches * W_CONTENT_EACH);

  // 5. Category hint agreement (small).
  if (req.categoryHints.has(entry.category)) score += W_CATEGORY;

  // 6. Action-step reasons (provider requested OR step-type tokens overlap the request).
  const stepReasons: string[] = [];
  for (const s of entry.steps) {
    if (s.kind !== "action") continue;
    const typeTokens = contentTokens(humanizeType(s.type));
    const typeOverlap = [...typeTokens].some((t) => req.content.has(t));
    if (requested.has(s.provider) || typeOverlap) {
      stepReasons.push(
        `Includes the ${providerLabel(s.provider)} ${humanizeType(s.type).toLowerCase()} step`,
      );
    }
  }
  reasons.push(...stepReasons.slice(0, 3));
  if (matchedExplicitLabels.length > 0) {
    reasons.push(`Uses ${dedupe(matchedExplicitLabels).join(", ")}`);
  }

  // Guardrail: never match on generic words / category alone. Require a provider overlap OR at
  // least two non-generic content tokens, AND a minimum score.
  const hasProviderSignal = explicitMatches > 0 || aliasMatches > 0;
  const included = score >= MIN_SCORE && (hasProviderSignal || contentMatches >= 2);

  return {
    entry,
    score,
    explicitMatches,
    aliasMatches,
    reasons: dedupe(reasons).slice(0, 4),
    included,
  };
}

function dedupe(values: readonly string[]): string[] {
  return [...new Set(values)];
}

// ── Stable ranking ───────────────────────────────────────────────────────────

function compareScored(a: ScoredEntry, b: ScoredEntry): number {
  if (b.score !== a.score) return b.score - a.score;
  if (b.explicitMatches !== a.explicitMatches) return b.explicitMatches - a.explicitMatches;
  if (b.aliasMatches !== a.aliasMatches) return b.aliasMatches - a.aliasMatches;
  const byName = a.entry.name.localeCompare(b.entry.name);
  if (byName !== 0) return byName;
  return a.entry.id.localeCompare(b.entry.id); // fully stable, input-order-independent
}

function toMatch(s: ScoredEntry): OfficialTemplateMatch {
  const e = s.entry;
  return {
    templateId: e.id,
    name: e.name,
    description: e.description,
    score: s.score,
    confidence: confidenceFor(s.score, s.explicitMatches),
    reasons: s.reasons,
    summary: {
      providers: [...e.providers],
      providerLabels: e.providers.map(providerLabel),
      triggerKind: e.triggerKind,
      category: e.category,
      categoryLabel: categoryLabel(e.category),
      nodeCount: e.nodeCount,
      stepCount: e.stepCount,
      steps: e.steps.map((st) => ({
        kind: st.kind,
        provider: st.provider,
        type: st.type,
        label: `${providerLabel(st.provider)}: ${humanizeType(st.type)}`,
      })),
    },
  };
}

// ── Public entry points ──────────────────────────────────────────────────────

/**
 * Rank the official catalog against a request. Returns at most `maxMatches` confident matches,
 * ranked by a stable deterministic score. Returns `{ confidence: "none", matches: [] }` for vague
 * requests (no provider signal + <2 content tokens) or when nothing clears the conservative
 * threshold.
 */
export function matchOfficialTemplates(
  requestText: string,
  catalog: readonly OfficialTemplateCatalogEntry[],
  options?: MatchOfficialTemplatesOptions,
): MatchOfficialTemplatesResult {
  const max = options?.maxMatches ?? DEFAULT_MAX_MATCHES;
  if (!requestText || requestText.trim().length === 0) return { confidence: "none", matches: [] };

  const req = analyzeRequest(requestText);
  const scored = catalog
    .map((entry) => scoreEntry(entry, req))
    .filter((s) => s.included)
    .sort(compareScored)
    .slice(0, max);

  const matches = scored.map(toMatch);
  return {
    confidence: matches.length > 0 ? matches[0]!.confidence : "none",
    matches,
  };
}

// ── Strong-match classification (REACT-AGENT-TEMPLATE-MATCH-4) ────────────────

/** DISTINCTIVE (non-provider, non-mechanism) content tokens of a step's humanized type. Empty for a
 *  GENERIC action/trigger (e.g. "send channel message" → all structural stopwords) — which we treat
 *  as un-scrutinizable at the type level (the provider match carries it), not as a side-effect. */
function stepTypeTokens(
  step: TemplateStepSummary,
  providerTokens: ReadonlySet<string>,
): Set<string> {
  const out = new Set<string>();
  for (const t of contentTokens(humanizeType(step.type))) {
    if (providerTokens.has(t) || MECHANISM_TOKENS.has(t)) continue;
    out.add(t);
  }
  return out;
}

/**
 * Structural gate that promotes the top-ranked candidate to a `strong_match`. Deterministic and pure.
 * A template is `strong_match` only when it SUBSTANTIALLY matches — every named app present, right
 * trigger, requested outcome produced, purpose overlaps, and no unrequested provider/side-effect. A
 * shared provider or keyword similarity alone is never enough.
 *
 * The number of EXPLICITLY-named apps is NO LONGER a hard floor — an exact SINGLE-provider template
 * (e.g. Slack reaction → Slack channel message) can be strong. Instead the specificity bar adapts:
 *
 *   Common (every request):
 *     C1  ≥1 explicitly-named app (a keyword / category alone is never strong).
 *     C2  every named app is present (the template doesn't drop a requested app).
 *     C3  the template introduces NO unrequested provider (no unrelated app / side-effect).
 *     C4  the trigger is aligned to the requested start event (native trigger, or requested provider).
 *     C5  the requested outcome is produced by a requested app (some action uses a requested app).
 *     C6  the purpose substantially overlaps — ≥`MIN_STRONG_INTENT_OVERLAP` distinctive, NON-provider
 *         tokens shared (name/description/step types), so a shared provider alone can't clear it.
 *
 *   Single-provider requests (exactly one named app → provider-exactness gives no discrimination, so
 *   scrutinize the step TYPES):
 *     S1  the app trigger's TYPE reflects the described start event (rejects a mismatched trigger).
 *     S2  no action introduces a DISTINCTIVE operation the request didn't ask for (rejects a
 *         mismatched primary action AND unrelated recipient-visible/destructive side-effects).
 *     S3  at least one action satisfies the described outcome.
 *
 *   Multi-provider requests (≥2 named apps) are governed by provider-exactness (C2/C3) + C4–C6: every
 *   named provider must be present and no extra provider may appear (per-action type scrutiny would
 *   false-reject mechanism-named actions like "append row" for "log it to a sheet"). A same-provider
 *   extra step is not deterministically detectable here and is out of scope for this gate.
 *
 * Returns the boolean plus SAFE reasons any condition failed (public catalog labels only — never a
 * config value, `{{...}}`, or a resource id).
 */
function evaluateStrongMatch(
  scored: ScoredEntry,
  req: RequestAnalysis,
): { readonly strong: boolean; readonly reasons: string[] } {
  const entry = scored.entry;
  const explicit = req.explicitProviders;
  const requested = new Set<string>([...explicit, ...req.aliasProviders]);
  const templateProviders = new Set(entry.providers);
  const reasons: string[] = [];

  // Provider-name tokens — excluded from the "purpose" overlap so a SHARED PROVIDER is never, by
  // itself, enough to look like an intent match.
  const providerTokens = new Set<string>();
  for (const p of [...requested, ...entry.providers]) {
    for (const t of contentTokens(providerLabel(p))) providerTokens.add(t);
  }

  // C1 — a specific app must be named (keyword / category alone is never strong).
  if (explicit.size === 0) {
    reasons.push("No specific app was named (a keyword or category alone isn't a strong match)");
  }

  // C2 — every named app is present.
  const missingExplicit = [...explicit].filter((p) => !templateProviders.has(p));
  if (missingExplicit.length > 0) {
    reasons.push(`Doesn't include ${dedupe(missingExplicit.map(providerLabel)).join(", ")}`);
  }

  // C3 — no unrequested provider.
  const extraProviders = entry.providers.filter((p) => !requested.has(p));
  if (extraProviders.length > 0) {
    reasons.push(`Adds apps you didn't ask for (${dedupe(extraProviders.map(providerLabel)).join(", ")})`);
  }

  // C4 — trigger aligned to the requested start event.
  const triggerStep = entry.steps.find((s) => s.kind === "trigger");
  const triggerNative = triggerStep === undefined || triggerStep.provider === "native";
  const triggerAligned = triggerNative || requested.has(triggerStep!.provider);
  if (!triggerAligned) {
    reasons.push(`Starts from ${providerLabel(triggerStep!.provider)}, not the event you described`);
  }

  // C5 — the requested outcome is produced by a requested app.
  const actionSteps = entry.steps.filter((s) => s.kind === "action");
  if (actionSteps.length > 0 && !actionSteps.some((s) => requested.has(s.provider))) {
    reasons.push("Its actions don't use the app you asked for");
  }

  // C6 — purpose overlap beyond the provider (distinctive, non-provider tokens shared).
  const intentTokens = new Set<string>();
  const parts = [entry.name, entry.description ?? "", categoryLabel(entry.category)];
  for (const s of entry.steps) parts.push(humanizeType(s.type));
  for (const t of contentTokens(parts.join(" "))) {
    if (!providerTokens.has(t) && !MECHANISM_TOKENS.has(t)) intentTokens.add(t);
  }
  let intentOverlap = 0;
  for (const t of req.content) if (intentTokens.has(t)) intentOverlap += 1;
  if (intentOverlap < MIN_STRONG_INTENT_OVERLAP) {
    reasons.push("The workflow's purpose doesn't clearly match your request");
  }

  // Single-provider requests: scrutinize step TYPES (provider exactness gives no discrimination when
  // every step is the same app).
  if (explicit.size === 1) {
    // S1 — the app trigger's TYPE must reflect the described start event.
    if (!triggerNative && triggerAligned) {
      const tt = stepTypeTokens(triggerStep!, providerTokens);
      const triggerTypeAligned =
        tt.size === 0 ? intentOverlap >= MIN_STRONG_INTENT_OVERLAP : [...tt].some((t) => req.content.has(t));
      if (!triggerTypeAligned) {
        reasons.push(`Its "${humanizeType(triggerStep!.type).toLowerCase()}" start event doesn't match what you described`);
      }
    }
    // S2 — no action introduces a DISTINCTIVE operation the request didn't ask for.
    const unrelated = actionSteps.filter((s) => {
      const at = stepTypeTokens(s, providerTokens);
      return at.size > 0 && ![...at].some((t) => req.content.has(t));
    });
    if (unrelated.length > 0) {
      reasons.push(
        `Includes steps you didn't ask for (${dedupe(unrelated.map((s) => humanizeType(s.type).toLowerCase())).join(", ")})`,
      );
    }
    // S3 — at least one action satisfies the described outcome.
    const someActionSupported = actionSteps.some((s) => {
      const at = stepTypeTokens(s, providerTokens);
      return at.size === 0 ? requested.has(s.provider) : [...at].some((t) => req.content.has(t));
    });
    if (actionSteps.length > 0 && !someActionSupported) {
      reasons.push("None of its actions match the outcome you described");
    }
  }

  return { strong: reasons.length === 0, reasons: dedupe(reasons) };
}

/**
 * Decide whether an official template should be RECOMMENDED for a request, or the agent should build
 * manually (REACT-AGENT-TEMPLATE-MATCH-4). Runs the same deterministic ranking as
 * {@link matchOfficialTemplates}, then applies the structural strong-match gate to the top candidate:
 *
 *   - top candidate passes the gate → `strong_match` with a SINGLE recommendation
 *     (capped at {@link MAX_TEMPLATE_RECOMMENDATIONS} — never a menu of alternatives);
 *   - a candidate scored but failed the gate → `weak_match` (no recommendation; build manually);
 *   - nothing scored → `no_match` (build manually).
 *
 * Pure and side-effect-free; carries only the safe public-catalog match surface. This is the single
 * entry point the agent/route uses to keep template matching SEPARATE from workflow construction.
 */
export function selectOfficialTemplateRecommendation(
  requestText: string,
  catalog: readonly OfficialTemplateCatalogEntry[],
): TemplateRecommendationResult {
  if (!requestText || requestText.trim().length === 0) {
    return { outcome: "no_match", recommendation: null, rejectedReasons: [] };
  }

  const req = analyzeRequest(requestText);
  const scored = catalog
    .map((entry) => scoreEntry(entry, req))
    .filter((s) => s.included)
    .sort(compareScored);

  if (scored.length === 0) {
    return { outcome: "no_match", recommendation: null, rejectedReasons: [] };
  }

  const top = scored[0]!;
  const { strong, reasons } = evaluateStrongMatch(top, req);
  if (strong) {
    return { outcome: "strong_match", recommendation: toMatch(top), rejectedReasons: [] };
  }
  return { outcome: "weak_match", recommendation: null, rejectedReasons: reasons };
}

/**
 * Project the OFFICIAL subset of a marketplace summary list into safe matcher catalog entries.
 * Defense-in-depth filter (the repository already queries `source='official'`): keeps only
 * `isOfficial === true` + `visibility === 'public'` rows that carry derived `card` metadata, so
 * NO user-created / private / unlisted template can reach the matcher.
 */
export function selectOfficialCatalogEntries(
  summaries: readonly MarketplaceTemplateSummary[],
): OfficialTemplateCatalogEntry[] {
  const out: OfficialTemplateCatalogEntry[] = [];
  for (const s of summaries) {
    if (!s.isOfficial || s.source !== "official") continue;
    if (s.visibility !== "public") continue;
    if (!s.card) continue;
    out.push({
      id: s.id,
      name: s.name,
      description: s.description,
      category: s.card.category,
      triggerKind: s.card.triggerKind,
      providers: s.card.providers,
      steps: s.card.steps,
      nodeCount: s.card.nodeCount,
      stepCount: s.card.stepCount,
    });
  }
  return out;
}
