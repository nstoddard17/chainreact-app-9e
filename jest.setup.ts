/**
 * JEST-NODE-ENV-SPLIT-1 — environment-conditional setup.
 *
 * This file runs for EVERY suite (setupFilesAfterEnv), but 2,054+ suites are
 * `@jest-environment node` and have no DOM: for them, loading the RTL DOM
 * matchers (~97ms of require per suite) and installing browser polyfills was
 * pure overhead — ~3.5 CPU-minutes per full run — and polluted Node suites
 * with browser-shaped globals (a Node suite could accidentally depend on a
 * stubbed matchMedia that production Node code would never have).
 *
 * `IS_JSDOM` keys off the environment itself (jsdom defines `document`;
 * node does not) — never off a path convention — so a suite's own
 * `@jest-environment` pragma remains the single source of truth. jsdom
 * suites keep EXACTLY the setup they had; node suites keep only what is
 * environment-agnostic (the next/navigation mock below, which touches no
 * DOM and stays overridable per test).
 */
// Type-only: restores jest-dom's matcher TYPE augmentation program-wide
// (toBeInTheDocument etc. in .tsx suites) while emitting nothing at runtime.
// jest-dom ships AMBIENT declarations (not a module), so the reference
// directive — not `import type` — is the correct type-only mechanism.
/// <reference types="@testing-library/jest-dom" />

const IS_JSDOM = typeof document !== "undefined";

if (IS_JSDOM) {
  // DOM matchers only where there is a DOM. requireActual keeps this inside
  // jest's module registry (a plain import would load it everywhere).
  jest.requireActual("@testing-library/jest-dom");
}

/**
 * Default `next/navigation` mock (Slice 4.BUILDER-V1-SHELL-PARITY-1).
 *
 * `LifecycleActions` now mounts inside `BuilderHeader` (lifted out of
 * the legacy page-header in the workflow detail route), so every test
 * that renders `<WorkflowBuilder>` indirectly mounts `useRouter()`.
 * Without a default mock, the Next.js app router invariant throws
 * (`expected app router to be mounted`).
 *
 * This default returns a stable `refresh: jest.fn()` and is safe to
 * override per test — local `jest.mock("next/navigation", ...)` calls
 * win over this setup-file default. Tests that need to assert on
 * router calls (e.g. `LifecycleActions.test.tsx`, `WorkflowEditForm
 * .test.tsx`) keep their own mocks.
 */
jest.mock("next/navigation", () => ({
  useRouter: () => ({
    refresh: jest.fn(),
    push: jest.fn(),
    replace: jest.fn(),
    back: jest.fn(),
    forward: jest.fn(),
    prefetch: jest.fn(),
  }),
  usePathname: () => "/",
  useSearchParams: () => new URLSearchParams(),
}));

/**
 * jsdom polyfills required by `@xyflow/react` (Slice 3.5).
 *
 * `@xyflow/react` invokes `ResizeObserver`, `DOMMatrixReadOnly`, and
 * the modern `Element` size getters during render. None of those exist
 * in jsdom, so the canvas component throws on mount unless we stub
 * them. The stubs below match what React Flow's docs recommend for
 * jest + react-testing-library and stay scoped to test mode (this file
 * is only loaded from jest's setupFilesAfterEach hook).
 *
 * Keep this list minimal — only the symbols React Flow actually
 * touches at render time. Functional tests of canvas behavior assert
 * dispatch outcomes (graphSlice / configSlice mutations) rather than
 * pixel-level layout.
 */

if (IS_JSDOM && typeof globalThis.ResizeObserver === "undefined") {
  class ResizeObserverStub {
    observe(): void {}
    unobserve(): void {}
    disconnect(): void {}
  }
  globalThis.ResizeObserver = ResizeObserverStub as unknown as typeof ResizeObserver;
}

/**
 * jsdom polyfills required by the v5 marketing homepage
 * (Slice 4.HOMEPAGE-V5-1).
 *
 * The cinematic marketing sections (hero motion canvas, pinned scroll
 * narratives, scroll-reveals, count-ups) read browser APIs jsdom doesn't
 * implement. None are exercised for their visual behavior in unit tests —
 * we assert structure / copy / routing — so no-op stubs are sufficient and
 * keep the whole `MarketingHome` tree mountable. Production code never
 * touches this file.
 */
