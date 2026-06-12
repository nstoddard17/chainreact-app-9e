/**
 * Internal MCP server — static option-source diagnostics (Stage 2A, CS-2).
 *
 *   diagnose_option_source                  → explain a builder options-source
 *                                             key + map the closed
 *                                             OptionsSourceErrorCode taxonomy to
 *                                             likely cause + next checks.
 *   explain_provider_connection_requirements → what a provider needs to be
 *                                             connected & usable (scopes, auth
 *                                             flow, refreshable) + which option
 *                                             sources depend on it.
 *
 * STATIC + repo-only. These read two committed text files through the shared
 * `readAllowedFile` seam:
 *   - the GENERATED option-source manifest (scripts/mcp/data/...json), kept in
 *     sync with services/options/_registry.ts by a drift test. The MCP server
 *     reads it as JSON text — it NEVER imports getOptionsResolver or app code.
 *   - the provider manifest, TEXT-PARSED (never executed) via manifestSummary.
 *
 * No live `/api/options` call, no session, no DB. The tool maps an OBSERVED
 * error code (pasted by the dev, or read from a smoke artifact) to causes — it
 * does not itself reach a provider.
 */
import {
  INTEGRATIONS_DIR,
  MCP_DATA_DIR,
  OPTION_SOURCE_MANIFEST_FILE,
} from "../config";
import { readAllowedFile } from "../lib/files";
import {
  renderConnectionRequirements,
  summarizeManifestText,
} from "../lib/manifestSummary";
import type { ToolDefinition } from "../registry";

interface ManifestEntry {
  source: string;
  provider: string;
  requiresIntegration: boolean;
  requiredDeps: string[] | null;
}

interface OptionSourceManifest {
  sources?: ManifestEntry[];
}

/**
 * The closed OptionsSourceErrorCode taxonomy (mirrors services/options/types.ts
 * `OptionsSourceErrorCode`). Kept here as static text so the tool needs no app
 * import; an exhaustiveness drift test
 * (tests/unit/mcp/diagnose-tools.test.ts) compares these keys to the app's
 * runtime `ALL_OPTIONS_SOURCE_ERROR_CODES`, so a new code can't land silently.
 */
export const OPTION_SOURCE_DIAGNOSES: Record<
  string,
  { cause: string; nextChecks: string[] }
> = {
  UNAUTHENTICATED: {
    cause:
      "No authenticated session reached the options route (HTTP 401). The builder call went out without a valid session.",
    nextChecks: [
      "Confirm the user is signed in and the builder request carries the session cookie.",
      "This is an auth/session problem, not a provider or scope problem.",
    ],
  },
  SOURCE_NOT_FOUND: {
    cause:
      "The options-source key is not registered in services/options/_registry.ts (getOptionsResolver returned undefined).",
    nextChecks: [
      "Check the source key spelling against the registered sources (this tool lists them).",
      "If the resolver should exist, confirm it's imported AND added to ALL_OPTIONS_RESOLVERS.",
    ],
  },
  MISSING_DEPENDENCY: {
    cause:
      "A required dependsOn parent field was empty when the picker loaded, so the route short-circuited before any integration lookup.",
    nextChecks: [
      "Confirm the parent field(s) this source declares are filled in first (cascade order).",
      "Empty/whitespace parent values count as missing — the builder must send a non-empty dep value.",
    ],
  },
  INTEGRATION_DISCONNECTED: {
    cause:
      "No active integration row exists for the resolving account/provider (the connection is missing or was disconnected).",
    nextChecks: [
      "Verify the provider is connected for the account that owns the workflow (Apps page → connected state).",
      "Account/service providers resolve against the workflow's account; a personal-provider creator path returns OWNER_MUST_CONNECT instead.",
    ],
  },
  PROVIDER_ERROR: {
    cause:
      "The provider was reached but returned a logical failure (e.g. invalid_auth / missing_scope). The raw provider error code is intentionally hidden from the picker.",
    nextChecks: [
      "Most often a MISSING OAUTH SCOPE or an expired/revoked token — compare the connected token's scopes to the provider's required scopes (use explain_provider_connection_requirements).",
      "If a scope is missing, reconnect the provider to re-consent with the current scope set.",
      "For non-refreshable providers an expired token also surfaces here — reconnect.",
    ],
  },
  SERVER_ERROR: {
    cause:
      "An unclassified failure inside the route/resolver (network, token decrypt, or decode) downgraded to SERVER_ERROR.",
    nextChecks: [
      "Check server logs for the resolver call; this is not a user-config problem.",
      "Transient network/provider blips also land here — retry once before deeper digging.",
    ],
  },
  NOT_WORKFLOW_OWNER: {
    cause:
      "A non-creator is editing a team workflow whose step uses a PERSONAL-credential provider. Execution runs under the owner's connection, so no resolver runs and no resource labels are fetched.",
    nextChecks: [
      "This is expected by the credential-sharing policy — only the workflow owner can configure these pickers.",
      "Ask the workflow owner to set up the field, or use an account/service provider instead.",
    ],
  },
  OWNER_MUST_CONNECT: {
    cause:
      "The workflow CREATOR is editing but has no active connection for this personal-credential provider (mirrors the execution-time 'connect to run' failure).",
    nextChecks: [
      "The creator must connect the provider on their own account before the picker resolves.",
      "Distinct from INTEGRATION_DISCONNECTED: this is the creator-pinned personal-provider path.",
    ],
  },
  UNKNOWN: {
    cause:
      "A catch-all code the client uses when it can't map the response to a known state.",
    nextChecks: [
      "Treat as SERVER_ERROR for triage — inspect the actual response body shape and server logs.",
    ],
  },
};

