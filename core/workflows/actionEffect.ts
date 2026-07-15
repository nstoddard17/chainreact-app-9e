/**
 * Pure, deterministic SEMANTIC ACTION-EFFECT layer (REACT-AGENT-TEMPLATE-MATCH-4 multi-provider
 * hardening).
 *
 * The official-template classifier must decide whether every MEANINGFUL action in a multi-provider
 * template contributes to a requested outcome — without brittle literal equality between user wording
 * and internal action-type names ("log it in Sheets" must match `append_row`; "notify Slack" must
 * match `send_channel_message`). This module normalizes both sides to a small, stable EFFECT concept
 * so they can be compared semantically:
 *
 *   - Each template action → an {@link ActionEffect} (effect category + destructive / recipient-visible
 *     flags + distinctive business-object nouns). The AUTHORITATIVE side-effect facts come from
 *     `ActionMeta` (`category` / `isDestructive` / `riskLevel`) when the caller injects them (the
 *     service layer looks them up via `getActionMeta`); otherwise a conservative action-type-verb
 *     fallback is used. This module NEVER imports the registry (it stays pure + client-safe); it only
 *     consumes the already-safe facts the caller passes in.
 *   - Each request → the set of {@link EffectCategory} concepts the user asked for + the raw outcome
 *     tokens, via a natural-language keyword map (there is no existing NL→concept source of truth, so
 *     this map is intentionally new and lives here, the single home for it).
 *
 * CONSERVATIVE BY DESIGN: `actionContributesToRequest` only returns true when it can POSITIVELY show
 * the action's concept was requested (and, for a distinctive business object, that the object was
 * named). Anything it cannot prove contributes is left for the caller to treat as a `weak_match` — a
 * false negative (build manually) is always preferable to recommending a template with an unrequested
 * side effect.
 */

// ── Effect vocabulary ─────────────────────────────────────────────────────────

export const EFFECT_CATEGORIES = [
  "create",
  "update",
  "delete",
  "send",
  "notify",
  "append",
  "upload",
  "archive",
  "read",
  "other",
] as const;
export type EffectCategory = (typeof EFFECT_CATEGORIES)[number];

/** The SAFE subset of `ActionMeta` the classifier consumes — injected by the service (never a config
 *  value, token, or resource id). All optional; absent → the action-type-verb fallback decides. */
export interface ActionEffectFacts {
  /** `ActionMeta.category` (e.g. "messaging" / "email" / "data" / "commerce"). */
  readonly category?: string;
  readonly isDestructive?: boolean;
  readonly requiresConfirmation?: boolean;
  readonly riskLevel?: "low" | "medium" | "high";
}

/** A normalized, comparable view of one template action's effect. */
export interface ActionEffect {
  readonly provider: string;
  readonly operation: string;
  readonly effectCategory: EffectCategory;
  /** Externally visible to a recipient / third party (message, email, public share). */
  readonly recipientVisible: boolean;
  /** Irreversible or hard-to-reverse provider-side effect (delete/archive/cancel/refund). */
  readonly destructive: boolean;
  /** Distinctive business-object nouns of the action (e.g. `create_task` → ["task"]); structural
   *  container nouns (row/message/channel/file/…) and the effect verb are excluded. */
  readonly objectTokens: readonly string[];
}

/** Caller-injected `(provider, type) → facts` lookup (service-backed by `getActionMeta`). */
export type ActionEffectFactsLookup = (
  provider: string,
  type: string,
) => ActionEffectFacts | undefined;

// ── Keyword tables (verb / concept synonyms) ──────────────────────────────────

/** Verb / keyword → effect concept. Shared by action-type classification AND request analysis, so a
 *  user verb ("notify", "log", "save") maps to the same concept as the action verb it should match. */
