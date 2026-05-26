import "@testing-library/jest-dom";

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

if (typeof globalThis.ResizeObserver === "undefined") {
  class ResizeObserverStub {
    observe(): void {}
    unobserve(): void {}
    disconnect(): void {}
  }
  globalThis.ResizeObserver = ResizeObserverStub as unknown as typeof ResizeObserver;
}

if (typeof globalThis.DOMMatrixReadOnly === "undefined") {
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
if (typeof globalThis.HTMLElement !== "undefined") {
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