/** Stable display order for the full taxonomy dump. */
const CODE_ORDER: readonly string[] = [
  "SOURCE_NOT_FOUND",
  "MISSING_DEPENDENCY",
  "UNAUTHENTICATED",
  "INTEGRATION_DISCONNECTED",
  "OWNER_MUST_CONNECT",
  "NOT_WORKFLOW_OWNER",
  "PROVIDER_ERROR",
  "SERVER_ERROR",
  "UNKNOWN",
];

function loadManifest(): { ok: true; entries: ManifestEntry[] } | { ok: false; message: string } {
  let text: string;
  try {
    text = readAllowedFile(OPTION_SOURCE_MANIFEST_FILE, [MCP_DATA_DIR]).text;
  } catch {
    return {
      ok: false,
      message: `Option-source manifest not found at ${OPTION_SOURCE_MANIFEST_FILE}. Regenerate it (see the manifest drift test).`,
    };
  }
  try {
    const parsed = JSON.parse(text) as OptionSourceManifest;
    if (!Array.isArray(parsed.sources)) {
      return { ok: false, message: "Option-source manifest has no `sources` array." };
    }
    return { ok: true, entries: parsed.sources };
  } catch {
    return { ok: false, message: "Option-source manifest is not valid JSON." };
  }
}

function renderCodeBlock(code: string, entry: ManifestEntry | null): string {
  const d = OPTION_SOURCE_DIAGNOSES[code];
  if (!d) return `  ${code}: (no diagnosis available)`;
  const lines = [`${code}`, `  cause: ${d.cause}`];
  for (const c of d.nextChecks) lines.push(`  next: ${c}`);
  // Contextual notes when a code can't apply to this specific source.
  if (entry) {
    if (code === "MISSING_DEPENDENCY" && (!entry.requiredDeps || entry.requiredDeps.length === 0)) {
      lines.push("  note: this source declares NO required deps — this code should not occur for it.");
    }
    if (
      (code === "INTEGRATION_DISCONNECTED" ||
        code === "PROVIDER_ERROR" ||
        code === "OWNER_MUST_CONNECT" ||
        code === "NOT_WORKFLOW_OWNER") &&
      !entry.requiresIntegration
    ) {
      lines.push("  note: this source does NOT require an integration — credential/provider codes should not occur for it.");
    }
  }
  return lines.join("\n");
}

