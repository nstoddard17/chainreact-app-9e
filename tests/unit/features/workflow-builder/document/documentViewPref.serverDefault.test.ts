/**
 * BUILDER-VIEW-DEFAULT-1 — server-default layer in the view resolution.
 *
 * Order: per-workflow key (last used on this workflow, this device) →
 * serverDefault (the user's saved account-level choice) → device-wide key →
 * "visual". The server default OUTRANKS the device-wide heuristic but never
 * the explicit per-workflow memory.
 */
import {
  readBuilderViewPref,
  writeBuilderViewPref,
  __BUILDER_VIEW_PREF_BASE_KEY__,
  __builderViewPrefKeyForWorkflow__,
} from "@/features/workflow-builder/document/documentViewPref";

beforeEach(() => {
  window.localStorage.clear();
});

describe("readBuilderViewPref with a server default", () => {
  it("uses the server default when no local keys exist", () => {
    expect(readBuilderViewPref("wf-1", "document")).toBe("document");
  });

  it("per-workflow memory outranks the server default", () => {
    writeBuilderViewPref("visual", "wf-1");
    expect(readBuilderViewPref("wf-1", "document")).toBe("visual");
  });

  it("server default outranks the device-wide key (explicit beats heuristic)", () => {
    window.localStorage.setItem(__BUILDER_VIEW_PREF_BASE_KEY__, "visual");
    expect(readBuilderViewPref("wf-2", "document")).toBe("document");
  });

  it("no server default (null/undefined) falls back to device key, then visual", () => {
    expect(readBuilderViewPref("wf-3", null)).toBe("visual");
    window.localStorage.setItem(__BUILDER_VIEW_PREF_BASE_KEY__, "document");
    expect(readBuilderViewPref("wf-3", null)).toBe("document");
    expect(readBuilderViewPref("wf-3")).toBe("document");
  });

  it("ignores an invalid per-workflow value and falls through to the server default", () => {
    window.localStorage.setItem(__builderViewPrefKeyForWorkflow__("wf-4"), "bogus");
    expect(readBuilderViewPref("wf-4", "document")).toBe("document");
  });
});
