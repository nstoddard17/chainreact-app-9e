/**
 * Slice 3.MAILCHIMP-3 integration test — Mailchimp
 * `unsubscribe_subscriber` config end-to-end through the live
 * WorkflowBuilder shell.
 *
 * **This is the first action in V2 carrying the
 * high+requiresConfirmation+NOT-destructive shape.** The test pins it
 * explicitly so reviewers can see the new risk classification template:
 *   - Consent / list-status change has marketing + regulatory weight
 *     (CAN-SPAM unsubscribe enforcement, GDPR consent withdrawal) —
 *     workflow authors MUST explicitly confirm.
 *   - But the subscriber RECORD is retained (Mailchimp keeps the
 *     member with status `unsubscribed`; re-subscribe via fresh opt-in
 *     is possible) — distinct from `remove_subscriber.delete_permanent`
 *     which IS destructive.
 *
 * Also pins the **field-name variance** preserved from V1: this action
 * uses `listId` + `emailAddress` (camelCase) instead of the
 * `audience_id` + `email` (snake) convention the other 10 Mailchimp
 * actions use. The `mailchimp:audiences` resolver carries no
 * `requiredDeps` so it backs `listId` directly — no sibling resolver
 * needed.
 *
 * Out of scope (covered separately):
 *   - The cross-action confirmation-modal flow — covered by
 *     `destructive-action-confirmation-modal.test.tsx`. The flow is
 *     provider-agnostic; this test only pins the Mailchimp meta shape
 *     that triggers it.
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
import { mailchimpUnsubscribeSubscriberMeta } from "@/integrations/mailchimp/actions/unsubscribeSubscriber.meta";
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

const LIST_ID = "abc123def456";
const LIST_LABEL = "Acme Newsletter";
const EMAIL = "subscriber@example.com";

function audiencesResponse(
  items: ReadonlyArray<{ value: string; label: string; description?: string }>,
) {
  return {
    ok: true as const,
    source: "mailchimp:audiences",
    items,
    hasMore: false,
  };
}

beforeEach(() => {
  mockUpdateWorkflow.mockReset();
  mockListNativeActions.mockReset();
  mockListNativeActions.mockResolvedValue([]);
  mockListNativeTriggers.mockReset();
  mockListNativeTriggers.mockResolvedValue([manualTriggerMeta]);
  mockListProviderActions.mockReset();
  mockListProviderActions.mockImplementation(async (p: string) =>
    p === "mailchimp" ? [mailchimpUnsubscribeSubscriberMeta] : [],
  );
  mockListProviderTriggers.mockReset();
  mockListProviderTriggers.mockResolvedValue([]);
  mockFetchOptionsSource.mockReset();
  mockFetchOptionsSource.mockImplementation((source: string) => {
    if (source === "mailchimp:audiences") {
      return Promise.resolve(
        audiencesResponse([
          { value: LIST_ID, label: LIST_LABEL, description: "42 members" },
        ]),
      );
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

it("Mailchimp unsubscribe_subscriber meta declares the NEW high+requiresConfirmation+NOT-destructive shape (consent change, record retained) — Slice 3.MAILCHIMP-3 meta guard", () => {
  // **Risk-classification template under test:** consent / list-status
  // change carries regulatory weight (CAN-SPAM / GDPR) so it gates on
  // user confirmation, but the subscriber RECORD is retained so it is
  // NOT destructive. Drift in any direction (dropping confirmation,
  // promoting to destructive) re-shapes the user-facing safety story.
  expect(mailchimpUnsubscribeSubscriberMeta.riskLevel).toBe("high");
  expect(mailchimpUnsubscribeSubscriberMeta.requiresConfirmation).toBe(true);
  expect(mailchimpUnsubscribeSubscriberMeta.isDestructive).toBe(false);
  expect(mailchimpUnsubscribeSubscriberMeta.riskDescription).toBeDefined();
  expect(
    mailchimpUnsubscribeSubscriberMeta.riskDescription!.length,
  ).toBeGreaterThan(0);

  // 2 required fields — field-name variance preserved from V1:
  // `listId` (camelCase) and `emailAddress` (camelCase), NOT
  // `audience_id` / `email` like the other 10 Mailchimp actions.
  const names = mailchimpUnsubscribeSubscriberMeta.fields.map((f) => f.name);
  expect(names).toEqual(["listId", "emailAddress"]);

  const byName = new Map(
    mailchimpUnsubscribeSubscriberMeta.fields.map((f) => [f.name, f]),
  );
  const listId = byName.get("listId")!;
  expect(listId.type).toBe("combobox");
  expect(listId.optionsSource).toBe("mailchimp:audiences");
  expect(listId.required).toBe(true);

  // `emailAddress` not `email` — the field-name variance is the
  // load-bearing assertion. A schema rename to `email` would silently
  // break runtime config parsing.
  const emailAddress = byName.get("emailAddress")!;
  expect(emailAddress.type).toBe("text");
  expect(emailAddress.required).toBe(true);

  // Sensitive outputs — emailAddress (PII not caught by the structural
  // suspicious-name guard) + subscriberHash (md5(email)).
  const sensitive = new Set(
    mailchimpUnsubscribeSubscriberMeta.outputs
      .filter((o) => o.sensitive === true)
      .map((o) => o.name),
  );
  expect(sensitive).toEqual(new Set(["emailAddress", "subscriberHash"]));
});

it("end-to-end: pick audience (listId) → fill emailAddress → Modal Save → Toolbar Save persists ONCE with EXACT runtime field names (listId / emailAddress, NOT audience_id / email)", async () => {
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

  // 1. Trigger.
  await user.click(screen.getByRole("button", { name: /choose a trigger/i }));
  await waitFor(() => {
    expect(screen.getByText("Manual")).toBeInTheDocument();
  });
  await user.click(screen.getByText("Manual"));

  // 2. Drill into Mailchimp → Unsubscribe Subscriber.
  await user.click(screen.getByRole("button", { name: /add action/i }));
  await user.click(
    screen.getByRole("button", { name: /browse mailchimp actions/i }),
  );
  await waitFor(() => {
    expect(screen.getByText("Unsubscribe Subscriber")).toBeInTheDocument();
  });
  await user.click(screen.getByText("Unsubscribe Subscriber"));
  const action = useGraphSlice
    .getState()
    .pendingNodes.find((n) => n.kind === "action")!;
  expect(action.provider).toBe("mailchimp");
  expect(action.type).toBe("unsubscribe_subscriber");

  // 3. Open config rail.
  await openLastNodeOfKind("action");
  await waitFor(() => {
    expect(screen.getByRole("combobox", { name: /^audience$/i })).toBeInTheDocument();
  });
  expect(screen.getByRole("textbox", { name: /^email$/i })).toBeInTheDocument();

  // 4. Pick audience — wires `mailchimp:audiences` against `listId`
  // (NOT `audience_id`).
  await pickComboboxOption(user, /^audience$/i, LIST_LABEL);
  expect(useConfigSlice.getState().drafts[action.id]!.values.listId).toBe(
    LIST_ID,
  );
  // Defensive: confirm the snake_case alias did NOT land.
  expect(
    useConfigSlice.getState().drafts[action.id]!.values.audience_id,
  ).toBeUndefined();

  // 5. Fill emailAddress (camelCase — NOT `email`).
  await user.type(screen.getByRole("textbox", { name: /^email$/i }), EMAIL);
  expect(
    useConfigSlice.getState().drafts[action.id]!.values.emailAddress,
  ).toBe(EMAIL);
  expect(
    useConfigSlice.getState().drafts[action.id]!.values.email,
  ).toBeUndefined();

  // 6. Modal Save flushes draft.
  const modal = screen.getByRole("complementary", {
    name: /node configuration/i,
  });
  await user.click(within(modal).getByRole("button", { name: /^save$/i }));
  const pendingConfig = useGraphSlice
    .getState()
    .pendingNodes.find((n) => n.id === action.id)!.config;
  expect(pendingConfig.listId).toBe(LIST_ID);
  expect(pendingConfig.emailAddress).toBe(EMAIL);
  // Defensive: the snake_case shadow names must NOT appear in config.
  expect(pendingConfig.audience_id).toBeUndefined();
  expect(pendingConfig.email).toBeUndefined();
  expect(mockUpdateWorkflow).not.toHaveBeenCalled();

  // 7. Toolbar Save persists once.
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
  expect(persistedAction.type).toBe("unsubscribe_subscriber");
  expect(persistedAction.config.listId).toBe(LIST_ID);
  expect(persistedAction.config.emailAddress).toBe(EMAIL);
  expect(persistedAction.config.audience_id).toBeUndefined();
  expect(persistedAction.config.email).toBeUndefined();

  expect(mockUpdateWorkflow).toHaveBeenCalledTimes(1);
});
