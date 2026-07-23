// Generated from integrations/linear/mcp-catalog.ts + mcp-snapshot.json (npm run mcp:import -- generate linear).
// Curate the catalog and regenerate rather than hand-editing this file.

/**
 * Certification-pinned tool inputSchemas (by tool name). The runtime
 * executor compares the live `tools/list` schema against these to classify
 * drift; a breaking change fails closed, a safe addition runs + flags review.
 */
export const linearPinnedToolSchemas: Record<string, { schemaHash: string; inputSchema: Record<string, unknown> }> = {
  "list_issues": {
    schemaHash: "f2ec4a94207f5f58b8fb956741e8795d4d4383bda1d3a9817d3e1ba8318c3c1d",
    inputSchema: {
      $schema: "http://json-schema.org/draft-07/schema#",
      type: "object",
      properties: {
        limit: {
          default: 50,
          description: "Max results (default 50, max 250)",
          type: "number",
          maximum: 250,
        },
        cursor: {
          description: "Next page cursor",
          type: "string",
        },
        orderBy: {
          default: "updatedAt",
          description: "Sort: createdAt | updatedAt",
          type: "string",
          enum: [
            "createdAt",
            "updatedAt",
          ],
        },
        query: {
          description: "Search issue title or description",
          type: "string",
        },
        team: {
          description: "Team name or ID",
          type: "string",
        },
        state: {
          description: "State type, name, or ID",
          type: "string",
        },
        cycle: {
          description: "Cycle name, number, or ID",
          type: "string",
        },
        label: {
          description: "Label name or ID",
          type: "string",
        },
        assignee: {
          description: "User ID, name, email, or \"me\"",
          anyOf: [
            {
              type: "string",
            },
            {
              type: "null",
            },
          ],
        },
        delegate: {
          description: "Agent name or ID. When the user asks to delegate to \"Linear\" or \"the Linear agent\", this refers to the \"Linear\" app user specifically",
          type: "string",
        },
        project: {
          description: "Project name, ID, or slug",
          type: "string",
        },
        release: {
          description: "Release ID or slug",
          type: "string",
        },
        priority: {
          description: "0=None, 1=Urgent, 2=High, 3=Medium, 4=Low",
          type: "number",
        },
        parentId: {
          description: "Parent issue ID or identifier (e.g., LIN-123)",
          type: "string",
        },
        createdAt: {
          description: "Created after: ISO-8601 date/duration (e.g., -P1D)",
          type: "string",
        },
        updatedAt: {
          description: "Updated after: ISO-8601 date/duration (e.g., -P1D)",
          type: "string",
        },
        includeArchived: {
          default: true,
          description: "Include archived items",
          type: "boolean",
        },
      },
      additionalProperties: false,
    },
  },
  "save_issue": {
    schemaHash: "1fd1b57e90b57f24593d5b3f39b61d0655b13486902072cdbe53bbc647fbc291",
    inputSchema: {
      $schema: "http://json-schema.org/draft-07/schema#",
      type: "object",
      properties: {
        id: {
          description: "Only for updating an existing issue. Pass the issue ID or identifier (e.g., LIN-123). Do NOT pass this parameter when creating a new issue.",
          type: "string",
        },
        title: {
          description: "Issue title (required when creating)",
          type: "string",
        },
        description: {
          description: "Content as Markdown. Do not escape the string — use literal newlines and special characters, not escape sequences. To mention a user, use @displayName (e.g., @johndoe)",
          type: "string",
        },
        team: {
          description: "Team name or ID (required when creating)",
          type: "string",
        },
        cycle: {
          description: "Cycle name, number, or ID. Null to remove",
          anyOf: [
            {
              type: "string",
            },
            {
              type: "null",
            },
          ],
        },
        milestone: {
          description: "Milestone name or ID",
          type: "string",
        },
        priority: {
          description: "0=None, 1=Urgent, 2=High, 3=Medium, 4=Low",
          type: "number",
        },
        project: {
          description: "Project name, ID, or slug. Null to remove",
          anyOf: [
            {
              type: "string",
            },
            {
              type: "null",
            },
          ],
        },
        state: {
          description: "State type, name, or ID",
          type: "string",
        },
        assignee: {
          description: "User ID, name, email, or \"me\". Null to remove",
          anyOf: [
            {
              type: "string",
            },
            {
              type: "null",
            },
          ],
        },
        delegate: {
          description: "Agent name or ID. When the user asks to delegate to \"Linear\" or \"the Linear agent\", this refers to the \"Linear\" app user specifically. Null to remove",
          anyOf: [
            {
              type: "string",
            },
            {
              type: "null",
            },
          ],
        },
        labels: {
          description: "Label names or IDs as a JSON array of strings (e.g. [\"Bug\", \"Urgent\"]). Replaces the full label set; existing labels not included are removed. Omit to leave labels unchanged",
          type: "array",
          items: {
            type: "string",
          },
        },
        dueDate: {
          description: "Due date (ISO format). On update, pass null to remove the due date",
          anyOf: [
            {
              type: "string",
            },
            {
              type: "null",
            },
          ],
        },
        slaBreachesAt: {
          description: "ISO-8601 timestamp when the SLA will breach. On update, pass null to remove the SLA",
          anyOf: [
            {
              type: "string",
              format: "date-time",
              pattern: "^(?:(?:\\d\\d[2468][048]|\\d\\d[13579][26]|\\d\\d0[48]|[02468][048]00|[13579][26]00)-02-29|\\d{4}-(?:(?:0[13578]|1[02])-(?:0[1-9]|[12]\\d|3[01])|(?:0[469]|11)-(?:0[1-9]|[12]\\d|30)|(?:02)-(?:0[1-9]|1\\d|2[0-8])))T(?:(?:[01]\\d|2[0-3]):[0-5]\\d(?::[0-5]\\d(?:\\.\\d+)?)?(?:Z|([+-](?:[01]\\d|2[0-3]):[0-5]\\d)))$",
            },
            {
              type: "null",
            },
          ],
        },
        slaType: {
          description: "SLA day counting type: \"all\" or \"onlyBusinessDays\". Only use with slaBreachesAt",
          type: "string",
          enum: [
            "all",
            "onlyBusinessDays",
          ],
        },
        parentId: {
          description: "Parent issue ID or identifier (e.g., LIN-123). Null to remove",
          anyOf: [
            {
              type: "string",
            },
            {
              type: "null",
            },
          ],
        },
        estimate: {
          description: "Issue estimate value. On create, pass null or omit for no estimate. On update, pass null to clear the estimate; omitting leaves it unchanged. 0 is a real estimate only on teams that allow zero estimates.",
          anyOf: [
            {
              type: "number",
            },
            {
              type: "null",
            },
          ],
        },
        links: {
          description: "Link attachments to add [{url, title}]. Append-only; existing links are never removed",
          type: "array",
          items: {
            type: "object",
            properties: {
              url: {
                type: "string",
                format: "uri",
              },
              title: {
                type: "string",
                minLength: 1,
              },
            },
            required: [
              "url",
              "title",
            ],
          },
        },
        setReleases: {
          description: "Replace all releases on the issue with these. Cannot be combined with addReleases/removeReleases",
          type: "array",
          items: {
            type: "string",
          },
        },
        addReleases: {
          description: "Release IDs or slugs to add. Append-only; existing releases are never removed",
          type: "array",
          items: {
            type: "string",
          },
        },
        removeReleases: {
          description: "Release IDs or slugs to remove. Only valid when updating an existing issue",
          type: "array",
          items: {
            type: "string",
          },
        },
        blocks: {
          description: "Issue IDs/identifiers this blocks. Append-only; existing relations are never removed",
          type: "array",
          items: {
            type: "string",
          },
        },
        blockedBy: {
          description: "Issue IDs/identifiers blocking this. Append-only; existing relations are never removed",
          type: "array",
          items: {
            type: "string",
          },
        },
        relatedTo: {
          description: "Related issue IDs/identifiers. Append-only; existing relations are never removed",
          type: "array",
          items: {
            type: "string",
          },
        },
        duplicateOf: {
          description: "Duplicate of issue ID/identifier. Null to remove",
          anyOf: [
            {
              type: "string",
            },
            {
              type: "null",
            },
          ],
        },
        removeBlocks: {
          description: "Issue IDs/identifiers to stop blocking",
          type: "array",
          items: {
            type: "string",
          },
        },
        removeBlockedBy: {
          description: "Issue IDs/identifiers to remove as blockers of this issue",
          type: "array",
          items: {
            type: "string",
          },
        },
        removeRelatedTo: {
          description: "Related issue IDs/identifiers to remove",
          type: "array",
          items: {
            type: "string",
          },
        },
      },
      additionalProperties: false,
    },
  },
  "save_comment": {
    schemaHash: "a734ef7fed07fac49776257e715cc84363c7cf8570fd0786aecbd5b9c396c48f",
    inputSchema: {
      $schema: "http://json-schema.org/draft-07/schema#",
      type: "object",
      properties: {
        id: {
          description: "Comment ID. If provided, updates the existing comment",
          type: "string",
        },
        issueId: {
          description: "Issue ID or identifier (e.g., LIN-123) (provide exactly one parent)",
          type: "string",
        },
        projectId: {
          description: "Project name, ID, or slug (provide exactly one parent)",
          type: "string",
        },
        initiativeId: {
          description: "Initiative name or ID (provide exactly one parent)",
          type: "string",
        },
        documentId: {
          description: "Document ID or slug (provide exactly one parent)",
          type: "string",
        },
        milestoneId: {
          description: "Milestone UUID (provide exactly one parent). Resolve milestone names via `list_milestones` first.",
          type: "string",
        },
        statusUpdateId: {
          description: "Status update UUID (provide exactly one parent). Resolve status updates via `get_status_updates` first.",
          type: "string",
        },
        statusUpdateType: {
          description: "Type of status update named by `statusUpdateId`, as returned by `get_status_updates`. Only valid together with `statusUpdateId`; omit to check both project and initiative status updates.",
          type: "string",
          enum: [
            "project",
            "initiative",
          ],
        },
        parentId: {
          description: "Parent comment ID (for replies, only when creating)",
          type: "string",
        },
        body: {
          type: "string",
          description: "Content as Markdown. Do not escape the string — use literal newlines and special characters, not escape sequences. To mention a user, use @displayName (e.g., @johndoe)",
        },
      },
      required: [
        "body",
      ],
      additionalProperties: false,
    },
  },
};
