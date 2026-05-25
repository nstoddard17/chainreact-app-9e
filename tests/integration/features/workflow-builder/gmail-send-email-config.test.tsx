/**
 * Slice 3.16 integration test — Gmail `send_email` action config round-
 * trip through the live WorkflowBuilder shell.
 *
 * Proves the Slice 3.15 Gmail action metadata actually works in the
 * builder UI:
 *   1. Add a native:manual.run trigger so the workflow is well-formed.
 *   2. Drill into Gmail via the action picker, pick Send Email.
 *   3. Open the trigger config rail.
 *   4. Verify all expected SchemaForm fields render (To / Cc / Bcc /
 *      Subject / Text Body / HTML Body / Reply-To / Signature / Labels).
 *   5. Add two recipients to `to` via Enter / Add button.
 *   6. Add one Cc recipient.
 *   7. Type Subject + Text Body.
 *   8. Add one label chip.
 *   9. Modal Save → graphSlice.pendingNodes config carries REAL
 *      `string[]` values (not JSON, not CSV); strings stay strings.
 *      Modal Save MUST NOT call updateWorkflow.
 *  10. Toolbar Save → updateWorkflow called once with the same array
 *      shapes in the persisted payload.
 *  11. Server-managed / internal fields stay absent.
 *
 * Uses the real shipped `sendEmailMeta` import (Slice 3.14 lesson —
 * inline-mock action metas drift out of sync with the shipped surface
 * and silently let regressions through). Trigger meta is inline because
 * we just need a valid trigger — its shape isn't under test here.
 *
 * Avoids broad `getByLabelText(/from/i)` style queries — every
 * StringArrayField has an Add button whose aria-label substring
 * overlaps the field label (Slice 3.13 lesson). Uses scoped
 * `getByRole("textbox", { name: ... })` instead.
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
import { sendEmailMeta } from "@/integrations/gmail/actions/sendEmail.meta";
import type { TriggerMeta } from "@/contracts/triggerMeta";
import type { WorkflowDetail } from "@/contracts/workflow";

// Minimal trigger so the workflow is well-formed for Save. Its shape
// isn't under test — we just need *some* trigger present.
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
const actionProviders = [{ id: "gmail", displayName: "Gmail" }];

beforeEach(() => {
  mockUpdateWorkflow.mockReset();
  mockListNativeActions.mockReset();
  mockListNativeActions.mockResolvedValue([]);
  mockListNativeTriggers.mockReset();
  mockListNativeTriggers.mockResolvedValue([manualTriggerMeta]);
  mockListProviderActions.mockReset();
  // Use the real shipped Gmail sendEmailMeta — turns this integration
  // test into a regression guard for the production Gmail meta surface.
  mockListProviderActions.mockImplementation(async (p: string) =>
    p === "gmail" ? [sendEmailMeta] : [],
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

it("end-to-end: Gmail send_email config round-trips chip arrays through modal Save and toolbar Save", async () => {
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

  // 2. Open the action picker, drill into Gmail, pick Send Email.
  await user.click(screen.getByRole("button", { name: /add action/i }));
  await user.click(
    screen.getByRole("button", { name: /browse gmail actions/i }),
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
  expect(action!.provider).toBe("gmail");
  expect(action!.type).toBe("send_email");

  // 4. Open the action config rail.
  await user.click(
    screen.getByRole("button", { name: /configure action node/i }),
  );

  // Every SchemaForm field from the shipped sendEmailMeta must render.
  // Use scoped textbox/button queries — StringArrayField's Add button
  // aria-label substring overlaps the field label (Slice 3.13 lesson).
  await waitFor(() => {
    expect(screen.getByRole("textbox", { name: /^to$/i })).toBeInTheDocument();
  });
  expect(screen.getByRole("textbox", { name: /^cc$/i })).toBeInTheDocument();
  expect(screen.getByRole("textbox", { name: /^bcc$/i })).toBeInTheDocument();
  expect(screen.getByRole("textbox", { name: /^subject$/i })).toBeInTheDocument();
  expect(screen.getByRole("textbox", { name: /^text body$/i })).toBeInTheDocument();
  expect(screen.getByRole("textbox", { name: /^html body$/i })).toBeInTheDocument();
  expect(screen.getByRole("textbox", { name: /^reply-to$/i })).toBeInTheDocument();
  expect(screen.getByRole("textbox", { name: /^signature$/i })).toBeInTheDocument();
  expect(
    screen.getByRole("textbox", { name: /labels \(apply after send\)/i }),
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
  await user.type(ccInput, "gamma@example.com");
  await user.keyboard("{Enter}");

  // 7. Type Subject + Text Body.
  await user.type(
    screen.getByRole("textbox", { name: /^subject$/i }),
    "Test subject",
  );
  await user.type(
    screen.getByRole("textbox", { name: /^text body$/i }),
    "Hello from builder",
  );

  // 8. Add a label chip.
  const labelsInput = screen.getByRole("textbox", {
    name: /labels \(apply after send\)/i,
  }) as HTMLInputElement;
  await user.type(labelsInput, "Label_5");
  await user.keyboard("{Enter}");

  // 9. Modal Save flushes the draft into graphSlice.pendingNodes.
  const modal = screen.getByRole("complementary", {
    name: /node configuration/i,
  });
  await user.click(within(modal).getByRole("button", { name: /^save$/i }));
  const pendingConfig = useGraphSlice
    .getState()
    .pendingNodes.find((n) => n.id === action!.id)!.config;

  // Chip fields are real arrays — NOT JSON-encoded, NOT CSV-encoded.
  expect(pendingConfig.to).toEqual(["alpha@example.com", "beta@example.com"]);
  expect(pendingConfig.cc).toEqual(["gamma@example.com"]);
  expect(pendingConfig.labels).toEqual(["Label_5"]);
  expect(Array.isArray(pendingConfig.to)).toBe(true);
  expect(Array.isArray(pendingConfig.cc)).toBe(true);
  expect(Array.isArray(pendingConfig.labels)).toBe(true);
  expect(typeof pendingConfig.to).not.toBe("string");
  expect(typeof pendingConfig.cc).not.toBe("string");
  expect(typeof pendingConfig.labels).not.toBe("string");

  // String fields stay strings.
  expect(pendingConfig.subject).toBe("Test subject");
  expect(pendingConfig.textBody).toBe("Hello from builder");
  expect(typeof pendingConfig.subject).toBe("string");
  expect(typeof pendingConfig.textBody).toBe("string");

  // Bcc was never touched — must be absent from the draft (no spurious
  // empty array). Confirms the chip renderer doesn't manufacture state
  // for fields the user didn't interact with.
  expect(pendingConfig.bcc).toBeUndefined();

  // Modal Save MUST NOT have called updateWorkflow yet.
  expect(mockUpdateWorkflow).not.toHaveBeenCalled();
  expect(useConfigSlice.getState().drafts[action!.id]!.isDirty).toBe(false);

  // 10. Toolbar Save persists arrays through updateWorkflow.
  const allSaveButtons = screen.getAllByRole("button", { name: /^save$/i });
  const toolbarSave = allSaveButtons.find((btn) => !modal.contains(btn))!;
  await user.click(toolbarSave);
  await waitFor(() => {
    expect(mockUpdateWorkflow).toHaveBeenCalledTimes(1);
  });
  const persistedNodes = mockUpdateWorkflow.mock.calls[0]![1].draftDefinition
    .nodes as Array<{ kind: string; provider: string; type: string; config: Record<string, unknown> }>;
  const persistedAction = persistedNodes.find((n) => n.kind === "action")!;
  expect(persistedAction.provider).toBe("gmail");
  expect(persistedAction.type).toBe("send_email");
  expect(persistedAction.config.to).toEqual([
    "alpha@example.com",
    "beta@example.com",
  ]);
  expect(persistedAction.config.cc).toEqual(["gamma@example.com"]);
  expect(persistedAction.config.labels).toEqual(["Label_5"]);
  expect(persistedAction.config.subject).toBe("Test subject");
  expect(persistedAction.config.textBody).toBe("Hello from builder");
  expect(Array.isArray(persistedAction.config.to)).toBe(true);
  expect(Array.isArray(persistedAction.config.cc)).toBe(true);
  expect(Array.isArray(persistedAction.config.labels)).toBe(true);

  // 11. Server-managed / internal fields stay absent from the persisted
  //     config. The Gmail send_email handler returns server-side IDs in
  //     its output; none of those should leak into config.
  expect(persistedAction.config.id).toBeUndefined();
  expect(persistedAction.config.threadId).toBeUndefined();
  expect(persistedAction.config.labelIds).toBeUndefined();

  // Untouched fields (bcc, htmlBody, replyTo, signature) stay absent —
  // confirms there's no spurious-default leakage from any field renderer.
  expect(persistedAction.config.bcc).toBeUndefined();
  expect(persistedAction.config.htmlBody).toBeUndefined();
  expect(persistedAction.config.replyTo).toBeUndefined();
  expect(persistedAction.config.signature).toBeUndefined();

  // Regression guard: only one updateWorkflow call total.
  expect(mockUpdateWorkflow).toHaveBeenCalledTimes(1);
});
