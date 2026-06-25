import type {
  TemplateDefinition,
  TemplateNode,
  TemplateCardMeta,
  TemplateCategoryKey,
  TemplateTriggerKind,
  TemplateStepSummary,
} from "@/contracts/workflowTemplate";

/**
 * Pure, credential-free card metadata for the Templates marketplace (CS-XT-MARKETPLACE-UX).
 *
 * Mirrors the safety contract of {@link summarizeDefinition} (core/workflows/definitionSummary):
 * it reads ONLY `node.kind` / `node.provider` / `node.type` and the edge wiring — NEVER
 * `node.config` or any value. So everything it returns is safe to surface to the client: the
 * only data that leaves is public catalog facts (provider ids, action/trigger types, counts, a
 * derived category, the trigger kind). No secrets, no config, no account / user / resource ids.
 *
 * This is DISPLAY-ONLY derivation — there is no `category` column. The bucket is a best-effort
 * UI grouping computed from the providers + trigger kind, so the marketplace can offer category
 * chips and a provider filter over 75+ templates without a schema/migration.
 *
 * Client-safe: this module imports only contract TYPES (no server registry, no side effects), so
 * both the repository (server) and the dashboard/card (client) can import its label/category
 * helpers.
 */

const STEP_PREVIEW_CAP = 8;

/** Friendly provider names (the 25 registered providers + the native group). Pure map — no
 *  registry import, so this stays client-safe. Falls back to a prettified id for anything new. */
const PROVIDER_LABELS: Readonly<Record<string, string>> = {
  native: "Built-in",
  slack: "Slack",
  gmail: "Gmail",
  "google-calendar": "Google Calendar",
  "google-docs": "Google Docs",
  "google-drive": "Google Drive",
  "google-sheets": "Google Sheets",
  "google-analytics": "Google Analytics",
  "microsoft-outlook": "Outlook",
  "microsoft-outlook-calendar": "Outlook Calendar",
  "microsoft-onedrive": "OneDrive",
  "microsoft-onenote": "OneNote",
  "microsoft-excel": "Excel",
  "microsoft-teams": "Microsoft Teams",
  notion: "Notion",
  airtable: "Airtable",
  stripe: "Stripe",
  shopify: "Shopify",
  hubspot: "HubSpot",
  github: "GitHub",
  mailchimp: "Mailchimp",
  monday: "monday.com",
  trello: "Trello",
  discord: "Discord",
  dropbox: "Dropbox",
  facebook: "Facebook",
};

/** Title-cased fallback for an unknown provider id ("foo-bar" → "Foo Bar"). */
function prettifyId(id: string): string {
  return id
    .split(/[-_]/)
    .filter(Boolean)
    .map((p) => p.charAt(0).toUpperCase() + p.slice(1))
    .join(" ");
}

/** Friendly provider name for a chip. */
export function providerLabel(id: string): string {
  return PROVIDER_LABELS[id] ?? prettifyId(id);
}

/** Humanize an action/trigger type for the preview chain ("send_channel_message" → "Send channel message"). */
export function humanizeType(type: string): string {
  const cleaned = type.replace(/[._]/g, " ").trim();
  if (!cleaned) return "";
  return cleaned.charAt(0).toUpperCase() + cleaned.slice(1);
}

/** Label for one preview step, e.g. "Slack: Send channel message". */
export function stepLabel(step: TemplateStepSummary): string {
  return `${providerLabel(step.provider)}: ${humanizeType(step.type)}`;
}

export const TRIGGER_KIND_LABELS: Readonly<Record<TemplateTriggerKind, string>> = {
  manual: "Manual",
  scheduled: "Scheduled",
  app: "App-triggered",
};

/** Ordered category list for the marketplace chips (the "All" chip is added by the UI). */
export const TEMPLATE_CATEGORIES: ReadonlyArray<{ key: TemplateCategoryKey; label: string }> = [
  { key: "sales-crm", label: "Sales & CRM" },
  { key: "marketing", label: "Marketing" },
  { key: "ecommerce", label: "Ecommerce" },
  { key: "team-ops", label: "Team Ops" },
  { key: "project-management", label: "Project Management" },
  { key: "dev-engineering", label: "Dev / Engineering" },
  { key: "files-docs", label: "Files & Docs" },
  { key: "reporting", label: "Reporting" },
  { key: "personal-productivity", label: "Personal Productivity" },
];

