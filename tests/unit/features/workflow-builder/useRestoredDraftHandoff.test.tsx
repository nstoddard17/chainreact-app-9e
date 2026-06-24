/**
 * ANON-BUILDER-3 — useRestoredDraftHandoff consumes the one-shot restored context
 * (prompt + reason) once for the authenticated builder, and never in local-only.
 */
import { renderHook, act } from "@testing-library/react";
import { useRestoredDraftHandoff } from "@/features/workflow-builder/hooks/useRestoredDraftHandoff";
import { setRestoredContext, consumeRestoredContext } from "@/lib/anonymousBuilder";

beforeEach(() => {
  window.localStorage.clear();
});

describe("useRestoredDraftHandoff", () => {
  it("consumes prompt + reason once for the matching workflow id", () => {
    setRestoredContext("wf-1", { prompt: "Notify #wins", reason: "save" });
    const { result } = renderHook(() => useRestoredDraftHandoff("wf-1", false));
    expect(result.current.composerValue).toBe("Notify #wins");
    expect(result.current.reason).toBe("save");
    // It was consumed (one-shot) — the stored value is gone.
    expect(consumeRestoredContext("wf-1")).toBeNull();
  });

  it("dismissReason clears the reason", () => {
    setRestoredContext("wf-1", { prompt: "x", reason: "activate" });
    const { result } = renderHook(() => useRestoredDraftHandoff("wf-1", false));
    expect(result.current.reason).toBe("activate");
    act(() => result.current.dismissReason());
    expect(result.current.reason).toBeNull();
  });

  it("does NOT consume in local-only mode", () => {
    setRestoredContext("wf-1", { prompt: "x", reason: "save" });
    const { result } = renderHook(() => useRestoredDraftHandoff("wf-1", true));
    expect(result.current.composerValue).toBe("");
    expect(result.current.reason).toBeNull();
    // Still available for a later authenticated mount.
    expect(consumeRestoredContext("wf-1")).toEqual({ prompt: "x", reason: "save" });
  });
});
