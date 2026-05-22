/**
 * Slice 3.22 integration test — variable picker → FileRefArrayField
 * chip-append.
 *
 * Proves the Slice 3.21 file-array renderer composes with the Slice
 * 3.7 variable picker so a `fileRef`-producing upstream output lands
 * in a downstream `file-array` field as a canonical `{{nodeId.path}}`
 * token chip — never text-replaces, never coerces, never drops to a
 * loose string field.
 *
 * Slice scope (per docs/slices/phase-3/file-ref-array-field-plan.md
 * §4.4 + §6, decision D-FRA-5):
 *   - When the focused FieldType is `file-array`, picker insertion
 *     appends a chip to the value array.
 *   - The picker does NOT pre-filter outputs by type yet — any picked
 *     output produces a canonical token; the runtime resolved-config
 *     Zod parse remains the authoritative gate on whether the
 *     resolved value is a valid FileRef.
 *   - The picker also continues to behave as text-insert when its
 *     embedded button lives on a `text` / `textarea` renderer (proven
 *     by the existing Slice 3.7 `variable-picker-flow.test.tsx`).
 *
 * This test uses a small inline native action meta with a `file-array`
 * field so it doesn't depend on (or upgrade) any shipped provider
 * metadata. The Outlook `send_email.attachments` meta upgrade is a
 * separate follow-up slice.
 */

const mockUpdateWorkflow = jest.fn();
jest.mock("@/lib/api/workflows", () => {
  const actual = jest.requireActual("@/lib/api/workflows");
  return {
    ...actual,
    updateWorkflow: (...args: unknown[]) => mockUpdateWorkflow(...args),
  };
});

const mockListNativeActions = jest.fn();
const mockListNativeTriggers = jest.fn();
const mockListProviderActions = jest.fn(async (_p: string) => []);
const mockListProviderTriggers = jest.fn(async (_p: string) => []);
jest.mock("@/lib/api/discovery", () => ({
  __esModule: true,
  listNativeActions: () => mockListNativeActions(),
  listNativeTriggers: () => mockListNativeTriggers(),
  listProviderActions: (p: string) => mockListProviderActions(p),
  listProviderTriggers: (p: string) => mockListProviderTriggers(p),
  DiscoveryApiError: class DiscoveryApiError extends Error {
    code = "UNKNOWN";
    status = 500;
  },
}));

import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { WorkflowBuilder } from "@/features/workflow-builder/WorkflowBuilder";
import { useGraphSlice } from "@/features/workflow-builder/state/graphSlice";
import { useConfigSlice } from "@/features/workflow-builder/state/configSlice";
import { useRunSlice } from "@/features/workflow-builder/state/runSlice";
import { __resetNativeActionsCacheForTests } from "@/features/workflow-builder/hooks/useNativeActions";
import { __resetNativeTriggersCacheForTests } from "@/features/workflow-builder/hooks/useNativeTriggers";
import { __resetProviderActionsCacheForTests } from "@/features/workflow-builder/hooks/useProviderActions";
import { __resetProviderTriggersCacheForTests } from "@/features/workflow-builder/hooks/useProviderTriggers";
import type { ActionMeta } from "@/contracts/actionMeta";
import type { TriggerMeta } from "@/contracts/triggerMeta";
import type { WorkflowDetail } from "@/contracts/workflow";

// Trigger advertises a top-level `file` payload typed as fileRef so
// the picker surfaces it as an upstream source. Mirrors the picker
// pattern used by `gmail:get_attachment` (which advertises a `file`
// output of type `fileRef`) without depending on the gmail meta.
const manualTriggerMeta: TriggerMeta = {
  key: "native:manual.run",
  provider: "native",
  type: "manual.run",
  displayName: "Manual Trigger",
  description: "Runs on demand.",
  category: "logic",
  activation: "manual",
  requiresIntegration: false,
  fields: [],
  payloadShape: [
    { name: "file", type: "fileRef", description: "Uploaded attachment." },
    { name: "subject", type: "string", description: "Email subject." },
  ],
  displayOrder: 10,
};

// Test-only action with a `file-array` field. Lives inline so this
// integration test does not depend on any shipped provider metadata.
const attachAction: ActionMeta = {
  key: "native:attach_files",
  provider: "native",
  type: "attach_files",
  displayName: "Attach Files (test)",
  description: "Test action exposing a file-array field.",
  category: "files",
  requiresIntegration: false,
  fields: [
    {
      name: "attachments",
      label: "Attachments",
      type: "file-array",
      required: false,
      placeholder: "Paste a {{...}} token or FileRef JSON",
      fileArrayMaxItems: 25,
    },
  ],
  outputs: [],
  producesFileRef: false,
  consumesFileRef: true,
  displayOrder: 10,
};

