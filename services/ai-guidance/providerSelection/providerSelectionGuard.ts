/**
 * Deterministic provider-selection guard (REACT-PROVIDER-AMBIGUITY-1 · -2).
 *
 * A capability match never authorizes React to INVENT a provider choice. The model may propose a
 * plan step or an added node using `gmail:new_email` for "when I receive an email…" — but "email"
 * names a CAPABILITY CATEGORY, not a provider. This guard runs server-side over every model-chosen
 * trigger/action provider and converts an unjustified choice into a targeted provider
 * clarification instead of letting it reach the preview.
 *
 * ── THE DECISION TABLE (the documented product rule; tests pin every row) ──
 *
 * A chosen provider P for a node of (kind, category) is JUSTIFIED when, in priority order:
 *   1. `native`            — platform capability (manual/schedule/logic/http), not an app choice.
 *   2. `explicit`          — the user named P in ANY turn (shared vocabulary:
 *                            `providerVocabulary.isProviderMentioned`; "outlook" → microsoft-outlook,
 *                            "microsoft outlook" → microsoft-outlook; generic words never match).
 *   3. `canvas`            — P is already on the user's current draft (existing-node context; editing
 *                            never silently swaps a provider the user already chose).
 *   4. `sole-registered`   — P is the ONLY provider REGISTERED for this kind+category. This is a
 *                            PLATFORM-CAPABILITY fact (no alternative exists in the catalog), not an
 *                            inference about the user; the preview names the provider on the node card.
 *
 * Otherwise the choice is AMBIGUOUS: the guard yields a clarification carrying stable provider IDS
 * plus user-facing display names, and the caller returns the question INSTEAD of a plan/proposal.
 *
 * ── CONNECTION STATE IS NOT INTENT (REACT-PROVIDER-AMBIGUITY-2) ──
 *
 * There is deliberately NO `sole-connected` rule. When ≥2 providers are REGISTERED for the
 * capability, the account having connected exactly one of them does NOT answer "which provider did
 * the user mean" — they may fully intend to connect the other. Connection state therefore feeds
 * ONLY the clarification COPY / display emphasis (`ProviderClarificationOption.isConnected` and the
 * "X is already connected" sentence); it can never preselect, commit, or justify a provider. The
 * REGISTERED-vs-CONNECTED distinction is the whole point: one registered ⇒ automatic selection is
 * allowed; one connected among several registered ⇒ clarification required.
 *
 * Candidates are computed as a SET from the discovery registry (same kind + same category) and every
 * output is sorted by display label — registry/catalog/connection ordering can never change the
 * result (no first-match behavior anywhere).
 *
 * Pure + model-free; reads only the frozen in-memory registries.
 */

import type { ActionCategory } from "@/contracts/actionMeta";
import { listProviders } from "@/integrations/_registry";
import {
  getActionMeta,
  getTriggerMeta,
  listActionMetasForProvider,
  listProvidersWithMetadata,
  listTriggerMetasForProvider,
} from "@/services/discovery/_registry";
import { buildWordSet, isProviderMentioned } from "../providerVocabulary";

const NATIVE_PROVIDER_ID = "native";

export interface ProviderChoiceNode {
  readonly provider: string;
  readonly type: string;
  readonly kind: "trigger" | "action";
}

export interface ProviderSelectionContext {
  /** The user's own words — goal text + recent turns (raw; server-local only). */
  readonly texts: readonly string[];
  /** Providers already on the current draft (existing-node context). */
  readonly canvasProviders?: readonly string[];
  /**
   * Providers the account has connected (shared + own). REACT-PROVIDER-AMBIGUITY-2: used ONLY for
   * clarification copy / display emphasis — connection state never justifies a provider choice.
   */
  readonly connectedProviders?: readonly string[];
}

export type ProviderJustifiedRule = "native" | "explicit" | "canvas" | "sole-registered";

export interface ProviderClarificationOption {
  readonly providerId: string;
  readonly label: string;
  /**
   * Whether the account already has this provider connected. DISPLAY EMPHASIS ONLY — the UI may
   * highlight it, but it must never preselect or commit the option (REACT-PROVIDER-AMBIGUITY-2).
   */
  readonly isConnected: boolean;
}

export interface ProviderClarification {
  readonly kind: "trigger" | "action";
  readonly category: string;
  /** ALL registered candidates, sorted by display label (stable ids + user-facing names). */
  readonly options: readonly ProviderClarificationOption[];
  /** User-facing targeted question (display names only). */
  readonly question: string;
}

export type ProviderChoiceVerdict =
  | { readonly justified: true; readonly rule: ProviderJustifiedRule }
  | { readonly justified: false; readonly clarification: ProviderClarification };

/** User-facing noun for a category in the clarification question. */
const CATEGORY_NOUNS: Readonly<Record<string, string>> = {
  email: "email service",
  messaging: "messaging app",
  calendar: "calendar app",
  files: "file storage app",
  data: "data app",
  commerce: "commerce app",
  crm: "CRM",
  marketing: "marketing app",
  scheduling: "scheduling app",
  developer: "developer tool",
};

function displayLabel(providerId: string): string {
  const manifest = listProviders().find((m) => m.id === providerId);
  return manifest?.displayName ?? providerId;
}

