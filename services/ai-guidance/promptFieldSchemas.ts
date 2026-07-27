/**
 * Narrowed, bounded FIELD-SCHEMA block for the guidance prompt (REACT-CONFIG-COVERAGE-1).
 *
 * The gateway prompt's capability catalog stays a compact keys-only list (the narrowing strategy is
 * deliberately preserved). But keys alone left the model blind to each node's CONFIG FIELDS, so a
 * user-supplied constraint ("from vendor@example.com") had no field to land in. This module renders
 * the full declared field schema — required AND optional, Setup AND Advanced, static options,
 * dynamic-options and dependency markers — for a BOUNDED, RELEVANT subset of providers:
 *
 *   priority 1: providers already on the user's canvas (edit context),
 *   priority 2: providers named in the user's own words (id/display-name token match),
 *   priority 3: providers whose CATALOG CATEGORY matches words in the request (category synonyms
 *               are generic, metadata-level — never per-provider hacks),
 *   priority 4: providers the account already has connected,
 *   always:     the synthetic `native` provider (manual/scheduled triggers, logic).
 *
 * Bounded by MAX_FIELD_SCHEMA_PROVIDERS / MAX_FIELD_SCHEMA_NODES so the packet stays compact.
 * Everything rendered is PUBLIC registry metadata (field keys/types/flags/static option values) —
 * never user data, config values, credentials, or ids.
 *
 * Derivation is 100% metadata-driven from the SAME discovery registry that drives the builder,
 * readiness, and patch validation — no second hand-maintained AI field list (Part C contract; the
 * structural coverage test pins that every declared field renders).
 */

import type { ActionCategory, FieldMeta } from "@/contracts/actionMeta";
import { listProviders } from "@/integrations/_registry";
import {
  listActionMetasForProvider,
  listProvidersWithMetadata,
  listTriggerMetasForProvider,
} from "@/services/discovery/_registry";
import { buildWordSet, isProviderMentioned } from "./providerVocabulary";

export const MAX_FIELD_SCHEMA_PROVIDERS = 12;
export const MAX_FIELD_SCHEMA_NODES = 80;
const MAX_RENDERED_OPTION_VALUES = 8;

/**
 * REACT-AGENT-PLAN-GENERATION-REGRESSION-AUDIT-1 — hard LINE bound for the outputs block. The node
 * cap alone let the block reach ~650 lines / ~61k chars for an ordinary four-provider request (61%
 * of the whole prompt), burying the response contract. Providers arrive priority-ordered (canvas →
 * explicitly named → category match → connected), so the cap drops the least-relevant tail first,
 * and the truncation is marked in the block instead of silent.
 */
export const MAX_OUTPUT_SCHEMA_LINES = 240;

/** Honest truncation marker — the model must know the outputs list is bounded, not exhaustive. */
export const OUTPUT_SCHEMA_TRUNCATION_LINE =
  "  - …(outputs for further capabilities omitted for space — those capabilities still exist in the catalog)";

const NATIVE_PROVIDER_ID = "native";

/** Generic, CATEGORY-level synonym map (registry categories — never provider-specific keywords). */
const CATEGORY_SYNONYMS: Readonly<Record<string, readonly string[]>> = {
  email: ["email", "emails", "e-mail", "mail", "inbox"],
  messaging: ["message", "messages", "chat", "channel", "dm", "notify", "notification"],
  calendar: ["calendar", "event", "events", "meeting", "appointment"],
  files: ["file", "files", "folder", "document", "upload", "attachment"],
  crm: ["crm", "contact", "contacts", "lead", "leads", "deal", "deals", "ticket", "pipeline"],
  marketing: ["campaign", "subscriber", "subscribers", "newsletter", "audience"],
  commerce: ["order", "orders", "payment", "payments", "invoice", "checkout", "refund"],
  data: ["record", "records", "row", "rows", "table", "database", "sheet", "spreadsheet"],
  scheduling: ["schedule", "scheduled", "daily", "weekly", "hourly", "cron"],
  developer: ["webhook", "api"],
};

