"use client";

import { useEffect, useId, useRef, useState } from "react";
import Link from "next/link";

/**
 * The public primary navigation (RESPONSIVE-MARKETING-9).
 *
 * WHY THIS EXISTS. The marketing header used to render the five primary links in
 * a plain row with one rule attached: `@media (max-width: 960px) { .mk-nav-links
 * { display: none } }`. Below 960px the links did not collapse into anything —
 * they simply disappeared, with no menu, no trigger and no replacement. Pricing,
 * the single most important page in the funnel after the homepage, became
 * unreachable from navigation on every phone. Nothing overflowed, so no
 * containment sweep would ever have reported it.
 *
 * ONE LINK LIST, ONE STATE SOURCE. The links are declared once in `NAV_LINKS` and
 * rendered once, into one `<nav>`. Wide and narrow are the SAME element with a
 * different presentation — never a desktop row beside a separate mobile menu,
 * which is how the two drift apart in what they offer. `open` is presentation
 * state only: above the breakpoint it is ignored entirely and the row is always
 * laid out, so a stale `open` can never hide desktop navigation.
 *
 * The information architecture is unchanged: same five destinations, same order,
 * same hrefs. This adds a way to reach them, it does not redesign them.
 */

/** The single declaration of the public primary destinations. */
export const NAV_LINKS: readonly { href: string; label: string }[] = [
  { href: "/#how-it-works", label: "How it works" },
  { href: "/#examples", label: "Examples" },
  { href: "/#apps", label: "Apps" },
  { href: "/pricing", label: "Pricing" },
  { href: "/#what-you-get", label: "Why ChainReact" },
];

export function MarketingNav() {
  const [open, setOpen] = useState(false);
  const panelId = useId();
  const toggleRef = useRef<HTMLButtonElement>(null);

  // Escape closes and returns focus to the trigger — the disclosure is inline
  // (not a modal), so it needs correct return-focus but not a focus trap.
  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") {
        setOpen(false);
        toggleRef.current?.focus();
      }
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open]);

  return (
    <div className="mk-nav-group" data-open={open ? "true" : undefined}>
      <button
        ref={toggleRef}
        type="button"
        className="mk-nav-toggle"
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => setOpen((o) => !o)}
        data-testid="marketing-nav-toggle"
      >
        <span className="mk-nav-toggle-bars" aria-hidden>
          <span />
          <span />
          <span />
        </span>
        {open ? "Close" : "Menu"}
      </button>

      <nav
        id={panelId}
        className="mk-nav-links"
        aria-label="Primary"
        data-testid="marketing-nav-links"
        data-legible-min="150"
        data-legible-what="primary navigation"
      >
        {NAV_LINKS.map((l) => (
          <Link
            key={l.href}
            href={l.href}
            className="mk-nav-link"
            onClick={() => setOpen(false)}
          >
            {l.label}
          </Link>
        ))}
      </nav>
    </div>
  );
}
