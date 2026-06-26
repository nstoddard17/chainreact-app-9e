"use client";

import { useEffect, useRef, useState, type RefObject } from "react";

/**
 * CS-APPS-RECOVERY-REVIEW-SCROLL — focus helper for the Apps card's "Review
 * reconnects" action.
 *
 * "Review reconnects" expands the collapsed card; on a long account list the
 * flagged rows could still be below the fold. Call {@link requestFocus} from the
 * Review click handler (alongside the expand state change); once the card is
 * `expanded` and the target row has mounted, the effect scrolls it into view and
 * moves focus to it. The pending flag exists because the target row only mounts
 * after `expanded` flips — focusing in the click handler would race the render.
 *
 * Only the Review action calls `requestFocus`, so a direct one-row Reconnect and a
 * plain chevron expand never steal focus. Returns a `ref` to attach to the first
 * reconnect-needed row (an accessible, programmatically-focusable `tabIndex=-1`
 * target).
 */
export function useReviewFocus(expanded: boolean): {
  readonly ref: RefObject<HTMLLIElement | null>;
  readonly requestFocus: () => void;
} {
  const [pending, setPending] = useState(false);
  const ref = useRef<HTMLLIElement | null>(null);

  useEffect(() => {
    if (!expanded || !pending) return;
    setPending(false);
    const el = ref.current;
    if (!el) return;
    // jsdom stubs scrollIntoView as a no-op; guard for environments without it.
    if (typeof el.scrollIntoView === "function") el.scrollIntoView({ block: "nearest" });
    el.focus(); // lands the user + assistive tech on the flagged row
  }, [expanded, pending]);

  return { ref, requestFocus: () => setPending(true) };
}
