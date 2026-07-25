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
  markViewChooserResolved,
  hasResolvedViewChooser,
  __BUILDER_VIEW_PREF_BASE_KEY__,
  __builderViewPrefKeyForWorkflow__,
  __viewChooserResolvedKeyForWorkflow__,
} from "@/features/workflow-builder/document/documentViewPref";

beforeEach(() => {
  window.localStorage.clear();
  window.sessionStorage.clear();
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

describe("view-chooser resolved marker (BUILDER-VIEW-QA-1 back/forward defect)", () => {
  // Browser QA: choose/dismiss, go BACK, go FORWARD — the router-cache remount
  // carries justCreated=true again, so the chooser's mount condition must
  // consult this session marker or it re-opens on the SAME workflow.
  it("is per-workflow, session-scoped, and false by default", () => {
    expect(hasResolvedViewChooser("wf-a")).toBe(false);
    markViewChooserResolved("wf-a");
    expect(hasResolvedViewChooser("wf-a")).toBe(true);
    // Other workflows are unaffected — the NEXT new workflow still asks.
    expect(hasResolvedViewChooser("wf-b")).toBe(false);
    // Stored in sessionStorage (survives back/forward, not a new session).
    expect(
      window.sessionStorage.getItem(__viewChooserResolvedKeyForWorkflow__("wf-a")),
    ).toBe("true");
    expect(window.localStorage.getItem(__viewChooserResolvedKeyForWorkflow__("wf-a"))).toBeNull();
  });

  it("fails safe when sessionStorage throws (never blocks the builder)", () => {
    const original = window.sessionStorage.setItem.bind(window.sessionStorage);
    jest
      .spyOn(Storage.prototype, "setItem")
      .mockImplementation(() => {
        throw new Error("quota");
      });
    expect(() => markViewChooserResolved("wf-q")).not.toThrow();
    jest.restoreAllMocks();
    original(__viewChooserResolvedKeyForWorkflow__("wf-restore"), "true");
    expect(hasResolvedViewChooser("wf-restore")).toBe(true);
  });
});