export interface SelectRelevantProvidersInput {
  /** The user's own words (goal text + recent turns). Matched as lowercase word tokens. */
  readonly texts: readonly string[];
  /** Capability keys of nodes on the current canvas (edit context), e.g. "slack:send_channel_message". */
  readonly canvasCapabilityKeys?: readonly string[];
  /** Providers the account has connected (shared + own). */
  readonly connectedProviders?: readonly string[];
}

/** Categories a provider's registered nodes span. */
function providerCategories(providerId: string): Set<ActionCategory> {
  const cats = new Set<ActionCategory>();
  for (const m of listActionMetasForProvider(providerId)) cats.add(m.category);
  for (const m of listTriggerMetasForProvider(providerId)) cats.add(m.category);
  return cats;
}

/**
 * Pick the bounded, priority-ordered provider subset whose field schemas the prompt should carry.
 * Deterministic; registry + input driven only.
 */
export function selectRelevantProviders(input: SelectRelevantProvidersInput): readonly string[] {
  const withMeta = new Set(listProvidersWithMetadata());
  const words = buildWordSet(input.texts);

  const canvas: string[] = [];
  for (const key of input.canvasCapabilityKeys ?? []) {
    const idx = key.indexOf(":");
    if (idx > 0) canvas.push(key.slice(0, idx));
  }

  const mentioned: string[] = [];
  const byCategory: string[] = [];
  for (const manifest of listProviders()) {
    if (!withMeta.has(manifest.id)) continue;
    if (isProviderMentioned(manifest.id, manifest.displayName, words)) {
      mentioned.push(manifest.id);
      continue;
    }
    for (const cat of providerCategories(manifest.id)) {
      const synonyms = CATEGORY_SYNONYMS[cat] ?? [];
      if (synonyms.some((s) => words.has(s))) {
        byCategory.push(manifest.id);
        break;
      }
    }
  }

  const ordered = [
    ...canvas,
    ...mentioned,
    ...byCategory,
    ...(input.connectedProviders ?? []),
    ...(withMeta.has(NATIVE_PROVIDER_ID) ? [NATIVE_PROVIDER_ID] : []),
  ];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const id of ordered) {
    if (seen.has(id) || !withMeta.has(id)) continue;
    seen.add(id);
    out.push(id);
    if (out.length >= MAX_FIELD_SCHEMA_PROVIDERS) break;
  }
  return out;
}

/** Render ONE field as a compact, complete schema fragment. Public metadata only. */
export function renderFieldSchemaFragment(f: FieldMeta): string {
  const parts: string[] = [f.type];
  parts.push(f.required ? "required" : "optional");
  if (f.advanced === true) parts.push("advanced");
  if (f.multiple === true) parts.push("multiple");
  if (f.options && f.options.length > 0) {
    const values = f.options.slice(0, MAX_RENDERED_OPTION_VALUES).map((o) => o.value);
    const more = f.options.length > MAX_RENDERED_OPTION_VALUES ? "|…" : "";
    parts.push(`one of: ${values.join("|")}${more}`);
  }
  if (f.optionsSource) parts.push("dynamic options — use the user's words; ChainReact resolves or asks");
  if (f.dependsOn) {
    const deps = Array.isArray(f.dependsOn) ? f.dependsOn : [f.dependsOn];
    parts.push(`after: ${deps.join(",")}`);
  }
  if (f.visibleWhen) parts.push(`only when ${f.visibleWhen.field} matches`);
  if (
    f.defaultValue !== undefined &&
    (typeof f.defaultValue === "string" || typeof f.defaultValue === "number" || typeof f.defaultValue === "boolean")
  ) {
    parts.push(`default: ${String(f.defaultValue)}`);
  }
  return `${f.name} (${parts.join(", ")})`;
}

interface OutputLike {
  readonly name: string;
  readonly type: string;
  readonly description?: string | undefined;
  readonly nullable?: boolean | undefined;
  readonly sensitive?: boolean | undefined;
  readonly fields?:
    | readonly { readonly name: string; readonly type: string; readonly nullable?: boolean | undefined }[]
    | undefined;
}

