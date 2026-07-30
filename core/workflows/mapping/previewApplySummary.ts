import type { DraftPreview, DraftPreviewNode } from "@/contracts/workflowPlanPreview";
import type { AgentConnectionSignal } from "../agentReadiness";
import type { PreviewSetupFieldsByType } from "../previewSetupFields";
import { getNodeDisplayName } from "../nodeDisplayName";
import { humanizeProviderSlug } from "../options/optionsRecovery";

/**
 * REACT-AGENT-PREAPPLY-SETUP-UX-1 — the COMPACT pre-apply preview model.
 *
 * The pre-apply card used to render every collectable field as a live control:
 * an entire Stripe event catalog as checkboxes, a Slack channel picker that hit
 * the option resolver, discovered the workspace was disconnected, and offered
 * "Reconnect in Apps" / "Enter ID manually" / "Add to draft & open step" — all
 * of it above the Apply button, before a single node existed. That inverted the
 * journey: the user had to configure and connect before they could even accept
 * the sketch.
 *
 * This module produces what the preview stage is actually for: a description of
 * what will be created, and an honest list of what will still need setting up
 * afterwards. Names and labels only — no controls, no options, no resolver, no
 * connection recovery. Applying is never gated on any of it.
 *
 * Pure: no I/O, no React, no store. Inputs are already-sanitized display data
 * (preview nodes, metadata field labels, the server-resolved connection signal);
 * nothing here carries config values, tokens, or provider payloads.
 */

export interface PreviewSummaryStep {
  readonly previewId: string;
  /** Registry display name ("Stripe Event Received"), never the raw capability key. */
  readonly name: string;
  readonly provider: string;
  readonly role: DraftPreviewNode["role"];
}

export type PreviewRequirementKind = "connection" | "field";

export interface PreviewSetupRequirement {
  /** Stable list key. */
  readonly key: string;
  /** What the user reads: "Slack connection", "Stripe event", "Message content". */
  readonly label: string;
  readonly kind: PreviewRequirementKind;
  /** Present for field requirements — which step needs it. */
  readonly stepName?: string;
  readonly provider: string;
}

export interface PreviewApplySummary {
  readonly steps: readonly PreviewSummaryStep[];
  readonly requirements: readonly PreviewSetupRequirement[];
}

export interface BuildPreviewApplySummaryInput {
  readonly preview: DraftPreview;
  /** Metadata-derived fields per `provider:type` — used ONLY for field LABELS here. */
  readonly setupFieldsByType?: PreviewSetupFieldsByType;
  /** Registry display names per `provider:type`. */
  readonly nodeDisplayNames?: Readonly<Record<string, string>>;
  /** Provider display names per slug ("slack" → "Slack"). */
  readonly providerLabels?: Readonly<Record<string, string>>;
  /**
   * Server-resolved connection state for the providers this preview uses. A
   * provider is listed as needing connection ONLY when the signal has resolved
   * and says so — an unresolved signal never invents a connection requirement,
   * and never claims one is satisfied either (it simply stays quiet, because the
   * Connect stage after Apply is where that truth is established).
   */
  readonly connection?: AgentConnectionSignal;
  /** Values the user's own request already supplied — not outstanding setup. */
  readonly prefilledConfig?: Readonly<Record<string, Readonly<Record<string, unknown>>>>;
}

function displayNameFor(
  node: DraftPreviewNode,
  nodeDisplayNames?: Readonly<Record<string, string>>,
): string {
  return getNodeDisplayName(
    {
      kind: node.role === "trigger" ? "trigger" : "action",
      provider: node.provider,
      type: node.type,
    },
    { displayName: nodeDisplayNames?.[`${node.provider}:${node.type}`] ?? null },
  );
}

function providerNameFor(
  provider: string,
  providerLabels?: Readonly<Record<string, string>>,
): string {
  return providerLabels?.[provider] ?? humanizeProviderSlug(provider);
}

export function buildPreviewApplySummary(
  input: BuildPreviewApplySummaryInput,
): PreviewApplySummary {
  const {
    preview,
    setupFieldsByType,
    nodeDisplayNames,
    providerLabels,
    connection,
    prefilledConfig,
  } = input;

  const steps: PreviewSummaryStep[] = preview.nodes.map((node) => ({
    previewId: node.previewId,
    name: displayNameFor(node, nodeDisplayNames),
    provider: node.provider,
    role: node.role,
  }));

  // Which providers are known to still need connecting. Only a RESOLVED signal
  // is consulted; "we haven't checked yet" must never render as "connect this".
  const disconnected = new Set<string>();
  if (connection?.state === "resolved") {
    for (const p of connection.providers) {
      if (p.state !== "connected") disconnected.add(p.provider);
    }
  }

  const requirements: PreviewSetupRequirement[] = [];
  const seen = new Set<string>();

  // Connection rows first — they gate everything else, and the Connect stage
  // that follows Apply is what resolves them. One row per provider, not per node.
  for (const node of preview.nodes) {
    if (node.provider === "native") continue;
    if (!disconnected.has(node.provider)) continue;
    const key = `connection:${node.provider}`;
    if (seen.has(key)) continue;
    seen.add(key);
    requirements.push({
      key,
      kind: "connection",
      provider: node.provider,
      label: `${providerNameFor(node.provider, providerLabels)} connection`,
    });
  }

  // Then the per-step fields still outstanding, in graph order.
  for (const node of preview.nodes) {
    const missing = node.missingInputs ?? [];
    if (missing.length === 0) continue;
    const fields = setupFieldsByType?.[`${node.provider}:${node.type}`] ?? [];
    const labelByName = new Map(fields.map((f) => [f.name, f.label] as const));
    const alreadySupplied = prefilledConfig?.[node.previewId] ?? {};
    const stepName = displayNameFor(node, nodeDisplayNames);
    for (const name of missing) {
      if (name in alreadySupplied) continue;
      const key = `field:${node.previewId}:${name}`;
      if (seen.has(key)) continue;
      seen.add(key);
      requirements.push({
        key,
        kind: "field",
        provider: node.provider,
        stepName,
        // Metadata label when we have one; otherwise the raw field name is a
        // poor but honest fallback — better than inventing a friendlier lie.
        label: labelByName.get(name) ?? name,
      });
    }
  }

  return { steps, requirements };
}
