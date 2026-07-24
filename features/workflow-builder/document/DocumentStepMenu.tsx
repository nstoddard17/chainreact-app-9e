"use client";

import { useState } from "react";
import { useDocumentMenuKeyboard } from "./documentMenuKeyboard";

/**
 * Document Builder — the per-step overflow menu (DOC-STEP-CONTROLS-1).
 *
 * The QUIET, ALWAYS-VISIBLE "⋯" at the far right of a sentence. It replaces the
 * hover-only affordances (and the unlabeled select control that used to overlap
 * the marker rail): step management is discoverable without hovering, keyboard
 * reachable, and it occupies a RESERVED column so hovering a sentence never
 * reflows it.
 *
 * This component is presentational only. Every item delegates to a handler owned
 * by DocumentView, which routes through the EXISTING typed, non-throwing
 * document command layer (selection commands / section commands) — there is no
 * second command path and no menu-local mutation.
 */
export interface DocumentStepMenuItem {
  readonly key: string;
  readonly testId: string;
  readonly label: string;
  readonly onSelect: () => void;
  readonly title?: string;
  readonly disabled?: boolean;
  /** Present → renders as a `menuitemcheckbox` (used by Select / Deselect step). */
  readonly checked?: boolean;
}

export function DocumentStepMenu({
  testId,
  ariaLabel,
  items,
}: {
  testId: string;
  /** Accessible name, e.g. `Step 2 actions` — the "⋯" glyph names nothing. */
  ariaLabel: string;
  items: readonly DocumentStepMenuItem[];
}) {
  const [open, setOpen] = useState(false);
  const { rootRef, onKeyDown, onBlur } = useDocumentMenuKeyboard({
    open,
    onOpen: () => setOpen(true),
    onClose: () => setOpen(false),
  });

  if (items.length === 0) return null;

  return (
    <div ref={rootRef} className="relative" onKeyDown={onKeyDown} onBlur={onBlur}>
      <button
        type="button"
        data-testid={testId}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={ariaLabel}
        title={ariaLabel}
        onClick={() => setOpen((o) => !o)}
        className="crv2-step-menu-button"
      >
        <span aria-hidden>⋯</span>
      </button>
      {open ? (
        <div
          role="menu"
          aria-label={ariaLabel}
          data-testid={`${testId}-menu`}
          className="crv2-menu right-0 top-7"
        >
          {items.map((item) => (
            <button
              key={item.key}
              type="button"
              role={item.checked === undefined ? "menuitem" : "menuitemcheckbox"}
              {...(item.checked === undefined ? {} : { "aria-checked": item.checked })}
              data-testid={item.testId}
              disabled={item.disabled === true}
              {...(item.title ? { title: item.title } : {})}
              onClick={() => {
                setOpen(false);
                item.onSelect();
              }}
              className="crv2-menu-item"
            >
              {item.label}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}