/** Render ONE declared output (plus one level of nested fields) as dotted, referenceable paths. */
function renderOutputLines(o: OutputLike): string[] {
  const parts: string[] = [o.type];
  if (o.nullable === true) parts.push("nullable");
  if (o.sensitive === true) parts.push("sensitive");
  const desc = o.description ? ` — ${o.description}` : "";
  const lines = [`      · ${o.name} (${parts.join(", ")})${desc}`];
  // One nesting level only: deeper trees add prompt weight faster than they add mappable paths.
  for (const child of o.fields ?? []) {
    lines.push(`      · ${o.name}.${child.name} (${child.type}${child.nullable === true ? ", nullable" : ""})`);
  }
  return lines;
}

/**
 * REACT-AGENT-MULTISTEP-DATA-MAPPING-1 — render what each node PRODUCES.
 *
 * The gap this closes: the prompt told the model "when the user wants a value from an earlier step,
 * use a {{...}} reference to a declared output name" — and then never showed it a single output name.
 * Fields (inputs) were rendered; outputs were rendered nowhere. Faced with a required Email field and
 * no knowledge that anything upstream produces an email, the model did the only thing left to it and
 * invented `subscriber@example.com`. The multi-step mapping failure was not a reasoning error; it was
 * missing data in the contract.
 *
 * Metadata-driven from the same registry as everything else — a trigger's `payloadShape` and an
 * action's `outputs` — so it generalizes to every provider with no per-provider knowledge. Public
 * metadata only: names, types, nullability, descriptions. Never values or user data. `sensitive`
 * outputs ARE listed (they are flowable downstream — that is the point of mapping them) with the flag
 * rendered so the model knows the content is respondent/customer data.
 */
export function buildOutputSchemaLines(providerIds: readonly string[]): readonly string[] {
  // TRIGGERS FIRST, across ALL providers: a trigger's payload is the root of every {{...}} mapping
  // chain, so trigger outputs must never lose their prompt space to an earlier provider's long
  // action list (the bug that cut typeform's trigger while keeping every gmail action). Actions
  // follow, still in the caller's priority order, until the line bound.
  const metas: { key: string; kind: string; outputs: readonly OutputLike[] }[] = [
    ...providerIds.flatMap((providerId) =>
      listTriggerMetasForProvider(providerId).map((m) => ({
        key: m.key,
        kind: "trigger",
        outputs: (m.payloadShape ?? []) as readonly OutputLike[],
      })),
    ),
    ...providerIds.flatMap((providerId) =>
      listActionMetasForProvider(providerId).map((m) => ({
        key: m.key,
        kind: "action",
        outputs: (m.outputs ?? []) as readonly OutputLike[],
      })),
    ),
  ];
  const lines: string[] = [];
  let nodes = 0;
  for (const meta of metas) {
    if (nodes >= MAX_FIELD_SCHEMA_NODES) {
      lines.push(OUTPUT_SCHEMA_TRUNCATION_LINE);
      return lines;
    }
    nodes += 1;
    if (meta.outputs.length === 0) continue;
    const rendered = [`  - ${meta.key} [${meta.kind}] produces:`];
    for (const o of meta.outputs) rendered.push(...renderOutputLines(o));
    // Line bound: never start a node we can't fit; mark the cut instead of truncating silently.
    if (lines.length + rendered.length > MAX_OUTPUT_SCHEMA_LINES) {
      lines.push(OUTPUT_SCHEMA_TRUNCATION_LINE);
      return lines;
    }
    lines.push(...rendered);
  }
  return lines;
}

/**
 * Render the field-schema lines for the selected providers — every registered node, every declared
 * field (the coverage test pins completeness per rendered node). Bounded by MAX_FIELD_SCHEMA_NODES.
 */
export function buildFieldSchemaLines(providerIds: readonly string[]): readonly string[] {
  const lines: string[] = [];
  let nodes = 0;
  for (const providerId of providerIds) {
    const metas = [
      ...listTriggerMetasForProvider(providerId).map((m) => ({ key: m.key, kind: "trigger", fields: m.fields })),
      ...listActionMetasForProvider(providerId).map((m) => ({ key: m.key, kind: "action", fields: m.fields })),
    ];
    for (const meta of metas) {
      if (nodes >= MAX_FIELD_SCHEMA_NODES) return lines;
      nodes += 1;
      const fields = meta.fields.map(renderFieldSchemaFragment).join("; ");
      lines.push(`  - ${meta.key} [${meta.kind}]${fields ? ` — fields: ${fields}` : " — no config fields"}`);
    }
  }
  return lines;
}
