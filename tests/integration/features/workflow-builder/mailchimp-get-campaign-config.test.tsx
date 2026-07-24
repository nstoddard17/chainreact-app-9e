/**
 * Slice 3.MAILCHIMP-4 integration test — Mailchimp `get_campaign`
 * config end-to-end through the live WorkflowBuilder shell.
 *
 * Pins:
 *   - meta surface: single required `campaignId` combobox sourced
 *     from `mailchimp:campaigns`; nested `settings` + `recipients`
 *     OutputMeta sub-objects marked sensitive with populated fields[].
 *   - end-to-end: pick Mailchimp Get Campaign → pick campaign via
 *     `mailchimp:campaigns` → Modal Save flushes draft → Toolbar Save
 *     persists once with `{campaignId: "..."}` (NOT `campaign_id`,
 *     NOT camelCase rewrites).
 *
 * Out of scope (covered separately):
 *   - The MAILCHIMP-2 resolver behavior (returns campaigns sorted
 *     newest-first, etc.) — `mailchimp-options-cascade.test.tsx` +
 *     the resolver unit tests.
 *   - Cross-action confirmation-modal flow — this is a low-risk read,
 *     no modal triggered.
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
import { mailchimpGetCampaignMeta } from "@/integrations/mailchimp/actions/getCampaign.meta";
import type { TriggerMeta } from "@/contracts/triggerMeta";
import type { WorkflowDetail } from "@/contracts/workflow";
import { pickComboboxOption } from "./helpers/comboboxField";

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
  createdAt: "2026-05-23T00:00:00Z",
  updatedAt: "2026-05-23T00:00:00Z",
};

const triggerProviders = [{ id: "native", displayName: "Native" }];
const actionProviders = [{ id: "mailchimp", displayName: "Mailchimp" }];

const CAMPAIGN_ID = "abc123def456";
const CAMPAIGN_LABEL = "Q1 Newsletter";

beforeEach(() => {
  mockUpdateWorkflow.mockReset();
  mockListNativeActions.mockReset();
  mockListNativeActions.mockResolvedValue([]);
  mockListNativeTriggers.mockReset();
  mockListNativeTriggers.mockResolvedValue([manualTriggerMeta]);
  mockListProviderActions.mockReset();
  mockListProviderActions.mockImplementation(async (p: string) =>
    p === "mailchimp" ? [mailchimpGetCampaignMeta] : [],
  );
  mockListProviderTriggers.mockReset();
  mockListProviderTriggers.mockResolvedValue([]);
  mockFetchOptionsSource.mockReset();
  mockFetchOptionsSource.mockImplementation((source: string) => {
    if (source === "mailchimp:campaigns") {
      return Promise.resolve({
        ok: true as const,
        source,
        items: [
          { value: CAMPAIGN_ID, label: CAMPAIGN_LABEL, description: "sent · regular" },
          { value: "other-campaign", label: "Q2 Promo", description: "save · regular" },
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

it("Mailchimp get_campaign meta — single required campaignId combobox + low-risk + nested settings/recipients sensitive sub-objects — Slice 3.MAILCHIMP-4 meta guard", () => {
  expect(mailchimpGetCampaignMeta.riskLevel).toBe("low");
  expect(mailchimpGetCampaignMeta.isDestructive).toBe(false);
  expect(mailchimpGetCampaignMeta.requiresConfirmation).toBe(false);

  expect(mailchimpGetCampaignMeta.fields.map((f) => f.name)).toEqual(["campaignId"]);
  const f = mailchimpGetCampaignMeta.fields[0]!;
  expect(f.type).toBe("combobox");
  expect(f.optionsSource).toBe("mailchimp:campaigns");
  expect(f.required).toBe(true);

  const settings = mailchimpGetCampaignMeta.outputs.find((o) => o.name === "settings")!;
  expect(settings.type).toBe("object");
  expect(settings.sensitive).toBe(true);
  expect(settings.fields?.map((x) => x.name).sort()).toEqual([
    "fromName",
    "previewText",
    "replyTo",
    "subjectLine",
    "title",
  ]);

  const recipients = mailchimpGetCampaignMeta.outputs.find(
    (o) => o.name === "recipients",
  )!;
  expect(recipients.type).toBe("object");
  expect(recipients.sensitive).toBe(true);
  expect(recipients.fields?.map((x) => x.name).sort()).toEqual([
    "listId",
    "listName",
    "recipientCount",
  ]);

  // archiveUrl + longArchiveUrl are top-level sensitive outputs
  // (public-facing URLs to campaign content).
  expect(
    mailchimpGetCampaignMeta.outputs.find((o) => o.name === "archiveUrl")?.sensitive,
  ).toBe(true);
  expect(
    mailchimpGetCampaignMeta.outputs.find((o) => o.name === "longArchiveUrl")
      ?.sensitive,
  ).toBe(true);
});

it("end-to-end: pick campaign via mailchimp:campaigns → Modal Save → Toolbar Save persists ONCE with EXACT runtime field name `campaignId`", async () => {
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

  await user.click(screen.getByRole("button", { name: /choose a trigger/i }));
  await waitFor(() => expect(screen.getByText("Manual")).toBeInTheDocument());
  await user.click(screen.getByText("Manual"));

  await user.click(screen.getByRole("button", { name: /add action/i }));
  await user.click(
    screen.getByRole("button", { name: /browse mailchimp actions/i }),
  );
  await waitFor(() => expect(screen.getByText("Get Campaign")).toBeInTheDocument());
  await user.click(screen.getByText("Get Campaign"));
  const action = useGraphSlice
    .getState()
    .pendingNodes.find((n) => n.kind === "action")!;
  expect(action.provider).toBe("mailchimp");
  expect(action.type).toBe("get_campaign");

  await openLastNodeOfKind("action");
  await waitFor(() => {
    expect(screen.getByRole("combobox", { name: /^campaign$/i })).toBeInTheDocument();
  });

  await pickComboboxOption(user, /^campaign$/i, CAMPAIGN_LABEL);
  await waitFor(() => {
    expect(mockFetchOptionsSource).toHaveBeenCalledWith(
      "mailchimp:campaigns",
      expect.anything(),
    );
  });
  expect(useConfigSlice.getState().drafts[action.id]!.values.campaignId).toBe(
    CAMPAIGN_ID,
  );

  const modal = screen.getByRole("complementary", { name: /node configuration/i });
  await user.click(within(modal).getByRole("button", { name: /^save$/i }));
  const pendingConfig = useGraphSlice
    .getState()
    .pendingNodes.find((n) => n.id === action.id)!.config;
  expect(pendingConfig.campaignId).toBe(CAMPAIGN_ID);
  // Defensive: no snake_case alias.
  expect(pendingConfig.campaign_id).toBeUndefined();
  expect(mockUpdateWorkflow).not.toHaveBeenCalled();

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
  expect(persistedAction.provider).toBe("mailchimp");
  expect(persistedAction.type).toBe("get_campaign");
  expect(persistedAction.config.campaignId).toBe(CAMPAIGN_ID);

  expect(mockUpdateWorkflow).toHaveBeenCalledTimes(1);
});
