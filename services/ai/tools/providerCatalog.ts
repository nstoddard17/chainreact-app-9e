/**
 * AI grounding tools over the provider / action / trigger registries
 * (Slice 4.AI-2). Read-only, deterministic, no model calls.
 *
 * Plan reference: docs/slices/phase-4/ai-architecture-react-agent-plan.md §5.
 *
 * Source of truth (never invents providers/actions/fields):
 *   - integrations/_registry.ts          — provider manifests
 *   - services/discovery/_registry.ts     — ActionMeta / TriggerMeta
 *
 * `getProviderCatalog` returns a COMPACT catalog (keys + a few scalar fields,
 * never full field/output schemas). The agent drills into one node's full
 * schema via `getActionMeta` / `getTriggerMeta` / `getNodeSchema`.
 */

import type {
  ActionCategory,
  ActionMeta,
  FieldMeta,
  FieldType,
  OutputMeta,
  RiskLevel,
} from "@/contracts/actionMeta";
import { normalizeDependsOn } from "@/contracts/actionMeta";
import type { TriggerActivation, TriggerMeta } from "@/contracts/triggerMeta";
import { listProviders } from "@/integrations/_registry";
import {
  getActionMeta as lookupActionMeta,
  getTriggerMeta as lookupTriggerMeta,
  listActionMetasForProvider,
  listTriggerMetasForProvider,
  listProvidersWithMetadata,
} from "@/services/discovery/_registry";
import {
  aiToolErr,
  aiToolOk,
  type AiToolResult,
} from "./types";

const NATIVE_PROVIDER_ID = "native";
/**
 * AI-PROVIDER-5 (CS-5) — ChainReact AI is the second connectionless provider
 * (no manifest, but real metadata). It must appear here for the same reason
 * `native` does: the planner may never be shown a node the validated registry
 * would reject, and it must never be BLIND to a node the registry accepts.
 */
const AI_PROVIDER_CATALOG_ID = "ai";

// ─── Compact catalog views ───────────────────────────────────────────────────

/**
 * Static-enum grounding for one config field (Slice 4.AI-12B). `values` are the
 * fixed `options[]` VALUES declared in the field's metadata — surfaced compactly
 * so the AI planner picks a real enum value instead of guessing one. Only fields
 * with static options appear; dynamic (`optionsSource`) fields never do.
 */
export interface CatalogFieldOptions {
  readonly field: string;
  readonly values: readonly string[];
}

/**
 * Declared config-field grounding for one node (Slice 4.AI-12D). Surfaces the
 * EXACT config key the planner must use, its renderer type (so the model knows
 * whether free-text / id / enum / etc. is expected), and whether it is required.
 * The compact catalog includes this for every action / trigger so the model
 * cannot guess a key from `displayName`, a field's UI `label`, or an output
 * name (which would otherwise produce structurally invalid patches like
 * `message: ...` on `slack:send_direct_message` where the real key is `text`).
 *
 * Generic + metadata-driven: derived from `FieldMeta` on every node, no
 * per-provider logic.
 *
 * `multiple` (Slice 4.AI-16) is set when the field declares `multiple: true`
 * on a `select` / `combobox` — its config VALUE must then be an array of
 * option values (e.g. `enabledEvents: ["payment_intent.payment_failed"]`,
 * NOT the scalar `"payment_intent.payment_failed"`). Omitted otherwise so
 * single-pick fields stay lean in the catalog.
 */
export interface CatalogConfigField {
  readonly name: string;
  readonly type: FieldType;
  readonly required: boolean;
  /** Present only when the field is a multi-select (`select`/`combobox` with `multiple: true`). */
  readonly multiple?: boolean;
}

