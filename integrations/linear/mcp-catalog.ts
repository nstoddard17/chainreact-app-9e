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
/**
 * Linear's documented issue-priority scale (`save_issue`/`list_issues` type it
 * as a bare `number` described "0=None…4=Low"). Curated into a labelled closed
 * dropdown (rule 17 + Q11) so users pick a named level and the generated zod
 * schema rejects negative / out-of-range values. Contiguous integer range.
 */
const PRIORITY_LEVELS = [
  { value: 0, label: "No priority" },
  { value: 1, label: "Urgent" },
  { value: 2, label: "High" },
  { value: 3, label: "Medium" },
  { value: 4, label: "Low" },
];

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
        limit: { advanced: true, numericMin: 1 }, // 1..250 (max from tool schema).
        cursor: { advanced: true, description: "Next-page cursor from a previous Find Issues step." },
        orderBy: { advanced: true },
        includeArchived: { advanced: true },
        delegate: { advanced: true },
        // TEST-SUITE-GREEN-1 (RESOLVERS-1) — the parent-issue FILTER is a real
        // issue reference, so it gets the issue picker rather than a raw-id box.
        parentId: {
          advanced: true,
          label: "Parent issue",
          optionsSource: "linear:issues",
          allowManualEntry: true,
          description: "Only return sub-issues of this parent — pick an issue, or type an ID/identifier (e.g. LIN-123).",
        },
        createdAt: { advanced: true },
        updatedAt: { advanced: true },
        release: { advanced: true }, // live-only field (CS-6): power-user release filter.
        // Closed dropdown for the priority FILTER (rule 17); schema-constrained.
        priority: { enumValues: PRIORITY_LEVELS, description: "Only return issues at this priority level." },
        // CS-6B/CS-6C resolver-backed pickers.
        //
        // LINEAR-MANUAL-ENTRY-1 — `allowManualEntry` is what actually keeps the
        // name/ID path open; the picker alone is CLOSED. Justified per field by
        // Linear's OWN tool schema (mcp-snapshot.json), quoted below.
        team: { optionsSource: "linear:teams", allowManualEntry: true }, // "Team name or ID"
        assignee: {
          optionsSource: "linear:assignees",
          allowManualEntry: true,
          // Linear: "User ID, name, email, or \"me\"". The vendor's description is
          // lost in compile (nullable anyOf idiom), and `me` is a literal no
          // assignee list can enumerate — so state it here.
          description: 'Assignee — pick a user, or type a name, email, or "me".',
        },
        label: { optionsSource: "linear:labels", allowManualEntry: true }, // "Label name or ID"
        // CS-6C — State + Project dropdowns, cascade children of Team.
        state: { optionsSource: "linear:issue_statuses", dependsOn: ["team"], allowManualEntry: true }, // "State type, name, or ID"
        project: { optionsSource: "linear:projects", dependsOn: ["team"], allowManualEntry: true }, // "Project name, ID, or slug"
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
      // CS-6B — save_issue (create OR update) is write-evidence-eligible. Requires
      // the explicit `write-evidence` command + a disposable-record fixture; a
      // create fixture (no id) → create shape, an update fixture (id) → update.
      writeEvidence: { description: "Creates a new issue (or updates one if the fixture has an id) via save_issue." },
      // CS-6D — CERTIFIED from the real save_issue write result (mcp-evidence.json,
      // write-evidence chain). Bounded to the proven top-level fields. NOTE: Linear's
      // save_issue result carries NO `identifier` (e.g. LIN-42) field — only `id`
      // (UUID) + `url` (the URL contains the human reference), so `identifier` is
      // NOT declared (not proven). status/team/project are returned as name strings.
      outputs: [
        { name: "id", type: "string", description: "The new issue's unique ID." },
        { name: "title", type: "string", description: "The issue title." },
        { name: "url", type: "string", description: "Direct link to the issue in Linear (contains its LIN-… reference — use this for Slack/downstream)." },
        { name: "status", type: "string", description: "Current workflow state name (e.g. Backlog, In Progress)." },
        { name: "team", type: "string", description: "Name of the team the issue belongs to." },
        { name: "project", type: "string", description: "Name of the project the issue is in (empty when none)." },
        { name: "createdAt", type: "string", description: "When the issue was created (ISO-8601 UTC)." },
      ],
      fieldOverrides: {
        id: { omit: true },
        title: { required: true },
        // Closed dropdown for priority (rule 17); schema rejects out-of-range.
        priority: { enumValues: PRIORITY_LEVELS, description: "Priority level for the new issue." },
        // Date picker (Linear types dueDate as a bare string); YYYY-MM-DD schema.
        dueDate: { format: "date", description: "Due date (YYYY-MM-DD)." },
        // CS-6B resolver-backed pickers. LINEAR-MANUAL-ENTRY-1 — the descriptions
        // below already promised "or type a name/ID"; `allowManualEntry` is what
        // makes that true in the UI. Vendor schema accepts each free value.
        team: { required: true, optionsSource: "linear:teams", allowManualEntry: true, description: "Team the issue belongs to — pick one, or type a team name/ID." },
        assignee: {
          optionsSource: "linear:assignees",
          allowManualEntry: true,
          description: 'Assignee — pick a user, or type a name, email, or "me".',
        },
        labels: {
          optionsSource: "linear:labels",
          allowManualEntry: true,
          description: "Labels to apply — pick from the list or type label names/IDs.",
        },
        // CS-6C — State + Project dropdowns, cascade children of Team.
        state: {
          optionsSource: "linear:issue_statuses",
          dependsOn: ["team"],
          allowManualEntry: true,
          description: "Workflow state — pick a team first, then choose a state (or type a state name/ID).",
        },
        project: {
          optionsSource: "linear:projects",
          dependsOn: ["team"],
          allowManualEntry: true,
          description: "Project to add the issue to — pick from the list or type a project name/ID.",
        },
        removeBlocks: { omit: true },
        removeBlockedBy: { omit: true },
        removeRelatedTo: { omit: true },
        duplicateOf: { omit: true },
        removeReleases: { omit: true }, // live-only (CS-6): nothing to remove on create.
        // MCP-NULLABLE-DESCRIPTIONS-1 — the compiler now preserves the vendor's
        // wrapper description on nullable fields, but Linear's copy for several
        // of them says "pass null to remove/clear" — an MCP-client operation the
        // builder does not expose (schemas are plain .optional(); leaving a
        // field empty omits it). These overrides keep the vendor's informative
        // sentence and trim ONLY the null clause (Section-6 quality rule).
        delegate: { advanced: true, description: "Agent name or ID." },
        cycle: { advanced: true, description: "Cycle name, number, or ID." },
        milestone: { advanced: true },
        estimate: { advanced: true, numericMin: 0, description: "Issue estimate value. Omit for no estimate." }, // estimate points are never negative.
        links: { advanced: true },
        blocks: { advanced: true },
        blockedBy: { advanced: true },
        relatedTo: { advanced: true },
        // TEST-SUITE-GREEN-1 (RESOLVERS-1) — sub-issue parent is a real issue
        // reference; picker + manual entry (mapping / LIN-123 still work).
        parentId: {
          advanced: true,
          label: "Parent issue",
          optionsSource: "linear:issues",
          allowManualEntry: true,
          description: "Make this a sub-issue of another issue — pick one, or type an ID/identifier (e.g. LIN-123).",
        },
        // live-only (CS-6) — SLA + release plumbing: power-user, Advanced tab.
        slaBreachesAt: { advanced: true, label: "SLA breach time", description: "ISO-8601 timestamp when the SLA will breach." },
        slaType: { advanced: true, label: "SLA day counting" },
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
      // CS-6D — CERTIFIED from the real save_issue write result (same tool as create;
      // mcp-evidence.json write-evidence chain). Bounded; no `identifier` (not
      // returned by Linear — use `url`). `updatedAt` reflects the edit.
      outputs: [
        { name: "id", type: "string", description: "The issue's unique ID." },
        { name: "title", type: "string", description: "The issue title after the update." },
        { name: "url", type: "string", description: "Direct link to the issue in Linear (contains its LIN-… reference)." },
        { name: "status", type: "string", description: "Current workflow state name after the update." },
        { name: "updatedAt", type: "string", description: "When the issue was last updated (ISO-8601 UTC)." },
      ],
      fieldOverrides: {
        // TEST-SUITE-GREEN-1 (RESOLVERS-1) — the issue being updated is the
        // node's core user decision and was a required raw-id Setup box: the
        // author had to leave ChainReact and copy a UUID/LIN-123. Now a real
        // account-aware picker; `allowManualEntry` keeps {{mapping}} and pasted
        // identifiers working unchanged (the common "update the issue the
        // trigger just reported" path).
        id: {
          required: true,
          label: "Issue",
          optionsSource: "linear:issues",
          allowManualEntry: true,
          description: "Issue to update — pick one, or type an ID/identifier (e.g. LIN-123).",
        },
        // Closed dropdown for priority (rule 17); schema rejects out-of-range.
        priority: { enumValues: PRIORITY_LEVELS, description: "Change the issue's priority level." },
        // Date picker (Linear types dueDate as a bare string); YYYY-MM-DD schema.
        dueDate: { format: "date", description: "Due date (YYYY-MM-DD)." },
        // CS-6B resolver-backed pickers. LINEAR-MANUAL-ENTRY-1 — see create_issue.
        team: { optionsSource: "linear:teams", allowManualEntry: true, description: "Move the issue to a different team — pick one, or type a team name/ID (optional)." },
        assignee: {
          optionsSource: "linear:assignees",
          allowManualEntry: true,
          description: 'Reassign the issue — pick a user, or type a name, email, or "me".',
        },
        labels: {
          optionsSource: "linear:labels",
          allowManualEntry: true,
          description: "Replace the issue's labels — pick from the list or type label names/IDs. Leave empty to keep existing labels.",
        },
        // CS-6C — State + Project dropdowns, cascade children of Team.
        state: {
          optionsSource: "linear:issue_statuses",
          dependsOn: ["team"],
          allowManualEntry: true,
          description: "Move the issue to a workflow state — pick a team first, then a state (or type a state name/ID).",
        },
        project: {
          optionsSource: "linear:projects",
          dependsOn: ["team"],
          allowManualEntry: true,
          description: "Move the issue to a project — pick from the list or type a project name/ID.",
        },
        // MCP-NULLABLE-DESCRIPTIONS-1 — same Section-6 trims as create_issue:
        // vendor sentence kept, unsupported "pass null" clause dropped.
        delegate: { advanced: true, description: "Agent name or ID." },
        cycle: { advanced: true, description: "Cycle name, number, or ID." },
        milestone: { advanced: true },
        estimate: { advanced: true, numericMin: 0, description: "Issue estimate value. Omit to leave it unchanged." }, // estimate points are never negative.
        links: { advanced: true },
        blocks: { advanced: true },
        blockedBy: { advanced: true },
        relatedTo: { advanced: true },
        duplicateOf: { advanced: true, description: "Duplicate of issue ID/identifier." },
        // TEST-SUITE-GREEN-1 (RESOLVERS-1) — see create_issue.
        parentId: {
          advanced: true,
          label: "Parent issue",
          optionsSource: "linear:issues",
          allowManualEntry: true,
          description: "Make this a sub-issue of another issue — pick one, or type an ID/identifier (e.g. LIN-123).",
        },
        removeBlocks: { advanced: true },
        removeBlockedBy: { advanced: true },
        removeRelatedTo: { advanced: true },
        // live-only (CS-6) — SLA + release plumbing on the Advanced tab.
        slaBreachesAt: { advanced: true, label: "SLA breach time", description: "ISO-8601 timestamp when the SLA will breach." },
        slaType: { advanced: true, label: "SLA day counting" },
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
      // CS-6B — write-evidence-eligible (disposable comment on a test issue).
      writeEvidence: { description: "Adds a comment to an issue via save_comment." },
      // CS-6D — CERTIFIED from the real save_comment write result (mcp-evidence.json
      // write-evidence chain): { id, body, createdAt, updatedAt, author, … }. The
      // result does NOT echo `issueId`, so it is NOT declared (not proven). `body`
      // is the comment text the user authored (safe to surface).
      outputs: [
        { name: "id", type: "string", description: "The new comment's unique ID." },
        { name: "body", type: "string", description: "The comment text (Markdown)." },
        { name: "createdAt", type: "string", description: "When the comment was created (ISO-8601 UTC)." },
      ],
      fieldOverrides: {
        id: { omit: true },
        projectId: { omit: true },
        initiativeId: { omit: true },
        documentId: { omit: true },
        milestoneId: { omit: true },
        // TEST-SUITE-GREEN-1 (RESOLVERS-1) — same as update_issue.id: the
        // issue being commented on is the node's core user decision.
        issueId: {
          required: true,
          label: "Issue",
          optionsSource: "linear:issues",
          allowManualEntry: true,
          description: "Issue to comment on — pick one, or type an ID/identifier (e.g. LIN-123).",
        },
        parentId: { advanced: true, label: "Parent comment", description: "Reply under an existing comment (comment ID). Leave empty for a top-level comment." },
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
      reason:
        "Resolver source: backs the Project picker (`linear:projects`, optionally dependsOn Team via the tool's `team` filter). Live schema has NO required args. Captured live but the cert workspace had ZERO projects, so the ITEM shape (id/name fields) is unconfirmed — the empty array is insufficient to map value/label. This is NOT a decision to leave Project as text: re-run `capture --evidence` against a workspace that HAS projects, then build `linear:projects`. Do NOT ship a guessed shape.",
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
        "Resolver source: backs the State picker (`linear:issue_statuses`, a cascade child of Team via dependsOn). Live schema REQUIRES a `team` arg, so it carries NO committed evidence sampleArgs (an account-specific team can't be committed safely). To ship the picker: at cert time add a transient `evidence: { sampleArgs: { team: \"<real-team>\" } }` here and run `capture --evidence` to record the result shape, then build `linear:issue_statuses` (dependsOn team). Until that shape is captured the State field stays name-or-id text — do NOT guess the shape.",
    },
    {
      tool: "list_cycles",
      decision: "defer",
      reason:
        "Resolver source: backs the Cycle picker (`linear:cycles`, a cascade child of Team via dependsOn). Live schema REQUIRES a `teamId` arg (props: teamId, type), so it carries NO committed evidence sampleArgs (account-specific). To ship: add a transient `evidence: { sampleArgs: { teamId: \"<real-team-id>\" } }` and run `capture --evidence` to record the result shape, then build `linear:cycles` (dependsOn team). Until then the Cycle field stays name/number/id text — do NOT guess the shape.",
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
