import { act, renderHook } from "@testing-library/react";
import { useGuidedBuildSession } from "@/features/workflow-builder/hooks/useGuidedBuildSession";

/**
 * REACT-AGENT-GUIDED-BUILD-1 — guided session switch. Starts on a new review
 * session while the apply notice is up, survives a "reload" via the
 * per-workflow localStorage flag (which stores ONLY "1"), ends on exit, and
 * clears storage once the workflow goes active.
 */

const WF = "wf-guided-1";
const KEY = `chainreact:builder:guidedBuild:${WF}`;

function mount(input: Partial<Parameters<typeof useGuidedBuildSession>[0]> = {}) {
  return renderHook(
    (props: Parameters<typeof useGuidedBuildSession>[0]) => useGuidedBuildSession(props),
    {
      initialProps: {
        workflowId: WF,
        reviewSessionToken: 0,
        hasApplyNotice: false,
        workflowState: "draft",
        ...input,
      },
    },
  );
}

beforeEach(() => {
  window.localStorage.clear();
});

it("starts inactive and activates on a new review session with the notice up", () => {
  const { result, rerender } = mount();
  expect(result.current.active).toBe(false);

  rerender({
    workflowId: WF,
    reviewSessionToken: 1,
    hasApplyNotice: true,
    workflowState: "draft",
  });
  expect(result.current.active).toBe(true);
  expect(window.localStorage.getItem(KEY)).toBe("1");
});

it("a token bump WITHOUT the apply notice does not start a session", () => {
  const { result, rerender } = mount();
  rerender({
    workflowId: WF,
    reviewSessionToken: 1,
    hasApplyNotice: false,
    workflowState: "draft",
  });
  expect(result.current.active).toBe(false);
  expect(window.localStorage.getItem(KEY)).toBeNull();
});

it("restores an active session from storage on mount (reload / OAuth resume)", () => {
  window.localStorage.setItem(KEY, "1");
  const { result } = mount();
  expect(result.current.active).toBe(true);
});

it("exit() ends the session and clears storage", () => {
  window.localStorage.setItem(KEY, "1");
  const { result } = mount();
  act(() => result.current.exit());
  expect(result.current.active).toBe(false);
  expect(window.localStorage.getItem(KEY)).toBeNull();
});

it("an ACTIVE workflow keeps the in-memory session (complete card) but drops storage", () => {
  window.localStorage.setItem(KEY, "1");
  const { result, rerender } = mount();
  expect(result.current.active).toBe(true);
  rerender({
    workflowId: WF,
    reviewSessionToken: 0,
    hasApplyNotice: false,
    workflowState: "active",
  });
  expect(result.current.active).toBe(true);
  expect(window.localStorage.getItem(KEY)).toBeNull();
});

it("the logged-out local-only builder never has a session", () => {
  window.localStorage.setItem(KEY, "1");
  const { result, rerender } = mount({ localOnly: true });
  expect(result.current.active).toBe(false);
  rerender({
    workflowId: WF,
    localOnly: true,
    reviewSessionToken: 2,
    hasApplyNotice: true,
    workflowState: "draft",
  });
  expect(result.current.active).toBe(false);
});

it("stores ONLY the flag — no workflow data, config, or ids beyond the key", () => {
  const { rerender } = mount();
  rerender({
    workflowId: WF,
    reviewSessionToken: 1,
    hasApplyNotice: true,
    workflowState: "draft",
  });
  expect(window.localStorage.length).toBe(1);
  expect(window.localStorage.getItem(KEY)).toBe("1");
});