/**
 * Declared output grounding for one node (Slice 4.AI-16). Surfaces the EXACT
 * top-level output names the model may use in `{{nodeId.<name>}}` /
 * `{{trigger.<name>}}` variable references. Without this, the model
 * hallucinates convenience outputs (e.g. `id`, `amount`, `currency`,
 * `last_payment_error` on Stripe `event_received`) that the metadata
 * never declared, and AI-3's variable-reference check rejects the patch
 * as INVALID_VARIABLE_REFERENCE.
 *
 * `sensitive` is forwarded so the model can see that a container is
 * opaque (the validator descends into `sensitive` / opaque object subtrees
 * without name-checking — the model is steered to prefer top-level
 * declared outputs anyway, but the flag explains why deeper paths are
 * tolerated when needed).
 *
 * Nested `OutputMeta.fields[]` are deliberately NOT flattened here — keeps
 * the compact catalog compact for the common case and forces the model to
 * use declared top-level names. The full nested tree is still reachable
 * via `getNodeSchema` for an explicit drill-down once the React-agent
 * loop lands.
 */
export interface CatalogOutputField {
  readonly name: string;
  readonly type: string;
  readonly sensitive?: boolean;
}

export interface CatalogActionEntry {
  readonly key: string;
  readonly displayName: string;
  readonly category: ActionCategory;
  readonly riskLevel: RiskLevel;
  readonly isDestructive: boolean;
  readonly requiresConfirmation: boolean;
  readonly requiresIntegration: boolean;
  /**
   * The action's declared config fields in metadata order, with required flag
   * and renderer type. Empty array when the action declares no config fields.
   * Always present so the planner prompt can render a uniform per-node block.
   */
  readonly configFields: readonly CatalogConfigField[];
  /** Static-enum config fields, when any. Omitted when the node has none. */
  readonly configOptions?: readonly CatalogFieldOptions[];
  /**
   * The action's declared top-level output names — what downstream `{{...}}`
   * variable references may safely use. Empty array when the action declares
   * no outputs. Always present so the planner prompt can render a uniform
   * outputs block (Slice 4.AI-16).
   */
  readonly outputs: readonly CatalogOutputField[];
}

export interface CatalogTriggerEntry {
  readonly key: string;
  readonly displayName: string;
  readonly category: ActionCategory;
  readonly activation: TriggerActivation;
  readonly requiresIntegration: boolean;
  /**
   * The trigger's declared config fields in metadata order, with required flag
   * and renderer type. Empty array when the trigger declares no config fields
   * (e.g. `native:manual.run`).
   */
  readonly configFields: readonly CatalogConfigField[];
  /** Static-enum config fields, when any. Omitted when the node has none. */
  readonly configOptions?: readonly CatalogFieldOptions[];
  /**
   * The trigger's declared top-level payload-shape names — what downstream
   * `{{trigger.<name>}}` variable references may safely use. Empty array
   * when the trigger declares no payload (Slice 4.AI-16).
   */
  readonly outputs: readonly CatalogOutputField[];
}

export interface ProviderCatalogEntry {
  readonly id: string;
  readonly displayName: string;
  readonly capabilities: {
    readonly oauth: boolean;
    readonly webhookTrigger: boolean;
    readonly pollingTrigger: boolean;
    readonly actions: boolean;
  };
  readonly isEnabled: boolean;
  readonly isExperimental: boolean;
  readonly hasMetadata: boolean;
  readonly actions: readonly CatalogActionEntry[];
  readonly triggers: readonly CatalogTriggerEntry[];
}

export interface ProviderCatalogView {
  readonly providers: readonly ProviderCatalogEntry[];
}

/**
 * Cap on how many enum values per field are surfaced to the planner — keeps the
 * compact catalog compact even for a field with a long allowlist. The model can
 * still drill into the full field via `getNodeSchema` when the agent loop lands.
 */
const MAX_STATIC_OPTION_VALUES = 24;

/**
 * Pull the static-enum (`options[]`) config fields from a node's metadata.
 * Dynamic (`optionsSource`) fields are skipped — their values aren't known
 * without a live resolver call. Returns `undefined` when the node declares no
 * static-option field, so the entry stays lean.
 */
function extractStaticOptions(
  fields: readonly FieldMeta[],
): readonly CatalogFieldOptions[] | undefined {
  const out: CatalogFieldOptions[] = [];
  for (const f of fields) {
    if (f.options && f.options.length > 0) {
      out.push({
        field: f.name,
        values: f.options.slice(0, MAX_STATIC_OPTION_VALUES).map((o) => o.value),
      });
    }
  }
  return out.length > 0 ? out : undefined;
}

