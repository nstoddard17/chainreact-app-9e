/**
 * Slice 3.MAILCHIMP-3 integration test — Mailchimp `remove_subscriber`
 * config end-to-end through the live WorkflowBuilder shell.
 *
 * `remove_subscriber` is the only Mailchimp action carrying the **full
 * destructive trio** — `riskLevel: "high" + isDestructive: true +
 * requiresConfirmation: true`. The test pins the trio + the Q11
 * required-mode gate (no default; both `archive` and `delete_permanent`
 * exposed) + the persistence round-trip with exact runtime field
 * names.
 *
 * Out of scope (covered separately):
 *   - The cross-action confirmation-modal flow (activation 409 →
 *     CONFIRM dialog → retry, RunNow 409 → CONFIRM/Cancel) — covered
 *     by `destructive-action-confirmation-modal.test.tsx` against the
 *     POSTSEC-5 Stripe sample. The confirmation modal infrastructure is
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
import { mailchimpRemoveSubscriberMeta } from "@/integrations/mailchimp/actions/removeSubscriber.meta";
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

/**
 * RESOLVERS-1 — the `mailchimp:members` resolver's option VALUE is the
 * member email string itself (see `integrations/mailchimp/options/members.ts`),
 * which is exactly what `removeSubscriber.schema.ts` stores in `email`
 * (`z.string().email()`). That value-shape identity is what makes this
 * field wireable to the picker at all; the e2e below pins it end-to-end.
 */