const EFFECT_KEYWORDS: Readonly<Record<string, EffectCategory>> = {
  // create
  create: "create", open: "create", draft: "create", generate: "create", make: "create",
  new: "create", start: "create", build: "create", compose: "create", register: "create",
  // update
  update: "update", edit: "update", modify: "update", set: "update", rename: "update",
  move: "update", change: "update", patch: "update", assign: "update", label: "update",
  mark: "update",
  // delete (irreversible-ish)
  delete: "delete", remove: "delete", cancel: "delete", revoke: "delete", purge: "delete",
  trash: "delete", unsubscribe: "delete",
  // archive
  archive: "archive", close: "archive",
  // send / notify (recipient-visible)
  send: "send", post: "send", notify: "send", alert: "send", dm: "send", message: "send",
  reply: "send", announce: "send", ping: "send", publish: "send", share: "send",
  broadcast: "send", mention: "send", respond: "send", tell: "send", email: "send", mail: "send",
  // update (formatting is a kind of modify/update)
  format: "update", reformat: "update",
  // append
  append: "append", add: "append", log: "append", track: "append", record: "append",
  tally: "append", insert: "append",
  // upload
  upload: "upload", save: "upload", store: "upload", backup: "upload", attach: "upload",
  // read (benign)
  get: "read", list: "read", find: "read", search: "read", read: "read", fetch: "read",
  lookup: "read", retrieve: "read", watch: "read", poll: "read",
};

/** Verbs whose effect is externally visible to a recipient / third party. */
const RECIPIENT_VISIBLE_VERBS: ReadonlySet<string> = new Set([
  "send", "post", "notify", "alert", "dm", "message", "reply", "announce", "ping",
  "publish", "share", "broadcast", "mention", "email", "mail", "comment",
]);

/** Verbs whose effect is irreversible / hard to reverse. */
const DESTRUCTIVE_VERBS: ReadonlySet<string> = new Set([
  "delete", "remove", "archive", "cancel", "revoke", "purge", "trash",
]);

/** `ActionMeta.category` values that imply a recipient-visible send. */
const RECIPIENT_VISIBLE_CATEGORIES: ReadonlySet<string> = new Set(["messaging", "email"]);

/** Structural / container nouns that are NOT a distinctive business object — an action naming only
 *  these needs no explicit mention in the request (e.g. "append row" for "log it to a sheet"). */
const STRUCTURAL_NOUNS: ReadonlySet<string> = new Set([
  "row", "rows", "message", "messages", "channel", "channels", "item", "items", "entry",
  "entries", "link", "links", "file", "files", "record", "records", "reply", "draft",
  "thread", "value", "values", "data", "content", "field", "fields",
]);

// ── Tokenization (self-contained; keeps this module free of matcher coupling) ──

function tokens(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .split(/\s+/)
    .filter((t) => t.length > 0);
}

function singularize(token: string): string {
  if (token.length > 4 && token.endsWith("ies")) return `${token.slice(0, -3)}y`;
  if (token.length > 3 && token.endsWith("s") && !token.endsWith("ss")) return token.slice(0, -1);
  return token;
}

// ── Action-effect classification ──────────────────────────────────────────────

/**
 * Classify one template action into a normalized {@link ActionEffect}. Deterministic + pure. When
 * `facts` (from `ActionMeta`) are provided they are AUTHORITATIVE for destructive / recipient-visible;
 * otherwise the action-type verb decides.
 */
export function classifyActionEffect(
  provider: string,
  type: string,
  facts?: ActionEffectFacts,
): ActionEffect {
  const parts = tokens(type);
  const verb = parts[0] ?? "";
  const verbConcept = EFFECT_KEYWORDS[verb];

  const destructive = facts?.isDestructive ?? DESTRUCTIVE_VERBS.has(verb);
  const recipientVisible =
    (facts?.category !== undefined && RECIPIENT_VISIBLE_CATEGORIES.has(facts.category)) ||
    RECIPIENT_VISIBLE_VERBS.has(verb);

  let effectCategory: EffectCategory;
  if (destructive) {
    effectCategory = verb === "archive" ? "archive" : "delete";
  } else if (recipientVisible) {
    effectCategory = "send";
  } else {
    effectCategory = verbConcept ?? "other";
  }

  // Distinctive business-object nouns: the type's non-verb tokens minus structural containers.
  const objectTokens: string[] = [];
  for (const raw of parts.slice(1)) {
    const t = singularize(raw);
    if (t.length < 3) continue;
    if (STRUCTURAL_NOUNS.has(raw) || STRUCTURAL_NOUNS.has(t)) continue;
    if (EFFECT_KEYWORDS[t]) continue; // a second verb-ish token, not an object
    objectTokens.push(t);
  }

  return { provider, operation: type, effectCategory, recipientVisible, destructive, objectTokens };
}

