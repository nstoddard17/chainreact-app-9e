"use client";

import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";

/**
 * Fade-up-on-enter wrapper for marketing sections (Slice 4.HOMEPAGE-V5-1).
 *
 * Mirrors the design's `ScrollReveal`. Sections ease in (opacity + 24px
 * rise) as they enter the viewport via IntersectionObserver. The global
 * `prefers-reduced-motion` query in `app/globals.css` already neutralizes
 * the transition; we also guard by showing immediately when IO is absent.
 */
export function MarketingScrollReveal({
  children,
  delay = 0,
}: {
  children: ReactNode;
  delay?: number;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [shown, setShown] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (typeof IntersectionObserver === "undefined") {
      setShown(true);
      return;
    }
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (e.isIntersecting) {
            setShown(true);
            io.disconnect();
          }
        }
      },
      { rootMargin: "0px 0px -10% 0px", threshold: 0.05 },
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);

  return (
    <div
      ref={ref}
      className={"mk-reveal" + (shown ? " is-in" : "")}
      style={{ ["--mk-reveal-delay" as string]: `${delay}ms` } as CSSProperties}
    >
      {children}
      <style>{`
        .mk-reveal {
          opacity: 0;
          transform: translateY(24px);
          transition:
            opacity .8s cubic-bezier(.2,.8,.3,1),
            transform .8s cubic-bezier(.2,.8,.3,1);
          transition-delay: var(--mk-reveal-delay, 0ms);
        }
        .mk-reveal.is-in { opacity: 1; transform: translateY(0); }
      `}</style>
    </div>
  );
}
