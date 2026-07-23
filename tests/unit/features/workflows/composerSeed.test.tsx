import { describe, expect, it, jest } from "@jest/globals";
import { renderHook } from "@testing-library/react";
import {
  composerSeedApplyMode,
  useComposerSeed,
  type ComposerSeed,
} from "@/features/workflows/composerSeed";

/**
 * 5.DUAL-BUILDER-1 CS-7 — the ONE keyed/versioned composer-seed mechanism, tested
 * at the pure-rule + hook level (the panel integration test covers the rendered
 * composer). Locks: replace vs fill-if-empty by source, monotonic apply-once,
 * rapid seeds not dropped, and never auto-send.
 */
describe("composerSeedApplyMode", () => {
  it("explicit Document sources REPLACE the composer", () => {
    expect(composerSeedApplyMode("document-empty")).toBe("replace");
    expect(composerSeedApplyMode("document-bar")).toBe("replace");
    expect(composerSeedApplyMode("document-insert")).toBe("replace");
  });
  it("a restore source only fills an empty composer", () => {
    expect(composerSeedApplyMode("restore")).toBe("fill-if-empty");
  });
});

/**
 * Drive the hook with a fake `setInput` (value | updater) and a simulated current
 * input, asserting exactly what it would write.
 */
function harness() {
  let current = "";
  const setInput = jest.fn((next: string | ((c: string) => string)) => {
    current = typeof next === "function" ? (next as (c: string) => string)(current) : next;
  });
  return {
    setInput,
    get value() {
      return current;
    },
    set value(v: string) {
      current = v;
    },
  };
}

describe("useComposerSeed", () => {
  it("fills an empty composer from a restore seed", () => {
    const h = harness();
    renderHook(({ seed }: { seed: ComposerSeed | undefined }) => useComposerSeed(seed, h.setInput), {
      initialProps: { seed: { value: "restored", version: 1, source: "restore" } as ComposerSeed },
    });
    expect(h.value).toBe("restored");
  });

  it("a restore seed leaves user-typed text alone", () => {
    const h = harness();
    h.value = "typed";
    renderHook(({ seed }: { seed: ComposerSeed | undefined }) => useComposerSeed(seed, h.setInput), {
      initialProps: { seed: { value: "restored", version: 1, source: "restore" } as ComposerSeed },
    });
    expect(h.value).toBe("typed");
  });

  it("an explicit Document seed replaces even typed text", () => {
    const h = harness();
    h.value = "typed";
    renderHook(({ seed }: { seed: ComposerSeed | undefined }) => useComposerSeed(seed, h.setInput), {
      initialProps: {
        seed: { value: "ask react", version: 1, source: "document-bar" } as ComposerSeed,
      },
    });
    expect(h.value).toBe("ask react");
  });

  it("applies each version at most once — same version re-render is a no-op", () => {
    const h = harness();
    const seed: ComposerSeed = { value: "v1", version: 1, source: "document-bar" };
    const { rerender } = renderHook(
      ({ s }: { s: ComposerSeed | undefined }) => useComposerSeed(s, h.setInput),
      { initialProps: { s: seed } },
    );
    expect(h.value).toBe("v1");
    h.value = "user override"; // user edits after the seed
    rerender({ s: seed }); // identical version → must NOT re-seed
    expect(h.value).toBe("user override");
  });

  it("a newer version supersedes the earlier unsent seed (rapid seeds not dropped)", () => {
    const h = harness();
    const { rerender } = renderHook(
      ({ s }: { s: ComposerSeed | undefined }) => useComposerSeed(s, h.setInput),
      { initialProps: { s: { value: "first", version: 1, source: "document-bar" } as ComposerSeed } },
    );
    expect(h.value).toBe("first");
    rerender({ s: { value: "second", version: 2, source: "document-insert" } });
    expect(h.value).toBe("second");
  });

  it("a stale lower version arriving late is ignored", () => {
    const h = harness();
    const { rerender } = renderHook(
      ({ s }: { s: ComposerSeed | undefined }) => useComposerSeed(s, h.setInput),
      { initialProps: { s: { value: "v2", version: 2, source: "document-bar" } as ComposerSeed } },
    );
    expect(h.value).toBe("v2");
    rerender({ s: { value: "v1-late", version: 1, source: "document-bar" } });
    expect(h.value).toBe("v2");
  });
});
