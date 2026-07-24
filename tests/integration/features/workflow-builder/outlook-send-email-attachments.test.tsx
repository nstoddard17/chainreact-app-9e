/**
 * Slice 3.23 integration test — Microsoft Outlook `send_email`
 * attachments end-to-end through the live WorkflowBuilder shell.
 *
 * Proves the Slice 3.21 `file-array` renderer + Slice 3.22 variable-
 * picker chip-append branch compose with the Slice 3.17/3.23 Outlook
 * `send_email` meta:
 *   - the new `attachments` field renders as `file-array` inside the
 *     config rail,
 *   - the variable picker on it inserts a canonical `{{nodeId.path}}`
 *     token as a chip (not as a text replacement),
 *   - Modal Save writes a real `string[]` array into pendingNodes,
 *   - Toolbar Save persists the same shape through `updateWorkflow`,
 *   - all other shipped Outlook `send_email` fields (`to`, `subject`,
 *     `body`, `isHtml`, `importance`) still persist correctly alongside.
 *
 * Variable source: this test uses a `manualTriggerMeta` payloadShape
 * with a top-level `file` declared as `type: "fileRef"` so the picker
 * surfaces it as an insertable upstream output. This mirrors the
 * picker-source pattern from Slice 3.22's
 * `variable-picker-file-array.test.tsx`.
 *
 * Out of scope (the Slice 3.20 plan + decisions explicitly defer
 * these to later slices and the test does NOT assert them):
 *   - No type-aware picker filtering (D-FRA-6).
 *   - No FileRef sub-field drilling.
 *   - No upload UI / signed-URL minting / cross-provider URL fetch.
 *   - No Gmail metadata changes.
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
const mockListProviderActions = jest.fn();
const mockListProviderTriggers = jest.fn();
jest.mock("@/lib/api/discovery", () => ({
  __esModule: true,
  listNativeActions: () => mockListNativeActions(),
  listAiActions: () => Promise.resolve([]),
  listNativeTriggers: () => mockListNativeTriggers(),
  listProviderActions: (p: string) => mockListProviderActions(p),
  listProviderTriggers: (p: string) => mockListProviderTriggers(p),
  DiscoveryApiError: class DiscoveryApiError extends Error {
    code = "UNKNOWN";
    status = 500;
  },
}));

import { openLastNodeOfKind } from "./helpers/openLastNodeOfKind";
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
import { outlookSendEmailMeta } from "@/integrations/microsoft-outlook/actions/sendEmail.meta";
import type { TriggerMeta } from "@/contracts/triggerMeta";
import type { WorkflowDetail } from "@/contracts/workflow";
import { selectFieldOption } from "./helpers/selectField";

// Manual trigger whose payload advertises a FileRef-typed `file` so
// the picker has a source to insert into the file-array field. Pattern
// mirrors Slice 3.22 `variable-picker-file-array.test.tsx`.
const manualTriggerMeta: TriggerMeta = {
  key: "native:manual.run",
  provider: "native",
  type: "manual.run",
  displayName: "Manual",
  description: "Fired manually via Run Now.",
  category: "logic",
  activation: "manual",
  requiresIntegration: false,
  fields: [],
  payloadShape: [
    { name: "file", type: "fileRef", description: "Uploaded attachment." },
  ],
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

const triggerProviders = [{ id: "native", displayName: "Native" }];
const actionProviders = [
  { id: "microsoft-outlook", displayName: "Microsoft Outlook" },
];

beforeEach(() => {
  mockUpdateWorkflow.mockReset();
  mockListNativeActions.mockReset();
  mockListNativeActions.mockResolvedValue([]);
  mockListNativeTriggers.mockReset();
  mockListNativeTriggers.mockResolvedValue([manualTriggerMeta]);
  mockListProviderActions.mockReset();
  mockListProviderActions.mockImplementation(async (p: string) =>
    p === "microsoft-outlook" ? [outlookSendEmailMeta] : [],
  );
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

it("Outlook send_email meta exposes attachments as file-array (Slice 3.23 — meta-level guard)", () => {
  const attachments = outlookSendEmailMeta.fields.find(
    (f) => f.name === "attachments",
  );
  expect(attachments).toBeDefined();
  expect(attachments).toEqual(
    expect.objectContaining({
      type: "file-array",
      required: false,
      fileArrayMaxItems: 25,
    }),
  );
  // The shipped FileRef advertisement flags do not change — runtime
  // still owns attachment handling; the meta upgrade is UI-only.
  expect(outlookSendEmailMeta.consumesFileRef).toBe(true);
  expect(outlookSendEmailMeta.producesFileRef).toBe(false);
});

it("end-to-end: variable-picker → Outlook send_email.attachments file-array → Modal Save + Toolbar Save preserve the token chip alongside every other shipped field", async () => {
  mockUpdateWorkflow.mockImplementation(async (_id, body) => ({
    ...baseWorkflow,
    draftDefinition: body.draftDefinition,
  }));
  const user = userEvent.setup();
  render(
    <WorkflowBuilder
      workflow={baseWorkflow}
      triggerProviders={triggerProviders}
      actionProviders={actionProviders}
    />,
  );

  // 1. Add the native manual trigger so the action has an upstream.
  await user.click(screen.getByRole("button", { name: /choose a trigger/i }));
  await waitFor(() => {
    expect(screen.getByText("Manual")).toBeInTheDocument();
  });
  await user.click(screen.getByText("Manual"));

  // 2. Add the Outlook send_email action.
  await user.click(screen.getByRole("button", { name: /add action/i }));
  await user.click(
    screen.getByRole("button", { name: /browse microsoft outlook actions/i }),
  );
  await waitFor(() => {
    expect(screen.getByText("Send Email")).toBeInTheDocument();
  });
  await user.click(screen.getByText("Send Email"));
  const action = useGraphSlice
    .getState()
    .pendingNodes.find((n) => n.kind === "action")!;
  expect(action.provider).toBe("microsoft-outlook");
  expect(action.type).toBe("send_email");

  // 3. Open the action config rail. attachments renders alongside the
  //    pre-existing send_email fields.
  await openLastNodeOfKind("action");
  await waitFor(() => {
    expect(screen.getByRole("textbox", { name: /^to$/i })).toBeInTheDocument();
  });
  // attachments uses the file-array Input — its accessible name is the
  // field label ("Attachments"). Confirm it renders.
  expect(
    screen.getByRole("textbox", { name: /^attachments$/i }),
  ).toBeInTheDocument();
  // Picker is present because the manual trigger is an ancestor source.
  expect(
    screen.getByTestId("file-array-attachments-picker-trigger"),
  ).toBeInTheDocument();

  // 4. Fill every required-by-key field so the workflow is realistic +
  //    asserts attachments compose cleanly with the rest of the form.
  await user.type(
    screen.getByRole("textbox", { name: /^to$/i }),
    "alice@example.com",
  );
  await user.keyboard("{Enter}");
  await user.type(
    screen.getByRole("textbox", { name: /^subject$/i }),
    "With attachment",
  );
  await user.type(
    screen.getByRole("textbox", { name: /^body$/i }),
    "See attachment.",
  );
  await user.click(screen.getByRole("switch", { name: /is html/i }));
  await selectFieldOption(user, /^importance$/i, "Normal");

  // 5. Insert a FileRef token into attachments via the picker.
  await user.click(
    screen.getByTestId("file-array-attachments-picker-trigger"),
  );
  await waitFor(() => {
    expect(
      screen.getByTestId("file-array-attachments-picker-popover"),
    ).toBeInTheDocument();
  });
  await user.click(screen.getByLabelText("Insert {{trigger.file}}"));
  // Chip rendered. Scope to the chip container — the rail's
  // "What this step will do" overview (CONFIG-UX-NODE-SUMMARY-1) also
  // echoes the token, so an unscoped getByText is ambiguous.
  expect(screen.getByTestId("field-attachments-chips")).toHaveTextContent(
    "{{trigger.file}}",
  );
  // Popover closes.
  expect(
    screen.queryByTestId("file-array-attachments-picker-popover"),
  ).not.toBeInTheDocument();

  // configSlice draft now holds attachments as a real string array.
  const draft = useConfigSlice.getState().drafts[action.id]!;
  expect(draft.values.attachments).toEqual(["{{trigger.file}}"]);
  expect(Array.isArray(draft.values.attachments)).toBe(true);
  expect(typeof draft.values.attachments).not.toBe("string");
  expect(draft.isDirty).toBe(true);

  // 6. Modal Save flushes the draft.
  const modal = screen.getByRole("complementary", {
    name: /node configuration/i,
  });
  await user.click(within(modal).getByRole("button", { name: /^save$/i }));
  const pendingConfig = useGraphSlice
    .getState()
    .pendingNodes.find((n) => n.id === action.id)!.config;

  // attachments persists as the real array — never JSON / CSV / base64.
  expect(pendingConfig.attachments).toEqual(["{{trigger.file}}"]);
  expect(Array.isArray(pendingConfig.attachments)).toBe(true);
  expect(typeof pendingConfig.attachments).not.toBe("string");

  // Every other shipped send_email field is also persisted correctly.
  expect(pendingConfig.to).toEqual(["alice@example.com"]);
  expect(Array.isArray(pendingConfig.to)).toBe(true);
  expect(pendingConfig.subject).toBe("With attachment");
  expect(pendingConfig.body).toBe("See attachment.");
  expect(pendingConfig.isHtml).toBe(true);
  expect(pendingConfig.importance).toBe("normal");

  // Untouched optional fields stay absent.
  expect(pendingConfig.cc).toBeUndefined();
  expect(pendingConfig.bcc).toBeUndefined();

  // Modal Save MUST NOT have called updateWorkflow yet.
  expect(mockUpdateWorkflow).not.toHaveBeenCalled();

  // 7. Toolbar Save persists.
  const allSaveButtons = screen.getAllByRole("button", { name: /^save$/i });
  const toolbarSave = allSaveButtons.find((btn) => !modal.contains(btn))!;
  await user.click(toolbarSave);
  await waitFor(() => {
    expect(mockUpdateWorkflow).toHaveBeenCalledTimes(1);
  });
  const persistedNodes = mockUpdateWorkflow.mock.calls[0]![1].draftDefinition
    .nodes as Array<{
    kind: string;
    provider: string;
    type: string;
    config: Record<string, unknown>;
  }>;
  const persistedAction = persistedNodes.find((n) => n.kind === "action")!;
  expect(persistedAction.provider).toBe("microsoft-outlook");
  expect(persistedAction.type).toBe("send_email");
  expect(persistedAction.config.attachments).toEqual(["{{trigger.file}}"]);
  expect(Array.isArray(persistedAction.config.attachments)).toBe(true);

  // Companion sanity — all the pre-existing shipped fields landed too.
  expect(persistedAction.config.to).toEqual(["alice@example.com"]);
  expect(persistedAction.config.subject).toBe("With attachment");
  expect(persistedAction.config.body).toBe("See attachment.");
  expect(persistedAction.config.isHtml).toBe(true);
  expect(persistedAction.config.importance).toBe("normal");
  expect(persistedAction.config.cc).toBeUndefined();
  expect(persistedAction.config.bcc).toBeUndefined();

  // Single updateWorkflow call total — picker insertion / chip
  // append must not double-fire the workflow update.
  expect(mockUpdateWorkflow).toHaveBeenCalledTimes(1);
});