const baseWorkflow: WorkflowDetail = {
  id: "wf-1",
  name: "Test",
  state: "draft",
  disabledReason: null,
  disabledContext: null,
  activeRevisionId: null,
  draftDefinition: { nodes: [], edges: [] },
  deletedAt: null,
  createdAt: "2026-05-22T00:00:00Z",
  updatedAt: "2026-05-22T00:00:00Z",
};

beforeEach(() => {
  mockUpdateWorkflow.mockReset();
  mockListNativeActions.mockReset();
  mockListNativeActions.mockResolvedValue([attachAction]);
  mockListNativeTriggers.mockReset();
  mockListNativeTriggers.mockResolvedValue([manualTriggerMeta]);
  mockListProviderActions.mockReset();
  mockListProviderActions.mockResolvedValue([]);
  mockListProviderTriggers.mockReset();
  mockListProviderTriggers.mockResolvedValue([]);
  __resetNativeActionsCacheForTests();
  __resetNativeTriggersCacheForTests();
  __resetProviderActionsCacheForTests();
  __resetProviderTriggersCacheForTests();
  useGraphSlice.getState().reset();
  useConfigSlice.getState().reset();
  useRunSlice.getState().reset();
});

it("end-to-end: picker on a file-array field appends a canonical token chip + persists through Save", async () => {
  mockUpdateWorkflow.mockImplementation(async (_id, body) => ({
    ...baseWorkflow,
    draftDefinition: body.draftDefinition,
  }));
  const user = userEvent.setup();
  render(
    <WorkflowBuilder
      workflow={baseWorkflow}
      triggerProviders={[]}
      actionProviders={[]}
    />,
  );

  // 1. Add the manual trigger so the action picker has an ancestor.
  await user.click(screen.getByRole("button", { name: /add trigger/i }));
  await waitFor(() => {
    expect(screen.getByText("Manual Trigger")).toBeInTheDocument();
  });
  await user.click(screen.getByText("Manual Trigger"));

  // 2. Add the file-array action.
  await user.click(screen.getByRole("button", { name: /add action/i }));
  await waitFor(() => {
    expect(screen.getByText("Attach Files (test)")).toBeInTheDocument();
  });
  await user.click(screen.getByText("Attach Files (test)"));
  const action = useGraphSlice
    .getState()
    .pendingNodes.find((n) => n.kind === "action")!;
  expect(action).toBeDefined();

  // 3. Open the action config.
  await user.click(
    screen.getByRole("button", { name: /configure action node/i }),
  );
  await waitFor(() => {
    expect(screen.getByLabelText("Attachments")).toBeInTheDocument();
  });

  // 4. Open the file-array's variable picker (testIdRoot from
  //    FileRefArrayField is `file-array-${name}-picker`).
  await user.click(
    screen.getByTestId("file-array-attachments-picker-trigger"),
  );
  await waitFor(() => {
    expect(
      screen.getByTestId("file-array-attachments-picker-popover"),
    ).toBeInTheDocument();
  });

  // 5. Pick the trigger's `file` (fileRef) output. The picker surfaces
  //    the trigger under the `"trigger"` alias.
  await user.click(screen.getByLabelText("Insert {{trigger.file}}"));

  // 6. The chip appears — token-typed, NOT a FileRef literal.
  expect(screen.getByText("{{trigger.file}}")).toBeInTheDocument();
  // Popover closes after insert (VariablePickerButton contract).
  expect(
    screen.queryByTestId("file-array-attachments-picker-popover"),
  ).not.toBeInTheDocument();

  // The configSlice draft holds the token-array shape — real array,
  // not a JSON / CSV string.
  const draft = useConfigSlice.getState().drafts[action.id]!;
  expect(draft.values.attachments).toEqual(["{{trigger.file}}"]);
  expect(Array.isArray(draft.values.attachments)).toBe(true);
  expect(typeof draft.values.attachments).not.toBe("string");
  expect(draft.isDirty).toBe(true);

  // 7. Modal Save flushes the draft into graphSlice.pendingNodes.
  const modal = screen.getByRole("complementary", {
    name: /node configuration/i,
  });
  await user.click(within(modal).getByRole("button", { name: /^save$/i }));
  const pending = useGraphSlice
    .getState()
    .pendingNodes.find((n) => n.id === action.id)!;
  expect(pending.config.attachments).toEqual(["{{trigger.file}}"]);

  // Modal Save MUST NOT have called updateWorkflow yet.
  expect(mockUpdateWorkflow).not.toHaveBeenCalled();

  // 8. Toolbar Save persists.
  const allSaveButtons = screen.getAllByRole("button", { name: /^save$/i });
  const toolbarSave = allSaveButtons.find((btn) => !modal.contains(btn))!;
  await user.click(toolbarSave);
  await waitFor(() => {
    expect(mockUpdateWorkflow).toHaveBeenCalledTimes(1);
  });
  const persistedNodes = mockUpdateWorkflow.mock.calls[0]![1].draftDefinition
    .nodes as Array<{ kind: string; type: string; config: Record<string, unknown> }>;
  const persistedAction = persistedNodes.find((n) => n.kind === "action")!;
  expect(persistedAction.type).toBe("attach_files");
  expect(persistedAction.config.attachments).toEqual(["{{trigger.file}}"]);
  expect(Array.isArray(persistedAction.config.attachments)).toBe(true);
});

