/**
 * Generic, registry-driven named-provider chain fallback
 * (REACT-AGENT-PLAN-GENERATION-REGRESSION-AUDIT-1).
 *
 * Last-resort skeletal planner for the preview-first path: it runs ONLY after the model's initial
 * reply AND the one structured repair both produced no plan for a request the server classified as
 * PLAN-EXPECTED. For a request where the user explicitly named every app and each named app maps to
 * exactly ONE registered capability for the intent described, ChainReact can construct the skeleton
 * itself from registry metadata and leave every configuration value to the setup form.
 *
 * Hard properties:
 *   - GENERIC: no provider combination, capability id, or per-provider phrase is hardcoded. All
 *     capability knowledge comes from the live discovery registry (keys, display names, fields).
 *     The only English carried here is closed-class vocabulary (temporal markers, person pronouns/
 *     nouns) — provider-agnostic by construction.
 *   - UNAMBIGUOUS OR NOTHING: every named provider must resolve to exactly one candidate trigger or
 *     action for its clause. Any tie, any miss, any un-clause-able text → `null` (the typed
 *     PREVIEW_PLAN_MISSING failure stands). It never guesses between two capabilities.
 *   - NO FABRICATION: steps carry NO config values. `requiredInputs` are the capability's real
 *     required field keys read from registry metadata. The finished plan must pass
 *     `validateWorkflowPlan` (fail closed).
 *   - Pure + model-free: no fetch, no model, no clock, no state.
 */

import { WORKFLOW_PLAN_SCHEMA_VERSION, type WorkflowPlan, type WorkflowPlanStep } from "@/contracts/guidanceSession";
import { INFERRED_PLAN_SUMMARY } from "@/core/ai/previewLeadInCopy";
import { listProviders } from "@/integrations/_registry";
import {
  listActionMetasForProvider,
  listProvidersWithMetadata,
  listTriggerMetasForProvider,
} from "@/services/discovery/_registry";
import { isProviderMentioned, providerMentionTokens } from "../providerVocabulary";
import { validateWorkflowPlan } from "../validateWorkflowPlan";
import { requiredActionInputs, requiredTriggerInputs } from "./inferDeterministicPreview";

/** A clause that describes the EVENT (the trigger side of the sentence). Closed-class English. */
const TEMPORAL_CLAUSE_RE = /^(?:when|whenever|every time|each time|any\s?time|once|after|as soon as|on)\b/i;

/**
 * Person-class nouns: when a clause's object is a PERSON reference ("add THEM", "add the customer")
 * rather than a provider artifact ("add a tag"), only capabilities whose own object noun is
 * person-class can match. Closed-class, provider-agnostic vocabulary.
 */
const PERSON_NOUNS = new Set([
  "subscriber", "contact", "member", "person", "lead", "customer", "user", "recipient",
  "respondent", "attendee", "client",
]);

const PERSON_REFERENCE_RE =
  /\b(?:them|him|her|they|someone|somebody|people|person|contact|contacts|subscriber|subscribers|lead|leads|customer|customers|user|users|respondent|respondents|client|clients)\b/i;

/**
 * REACT-AGENT-LATENCY-AND-PROMPT-SIZE-1 — the send-family verb CLASS. "post the order to Slack"
 * must not uniquely match a niche action just because its type starts with "post" while the plain
 * send action starts with "send". Any send-class word in the clause matches every send-class
 * capability verb, so genuine alternatives tie and the planner DECLINES instead of confidently
 * picking the wrong one. Closed-class English only — no provider knowledge.
 */
const SEND_CLASS_VERBS = new Set(["send", "post", "notify", "message", "dm", "ping", "alert"]);

/** Does the clause satisfy this capability verb, directly or through the send class? */
function verbMatches(verb: string, clauseWordSet: ReadonlySet<string>): boolean {
  if (clauseWordSet.has(verb)) return true;
  if (SEND_CLASS_VERBS.has(verb)) {
    for (const w of SEND_CLASS_VERBS) if (clauseWordSet.has(w)) return true;
  }
  return false;
}

