/**
 * Slice 3.27 integration test — Slack `upload_file` config end-to-end
 * through the live WorkflowBuilder shell.
 *
 * Proves the Slice 3.25 single-FileRef FileField + Slice 3.7 variable
 * picker compose with the Slice 3.27 Slack `upload_file` meta:
 *   - the `file` field renders as the single-FileRef chip renderer,
 *   - the picker inserts a canonical `{{nodeId.path}}` token (NOT a
 *     JSON literal, NOT a CSV, NOT an array),
 *   - selecting a DIFFERENT upstream output REPLACES the chip — single-
 *     value semantics (decision D-SFR-6),
 *   - Modal Save writes the token as a real string into pendingNodes,
 *   - Toolbar Save persists the same shape through `updateWorkflow`,
 *   - the other Slack `upload_file` config fields (`channel`, `title`,
 *     `initialComment`) round-trip alongside.
 *
 * Variable source: this test plumbs an upstream FileRef-producing
 * output via the manual trigger's `payloadShape`. Mirrors the picker-
 * source pattern from Slice 3.22 + 3.23.
 *
 * Out of scope (deferred by the Slice 3.24 plan and the Slice 3.25
 * renderer):
 *   - No type-aware picker filtering (D-FRA-6 / D-SFR-10).
 *   - No upload UI / signed-URL minting / cross-provider fetch.
 *   - No FileRef sub-field drilling.
 *   - Runtime handler unchanged; the provider_url-arm rejection is a
 *     handler concern and never asserted here.
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
import { slackUploadFileMeta } from "@/integrations/slack/actions/files/uploadFile.meta";
import type { TriggerMeta } from "@/contracts/triggerMeta";
import type { WorkflowDetail } from "@/contracts/workflow";

// Manual trigger advertises TWO FileRef-typed payload entries so the
// "replace, not append" test below has a distinct second source.
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
    { name: "file", type: "fileRef", description: "Primary attachment." },
    {
      name: "altFile",
      type: "fileRef",
      description: "Alternate attachment (used to prove replace semantics).",
    },
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
const actionProviders = [{ id: "slack", displayName: "Slack" }];

beforeEach(() => {
  mockUpdateWorkflow.mockReset();
  mockListNativeActions.mockReset();
  mockListNativeActions.mockResolvedValue([]);
  mockListNativeTriggers.mockReset();
  mockListNativeTriggers.mockResolvedValue([manualTriggerMeta]);
  mockListProviderActions.mockReset();
  mockListProviderActions.mockImplementation(async (p: string) =>
    p === "slack" ? [slackUploadFileMeta] : [],
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

it("Slack upload_file meta exposes a single-FileRef `file` field and BOTH FileRef flags (Slice 3.27 — meta guard)", () => {
  const fileField = slackUploadFileMeta.fields.find((f) => f.name === "file");
  expect(fileField).toBeDefined();
  expect(fileField!.type).toBe("file");
  expect(fileField!.required).toBe(true);
  // Dual FileRef advertisement — Slack upload_file is the rare action
  // that both consumes a FileRef in config AND emits one in output.
  expect(slackUploadFileMeta.consumesFileRef).toBe(true);
  expect(slackUploadFileMeta.producesFileRef).toBe(true);
});

it("end-to-end: variable-picker → Slack upload_file.file FileField chip → Modal Save + Toolbar Save preserve the single token alongside every other shipped field", async () => {
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
  await user.click(screen.getByRole("button", { name: /add trigger/i }));
  await waitFor(() => {
    expect(screen.getByText("Manual")).toBeInTheDocument();
  });
  await user.click(screen.getByText("Manual"));

  // 2. Drill into Slack via the action picker, pick Upload File.
  await user.click(screen.getByRole("button", { name: /add action/i }));
  await user.click(screen.getByRole("button", { name: /browse slack actions/i }));
  await waitFor(() => {
    expect(screen.getByText("Upload File")).toBeInTheDocument();
  });
  await user.click(screen.getByText("Upload File"));
  const action = useGraphSlice
    .getState()
    .pendingNodes.find((n) => n.kind === "action")!;
  expect(action.provider).toBe("slack");
  expect(action.type).toBe("upload_file");

  // 3. Open the action config rail.
  await user.click(
    screen.getByRole("button", { name: /configure action node/i }),
  );
  await waitFor(() => {
    expect(screen.getByRole("textbox", { name: /^channel$/i })).toBeInTheDocument();
  });
  // FileField uses the field label "File" — its Input is a textbox.
  expect(screen.getByRole("textbox", { name: /^file$/i })).toBeInTheDocument();
  expect(screen.getByRole("textbox", { name: /^title$/i })).toBeInTheDocument();
  expect(screen.getByRole("textbox", { name: /^message$/i })).toBeInTheDocument();
  // FileField picker is present (manual trigger is an ancestor source).
  expect(
    screen.getByTestId("file-file-picker-trigger"),
  ).toBeInTheDocument();

  // 4. Fill the required `channel` + a couple of optional fields so
  //    the shape proves the FileField composes alongside the rest.
  await user.type(
    screen.getByRole("textbox", { name: /^channel$/i }),
    "C01ABC23DEF",
  );
  await user.type(
    screen.getByRole("textbox", { name: /^title$/i }),
    "Q4 report",
  );
  await user.type(
    screen.getByRole("textbox", { name: /^message$/i }),
    "Attaching the Q4 report for review.",
  );

  // 5. Insert a FileRef token into the `file` field via the picker.
  await user.click(screen.getByTestId("file-file-picker-trigger"));
  await waitFor(() => {
    expect(
      screen.getByTestId("file-file-picker-popover"),
    ).toBeInTheDocument();
  });
  await user.click(screen.getByLabelText("Insert {{trigger.file}}"));
  // Chip rendered + popover closed.
  expect(screen.getByText("{{trigger.file}}")).toBeInTheDocument();
  expect(
    screen.queryByTestId("file-file-picker-popover"),
  ).not.toBeInTheDocument();

  // Draft holds the token as a real string — NOT an array, NOT a JSON
  // literal, NOT CSV.
  let draft = useConfigSlice.getState().drafts[action.id]!;
  expect(draft.values.file).toBe("{{trigger.file}}");
  expect(typeof draft.values.file).toBe("string");
  expect(Array.isArray(draft.values.file)).toBe(false);

  // 6. REPLACE semantics: picking a DIFFERENT upstream output swaps
  //    the chip rather than appending (single-value FileField).
  await user.click(screen.getByTestId("file-file-picker-trigger"));
  await user.click(screen.getByLabelText("Insert {{trigger.altFile}}"));
  expect(screen.getByText("{{trigger.altFile}}")).toBeInTheDocument();
  expect(screen.queryByText("{{trigger.file}}")).not.toBeInTheDocument();
  draft = useConfigSlice.getState().drafts[action.id]!;
  expect(draft.values.file).toBe("{{trigger.altFile}}");
  expect(typeof draft.values.file).toBe("string");
  expect(Array.isArray(draft.values.file)).toBe(false);

  // 7. Modal Save flushes the draft.
  const modal = screen.getByRole("complementary", {
    name: /node configuration/i,
  });
  await user.click(within(modal).getByRole("button", { name: /^save$/i }));
  const pendingConfig = useGraphSlice
    .getState()
    .pendingNodes.find((n) => n.id === action.id)!.config;

  // FileField persists as a single string — single-value semantics.
  expect(pendingConfig.file).toBe("{{trigger.altFile}}");
  expect(typeof pendingConfig.file).toBe("string");
  expect(Array.isArray(pendingConfig.file)).toBe(false);

  // Companion fields persist correctly.
  expect(pendingConfig.channel).toBe("C01ABC23DEF");
  expect(pendingConfig.title).toBe("Q4 report");
  expect(pendingConfig.initialComment).toBe(
    "Attaching the Q4 report for review.",
  );

  // Untouched optional field stays absent.
  expect(pendingConfig.threadTs).toBeUndefined();

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
    .nodes as Array<{
    kind: string;
    provider: string;
    type: string;
    config: Record<string, unknown>;
  }>;
  const persistedAction = persistedNodes.find((n) => n.kind === "action")!;
  expect(persistedAction.provider).toBe("slack");
  expect(persistedAction.type).toBe("upload_file");
  expect(persistedAction.config.file).toBe("{{trigger.altFile}}");
  expect(typeof persistedAction.config.file).toBe("string");
  expect(Array.isArray(persistedAction.config.file)).toBe(false);
  expect(persistedAction.config.channel).toBe("C01ABC23DEF");
  expect(persistedAction.config.title).toBe("Q4 report");
  expect(persistedAction.config.initialComment).toBe(
    "Attaching the Q4 report for review.",
  );
  expect(persistedAction.config.threadTs).toBeUndefined();

  // Single updateWorkflow call total — picker insertion / replace
  // must not double-fire the workflow update.
  expect(mockUpdateWorkflow).toHaveBeenCalledTimes(1);
});

it("FileField ✕ on the chip clears the value back to undefined (single-value remove semantics)", async () => {
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

  await user.click(screen.getByRole("button", { name: /add trigger/i }));
  await waitFor(() => expect(screen.getByText("Manual")).toBeInTheDocument());
  await user.click(screen.getByText("Manual"));
  await user.click(screen.getByRole("button", { name: /add action/i }));
  await user.click(screen.getByRole("button", { name: /browse slack actions/i }));
  await waitFor(() => expect(screen.getByText("Upload File")).toBeInTheDocument());
  await user.click(screen.getByText("Upload File"));
  const action = useGraphSlice
    .getState()
    .pendingNodes.find((n) => n.kind === "action")!;
  await user.click(
    screen.getByRole("button", { name: /configure action node/i }),
  );
  await waitFor(() =>
    expect(screen.getByTestId("file-file-picker-trigger")).toBeInTheDocument(),
  );

  // Set then clear.
  await user.click(screen.getByTestId("file-file-picker-trigger"));
  await user.click(screen.getByLabelText("Insert {{trigger.file}}"));
  expect(useConfigSlice.getState().drafts[action.id]!.values.file).toBe(
    "{{trigger.file}}",
  );
  await user.click(
    screen.getByRole("button", { name: /Remove File value \{\{trigger\.file\}\}/i }),
  );
  // Draft holds undefined — the chip slot is back to its empty state.
  expect(useConfigSlice.getState().drafts[action.id]!.values.file).toBeUndefined();
  expect(screen.queryByText("{{trigger.file}}")).not.toBeInTheDocument();
});
