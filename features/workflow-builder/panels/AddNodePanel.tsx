"use client";

import { useEffect, useRef, useState } from "react";
import type { ActionMeta } from "@/contracts/actionMeta";
import type { TriggerMeta } from "@/contracts/triggerMeta";
import { useNativeActions } from "../hooks/useNativeActions";
import { useNativeTriggers } from "../hooks/useNativeTriggers";
import { ActionPicker } from "./ActionPicker";
import { TriggerPicker } from "./TriggerPicker";

/**
 * Display + iconography record for a provider, threaded from the
 * server-side page component into AddNodePanel / canvas. Slice 4.BUILDER-INSPECTOR-1
 * added the optional `iconUrl`. Lives in this file (the panel that
 * actually consumes it) so the deleted `AddNodeMenu.tsx` isn't the
 * canonical source any more.
 */
export interface ProviderOption {
  id: string;
  displayName: string;
  /**
   * Public SVG URL for the provider's logo, sourced from
   * `integrations/_registry:providerIconUrl(id)`. Optional so non-V1
   * providers (and tests that don't care about iconography) keep
   * working. Builder UI renders an initials-avatar fallback when
   * absent or on `<img onError>`.
   */
  iconUrl?: string;
}

/**
 * AddNodePanel — searchable modal picker (Slice 4.BUILDER-ADD-FLOW-1).
 *
 * Replaces the inline AddNodeMenu toggle UI with a real modal overlay.
 * The panel:
 *   - Mode-aware: `trigger` shows the TriggerPicker, `action` and
 *     `insertAction` show the ActionPicker.
 *   - Searchable: a single input at the top filters whatever's visible
 *     (native list + drilled-in provider list). Provider chips stay
 *     visible so users can still discover providers.
 *   - Iconified: every visible provider chip / drill-in header carries
 *     the SVG icon from `providerIconUrl()` (threaded as
 *     `providerIcons`).
 *   - Esc / × / backdrop close.
 *
 * Boundary rules:
 *   - The panel owns picker chrome + search state + close. It does NOT
 *     dispatch graph mutations directly — picking a meta calls the
 *     parent callback so WorkflowBuilder can compose `addTriggerFromMeta` /
 *     `addActionFromMeta` / mid-chain insertion (the
 *     `insertAction.edgeId` rewire).
 *   - Reuses the existing TriggerPicker + ActionPicker (Slice 3.4 / 3.10),
 *     which now accept additive `searchQuery` + `providerIcons` props.
 *   - Mode is a small discriminated union so the insert context
 *     (`edgeId`) flows through to the parent on pick without separate
 *     plumbing.
 */

export type AddNodePanelMode =
  | { kind: "trigger" }
  | { kind: "action" }
  | { kind: "insertAction"; edgeId: string };

interface Props {
  mode: AddNodePanelMode;
  triggerProviders: readonly ProviderOption[];
  actionProviders: readonly ProviderOption[];
  providerIcons?: Readonly<Record<string, string>>;
  /** Called with the picked TriggerMeta when in `trigger` mode. */
  onPickTrigger: (meta: TriggerMeta) => void;
  /**
   * Called with the picked ActionMeta and the mode's `edgeId` (when in
   * `insertAction` mode). The parent decides whether to append or
   * compose a mid-chain insertion.
   */
  onPickAction: (
    meta: ActionMeta,
    insertContext: { edgeId: string } | null,
  ) => void;
  onClose: () => void;
}

