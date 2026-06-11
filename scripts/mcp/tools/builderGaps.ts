/**
 * Internal MCP server — builder-metadata gap tracker tool.
 *
 *   list_builder_metadata_gaps → surfaces the launch-gap tracker's pending
 *   section + status snapshot, read as text. Only registered if the tracker
 *   file exists.
 */
import { existsSync } from "node:fs";
import { BUILDER_GAP_TRACKER_FILE, ALLOWED_DOC_ROOTS } from "../config";
import { readAllowedFile } from "../lib/files";
import { resolveAllowedPath } from "../security/paths";
import type { ToolDefinition } from "../registry";

/** Pull the body of a `## <n>. <heading>` section out of markdown text. */
function extractSection(text: string, headingPattern: RegExp): string | null {
  const lines = text.split("\n");
  let start = -1;
  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i];
    if (line !== undefined && headingPattern.test(line)) {
      start = i;
      break;
    }
  }
  if (start === -1) return null;
  const out: string[] = [];
  for (let i = start; i < lines.length; i += 1) {
    const line = lines[i];
    if (line === undefined) continue;
    if (i > start && /^##\s/.test(line)) break;
    out.push(line);
  }
  return out.join("\n").trim();
}

function listBuilderMetadataGaps(): string {
  const { text } = readAllowedFile(BUILDER_GAP_TRACKER_FILE, ALLOWED_DOC_ROOTS);
  const pending = extractSection(text, /^##\s+3\./) ?? "(pending section not found)";
  const snapshot = extractSection(text, /^##\s+8\./) ?? "(status snapshot not found)";
  return [
    `Source: ${BUILDER_GAP_TRACKER_FILE}`,
    "",
    pending,
    "",
    snapshot,
  ].join("\n");
}

/** Tracker may legitimately not exist; only return the tool when it does. */
export function builderGapsTools(): ToolDefinition[] {
  let abs: string;
  try {
    abs = resolveAllowedPath(BUILDER_GAP_TRACKER_FILE, ALLOWED_DOC_ROOTS);
  } catch {
    return [];
  }
  if (!existsSync(abs)) return [];
  return [
    {
      name: "list_builder_metadata_gaps",
      description:
        "Return the provider builder-metadata launch-gap tracker's pending-provider section and current status snapshot. Read-only.",
      inputSchema: {
        type: "object",
        properties: {},
        additionalProperties: false,
      },
      handler: listBuilderMetadataGaps,
    },
  ];
}
