/**
 * Deterministic Builder AI composer intent router (Slice 4.AI-DIAG-QA-AUTOROUTE-1, CS-1).
 *
 * Classifies a single composer message into one of three routes so the ONE
 * composer can serve both the diagnosis Q&A and the planner without a second
 * input box (replacing the AI-DIAG-QA-3 `_BuilderAiPanelQa.tsx` mini-input):
 *
 *   - `"qa"`      → ask the read-only diagnosis Q&A ("why won't this run?", "explain
 *                   this error", "what should I fix first?").
 *   - `"plan"`    → the build/edit planner ("add a Slack step", "connect Gmail").
 *   - `"clarify"` → intent is unclear AND mutation might be implied; the caller shows
 *                   an in-feed clarification ("explain" vs "plan a fix") rather than
 *                   silently guessing. NEVER auto-routes a vague/mixed prompt to a
 *                   mutation path.
 *
 * CS-1 is the PURE classifier only — no UI wiring, no route calls, no behavior change.
 * It mirrors the existing pure-router precedent {@link ./shouldRouteChatFill} and
 * {@link ./detectIntentCorrection}: lowercase + whitespace-normalize, named regex
 * markers, a typed result carrying diagnostic `signals` (never user-facing).
 *
 * Precedence (first match wins) — designed so a clear mutation command beats a
 * question wrapper, a mixed explain+act request asks rather than guesses, and an
 * unmatched prompt defaults to the SAFE `clarify` (never `plan`):
 *   1. empty            → clarify
 *   2. mixed            → clarify   (a diagnostic question AND an appended imperative action)
 *   3. vague idiom      → clarify   ("fix this", "help me", "make this work", "what now")
 *   4. plan             → plan      (leading build verb / "can you <verb>" / "fix this workflow")
 *   5. qa               → qa        (interrogative / modal question / explain phrase / "?")
 *   6. (default)        → clarify
 */

export type ComposerIntentRoute = "qa" | "plan" | "clarify";

export interface ComposerIntentResult {
  readonly route: ComposerIntentRoute;
  /** Names of the markers that matched — diagnostic only, never user-facing. */
  readonly signals: readonly string[];
}

/**
 * Workflow-mutation verbs. A leading one (or one after a "can you …" request
 * lead-in) is a clear build/edit command. `fix` is deliberately EXCLUDED here —
 * bare "fix this" is vague (clarify); only "fix this/the/my workflow" routes to
 * plan, via its own marker.
 */
const BUILD_VERBS =
  "add|create|build|make|change|update|modify|edit|remove|delete|connect|disconnect|rename|set|move|insert|replace|send|route|trigger|schedule|wire|configure|enable|disable|automate";

/** Leading imperative build command: "Add a Slack step", "please connect Gmail". */
const LEADING_BUILD = new RegExp(`^(?:please\\s+|pls\\s+|just\\s+)?(?:${BUILD_VERBS})\\b`);

/** "Can/could/would/will you [please] <verb>" — a request for the assistant to ACT. */
const REQUEST_TO_ACT = new RegExp(`\\b(?:can|could|would|will)\\s+you\\s+(?:please\\s+)?(?:${BUILD_VERBS})\\b`);

/** "I want to / I'd like to / let's / can we / please <verb>" — first-person build intent. */
const WANT_TO_ACT = new RegExp(`\\b(?:i\\s+want|i'?d\\s+like|i\\s+would\\s+like|let'?s|lets|can\\s+we|could\\s+we)\\s+(?:to\\s+)?(?:${BUILD_VERBS})\\b`);

/** "fix this/the/my workflow" — a command to change the workflow (plan, per policy). */
const FIX_WORKFLOW = /\bfix\s+(?:this|the|my)\s+workflow\b/;

