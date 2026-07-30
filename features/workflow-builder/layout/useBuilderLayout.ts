"use client";

import { useMemo, useSyncExternalStore } from "react";
import {
  BUILDER_MEDIUM_MIN_WIDTH,
  BUILDER_WIDE_MIN_WIDTH,
  configPresentation,
  headerDensity,
  railPanelWidth,
  railPresentation,
  surfacesAreMutuallyExclusive,
  type BuilderLayoutMode,
  type HeaderDensity,
  type SurfacePresentation,
} from "./builderLayoutPolicy";

/**
 * The builder's single source of viewport truth (BUILDER-RESPONSIVE-LAYOUT-1).
 *
 * ONE hook, ONE subscription. Before this slice the builder had no viewport
 * awareness at all and leaned on scattered `md:` / `xl:` utility classes, which
 * is why the header could clip its own Save/Activate buttons while the rail and
 * config column squeezed the canvas to a strip. The fix is not more utility
 * classes in more files — it is one resolved mode that the shell, header, rail
 * and config surface all read.
 *
 * WHY `matchMedia` AND NOT A RESIZE LISTENER. A media-query list fires only
 * when a boundary is actually crossed, so dragging a window edge across 400px
 * produces at most two updates instead of 400 renders. There is deliberately no
 * `window.innerWidth` listener anywhere in the builder, and this hook is the
 * only place allowed to ask the browser about width.
 *
 * WHY `useSyncExternalStore`. The mode is external browser state, so React
 * should read it rather than mirror it in an effect. `getServerSnapshot`
 * returns `wide`, which means the server HTML and the first client render agree
 * (no hydration mismatch) and the hook resolves to the real mode during
 * hydration rather than one paint later.
 *
 * WHY `wide` IS THE FALLBACK. When `matchMedia` is missing or throws (SSR,
 * jsdom, a locked-down browser) the honest answer is "we don't know". Falling
 * back to `wide` means an unknown environment gets exactly today's desktop
 * builder — the behaviour every existing test already asserts — instead of a
 * phone layout on a 27" monitor. jsdom's stub reports `matches: false` for
 * every query, which lands on this same branch, so isolated component tests
 * keep seeing the desktop layout unless they explicitly stub a viewport.
 *
 * NO BUSINESS DECISIONS LIVE HERE. The hook reports a width class and nothing
 * else: it cannot see the graph, the conversation, the selected node, or the
 * dirty flag, so a resize can never save, activate, refit, or mutate anything.
 */

/**
 * Boundary queries — `min-width` ONLY, deliberately.
 *
 * The obvious way to write these is a pair of exclusive bands using
 * `(max-width: 1279.99px)`. Do not: browsers ROUND fractional media-query
 * lengths, so Chromium evaluates `max-width: 1279.99px` as true at a viewport of
 * exactly 1280px. Both bands then match on every boundary, and the first-match
 * ordering silently hands 1280px the medium layout and 900px the narrow one —
 * i.e. the two viewports the owner explicitly named as tier boundaries were the
 * two that resolved to the wrong tier. Real-browser verification caught it; the
 * jsdom tests could not, because a stub evaluating pure numbers has no rounding.
 *
 * Two overlapping `min-width` queries checked widest-first have no fractional
 * arithmetic at all, and match `resolveBuilderLayoutMode`'s `>=` semantics
 * exactly — one definition of the boundary, in CSS and in TypeScript.
 */
const WIDE_QUERY = `(min-width: ${BUILDER_WIDE_MIN_WIDTH}px)`;
const MEDIUM_QUERY = `(min-width: ${BUILDER_MEDIUM_MIN_WIDTH}px)`;

/**
 * A query that is TRUE for every real viewport. Widest-first ordering means
 * "nothing matched" would otherwise mean "narrow" — and an environment whose
 * `matchMedia` is a non-evaluating stub answers `false` to everything, so it
 * would be mistaken for a phone. This probe tells the two apart: a real browser
 * always matches it, jsdom's stub never does. That is what keeps "we don't know"
 * resolving to the untouched desktop layout instead of to a phone layout on a
 * 27" monitor.
 */
const EVALUATES_QUERY = "(min-width: 0px)";

function matches(query: string): boolean {
  try {
    return window.matchMedia(query).matches === true;
  } catch {
    return false;
  }
}

function readMode(): BuilderLayoutMode {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") {
    return "wide";
  }
  // Widest-first: the queries overlap, so order IS the band boundary.
  if (matches(WIDE_QUERY)) return "wide";
  if (matches(MEDIUM_QUERY)) return "medium";
  // Before concluding "narrow", confirm this browser actually evaluates queries.
  if (!matches(EVALUATES_QUERY)) return "wide";
  return "narrow";
}

/**
 * Module-level (therefore referentially stable) subscription. Both boundaries
 * are watched, and every listener attached is returned in the teardown — an
 * unsubscribed media-query list is the one leak this hook could plausibly
 * introduce, so the cleanup is exhaustive rather than best-effort.
 */
function subscribe(onStoreChange: () => void): () => void {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") {
    return () => {};
  }
  const detach: Array<() => void> = [];
  for (const query of [WIDE_QUERY, MEDIUM_QUERY]) {
    let list: MediaQueryList;
    try {
      list = window.matchMedia(query);
    } catch {
      continue;
    }
    if (typeof list.addEventListener === "function") {
      list.addEventListener("change", onStoreChange);
      detach.push(() => list.removeEventListener("change", onStoreChange));
    } else if (typeof list.addListener === "function") {
      // Safari < 14 and some embedded webviews only have the legacy API.
      list.addListener(onStoreChange);
      detach.push(() => list.removeListener(onStoreChange));
    }
  }
  return () => {
    for (const off of detach) off();
  };
}

function serverSnapshot(): BuilderLayoutMode {
  return "wide";
}

/** The raw width class. Prefer `useBuilderLayout` unless you only need this. */
export function useBuilderLayoutMode(): BuilderLayoutMode {
  return useSyncExternalStore(subscribe, readMode, serverSnapshot);
}

export interface BuilderLayout {
  readonly mode: BuilderLayoutMode;
  /** How the React Agent rail should be presented right now. */
  readonly rail: SurfacePresentation;
  /** How the node-configuration surface should be presented right now. */
  readonly config: SurfacePresentation;
  /** Expanded in-flow rail width in pixels (ignored when `rail` is overlay). */
  readonly railWidth: number;
  readonly header: HeaderDensity;
  /** True when opening one secondary surface must close the other. */
  readonly oneSurfaceAtATime: boolean;
}

/**
 * The resolved layout, memoized on the mode so the object identity is stable
 * between boundary crossings (consumers pass pieces of it into effect deps).
 */
export function useBuilderLayout(): BuilderLayout {
  const mode = useBuilderLayoutMode();
  return useMemo(
    () => ({
      mode,
      rail: railPresentation(mode),
      config: configPresentation(mode),
      railWidth: railPanelWidth(mode),
      header: headerDensity(mode),
      oneSurfaceAtATime: surfacesAreMutuallyExclusive(mode),
    }),
    [mode],
  );
}
