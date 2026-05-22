/**
 * Slice 3.18 integration test — Microsoft Outlook `send_email` action
 * config round-trip through the live WorkflowBuilder shell.
 *
 * Proves the Slice 3.17 Outlook action metadata + Slice 3.13 string-
 * array renderer + Slice 3.0 SchemaForm plumbing compose cleanly for
 * a SECOND provider after Gmail. Distinct surface from Gmail:
 *   - `isHtml` is a required boolean (no default) → Switch.
 *   - `importance` is a required select with no default → Select.
 *   - `attachments` (FileRefSchema[]) is intentionally NOT in fields[]
 *     today (meta-level decision — see Slice 3.17 commit). Meta still
 *     declares `consumesFileRef: true` to advertise intent.
 *
 * Flow:
 *   1. Add native:manual.run trigger so the workflow is well-formed.
 *   2. Drill into Outlook via the action picker, pick Send Email.
 *   3. Verify the action node carries provider=microsoft-outlook +
 *      type=send_email.
 *   4. Open the config rail — every shipped sendEmailMeta field
 *      renders (To / Cc / Bcc / Subject / Body / Is HTML / Importance).
 *      Attachments are NOT in fields[] (FieldMeta has no FileRef-array
 *      type yet); meta's consumesFileRef=true is asserted from the
 *      imported real meta.
 *   5. Add two recipients to `to`; one Cc.
 *   6. Type Subject + Body via plain text inputs.
 *   7. Toggle Is HTML on via the Switch role.
 *   8. Set Importance to "high". Done via configSlice.updateField rather
 *      than UI click because Radix Select portals its content and jsdom
 *      doesn't reliably interact with the portal — this matches the
 *      precedent in SelectField.test.tsx which limits select-UI testing
 *      to trigger-shape assertions. The handler-renderer wiring is
 *      identical for both paths (updateField is what onChange calls).
 *   9. Modal Save → pendingNodes config carries real `string[]` chip
 *      values; subject/body remain strings; isHtml is boolean; importance
 *      is "high".
 *  10. Modal Save does NOT call updateWorkflow.
 *  11. Toolbar Save → updateWorkflow called once; persisted payload
 *      carries the same shapes; Array.isArray on to/cc.
 *  12. Server-managed / handler-output fields stay absent from config.
 *  13. Untouched optional fields (bcc) stay absent.
 *
 * FileRef metadata boundary asserted from the imported real meta:
 * `consumesFileRef: true` is set even though `attachments` is not a
 * builder-visible field today. This is the contract V2 advertised for
 * future variable-picker file-aware rendering. Asserted in the test
 * because that's the meta-level promise.
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
  listNativeTriggers: () => mockListNativeTriggers(),
  listProviderActions: (p: string) => mockListProviderActions(p),
  listProviderTriggers: (p: string) => mockListProviderTriggers(p),
  DiscoveryApiError: class DiscoveryApiError extends Error {
    code = "UNKNOWN";
    status = 500;
  },
}));

import { act, render, screen, waitFor, within } from "@testing-library/react";
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
  payloadShape: [],
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
  createdAt: "2026-05-17T00:00:00Z",
  updatedAt: "2026-05-17T00:00:00Z",
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

it("FileRef metadata boundary: Outlook sendEmailMeta advertises consumesFileRef=true (attachments not yet a builder field)", () => {
  expect(outlookSendEmailMeta.consumesFileRef).toBe(true);
  expect(outlookSendEmailMeta.producesFileRef).toBe(false);
  // attachments is intentionally absent from fields[] until a FileRef-
  // array renderer exists — runtime accepts FileRef[] via direct
  // workflow JSON edit; the meta surface reflects today's UI capability.
  expect(
    outlookSendEmailMeta.fields.find((f) => f.name === "attachments"),
  ).toBeUndefined();
});

it("end-to-end: Outlook send_email config round-trips chip arrays + required isHtml + required importance through modal Save and toolbar Save", async () => {
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

  // 1. Add a native manual trigger so the workflow is well-formed.
  await user.click(screen.getByRole("button", { name: /add trigger/i }));
  await waitFor(() => {
    expect(screen.getByText("Manual")).toBeInTheDocument();
  });
  await user.click(screen.getByText("Manual"));

  // 2. Open the action picker, drill into Outlook, pick Send Email.
  await user.click(screen.getByRole("button", { name: /add action/i }));
  await user.click(
    screen.getByRole("button", { name: /browse microsoft outlook actions/i }),
  );
  await waitFor(() => {
    expect(screen.getByText("Send Email")).toBeInTheDocument();
  });
  await user.click(screen.getByText("Send Email"));

  // 3. Verify the action node landed in the graph with the right key.
  const action = useGraphSlice
    .getState()
    .pendingNodes.find((n) => n.kind === "action");
  expect(action).toBeDefined();
  expect(action!.provider).toBe("microsoft-outlook");
  expect(action!.type).toBe("send_email");

  // 4. Open the action config rail. Verify every shipped sendEmailMeta
  //    field renders. Use scoped textbox/switch/combobox queries — the
  //    StringArrayField's Add-button aria-label substring overlaps the
  //    field label (Slice 3.13 lesson).
  await user.click(
    screen.getByRole("button", { name: /configure action node/i }),
  );
  await waitFor(() => {
    expect(screen.getByRole("textbox", { name: /^to$/i })).toBeInTheDocument();
  });
  expect(screen.getByRole("textbox", { name: /^cc$/i })).toBeInTheDocument();
  expect(screen.getByRole("textbox", { name: /^bcc$/i })).toBeInTheDocument();
  expect(screen.getByRole("textbox", { name: /^subject$/i })).toBeInTheDocument();
  expect(screen.getByRole("textbox", { name: /^body$/i })).toBeInTheDocument();
  expect(screen.getByRole("switch", { name: /is html/i })).toBeInTheDocument();
  expect(
    screen.getByRole("combobox", { name: /^importance$/i }),
  ).toBeInTheDocument();

  // 5. Add two recipients to `to`. First via Enter, second via Add button.
  const toInput = screen.getByRole("textbox", { name: /^to$/i }) as HTMLInputElement;
  await user.type(toInput, "alpha@example.com");
  await user.keyboard("{Enter}");
  await user.type(toInput, "beta@example.com");
  await user.click(screen.getByRole("button", { name: /^add to item$/i }));

  // Draft becomes dirty on first edit.
  expect(useConfigSlice.getState().drafts[action!.id]!.isDirty).toBe(true);

  // 6. Add one Cc recipient.
  const ccInput = screen.getByRole("textbox", { name: /^cc$/i }) as HTMLInputElement;
  await user.type(ccInput, "manager@example.com");
  await user.keyboard("{Enter}");

  // 7. Type Subject + Body.
  await user.type(
    screen.getByRole("textbox", { name: /^subject$/i }),
    "Outlook test subject",
  );
  await user.type(
    screen.getByRole("textbox", { name: /^body$/i }),
    "Hello from Outlook builder",
  );

  // 8. Toggle Is HTML on via Switch click. Switch is a native button-role
  //    primitive (not portaled), so this works in jsdom.
  await user.click(screen.getByRole("switch", { name: /is html/i }));

  // 9. Set Importance to "high" via configSlice.updateField directly.
  //    Radix Select portals its content; SelectField.test.tsx explicitly
  //    limits select UI testing to trigger-shape assertions for the same
  //    jsdom-portal reason. The path through configSlice IS what the
  //    SelectField's onChange invokes, so this test still proves the
  //    end-to-end draft → graphSlice → toolbar Save → updateWorkflow
  //    plumbing. Wrapped in act() so React's update-flush warning stays
  //    quiet — the store update synchronously re-renders subscribed
  //    components.
  act(() => {
    useConfigSlice.getState().updateField({
      nodeId: action!.id,
      name: "importance",
      value: "high",
    });
  });

  // 10. Modal Save flushes the draft into graphSlice.pendingNodes.
  const modal = screen.getByRole("complementary", {
    name: /node configuration/i,
  });
  await user.click(within(modal).getByRole("button", { name: /^save$/i }));
  const pendingConfig = useGraphSlice
    .getState()
    .pendingNodes.find((n) => n.id === action!.id)!.config;

  // Chip fields are real arrays — NOT JSON-encoded, NOT CSV-encoded.
  expect(pendingConfig.to).toEqual(["alpha@example.com", "beta@example.com"]);
  expect(pendingConfig.cc).toEqual(["manager@example.com"]);
  expect(Array.isArray(pendingConfig.to)).toBe(true);
  expect(Array.isArray(pendingConfig.cc)).toBe(true);
  expect(typeof pendingConfig.to).not.toBe("string");
  expect(typeof pendingConfig.cc).not.toBe("string");

  // String fields stay strings.
  expect(pendingConfig.subject).toBe("Outlook test subject");
  expect(pendingConfig.body).toBe("Hello from Outlook builder");
  expect(typeof pendingConfig.subject).toBe("string");
  expect(typeof pendingConfig.body).toBe("string");

  // Required-no-default Q11 fields land with their explicit choices.
  expect(pendingConfig.isHtml).toBe(true);
  expect(typeof pendingConfig.isHtml).toBe("boolean");
  expect(pendingConfig.importance).toBe("high");
  expect(typeof pendingConfig.importance).toBe("string");

  // Untouched bcc — chip renderer must not manufacture an empty array.
  expect(pendingConfig.bcc).toBeUndefined();
  // No attachments key — meta doesn't expose it and the user didn't
  // wire it via JSON edit.
  expect(pendingConfig.attachments).toBeUndefined();

  // Modal Save MUST NOT have called updateWorkflow yet.
  expect(mockUpdateWorkflow).not.toHaveBeenCalled();
  expect(useConfigSlice.getState().drafts[action!.id]!.isDirty).toBe(false);

  // 11. Toolbar Save persists arrays + booleans + enums through updateWorkflow.
  const allSaveButtons = screen.getAllByRole("button", { name: /^save$/i });
  const toolbarSave = allSaveButtons.find((btn) => !modal.contains(btn))!;
  await user.click(toolbarSave);
  await waitFor(() => {
    expect(mockUpdateWorkflow).toHaveBeenCalledTimes(1);
  });
  const persistedNodes = mockUpdateWorkflow.mock.calls[0]![1].draftDefinition
    .nodes as Array<{ kind: string; provider: string; type: string; config: Record<string, unknown> }>;
  const persistedAction = persistedNodes.find((n) => n.kind === "action")!;
  expect(persistedAction.provider).toBe("microsoft-outlook");
  expect(persistedAction.type).toBe("send_email");
  expect(persistedAction.config.to).toEqual([
    "alpha@example.com",
    "beta@example.com",
  ]);
  expect(persistedAction.config.cc).toEqual(["manager@example.com"]);
  expect(persistedAction.config.subject).toBe("Outlook test subject");
  expect(persistedAction.config.body).toBe("Hello from Outlook builder");
  expect(persistedAction.config.isHtml).toBe(true);
  expect(persistedAction.config.importance).toBe("high");
  expect(Array.isArray(persistedAction.config.to)).toBe(true);
  expect(Array.isArray(persistedAction.config.cc)).toBe(true);

  // 12. Server-managed / handler-output fields stay absent from the
  //     persisted config (sendEmail.ts returns sent/threadId/labelIds —
  //     those are output, not config).
  expect(persistedAction.config.sent).toBeUndefined();
  expect(persistedAction.config.threadId).toBeUndefined();
  expect(persistedAction.config.labelIds).toBeUndefined();

  // 13. Untouched optional fields stay absent.
  expect(persistedAction.config.bcc).toBeUndefined();
  expect(persistedAction.config.attachments).toBeUndefined();

  // Regression guard: only one updateWorkflow call total.
  expect(mockUpdateWorkflow).toHaveBeenCalledTimes(1);
});
