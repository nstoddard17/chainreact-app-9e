import { McpCatalogSchema, type McpCatalog } from "@/core/mcpCompile";

/**
 * Linear MCP catalog — the committed APPROVAL ALLOWLIST (CS-2).
 *
 * Only `decision: "ship"` entries generate artifacts; everything else is a
 * decision record. Snapshot provenance: `mcp-snapshot.json` is currently
 * `capturedBy: "docs-draft"` (verbatim 2026-06-18 community capture of the
 * official server — see docs/providers/linear/research.md §CS-2) and MUST be
 * re-captured live (`npm run mcp:import -- capture linear`) before any of
 * these actions register or certify. Drift is hash-pinned either way.
 *
 * Linear consolidated create/update into single `save_*` dispatcher tools
 * (changelog 2026-02-26). Per plan §10.5 those ship here as SPLIT typed V2
 * actions — `create_issue` / `update_issue` from `save_issue` — using field
 * omission + required-pinning so each node is single-purpose (rule 1).
 *
 * No `optionsSource` yet: Linear option resolvers (teams/projects/states)
 * are executor-slice work; team/project/state fields stay text inputs that
 * accept names or IDs (the tool resolves names server-side), recorded as a
 * configuration-quality limitation in mcp-capabilities.json.
 */
export const linearMcpCatalog: McpCatalog = McpCatalogSchema.parse({
  provider: "linear",
  serverUrl: "https://mcp.linear.app/mcp",
  tools: [
    {
      tool: "list_issues",
      decision: "ship",
      type: "find_issues",
      displayName: "Find Issues",
      description:
        "Search and filter issues in the Linear workspace by text, team, state, assignee, label, project, cycle, or priority. Returns one page of results.",
      category: "developer",
      displayOrder: 10,
      risk: "read",
      reason: "Core repetitive-task read: find issues to act on downstream.",
      fieldOverrides: {
        limit: { advanced: true },
        cursor: { advanced: true, description: "Next-page cursor from a previous Find Issues step." },
        orderBy: { advanced: true },
        includeArchived: { advanced: true },
        delegate: { advanced: true },
        parentId: { advanced: true },
        createdAt: { advanced: true },
        updatedAt: { advanced: true },
      },
    },
    {
      tool: "save_issue",
      decision: "ship",
      type: "create_issue",
      displayName: "Create Issue",
      description:
        "Create a new issue in a Linear team, with optional description, assignee, state, labels, project, priority, and due date.",
      category: "developer",
      displayOrder: 20,
      risk: "write",
      reason:
        "Core repetitive-task write. Linear's save_issue is a create-or-update dispatcher; V2 ships it as split typed actions (plan §10.5) — this is the create half (id omitted; title+team pinned required per the tool's own prose contract).",
      fieldOverrides: {
        id: { omit: true },
        title: { required: true },
        team: { required: true },
        removeBlocks: { omit: true },
        removeBlockedBy: { omit: true },
        removeRelatedTo: { omit: true },
        duplicateOf: { omit: true },
        delegate: { advanced: true },
        cycle: { advanced: true },
        milestone: { advanced: true },
        estimate: { advanced: true },
        links: { advanced: true },
        blocks: { advanced: true },
        blockedBy: { advanced: true },
        relatedTo: { advanced: true },
        parentId: { advanced: true },
      },
    },
    {
      tool: "save_issue",
      decision: "ship",
      type: "update_issue",
      displayName: "Update Issue",
      description:
        "Update an existing Linear issue by ID or identifier (e.g. LIN-123) — state, assignee, priority, labels, project, due date, relations.",
      category: "developer",
      displayOrder: 30,
      risk: "write",
      reason:
        "The update half of save_issue (id pinned required). Kept whole otherwise so state moves, reassignment, and relation edits are one node.",
      fieldOverrides: {
        id: {
          required: true,
          label: "Issue",
          description: "Issue ID or identifier (e.g. LIN-123).",
        },
        delegate: { advanced: true },
        cycle: { advanced: true },
        milestone: { advanced: true },
        estimate: { advanced: true },
        links: { advanced: true },
        blocks: { advanced: true },
        blockedBy: { advanced: true },
        relatedTo: { advanced: true },
        duplicateOf: { advanced: true },
        parentId: { advanced: true },
        removeBlocks: { advanced: true },
        removeBlockedBy: { advanced: true },
        removeRelatedTo: { advanced: true },
      },
    },
    {
      tool: "save_comment",
      decision: "ship",
      type: "add_comment",
      displayName: "Add Comment",
      description:
        "Add a Markdown comment to a Linear issue (by ID or identifier, e.g. LIN-123). Reply to an existing thread via the Advanced parent comment field.",
      category: "developer",
      displayOrder: 40,
      risk: "write",
      reason:
        "Core repetitive-task write. Scoped to ISSUE comments for v1 — the tool's project/initiative/document/milestone parents are omitted so the node stays single-purpose; issueId pinned required.",
      fieldOverrides: {
        id: { omit: true },
        projectId: { omit: true },
        initiativeId: { omit: true },
        documentId: { omit: true },
        milestoneId: { omit: true },
        issueId: { required: true },
        parentId: { advanced: true },
      },
    },
    {
      tool: "get_issue",
      decision: "defer",
      reason:
        "Find Issues covers v1 lookup; a dedicated Get Issue (with relations/attachments) lands with the executor slice when its richer output can be bounded from live structuredContent evidence.",
    },
    {
      tool: "delete_comment",
      decision: "skip",
      reason: "Destructive; no v1 repetitive-task demand. Revisit only with explicit product signal.",
    },
    {
      tool: "create_attachment",
      decision: "defer",
      reason: "File flows must ride the FileRef contract (executor + file staging work) — not v1.",
    },
  ],
});
