import type { ReactNode } from "react";
import { AppHeader } from "./AppHeader";

/**
 * Authenticated app shell (Slice 4.APP-SHELL-1).
 *
 * Wraps an authenticated dashboard page's content with the sticky top
 * header (brand + primary nav + mobile hamburger + user menu).
 *
 * **Architecture (locked with the user):** shared component, NOT a
 * Next.js route group. Authenticated pages (`/workflows`, `/apps`,
 * `/notifications`) wrap their existing `<main>` in `<AppShell userEmail
 * ={…}>`. URLs and import paths stay unchanged; the builder route
 * (`/workflows/[id]`) and marketing route (`/`) are untouched.
 *
 * Auth is the caller's responsibility — the shell ASSUMES it's
 * rendering inside a server component that has already verified
 * `auth.getUser()` and gated on it. Passing a `userEmail` here is the
 * one piece of profile data the shell shows; everything else (active
 * nav state, mobile open/close, sign-out form) is self-contained.
 */
interface Props {
  userEmail: string;
  children: ReactNode;
}

export function AppShell({ userEmail, children }: Props) {
  return (
    <div data-testid="app-shell-root" className="flex min-h-screen flex-col">
      <AppHeader userEmail={userEmail} />
      {children}
    </div>
  );
}
