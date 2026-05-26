/**
 * Slice 3.MAILCHIMP-3 integration test — Mailchimp `add_subscriber`
 * config end-to-end through the live WorkflowBuilder shell.
 *
 * First Mailchimp config test. Exercises:
 *   - the MAILCHIMP-2 `mailchimp:audiences` resolver wiring on
 *     `audience_id`,
 *   - the Q11 consent gate (status REQUIRED, no default, 5 options),
 *   - the CSV-text shape of `tags` (V2 inherits V1's input shape —
 *     `string-array` is a future slice),
 *   - Modal Save → Toolbar Save → exactly-once `updateWorkflow` with
 *     EXACT runtime field names (`audience_id`, `email`, `status`,
 *     `tags`, NOT `audienceId` / `emailAddress` / etc.).
 *
 * Mirrors `hubspot-create-deal-config.test.tsx` shape — same mock
 * boundary (`@/lib/api/discovery`, `@/lib/api/options`,
 * `@/lib/api/workflows`), same WorkflowBuilder render + Trigger →
 * Action → Configure flow, same Modal/Toolbar Save split.
 *
 * Out of scope (covered separately):
 *   - The cross-action confirmation-modal infrastructure — covered by
 *     `destructive-action-confirmation-modal.test.tsx`. `add_subscriber`
 *     is not destructive, so the confirmation modal does NOT render
 *     here.
 *   - The MAILCHIMP-2 resolver cascade infrastructure — covered by
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
import { mailchimpAddSubscriberMeta } from "@/integrations/mailchimp/actions/addSubscriber.meta";
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

const AUDIENCE_ID = "abc123def456";
const AUDIENCE_LABEL = "Acme Newsletter";
const EMAIL = "subscriber@example.com";
const TAGS_CSV = "vip,beta";

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
    p === "mailchimp" ? [mailchimpAddSubscriberMeta] : [],
  );
  mockListProviderTriggers.mockReset();
  mockListProviderTriggers.mockResolvedValue([]);
  mockFetchOptionsSource.mockReset();
  mockFetchOptionsSource.mockImplementation((source: string) => {
    if (source === "mailchimp:audiences") {
      return Promise.resolve(
        audiencesResponse([
          { value: AUDIENCE_ID, label: AUDIENCE_LABEL, description: "42 members" },
          { value: "other-list", label: "Beta Channel", description: "7 members" },
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

it("Mailchimp add_subscriber meta exposes the 12 schema fields with Q11 status gate + audience picker + CSV-text tags — Slice 3.MAILCHIMP-3 meta guard", () => {
  const names = mailchimpAddSubscriberMeta.fields.map((f) => f.name);
  expect(names).toEqual([
    "audience_id",
    "email",
    "status",
    "first_name",
    "last_name",
    "phone",
    "address",
    "city",
    "state",
    "zip",
    "country",
    "tags",
  ]);

  const byName = new Map(
    mailchimpAddSubscriberMeta.fields.map((f) => [f.name, f]),
  );

  // Audience picker wires the MAILCHIMP-2 resolver.
  const audience = byName.get("audience_id")!;
  expect(audience.type).toBe("combobox");
  expect(audience.optionsSource).toBe("mailchimp:audiences");
  expect(audience.required).toBe(true);

  // email is required text.
  expect(byName.get("email")!.type).toBe("text");
  expect(byName.get("email")!.required).toBe(true);

  // Q11 consent gate — status REQUIRED with NO defaultValue.
  const status = byName.get("status")!;
  expect(status.type).toBe("select");
  expect(status.required).toBe(true);
  expect(status.defaultValue).toBeUndefined();
  expect(status.options!.map((o) => o.value).sort()).toEqual([
    "cleaned",
    "pending",
    "subscribed",
    "transactional",
    "unsubscribed",
  ]);

  // tags stays text (CSV) per V1 input shape.
  const tags = byName.get("tags")!;
  expect(tags.type).toBe("text");
  expect(tags.required).toBe(false);

  // Risk classification.
  expect(mailchimpAddSubscriberMeta.riskLevel).toBe("medium");
  expect(mailchimpAddSubscriberMeta.isDestructive).toBe(false);
  expect(mailchimpAddSubscriberMeta.requiresConfirmation).toBe(false);
  expect(mailchimpAddSubscriberMeta.riskDescription).toBeDefined();

  // Sensitive output pins.
  const sensitive = new Set(
    mailchimpAddSubscriberMeta.outputs
      .filter((o) => o.sensitive === true)
      .map((o) => o.name),
  );
  expect(sensitive).toEqual(new Set(["subscriberId", "email", "tags"]));
});

it("end-to-end: pick audience (mailchimp:audiences) → fill email + pick status + fill CSV tags → Modal Save → Toolbar Save persists ONCE with EXACT runtime field names", async () => {
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

  // 2. Drill into Mailchimp → Add Subscriber.
  await user.click(screen.getByRole("button", { name: /add action/i }));
  await user.click(
    screen.getByRole("button", { name: /browse mailchimp actions/i }),
  );
  await waitFor(() => {
    expect(screen.getByText("Add Subscriber")).toBeInTheDocument();
  });
  await user.click(screen.getByText("Add Subscriber"));
  const action = useGraphSlice
    .getState()
    .pendingNodes.find((n) => n.kind === "action")!;
  expect(action.provider).toBe("mailchimp");
  expect(action.type).toBe("add_subscriber");

  // 3. Open config rail.
  await openLastNodeOfKind("action");
  await waitFor(() => {
    expect(screen.getByRole("combobox", { name: /^audience$/i })).toBeInTheDocument();
  });
  expect(screen.getByRole("textbox", { name: /^email$/i })).toBeInTheDocument();
  expect(screen.getByRole("combobox", { name: /^status$/i })).toBeInTheDocument();
  expect(screen.getByRole("textbox", { name: /^tags$/i })).toBeInTheDocument();

  // 4. Pick audience → fetches mailchimp:audiences.
  await pickComboboxOption(user, /^audience$/i, AUDIENCE_LABEL);
  await waitFor(() => {
    const calls = mockFetchOptionsSource.mock.calls.filter(
      (c) => c[0] === "mailchimp:audiences",
    );
    expect(calls.length).toBeGreaterThan(0);
  });
  expect(
    useConfigSlice.getState().drafts[action.id]!.values.audience_id,
  ).toBe(AUDIENCE_ID);

  // 5. Fill email.
  await user.type(screen.getByRole("textbox", { name: /^email$/i }), EMAIL);
  expect(useConfigSlice.getState().drafts[action.id]!.values.email).toBe(EMAIL);

  // 6. Pick status — Q11 consent gate (no default).
  await pickComboboxOption(user, /^status$/i, /pending/i);
  expect(useConfigSlice.getState().drafts[action.id]!.values.status).toBe(
    "pending",
  );

  // 7. Fill tags as comma-separated string (V1-inherited shape).
  await user.type(screen.getByRole("textbox", { name: /^tags$/i }), TAGS_CSV);
  expect(useConfigSlice.getState().drafts[action.id]!.values.tags).toBe(TAGS_CSV);

  // 8. Modal Save flushes the draft.
  const modal = screen.getByRole("complementary", {
    name: /node configuration/i,
  });
  await user.click(within(modal).getByRole("button", { name: /^save$/i }));
  const pendingConfig = useGraphSlice
    .getState()
    .pendingNodes.find((n) => n.id === action.id)!.config;

  // CRITICAL: exact Mailchimp runtime field names round-trip —
  // audience_id / email / status / tags (NOT audienceId / etc.).
  expect(pendingConfig.audience_id).toBe(AUDIENCE_ID);
  expect(pendingConfig.email).toBe(EMAIL);
  expect(pendingConfig.status).toBe("pending");
  expect(pendingConfig.tags).toBe(TAGS_CSV);
  // Untouched optional fields stay absent.
  expect(pendingConfig.first_name).toBeUndefined();
  expect(pendingConfig.last_name).toBeUndefined();
  expect(pendingConfig.phone).toBeUndefined();

  // Modal Save MUST NOT call updateWorkflow yet.
  expect(mockUpdateWorkflow).not.toHaveBeenCalled();

  // 9. Toolbar Save persists once.
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
  expect(persistedAction.type).toBe("add_subscriber");
  expect(persistedAction.config.audience_id).toBe(AUDIENCE_ID);
  expect(persistedAction.config.email).toBe(EMAIL);
  expect(persistedAction.config.status).toBe("pending");
  expect(persistedAction.config.tags).toBe(TAGS_CSV);

  // Single updateWorkflow call — combobox + text-input interactions
  // must not double-fire persistence.
  expect(mockUpdateWorkflow).toHaveBeenCalledTimes(1);
});