interface CapabilityCandidate {
  readonly key: string; // "provider:type"
  readonly provider: string;
  readonly type: string;
  readonly displayName: string;
  /** First token of the type/displayName — the capability's verb ("add", "create", "send"). */
  readonly verbs: ReadonlySet<string>;
  /** Remaining tokens — the capability's object nouns ("subscriber", "contact", "email"). */
  readonly objects: ReadonlySet<string>;
}

/** Lowercased word tokens (≥2 chars) of a text, with naive singulars added for plural forms. */
function clauseWords(text: string): Set<string> {
  const words = new Set<string>();
  for (const w of text.toLowerCase().split(/[^a-z0-9]+/)) {
    if (w.length < 2) continue;
    words.add(w);
    if (w.endsWith("s") && w.length > 3) words.add(w.slice(0, -1));
  }
  return words;
}

/** Split "provider:type" metadata into verb/object token sets (type tokens + display-name words). */
function toCandidate(meta: { key: string; displayName: string }): CapabilityCandidate | null {
  const idx = meta.key.indexOf(":");
  if (idx <= 0) return null;
  const provider = meta.key.slice(0, idx);
  const type = meta.key.slice(idx + 1);
  const typeTokens = type.toLowerCase().split(/[^a-z0-9]+/).filter((t) => t.length >= 2);
  const nameTokens = meta.displayName.toLowerCase().split(/[^a-z0-9]+/).filter((t) => t.length >= 2);
  if (typeTokens.length === 0) return null;
  const verbs = new Set<string>([typeTokens[0]!, ...(nameTokens.length ? [nameTokens[0]!] : [])]);
  const objects = new Set<string>([...typeTokens.slice(1), ...nameTokens.slice(1)]);
  return { key: meta.key, provider, type, displayName: meta.displayName, verbs, objects };
}

/** Split the goal into ordered clauses ("," / "." / ";" / " then "), stripping leading "and ". */
function splitClauses(goalText: string): string[] {
  return goalText
    .split(/[,.;]|\bthen\b/i)
    .map((c) => c.trim().replace(/^and\b\s*/i, ""))
    .filter((c) => c.length > 0);
}

/**
 * REACT-AGENT-RUNTIME-REPRO-1 — split a RUN-ON temporal sentence with no
 * punctuation ("when i get a stripe payment from marcus send me a slack
 * message to test channel") into its trigger and action clauses.
 *
 * Casual speech drops the comma, so `splitClauses` sees ONE clause and the
 * planner used to decline a request the user had stated completely. The split
 * is deterministic and closed-class: try each send-class verb occurrence, left
 * to right, and accept the FIRST split where BOTH halves name at least one
 * registered provider (the guard that keeps "when a message arrives in slack
 * post it to teams" from splitting at "message" — its left half names no
 * provider, so the scan moves on to "post"). No valid split → null, and the
 * planner declines exactly as before (fail closed, safe clarification stands).
 */
function splitRunOnTemporalClause(clause: string): [string, string] | null {
  if (!TEMPORAL_CLAUSE_RE.test(clause)) return null;
  const words = clause.split(/\s+/);
  for (let i = 1; i < words.length; i += 1) {
    const w = words[i]!.toLowerCase().replace(/[^a-z0-9]/g, "");
    if (!SEND_CLASS_VERBS.has(w)) continue;
    const left = words.slice(0, i).join(" ");
    const right = words.slice(i).join(" ");
    const byProvider = namedProvidersByClause([left, right]);
    const clauseIdxs = new Set(byProvider.values());
    if (byProvider.size >= 2 && clauseIdxs.has(0) && clauseIdxs.has(1)) {
      return [left, right];
    }
  }
  return null;
}

