"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { GuidedStopTarget } from "./useDocumentGuidedStop";
import type { SetupQueue, SetupQueueItem } from "./setupQueueModel";

/**
 * 5.DUAL-BUILDER-1 CS-3 — the Finish Setup queue session over the LIVE queue.
 *
 * Opt-in and never a forced wizard: `active` is false until the user starts it,
 * and normal Document editing is never blocked. The queue itself is derived
 * LIVE by the caller (`buildSetupQueue` over the current graph/config) and
 * passed in every render — this hook owns only the SESSION: which item is
 * active, which were skipped this session (in-memory only, never persisted),
 * and safe navigation under live re-ordering.
 *
 * It drives the REAL CS-2 Guided Stop (`openStop`) — there is no second
 * queue-specific editor. Committing a field resolves it in the shared store,
 * the queue re-derives without that item, and this hook advances to the next
 * still-valid item BY STABLE IDENTITY (never reopening a resolved item, never
 * silently skipping an unresolved one). An item invalidated by an unrelated
 * edit (its node deleted) is handled by the same advance path — no throw, no
 * graph mutation.
 */

export interface FinishSetupQueueApi {
  readonly active: boolean;
  /** True once the last supported item is resolved (queue emptied while active). */
  readonly completed: boolean;
  readonly activeItem: SetupQueueItem | null;
  /** 1-based position of the active item among live items (0 when none). */
  readonly activeIndex: number;
  readonly total: number;
  /** True when the Guided Stop editor is open for the active item. */
  readonly editing: boolean;
  readonly skippedCount: number;
  start(): void;
  exit(): void;
  next(): void;
  prev(): void;
  skip(): void;
  /** Re-open the active item's Guided Stop after a Cancel. */
  resume(): void;
  goToItem(itemId: string): void;
  /** Point the queue at a node's first supported stop; false if none. */
  goToNode(nodeId: string, fieldKey?: string): boolean;
  isSkipped(itemId: string): boolean;
}

export function useFinishSetupQueue(input: {
  queue: SetupQueue;
  stop: GuidedStopTarget | null;
  openStop: (nodeId: string, fieldKey: string) => unknown;
  releaseStop: () => void;
}): FinishSetupQueueApi {
  const { queue, stop, openStop, releaseStop } = input;
  const items = queue.items;

  const [active, setActive] = useState(false);
  const [activeItemId, setActiveItemId] = useState<string | null>(null);
  const [completed, setCompleted] = useState(false);
  const [skipped, setSkipped] = useState<ReadonlySet<string>>(() => new Set());

  const activeItem = useMemo(
    () => (activeItemId ? (items.find((i) => i.id === activeItemId) ?? null) : null),
    [items, activeItemId],
  );
  const activeIndex = activeItem ? items.findIndex((i) => i.id === activeItem.id) + 1 : 0;

  // Remember the resolving item's document position so advance moves FORWARD
  // (to the next node, or the same node's next field) rather than jumping back.
  const lastOrderRef = useRef<number | null>(null);
  useEffect(() => {
    if (activeItem) lastOrderRef.current = activeItem.documentOrder;
  }, [activeItem]);

  const editing =
    active &&
    activeItem !== null &&
    stop !== null &&
    stop.nodeId === activeItem.nodeId &&
    stop.fieldName === activeItem.fieldKey;

  const openItem = useCallback(
    (item: SetupQueueItem | null) => {
      if (!item) {
        setActiveItemId(null);
        return;
      }
      setActiveItemId(item.id);
      lastOrderRef.current = item.documentOrder;
      openStop(item.nodeId, item.fieldKey);
    },
    [openStop],
  );

  const start = useCallback(() => {
    setActive(true);
    setCompleted(false);
    setSkipped(new Set());
    openItem(items[0] ?? null);
  }, [items, openItem]);

  const exit = useCallback(() => {
    setActive(false);
    setActiveItemId(null);
    setCompleted(false);
    setSkipped(new Set());
    releaseStop();
  }, [releaseStop]);

  const goToItem = useCallback(
    (itemId: string) => {
      const item = items.find((i) => i.id === itemId) ?? null;
      if (!item) return;
      setActive(true);
      setCompleted(false);
      openItem(item);
    },
    [items, openItem],
  );

  const goToNode = useCallback(
    (nodeId: string, fieldKey?: string): boolean => {
      const item =
        (fieldKey && items.find((i) => i.nodeId === nodeId && i.fieldKey === fieldKey)) ||
        items.find((i) => i.nodeId === nodeId) ||
        null;
      if (!item) return false;
      goToItem(item.id);
      return true;
    },
    [items, goToItem],
  );

  const move = useCallback(
    (delta: number) => {
      if (!activeItem) return;
      const idx = items.findIndex((i) => i.id === activeItem.id);
      const target = items[idx + delta];
      if (target) openItem(target);
    },
    [activeItem, items, openItem],
  );
  const next = useCallback(() => move(1), [move]);
  const prev = useCallback(() => move(-1), [move]);

  const resume = useCallback(() => {
    if (activeItem) openItem(activeItem);
  }, [activeItem, openItem]);

  const pickNextAvailable = useCallback(
    (skippedSet: ReadonlySet<string>, afterOrder: number | null): SetupQueueItem | null => {
      const avail = items.filter((i) => !skippedSet.has(i.id));
      if (avail.length === 0) return null;
      if (afterOrder === null) return avail[0]!;
      return avail.find((i) => i.documentOrder >= afterOrder) ?? avail[0]!;
    },
    [items],
  );

  const skip = useCallback(() => {
    if (!activeItem) return;
    const nextSkipped = new Set(skipped);
    nextSkipped.add(activeItem.id);
    setSkipped(nextSkipped);
    // Advance strictly past the skipped item; never reopen it this session.
    const avail = items.filter((i) => !nextSkipped.has(i.id));
    const target =
      avail.find((i) => i.documentOrder > activeItem.documentOrder) ?? avail[0] ?? null;
    if (target) openItem(target);
    else {
      // Nothing left to visit this session (all remaining are skipped).
      setActiveItemId(null);
      releaseStop();
    }
  }, [activeItem, items, skipped, openItem, releaseStop]);

  // Advance-after-resolve: when the active item leaves the live queue (resolved,
  // or its node was deleted), move to the next still-valid, non-skipped item by
  // document position — or complete cleanly. Pure navigation; never mutates.
  useEffect(() => {
    if (!active || activeItemId === null) return;
    if (items.some((i) => i.id === activeItemId)) return;
    const nextItem = pickNextAvailable(skipped, lastOrderRef.current);
    if (nextItem) {
      setActiveItemId(nextItem.id);
      lastOrderRef.current = nextItem.documentOrder;
      openStop(nextItem.nodeId, nextItem.fieldKey);
    } else {
      setActiveItemId(null);
      // Only "completed" when the queue truly emptied (not merely all-skipped).
      if (items.length === 0) setCompleted(true);
    }
  }, [active, activeItemId, items, skipped, pickNextAvailable, openStop]);

  const isSkipped = useCallback((itemId: string) => skipped.has(itemId), [skipped]);

  return {
    active,
    completed,
    activeItem,
    activeIndex,
    total: queue.supportedCount,
    editing,
    skippedCount: skipped.size,
    start,
    exit,
    next,
    prev,
    skip,
    resume,
    goToItem,
    goToNode,
    isSkipped,
  };
}