/**
 * Pull the declared config fields off a node's metadata (Slice 4.AI-12D).
 * Metadata-driven and provider-agnostic — every action / trigger gets exactly
 * the names + types + required flags declared in its `fields[]`, preserving
 * registry order. `multiple: true` is forwarded so the planner knows when a
 * config value must be an ARRAY of option values (Slice 4.AI-16).
 */
function extractConfigFields(
  fields: readonly FieldMeta[],
): readonly CatalogConfigField[] {
  return fields.map((f) => ({
    name: f.name,
    type: f.type,
    required: f.required,
    ...(f.multiple === true ? { multiple: true } : {}),
  }));
}

/**
 * Pull the declared TOP-LEVEL output names off a node's metadata (Slice
 * 4.AI-16). Surfaces only `name` + `type` + (when set) `sensitive` — never
 * descends into nested `fields[]`. The full nested tree stays available via
 * `getNodeSchema` for an explicit drill-down once the React-agent loop lands.
 */
function extractOutputs(
  outputs: readonly OutputMeta[],
): readonly CatalogOutputField[] {
  return outputs.map((o) => ({
    name: o.name,
    type: o.type,
    ...(o.sensitive === true ? { sensitive: true } : {}),
  }));
}

function toCatalogAction(m: ActionMeta): CatalogActionEntry {
  const configOptions = extractStaticOptions(m.fields);
  return {
    key: m.key,
    displayName: m.displayName,
    category: m.category,
    riskLevel: m.riskLevel,
    isDestructive: m.isDestructive,
    requiresConfirmation: m.requiresConfirmation,
    requiresIntegration: m.requiresIntegration,
    configFields: extractConfigFields(m.fields),
    ...(configOptions ? { configOptions } : {}),
    outputs: extractOutputs(m.outputs),
  };
}

function toCatalogTrigger(m: TriggerMeta): CatalogTriggerEntry {
  const configOptions = extractStaticOptions(m.fields);
  return {
    key: m.key,
    displayName: m.displayName,
    category: m.category,
    activation: m.activation,
    requiresIntegration: m.requiresIntegration,
    configFields: extractConfigFields(m.fields),
    ...(configOptions ? { configOptions } : {}),
    outputs: extractOutputs(m.payloadShape),
  };
}

/**
 * Compact catalog of every provider the builder can surface, plus the
 * synthetic `native` provider (no manifest, but has metadata). Mirrors the
 * GET /api/providers shape and adds the per-provider action/trigger lists.
 *
 * Deterministic: providers sorted by displayName; actions/triggers preserve
 * the discovery registry's (displayOrder, displayName) order.
 */
export function getProviderCatalog(): AiToolResult<ProviderCatalogView> {
  try {
    const withMeta = new Set(listProvidersWithMetadata());

    const entries: ProviderCatalogEntry[] = listProviders().map((m) => ({
      id: m.id,
      displayName: m.displayName,
      capabilities: { ...m.capabilities },
      isEnabled: m.isEnabled,
      isExperimental: m.isExperimental,
      hasMetadata: withMeta.has(m.id),
      actions: listActionMetasForProvider(m.id).map(toCatalogAction),
      triggers: listTriggerMetasForProvider(m.id).map(toCatalogTrigger),
    }));

    // Connectionless providers have no manifest to iterate, so they are
    // appended explicitly from their metadata.
    for (const [id, displayName] of [
      [NATIVE_PROVIDER_ID, "Native"],
      [AI_PROVIDER_CATALOG_ID, "ChainReact AI"],
    ] as const) {
      if (!withMeta.has(id)) continue;
      entries.push({
        id,
        displayName,
        capabilities: {
          oauth: false,
          webhookTrigger: false,
          pollingTrigger: false,
          actions: true,
        },
        isEnabled: true,
        isExperimental: false,
        hasMetadata: true,
        actions: listActionMetasForProvider(id).map(toCatalogAction),
        triggers: listTriggerMetasForProvider(id).map(toCatalogTrigger),
      });
    }

    entries.sort((a, b) => a.displayName.localeCompare(b.displayName));
    return aiToolOk({ providers: entries });
  } catch {
    return aiToolErr("SERVER_ERROR", "Couldn't build the provider catalog.");
  }
}