/** A meaningful action changes external/provider state or is recipient-visible — it MUST be justified
 *  by a requested outcome. Pure reads and native control-flow steps are benign. */
export function isMeaningfulAction(effect: ActionEffect): boolean {
  if (effect.provider === "native") return false;
  if (effect.effectCategory === "read") return false;
  return true;
}

// ── Trigger / action separation ───────────────────────────────────────────────

/** Leading connectives that introduce a TRIGGER / start-event clause. */
const TRIGGER_CONNECTIVES: readonly string[] = [
  "when", "whenever", "after", "once", "if", "on", "anytime",
  "each time", "every time", "any time", "as soon as",
];

/** Concepts that represent a REQUESTED DOWNSTREAM ACTION (not a benign read / unknown). */
const ACTION_CONCEPTS: ReadonlySet<EffectCategory> = new Set([
  "create", "update", "delete", "send", "append", "upload", "archive",
]);

/**
 * Strip a LEADING trigger/start-event clause so its verbs ("labeled", "added", "deleted", "uploaded",
 * "created") are NOT mistaken for requested downstream action outcomes. The trigger clause runs from a
 * leading connective ("When …", "After …") to the first clause boundary (a comma or " then "). A
 * request with no leading trigger clause is returned unchanged; a pure trigger with no downstream
 * clause returns "".
 */
export function requestedActionText(requestText: string): string {
  const trimmed = requestText.trim();
  const lower = trimmed.toLowerCase();
  const startsWithTrigger = TRIGGER_CONNECTIVES.some((c) => lower === c || lower.startsWith(`${c} `));
  if (!startsWithTrigger) return trimmed;

  const commaIdx = trimmed.indexOf(",");
  const thenMatch = /\bthen\b/i.exec(trimmed);
  const boundaries = [commaIdx, thenMatch ? thenMatch.index : -1].filter((i) => i >= 0);
  if (boundaries.length === 0) return ""; // a pure trigger phrase — no downstream action
  const cut = Math.min(...boundaries);
  return trimmed
    .slice(cut)
    .replace(/^\s*,\s*/, "")
    .replace(/^\s*then\s+/i, "")
    .trim();
}

// ── Request analysis ──────────────────────────────────────────────────────────

export interface RequestedOutcomes {
  /** Effect concepts the user asked for (create/append/send/upload/delete/…). */
  readonly concepts: ReadonlySet<EffectCategory>;
  /** Singularized raw request tokens — used to confirm a distinctive business object was named. */
  readonly tokens: ReadonlySet<string>;
}

/**
 * Derive the DOWNSTREAM outcome concepts + object tokens the request asks for. Operates on the
 * trigger-stripped {@link requestedActionText} (so trigger vocabulary never leaks into requested
 * concepts) and scans raw words because the concept signal often lives in generic verbs ("log" →
 * append, "notify" → send, "save" → upload).
 */
export function analyzeRequestedOutcomes(requestText: string): RequestedOutcomes {
  const concepts = new Set<EffectCategory>();
  const toks = new Set<string>();
  for (const raw of tokens(requestedActionText(requestText))) {
    const s = singularize(raw);
    toks.add(s);
    const concept = EFFECT_KEYWORDS[raw] ?? EFFECT_KEYWORDS[s];
    if (concept) concepts.add(concept);
  }
  return { concepts, tokens: toks };
}

/**
 * One CONFIDENTLY-identified requested downstream action outcome. Multiple outcomes may share a
 * provider/concept (e.g. "create a contact AND update its lifecycle stage" → two outcomes). Only
 * outcomes with a recognized ACTION verb are emitted — vague/uncertain wording produces nothing, so
 * no spurious requirement is created (a false negative is preferred over a false strong match).
 */