const CATEGORY_LABELS: Readonly<Record<TemplateCategoryKey, string>> = Object.fromEntries(
  TEMPLATE_CATEGORIES.map((c) => [c.key, c.label]),
) as Record<TemplateCategoryKey, string>;

export function categoryLabel(key: TemplateCategoryKey): string {
  return CATEGORY_LABELS[key] ?? key;
}

/**
 * Best-effort category from the template's providers + trigger kind. Priority order puts the
 * MEANINGFUL business provider (CRM / commerce / marketing / dev) ahead of the delivery channel
 * (Slack / Teams), so "HubSpot → Slack" classifies as Sales & CRM, not Team Ops. Deterministic
 * and pure — documented as a display heuristic, never authoritative.
 */
function classifyCategory(
  providers: readonly string[],
  triggerKind: TemplateTriggerKind,
): TemplateCategoryKey {
  const has = (p: string) => providers.includes(p);
  if (has("google-analytics")) return "reporting";
  if (has("shopify") || has("stripe")) return "ecommerce";
  if (has("hubspot")) return "sales-crm";
  if (has("mailchimp") || has("facebook")) return "marketing";
  if (has("github")) return "dev-engineering";
  if (has("trello") || has("monday")) return "project-management";
  if (
    has("google-drive") ||
    has("dropbox") ||
    has("microsoft-onedrive") ||
    has("google-docs") ||
    has("microsoft-onenote") ||
    has("notion")
  ) {
    return "files-docs";
  }
  if (has("slack") || has("microsoft-teams") || has("discord")) return "team-ops";
  if (triggerKind === "scheduled") return "reporting";
  if (triggerKind === "manual") return "personal-productivity";
  return "team-ops";
}

function triggerKindOf(provider: string | undefined, type: string | undefined): TemplateTriggerKind {
  if (provider === "native" && type === "manual.run") return "manual";
  if (provider === "native" && type === "schedule.fired") return "scheduled";
  return "app";
}

/** Walk the graph from the trigger following edges, so the preview reads in execution order.
 *  Linear templates resolve exactly; branches/leftovers are appended in array order. */
function orderedNodes(def: TemplateDefinition): TemplateNode[] {
  const nodes: TemplateNode[] = def.nodes ?? [];
  if (nodes.length === 0) return [];
  const byId = new Map<string, TemplateNode>(nodes.map((n) => [n.id, n]));
  const adj = new Map<string, string[]>();
  for (const e of def.edges ?? []) {
    const arr = adj.get(e.from) ?? [];
    arr.push(e.to);
    adj.set(e.from, arr);
  }
  const start: TemplateNode = nodes.find((n) => n.kind === "trigger") ?? nodes[0]!;
  const out: TemplateNode[] = [];
  const seen = new Set<string>();
  let cur: TemplateNode | undefined = start;
  while (cur && !seen.has(cur.id) && out.length < STEP_PREVIEW_CAP) {
    out.push(cur);
    seen.add(cur.id);
    const nextId: string | undefined = (adj.get(cur.id) ?? []).find((id) => !seen.has(id));
    cur = nextId ? byId.get(nextId) : undefined;
  }
  for (const n of nodes) {
    if (out.length >= STEP_PREVIEW_CAP) break;
    if (!seen.has(n.id)) {
      out.push(n);
      seen.add(n.id);
    }
  }
  return out;
}

/**
 * Derive the safe card metadata from a (credential-free) template definition. Reads no config.
 * `providers` excludes the `native` provider (it is not a "required app"); `category` is the
 * display heuristic above.
 */
export function deriveTemplateCardMeta(def: TemplateDefinition): TemplateCardMeta {
  const nodes = def.nodes ?? [];
  const ordered = orderedNodes(def);
  const trigger = nodes.find((n) => n.kind === "trigger");
  const triggerKind = triggerKindOf(trigger?.provider, trigger?.type);

  const providers: string[] = [];
  for (const n of ordered) {
    if (n.provider && n.provider !== "native" && !providers.includes(n.provider)) {
      providers.push(n.provider);
    }
  }

  const steps: TemplateStepSummary[] = ordered.map((n) => ({
    kind: n.kind === "trigger" ? "trigger" : "action",
    provider: n.provider,
    type: n.type,
  }));

  return {
    nodeCount: nodes.length,
    stepCount: nodes.filter((n) => n.kind !== "trigger").length,
    triggerKind,
    providers,
    category: classifyCategory(providers, triggerKind),
    steps,
  };
}