/**
 * The registered providers exposing at least one node of this kind+category, as a SORTED list
 * (by display label, id tiebreak) — a set semantically; order carries no meaning.
 */
export function registeredCategoryCandidates(
  kind: "trigger" | "action",
  category: ActionCategory,
): readonly string[] {
  const out = new Set<string>();
  for (const providerId of listProvidersWithMetadata()) {
    if (providerId === NATIVE_PROVIDER_ID) continue;
    const metas = kind === "trigger" ? listTriggerMetasForProvider(providerId) : listActionMetasForProvider(providerId);
    if (metas.some((m) => m.category === category)) out.add(providerId);
  }
  return [...out].sort((a, b) => displayLabel(a).localeCompare(displayLabel(b)) || a.localeCompare(b));
}

/**
 * Build the targeted question. Lists up to 4 names; larger candidate sets get an open phrasing.
 *
 * REACT-PROVIDER-AMBIGUITY-2 — when some candidates are already connected, the question SAYS SO as
 * a convenience ("Gmail is already connected."). That sentence is copy only: the question is still
 * asked, no option is preselected, and nothing is committed until the user answers.
 */
function buildQuestion(kind: "trigger" | "action", category: string, options: readonly ProviderClarificationOption[]): string {
  const noun = CATEGORY_NOUNS[category] ?? "app";
  const names = options.map((o) => o.label);
  const listed = names.slice(0, 4).join(names.length === 2 ? " or " : ", ");
  const suffix = names.length > 4 ? ", or another supported app" : "";
  const connected = options.filter((o) => o.isConnected).map((o) => o.label);
  const connectedSentence =
    connected.length === 0
      ? ""
      : connected.length === 1
        ? ` ${connected[0]} is already connected.`
        : ` ${connected.slice(0, 3).join(" and ")} are already connected.`;
  return `Which ${noun} should this use: ${listed}${suffix}?${connectedSentence} I'll keep everything else you've told me.`;
}

/**
 * Evaluate ONE chosen provider against the decision table. `candidatesOverride` exists ONLY for
 * order-independence tests — production always derives the candidate set from the registry.
 */
export function evaluateProviderChoice(
  node: ProviderChoiceNode,
  ctx: ProviderSelectionContext,
  candidatesOverride?: readonly string[],
): ProviderChoiceVerdict {
  if (node.provider === NATIVE_PROVIDER_ID) return { justified: true, rule: "native" };

  const key = `${node.provider}:${node.type}`;
  const meta = node.kind === "trigger" ? getTriggerMeta(key) : getActionMeta(key);
  // Unknown capability → not a provider decision; the capability validators reject it with an
  // exact reason downstream.
  if (!meta) return { justified: true, rule: "sole-registered" };

  const words = buildWordSet(ctx.texts);
  if (isProviderMentioned(node.provider, displayLabel(node.provider), words)) {
    return { justified: true, rule: "explicit" };
  }

  if ((ctx.canvasProviders ?? []).includes(node.provider)) {
    return { justified: true, rule: "canvas" };
  }

  // REGISTERED candidates only. A capability with exactly ONE registered provider has no
  // alternative in the product catalog, so selecting it is a platform fact, not an assumption.
  const rawCandidates = candidatesOverride ?? registeredCategoryCandidates(node.kind, meta.category);
  const candidates = new Set(rawCandidates);
  candidates.add(node.provider); // the chosen provider is always a candidate of its own category
  if (candidates.size <= 1) return { justified: true, rule: "sole-registered" };

  // REACT-PROVIDER-AMBIGUITY-2 — with ≥2 REGISTERED candidates the choice is the USER'S to make.
  // Connection state is deliberately NOT consulted here: having connected exactly one of them is
  // availability, not intent (they may intend to connect another). It only decorates the options.
  const connected = new Set((ctx.connectedProviders ?? []).filter((p) => candidates.has(p)));
  const options = [...candidates]
    .map((providerId) => ({
      providerId,
      label: displayLabel(providerId),
      isConnected: connected.has(providerId),
    }))
    .sort((a, b) => a.label.localeCompare(b.label) || a.providerId.localeCompare(b.providerId));
  return {
    justified: false,
    clarification: {
      kind: node.kind,
      category: meta.category,
      options,
      question: buildQuestion(node.kind, meta.category, options),
    },
  };
}

export interface ProviderAmbiguityResult {
  /** The FIRST ambiguous choice (plan order), or null when every choice is justified. */
  readonly clarification: ProviderClarification | null;
}

/**
 * Evaluate a set of chosen nodes; the FIRST ambiguity wins (one targeted question per turn).
 *
 * REACT-PROVIDER-AMBIGUITY-2 removed the "narrowing notice" channel along with the sole-connected
 * rule: every remaining justification is either the user's own words, their own canvas, a platform
 * capability with no alternative, or a native step — none of which is an inference needing
 * disclosure. A provider the user did not choose now produces a QUESTION, never a notice.
 */
export function findProviderAmbiguity(
  nodes: readonly ProviderChoiceNode[],
  ctx: ProviderSelectionContext,
): ProviderAmbiguityResult {
  for (const node of nodes) {
    const verdict = evaluateProviderChoice(node, ctx);
    if (!verdict.justified) return { clarification: verdict.clarification };
  }
  return { clarification: null };
}
