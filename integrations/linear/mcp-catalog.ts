import { McpCatalogSchema, type McpCatalog } from "@/core/mcpCompile";

/**
 * Linear MCP catalog — the committed APPROVAL ALLOWLIST.
 *
 * Only `decision: "ship"` entries generate action artifacts; everything else is
 * a decision record. **Snapshot provenance (CS-6): `mcp-snapshot.json` is now a
 * LIVE authenticated capture** (`capturedBy: "live"`, 52 tools from
 * `https://mcp.linear.app/mcp`, 2026-07-23) — the docs-draft assumptions are
 * superseded. Drift is hash-pinned against the live schemas.
 *
 * Linear consolidated create/update into single `save_*` dispatcher tools
 * (changelog 2026-02-26). Per plan §10.5 those ship here as SPLIT typed V2
 * actions — `create_issue` / `update_issue` from `save_issue` — using field
 * omission + required-pinning so each node is single-purpose (rule 1).
 *
 * CS-6 evidence status:
 *   - `find_issues` (list_issues) has a CERTIFIED structured output curated from
 *     the real captured `list_issues` result shape (mcp-evidence.json).
 *   - `create_issue` / `update_issue` / `add_comment` stay text-only: their
 *     tools (save_issue / save_comment) are WRITES and were not auto-captured
 *     (write-evidence is deferred) — their result shapes are not certified, so
 *     we do NOT fabricate structured outputs.
 *   - Option resolvers (Team/Project/State/Assignee/Labels) require the LIST
 *     tools' result shapes. The list tools are added below as `defer` resolver
 *     sources with read-only evidence approvals; run `capture --evidence` again
 *     to record their shapes, then build the resolvers. State depends on a
 *     `team`, so `list_issue_statuses` carries NO committed sampleArgs (an
 *     account-specific team can't be committed).
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
      // Read-only + bounded to a tiny page so `capture --evidence` records the
      // list_issues result shape without pulling a large payload.
      evidence: { sampleArgs: { limit: 3 } },
      // CS-6 — CERTIFIED from the real captured list_issues result shape
      // (mcp-evidence.json): a page of issue objects + Linear's pagination
      // fields. `issues[]` carries id/title/url/status/team/priority/timestamps.
      outputs: [
        { name: "issues", type: "array", description: "One page of matching issues (each: id, title, description, url, status, statusType, team, teamId, priority, createdAt, updatedAt, labels)." },
        { name: "hasNextPage", type: "boolean", description: "True when more issues exist beyond this page." },
        { name: "cursor", type: "string", description: "Opaque next-page token — pass to a later Find Issues run's Cursor to page forward." },
      ],
      fieldOverrides: {
        limit: { advanced: true },
        cursor: { advanced: true, description: "Next-page cursor from a previous Find Issues step." },
        orderBy: { advanced: true },
        includeArchived: { advanced: true },
        delegate: { advanced: true },
        parentId: { advanced: true },
        createdAt: { advanced: true },
        updatedAt: { advanced: true },
        release: { advanced: true }, // live-only field (CS-6): power-user release filter.
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
        removeReleases: { omit: true }, // live-only (CS-6): nothing to remove on create.
        delegate: { advanced: true },
        cycle: { advanced: true },
        milestone: { advanced: true },
        estimate: { advanced: true },
        links: { advanced: true },
        blocks: { advanced: true },
        blockedBy: { advanced: true },
        relatedTo: { advanced: true },
        parentId: { advanced: true },
        // live-only (CS-6) — SLA + release plumbing: power-user, Advanced tab.
        slaBreachesAt: { advanced: true },
        slaType: { advanced: true },
        addReleases: { advanced: true },
        setReleases: { advanced: true },
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
        // live-only (CS-6) — SLA + release plumbing on the Advanced tab.
        slaBreachesAt: { advanced: true },
        slaType: { advanced: true },
        addReleases: { advanced: true },
        setReleases: { advanced: true },
        removeReleases: { advanced: true },
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
        // live-only (CS-6) — status-update comment parents are out of the
        // issue-scoped node; omit so Add Comment stays single-purpose.
        statusUpdateId: { omit: true },
        statusUpdateType: { omit: true },
      },
    },
    // ── Resolver-source list tools (CS-6). Not shipped as actions — captured
    //    for option-resolver design via read-only evidence approvals. The
    //    `defer` decision generates no artifact; the `evidence` block approves
    //    a bounded read-only call by `capture --evidence`. ──────────────────
    {
      tool: "list_teams",
      decision: "defer",
      reason: "Resolver source: backs the Team picker (list_teams). Captured for resolver design; not a standalone action.",
      evidence: { sampleArgs: { limit: 5 } },
    },
    {
      tool: "list_projects",
      decision: "defer",
      reason: "Resolver source: backs the Project picker (list_projects). Captured for resolver design; not a standalone action.",
      evidence: { sampleArgs: { limit: 5 } },
    },
    {
      tool: "list_users",
      decision: "defer",
      reason: "Resolver source: backs the Assignee picker (list_users). Captured for resolver design; not a standalone action.",
      evidence: { sampleArgs: { limit: 5 } },
    },
    {
      tool: "list_issue_labels",
      decision: "defer",
      reason: "Resolver source: backs the Labels picker (list_issue_labels). Captured for resolver design; not a standalone action.",
      evidence: { sampleArgs: { limit: 5 } },
    },
    {
      tool: "list_issue_statuses",
      decision: "defer",
      reason:
        "Resolver source: backs the State picker (cascade child of Team). REQUIRES a `team` arg, so it carries NO committed evidence sampleArgs (an account-specific team can't be committed safely); capture its shape at cert time with a real team, or the resolver derives value/label from status/statusType strings surfaced by list_issues.",
    },
    {
      tool: "get_issue",
      decision: "defer",
      reason:
        "Find Issues covers v1 lookup; a dedicated Get Issue (with relations/attachments) lands later. Also a potential proxy for save_issue's write output shape, but it REQUIRES an issue `id`, so no committed evidence sampleArgs (account-specific).",
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
