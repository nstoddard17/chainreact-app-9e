/**
 * ANON-BUILDER-1 — anonymous (logged-out) prompt handoff.
 *
 * A visitor can type a workflow idea on the marketing homepage and be taken
 * into the local-only builder (`/start`) WITHOUT signing in. The typed prompt is
 * parked in sessionStorage so it survives the homepage → `/start` navigation
 * (and an eventual sign-up round trip) without putting the raw text in the URL.
 *
 * Hard limits (security / privacy):
 *   - sessionStorage only (cleared when the tab closes), never localStorage.
 *   - Stores ONLY the user's own typed prompt string — never tokens, secrets,
 *     credential ids, account ids, or provider payloads.
 *   - Bounded length so a pathological paste can't bloat storage.
 *
 * Environment-agnostic: every accessor guards `window`/`sessionStorage` so the
 * module is import-safe from server components (it just no-ops there).
 */

const PROMPT_KEY = "chainreact:anon-builder-prompt";

/** Cap on the carried-over prompt. Mirrors the homepage textarea / builder composer. */
export const ANON_PROMPT_MAX_LENGTH = 2000;

function getSessionStorage(): Storage | null {
  try {
    if (typeof window === "undefined") return null;
    return window.sessionStorage ?? null;
  } catch {
    // Access can throw in privacy modes / sandboxed iframes.
    return null;
  }
}

/**
 * Persist the visitor's typed prompt (trimmed + length-bounded). An empty /
 * whitespace-only prompt clears any stored value. No-op when storage is
 * unavailable — the prompt simply isn't carried over.
 */
export function setAnonPrompt(prompt: string): void {
  const storage = getSessionStorage();
  if (!storage) return;
  const trimmed = (prompt ?? "").trim().slice(0, ANON_PROMPT_MAX_LENGTH);
  try {
    if (trimmed.length === 0) {
      storage.removeItem(PROMPT_KEY);
    } else {
      storage.setItem(PROMPT_KEY, trimmed);
    }
  } catch {
    // Quota / disabled storage — non-fatal.
  }
}

/** Read the stored prompt without clearing it. Returns "" when absent / unavailable. */
export function readAnonPrompt(): string {
  const storage = getSessionStorage();
  if (!storage) return "";
  try {
    return storage.getItem(PROMPT_KEY) ?? "";
  } catch {
    return "";
  }
}

/** Read AND clear the stored prompt (one-shot consume). */
export function consumeAnonPrompt(): string {
  const value = readAnonPrompt();
  clearAnonPrompt();
  return value;
}

/** Remove the stored prompt — called once it's been migrated into a saved account workflow. */
export function clearAnonPrompt(): void {
  const storage = getSessionStorage();
  if (!storage) return;
  try {
    storage.removeItem(PROMPT_KEY);
  } catch {
    // ignore
  }
}
