import type { ActivationFn } from "@/services/triggers/activationRegistry";
import { listWorkspaceItems } from "../_shared/pollWorkspace";
import { buildIdSetSnapshot } from "../_shared/snapshot";
import { PowerBiWorkspaceItemAddedConfigSchema } from "./schema";

/**
 * `workspace_item_added` activation hook.
 *
 * Seeds the workspace's current artifact set before the first poll, so
 * pre-existing reports / models / dashboards / dataflows are NOT replayed
 * as additions — only artifacts created after activation fire.
 *
 * Seeds through the same `listWorkspaceItems` path the poller uses, so the
 * baseline and the diff always agree on id namespacing. Throws on seed
 * failure → TRIGGER_REGISTRATION_FAILED.
 */
export const activate: ActivationFn = async ({ integration, node }) => {
  const config = node.config as Record<string, unknown>;
  const parsed = PowerBiWorkspaceItemAddedConfigSchema.parse({
    workspaceId: config.workspaceId,
    itemTypes: config.itemTypes,
  });

  const items = await listWorkspaceItems({
    accountId: integration.accountId,
    providerAccountId: integration.providerAccountId,
    workspaceId: parsed.workspaceId,
    itemTypes: parsed.itemTypes,
  });

  return {
    pollingEnabled: true,
    snapshot: buildIdSetSnapshot(items.map((i) => i.key)),
  };
};
