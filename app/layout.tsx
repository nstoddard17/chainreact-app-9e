import type { Metadata } from "next";
import { Geist, JetBrains_Mono } from "next/font/google";
import type { ReactNode } from "react";
import "./globals.css";

// Builder typography (4.BUILDER-DESIGN-PARITY-1). Geist + JetBrains Mono
// are loaded via `next/font/google` so Next can self-host them, avoid
// the `@next/next/no-page-custom-font` lint warning, and dodge a
// runtime fetch to `fonts.googleapis.com`. The CSS variables exposed
// here are referenced by `globals.css` (`.builder-mono`, default body
// stack) and by inline `var(--font-*)` in components.
const fontSans = Geist({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-sans",
  display: "swap",
});

const fontMono = JetBrains_Mono({
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  variable: "--font-mono",
  display: "swap",
});

export const metadata: Metadata = {
  title: "ChainReact",
  description: "Workflow automation",
};

export default function RootLayout({
  children,
}: {
  children: ReactNode;
}) {
  return (
    <html
      lang="en"
      className={`${fontSans.variable} ${fontMono.variable}`}
      // suppressHydrationWarning on <html> too — Scribe (Chrome extension
      // screen-recorder) injects `data-scribe-recorder-ready="true"` onto
      // <html> after mount, mirroring the <body> case below. The flag is
      // shallow per React; real mismatches inside the tree still surface.
      suppressHydrationWarning
    >
      {/*
        suppressHydrationWarning on <body> too — silences the false-positive
        hydration mismatch caused by browser extensions (Grammarly, LastPass,
        Dark Reader, etc.) that inject data-* attributes onto <body> after
        the page mounts. The flag is shallow (does NOT propagate to children),
        so real hydration mismatches anywhere inside the app still surface.
        Standard Next.js fix per react.dev/link/hydration-mismatch.
      */}
      <body suppressHydrationWarning>{children}</body>
    </html>
  );
}