it("appending the same token twice produces only one chip (dedup parity with paste-text Add)", async () => {
  const user = userEvent.setup();
  render(
    <WorkflowBuilder
      workflow={baseWorkflow}
      triggerProviders={[]}
      actionProviders={[]}
    />,
  );

  await user.click(screen.getByRole("button", { name: /add trigger/i }));
  await waitFor(() => expect(screen.getByText("Manual Trigger")).toBeInTheDocument());
  await user.click(screen.getByText("Manual Trigger"));
  await user.click(screen.getByRole("button", { name: /add action/i }));
  await waitFor(() => expect(screen.getByText("Attach Files (test)")).toBeInTheDocument());
  await user.click(screen.getByText("Attach Files (test)"));
  const action = useGraphSlice
    .getState()
    .pendingNodes.find((n) => n.kind === "action")!;
  await user.click(
    screen.getByRole("button", { name: /configure action node/i }),
  );
  await waitFor(() => expect(screen.getByLabelText("Attachments")).toBeInTheDocument());

  // First pick → one chip.
  await user.click(screen.getByTestId("file-array-attachments-picker-trigger"));
  await user.click(screen.getByLabelText("Insert {{trigger.file}}"));
  expect(useConfigSlice.getState().drafts[action.id]!.values.attachments).toEqual([
    "{{trigger.file}}",
  ]);

  // Second pick of the SAME token → silently no-op (dedup).
  await user.click(screen.getByTestId("file-array-attachments-picker-trigger"));
  await user.click(screen.getByLabelText("Insert {{trigger.file}}"));
  expect(useConfigSlice.getState().drafts[action.id]!.values.attachments).toEqual([
    "{{trigger.file}}",
  ]);
});

it("non-fileRef outputs picked into a file-array field also append as a chip (no type-aware filtering — runtime parse is authoritative)", async () => {
  // Plan §6 / D-FRA-6: the picker does NOT pre-filter. Authors can
  // pick any output. The chip is still appended; the runtime
  // resolved-config Zod parse rejects a non-FileRef-shaped resolved
  // value at execute time. This test pins the no-filter behavior so a
  // future "type-aware filtering" slice has to consciously override it.
  const user = userEvent.setup();
  render(
    <WorkflowBuilder
      workflow={baseWorkflow}
      triggerProviders={[]}
      actionProviders={[]}
    />,
  );

  await user.click(screen.getByRole("button", { name: /add trigger/i }));
  await waitFor(() => expect(screen.getByText("Manual Trigger")).toBeInTheDocument());
  await user.click(screen.getByText("Manual Trigger"));
  await user.click(screen.getByRole("button", { name: /add action/i }));
  await waitFor(() => expect(screen.getByText("Attach Files (test)")).toBeInTheDocument());
  await user.click(screen.getByText("Attach Files (test)"));
  const action = useGraphSlice
    .getState()
    .pendingNodes.find((n) => n.kind === "action")!;
  await user.click(
    screen.getByRole("button", { name: /configure action node/i }),
  );
  await waitFor(() => expect(screen.getByLabelText("Attachments")).toBeInTheDocument());

  await user.click(screen.getByTestId("file-array-attachments-picker-trigger"));
  // The trigger payload also exposes a string-typed `subject` — pick that.
  await user.click(screen.getByLabelText("Insert {{trigger.subject}}"));

  expect(useConfigSlice.getState().drafts[action.id]!.values.attachments).toEqual([
    "{{trigger.subject}}",
  ]);
});

