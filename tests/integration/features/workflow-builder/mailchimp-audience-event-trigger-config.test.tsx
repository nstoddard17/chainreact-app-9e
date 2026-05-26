/**
 * Slice 3.MAILCHIMP-4 integration test — Mailchimp `audience_event`
 * webhook trigger config end-to-end through the live WorkflowBuilder
 * shell.
 *
 * Proves **field-name preservation** on the trigger surface: this
 * trigger uses `audienceId` (camelCase) + `eventTypes` (string-array),
 * NOT `audience_id` like the 10 snake-case Mailchimp actions. The
 * runtime activate hook reads `node.config.audienceId` directly; any
 * drift in the meta would break activation at runtime.
 *
 * Pins:
 *   - meta surface: required `audienceId` combobox (mailchimp:audiences)
 *     + required `eventTypes` string-array; description enumerates the
 *     6 allowed event types from the activation allowlist.
 *   - activation = "webhook" (this trigger creates a Mailchimp webhook
 *     subscription at activation time, NOT polling).
 *   - end-to-end: pick audience → add 2 event types via the chip input
 *     → Modal Save → Toolbar Save persists once with `{audienceId,
 *     eventTypes: [...]}`.
 *   - persisted config carries EXACT runtime names — `audienceId`
 *     (NOT `audience_id`); `eventTypes` (NOT `event_types`).
 *
 * Out of scope: webhook activation flow + payload normalization
 * (covered by the trigger's own activate/receive tests).
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

const mockFetchOptionsSource = jest.fn();
jest.mock("@/lib/api/options", () => ({
  __esModule: true,
  fetchOptionsSource: (...args: unknown[]) => mockFetchOptionsSource(...args),
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
import { mailchimpAudienceEventTriggerMeta } from "@/integrations/mailchimp/triggers/audienceEvent/audienceEvent.meta";
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

const AUDIENCE_ID = "abc123def456";
const AUDIENCE_LABEL = "Acme Newsletter";

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
    p === "mailchimp" ? [mailchimpAudienceEventTriggerMeta] : [],
  );
  mockFetchOptionsSource.mockReset();
  mockFetchOptionsSource.mockImplementation((source: string) => {
    if (source === "mailchimp:audiences") {
      return Promise.resolve({
        ok: true as const,
        source,
        items: [
          { value: AUDIENCE_ID, label: AUDIENCE_LABEL, description: "42 members" },
        ],
        hasMore: false,
      });
    }
    return Promise.resolve({
      ok: false,
      source,
      code: "SOURCE_NOT_FOUND",
      message: `Unknown source '${source}' (test mock).`,
    });
  });
  __resetNativeActionsCacheForTests();
  __resetNativeTriggersCacheForTests();
  __resetProviderActionsCacheForTests();
  __resetProviderTriggersCacheForTests();
  useGraphSlice.getState().reset();
  useConfigSlice.getState().reset();
  useRunSlice.getState().reset();
});

it("Mailchimp audience_event trigger meta — webhook activation + audienceId camelCase + eventTypes string-array with 6 allowed values surfaced + payload sensitive markings — Slice 3.MAILCHIMP-4 meta guard", () => {
  expect(mailchimpAudienceEventTriggerMeta.activation).toBe("webhook");
  expect(mailchimpAudienceEventTriggerMeta.category).toBe("marketing");
  expect(mailchimpAudienceEventTriggerMeta.requiresIntegration).toBe(true);

  expect(mailchimpAudienceEventTriggerMeta.fields.map((f) => f.name)).toEqual([
    "audienceId",
    "eventTypes",
  ]);

  const audienceId = mailchimpAudienceEventTriggerMeta.fields.find(
    (f) => f.name === "audienceId",
  )!;
  expect(audienceId.type).toBe("combobox");
  expect(audienceId.optionsSource).toBe("mailchimp:audiences");
  expect(audienceId.required).toBe(true);
  // Field-name preservation — NOT `audience_id`.
  expect(
    mailchimpAudienceEventTriggerMeta.fields.find((f) => f.name === "audience_id"),
  ).toBeUndefined();

  const eventTypes = mailchimpAudienceEventTriggerMeta.fields.find(
    (f) => f.name === "eventTypes",
  )!;
  expect(eventTypes.type).toBe("string-array");
  expect(eventTypes.required).toBe(true);
  // The 6 allowed event types must surface in the description so
  // workflow authors know the allowlist.
  for (const allowed of [
    "subscribe",
    "unsubscribe",
    "profile",
    "upemail",
    "cleaned",
    "campaign",
  ]) {
    expect(eventTypes.description).toContain(allowed);
  }

  // payloadShape sensitive markings.
  const payloadByName = new Map(
    mailchimpAudienceEventTriggerMeta.payloadShape.map((o) => [o.name, o]),
  );
  expect(payloadByName.get("email")?.sensitive).toBe(true);
  expect(payloadByName.get("subscriberHash")?.sensitive).toBe(true);
  expect(payloadByName.get("parsed")?.sensitive).toBe(true);
  expect(payloadByName.get("type")?.sensitive).toBeFalsy();
  expect(payloadByName.get("audienceId")?.sensitive).toBeFalsy();
  expect(payloadByName.get("campaignId")?.sensitive).toBeFalsy();
});

it("end-to-end: pick audience → add 2 event types via chip input → Modal Save → Toolbar Save persists ONCE with EXACT runtime field names (audienceId / eventTypes)", async () => {
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

  // 1. Open trigger picker → Mailchimp → Audience Event.
  await user.click(screen.getByRole("button", { name: /choose a trigger/i }));
  await user.click(
    screen.getByRole("button", { name: /browse mailchimp triggers/i }),
  );
  await waitFor(() => {
    expect(screen.getByText("Audience Event")).toBeInTheDocument();
  });
  await user.click(screen.getByText("Audience Event"));

  const trigger = useGraphSlice
    .getState()
    .pendingNodes.find((n) => n.kind === "trigger")!;
  expect(trigger.provider).toBe("mailchimp");
  expect(trigger.type).toBe("audience_event");

  // 2. Open the trigger config rail.
  await user.click(
    screen.getByRole("button", { name: /configure trigger node/i }),
  );
  await waitFor(() => {
    expect(screen.getByRole("combobox", { name: /^audience$/i })).toBeInTheDocument();
  });

  // 3. Pick audience (combobox) — `audienceId` lands in the draft
  //    bag under the camelCase runtime name.
  await pickComboboxOption(user, /^audience$/i, AUDIENCE_LABEL);
  expect(useConfigSlice.getState().drafts[trigger.id]!.values.audienceId).toBe(
    AUDIENCE_ID,
  );
  // Defensive: snake_case shadow must NOT appear.
  expect(
    useConfigSlice.getState().drafts[trigger.id]!.values.audience_id,
  ).toBeUndefined();

  // 4. Add two event types via the string-array chip input. The chip
  //    input renders a single text-shaped input that consumes Enter
  //    (or comma) to commit a chip.
  const eventTypesInput = screen.getByRole("textbox", { name: /^event types/i });
  await user.click(eventTypesInput);
  await user.type(eventTypesInput, "subscribe{Enter}");
  await user.type(eventTypesInput, "unsubscribe{Enter}");
  expect(
    useConfigSlice.getState().drafts[trigger.id]!.values.eventTypes,
  ).toEqual(["subscribe", "unsubscribe"]);

  // 5. Modal Save flushes draft.
  const modal = screen.getByRole("complementary", { name: /node configuration/i });
  await user.click(within(modal).getByRole("button", { name: /^save$/i }));
  const pendingConfig = useGraphSlice
    .getState()
    .pendingNodes.find((n) => n.id === trigger.id)!.config;
  expect(pendingConfig.audienceId).toBe(AUDIENCE_ID);
  expect(pendingConfig.eventTypes).toEqual(["subscribe", "unsubscribe"]);
  // Defensive: snake_case shadows must NOT appear.
  expect(pendingConfig.audience_id).toBeUndefined();
  expect(pendingConfig.event_types).toBeUndefined();
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
  expect(persistedTrigger.type).toBe("audience_event");
  expect(persistedTrigger.config.audienceId).toBe(AUDIENCE_ID);
  expect(persistedTrigger.config.eventTypes).toEqual([
    "subscribe",
    "unsubscribe",
  ]);

  // Server-managed activation state must NOT leak — activate.ts writes
  // webhookEnabled / webhookId / webhookUrl / adopted into
  // trigger_resources.config, not into the node config.
  expect(persistedTrigger.config.webhookEnabled).toBeUndefined();
  expect(persistedTrigger.config.webhookId).toBeUndefined();
  expect(persistedTrigger.config.webhookUrl).toBeUndefined();

  expect(mockUpdateWorkflow).toHaveBeenCalledTimes(1);
});