/** The registered, metadata-bearing providers the text names, with the first clause naming each. */
function namedProvidersByClause(clauses: readonly string[]): Map<string, number> {
  const withMeta = new Set(listProvidersWithMetadata());
  const byProvider = new Map<string, number>();
  for (const manifest of listProviders()) {
    if (!withMeta.has(manifest.id)) continue;
    const tokens = providerMentionTokens(manifest.id, manifest.displayName);
    for (let i = 0; i < clauses.length; i += 1) {
      const words = clauseWords(clauses[i]!);
      if (tokens.some((t) => words.has(t)) && isProviderMentioned(manifest.id, manifest.displayName, words)) {
        byProvider.set(manifest.id, i);
        break;
      }
    }
  }
  return byProvider;
}

/**
 * Resolve ONE provider's clause to exactly one capability, or null.
 *
 *   1. verb gate — the capability's verb token must appear in the clause;
 *   2. object gate — RANKED (REACT-AGENT-FIRST-TURN-1). Score each verb-matched candidate by how
 *      many DISTINCT object nouns of its own the clause contains, and keep the unique top scorer;
 *      otherwise, if the clause references a PERSON, only candidates whose object nouns are
 *      person-class survive;
 *   3. exactly one survivor → matched; zero or several → null (never guess).
 *
 * Why ranked and not binary (the first-turn defect): scoring used to be "matched at least one
 * object noun", so a candidate stayed alive on a single GENERIC noun it happened to share with a
 * more specific sibling. "post a message in our Slack billing channel" kept BOTH
 * `slack:send_channel_message` (matches `channel` + `message`) and `slack:send_direct_message`
 * (matches `message` only — the user never said "direct"), tied, and declined — so the request the
 * user stated most explicitly was the one ChainReact refused to plan. Counting matched nouns lets
 * the strictly better-specified capability win.
 *
 * This RELAXES nothing about genuine ambiguity: the winner must be a UNIQUE maximum. Two candidates
 * that match the clause equally well (Mailchimp's `add_note` vs `add_tag` for "add a note and a
 * tag", each scoring 1) still tie and still decline. A higher score means the clause named strictly
 * more of that capability's own nouns — evidence, not a tie-break heuristic.
 */
function resolveUniqueCapability(
  candidates: readonly CapabilityCandidate[],
  clause: string,
): CapabilityCandidate | null {
  const words = clauseWords(clause);
  const verbMatched = candidates.filter((c) => [...c.verbs].some((v) => verbMatches(v, words)));
  if (verbMatched.length === 0) return null;
  if (verbMatched.length === 1) return verbMatched[0]!;

  // Score = how many of the candidate's OWN object nouns the clause contains. Zero-score candidates
  // are not eligible here (unchanged: a clause naming no object noun falls through to person-class).
  const scored = verbMatched
    .map((candidate) => ({
      candidate,
      score: [...candidate.objects].filter((o) => words.has(o)).length,
    }))
    .filter((s) => s.score > 0);
  if (scored.length > 0) {
    const topScore = Math.max(...scored.map((s) => s.score));
    const top = scored.filter((s) => s.score === topScore);
    // A UNIQUE strongest match may be selected; a genuine tie stays unresolved.
    return top.length === 1 ? top[0]!.candidate : null;
  }

  // No object noun in the clause at all — fall back to the person-reference class.
  if (PERSON_REFERENCE_RE.test(clause)) {
    const personMatched = verbMatched.filter((c) => [...c.objects].some((o) => PERSON_NOUNS.has(o)));
    if (personMatched.length === 1) return personMatched[0]!;
  }
  return null;
}

/** Resolve the trigger for the trigger-provider: its sole trigger, or a unique clause match. */
function resolveTrigger(providerId: string, clause: string): CapabilityCandidate | null {
  const metas = listTriggerMetasForProvider(providerId);
  const candidates = metas
    .map((m) => toCandidate({ key: m.key, displayName: m.displayName }))
    .filter((c): c is CapabilityCandidate => c !== null);
  if (candidates.length === 1) return candidates[0]!;
  if (candidates.length === 0) return null;
  return resolveUniqueCapability(candidates, clause);
}

