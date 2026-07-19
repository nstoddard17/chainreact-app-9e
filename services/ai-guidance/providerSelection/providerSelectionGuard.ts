/**
 * Deterministic provider-selection guard (REACT-PROVIDER-AMBIGUITY-1).
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
 *   4. `sole-registered`   — P is the ONLY registered provider exposing this kind+category. The
 *                            preview states the provider on the node card, so the inference is visible.
 *   5. `sole-connected`    — ≥2 providers are registered, but P is the ONLY one of them the account
 *                            has connected. This is the ESTABLISHED connected-provider narrowing
 *                            contract (same rule the deterministic edit fallback
 *                            `inferDeterministicMutationOps.resolveEmailTarget` has always used);
 *                            the route adds a visible notice so it never reads as a user choice.
 *
 * Otherwise the choice is AMBIGUOUS: the guard yields a clarification carrying stable provider IDS
 * plus user-facing display names, and the caller returns the question INSTEAD of a plan/proposal.
 * If the sole-connected candidate exists but the model picked a DIFFERENT provider, the guard still
 * clarifies — it NEVER substitutes one provider for another.
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
  /** Providers the account has connected (shared + own). */
  readonly connectedProviders?: readonly string[];
}

export type ProviderJustifiedRule =
  | "native"
  | "explicit"
  | "canvas"
  | "sole-registered"
  | "sole-connected";

export interface ProviderClarificationOption {
  readonly providerId: string;
  readonly label: string;
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

/** Build the targeted question. Lists up to 4 names; larger candidate sets get an open phrasing. */
function buildQuestion(kind: "trigger" | "action", category: string, options: readonly ProviderClarificationOption[]): string {
  const noun = CATEGORY_NOUNS[category] ?? "app";
  const names = options.map((o) => o.label);
  const listed = names.slice(0, 4).join(names.length === 2 ? " or " : ", ");
  const suffix = names.length > 4 ? ", or another supported app" : "";
  return `Which ${noun} should this use: ${listed}${suffix}? I'll keep everything else you've told me.`;
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

  const rawCandidates = candidatesOverride ?? registeredCategoryCandidates(node.kind, meta.category);
  const candidates = new Set(rawCandidates);
  candidates.add(node.provider); // the chosen provider is always a candidate of its own category
  if (candidates.size <= 1) return { justified: true, rule: "sole-registered" };

  const connectedCandidates = new Set(
    (ctx.connectedProviders ?? []).filter((p) => candidates.has(p)),
  );
  if (connectedCandidates.size === 1 && connectedCandidates.has(node.provider)) {
    return { justified: true, rule: "sole-connected" };
  }

  const options = [...candidates]
    .map((providerId) => ({ providerId, label: displayLabel(providerId) }))
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
  /**
   * Visible notices for inferences the user did not explicitly make (sole-connected narrowing) —
   * safe display names only. Empty when every choice was explicit/canvas/native/sole-registered.
   */
  readonly notices: readonly string[];
}

/** Evaluate a set of chosen nodes; first ambiguity wins (one targeted question per turn). */
export function findProviderAmbiguity(
  nodes: readonly ProviderChoiceNode[],
  ctx: ProviderSelectionContext,
): ProviderAmbiguityResult {
  const notices: string[] = [];
  const noticed = new Set<string>();
  for (const node of nodes) {
    const verdict = evaluateProviderChoice(node, ctx);
    if (!verdict.justified) return { clarification: verdict.clarification, notices };
    if (verdict.rule === "sole-connected" && !noticed.has(node.provider)) {
      noticed.add(node.provider);
      const meta =
        node.kind === "trigger" ? getTriggerMeta(`${node.provider}:${node.type}`) : getActionMeta(`${node.provider}:${node.type}`);
      const noun = CATEGORY_NOUNS[meta?.category ?? ""] ?? "app";
      notices.push(
        `Using your connected ${displayLabel(node.provider)} for the ${noun} step — tell me if you'd rather use a different one.`,
      );
    }
  }
  return { clarification: null, notices };
}
