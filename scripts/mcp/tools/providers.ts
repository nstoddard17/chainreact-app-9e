/**
 * Internal MCP server — provider metadata tools.
 *
 *   list_provider_manifests        → provider folders that contain a manifest.ts
 *   get_provider_manifest_summary  → text-parsed capability summary for one provider
 *
 * Manifests are read as TEXT and never imported/executed (see manifestSummary.ts).
 */
import { readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { INTEGRATIONS_DIR } from "../config";
import { readAllowedFile } from "../lib/files";
import {
  renderManifestSummary,
  summarizeManifestText,
} from "../lib/manifestSummary";
import { resolveAllowedPath } from "../security/paths";
import type { ToolDefinition } from "../registry";

/** List provider folder ids that have a `manifest.ts`. */
function listProviderIds(): string[] {
  const dirAbs = resolveAllowedPath(INTEGRATIONS_DIR, [INTEGRATIONS_DIR]);
  let entries: string[];
  try {
    entries = readdirSync(dirAbs);
  } catch {
    return [];
  }
  const ids: string[] = [];
  for (const name of entries) {
    if (name.startsWith("_") || name.startsWith(".")) continue;
    const childAbs = join(dirAbs, name);
    let isDir = false;
    try {
      isDir = statSync(childAbs).isDirectory();
    } catch {
      continue;
    }
    if (!isDir) continue;
    try {
      statSync(join(childAbs, "manifest.ts"));
      ids.push(name);
    } catch {
      // No manifest — provider folder without a manifest is skipped.
    }
  }
  return ids.sort();
}

function listProviderManifests(): string {
  const ids = listProviderIds();
  if (!ids.length) return "No provider manifests found.";
  return `Provider manifests (${ids.length}):\n${ids.map((id) => `- ${id}`).join("\n")}`;
}

function getProviderManifestSummary(args: Record<string, unknown>): string {
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
  return renderManifestSummary(summary);
}

export const providerTools: ToolDefinition[] = [
  {
    name: "list_provider_manifests",
    description:
      "List provider integration ids under integrations/ that ship a manifest.ts. Read-only; folder scan only.",
    inputSchema: { type: "object", properties: {}, additionalProperties: false },
    handler: listProviderManifests,
  },
  {
    name: "get_provider_manifest_summary",
    description:
      "Return a capability summary (isEnabled, apiVersion, tokenScope, authFlow, capabilities, refreshable) for one provider. The manifest is TEXT-PARSED, never executed.",
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
    handler: getProviderManifestSummary,
  },
];
