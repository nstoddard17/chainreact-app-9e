import { createHash } from "node:crypto";
import { refreshAndRetry } from "@/services/oauth/refreshAndRetry";
import { reportsList } from "../../api/reports/reportsList";
import { datasetsList } from "../../api/datasets/datasetsList";
import { dataflowsList } from "../../api/dataflows/dataflowsList";
import { dashboardsList } from "../../api/dashboards/dashboardsList";
import { groupUsersList } from "../../api/groups/groupUsersList";
import { PowerBiWorkspaceItemAddedConfigSchema } from "../workspaceItemAdded/schema";
import { PowerBiWorkspaceItemRemovedConfigSchema } from "../workspaceItemRemoved/schema";
import { PowerBiWorkspaceAccessChangedConfigSchema } from "../workspaceAccessChanged/schema";
import {
  emitEvent,
  persistSnapshot,
  warnMissingSnapshot,
  type PowerBiPollInput,
} from "./pollShared";
import { buildIdSetSnapshot, findNewIds, findRemovedIds } from "./snapshot";

/**
 * The workspace domain: the three triggers that diff a workspace's own
 * contents.
 *
 *   - `workspace_item_added` / `_removed` — set difference over namespaced
 *     artifact ids.
 *   - `workspace_access_changed`          — per-principal role add/change/remove.
 *
 * `listWorkspaceItems` and `toAccessEntries` are exported because both
 * activation hooks and the pollers MUST build the workspace's state the
 * same way — a divergence between the seeded baseline and the polled state
 * would fire phantom add/remove events on the first tick.
 *
 * Shared invariants (mirroring `integrations/microsoft-excel/triggers/_shared`):
 *   - The snapshot MUST already exist (activation seeded it). A missing
 *     snapshot logs + skips — never re-seeds silently, which would swallow
 *     every change made since activation.
 *   - Dedup keys are derived from durable provider state, never from a
 *     timestamp, so two identical ticks produce an identical eventId and
 *     dedup at the engine boundary.
 *   - Payloads carry fixed key sets: no raw provider bodies, no provider
 *     URLs, no error blobs.
 */

// ─── workspace_item_added / workspace_item_removed ───────────────────────────

/** The controlled artifact-type filter the workspace-item triggers expose. */
export type WorkspaceItemType =
  | "report"
  | "semantic_model"
  | "dashboard"
  | "dataflow";

export interface WorkspaceItem {
  /** `${itemType}:${itemId}` — namespaced so ids can't collide across types. */
  key: string;
  itemType: WorkspaceItemType;
  itemId: string;
  itemName: string;
}

/**
 * Fetch the workspace's artifacts for the SELECTED types only.
 *
 * Each type maps to one list endpoint; unselected types are never fetched,
 * which keeps the tick cheap and (for dashboards) avoids an endpoint whose
 * scope grant is still open — see `api/dashboards/dashboardsList.ts`.
 *
 * Shared by the added/removed pollers and by both activation hooks so the
 * seeded baseline and the polled state are always built the same way.
 */
