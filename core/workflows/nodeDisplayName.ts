/**
 * Pure resolver for a workflow node's USER-FACING display name
 * (Slice 4.BUILDER-NODE-IDENTITY-1).
 *
 * Separates the two identity concerns the builder must keep apart:
 *   - `node.id` is the system-owned, opaque, stable identifier (edges, patch
 *     references, execution dispatch, persistence all key on it).
 *   - the display name is a HUMAN label only — what the canvas, inspector,
 *     validation copy, and run history show a person. It is never identity.
 *
 * Resolution order (the first non-empty wins):
 *   1. the user's custom `node.displayName` (owned by the rename UI),
 *   2. the action/trigger metadata `displayName` (when the caller resolved it),
 *   3. a friendly title-cased form of the `type` key (`send_channel_message`
 *      → "Send Channel Message"),
 *   4. a kind fallback ("Trigger" / "Action") for an unconfigured node with no
 *      type yet.
 *
 * A raw node id is NEVER returned as the primary label. Pure + client-safe:
 * no metadata-registry import here — the caller passes the resolved `meta`
 * (server: `getActionMeta`/`getTriggerMeta`; client: the provider/native
 * meta hooks). See `services/ai/nodeLabel.ts` for the server registry wrapper.
 */

export interface NodeDisplayNameInput {
  readonly kind: "trigger" | "action";
  readonly provider: string;
  readonly type: string;
  /** User-set custom name (optional). Owned by the rename UI, never the AI. */
  readonly displayName?: string;
}

export interface NodeDisplayNameMeta {
  /** The action/trigger metadata display name, when the caller resolved it. */
  readonly displayName?: string | null;
}

/**
 * Title-case a provider-scoped type key for display. Splits on `_`, `.`, `-`,
 * `:` and capitalizes each word: `send_channel_message` → "Send Channel
 * Message", `manual.run` → "Manual Run". Returns "" for an empty key.
 */
export function formatTypeKey(type: string): string {
  return type
    .split(/[_.\-:]+/)
    .map((w) => w.trim())
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

export function getNodeDisplayName(
  node: NodeDisplayNameInput,
  meta?: NodeDisplayNameMeta | null,
): string {
  const custom = node.displayName?.trim();
  if (custom) return custom;

  const metaName = typeof meta?.displayName === "string" ? meta.displayName.trim() : "";
  if (metaName) return metaName;

  const formatted = node.type ? formatTypeKey(node.type) : "";
  if (formatted) return formatted;

  return node.kind === "trigger" ? "Trigger" : "Action";
}