if (IS_JSDOM && typeof globalThis.matchMedia === "undefined") {
  globalThis.matchMedia = ((query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addEventListener: () => {},
    removeEventListener: () => {},
    addListener: () => {},
    removeListener: () => {},
    dispatchEvent: () => false,
  })) as unknown as typeof globalThis.matchMedia;
}

if (IS_JSDOM && typeof globalThis.IntersectionObserver === "undefined") {
  class IntersectionObserverStub {
    observe(): void {}
    unobserve(): void {}
    disconnect(): void {}
    takeRecords(): IntersectionObserverEntry[] {
      return [];
    }
    root: Element | null = null;
    rootMargin = "";
    thresholds: ReadonlyArray<number> = [];
  }
  globalThis.IntersectionObserver =
    IntersectionObserverStub as unknown as typeof IntersectionObserver;
}

if (IS_JSDOM && typeof globalThis.requestAnimationFrame === "undefined") {
  globalThis.requestAnimationFrame = ((cb: (time: number) => void) =>
    setTimeout(() => cb(Date.now()), 0) as unknown as number) as typeof globalThis.requestAnimationFrame;
  globalThis.cancelAnimationFrame = ((id: number) =>
    clearTimeout(id as unknown as ReturnType<typeof setTimeout>)) as typeof globalThis.cancelAnimationFrame;
}

// The hero/ending motion field draws to a <canvas>. jsdom has no 2D context;
// `getContext` returns null and the component early-returns. Stub it to null
// explicitly so tests don't emit jsdom's "Not implemented" console noise.
if (IS_JSDOM && typeof globalThis.HTMLCanvasElement !== "undefined") {
  HTMLCanvasElement.prototype.getContext =
    (() => null) as unknown as typeof HTMLCanvasElement.prototype.getContext;
}

if (IS_JSDOM && typeof globalThis.DOMMatrixReadOnly === "undefined") {
  class DOMMatrixReadOnlyStub {
    m22 = 1;
    constructor() {
      /* no-op: React Flow only reads m22 to detect zoom level in tests */
    }
  }
  globalThis.DOMMatrixReadOnly =
    DOMMatrixReadOnlyStub as unknown as typeof DOMMatrixReadOnly;
}

// React Flow reads element bounding boxes for node sizing. jsdom returns
// zeroed rects by default; the canvas component handles zero-size
// gracefully, but a non-zero stub keeps test traces readable.
if (IS_JSDOM && typeof globalThis.HTMLElement !== "undefined") {
  Object.defineProperties(HTMLElement.prototype, {
    offsetHeight: {
      configurable: true,
      get(this: HTMLElement) {
        return parseFloat(this.style.height) || 120;
      },
    },
    offsetWidth: {
      configurable: true,
      get(this: HTMLElement) {
        return parseFloat(this.style.width) || 360;
      },
    },
  });

  // Radix UI primitives (Select, Popover, DropdownMenu, etc.) call
  // pointer-capture APIs and scrollIntoView on their triggers. jsdom
  // ships neither, so without these stubs `userEvent.click` on a Radix
  // Select trigger throws and the menu never opens. Stubbing them lets
  // tests drive the live UI exactly the way a user would (`click
  // trigger → click option`), matching the helper at
  // tests/integration/features/workflow-builder/helpers/selectField.ts.
  // Keep these scoped to test mode; production code never touches this
  // file.
  if (!HTMLElement.prototype.hasPointerCapture) {
    (HTMLElement.prototype as unknown as { hasPointerCapture: () => boolean }).hasPointerCapture =
      () => false;
  }
  if (!HTMLElement.prototype.releasePointerCapture) {
    (HTMLElement.prototype as unknown as { releasePointerCapture: () => void }).releasePointerCapture =
      () => {};
  }
  if (!HTMLElement.prototype.setPointerCapture) {
    (HTMLElement.prototype as unknown as { setPointerCapture: () => void }).setPointerCapture =
      () => {};
  }
  if (!HTMLElement.prototype.scrollIntoView) {
    (HTMLElement.prototype as unknown as { scrollIntoView: () => void }).scrollIntoView = () => {};
  }
}
