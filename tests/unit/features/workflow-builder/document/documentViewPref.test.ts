/**
 * Device-local builder-view preference (5.DUAL-BUILDER-1 / CS-1).
 * SSR-safe `chainreact:` localStorage convention — fail-safe to "visual".
 */
import {
  __BUILDER_VIEW_PREF_BASE_KEY__,
  __builderViewPrefKeyForWorkflow__,
  readBuilderViewPref,
  writeBuilderViewPref,
} from "@/features/workflow-builder/document/documentViewPref";

const BASE = __BUILDER_VIEW_PREF_BASE_KEY__;

beforeEach(() => {
  window.localStorage.clear();
});

describe("documentViewPref", () => {
  it("defaults to visual when nothing is stored", () => {
    expect(readBuilderViewPref()).toBe("visual");
    expect(readBuilderViewPref("wf-1")).toBe("visual");
  });

  it("writes both the device-wide and per-workflow keys", () => {
    writeBuilderViewPref("document", "wf-1");
    expect(window.localStorage.getItem(BASE)).toBe("document");
    expect(window.localStorage.getItem(__builderViewPrefKeyForWorkflow__("wf-1"))).toBe(
      "document",
    );
    expect(readBuilderViewPref("wf-1")).toBe("document");
    // Device-wide fallback applies to workflows without their own key.
    expect(readBuilderViewPref("wf-other")).toBe("document");
  });

  it("per-workflow override wins over the device-wide value", () => {
    window.localStorage.setItem(BASE, "document");
    window.localStorage.setItem(__builderViewPrefKeyForWorkflow__("wf-1"), "visual");
    expect(readBuilderViewPref("wf-1")).toBe("visual");
    expect(readBuilderViewPref("wf-2")).toBe("document");
  });

  it("invalid stored values fail safely to visual", () => {
    window.localStorage.setItem(BASE, "bogus");
    window.localStorage.setItem(__builderViewPrefKeyForWorkflow__("wf-1"), "DOCUMENT");
    expect(readBuilderViewPref("wf-1")).toBe("visual");
  });

  it("an invalid per-workflow value falls through to a valid device-wide value", () => {
    window.localStorage.setItem(BASE, "document");
    window.localStorage.setItem(__builderViewPrefKeyForWorkflow__("wf-1"), "junk");
    expect(readBuilderViewPref("wf-1")).toBe("document");
  });

  it("throwing storage fails safely (read → visual, write → no throw)", () => {
    const getItem = jest
      .spyOn(Storage.prototype, "getItem")
      .mockImplementation(() => {
        throw new Error("denied");
      });
    const setItem = jest
      .spyOn(Storage.prototype, "setItem")
      .mockImplementation(() => {
        throw new Error("denied");
      });
    try {
      expect(readBuilderViewPref("wf-1")).toBe("visual");
      expect(() => writeBuilderViewPref("document", "wf-1")).not.toThrow();
    } finally {
      getItem.mockRestore();
      setItem.mockRestore();
    }
  });
});
