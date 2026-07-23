import type { ActionMeta } from "@/contracts/actionMeta";

/**
 * Linear discovery sub-registry (CS-3 LINEAR-1). Groups Linear's generated
 * action metadata so the central `_metaInventory.ts` stays manageable (same
 * pattern as `providers/eden.ts`). The central registry spreads
 * `LINEAR_ACTION_METAS`; module-load validation + duplicate-key rejection
 * happen centrally.
 *
 * META-ONLY by design: this file imports ONLY `.meta.ts` (never the handlers),
 * so the meta registry's import graph never pulls the executor / refresh /
 * repository code the handlers depend on. Handlers register separately in
 * `services/execution/handlers/_handlerInventory.ts`.
 *
 * Linear is the first MCP-CATALOG app: these metas are compiled from an
 * approved subset of the official Linear MCP server's `tools/list`
 * (`integrations/linear/mcp-catalog.ts` + `mcp-snapshot.json`) — but they are
 * ordinary `ActionMeta`, indistinguishable from native ones to the builder. The
 * provider manifest stays `isExperimental: true` (hidden from the default Apps
 * catalog) until live certification (CS-6). Linear has no triggers in phase 1
 * (actions-only; native triggers compose with MCP actions for free).
 */
import { findIssuesMeta } from "@/integrations/linear/actions/findIssues.meta";
import { createIssueMeta } from "@/integrations/linear/actions/createIssue.meta";
import { updateIssueMeta } from "@/integrations/linear/actions/updateIssue.meta";
import { addCommentMeta } from "@/integrations/linear/actions/addComment.meta";

export const LINEAR_ACTION_METAS: ReadonlyArray<ActionMeta> = [
  findIssuesMeta,
  createIssueMeta,
  updateIssueMeta,
  addCommentMeta,
];