function diagnoseOptionSource(args: Record<string, unknown>): string {
  const source = typeof args.source === "string" ? args.source.trim() : "";
  if (!source) return "Error: 'source' is required (e.g. 'slack:channels').";
  const codeArg = typeof args.code === "string" ? args.code.trim().toUpperCase() : "";

  const loaded = loadManifest();
  if (!loaded.ok) return loaded.message;
  const entry = loaded.entries.find((e) => e.source === source) ?? null;

  const header: string[] = [];
  if (!entry) {
    const sameProvider = loaded.entries
      .filter((e) => e.source.split(":")[0] === source.split(":")[0])
      .map((e) => e.source);
    header.push(`source: ${source}`);
    header.push("registered: NO — this is not a known options source (would return SOURCE_NOT_FOUND).");
    header.push(
      sameProvider.length
        ? `did you mean one of: ${sameProvider.join(", ")}`
        : "no registered sources share this provider prefix.",
    );
  } else {
    header.push(`source: ${entry.source}`);
    header.push("registered: YES");
    header.push(`provider: ${entry.provider}`);
    header.push(
      `requiresIntegration: ${entry.requiresIntegration}` +
        (entry.requiresIntegration
          ? ` (needs an active ${entry.provider} connection on the resolving account)`
          : " (no connection needed)"),
    );
    header.push(
      `requiredDeps: ${
        entry.requiredDeps && entry.requiredDeps.length
          ? entry.requiredDeps.join(", ")
          : "(none — top-level picker)"
      }`,
    );
  }

  // Specific code requested.
  if (codeArg) {
    if (!OPTION_SOURCE_DIAGNOSES[codeArg]) {
      return [
        ...header,
        "",
        `Unknown error code '${codeArg}'. Known codes: ${CODE_ORDER.join(", ")}.`,
      ].join("\n");
    }
    return [...header, "", "observed code:", renderCodeBlock(codeArg, entry)].join("\n");
  }

  // Full decision guide.
  const blocks = CODE_ORDER.map((c) => renderCodeBlock(c, entry));
  return [
    ...header,
    "",
    "Error-code guide (pass `code` to focus one):",
    "",
    blocks.join("\n\n"),
  ].join("\n");
}

function explainProviderConnectionRequirements(args: Record<string, unknown>): string {
  const raw = typeof args.provider === "string" ? args.provider.trim() : "";
  if (!raw) return "Error: 'provider' is required (e.g. 'slack').";
  if (!/^[a-z][a-z0-9_-]*$/.test(raw)) {
    return `Error: invalid provider id '${raw}'.`;
  }
  const rel = `${INTEGRATIONS_DIR}/${raw}/manifest.ts`;
  let text: string;
  try {
    text = readAllowedFile(rel, [INTEGRATIONS_DIR]).text;
  } catch {
    return `Error: no manifest found for provider '${raw}'. Use list_provider_manifests.`;
  }
  const summary = summarizeManifestText(raw, text);

  // Which registered option sources depend on this provider's connection.
  let optionSources: string[] = [];
  const loaded = loadManifest();
  if (loaded.ok) {
    optionSources = loaded.entries
      .filter((e) => e.provider === raw && e.requiresIntegration)
      .map((e) => e.source)
      .sort();
  }

  return renderConnectionRequirements(summary, optionSources);
}

export const diagnosisTools: ToolDefinition[] = [
  {
    name: "diagnose_option_source",
    description:
      "Static diagnosis of a builder options-source key (e.g. 'slack:channels'): registration status, provider, requiresIntegration, requiredDeps, and the closed error-code taxonomy mapped to likely cause + next checks. Pass optional 'code' to focus one. Read-only; no live call.",
    inputSchema: {
      type: "object",
      properties: {
        source: {
          type: "string",
          description: "Options-source key, '<provider>:<resource>', e.g. 'slack:channels'.",
        },
        code: {
          type: "string",
          description:
            "Optional observed OptionsSourceErrorCode (e.g. 'PROVIDER_ERROR') to focus the explanation.",
        },
      },
      required: ["source"],
      additionalProperties: false,
    },
    handler: diagnoseOptionSource,
  },
  {
    name: "explain_provider_connection_requirements",
    description:
      "What a provider needs to be connected & usable: enabled state, auth flow, token scope, refreshable, required/optional OAuth scopes, and which builder option-sources require the connection. Manifest is TEXT-PARSED, never executed.",
    inputSchema: {
      type: "object",
      properties: {
        provider: {
          type: "string",
          description: "Provider folder id, e.g. 'slack', 'gmail'.",
        },
      },
      required: ["provider"],
      additionalProperties: false,
    },
    handler: explainProviderConnectionRequirements,
  },
];