/**
 * Infer a skeletal `WorkflowPlan` for a goal that explicitly names every provider, has exactly one
 * temporal (trigger) clause naming exactly one provider, and maps each named action provider to
 * exactly one registered capability. Returns `null` on ANY ambiguity (fail closed).
 */
export function inferNamedProviderChainPlan(goalText: string | undefined): WorkflowPlan | null {
  const goal = (goalText ?? "").trim();
  if (goal.length === 0) return null;

  let clauses = splitClauses(goal);
  if (clauses.length < 2) {
    // Comma-less run-on speech: recover the trigger/action boundary before a
    // send-class verb when both halves name a provider (see helper above).
    const runOn = clauses.length === 1 ? splitRunOnTemporalClause(clauses[0]!) : null;
    if (!runOn) return null;
    clauses = runOn;
  }
  const byProvider = namedProvidersByClause(clauses);
  if (byProvider.size < 2) return null;

  // Exactly ONE named provider may sit in a temporal clause — that provider owns the trigger.
  const temporalClauseIndexes = new Set(
    clauses.map((c, i) => (TEMPORAL_CLAUSE_RE.test(c) ? i : -1)).filter((i) => i >= 0),
  );
  if (temporalClauseIndexes.size === 0) return null;
  const triggerProviders = [...byProvider.entries()].filter(([, i]) => temporalClauseIndexes.has(i));
  if (triggerProviders.length !== 1) return null;
  const [triggerProviderId, triggerClauseIdx] = triggerProviders[0]!;

  const trigger = resolveTrigger(triggerProviderId, clauses[triggerClauseIdx]!);
  if (!trigger) return null;
  const triggerInputs = requiredTriggerInputs(trigger.provider, trigger.type);
  if (triggerInputs === null) return null;

  // Remaining named providers become actions, in the order their clauses appear.
  const actionProviders = [...byProvider.entries()]
    .filter(([id]) => id !== triggerProviderId)
    .sort(([, a], [, b]) => a - b);
  if (actionProviders.length === 0) return null;

  const steps: WorkflowPlanStep[] = [
    {
      ref: "s0",
      role: "trigger",
      provider: trigger.provider,
      type: trigger.type,
      purpose: `${trigger.displayName} — the event that starts this workflow.`,
      ...(triggerInputs.length > 0 ? { requiredInputs: triggerInputs } : {}),
    },
  ];

  for (const [providerId, clauseIdx] of actionProviders) {
    const candidates = listActionMetasForProvider(providerId)
      .map((m) => toCandidate({ key: m.key, displayName: m.displayName }))
      .filter((c): c is CapabilityCandidate => c !== null);
    if (candidates.length === 0) return null;
    const action =
      candidates.length === 1 ? candidates[0]! : resolveUniqueCapability(candidates, clauses[clauseIdx]!);
    if (!action) return null; // any ambiguity kills the whole fallback — never guess
    const inputs = requiredActionInputs(action.provider, action.type);
    if (inputs === null) return null;
    steps.push({
      ref: `s${steps.length}`,
      role: "action",
      provider: action.provider,
      type: action.type,
      purpose: `${action.displayName}.`,
      ...(inputs.length > 0 ? { requiredInputs: inputs } : {}),
    });
  }

  const plan: WorkflowPlan = {
    schemaVersion: WORKFLOW_PLAN_SCHEMA_VERSION,
    title: steps.map((s) => s.provider).join(" → "),
    // REACT-AGENT-PREVIEW-COPY-CLEANUP-1 — shared copy; it must not point at a
    // per-step setup surface that the pre-apply preview no longer shows.
    summary: INFERRED_PLAN_SUMMARY,
    steps,
    notApplied: true,
  };
  return validateWorkflowPlan(plan).ok ? plan : null;
}
