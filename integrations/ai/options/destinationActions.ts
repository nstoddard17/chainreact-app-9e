import {
  AI_PROVIDER_DISPLAY_NAME,
  AI_PROVIDER_ID,
  NATIVE_PROVIDER_ID,
} from "@/core/integrations/connectionlessProviders";
import {
  deriveDestinationContext,
  hasMappableDestinationFields,
} from "@/core/workflows/deriveDestinationContext";
import { listProviders } from "@/integrations/_registry";
import { listAllActionMetas } from "@/services/discovery/_registry";
import type { OptionsResolver, OptionItem } from "@/services/options/types";

/**
 * `ai:destination_actions` — the destination picker for
 * `ai:transform_data` (AI-PROVIDER-6 CS-6).
 *
 * The first CONNECTIONLESS option source with a real product job (the only
 * prior one is the `native:examples` test fixture). It lists actions from the
 * discovery registry — the same registry `validateWorkflowPatch`, readiness,
 * and the config panel read — so the picker can never offer a destination the
 * runtime would reject.
 *
 * `requiresIntegration: false` is correct and load-bearing: choosing a
 * destination SHAPE is a metadata question, not a provider call. An author can
 * design "transform these rows into QuickBooks Create Employee" before
 * connecting QuickBooks; the connection is the destination step's problem, not
 * this step's.
 *
 * What is deliberately NOT offered:
 *   - `ai:*` actions — transforming into another AI action is a cost loop with
 *     no product meaning.
 *   - actions with no mappable scalar field (`hasMappableDestinationFields`) —
 *     every field is a credential, a provider resource, or a structured shape
 *     phase 1 cannot map. Offering one would guarantee a runtime refusal, so
 *     it is withheld at pick time instead. The runtime re-checks anyway (a
 *     saved workflow can outlive a metadata change).
 *
 * No-leak: labels and descriptions are static PRODUCT metadata compiled into
 * the app. No account, credential, connection state, or provider resource is
 * read — which is also why this resolver needs no integration row.
 */

/** One page of destinations. Search narrows; the cap is a UI hint. */
const MAX_ITEMS = 200;

/** Human name for a provider id, including the two connectionless families. */
function buildProviderLabels(): ReadonlyMap<string, string> {
  const labels = new Map<string, string>();
  for (const manifest of listProviders()) {
    labels.set(manifest.id, manifest.displayName);
  }
  labels.set(NATIVE_PROVIDER_ID, "Built-in");
  labels.set(AI_PROVIDER_ID, AI_PROVIDER_DISPLAY_NAME);
  return labels;
}

export const aiDestinationActionsResolver: OptionsResolver = {
  source: "ai:destination_actions",
  provider: AI_PROVIDER_ID,
  requiresIntegration: false,
  async resolve(ctx) {
    const providerLabels = buildProviderLabels();
    const query = ctx.q.toLowerCase();

    const candidates = listAllActionMetas()
      .filter((meta) => meta.provider !== AI_PROVIDER_ID)
      .filter((meta) => hasMappableDestinationFields(meta))
      .map((meta) => {
        const providerLabel = providerLabels.get(meta.provider) ?? meta.provider;
        // How many of the destination's fields this transform can actually
        // fill. Shown on the option because it is the decision the author is
        // making: a destination whose inputs are mostly connected-app
        // resources (an Airtable base, a Trello list) has little for an AI
        // transform to do, and seeing "1 field" beforehand beats discovering
        // it after a paid run.
        const mappable = deriveDestinationContext(meta).schema?.fields.length ?? 0;
        return {
          value: meta.key,
          label: `${providerLabel} — ${meta.displayName}`,
          providerLabel,
          mappable,
          description: meta.description,
        };
      });

    const matched =
      query.length > 0
        ? candidates.filter(
            (c) =>
              c.label.toLowerCase().includes(query) ||
              c.value.toLowerCase().includes(query),
          )
        : candidates;

    matched.sort((a, b) => a.label.localeCompare(b.label));

    const items: OptionItem[] = matched.slice(0, MAX_ITEMS).map((c) => ({
      value: c.value,
      label: c.label,
      // Mappable-field count first (the decision), then the first sentence of
      // the action's own description (enough to tell two similarly-named
      // destinations apart without flooding the menu).
      description: `${c.mappable} field${c.mappable === 1 ? "" : "s"} can be filled automatically. ${
        c.description.split(". ")[0] ?? ""
      }`.slice(0, 200),
    }));

    return { items, hasMore: matched.length > MAX_ITEMS };
  },
};
