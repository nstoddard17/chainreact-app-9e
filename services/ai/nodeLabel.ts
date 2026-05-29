/**
 * Server-side node display-name resolver (Slice 4.BUILDER-NODE-IDENTITY-1).
 *
 * Thin wrapper that resolves the action/trigger metadata from the discovery
 * registry (synchronous server lookups) and feeds it to the pure
 * `getNodeDisplayName`. Used by the planner's currentCanvas serializer and the
 * AI preview change-summary builder so user-facing copy shows friendly node
 * names — never raw `provider:type` keys or raw node ids.
 *
 * The client resolves the same label via its provider/native meta hooks; this
 * exists only for server surfaces that have synchronous registry access.
 */

import {
  getNodeDisplayName,
  type NodeDisplayNameInput,
} from "@/core/workflows/nodeDisplayName";
import { getActionMeta, getTriggerMeta } from "@/services/ai/tools/providerCatalog";

export function resolveNodeDisplayNameFromRegistry(
  node: NodeDisplayNameInput,
): string {
  // A user-set custom name wins outright — skip the registry lookup.
  const custom = node.displayName?.trim();
  if (custom) return custom;

  const key = `${node.provider}:${node.type}`;
  const meta = node.kind === "action" ? getActionMeta(key) : getTriggerMeta(key);
  return getNodeDisplayName(
    node,
    meta.ok ? { displayName: meta.data.displayName } : null,
  );
}
