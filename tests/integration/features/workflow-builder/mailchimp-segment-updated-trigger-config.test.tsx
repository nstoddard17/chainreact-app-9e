/**
 * Slice 3.MAILCHIMP-4 integration test — Mailchimp `segment_updated`
 * polling trigger config end-to-end through the live WorkflowBuilder
 * shell.
 *
 * This test proves the **audience → segment cascade** flows correctly
 * end-to-end on the TRIGGER surface (the MAILCHIMP-2 cascade test
 * already covers the synthetic action-style cascade; this test
 * additionally proves the cascade works against a real registered
 * trigger meta).
 *
 * Pins:
 *   - meta surface: required `listId` (combobox via mailchimp:audiences)
 *     + required `segmentId` (combobox via mailchimp:segments,
 *     dependsOn `listId`). Both field names match the trigger's
 *     runtime schema (`listId` / `segmentId`).
 *   - segment picker is gated until listId is selected — the Slice 3.33
 *     "Select Audience first" passive trigger is rendered.
 *   - end-to-end: pick audience → segment picker fetches with
 *     `deps.listId` → pick segment → Modal Save flushes draft →
 *     Toolbar Save persists once.
 *   - persisted config carries EXACT runtime field names
 *     (`listId` / `segmentId`, NOT `audience_id` / `segment_id`).
 *
 * Out of scope:
 *   - The polling cron / poll handler behavior — covered by the
 *     trigger's own poll tests.
 *   - The cascade infrastructure clear-on-parent-change — covered by
 *     `mailchimp-options-cascade.test.tsx`.
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
import { mailchimpSegmentUpdatedTriggerMeta } from "@/integrations/mailchimp/triggers/segmentUpdated/segmentUpdated.meta";
import type { WorkflowDetail } from "@/contracts/workflow";
import { pickComboboxOption } from "./helpers/comboboxField";

const baseWorkflow: WorkflowDetail = {
  id: "wf-1",
  name: "Test",
  state: "draft",
  disabledReason: null,
  disabledContext: null,
  activeRevisionId: null,
  draftDefinition: { nodes: [], edges: [] },
  deletedAt: null,
  createdAt: "2026-05-23T00:00:00Z",
  updatedAt: "2026-05-23T00:00:00Z",
};

const triggerProviders = [{ id: "mailchimp", displayName: "Mailchimp" }];
const actionProviders = [{ id: "mailchimp", displayName: "Mailchimp" }];

const LIST_ID = "abc123def456";
const LIST_LABEL = "Acme Newsletter";
const SEGMENT_ID = "11";
const SEGMENT_LABEL = "VIPs";

beforeEach(() => {
  mockUpdateWorkflow.mockReset();
  mockListNativeActions.mockReset();
  mockListNativeActions.mockResolvedValue([]);
  mockListNativeTriggers.mockReset();
  mockListNativeTriggers.mockResolvedValue([]);
  mockListProviderActions.mockReset();
  mockListProviderActions.mockResolvedValue([]);
  mockListProviderTriggers.mockReset();
  mockListProviderTriggers.mockImplementation(async (p: string) =>
    p === "mailchimp" ? [mailchimpSegmentUpdatedTriggerMeta] : [],
  );
  mockFetchOptionsSource.mockReset();
  mockFetchOptionsSource.mockImplementation(
    (source: string, args?: { deps?: Record<string, string> }) => {
      if (source === "mailchimp:audiences") {
        return Promise.resolve({
          ok: true as const,
          source,
          items: [
            { value: LIST_ID, label: LIST_LABEL, description: "42 members" },
            { value: "other-list", label: "Beta Channel", description: "7 members" },
          ],
          hasMore: false,
        });
      }
      if (source === "mailchimp:segments") {
        if (args?.deps?.listId === LIST_ID) {
          return Promise.resolve({
            ok: true as const,
            source,
            items: [
              { value: SEGMENT_ID, label: SEGMENT_LABEL, description: "saved · 42 members" },
              { value: "22", label: "Recent signups", description: "static · 7 members" },
            ],
            hasMore: false,
          });
        }
        return Promise.resolve({
          ok: true as const,
          source,
          items: [],
          hasMore: false,
        });
      }
      return Promise.resolve({
        ok: false,
        source,
        code: "SOURCE_NOT_FOUND",
        message: `Unknown source '${source}' (test mock).`,
      });
    },
  );
  __resetNativeActionsCacheForTests();
  __resetNativeTriggersCacheForTests();
  __resetProviderActionsCacheForTests();
  __resetProviderTriggersCacheForTests();
  useGraphSlice.getState().reset();
  useConfigSlice.getState().reset();
  useRunSlice.getState().reset();
});

it("Mailchimp segment_updated trigger meta — polling + required listId/segmentId cascade + payload pins — Slice 3.MAILCHIMP-4 meta guard", () => {
  expect(mailchimpSegmentUpdatedTriggerMeta.activation).toBe("polling");
  expect(mailchimpSegmentUpdatedTriggerMeta.category).toBe("marketing");
  expect(mailchimpSegmentUpdatedTriggerMeta.requiresIntegration).toBe(true);

  expect(mailchimpSegmentUpdatedTriggerMeta.fields.map((f) => f.name)).toEqual([
    "listId",
    "segmentId",
  ]);
  const byName = new Map(
    mailchimpSegmentUpdatedTriggerMeta.fields.map((f) => [f.name, f]),
  );
  const listId = byName.get("listId")!;
  expect(listId.type).toBe("combobox");
  expect(listId.optionsSource).toBe("mailchimp:audiences");
  expect(listId.required).toBe(true);
  const segmentId = byName.get("segmentId")!;
  expect(segmentId.type).toBe("combobox");
  expect(segmentId.optionsSource).toBe("mailchimp:segments");
  expect(segmentId.dependsOn).toBe("listId");
  expect(segmentId.required).toBe(true);

  // payloadShape — segment name is sensitive; rest are structural.
  const payloadByName = new Map(
    mailchimpSegmentUpdatedTriggerMeta.payloadShape.map((o) => [o.name, o]),
  );
  expect(payloadByName.get("name")?.sensitive).toBe(true);
  for (const name of ["listId", "segmentId", "memberCount", "type", "updatedAt"]) {
    expect(payloadByName.get(name)?.sensitive).toBeFalsy();
  }
});

it("end-to-end: pick audience → segment picker activates and fetches scoped to listId → pick segment → Modal Save → Toolbar Save persists ONCE with EXACT runtime field names (listId / segmentId)", async () => {
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

  // 1. Open the trigger picker → Mailchimp → Segment Updated.
  await user.click(screen.getByRole("button", { name: /choose a trigger/i }));
  await user.click(
    screen.getByRole("button", { name: /browse mailchimp triggers/i }),
  );
  await waitFor(() => {
    expect(screen.getByText("Segment Updated")).toBeInTheDocument();
  });
  await user.click(screen.getByText("Segment Updated"));

  const trigger = useGraphSlice
    .getState()
    .pendingNodes.find((n) => n.kind === "trigger")!;
  expect(trigger.provider).toBe("mailchimp");
  expect(trigger.type).toBe("segment_updated");

  // 2. Open the trigger config rail.
  await openLastNodeOfKind("trigger");
  await waitFor(() => {
    expect(screen.getByRole("combobox", { name: /^audience$/i })).toBeInTheDocument();
  });
  // segmentId is gated until listId is set — Slice 3.33 cascade gate
  // renders the passive "Select Audience first" trigger.
  expect(screen.getByTestId("combobox-parent-missing")).toBeInTheDocument();

  // 3. Pick audience → segment picker should re-fetch with deps.listId.
  await pickComboboxOption(user, /^audience$/i, LIST_LABEL);
  await waitFor(() => {
    const segmentCalls = mockFetchOptionsSource.mock.calls.filter(
      (c) => c[0] === "mailchimp:segments",
    );
    expect(segmentCalls.length).toBeGreaterThan(0);
    const lastCall = segmentCalls[segmentCalls.length - 1]!;
    const args = lastCall[1] as { deps?: Record<string, string> } | undefined;
    expect(args?.deps?.listId).toBe(LIST_ID);
  });
  expect(useConfigSlice.getState().drafts[trigger.id]!.values.listId).toBe(
    LIST_ID,
  );

  // 4. Pick segment.
  await pickComboboxOption(user, /^segment$/i, SEGMENT_LABEL);
  expect(useConfigSlice.getState().drafts[trigger.id]!.values.segmentId).toBe(
    SEGMENT_ID,
  );

  // 5. Modal Save flushes draft.
  const modal = screen.getByRole("complementary", { name: /node configuration/i });
  await user.click(within(modal).getByRole("button", { name: /^save$/i }));
  const pendingConfig = useGraphSlice
    .getState()
    .pendingNodes.find((n) => n.id === trigger.id)!.config;
  expect(pendingConfig.listId).toBe(LIST_ID);
  expect(pendingConfig.segmentId).toBe(SEGMENT_ID);
  // Defensive: snake_case shadows must NOT appear.
  expect(pendingConfig.audience_id).toBeUndefined();
  expect(pendingConfig.segment_id).toBeUndefined();
  expect(mockUpdateWorkflow).not.toHaveBeenCalled();

  // 6. Toolbar Save persists once.
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
  const persistedTrigger = persistedNodes.find((n) => n.kind === "trigger")!;
  expect(persistedTrigger.provider).toBe("mailchimp");
  expect(persistedTrigger.type).toBe("segment_updated");
  expect(persistedTrigger.config.listId).toBe(LIST_ID);
  expect(persistedTrigger.config.segmentId).toBe(SEGMENT_ID);
  // Server-managed polling state must NOT leak — the activation hook
  // writes pollingEnabled / snapshot / polling into trigger_resources.config.
  expect(persistedTrigger.config.pollingEnabled).toBeUndefined();
  expect(persistedTrigger.config.snapshot).toBeUndefined();
  expect(persistedTrigger.config.polling).toBeUndefined();

  expect(mockUpdateWorkflow).toHaveBeenCalledTimes(1);
});
