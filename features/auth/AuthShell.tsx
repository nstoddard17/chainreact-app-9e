import type { ReactNode } from "react";
import Link from "next/link";
import { MarketingBrandLogo } from "@/features/marketing/MarketingBrandLogo";
import { AuthShowcase } from "./AuthShowcase";
import { AuthSurfaceStyles } from "./AuthSurfaceStyles";

/**
 * Split-screen page frame shared by every auth route (Slice AUTH-DESIGN-1).
 *
 * Ported from the `Auth.html` handoff: brand + "you're signing into" context
 * pill across the top of the form column, the centred form well, the legal
 * footer, and the decorative brand panel on the right.
 *
 * Server component on purpose — it holds no state, so pages stay thin and only
 * the genuinely interactive bits ({@link AuthShowcase}, the forms) ship JS.
 * `data-auth-surface` scopes the `--au-*` palette from `app/globals.css` to this
 * subtree, so no other surface is re-themed.
 *
 * Responsive: `.au-root` collapses to a single column at 900px and the showcase
 * is hidden, leaving the form (and the legal footer) at full width — the design
 * specifies exactly this. The form well itself is capped at 380px and the
 * column padding steps down at 560px, so nothing scrolls horizontally on a
 * narrow phone.
 */
export function AuthShell({
  children,
  showcase = "sign-in",
}: {
  children: ReactNode;
  /** Drives only the showcase eyebrow copy; both variants are decorative. */
  showcase?: "sign-in" | "sign-up";
}) {
  return (
    <div
      className="au-root"
      data-auth-surface
      /*
       * RESPONSIVE-AUTH-8 — an auth page must never require sideways panning at
       * any supported width; there is no irreducibly-wide technical content here
       * to justify it. Declared at the top of the supported range rather than at
       * a breakpoint, per docs/rules/responsive-layout-and-validation.md §C.
       */
      data-no-pan-below="1600"
    >
      <main className="au-form-col">
        <header className="au-head">
          <Link href="/" className="au-brand" aria-label="ChainReact home">
            <MarketingBrandLogo size={30} fontSize={21} variant="nav" />
          </Link>
          <div className="au-ctx">
            <span>You&apos;re signing into</span>
            <span className="au-ctx-app">
              <span className="au-ctx-dot" aria-hidden />
              ChainReact
            </span>
          </div>
        </header>

        <div className="au-body">
          {/*
            RESPONSIVE-AUTH-8 — the form well is an ALLOCATED region (width:100%
            of the body, capped at 380px), so a legibility floor belongs here.
            280px is derived from the widest thing the well must hold on a phone:
            the six-cell verification code grid needs ~40px cells to stay a usable
            touch target, i.e. 6×40 + 5×8 of gap = 280px.

            This declaration is what makes a COMPRESSION failure detectable at
            all. Measured: with the ≤900px single-column collapse removed, the
            split persisted onto a 360px phone and this well fell to 128px — code
            cells 15px wide — while document width stayed at ZERO overflow. A
            containment-only sweep passes that silently. See §B of the responsive
            rule; this is the Team-roster lesson applied to auth.
          */}
          <div className="au-inner" data-legible-min="280" data-legible-what="auth form well">
            {children}
          </div>
        </div>

        <footer className="au-foot">
          By continuing you agree to ChainReact&apos;s{" "}
          <Link href="/terms">Terms of Service</Link> and{" "}
          <Link href="/privacy">Privacy Policy</Link>.
        </footer>
      </main>

      <AuthShowcase mode={showcase} />
      <AuthSurfaceStyles />
    </div>
  );
}

/**
 * Title block for an auth screen — eyebrow, heading, supporting line. Split out
 * so each page owns only its copy and every screen keeps identical rhythm.
 */
export function AuthHeading({
  eyebrow,
  title,
  children,
}: {
  eyebrow: string;
  title: string;
  children?: ReactNode;
}) {
  return (
    <>
      <div className="au-eyebrow">{eyebrow}</div>
      <h1 className="au-title">{title}</h1>
      {children ? <p className="au-sub">{children}</p> : null}
    </>
  );
}