function membersResponse(
  items: ReadonlyArray<{ value: string; label: string; description?: string }>,
) {
  return {
    ok: true as const,
    source: "mailchimp:members",
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
    p === "mailchimp" ? [mailchimpRemoveSubscriberMeta] : [],
  );
  mockListProviderTriggers.mockReset();
  mockListProviderTriggers.mockResolvedValue([]);
  mockFetchOptionsSource.mockReset();
  mockFetchOptionsSource.mockImplementation((source: string) => {
    if (source === "mailchimp:audiences") {
      return Promise.resolve(
        audiencesResponse([
          { value: AUDIENCE_ID, label: AUDIENCE_LABEL, description: "42 members" },
        ]),
      );
    }
    if (source === "mailchimp:members") {
      return Promise.resolve(
        membersResponse([
          { value: EMAIL, label: EMAIL, description: "subscribed" },
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

it("Mailchimp remove_subscriber meta declares the FULL destructive trio (high + isDestructive + requiresConfirmation) with riskDescription calling out re-subscribe block + Q11 required mode select — Slice 3.MAILCHIMP-3 meta guard", () => {
  // Destructive trio — pinned hard. The cross-action confirmation modal
  // flow (POSTSEC-5) uses these three fields to gate activation +
  // RunNow; any drift here silently disables the modal.
  expect(mailchimpRemoveSubscriberMeta.riskLevel).toBe("high");
  expect(mailchimpRemoveSubscriberMeta.isDestructive).toBe(true);
  expect(mailchimpRemoveSubscriberMeta.requiresConfirmation).toBe(true);
  expect(mailchimpRemoveSubscriberMeta.riskDescription).toBeDefined();
  expect(mailchimpRemoveSubscriberMeta.riskDescription!.length).toBeGreaterThan(
    0,
  );
  // riskDescription MUST call out the irreversible re-subscribe block
  // so reviewers see WHY this action carries the destructive trio.
  expect(
    mailchimpRemoveSubscriberMeta.riskDescription!.toLowerCase(),
  ).toContain("re-subscribe");

  // 3 required fields — audience picker, email, mode.
  const names = mailchimpRemoveSubscriberMeta.fields.map((f) => f.name);
  expect(names).toEqual(["audience_id", "email", "mode"]);

  const byName = new Map(
    mailchimpRemoveSubscriberMeta.fields.map((f) => [f.name, f]),
  );
  const audience = byName.get("audience_id")!;
  expect(audience.type).toBe("combobox");
  expect(audience.optionsSource).toBe("mailchimp:audiences");
  expect(audience.required).toBe(true);

  // RESOLVERS-1 — the subscriber field is a REAL picker backed by the
  // registered `mailchimp:members` resolver, cascaded off the audience.
  // `dependsOn` MUST stay `audience_id`: the builder keys the outgoing
  // `deps[<parent>]` by the parent FIELD NAME, and the resolver declares
  // `requiredDeps: ["audience_id"]` — any rename on either side silently
  // breaks the cascade into a permanent MISSING_DEPENDENCY.
  const email = byName.get("email")!;
  expect(email.type).toBe("combobox");
  expect(email.optionsSource).toBe("mailchimp:members");
  expect(email.dependsOn).toBe("audience_id");
  // Graceful degradation: a subscriber the bounded page can't list (or an
  // upstream {{...}} variable) must still commit — destructive or not.
  expect(email.allowManualEntry).toBe(true);
  expect(email.required).toBe(true);

  // Q11 required-mode gate — NO default, BOTH options exposed.
  const mode = byName.get("mode")!;
  expect(mode.type).toBe("select");
  expect(mode.required).toBe(true);
  expect(mode.defaultValue).toBeUndefined();
  expect(mode.options!.map((o) => o.value).sort()).toEqual([
    "archive",
    "delete_permanent",
  ]);

  // Outputs are narrow + only `email` is sensitive (the structural
  // suspicious-name guard would catch it anyway). `mode` / `permanent`
  // are echoes/derivations of input — not new PII.
  const sensitive = mailchimpRemoveSubscriberMeta.outputs.filter(
    (o) => o.sensitive === true,
  );
  expect(sensitive.map((o) => o.name)).toEqual(["email"]);
});

it("end-to-end: pick audience → pick subscriber from the cascaded members picker → select mode → Modal Save → Toolbar Save persists ONCE with EXACT runtime field names", async () => {
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

  // 2. Drill into Mailchimp → Remove Subscriber.
  await user.click(screen.getByRole("button", { name: /add action/i }));
  await user.click(
    screen.getByRole("button", { name: /browse mailchimp actions/i }),
  );
  await waitFor(() => {
    expect(screen.getByText("Remove Subscriber")).toBeInTheDocument();
  });
  await user.click(screen.getByText("Remove Subscriber"));
  const action = useGraphSlice
    .getState()
    .pendingNodes.find((n) => n.kind === "action")!;
  expect(action.provider).toBe("mailchimp");
  expect(action.type).toBe("remove_subscriber");

  // 3. Open config rail.
  await openLastNodeOfKind("action");
  await waitFor(() => {
    expect(screen.getByRole("combobox", { name: /^audience$/i })).toBeInTheDocument();
  });

  // 4. The subscriber picker is GATED until an audience is chosen — the
  //    members resolver is audience-scoped, so no fetch may fire yet.
  expect(screen.getByTestId("combobox-parent-missing")).toHaveTextContent(
    /select audience first/i,
  );
  expect(mockFetchOptionsSource).not.toHaveBeenCalledWith(
    "mailchimp:members",
    expect.anything(),
  );

  // 5. Pick audience.
  await pickComboboxOption(user, /^audience$/i, AUDIENCE_LABEL);
  expect(
    useConfigSlice.getState().drafts[action.id]!.values.audience_id,
  ).toBe(AUDIENCE_ID);

  // 6. Pick the subscriber from the now-cascaded members picker. The
  //    committed value is the EMAIL string itself (the resolver's option
  //    value), which is exactly what the handler schema stores — no hash,
  //    no member id.
  await pickComboboxOption(user, /^email$/i, EMAIL);
  expect(useConfigSlice.getState().drafts[action.id]!.values.email).toBe(EMAIL);
  // The members fetch was scoped by the chosen audience via `deps`, keyed
  // by the parent field name the resolver's `requiredDeps` declares.
  expect(mockFetchOptionsSource).toHaveBeenCalledWith(
    "mailchimp:members",
    expect.objectContaining({ deps: { audience_id: AUDIENCE_ID } }),
  );

  // 7. Pick mode = delete_permanent (the high-risk choice). Q11 forces
  // the explicit pick — no default could land for us.
  await pickComboboxOption(user, /^mode$/i, /delete permanently/i);
  expect(useConfigSlice.getState().drafts[action.id]!.values.mode).toBe(
    "delete_permanent",
  );

  // 8. Modal Save flushes the draft.
  const modal = screen.getByRole("complementary", {
    name: /node configuration/i,
  });
  await user.click(within(modal).getByRole("button", { name: /^save$/i }));
  const pendingConfig = useGraphSlice
    .getState()
    .pendingNodes.find((n) => n.id === action.id)!.config;
  expect(pendingConfig.audience_id).toBe(AUDIENCE_ID);
  expect(pendingConfig.email).toBe(EMAIL);
  expect(pendingConfig.mode).toBe("delete_permanent");
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
  expect(persistedAction.type).toBe("remove_subscriber");
  expect(persistedAction.config.audience_id).toBe(AUDIENCE_ID);
  expect(persistedAction.config.email).toBe(EMAIL);
  expect(persistedAction.config.mode).toBe("delete_permanent");

  expect(mockUpdateWorkflow).toHaveBeenCalledTimes(1);
});