export function AddNodePanel({
  mode,
  triggerProviders,
  actionProviders,
  providerIcons,
  onPickTrigger,
  onPickAction,
  onClose,
}: Props) {
  const [searchQuery, setSearchQuery] = useState("");
  const inputRef = useRef<HTMLInputElement | null>(null);

  // Autofocus the search input on open so the user can start typing
  // immediately.
  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  // Esc to close. Mirrors the BuilderRightDrawer's defaultPrevented
  // policy so nested popovers can swallow Esc first if needed.
  useEffect(() => {
    function handler(event: KeyboardEvent) {
      if (event.key !== "Escape") return;
      if (event.defaultPrevented) return;
      event.preventDefault();
      onClose();
    }
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [onClose]);

  // Native catalogs — both modes need at least one; loaded lazily by
  // the existing module-scoped cache. Keeping both hooks unconditional
  // satisfies Rules of Hooks regardless of mode.
  const nativeTriggers = useNativeTriggers();
  const nativeActions = useNativeActions();

  const title =
    mode.kind === "trigger"
      ? "Choose a trigger"
      : mode.kind === "insertAction"
        ? "Insert action"
        : "Choose an action";
  const subtitle =
    mode.kind === "trigger"
      ? "Every workflow starts with a trigger. Pick the event that should kick this workflow off."
      : mode.kind === "insertAction"
        ? "Pick the action to insert between the two connected nodes."
        : "Pick the action to add after the current step.";

  function handlePickTrigger(meta: TriggerMeta): void {
    onPickTrigger(meta);
    onClose();
  }

  function handlePickAction(meta: ActionMeta): void {
    const insertContext =
      mode.kind === "insertAction" ? { edgeId: mode.edgeId } : null;
    onPickAction(meta, insertContext);
    onClose();
  }

  return (
    <div
      data-testid="add-node-panel"
      // Modal overlay (4.BUILDER-DESIGN-PARITY-1): backdrop blur + dim
      // matching the Anthropic ChainV2 `.picker-overlay`. Click-outside
      // closes; clicks inside the card don't propagate so they don't
      // accidentally trigger close. role="dialog" lives on the inner
      // card so `getByRole("dialog")` resolves the actual panel.
      className="fixed inset-0 z-50 flex items-start justify-center p-4 pt-[90px]"
      style={{
        background: "rgba(0, 0, 0, 0.35)",
        backdropFilter: "blur(2px)",
        WebkitBackdropFilter: "blur(2px)",
      }}
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className="flex w-full max-w-[720px] flex-col overflow-hidden rounded-[8px]"
        style={{
          maxHeight: "calc(100vh - 180px)",
          background: "var(--builder-panel)",
          border: "1px solid var(--builder-border)",
          boxShadow: "var(--builder-shadow-lg)",
        }}
        onClick={(event) => event.stopPropagation()}
      >
        <header
          className="flex items-start justify-between gap-3 px-3 py-2.5"
          style={{ borderBottom: "1px solid var(--builder-border)" }}
        >
          <div className="flex min-w-0 flex-col gap-0.5">
            <h2
              className="truncate text-[13px] font-semibold"
              style={{ color: "var(--builder-text)" }}
            >
              {title}
            </h2>
            <p
              className="builder-mono text-[10.5px]"
              style={{ color: "var(--builder-muted)" }}
            >
              {subtitle}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close add-node panel"
            className="inline-flex h-[26px] w-[26px] items-center justify-center rounded-[4px] text-[14px]"
            style={{ color: "var(--builder-muted)" }}
          >
            ×
          </button>
        </header>
        <div
          className="flex items-center gap-2 px-3 py-2"
          style={{
            background: "var(--builder-panel-2)",
            borderBottom: "1px solid var(--builder-border)",
          }}
        >
          <SearchIcon />
          <input
            ref={inputRef}
            type="search"
            value={searchQuery}
            onChange={(event) => setSearchQuery(event.target.value)}
            placeholder={
              mode.kind === "trigger"
                ? "Search providers, triggers — or describe what you want"
                : "Search providers, actions — or describe what you want"
            }
            aria-label="Search add-node panel"
            className="flex-1 bg-transparent text-[13px] outline-none"
            style={{ color: "var(--builder-text)" }}
          />
          <code
            className="builder-mono rounded-[3px] px-1.5 py-0.5 text-[9.5px]"
            style={{
              background: "var(--builder-panel)",
              border: "1px solid var(--builder-border)",
              color: "var(--builder-muted)",
            }}
          >
            esc
          </code>
        </div>
        <div className="flex flex-1 flex-col overflow-y-auto px-3 py-2.5">
          {mode.kind === "trigger" ? (
            <TriggerPicker
              nativeTriggers={nativeTriggers.triggers}
              nativeLoading={nativeTriggers.loading}
              nativeError={nativeTriggers.error}
              triggerProviders={triggerProviders}
              onPickNative={handlePickTrigger}
              onPickProviderTrigger={handlePickTrigger}
              searchQuery={searchQuery}
              providerIcons={providerIcons}
            />
          ) : (
            <ActionPicker
              nativeActions={nativeActions.actions}
              nativeLoading={nativeActions.loading}
              nativeError={nativeActions.error}
              actionProviders={actionProviders}
              onPickAction={handlePickAction}
              searchQuery={searchQuery}
              providerIcons={providerIcons}
            />
          )}
        </div>
      </div>
    </div>
  );
}

const SearchIcon = () => (
  <svg
    width="13"
    height="13"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.8"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden
    style={{ color: "var(--builder-muted)" }}
  >
    <circle cx="11" cy="11" r="7" />
    <line x1="21" y1="21" x2="16.65" y2="16.65" />
  </svg>
);