export async function listWorkspaceItems(input: {
  accountId: string;
  providerAccountId: string;
  workspaceId: string;
  itemTypes: ReadonlyArray<WorkspaceItemType>;
}): Promise<WorkspaceItem[]> {
  const { accountId, providerAccountId, workspaceId } = input;
  const selected = new Set(input.itemTypes);
  const items: WorkspaceItem[] = [];

  const call = <T>(apiCall: (accessToken: string) => Promise<T>): Promise<T> =>
    refreshAndRetry({
      accountId,
      provider: "microsoft-powerbi",
      providerAccountId,
      apiCall,
    });

  if (selected.has("report")) {
    const reports = await call((accessToken) =>
      reportsList({ accessToken, groupId: workspaceId }),
    );
    for (const r of reports) {
      items.push({
        key: `report:${r.id}`,
        itemType: "report",
        itemId: r.id,
        itemName: r.name,
      });
    }
  }
  if (selected.has("semantic_model")) {
    const datasets = await call((accessToken) =>
      datasetsList({ accessToken, groupId: workspaceId }),
    );
    for (const d of datasets) {
      items.push({
        key: `semantic_model:${d.id}`,
        itemType: "semantic_model",
        itemId: d.id,
        itemName: d.name,
      });
    }
  }
  if (selected.has("dashboard")) {
    const dashboards = await call((accessToken) =>
      dashboardsList({ accessToken, groupId: workspaceId }),
    );
    for (const d of dashboards) {
      items.push({
        key: `dashboard:${d.id}`,
        itemType: "dashboard",
        itemId: d.id,
        itemName: d.displayName,
      });
    }
  }
  if (selected.has("dataflow")) {
    const dataflows = await call((accessToken) =>
      dataflowsList({ accessToken, groupId: workspaceId }),
    );
    for (const d of dataflows) {
      items.push({
        key: `dataflow:${d.objectId}`,
        itemType: "dataflow",
        itemId: d.objectId,
        itemName: d.name,
      });
    }
  }

  return items;
}

/** Split a namespaced `${itemType}:${itemId}` snapshot key back apart. */
function parseItemKey(
  key: string,
): { itemType: string; itemId: string } | null {
  const separator = key.indexOf(":");
  if (separator <= 0 || separator === key.length - 1) return null;
  return {
    itemType: key.slice(0, separator),
    itemId: key.slice(separator + 1),
  };
}

export async function pollWorkspaceItemAdded(
  input: PowerBiPollInput,
): Promise<void> {
  const { trigger, providerAccountId, now } = input;
  const config = PowerBiWorkspaceItemAddedConfigSchema.parse(trigger.config);

  if (!config.snapshot) {
    warnMissingSnapshot(trigger, "workspace_item_added");
    return;
  }

  const items = await listWorkspaceItems({
    accountId: trigger.workflowAccountId!,
    providerAccountId,
    workspaceId: config.workspaceId,
    itemTypes: config.itemTypes,
  });

  const byKey = new Map(items.map((i) => [i.key, i]));
  for (const key of findNewIds(config.snapshot, [...byKey.keys()])) {
    const item = byKey.get(key)!;
    await emitEvent({
      trigger,
      providerAccountId,
      eventType: "workspace_item_added",
      key,
      payload: {
        workspaceId: config.workspaceId,
        itemType: item.itemType,
        itemId: item.itemId,
        itemName: item.itemName,
      },
    });
  }

  await persistSnapshot({
    triggerId: trigger.id,
    config,
    snapshot: { ...buildIdSetSnapshot([...byKey.keys()]) },
    now,
  });
}

/**
 * Removal counterpart. The artifact is already gone by the time the diff
 * sees it, so its display name is unknowable — the payload carries ids
 * only rather than inventing a name or replaying a stale one.
 */
export async function pollWorkspaceItemRemoved(
  input: PowerBiPollInput,
): Promise<void> {
  const { trigger, providerAccountId, now } = input;
  const config = PowerBiWorkspaceItemRemovedConfigSchema.parse(trigger.config);

  if (!config.snapshot) {
    warnMissingSnapshot(trigger, "workspace_item_removed");
    return;
  }

  const items = await listWorkspaceItems({
    accountId: trigger.workflowAccountId!,
    providerAccountId,
    workspaceId: config.workspaceId,
    itemTypes: config.itemTypes,
  });

  const currentKeys = items.map((i) => i.key);
  for (const key of findRemovedIds(config.snapshot, currentKeys)) {
    const parsed = parseItemKey(key);
    if (!parsed) continue;
    await emitEvent({
      trigger,
      providerAccountId,
      eventType: "workspace_item_removed",
      key,
      payload: {
        workspaceId: config.workspaceId,
        itemType: parsed.itemType,
        itemId: parsed.itemId,
      },
    });
  }

  await persistSnapshot({
    triggerId: trigger.id,
    config,
    snapshot: { ...buildIdSetSnapshot(currentKeys) },
    now,
  });
}