// ─── Full single-node metadata views ─────────────────────────────────────────

export interface ActionMetaView {
  readonly key: string;
  readonly provider: string;
  readonly type: string;
  readonly displayName: string;
  readonly description: string;
  readonly category: ActionCategory;
  readonly requiresIntegration: boolean;
  readonly fields: readonly FieldMeta[];
  readonly outputs: readonly OutputMeta[];
  readonly producesFileRef: boolean;
  readonly consumesFileRef: boolean;
  readonly riskLevel: RiskLevel;
  readonly isDestructive: boolean;
  readonly requiresConfirmation: boolean;
  readonly riskDescription: string | null;
}

export interface TriggerMetaView {
  readonly key: string;
  readonly provider: string;
  readonly type: string;
  readonly displayName: string;
  readonly description: string;
  readonly category: ActionCategory;
  readonly activation: TriggerActivation;
  readonly requiresIntegration: boolean;
  readonly fields: readonly FieldMeta[];
  readonly payloadShape: readonly OutputMeta[];
}

/** A `provider:type` lookup key is required — a bare provider id is ambiguous. */
function isLookupKey(key: string): boolean {
  return typeof key === "string" && key.includes(":");
}

function toActionMetaView(m: ActionMeta): ActionMetaView {
  return {
    key: m.key,
    provider: m.provider,
    type: m.type,
    displayName: m.displayName,
    description: m.description,
    category: m.category,
    requiresIntegration: m.requiresIntegration,
    fields: m.fields,
    outputs: m.outputs,
    producesFileRef: m.producesFileRef,
    consumesFileRef: m.consumesFileRef,
    riskLevel: m.riskLevel,
    isDestructive: m.isDestructive,
    requiresConfirmation: m.requiresConfirmation,
    riskDescription: m.riskDescription ?? null,
  };
}

function toTriggerMetaView(m: TriggerMeta): TriggerMetaView {
  return {
    key: m.key,
    provider: m.provider,
    type: m.type,
    displayName: m.displayName,
    description: m.description,
    category: m.category,
    activation: m.activation,
    requiresIntegration: m.requiresIntegration,
    fields: m.fields,
    payloadShape: m.payloadShape,
  };
}

/**
 * Full metadata for one action, by `provider:type` key. Sensitive output
 * flags are preserved verbatim (the agent uses them to drive redaction in
 * downstream run-analysis tools).
 */
export function getActionMeta(key: string): AiToolResult<ActionMetaView> {
  if (!isLookupKey(key)) {
    return aiToolErr(
      "INVALID_INPUT",
      "Expected a 'provider:action' key (e.g. 'slack:send_channel_message').",
    );
  }
  const meta = lookupActionMeta(key);
  if (!meta) {
    return aiToolErr("NOT_FOUND", `No action metadata for '${key}'.`);
  }
  return aiToolOk(toActionMetaView(meta));
}

/** Full metadata for one trigger, by `provider:type` key. */
export function getTriggerMeta(key: string): AiToolResult<TriggerMetaView> {
  if (!isLookupKey(key)) {
    return aiToolErr(
      "INVALID_INPUT",
      "Expected a 'provider:trigger' key (e.g. 'gmail:new_email').",
    );
  }
  const meta = lookupTriggerMeta(key);
  if (!meta) {
    return aiToolErr("NOT_FOUND", `No trigger metadata for '${key}'.`);
  }
  return aiToolOk(toTriggerMetaView(meta));
}

// ─── Schema-facing node view ─────────────────────────────────────────────────

