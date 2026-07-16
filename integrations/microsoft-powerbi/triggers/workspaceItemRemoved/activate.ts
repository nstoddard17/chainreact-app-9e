import type { ActivationFn } from "@/services/triggers/activationRegistry";
import { listWorkspaceItems } from "../_shared/pollWorkspace";
import { buildIdSetSnapshot } from "../_shared/snapshot";
import { PowerBiWorkspaceItemRemovedConfigSchema } from "./schema";

/**
 * `workspace_item_removed` activation hook.
 *
 * Seeds the workspace's current artifact set before the first poll — the
 * baseline is what "still exists"; anything that disappears from it later
 * fires. Items deleted BEFORE activation are unknowable and never fire.
 *
 * Throws on seed failure → TRIGGER_REGISTRATION_FAILED.
 */
export const activate: ActivationFn = async ({ integration, node }) => {
  const config = node.config as Record<string, unknown>;
  const parsed = PowerBiWorkspaceItemRemovedConfigSchema.parse({
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
