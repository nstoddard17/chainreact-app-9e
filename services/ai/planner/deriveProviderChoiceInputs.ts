/**
 * Slice 4.AI-35 — deterministic provider-choice derivation.
 *
 * Closes the React Agent QA gap where a generic-category request ("when I get
 * an email…") correctly triggered an ambiguity question, but the question
 * rendered as a STATIC bullet ("Which email app — Gmail or Outlook?") instead
 * of a selectable control. This module turns that ambiguity into a STRUCTURED
 * `provider_choice` required-input entry with `options`, so the React Agent
 * renders a choice control (dropdown/select) and the user never has to type a
 * provider name.
 *
 * Generic + metadata-driven over a small category table (email / calendar /
 * drive / chat). Pure — no model, no I/O. Conservative: only fires when
 *   (a) the request hits a category's tokens,
 *   (b) the user did NOT already name one of that category's providers, AND
 *   (c) ≥2 of the category's providers exist in the catalog
 * so a non-ambiguous request (single provider available, or provider named) is
 * never second-guessed. Mirrors the ambiguity decision the AI-30 narrowing
 * helper + AI-33 R1 prompt rule already make — this only adds the STRUCTURED
 * control affordance on top.
 */

import type { ProviderCatalogView } from "@/services/ai/tools/providerCatalog";
import type { PlanRequiredUserInput } from "./types";

interface CategoryProvider {
  readonly id: string;
  readonly label: string;
  /** Lowercased name/alias substrings that count as "the user named this provider". */
  readonly aliases: readonly string[];
}

interface AmbiguousCategory {
  readonly category: string;
  /** Lowercased capability tokens that imply this category. */
  readonly tokens: readonly string[];
  readonly providers: readonly CategoryProvider[];
}

/**
 * Category → candidate providers. Kept narrow + conservative; the tokens
 * mirror `narrowProvidersForPlan`'s ambiguous tables. "chat" tokens are
 * deliberately specific ("chat app" / "team chat") because bare "message"
 * is far too common in English to treat as a category signal.
 */
const AMBIGUOUS_CATEGORIES: readonly AmbiguousCategory[] = [
  {
    category: "email",
    tokens: ["email", "emails", "e-mail", "e mail", "new mail", "inbox"],
    providers: [
      { id: "gmail", label: "Gmail", aliases: ["gmail", "google mail", "googlemail"] },
      {
        id: "microsoft-outlook",
        label: "Microsoft Outlook",
        aliases: ["outlook", "microsoft outlook", "ms outlook", "office 365 mail", "o365 mail"],
      },
    ],
  },
  {
    category: "calendar",
    tokens: ["calendar", "calendar event", "calendar invite", "meeting invite"],
    providers: [
      { id: "google-calendar", label: "Google Calendar", aliases: ["google calendar", "gcal", "google cal"] },
      {
        id: "microsoft-outlook-calendar",
        label: "Outlook Calendar",
        aliases: ["outlook calendar", "outlook cal", "ms outlook calendar"],
      },
    ],
  },
  {
    category: "drive",
    tokens: ["file storage", "cloud storage", "save a file", "upload a file", "store a file"],
    providers: [
      { id: "google-drive", label: "Google Drive", aliases: ["google drive", "gdrive", "g drive"] },
      { id: "microsoft-onedrive", label: "OneDrive", aliases: ["onedrive", "one drive"] },
      { id: "dropbox", label: "Dropbox", aliases: ["dropbox", "drop box"] },
    ],
  },
  {
    category: "chat",
    tokens: ["chat app", "team chat", "messaging app", "chat message to my team"],
    providers: [
      { id: "slack", label: "Slack", aliases: ["slack"] },
      { id: "discord", label: "Discord", aliases: ["discord"] },
      { id: "microsoft-teams", label: "Microsoft Teams", aliases: ["microsoft teams", "ms teams", "msteams", "teams"] },
    ],
  },
];

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Word-boundary-ish substring match (mirrors narrowProvidersForPlan.containsAlias). */
function contains(haystack: string, needle: string): boolean {
  if (needle.length === 0) return false;
  if (/[^a-z0-9]/.test(needle)) return haystack.includes(needle);
  return new RegExp(`(^|[^a-z0-9])${escapeRegex(needle)}([^a-z0-9]|$)`, "i").test(haystack);
}

/**
 * Derive `provider_choice` entries for every ambiguous category the request
 * hits without naming a provider. Returns `[]` when nothing is ambiguous.
 *
 * @param userRequest the raw user prompt.
 * @param catalog the (full) provider catalog — used to keep only providers
 *   that actually exist as options.
 */
export function deriveProviderChoiceInputs(
  userRequest: string,
  catalog: ProviderCatalogView,
): readonly PlanRequiredUserInput[] {
  const request = (userRequest ?? "").toLowerCase().trim();
  if (request.length === 0) return [];
  const catalogIds = new Set(catalog.providers.map((p) => p.id));

  const out: PlanRequiredUserInput[] = [];
  for (const cat of AMBIGUOUS_CATEGORIES) {
    const tokenHit = cat.tokens.some((t) => contains(request, t));
    if (!tokenHit) continue;

    const available = cat.providers.filter((p) => catalogIds.has(p.id));
    if (available.length < 2) continue; // not ambiguous if <2 real options

    const namedAlready = available.some(
      (p) => contains(request, p.id) || p.aliases.some((a) => contains(request, a)),
    );
    if (namedAlready) continue; // user resolved it — no choice needed

    const labels = available.map((p) => p.label);
    out.push({
      label: `Which ${cat.category} app should this use — ${labels.join(" or ")}?`,
      kind: "provider_choice",
      category: cat.category,
      options: available.map((p) => ({ label: p.label, value: p.id })),
      allowFreeText: false,
    });
  }
  return out;
}
