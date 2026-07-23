// Generated from integrations/linear/mcp-catalog.ts + mcp-snapshot.json (npm run mcp:import -- generate linear).
// Curate the catalog and regenerate rather than hand-editing this file.
// Registration fragments: spread these into services/discovery/_metaInventory.ts
// and services/execution/handlers/_handlerInventory.ts when this provider's
// actions REGISTER (executor slice). Until then the action files are orphans
// by design (CLAUDE.md rule 14 — registry presence defines the action set).
import { findIssuesMeta } from "./findIssues.meta";
import { createIssueMeta } from "./createIssue.meta";
import { updateIssueMeta } from "./updateIssue.meta";
import { addCommentMeta } from "./addComment.meta";
import { findIssues } from "./findIssues";
import { createIssue } from "./createIssue";
import { updateIssue } from "./updateIssue";
import { addComment } from "./addComment";

export const linearGeneratedActionMetas = [
  findIssuesMeta,
  createIssueMeta,
  updateIssueMeta,
  addCommentMeta,
] as const;

export const linearGeneratedHandlers = [
  { provider: "linear", type: "find_issues", handler: findIssues },
  { provider: "linear", type: "create_issue", handler: createIssue },
  { provider: "linear", type: "update_issue", handler: updateIssue },
  { provider: "linear", type: "add_comment", handler: addComment },
] as const;