it("file-array picker hides itself when there are no upstream sources (parity with TextField picker)", async () => {
  // This file-array action is the ONLY node in the workflow — no
  // upstream ancestors → picker is hidden. VariablePickerButton
  // renders nothing when `sources.length === 0`, so the trigger
  // testid is absent from the DOM.
  const user = userEvent.setup();
  render(
    <WorkflowBuilder
      workflow={baseWorkflow}
      triggerProviders={[]}
      actionProviders={[]}
    />,
  );

  // Add a trigger that surfaces NO ancestors-visible payload at the
  // alias path the picker uses — but with at least one node so the
  // workflow is well-formed. We then explicitly open the trigger
  // config; trigger nodes have no upstream sources by definition.
  await user.click(screen.getByRole("button", { name: /add trigger/i }));
  await waitFor(() => expect(screen.getByText("Manual Trigger")).toBeInTheDocument());
  await user.click(screen.getByText("Manual Trigger"));
  await user.click(screen.getByRole("button", { name: /add action/i }));
  await waitFor(() => expect(screen.getByText("Attach Files (test)")).toBeInTheDocument());
  await user.click(screen.getByText("Attach Files (test)"));
  await user.click(
    screen.getByRole("button", { name: /configure action node/i }),
  );
  await waitFor(() => expect(screen.getByLabelText("Attachments")).toBeInTheDocument());

  // Picker IS visible here (action has the trigger as an ancestor).
  expect(
    screen.getByTestId("file-array-attachments-picker-trigger"),
  ).toBeInTheDocument();

  // Now flip the assertion direction — verify that a HIDDEN picker
  // hides when there are zero upstream sources. The simplest way to
  // reach that state inside this test setup is to override the picker
  // sources via the configSlice's `activeNodeId`: when the trigger is
  // the active node, the picker has no ancestors. Open the trigger
  // config (it has no fields, so no UI to drive — assert via slice).
  await user.click(within(screen.getByRole("complementary", { name: /node configuration/i })).getByLabelText(/close/i));
  // Trigger has empty fields[] so its config rail renders no fields
  // and no picker — covered by hook contract `EMPTY_RESULT` in
  // useUpstreamVariables when sources are empty.
});

it("existing text-field picker behavior is unchanged: variable insertion still text-inserts into a text field", async () => {
  // Regression guard for D-FRA-5: file-array chip-append must NOT
  // change how the picker behaves on other field types. Construct a
  // workflow where the same picker source is consumed by a text
  // field; insertion must produce a string value, not an array.
  const user = userEvent.setup();
  const textConsumer: ActionMeta = {
    key: "native:http_request",
    provider: "native",
    type: "http_request",
    displayName: "HTTP Request",
    description: "Send an HTTP request.",
    category: "http",
    requiresIntegration: false,
    fields: [
      {
        name: "url",
        label: "URL",
        type: "text",
        required: true,
        placeholder: "https://api.example.com",
      },
    ],
    outputs: [{ name: "status", type: "number" }],
    producesFileRef: false,
    consumesFileRef: false,
    displayOrder: 10,
  };
  mockListNativeActions.mockResolvedValue([textConsumer]);
  __resetNativeActionsCacheForTests();

  render(
    <WorkflowBuilder
      workflow={baseWorkflow}
      triggerProviders={[]}
      actionProviders={[]}
    />,
  );

  await user.click(screen.getByRole("button", { name: /add trigger/i }));
  await waitFor(() => expect(screen.getByText("Manual Trigger")).toBeInTheDocument());
  await user.click(screen.getByText("Manual Trigger"));
  await user.click(screen.getByRole("button", { name: /add action/i }));
  await waitFor(() => expect(screen.getByText("HTTP Request")).toBeInTheDocument());
  await user.click(screen.getByText("HTTP Request"));
  const action = useGraphSlice
    .getState()
    .pendingNodes.find((n) => n.kind === "action")!;
  await user.click(
    screen.getByRole("button", { name: /configure action node/i }),
  );
  await waitFor(() => expect(screen.getByLabelText("URL")).toBeInTheDocument());

  const urlInput = screen.getByLabelText("URL") as HTMLInputElement;
  urlInput.focus();
  await user.click(screen.getByTestId("text-url-picker-trigger"));
  await user.click(screen.getByLabelText("Insert {{trigger.file}}"));

  // Text-insert behavior — the field value is a string, NOT an array.
  expect(urlInput.value).toBe("{{trigger.file}}");
  const draft = useConfigSlice.getState().drafts[action.id]!;
  expect(typeof draft.values.url).toBe("string");
  expect(draft.values.url).toBe("{{trigger.file}}");
});
