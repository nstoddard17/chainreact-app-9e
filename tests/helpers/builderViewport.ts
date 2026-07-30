/**
 * BUILDER-RESPONSIVE-LAYOUT-1 — viewport simulation for jsdom.
 *
 * jsdom's `matchMedia` (stubbed in `jest.setup.ts`) reports `matches: false` for
 * every query, which is exactly why the builder's layout hook falls back to
 * `wide` and every pre-existing builder test keeps asserting the desktop layout
 * unchanged. To exercise a narrower tier a test has to say so explicitly, and
 * this helper is how it says it.
 *
 * It EVALUATES the media query rather than pattern-matching the builder's
 * specific query strings, so the helper does not have to be kept in sync with
 * `useBuilderLayout` — if the breakpoint constants move, the tests follow
 * automatically instead of silently testing the wrong band.
 *
 * Listeners are recorded so `setBuilderViewportWidth` can be called again
 * mid-test to simulate a real resize (a rotation, a window drag) and drive the
 * hook's `change` path, not just its initial read.
 */

type Listener = (event: MediaQueryListEvent) => void;

interface InstalledViewport {
  /** Change the simulated width and notify every live media-query listener. */
  set(width: number): void;
  /** Restore whatever `matchMedia` was there before. */
  restore(): void;
}

/** Minimal evaluator for the `(min-width: Npx)` / `(max-width: Npx)` forms the builder uses. */
function evaluate(query: string, width: number): boolean {
  const clauses = query.split(" and ").map((part) => part.trim());
  return clauses.every((clause) => {
    const min = /^\(\s*min-width:\s*([\d.]+)px\s*\)$/.exec(clause);
    if (min) return width >= Number(min[1]);
    const max = /^\(\s*max-width:\s*([\d.]+)px\s*\)$/.exec(clause);
    if (max) return width <= Number(max[1]);
    throw new Error(
      `builderViewport: unsupported media query clause "${clause}". ` +
        `Extend the evaluator rather than making the test assert a query string.`,
    );
  });
}

export function installBuilderViewport(initialWidth: number): InstalledViewport {
  const previous = window.matchMedia;
  let width = initialWidth;
  const live: Array<{ query: string; listener: Listener; lastMatch: boolean }> = [];

  window.matchMedia = ((query: string) => {
    const entry = {
      query,
      get matches() {
        return evaluate(query, width);
      },
      media: query,
      onchange: null,
      addEventListener: (_type: string, listener: Listener) => {
        live.push({ query, listener, lastMatch: evaluate(query, width) });
      },
      removeEventListener: (_type: string, listener: Listener) => {
        const index = live.findIndex(
          (item) => item.query === query && item.listener === listener,
        );
        if (index >= 0) live.splice(index, 1);
      },
      addListener: () => {},
      removeListener: () => {},
      dispatchEvent: () => false,
    };
    return entry as unknown as MediaQueryList;
  }) as unknown as typeof window.matchMedia;

  return {
    set(next: number) {
      width = next;
      // Fire only where the match actually flipped — that is what a real
      // MediaQueryList does, and a hook that only reacts to genuine boundary
      // crossings should be tested against genuine boundary crossings.
      for (const item of [...live]) {
        const now = evaluate(item.query, width);
        if (now === item.lastMatch) continue;
        item.lastMatch = now;
        item.listener({ matches: now, media: item.query } as MediaQueryListEvent);
      }
    },
    restore() {
      window.matchMedia = previous;
      live.length = 0;
    },
  };
}

/** The viewports the owner asked to have validated, for `it.each` tables. */
export const OWNER_VIEWPORTS = [
  { width: 1440, height: 900, label: "1440×900 desktop", mode: "wide" },
  { width: 1280, height: 800, label: "1280×800 laptop", mode: "wide" },
  { width: 1024, height: 768, label: "1024×768 small laptop", mode: "medium" },
  { width: 900, height: 700, label: "900×700 short window", mode: "medium" },
  { width: 820, height: 1180, label: "820×1180 tablet", mode: "narrow" },
  { width: 768, height: 1024, label: "768×1024 tablet", mode: "narrow" },
  { width: 390, height: 844, label: "390×844 phone", mode: "narrow" },
] as const;
