import { act } from "@testing-library/react";
import { useConfigSlice } from "@/features/workflow-builder/state/configSlice";
import { useGraphSlice } from "@/features/workflow-builder/state/graphSlice";

/**
 * Open the inspector rail for the most-recently-added node of a given
 * kind, calling the same slice action the canvas click + the
 * ValidationSummary issue click already use.
 *
 * Slice 4.BUILDER-V1-SHELL-PARITY-1 — the legacy `NodeList` mount that
 * exposed `getByRole("button", { name: /configure trigger node/i })`
 * / `/configure action node/i` is gone. This helper is the
 * mechanical replacement for that pattern in the integration tests.
 * It calls `configSlice.openNode` directly, which is the single
 * source of truth for which node the inspector shows.
 *
 * Why "last of kind" rather than a nodeId argument: most integration
 * tests add a single trigger and a single action via the picker, then
 * configure each in turn. "Last of kind" matches what
 * `screen.getByRole("button", { name: /configure trigger node/i })`
 * resolved to under the old NodeList — the only node of that kind on
 * the page.
 *
 * Use with `await` so the wrapping `act()` flushes any
 * effect-driven UI updates (e.g. the drawer transition) before the
 * caller asserts on the rendered config form.
 */
export async function openLastNodeOfKind(
  kind: "trigger" | "action",
): Promise<void> {
  const node = useGraphSlice
    .getState()
    .pendingNodes.filter((n) => n.kind === kind)
    .at(-1);
  if (!node) {
    throw new Error(
      `openLastNodeOfKind: no pending ${kind} node in graphSlice. ` +
        `Add the node via the AddNodePanel (or graphSlice action) first.`,
    );
  }
  await act(async () => {
    useConfigSlice
      .getState()
      .openNode({ nodeId: node.id, initialValues: node.config });
  });
}