export interface NodeOptionsSourceDep {
  readonly field: string;
  readonly optionsSource: string;
  /**
   * Legacy single-parent view: the sole parent field this options-source
   * cascades from, or null when top-level OR when it has multiple parents
   * (read `dependsOnFields` for the authoritative set).
   */
  readonly dependsOn: string | null;
  /**
   * Authoritative parent list (Slice 4.BUILDER-OPTIONS-1). Empty for a
   * top-level picker; one entry for the common single-parent cascade;
   * multiple for resolvers whose `requiredDeps` span several upstream
   * fields (e.g. `airtable:fields` → `["baseId", "tableIdOrName"]`).
   */
  readonly dependsOnFields: readonly string[];
}

export interface NodeRiskView {
  readonly riskLevel: RiskLevel;
  readonly isDestructive: boolean;
  readonly requiresConfirmation: boolean;
  readonly riskDescription: string | null;
}

export interface NodeSchemaView {
  readonly key: string;
  readonly provider: string;
  readonly type: string;
  readonly kind: "action" | "trigger";
  readonly displayName: string;
  readonly requiresIntegration: boolean;
  readonly fields: readonly FieldMeta[];
  readonly requiredFieldNames: readonly string[];
  readonly optionsSourceDeps: readonly NodeOptionsSourceDep[];
  readonly risk: NodeRiskView;
  /** Present for actions only. */
  readonly outputs?: readonly OutputMeta[];
  /** Present for triggers only. */
  readonly payloadShape?: readonly OutputMeta[];
}

function optionsSourceDeps(fields: readonly FieldMeta[]): NodeOptionsSourceDep[] {
  const out: NodeOptionsSourceDep[] = [];
  for (const f of fields) {
    if (f.optionsSource) {
      const deps = normalizeDependsOn(f.dependsOn);
      out.push({
        field: f.name,
        optionsSource: f.optionsSource,
        // Legacy single-parent field: only set when there's exactly one
        // parent, so existing single-parent consumers are unchanged.
        dependsOn: deps.length === 1 ? deps[0]! : null,
        dependsOnFields: deps,
      });
    }
  }
  return out;
}

/**
 * Schema-facing view for one node type (action OR trigger), by `provider:type`
 * key. Surfaces the field set, required field names, options-source
 * dependencies (for resolver-backed validation later), and risk metadata.
 *
 * Triggers carry no risk fields in V2 — `risk` defaults to low / non-
 * destructive / no-confirmation for them.
 */
export function getNodeSchema(key: string): AiToolResult<NodeSchemaView> {
  if (!isLookupKey(key)) {
    return aiToolErr(
      "INVALID_INPUT",
      "Expected a 'provider:type' key (e.g. 'slack:send_channel_message').",
    );
  }

  const action = lookupActionMeta(key);
  if (action) {
    return aiToolOk({
      key: action.key,
      provider: action.provider,
      type: action.type,
      kind: "action",
      displayName: action.displayName,
      requiresIntegration: action.requiresIntegration,
      fields: action.fields,
      requiredFieldNames: action.fields.filter((f) => f.required).map((f) => f.name),
      optionsSourceDeps: optionsSourceDeps(action.fields),
      risk: {
        riskLevel: action.riskLevel,
        isDestructive: action.isDestructive,
        requiresConfirmation: action.requiresConfirmation,
        riskDescription: action.riskDescription ?? null,
      },
      outputs: action.outputs,
    });
  }

  const trigger = lookupTriggerMeta(key);
  if (trigger) {
    return aiToolOk({
      key: trigger.key,
      provider: trigger.provider,
      type: trigger.type,
      kind: "trigger",
      displayName: trigger.displayName,
      requiresIntegration: trigger.requiresIntegration,
      fields: trigger.fields,
      requiredFieldNames: trigger.fields.filter((f) => f.required).map((f) => f.name),
      optionsSourceDeps: optionsSourceDeps(trigger.fields),
      risk: {
        riskLevel: "low",
        isDestructive: false,
        requiresConfirmation: false,
        riskDescription: null,
      },
      payloadShape: trigger.payloadShape,
    });
  }

  return aiToolErr("NOT_FOUND", `No action or trigger metadata for '${key}'.`);
}