export interface RequestedOutcome {
  readonly concept: EffectCategory;
  readonly confidence: "high" | "uncertain";
  /** The clause the outcome was parsed from (safe — the user's own words, no ids/config). */
  readonly text: string;
}

/**
 * Parse the request into zero or more high-confidence downstream outcomes. Splits the
 * trigger-stripped action text on clause delimiters (comma / and / then / plus / & / ;) and maps each
 * clause's first recognized ACTION verb to a concept. Clauses with no recognized action verb are
 * dropped (uncertain → no requirement).
 */
export function parseRequestedOutcomes(requestText: string): RequestedOutcome[] {
  const text = requestedActionText(requestText);
  if (!text) return [];
  const segments = text
    .split(/\s*(?:,|\band\b|\bthen\b|\bplus\b|&|;)\s*/i)
    .map((s) => s.trim())
    .filter(Boolean);
  const outcomes: RequestedOutcome[] = [];
  for (const seg of segments) {
    let concept: EffectCategory | undefined;
    for (const raw of tokens(seg)) {
      const c = EFFECT_KEYWORDS[raw] ?? EFFECT_KEYWORDS[singularize(raw)];
      if (c && ACTION_CONCEPTS.has(c)) {
        concept = c;
        break;
      }
    }
    if (concept) outcomes.push({ concept, confidence: "high", text: seg });
  }
  return outcomes;
}

/**
 * Complete-coverage check: can EVERY high-confidence requested outcome be matched to a DISTINCT
 * meaningful template action of the same effect concept? Uses maximum bipartite matching (Kuhn's
 * augmenting paths) so N requested outcomes of the same concept require N distinct actions of that
 * concept — a single action can never cover two separate outcomes. Returns the UNCOVERED outcomes
 * (empty → full coverage).
 */
export function uncoveredOutcomes(
  outcomes: readonly RequestedOutcome[],
  actionEffects: readonly ActionEffect[],
): RequestedOutcome[] {
  const actions = actionEffects.filter(isMeaningfulAction);
  const actionToOutcome: (number | undefined)[] = new Array(actions.length).fill(undefined);

  const tryAssign = (oi: number, seen: boolean[]): boolean => {
    for (let aj = 0; aj < actions.length; aj++) {
      if (actions[aj]!.effectCategory !== outcomes[oi]!.concept) continue;
      if (seen[aj]) continue;
      seen[aj] = true;
      const held = actionToOutcome[aj];
      if (held === undefined || tryAssign(held, seen)) {
        actionToOutcome[aj] = oi;
        return true;
      }
    }
    return false;
  };

  const uncovered: RequestedOutcome[] = [];
  for (let oi = 0; oi < outcomes.length; oi++) {
    if (outcomes[oi]!.confidence !== "high") continue;
    if (!tryAssign(oi, new Array(actions.length).fill(false))) uncovered.push(outcomes[oi]!);
  }
  return uncovered;
}

/** Friendly, safe label for an effect concept (used in match-reason copy). */
export function effectConceptLabel(concept: EffectCategory): string {
  switch (concept) {
    case "send":
    case "notify":
      return "send/notify";
    case "append":
      return "add";
    case "upload":
      return "save";
    default:
      return concept;
  }
}

/**
 * Does a template action CONTRIBUTE to a requested outcome? Conservative — returns true only when the
 * action's concept was requested AND (for a distinctive business object) that object was named.
 *
 *   - a pure read / native step is benign → always "contributes";
 *   - otherwise the effect concept must be in the requested set (send & notify are the same concept);
 *   - a distinctive business object (task / contact / deal / poll / email / …) must be named in the
 *     request; a structural-only action (append row, send message) needs only the concept.
 */
export function actionContributesToRequest(
  effect: ActionEffect,
  requested: RequestedOutcomes,
): boolean {
  if (!isMeaningfulAction(effect)) return true;
  if (!requested.concepts.has(effect.effectCategory)) return false;
  if (effect.objectTokens.length === 0) return true;
  return effect.objectTokens.some((t) => requested.tokens.has(t));
}
