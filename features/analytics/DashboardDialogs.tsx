"use client";

import { useEffect, useRef, useState, type RefObject } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

/**
 * Dashboard action dialogs (CD-3B) — replacing `window.prompt` /
 * `window.confirm` in the Analytics flows this batch touches.
 *
 * The repo has no dialog library and no toast system, so these follow the
 * established hand-rolled convention (see features/workflows/folders/*):
 * a fixed overlay + `role="dialog" aria-modal`, inline `role="alert"` errors,
 * Cancel/confirm buttons from the shared `Button` primitive. Both dialogs add
 * what that convention usually omits and the spec requires: Escape to close,
 * focus moved to the primary control on open, and focus RETURNED to whatever
 * was focused before, so keyboard users don't get dropped at the page top.
 */

/** Move initial focus in, restore it on unmount, and close on Escape. */
function useDialogFocus(
  onClose: () => void,
  initial: RefObject<HTMLElement | null>,
): void {
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    initial.current?.focus();
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      previous?.focus?.();
    };
  }, [onClose, initial]);
}

/**
 * Name a dashboard — used for BOTH rename (prefilled) and create. Trims,
 * requires a non-empty name, and enforces the contract's 80-character cap
 * client-side so the round trip isn't wasted on a value the API will reject.
 */
export function DashboardNameDialog({
  mode,
  initialName = "",
  onSubmit,
  onClose,
}: {
  mode: "create" | "rename";
  initialName?: string;
  onSubmit: (name: string) => Promise<void>;
  onClose: () => void;
}) {
  const [name, setName] = useState(initialName);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);
  useDialogFocus(onClose, inputRef);

  const trimmed = name.trim();
  const title = mode === "rename" ? "Rename dashboard" : "New dashboard";

  const submit = async () => {
    if (trimmed.length === 0 || pending) return;
    setPending(true);
    setError(null);
    try {
      await onSubmit(trimmed);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't save the name.");
      setPending(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-[80] flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm"
      onClick={onClose}
      data-testid="dashboard-name-overlay"
    >
      <div
        role="dialog"
        aria-modal
        aria-label={title}
        className="w-full max-w-md rounded-xl border border-border bg-card p-5 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="text-sm font-semibold text-foreground">{title}</h2>
        <p className="mt-1 text-xs text-muted-foreground">
          {mode === "rename"
            ? "Everyone on this account sees the new name."
            : "Give your new dashboard a name. You can rename it later."}
        </p>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void submit();
          }}
        >
          <Input
            ref={inputRef}
            className="mt-3"
            aria-label="Dashboard name"
            placeholder="e.g. Revenue overview"
            value={name}
            maxLength={80}
            disabled={pending}
            onChange={(e) => setName(e.target.value)}
          />
          {error && (
            <p role="alert" className="mt-2 text-xs text-destructive">
              {error}
            </p>
          )}
          <div className="mt-4 flex justify-end gap-2">
            <Button type="button" variant="outline" size="sm" onClick={onClose} disabled={pending}>
              Cancel
            </Button>
            <Button type="submit" size="sm" disabled={pending || trimmed.length === 0}>
              {pending ? "Saving…" : mode === "rename" ? "Save name" : "Create"}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}

/** Confirm a consequential dashboard action (restore default layout). */
export function DashboardConfirmDialog({
  title,
  body,
  confirmLabel,
  destructive = false,
  onConfirm,
  onClose,
}: {
  title: string;
  body: string;
  confirmLabel: string;
  destructive?: boolean;
  onConfirm: () => Promise<void>;
  onClose: () => void;
}) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const confirmRef = useRef<HTMLButtonElement | null>(null);
  useDialogFocus(onClose, confirmRef);

  const confirm = async () => {
    if (pending) return;
    setPending(true);
    setError(null);
    try {
      await onConfirm();
    } catch (err) {
      setError(err instanceof Error ? err.message : "That didn't work. Try again.");
      setPending(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-[80] flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm"
      onClick={onClose}
      data-testid="dashboard-confirm-overlay"
    >
      <div
        role="dialog"
        aria-modal
        aria-label={title}
        className="w-full max-w-md rounded-xl border border-border bg-card p-5 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="text-sm font-semibold text-foreground">{title}</h2>
        <p className="mt-1 text-xs text-muted-foreground">{body}</p>
        {error && (
          <p role="alert" className="mt-2 text-xs text-destructive">
            {error}
          </p>
        )}
        <div className="mt-4 flex justify-end gap-2">
          <Button type="button" variant="outline" size="sm" onClick={onClose} disabled={pending}>
            Cancel
          </Button>
          <Button
            ref={confirmRef}
            type="button"
            size="sm"
            variant={destructive ? "destructive" : "default"}
            onClick={() => void confirm()}
            disabled={pending}
          >
            {pending ? "Working…" : confirmLabel}
          </Button>
        </div>
      </div>
    </div>
  );
}
