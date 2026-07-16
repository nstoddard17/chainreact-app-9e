/**
 * Slice 3.13 integration test — Gmail `new_email` trigger now exposes
 * `from[]` and `labelIds[]` via the new `string-array` field renderer
 * (StringArrayField).
 *
 *   1. Render the builder hydrated with an empty workflow.
 *   2. Open the trigger picker, drill into Gmail, pick "New Email".
 *   3. Open the trigger config rail.
 *   4. `from` chip input renders empty.
 *   5. `labelIds` chip input renders with the default `["INBOX"]` chip
 *      (sourced via `deriveDefaultConfig` from the meta's
 *      `defaultValue`).
 *   6. Add two email addresses to `from` via Enter and the Add button.
 *   7. Remove the `INBOX` chip from `labelIds`; add `Label_5`.
 *   8. Modal Save → graphSlice.pendingNodes config carries
 *      from / labelIds as actual string arrays (not JSON, not CSV).
 *      Modal Save MUST NOT call updateWorkflow.
 *   9. Toolbar Save → updateWorkflow called once; persisted config has
 *      the array values.
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

// CONFIG-UX sweep — `labelIds` is now backed by the `gmail:labels` option
// source (per-chip picker + allowManualEntry). Mock the options API so the
// picker loads deterministically.
const mockFetchOptionsSource = jest.fn();
jest.mock("@/lib/api/options", () => ({
  __esModule: true,
  fetchOptionsSource: (...args: unknown[]) => mockFetchOptionsSource(...args),
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
import type { ActionMeta } from "@/contracts/actionMeta";
import type { WorkflowDetail } from "@/contracts/workflow";

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
  // Use the real Gmail newEmail meta so the test exercises the actual
  // shipped field configuration (from = string-array, labelIds =
  // string-array with defaultValue ["INBOX"]).
  mockListProviderTriggers.mockImplementation(async (p: string) =>
    p === "gmail" ? [newEmailTriggerMeta] : [],
  );
  mockFetchOptionsSource.mockReset();
  mockFetchOptionsSource.mockImplementation(async (source: string) => {
    if (source === "gmail:labels") {
      return {
        ok: true,
        source: "gmail:labels",
        items: [
          { value: "Label_5", label: "Invoices" },
          { value: "STARRED", label: "Starred" },
        ],
        hasMore: false,
      };
    }
    return {
      ok: false,
      source,
      code: "SOURCE_NOT_FOUND",
      message: `Unknown source '${source}'.`,
    };
  });
  __resetNativeActionsCacheForTests();
  __resetNativeTriggersCacheForTests();
  __resetProviderActionsCacheForTests();
  __resetProviderTriggersCacheForTests();
  useGraphSlice.getState().reset();
  useConfigSlice.getState().reset();
  useRunSlice.getState().reset();
});

it("end-to-end: Gmail new_email from[] + labelIds[] round-trip as real arrays via the string-array renderer", async () => {
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

  // 2. Drill into Gmail.
  await user.click(
    screen.getByRole("button", { name: /browse gmail triggers/i }),
  );
  await waitFor(() => {
    expect(screen.getByText("New Email")).toBeInTheDocument();
  });

  // 3. Pick the New Email trigger.
  await user.click(screen.getByText("New Email"));

  const trigger = useGraphSlice
    .getState()
    .pendingNodes.find((n) => n.kind === "trigger");
  expect(trigger).toBeDefined();
  expect(trigger!.provider).toBe("gmail");
  expect(trigger!.type).toBe("new_email");
  // The meta's defaultValues seed the draft via deriveDefaultConfig.
  expect(trigger!.config.from).toEqual([]);
  expect(trigger!.config.labelIds).toEqual(["INBOX"]);

  // 4. Open the trigger config rail.
  await openLastNodeOfKind("trigger");
  // The chip renderer's Add button's aria-label substring also matches
  // the field label, so query the textbox role directly to avoid the
  // ambiguity.
  await waitFor(() => {
    expect(
      screen.getByRole("textbox", { name: /from \(optional\)/i }),
    ).toBeInTheDocument();
  });
  // Labels renders as the per-chip option picker (add-button trigger), not
  // a free-text input (CONFIG-UX sweep — gmail:labels option source).
  expect(screen.getByTestId("string-array-labelIds-add")).toBeInTheDocument();
  expect(screen.queryByRole("textbox", { name: /labels/i })).toBeNull();

  // 5. `from` chip input renders empty; the chip area shows "No items."
  // 6. `labelIds` already shows the INBOX chip courtesy of defaultValue.
  //    Scope to the config rail — the canvas node's at-a-glance summary also
  //    renders "INBOX", so an unscoped getByText is ambiguous.
  const configRail = screen.getByRole("complementary", {
    name: /node configuration/i,
  });
  expect(
    within(configRail).getByTestId("field-labelIds-chips"),
  ).toHaveTextContent("INBOX");

  // 7. Add "a@x.com" via Enter, then "b@x.com" via the Add button.
  const fromInput = screen.getByRole("textbox", {
    name: /from \(optional\)/i,
  }) as HTMLInputElement;
  await user.type(fromInput, "a@x.com");
  await user.keyboard("{Enter}");
  await user.type(fromInput, "b@x.com");
  await user.click(
    screen.getByRole("button", { name: /add from \(optional\) item/i }),
  );

  // Draft becomes dirty after the first change.
  expect(useConfigSlice.getState().drafts[trigger!.id]!.isDirty).toBe(true);

  // 8. Remove the INBOX chip from labelIds, then add Label_5 by picking
  //    the "Invoices" option from the gmail:labels picker (stores the id).
  await user.click(
    screen.getByRole("button", { name: /Remove Labels item INBOX/i }),
  );
  await user.click(screen.getByTestId("string-array-labelIds-add"));
  await user.click(await screen.findByText("Invoices"));

  // 9. Modal Save — pendingNodes carries real string[] values.
  const modal = screen.getByRole("complementary", {
    name: /node configuration/i,
  });
  await user.click(within(modal).getByRole("button", { name: /^save$/i }));
  const persistedConfig = useGraphSlice
    .getState()
    .pendingNodes.find((n) => n.id === trigger!.id)!.config;
  expect(persistedConfig.from).toEqual(["a@x.com", "b@x.com"]);
  expect(persistedConfig.labelIds).toEqual(["Label_5"]);
  // Defensive: the renderer must never JSON-encode or CSV-encode.
  expect(typeof persistedConfig.from).not.toBe("string");
  expect(typeof persistedConfig.labelIds).not.toBe("string");
  // Defensive: native arrays, not array-likes.
  expect(Array.isArray(persistedConfig.from)).toBe(true);
  expect(Array.isArray(persistedConfig.labelIds)).toBe(true);

  // Modal Save MUST NOT call updateWorkflow.
  expect(mockUpdateWorkflow).not.toHaveBeenCalled();

  // 10. Toolbar Save persists arrays through updateWorkflow.
  const allSaveButtons = screen.getAllByRole("button", { name: /^save$/i });
  const toolbarSave = allSaveButtons.find((btn) => !modal.contains(btn))!;
  await user.click(toolbarSave);
  await waitFor(() => {
    expect(mockUpdateWorkflow).toHaveBeenCalledTimes(1);
  });
  const persistedNodes = mockUpdateWorkflow.mock.calls[0]![1].draftDefinition
    .nodes as Array<{ kind: string; provider: string; type: string; config: Record<string, unknown> }>;
  const persistedTrigger = persistedNodes.find((n) => n.kind === "trigger")!;
  expect(persistedTrigger.config.from).toEqual(["a@x.com", "b@x.com"]);
  expect(persistedTrigger.config.labelIds).toEqual(["Label_5"]);

  // Server-managed polling state stays untouched by Save.
  expect(persistedTrigger.config.pollingEnabled).toBeUndefined();
  expect(persistedTrigger.config.snapshot).toBeUndefined();
  expect(persistedTrigger.config.polling).toBeUndefined();

  // 11. Regression guard — only one updateWorkflow call total.
  expect(mockUpdateWorkflow).toHaveBeenCalledTimes(1);
});

it("silently dedupes exact-string duplicates and rejects whitespace-only input on from[]", async () => {
  const user = userEvent.setup();
  render(
    <WorkflowBuilder
      workflow={baseWorkflow}
      triggerProviders={triggerProviders}
      actionProviders={actionProviders}
    />,
  );

  await user.click(screen.getByRole("button", { name: /choose a trigger/i }));
  await user.click(
    screen.getByRole("button", { name: /browse gmail triggers/i }),
  );
  await waitFor(() => {
    expect(screen.getByText("New Email")).toBeInTheDocument();
  });
  await user.click(screen.getByText("New Email"));
  await openLastNodeOfKind("trigger");
  await waitFor(() => {
    expect(
      screen.getByRole("textbox", { name: /from \(optional\)/i }),
    ).toBeInTheDocument();
  });

  const trigger = useGraphSlice
    .getState()
    .pendingNodes.find((n) => n.kind === "trigger")!;
  const fromInput = screen.getByRole("textbox", {
    name: /from \(optional\)/i,
  }) as HTMLInputElement;

  // Edits land on the configSlice draft (modal Save would flush to
  // graphSlice.pendingNodes; we don't reach Save in this test).
  await user.type(fromInput, "alice@example.com");
  await user.keyboard("{Enter}");
  expect(
    useConfigSlice.getState().drafts[trigger.id]!.values.from,
  ).toEqual(["alice@example.com"]);

  // Duplicate of the same value: silently rejected. Draft unchanged.
  await user.type(fromInput, "alice@example.com");
  await user.keyboard("{Enter}");
  // Whitespace-only — also silently rejected.
  await user.type(fromInput, "   ");
  await user.keyboard("{Enter}");
  expect(
    useConfigSlice.getState().drafts[trigger.id]!.values.from,
  ).toEqual(["alice@example.com"]);
});
