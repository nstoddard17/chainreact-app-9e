"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { MAX_SECTION_TITLE } from "@/contracts/workflowPresentation";
import type { DocumentSection } from "./documentSections";

/**
 * 5.DUAL-BUILDER-1 CS-4 — a manual GROUP's header (stored as a presentation
 * "section"; DOC-STEP-CONTROLS-1 renamed the user-facing concept to "group"
 * because the stored data was never anything but visual organization).
 *
 * A named boundary around contiguous top-level Document blocks — a clear
 * grouping, NOT a stacked SaaS card. It offers: an explicit "GROUP" eyebrow and
 * a standing one-line explanation that grouping never changes execution, an
 * inline-editable name (Enter/blur commits through graphSlice; Escape restores
 * the original), a collapse/expand control, and a plain context action to
 * UNGROUP (remove the wrapper only — the workflow steps stay exactly where they
 * are; deleting steps is the existing, separate action). When collapsed it shows
 * a deterministic summary (steps · apps/paths · unresolved details) generated
 * from the DocumentModel — never persisted, never an LLM.
 */
export const GROUP_ORGANIZATIONAL_NOTE =
  "Grouping is visual only — it doesn’t change the order your steps run in.";

export function DocumentSectionHeader({
  section,
  collapsed,
  summaryText,
  autoEditName,
  onAutoEditNameHandled,
  onRename,
  onToggleCollapse,
  onUngroup,
  children,
}: {
  section: DocumentSection;
  /** Effective collapse (false while a Guided Stop / navigation reveals it). */
  collapsed: boolean;
  summaryText: string;
  /**
   * DOC-STEP-CONTROLS-1 — true for a group the user JUST created, so it opens
   * straight into naming instead of presenting an unexplained default card.
   */
  autoEditName?: boolean | undefined;
  onAutoEditNameHandled?: (() => void) | undefined;
  onRename: (title: string) => void;
  onToggleCollapse: () => void;
  onUngroup: () => void;
  /** The section body (rendered blocks) — shown only while expanded. */
  children?: ReactNode;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(section.title);
  const [menuOpen, setMenuOpen] = useState(false);
  const inputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (!editing) return;
    inputRef.current?.focus();
    inputRef.current?.select(); // a freshly-created group opens ready to be renamed
  }, [editing]);

  useEffect(() => {
    if (autoEditName !== true) return;
    setDraft(section.title);
    setEditing(true);
    onAutoEditNameHandled?.();
    // Only ever runs on the create transition (the flag is cleared immediately).
  }, [autoEditName, section.title, onAutoEditNameHandled]);

  const commit = () => {
    setEditing(false);
    const trimmed = draft.trim();
    if (trimmed.length > 0 && trimmed !== section.title) onRename(trimmed);
    else setDraft(section.title);
  };
  const cancel = () => {
    setEditing(false);
    setDraft(section.title); // Escape restores the original title
  };

  return (
    <div
      data-testid={`document-section-${section.id}`}
      data-section-id={section.id}
      data-collapsed={collapsed ? "true" : "false"}
      className="crv2-section"
    >
      <div className={`group/section crv2-section-head${collapsed ? "" : " crv2-section-head--open"}`}>
        <button
          type="button"
          data-testid={`document-section-collapse-${section.id}`}
          onClick={onToggleCollapse}
          aria-expanded={!collapsed}
          aria-label={collapsed ? `Expand group ${section.title}` : `Collapse group ${section.title}`}
          className="crv2-section-toggle"
        >
          <span aria-hidden>{collapsed ? "▸" : "▾"}</span>
        </button>

        <span aria-hidden className="crv2-eyebrow">
          Group
        </span>

        {editing ? (
          <input
            ref={inputRef}
            data-testid={`document-section-title-input-${section.id}`}
            aria-label="Group name"
            value={draft}
            maxLength={MAX_SECTION_TITLE}
            onChange={(e) => setDraft(e.target.value)}
            onBlur={commit}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                commit();
              } else if (e.key === "Escape") {
                e.preventDefault();
                e.stopPropagation();
                cancel();
              }
            }}
            className="min-w-0 flex-1 rounded-md px-2 py-1 text-[13.5px] font-semibold outline-none"
            style={{
              background: "var(--builder-panel)",
              color: "var(--builder-text)",
              border: "1.5px solid var(--builder-accent)",
            }}
          />
        ) : (
          <button
            type="button"
            data-testid={`document-section-title-${section.id}`}
            onClick={() => {
              setDraft(section.title);
              setEditing(true);
            }}
            className="crv2-section-title truncate"
            title="Rename this group"
            aria-label={`Rename group ${section.title}`}
          >
            {section.title}
            {section.split ? (
              <span
                data-testid={`document-section-split-${section.id}`}
                className="ml-2 align-middle text-[11px] font-normal"
                style={{ color: "var(--builder-muted)" }}
              >
                (continued)
              </span>
            ) : null}
          </button>
        )}

        {collapsed ? (
          <span
            data-testid={`document-section-summary-${section.id}`}
            className="crv2-section-summary"
          >
            {summaryText}
          </span>
        ) : null}

        <div className="relative ml-auto">
          <button
            type="button"
            data-testid={`document-section-menu-${section.id}`}
            onClick={() => setMenuOpen((v) => !v)}
            aria-haspopup="menu"
            aria-expanded={menuOpen}
            aria-label={`Group actions for ${section.title}`}
            className="crv2-step-menu-button"
          >
            <span aria-hidden>⋯</span>
          </button>
          {menuOpen ? (
            <div role="menu" aria-label="Group actions" className="crv2-menu right-0 top-7 w-52">
              <button
                type="button"
                role="menuitem"
                data-testid={`document-section-rename-${section.id}`}
                onClick={() => {
                  setMenuOpen(false);
                  setDraft(section.title);
                  setEditing(true);
                }}
                className="crv2-menu-item"
              >
                Rename group
              </button>
              <button
                type="button"
                role="menuitem"
                data-testid={`document-section-ungroup-${section.id}`}
                onClick={() => {
                  setMenuOpen(false);
                  onUngroup();
                }}
                className="crv2-menu-item"
                title="Remove the group wrapper — your steps stay exactly where they are"
              >
                Ungroup
              </button>
            </div>
          ) : null}
        </div>

        {/* The standing explanation: a group is organization, never execution. */}
        {collapsed ? null : (
          <p data-testid={`document-section-note-${section.id}`} className="crv2-section-note m-0">
            {GROUP_ORGANIZATIONAL_NOTE}
          </p>
        )}
      </div>
      {!collapsed ? children : null}
    </div>
  );
}
