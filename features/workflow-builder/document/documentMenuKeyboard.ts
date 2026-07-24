"use client";

import { useCallback, useRef, type FocusEvent, type KeyboardEvent, type MutableRefObject } from "react";

/**
 * Document Builder — the ONE menu keyboard behaviour (DOC-STEP-CONTROLS-1).
 *
 * Extracted verbatim from the CS-7 insertion menu so the insertion "＋" menu and
 * the per-step overflow ("⋯") menu share exactly one implementation instead of
 * growing a second, subtly-different keyboard model:
 *   - Escape closes (and stops propagation so it never also cancels a Guided Stop);
 *   - ArrowDown opens a closed menu; ArrowUp/ArrowDown/Home/End move focus among
 *     the CURRENTLY-RENDERED items (a submenu's items only exist while open);
 *   - focus leaving the menu root closes it.
 *
 * Both `menuitem` and `menuitemcheckbox` participate in the roving focus.
 */
const MENU_ITEM_SELECTOR = '[role="menuitem"],[role="menuitemcheckbox"]';

export interface DocumentMenuKeyboard {
  readonly rootRef: MutableRefObject<HTMLDivElement | null>;
  readonly onKeyDown: (event: KeyboardEvent<HTMLDivElement>) => void;
  readonly onBlur: (event: FocusEvent<HTMLDivElement>) => void;
}

export function useDocumentMenuKeyboard({
  open,
  onOpen,
  onClose,
}: {
  open: boolean;
  onOpen: () => void;
  onClose: () => void;
}): DocumentMenuKeyboard {
  const rootRef = useRef<HTMLDivElement | null>(null);

  const moveFocus = useCallback((delta: 1 | -1 | "first" | "last") => {
    const items = rootRef.current
      ? Array.from(rootRef.current.querySelectorAll<HTMLElement>(MENU_ITEM_SELECTOR))
      : [];
    if (items.length === 0) return;
    const idx = items.indexOf(document.activeElement as HTMLElement);
    let next: number;
    if (delta === "first") next = 0;
    else if (delta === "last") next = items.length - 1;
    else if (delta === 1) next = idx < 0 ? 0 : (idx + 1) % items.length;
    else next = idx <= 0 ? items.length - 1 : idx - 1;
    items[next]?.focus();
  }, []);

  const onKeyDown = useCallback(
    (event: KeyboardEvent<HTMLDivElement>) => {
      if (event.key === "Escape") {
        event.stopPropagation();
        onClose();
        return;
      }
      if (!open) {
        if (event.key === "ArrowDown") {
          event.preventDefault();
          onOpen();
        }
        return;
      }
      if (event.key === "ArrowDown") {
        event.preventDefault();
        moveFocus(1);
      } else if (event.key === "ArrowUp") {
        event.preventDefault();
        moveFocus(-1);
      } else if (event.key === "Home") {
        event.preventDefault();
        moveFocus("first");
      } else if (event.key === "End") {
        event.preventDefault();
        moveFocus("last");
      }
    },
    [open, onOpen, onClose, moveFocus],
  );

  const onBlur = useCallback(
    (event: FocusEvent<HTMLDivElement>) => {
      if (!rootRef.current?.contains(event.relatedTarget as Node)) onClose();
    },
    [onClose],
  );

  return { rootRef, onKeyDown, onBlur };
}
