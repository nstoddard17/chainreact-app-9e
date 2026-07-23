"use client";

import { useRef, useState, type ReactNode } from "react";

/**
 * Document Builder — manual insertion menu (5.DUAL-BUILDER-1 / CS-6).
 *
 * The subtle "+" affordance opens Step / Branch / Section / Ask React (Creation
 * Layer mock). There is NO Loop entry (no runtime primitive). Each action flows
 * through the injected handler, which delegates to the EXISTING shared pickers /
 * CS-5 branch commands / CS-4 section commands / the one agent entry. Router is
 * shown ONLY where it is a valid placement (tail / empty lane) — the locked
 * rule refuses Router-between. Section is shown ONLY at top level. Keyboard-
 * accessible: the trigger and every item are focusable buttons; Escape closes.
 */
export function DocumentInsertMenu({
  onStep,
  onIfThen,
  onRouter,
  onSection,
  onAskReact,
  branchLocked,
  testId,
  label = "＋ Add",
}: {
  onStep: () => void;
  onIfThen: () => void;
  /** Undefined → Router is not a valid placement here (e.g. between two nodes). */
  onRouter?: (() => void) | undefined;
  /** Undefined → Section is unavailable here (e.g. inside a branch lane). */
  onSection?: (() => void) | undefined;
  onAskReact: () => void;
  branchLocked?: boolean | undefined;
  testId: string;
  label?: string;
}) {
  const [open, setOpen] = useState(false);
  const [branchOpen, setBranchOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement | null>(null);

  const close = () => {
    setOpen(false);
    setBranchOpen(false);
  };
  const run = (fn: () => void) => {
    close();
    fn();
  };

  // CS-7 — arrow-key navigation among the currently-rendered menu items (the
  // submenu items only exist in the DOM while the branch submenu is open).
  const moveFocus = (delta: 1 | -1 | "first" | "last") => {
    const items = rootRef.current
      ? Array.from(rootRef.current.querySelectorAll<HTMLElement>('[role="menuitem"]'))
      : [];
    if (items.length === 0) return;
    const idx = items.indexOf(document.activeElement as HTMLElement);
    let next: number;
    if (delta === "first") next = 0;
    else if (delta === "last") next = items.length - 1;
    else if (delta === 1) next = idx < 0 ? 0 : (idx + 1) % items.length;
    else next = idx <= 0 ? items.length - 1 : idx - 1;
    items[next]?.focus();
  };

  return (
    <div
      ref={rootRef}
      className="relative inline-block"
      onKeyDown={(e) => {
        if (e.key === "Escape") {
          e.stopPropagation();
          close();
          return;
        }
        if (!open) {
          if (e.key === "ArrowDown") {
            e.preventDefault();
            setOpen(true);
          }
          return;
        }
        if (e.key === "ArrowDown") {
          e.preventDefault();
          moveFocus(1);
        } else if (e.key === "ArrowUp") {
          e.preventDefault();
          moveFocus(-1);
        } else if (e.key === "Home") {
          e.preventDefault();
          moveFocus("first");
        } else if (e.key === "End") {
          e.preventDefault();
          moveFocus("last");
        }
      }}
      onBlur={(e) => {
        if (!rootRef.current?.contains(e.relatedTarget as Node)) close();
      }}
    >
      <button
        type="button"
        data-testid={testId}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        className="inline-flex h-7 items-center gap-1 rounded-full px-2.5 text-[11.5px] font-medium opacity-0 transition-opacity focus:opacity-100 group-hover:opacity-100 motion-reduce:transition-none"
        style={{ color: "var(--builder-muted)", border: "1.5px dashed var(--builder-border)" }}
      >
        {label}
      </button>
      {open ? (
        <div
          role="menu"
          data-testid={`${testId}-menu`}
          className="absolute left-0 z-20 mt-1 min-w-[190px] overflow-hidden rounded-lg py-1 text-[12.5px]"
          style={{ background: "var(--builder-panel)", border: "1px solid var(--builder-border)", boxShadow: "0 14px 34px -18px rgba(0,0,0,.4)" }}
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
            className="flex w-full items-center justify-between px-3 py-1.5 text-left hover:bg-[var(--builder-panel-2)]"
            style={{ color: "var(--builder-text)" }}
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
          {onSection ? (
            <MenuItem testId={`${testId}-section`} onClick={() => run(onSection)}>
              Section
            </MenuItem>
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
      className={`block w-full px-3 py-1.5 text-left hover:bg-[var(--builder-panel-2)] ${indent ? "pl-6" : ""}`}
      style={{ color: "var(--builder-text)" }}
    >
      {children}
    </button>
  );
}