// ─── workspace_access_changed ────────────────────────────────────────────────

export interface WorkspaceAccessEntry {
  /** Email/UPN when the principal is a user, else the Entra object id. */
  principal: string;
  right: string;
}

/**
 * Project `groupUsersList` rows onto the snapshot's minimal shape.
 *
 * `principal` prefers the email/UPN (what an author recognises and what the
 * add/remove-user actions accept) and falls back to the Entra object id for
 * groups / service principals. Rows with neither are dropped — there is no
 * stable identity to diff them on, and inventing one would fire phantom
 * add/remove pairs every tick.
 */
export function toAccessEntries(
  users: ReadonlyArray<{
    identifier: string | null;
    emailAddress: string | null;
    groupUserAccessRight: string | null;
  }>,
): WorkspaceAccessEntry[] {
  const entries: WorkspaceAccessEntry[] = [];
  for (const user of users) {
    const principal = user.emailAddress ?? user.identifier;
    if (!principal) continue;
    entries.push({ principal, right: user.groupUserAccessRight ?? "None" });
  }
  return entries;
}

/**
 * Dedup keys land in `webhook_event_dedup`, and a workspace principal is
 * usually an email address. Per CLAUDE.md's dedup rule ("stable provider
 * ids — hashes, not raw PII") the key hashes the principal; the readable
 * value still reaches the workflow through the payload, which is marked
 * `sensitive` in the meta. Truncated to 16 hex chars: collision-free at
 * workspace scale (≤1,000 principals) and keeps the id readable in logs.
 */
function hashPrincipal(principal: string): string {
  return createHash("sha256").update(principal).digest("hex").slice(0, 16);
}

export async function pollWorkspaceAccessChanged(
  input: PowerBiPollInput,
): Promise<void> {
  const { trigger, providerAccountId, now } = input;
  const config = PowerBiWorkspaceAccessChangedConfigSchema.parse(trigger.config);

  if (!config.snapshot) {
    warnMissingSnapshot(trigger, "workspace_access_changed");
    return;
  }

  const users = await refreshAndRetry({
    accountId: trigger.workflowAccountId!,
    provider: "microsoft-powerbi",
    providerAccountId,
    apiCall: (accessToken) =>
      groupUsersList({ accessToken, groupId: config.workspaceId }),
  });

  const current = toAccessEntries(users);
  const previousByPrincipal = new Map(
    config.snapshot.entries.map((e) => [e.principal, e.right]),
  );
  const currentByPrincipal = new Map(current.map((e) => [e.principal, e.right]));

  const emit = (
    principal: string,
    changeType: "added" | "changed" | "removed",
    accessRight: string | null,
    previousAccessRight: string | null,
  ): Promise<void> =>
    emitEvent({
      trigger,
      providerAccountId,
      eventType: "workspace_access_changed",
      key: `${hashPrincipal(principal)}:${changeType}:${accessRight ?? "none"}`,
      payload: {
        workspaceId: config.workspaceId,
        principal,
        changeType,
        accessRight,
        previousAccessRight,
      },
    });

  for (const [principal, right] of currentByPrincipal) {
    const previousRight = previousByPrincipal.get(principal);
    if (previousRight === undefined) {
      await emit(principal, "added", right, null);
    } else if (previousRight !== right) {
      await emit(principal, "changed", right, previousRight);
    }
  }
  for (const [principal, previousRight] of previousByPrincipal) {
    if (!currentByPrincipal.has(principal)) {
      await emit(principal, "removed", null, previousRight);
    }
  }

  await persistSnapshot({
    triggerId: trigger.id,
    config,
    snapshot: { entries: current, updatedAt: new Date().toISOString() },
    now,
  });
}
