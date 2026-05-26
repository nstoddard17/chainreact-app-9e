/**
 * Slice 3.12 integration test — full Gmail provider-trigger flow through
 * the real WorkflowBuilder shell. Mirrors the Slack test at
 * `slack-provider-trigger-config.test.tsx` for the third covered
 * provider — and adds polling-activated coverage to the Phase-3 surface
 * (GitHub: webhook-with-subscription, Slack: webhook-shared-infra,
 * Gmail: polling-with-snapshot).
 *
 *   1. Render the builder hydrated with an empty workflow.
 *   2. Open the trigger picker, drill into Gmail.
 *   3. Pick "New Labeled Email" — picker dispatches addTriggerFromMeta.
 *   4. Verify the trigger node carries provider="gmail" + type="new_labeled_email".
 *   5. Open the trigger config rail → SchemaForm renders the provider
 *      trigger's required `labelId` field.
 *   6. Type a label id → configSlice draft flips dirty.
 *   7. Modal Save → graphSlice.pendingNodes carries the persisted config.
 *      Modal Save MUST NOT trigger updateWorkflow (no hidden autosave)
 *      or activation (no hidden polling snapshot init from Save).
 *   8. Toolbar Save → updateWorkflow called once with the configured
 *      trigger.
 *   9. Add a downstream action → its variable picker exposes the Gmail
 *      trigger's payloadShape under the canonical `trigger` alias.
 *      Labeled-email-specific fields (`labelAppliedId`, `labelsAdded`)
 *      surface alongside the shared email metadata fields.
 */