/** Leading interrogative — a question about the current workflow/check state. */
const QA_INTERROGATIVE = /^(?:why|what|whats|what'?s|how|which|who|where|when)\b/;

/** Leading modal question — "Can I…", "Should I…", "Do I…", "Does this…", "Is this…". */
const QA_MODAL = /^(?:can|could|should|do|does|did|is|are|was|were|will|would|have|has)\s+(?:i|we|this|that|the|these|those|there|it|my)\b/;

/** Explain / diagnostic phrasings anywhere in the message. */
const QA_PHRASES: ReadonlyArray<{ readonly name: string; readonly re: RegExp }> = [
  { name: "qa:explain", re: /\bexplain\b/ },
  { name: "qa:what-mean", re: /\bwhat\s+(?:does|do)\s+(?:this|that|it)\s+mean\b/ },
  { name: "qa:whats-wrong", re: /\bwhat'?s?\s+wrong\b/ },
  { name: "qa:which-step", re: /\bwhich\s+step\b/ },
  { name: "qa:what-data", re: /\bwhat\s+data\b/ },
  { name: "qa:can-i-ignore", re: /\bcan\s+i\s+ignore\b/ },
  { name: "qa:why-negative", re: /\bwhy\s+(?:won'?t|wont|can'?t|cant|doesn'?t|does\s+not|isn'?t|is\s+not)\b/ },
];

/** Ends with a question mark. */
const ENDS_QUESTION = /\?\s*$/;

/**
 * Vague, mutation-CAPABLE idioms that must never be silently routed to a mutation
 * (or treated as a real question) — they ask for a clarification instead. Checked
 * BEFORE the plan rule so "make this work" (idiom) beats the leading-"make" build
 * rule, while "make it send an email" still plans.
 */
const VAGUE_PHRASES: ReadonlyArray<{ readonly name: string; readonly re: RegExp }> = [
  { name: "vague:fix-pronoun", re: /^(?:please\s+)?fix\s+(?:this|it|that)\s*[.!?]*$/ },
  { name: "vague:make-work", re: /\bmake\s+(?:this|it)\s+work\b/ },
  { name: "vague:help", re: /^(?:please\s+)?(?:i\s+need\s+)?help(?:\s+me)?\b|\bhelp\s+(?:me|with\s+this)\b/ },
  { name: "vague:what-now", re: /^what\s+now\b/ },
  { name: "vague:handle-this", re: /\b(?:can\s+you\s+)?handle\s+this\b/ },
  { name: "vague:sort-out", re: /\bsort\s+(?:this|it)\s+out\b/ },
  { name: "vague:do-something", re: /^do\s+something\b/ },
];

/**
 * An appended imperative ACTION clause that, combined with a diagnostic question,
 * makes the intent MIXED ("Why is this broken and fix it?"). Distinct from "fix"
 * as a question OBJECT ("what should I fix first?" — no conjunction + verb, no
 * "fix it/this/that"), which stays a pure question.
 */
const APPENDED_ACTION = new RegExp(`\\b(?:and|then|also|plus|,|;)\\s+(?:please\\s+)?(?:fix|repair|${BUILD_VERBS})\\b`);
const TRAILING_FIX_IT = /\bfix\s+(?:it|this|that)\b/;

function normalize(text: string): string {
  return text
    .toLowerCase()
    .replace(/[‘’]/g, "'") // curly → straight apostrophe (won’t → won't)
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Classify one composer message. Pure + deterministic; reads ONLY the typed
 * string and returns an enum + diagnostic signals. It never reads or emits graph
 * internals, ids, config, or secrets.
 */
export function classifyComposerIntent(text: string): ComposerIntentResult {
  const t = normalize(text);
  if (t.length === 0) return { route: "clarify", signals: ["empty"] };

  // Compute the raw signal groups once.
  const qaSignals: string[] = [];
  if (QA_INTERROGATIVE.test(t)) qaSignals.push("qa:interrogative");
  if (QA_MODAL.test(t)) qaSignals.push("qa:modal");
  for (const m of QA_PHRASES) if (m.re.test(t)) qaSignals.push(m.name);
  if (ENDS_QUESTION.test(t)) qaSignals.push("qa:question-mark");

  const planSignals: string[] = [];
  if (LEADING_BUILD.test(t)) planSignals.push("plan:leading-build");
  if (REQUEST_TO_ACT.test(t)) planSignals.push("plan:can-you-build");
  if (WANT_TO_ACT.test(t)) planSignals.push("plan:want-to-build");
  if (FIX_WORKFLOW.test(t)) planSignals.push("plan:fix-workflow");

  const vagueSignals = VAGUE_PHRASES.filter((m) => m.re.test(t)).map((m) => m.name);

  const hasQa = qaSignals.length > 0;
  const appendedAction = APPENDED_ACTION.test(t) || TRAILING_FIX_IT.test(t);

  // 2. MIXED — a diagnostic question AND an appended imperative action. Ask, don't guess.
  if (hasQa && appendedAction) {
    return { route: "clarify", signals: [...qaSignals, "mixed:appended-action"] };
  }

  // 3. VAGUE — mutation-capable idioms with no concrete intent. Ask, don't guess.
  if (vagueSignals.length > 0) {
    return { route: "clarify", signals: vagueSignals };
  }

  // 4. PLAN — a clear build/edit command (beats a question wrapper, e.g. "can you add…").
  if (planSignals.length > 0) {
    return { route: "plan", signals: planSignals };
  }

  // 5. QA — a clear diagnostic question.
  if (hasQa) {
    return { route: "qa", signals: qaSignals };
  }

  // 6. DEFAULT — unmatched → SAFE clarify (never silently plan).
  return { route: "clarify", signals: ["ambiguous"] };
}
