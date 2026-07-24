"use client";

import { useState, type ReactNode } from "react";
import { useDocumentMenuKeyboard } from "./documentMenuKeyboard";

/**
 * Document Builder — manual insertion menu (5.DUAL-BUILDER-1 / CS-6).
 *
 * The "＋" affordance opens Step / Branch / Ask React (Creation Layer mock).
 * There is NO Loop entry (no runtime primitive). Each action flows through the
 * injected handler, which delegates to the EXISTING shared pickers / CS-5 branch
 * commands / the one agent entry. Router is shown ONLY where it is a valid
 * placement (tail / empty lane) — the locked rule refuses Router-between.
 *
 * DOC-STEP-CONTROLS-1 — the trigger is ALWAYS VISIBLE (a quiet compact "＋" that
 * widens to its label on hover/focus) rather than hover-revealed, so insertion
 * points between the trigger and each action are discoverable without hovering.
 * The label text stays in the DOM at all times (visually collapsed) and the
 * button carries an explicit `aria-label`, so the accessible name never depends
 * on hover. GROUPING is NOT an insertion action — it moved to the per-step
 * overflow menu (`DocumentStepMenu`), so there is no "Section" entry here.
 * Keyboard-accessible: the trigger and every item are focusable buttons; Escape
 * closes (see `useDocumentMenuKeyboard`).
 */
export function DocumentInsertMenu({
  onStep,
  onIfThen,
  onRouter,
  onAskReact,
  branchLocked,
  testId,
  label = "Add",
}: {
  onStep: () => void;
  onIfThen: () => void;
  /** Undefined → Router is not a valid placement here (e.g. between two nodes). */
  onRouter?: (() => void) | undefined;
  onAskReact: () => void;
  branchLocked?: boolean | undefined;
  testId: string;
  /** Visible-on-hover label AND the always-present accessible name. */
  label?: string;
}) {
  const [open, setOpen] = useState(false);
  const [branchOpen, setBranchOpen] = useState(false);

  const close = () => {
    setOpen(false);
    setBranchOpen(false);
  };
  const { rootRef, onKeyDown, onBlur } = useDocumentMenuKeyboard({
    open,
    onOpen: () => setOpen(true),
    onClose: close,
  });
  const run = (fn: () => void) => {
    close();
    fn();
  };

  return (
    <div ref={rootRef} className="relative inline-block" onKeyDown={onKeyDown} onBlur={onBlur}>
      <button
        type="button"
        data-testid={testId}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={label}
        onClick={() => setOpen((o) => !o)}
        className="crv2-insert"
      >
        <span aria-hidden>＋</span>
        <span className="crv2-insert-label">{label}</span>
      </button>
      {open ? (
        <div
          role="menu"
          aria-label={label}
          data-testid={`${testId}-menu`}
          className="crv2-menu left-0 mt-1 min-w-[190px]"
        >
          <MenuItem testId={`${testId}-step`} onClick={() => run(onStep)}>
            Step
          </MenuItem>
          <button
            type="button"
            role="menuitem"
            data-testid={`${testId}-branch`}
            aria-haspopup="menu"
            aria-expanded={branchOpen}
            onClick={() => setBranchOpen((b) => !b)}
            className="crv2-menu-item flex items-center justify-between"
          >
            <span>Branch{branchLocked ? " · Pro" : ""}</span>
            <span aria-hidden>›</span>
          </button>
          {branchOpen ? (
            <div role="menu" className="border-t" style={{ borderColor: "var(--builder-border)" }}>
              <MenuItem testId={`${testId}-ifthen`} onClick={() => run(onIfThen)} indent>
                If/Then
              </MenuItem>
              {onRouter ? (
                <MenuItem testId={`${testId}-router`} onClick={() => run(onRouter)} indent>
                  Router
                </MenuItem>
              ) : (
                <div
                  data-testid={`${testId}-router-unavailable`}
                  className="px-3 py-1.5 pl-6 text-[11.5px]"
                  style={{ color: "var(--builder-muted-2)" }}
                >
                  Router — add at the end of a path
                </div>
              )}
            </div>
          ) : null}
          <div className="my-1 border-t" style={{ borderColor: "var(--builder-border)" }} />
          <MenuItem testId={`${testId}-askreact`} onClick={() => run(onAskReact)}>
            Ask React to add it
          </MenuItem>
        </div>
      ) : null}
    </div>
  );
}

function MenuItem({
  testId,
  onClick,
  indent,
  children,
}: {
  testId: string;
  onClick: () => void;
  indent?: boolean;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      role="menuitem"
      data-testid={testId}
      onClick={onClick}
      className={`crv2-menu-item ${indent ? "pl-6" : ""}`}
    >
      {children}
    </button>
  );
}