const mockUpdateWorkflow = jest.fn();
const mockRunNowWorkflow = jest.fn();
jest.mock("@/lib/api/workflows", () => {
  const actual = jest.requireActual("@/lib/api/workflows");
  return {
    ...actual,
    updateWorkflow: (...args: unknown[]) => mockUpdateWorkflow(...args),
    runNowWorkflow: (...args: unknown[]) => mockRunNowWorkflow(...args),
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
import { newEmailTriggerMeta } from "@/integrations/gmail/triggers/newEmail/newEmail.meta";
import { newLabeledEmailTriggerMeta } from "@/integrations/gmail/triggers/newLabeledEmail/newLabeledEmail.meta";
import type { ActionMeta } from "@/contracts/actionMeta";
import type { WorkflowDetail } from "@/contracts/workflow";

// Slice 3.14 — use the real shipped Gmail metas instead of inline
// mocks. Migrating turns this integration test into a regression guard
// against any future Gmail meta drift (renamed field, changed label,
// dropped payloadShape entry, etc.). Previously the inline `newEmailMeta`
// mock was out of sync with the shipped meta (1 field vs 5) and the
// test silently passed. The picker test below selects new_labeled_email
// — but exposing the real `newEmailTriggerMeta` keeps both Gmail triggers
// available in the picker drill-in, matching the production surface.

const httpRequestMeta: ActionMeta = {
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
    },
  ],
  outputs: [{ name: "status", type: "number" }],
  producesFileRef: false,
  consumesFileRef: false,
  displayOrder: 10,
  isDestructive: false,
  requiresConfirmation: false,
  riskLevel: "low",
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

const triggerProviders = [{ id: "gmail", displayName: "Gmail" }];
const actionProviders = [{ id: "gmail", displayName: "Gmail" }];

beforeEach(() => {
  mockUpdateWorkflow.mockReset();
  mockRunNowWorkflow.mockReset();
  mockListNativeActions.mockReset();
  mockListNativeActions.mockResolvedValue([httpRequestMeta]);
  mockListNativeTriggers.mockReset();
  mockListNativeTriggers.mockResolvedValue([]);
  mockListProviderActions.mockReset();
  mockListProviderActions.mockResolvedValue([]);
  mockListProviderTriggers.mockReset();
  mockListProviderTriggers.mockImplementation(async (p: string) =>
    p === "gmail" ? [newEmailTriggerMeta, newLabeledEmailTriggerMeta] : [],
  );
  __resetNativeActionsCacheForTests();
  __resetNativeTriggersCacheForTests();
  __resetProviderActionsCacheForTests();
  __resetProviderTriggersCacheForTests();
  useGraphSlice.getState().reset();
  useConfigSlice.getState().reset();
  useRunSlice.getState().reset();
});

it("end-to-end: pick Gmail new_labeled_email via drill-in, configure, save, downstream picker sees payloadShape", async () => {
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

  // 1. Open the trigger picker.
  await user.click(screen.getByRole("button", { name: /choose a trigger/i }));

  // 2. Drill into the Gmail provider.
  await user.click(
    screen.getByRole("button", { name: /browse gmail triggers/i }),
  );
  await waitFor(() => {
    expect(screen.getByText("New Labeled Email")).toBeInTheDocument();
  });
  // Both Gmail triggers from the mocked catalog render.
  expect(screen.getByText("New Email")).toBeInTheDocument();

  // 3. Pick the New Labeled Email trigger.
  await user.click(screen.getByText("New Labeled Email"));

  // 4. Trigger node is in the graph with provider=gmail + type=new_labeled_email.
  const trigger = useGraphSlice
    .getState()
    .pendingNodes.find((n) => n.kind === "trigger");
  expect(trigger).toBeDefined();
  expect(trigger!.provider).toBe("gmail");
  expect(trigger!.type).toBe("new_labeled_email");

  // 5. Open the trigger config rail.
  await openLastNodeOfKind("trigger");
  await waitFor(() => {
    expect(screen.getByLabelText(/label id/i)).toBeInTheDocument();
  });
  // Header shows the meta's displayName.
  expect(screen.getByText("New Labeled Email")).toBeInTheDocument();

  // 6. Type a label id — configSlice draft flips dirty.
  await user.type(screen.getByLabelText(/label id/i), "Label_12345");
  expect(useConfigSlice.getState().drafts[trigger!.id]!.isDirty).toBe(true);

  // 7. Modal Save — graphSlice.pendingNodes carries the config.
  const modal = screen.getByRole("complementary", {
    name: /node configuration/i,
  });
  await user.click(within(modal).getByRole("button", { name: /^save$/i }));
  expect(
    useGraphSlice
      .getState()
      .pendingNodes.find((n) => n.id === trigger!.id)!.config,
  ).toMatchObject({ labelId: "Label_12345" });
  expect(useConfigSlice.getState().drafts[trigger!.id]!.isDirty).toBe(false);

  // Modal Save MUST NOT have called updateWorkflow yet. The polling
  // snapshot init lives in the lifecycle service at workflow-activate
  // time; modal Save writes pending config only. Guards against any
  // accidental "fetch historyId on Save" regression.
  expect(mockUpdateWorkflow).not.toHaveBeenCalled();

  // 8. Toolbar Save — persists workflow with the provider-trigger config.
  const allSaveButtons = screen.getAllByRole("button", { name: /^save$/i });
  const toolbarSave = allSaveButtons.find((btn) => !modal.contains(btn))!;
  await user.click(toolbarSave);
  await waitFor(() => {
    expect(mockUpdateWorkflow).toHaveBeenCalledTimes(1);
  });
  const persistedNodes = mockUpdateWorkflow.mock.calls[0]![1].draftDefinition
    .nodes as Array<{ kind: string; provider: string; type: string; config: Record<string, unknown> }>;
  const persistedTrigger = persistedNodes.find((n) => n.kind === "trigger")!;
  expect(persistedTrigger.provider).toBe("gmail");
  expect(persistedTrigger.type).toBe("new_labeled_email");
  expect(persistedTrigger.config).toMatchObject({ labelId: "Label_12345" });
  // Server-managed polling state MUST NOT be in the persisted config —
  // the activation hook owns those fields at workflow-activate time.
  expect(persistedTrigger.config.pollingEnabled).toBeUndefined();
  expect(persistedTrigger.config.snapshot).toBeUndefined();
  expect(persistedTrigger.config.polling).toBeUndefined();

  // 9. Add a downstream native action and open its variable picker — the
  //    Gmail trigger's payloadShape must surface under the canonical
  //    `trigger` alias.
  await user.click(screen.getByRole("button", { name: /add action/i }));
  await waitFor(() => {
    expect(screen.getByText("HTTP Request")).toBeInTheDocument();
  });
  await user.click(screen.getByText("HTTP Request"));

  await openLastNodeOfKind("action");
  await waitFor(() => {
    expect(screen.getByLabelText("URL")).toBeInTheDocument();
  });

  await waitFor(() => {
    expect(
      screen.getByRole("button", { name: /insert variable into url/i }),
    ).toBeInTheDocument();
  });
  await user.click(
    screen.getByRole("button", { name: /insert variable into url/i }),
  );

  await waitFor(() => {
    expect(screen.getByText("New Labeled Email")).toBeInTheDocument();
  });
  // SEC-7: from + subject are now flagged sensitive (PII); aria-label
  // gains the masked-preview suffix for screen-reader announcement.
  expect(
    screen.getByLabelText(
      "Insert {{trigger.from}} (sensitive value — preview is masked)",
    ),
  ).toBeInTheDocument();
  expect(
    screen.getByLabelText(
      "Insert {{trigger.subject}} (sensitive value — preview is masked)",
    ),
  ).toBeInTheDocument();
  // Labeled-email-specific payload fields surface alongside the shared
  // email metadata.
  expect(
    screen.getByLabelText("Insert {{trigger.labelAppliedId}}"),
  ).toBeInTheDocument();
  expect(
    screen.getByLabelText("Insert {{trigger.labelsAdded}}"),
  ).toBeInTheDocument();

  // 10. Regression guard: only one updateWorkflow call total.
  expect(mockUpdateWorkflow).toHaveBeenCalledTimes(1);
});
