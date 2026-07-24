"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { MAX_SECTION_TITLE } from "@/contracts/workflowPresentation";
import type { DocumentSection } from "./documentSections";

/**
 * 5.DUAL-BUILDER-1 CS-4 — a manual section's header.
 *
 * A named boundary around contiguous top-level Document blocks — a clear
 * grouping, NOT a stacked SaaS card. It offers: an inline-editable title
 * (Enter/blur commits through graphSlice; Escape restores the original), a
 * collapse/expand control, and a plain context action to UNGROUP (remove the
 * wrapper only — the workflow steps stay exactly where they are; deleting steps
 * is the existing, separate action). When collapsed it shows a deterministic
 * summary (steps · apps/paths · unresolved details) generated from the
 * DocumentModel — never persisted, never an LLM.
 */
export function DocumentSectionHeader({
  section,
  collapsed,
  summaryText,
  onRename,
  onToggleCollapse,
  onUngroup,
  children,
}: {
  section: DocumentSection;
  /** Effective collapse (false while a Guided Stop / navigation reveals it). */
  collapsed: boolean;
  summaryText: string;
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
    if (editing) inputRef.current?.focus();
  }, [editing]);

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
          aria-label={collapsed ? "Expand section" : "Collapse section"}
          className="crv2-section-toggle"
        >
          {collapsed ? "▸" : "▾"}
        </button>

        {editing ? (
          <input
            ref={inputRef}
            data-testid={`document-section-title-input-${section.id}`}
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
            title="Rename section"
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
            aria-label="Section actions"
            className="inline-flex h-6 items-center rounded-md px-2 text-[13px] font-medium opacity-0 transition-opacity focus:opacity-100 group-hover/section:opacity-100 motion-reduce:transition-none"
            style={{ color: "var(--builder-muted)", border: "1px solid var(--builder-border)" }}
          >
            ⋯
          </button>
          {menuOpen ? (
            <div
              role="menu"
              className="absolute right-0 top-7 z-20 w-44 rounded-lg py-1 text-[12.5px]"
              style={{
                background: "var(--builder-panel)",
                border: "1px solid var(--builder-border)",
                boxShadow: "0 14px 34px -18px rgba(0,0,0,.4)",
              }}
            >
              <button
                type="button"
                role="menuitem"
                data-testid={`document-section-rename-${section.id}`}
                onClick={() => {
                  setMenuOpen(false);
                  setDraft(section.title);
                  setEditing(true);
                }}
                className="block w-full px-3 py-1.5 text-left"
                style={{ color: "var(--builder-text)" }}
              >
                Rename
              </button>
              <button
                type="button"
                role="menuitem"
                data-testid={`document-section-ungroup-${section.id}`}
                onClick={() => {
                  setMenuOpen(false);
                  onUngroup();
                }}
                className="block w-full px-3 py-1.5 text-left"
                style={{ color: "var(--builder-text)" }}
                title="Remove the section wrapper — your steps stay exactly where they are"
              >
                Ungroup section
              </button>
            </div>
          ) : null}
        </div>
      </div>
      {!collapsed ? children : null}
    </div>
  );
}
