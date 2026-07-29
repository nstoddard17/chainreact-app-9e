import { act, renderHook } from "@testing-library/react";
import {
  useGuidedBuildSession,
  __GUIDED_BUILD_HINT_VERSION__,
  __GUIDED_BUILD_STORAGE_PREFIX__,
} from "@/features/workflow-builder/hooks/useGuidedBuildSession";

/**
 * REACT-AGENT-GUIDED-BUILD-1 / REACT-AGENT-CONVERSATION-PERSISTENCE-1 — the
 * guided session switch.
 *
 * The behaviour under test is the fix for the stale "Finish setting up this
 * workflow" card: an applied-but-UNSAVED session lives in memory only, and a
 * persisted hint is honoured on return ONLY while it still matches the saved
 * graph revision of a non-empty workflow.
 */

const WF = "wf-guided-1";
const KEY = `${__GUIDED_BUILD_STORAGE_PREFIX__}${WF}`;
const V1 = "2026-07-29T10:00:00.000Z";
const V2 = "2026-07-29T11:00:00.000Z";

type Props = Parameters<typeof useGuidedBuildSession>[0];

function props(overrides: Partial<Props> = {}): Props {
  return {
    workflowId: WF,
    reviewSessionToken: 0,
    hasApplyNotice: false,
    workflowState: "draft",
    savedGraphVersion: V1,
    savedWorkflowEmpty: false,
    draftIsDirty: false,
    hasRemainingSetupWork: true,
    ...overrides,
  };
}

function seedHint(savedGraphVersion: string): void {
  window.localStorage.setItem(
    KEY,
    JSON.stringify({ v: __GUIDED_BUILD_HINT_VERSION__, savedGraphVersion }),
  );
}

function mount(overrides: Partial<Props> = {}) {
  return renderHook((p: Props) => useGuidedBuildSession(p), {
    initialProps: props(overrides),
  });
}

beforeEach(() => {
  window.localStorage.clear();
});

it("starts inactive and activates in memory on a new review session with the notice up", () => {
  const { result, rerender } = mount({ savedWorkflowEmpty: true });
  expect(result.current.active).toBe(false);

  // Apply lands on the draft: dirty, nothing saved yet.
  rerender(
    props({
      reviewSessionToken: 1,
      hasApplyNotice: true,
      savedWorkflowEmpty: true,
      draftIsDirty: true,
    }),
  );
  expect(result.current.active).toBe(true);
  // NOTHING is persisted while the work is unsaved — this is the stale-card fix.
  expect(window.localStorage.getItem(KEY)).toBeNull();
});

it("a token bump WITHOUT the apply notice does not start a session", () => {
  const { result, rerender } = mount();
  rerender(props({ reviewSessionToken: 1, hasApplyNotice: false }));
  expect(result.current.active).toBe(false);
  expect(window.localStorage.getItem(KEY)).toBeNull();
});

it("persists a hint bound to the saved revision once the applied work is SAVED", () => {
  const { result, rerender } = mount({ savedWorkflowEmpty: true, draftIsDirty: true });
  rerender(
    props({
      reviewSessionToken: 1,
      hasApplyNotice: true,
      savedWorkflowEmpty: true,
      draftIsDirty: true,
    }),
  );
  expect(window.localStorage.getItem(KEY)).toBeNull();

  // Save completes: clean draft, non-empty saved workflow, new revision.
  rerender(
    props({
      reviewSessionToken: 1,
      hasApplyNotice: true,
      savedGraphVersion: V2,
      draftIsDirty: false,
    }),
  );
  expect(result.current.active).toBe(true);
  expect(JSON.parse(window.localStorage.getItem(KEY)!)).toEqual({
    v: __GUIDED_BUILD_HINT_VERSION__,
    savedGraphVersion: V2,
  });
});

it("restores a session when the stored hint matches the current saved revision", () => {
  seedHint(V1);
  const { result } = mount({ savedGraphVersion: V1 });
  expect(result.current.active).toBe(true);
});

it("does NOT restore, and deletes the hint, when the saved workflow moved on", () => {
  seedHint(V1);
  const { result } = mount({ savedGraphVersion: V2 });
  expect(result.current.active).toBe(false);
  expect(window.localStorage.getItem(KEY)).toBeNull();
});

it("does NOT restore, and deletes the hint, when the saved workflow is empty", () => {
  seedHint(V1);
  const { result } = mount({ savedGraphVersion: V1, savedWorkflowEmpty: true });
  expect(result.current.active).toBe(false);
  expect(window.localStorage.getItem(KEY)).toBeNull();
});

it("clears the LEGACY durable boolean marker instead of resuming from it", () => {
  // The pre-fix implementation stored a bare "1" with no revision — exactly the
  // marker that resurrected the setup card for work that was never saved.
  window.localStorage.setItem(KEY, "1");
  const { result } = mount({ savedGraphVersion: V1, savedWorkflowEmpty: true });
  expect(result.current.active).toBe(false);
  expect(window.localStorage.getItem(KEY)).toBeNull();
});

it("waits for hydration before judging the hint", () => {
  seedHint(V1);
  const { result, rerender } = mount({ savedGraphVersion: null });
  // Unknown revision → no decision yet, and the hint is left intact.
  expect(result.current.active).toBe(false);
  expect(window.localStorage.getItem(KEY)).not.toBeNull();

  rerender(props({ savedGraphVersion: V1 }));
  expect(result.current.active).toBe(true);
});

it("exit() ends the session and clears storage", () => {
  seedHint(V1);
  const { result } = mount({ savedGraphVersion: V1 });
  expect(result.current.active).toBe(true);
  act(() => result.current.exit());
  expect(result.current.active).toBe(false);
  expect(window.localStorage.getItem(KEY)).toBeNull();
});

it("invalidate() ends the session (discard / restore / replace)", () => {
  seedHint(V1);
  const { result } = mount({ savedGraphVersion: V1 });
  act(() => result.current.invalidate());
  expect(result.current.active).toBe(false);
  expect(window.localStorage.getItem(KEY)).toBeNull();
});

it("an ACTIVE workflow keeps the in-memory session (complete card) but drops storage", () => {
  seedHint(V1);
  const { result, rerender } = mount({ savedGraphVersion: V1 });
  expect(result.current.active).toBe(true);
  rerender(props({ workflowState: "active", hasRemainingSetupWork: false }));
  expect(result.current.active).toBe(true);
  expect(window.localStorage.getItem(KEY)).toBeNull();
});

it("drops storage once there is no remaining setup work", () => {
  seedHint(V1);
  const { rerender } = mount({ savedGraphVersion: V1 });
  rerender(props({ hasRemainingSetupWork: false }));
  expect(window.localStorage.getItem(KEY)).toBeNull();
});

it("the logged-out local-only builder never has a session", () => {
  seedHint(V1);
  const { result, rerender } = mount({ localOnly: true });
  expect(result.current.active).toBe(false);
  rerender(props({ localOnly: true, reviewSessionToken: 2, hasApplyNotice: true }));
  expect(result.current.active).toBe(false);
});

it("stores ONLY a schema version and an opaque revision — no workflow data", () => {
  const { rerender } = mount({ draftIsDirty: true });
  rerender(props({ reviewSessionToken: 1, hasApplyNotice: true, draftIsDirty: false }));
  expect(window.localStorage.length).toBe(1);
  expect(Object.keys(JSON.parse(window.localStorage.getItem(KEY)!)).sort()).toEqual([
    "savedGraphVersion",
    "v",
  ]);
});
