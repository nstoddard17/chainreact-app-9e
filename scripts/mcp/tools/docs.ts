/**
 * Internal MCP server — documentation tools.
 *
 *   get_project_memory     → docs/PROJECT_MEMORY.md
 *   list_rule_docs         → docs/rules/*.md (name + H1 title)
 *   read_rule_doc          → one docs/rules/<name>.md
 *   search_project_docs    → substring search across docs/**.md + CLAUDE.md
 *   get_claude_instructions_summary → CLAUDE.md heading outline
 */
import { basename } from "node:path";
import {
  ALLOWED_DOC_ROOTS,
  ALLOWED_FILES,
  CLAUDE_MD_FILE,
  DOCS_ROOT,
  LIMITS,
  PROJECT_MEMORY_FILE,
  RULE_DOCS_DIR,
} from "../config";
import {
  firstHeading,
  listMarkdownFiles,
  readAllowedFile,
} from "../lib/files";
import type { ToolDefinition } from "../registry";

const ALL_DOC_ROOTS = ALLOWED_DOC_ROOTS;
const ALL_FILES = ALLOWED_FILES;

function getProjectMemory(): string {
  const { text, truncated } = readAllowedFile(PROJECT_MEMORY_FILE, ALL_DOC_ROOTS);
  return truncated ? `${text}\n\n…[file truncated at read cap]` : text;
}

function listRuleDocs(): string {
  const files = listMarkdownFiles(RULE_DOCS_DIR);
  const lines = files.map((rel) => {
    const name = basename(rel).replace(/\.md$/i, "");
    let title: string | null = null;
    try {
      title = firstHeading(readAllowedFile(rel, ALL_DOC_ROOTS).text);
    } catch {
      title = null;
    }
    return `- ${name} — ${title ?? "(no title)"}  [${rel}]`;
  });
  return lines.length
    ? `Rule docs (${lines.length}):\n${lines.join("\n")}`
    : "No rule docs found.";
}

function readRuleDoc(args: Record<string, unknown>): string {
  const raw = typeof args.name === "string" ? args.name.trim() : "";
  if (!raw) return "Error: 'name' is required (e.g. 'provider-registry').";
  // Normalize to a bare doc name — strip any path/extension the caller passed.
  const name = basename(raw).replace(/\.md$/i, "");
  if (!/^[a-z0-9][a-z0-9._-]*$/i.test(name)) {
    return `Error: invalid rule doc name '${raw}'.`;
  }
  const rel = `${RULE_DOCS_DIR}/${name}.md`;
  const { text } = readAllowedFile(rel, ALL_DOC_ROOTS);
  return text;
}

function searchProjectDocs(args: Record<string, unknown>): string {
  const query = typeof args.query === "string" ? args.query.trim() : "";
  if (query.length < 2) return "Error: 'query' must be at least 2 characters.";
  const needle = query.toLowerCase();

  const files = [...listMarkdownFiles(DOCS_ROOT), CLAUDE_MD_FILE];
  const results: string[] = [];
  let scanned = 0;

  for (const rel of files) {
    if (results.length >= LIMITS.searchMaxResults) break;
    if (scanned >= LIMITS.searchMaxFiles) break;
    scanned += 1;
    let text: string;
    try {
      text = readAllowedFile(rel, ALL_DOC_ROOTS, ALL_FILES).text;
    } catch {
      continue;
    }
    const lines = text.split("\n");
    for (let i = 0; i < lines.length; i += 1) {
      const line = lines[i];
      if (line !== undefined && line.toLowerCase().includes(needle)) {
        results.push(`${rel}:${i + 1}: ${line.trim()}`);
        if (results.length >= LIMITS.searchMaxResults) break;
      }
    }
  }

  if (!results.length) return `No matches for "${query}" in project docs.`;
  return `${results.length} match(es) for "${query}" (scanned ${scanned} files):\n${results.join("\n")}`;
}

function getClaudeInstructionsSummary(): string {
  const { text } = readAllowedFile(CLAUDE_MD_FILE, ALL_DOC_ROOTS, ALL_FILES);
  const headings: string[] = [];
  for (const line of text.split("\n")) {
    const m = line.match(/^(#{1,3})\s+(.+)$/);
    if (m && m[1] !== undefined && m[2] !== undefined) {
      const indent = "  ".repeat(m[1].length - 1);
      headings.push(`${indent}- ${m[2].trim()}`);
    }
  }
  const title = firstHeading(text) ?? "CLAUDE.md";
  return [
    `${title} — outline (${headings.length} headings, ${text.length} chars):`,
    ...headings,
    "",
    "Use read_rule_doc / search_project_docs for the full text of any section.",
  ].join("\n");
}

export const docsTools: ToolDefinition[] = [
  {
    name: "get_project_memory",
    description:
      "Return the curated rolling project-memory file (docs/PROJECT_MEMORY.md): current status, durable decisions, open follow-ups. Read-only.",
    inputSchema: { type: "object", properties: {}, additionalProperties: false },
    handler: getProjectMemory,
  },
  {
    name: "list_rule_docs",
    description:
      "List the per-subsystem rule docs under docs/rules/ with their titles. Use read_rule_doc to fetch one.",
    inputSchema: { type: "object", properties: {}, additionalProperties: false },
    handler: listRuleDocs,
  },
  {
    name: "read_rule_doc",
    description:
      "Read one rule doc by bare name (e.g. 'provider-registry', 'testing-strategy'). Only docs/rules/*.md are reachable.",
    inputSchema: {
      type: "object",
      properties: {
        name: {
          type: "string",
          description: "Bare rule-doc name without extension, e.g. 'provider-registry'.",
        },
      },
      required: ["name"],
      additionalProperties: false,
    },
    handler: readRuleDoc,
  },
  {
    name: "search_project_docs",
    description:
      "Case-insensitive substring search across docs/**.md and CLAUDE.md. Returns file:line snippets. Read-only.",
    inputSchema: {
      type: "object",
      properties: {
        query: { type: "string", description: "Search text (min 2 chars)." },
      },
      required: ["query"],
      additionalProperties: false,
    },
    handler: searchProjectDocs,
  },
  {
    name: "get_claude_instructions_summary",
    description:
      "Return a heading outline of CLAUDE.md (the project's operating constitution) without dumping the whole file.",
    inputSchema: { type: "object", properties: {}, additionalProperties: false },
    handler: getClaudeInstructionsSummary,
  },
];
