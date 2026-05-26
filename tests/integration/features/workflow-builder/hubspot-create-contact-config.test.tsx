/**
 * Slice 3.HUBSPOT-3 integration test — HubSpot `create_contact` config
 * end-to-end through the live WorkflowBuilder shell.
 *
 * Pins the first HubSpot config rail. Covers:
 *   - email required text + several optional text properties,
 *   - duplicateHandling required select with defaultValue='fail' (3 options),
 *   - Modal Save flushes draft → Toolbar Save persists once via updateWorkflow,
 *   - persisted config carries the EXACT runtime field names from the schema
 *     (firstname/lastname/hs_lead_status — not first_name/last_name/etc.),
 *   - meta-shape guard `it()` runs without rendering the builder.
 *
 * Out of scope (intentionally — none of the contact/company schemas have
 * `hubspot_owner_id`, so the HUBSPOT-2 `hubspot:owners` resolver isn't
 * exercised here):
 *   - Owner combobox cascade — covered by `hubspot-options-cascade.test.tsx`
 *     (synthetic field harness) and lands on a real meta in HUBSPOT-4
 *     (`create_deal` / `create_ticket`).
 *
 * Out of scope (covered separately):
 *   - duplicateHandling 'update' / 'skip' runtime recovery flow — covered
 *     by the createContact handler unit tests.
 *   - getContacts / createCompany / updateCompany / etc. per-config tests
 *     — one per UX shape per the slice rules; this test owns the contact
 *     UX shape.
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
import { hubspotCreateContactMeta } from "@/integrations/hubspot/actions/meta/createContact.meta";
import type { TriggerMeta } from "@/contracts/triggerMeta";
import type { WorkflowDetail } from "@/contracts/workflow";
import { selectFieldOption } from "./helpers/selectField";

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
  createdAt: "2026-05-22T00:00:00Z",
  updatedAt: "2026-05-22T00:00:00Z",
};

const triggerProviders = [{ id: "native", displayName: "Native" }];
const actionProviders = [{ id: "hubspot", displayName: "HubSpot" }];

const EMAIL = "alice@example.com";
const FIRSTNAME = "Alice";
const LASTNAME = "Adams";
const PHONE = "+1-555-0100";
const LIFECYCLESTAGE = "lead";

beforeEach(() => {
  mockUpdateWorkflow.mockReset();
  mockListNativeActions.mockReset();
  mockListNativeActions.mockResolvedValue([]);
  mockListNativeTriggers.mockReset();
  mockListNativeTriggers.mockResolvedValue([manualTriggerMeta]);
  mockListProviderActions.mockReset();
  mockListProviderActions.mockImplementation(async (p: string) =>
    p === "hubspot" ? [hubspotCreateContactMeta] : [],
  );
  mockListProviderTriggers.mockReset();
  mockListProviderTriggers.mockResolvedValue([]);
  mockFetchOptionsSource.mockReset();
  // Defensive: HUBSPOT-3 contact/company metas have ZERO optionsSource
  // fields. Any fetch invocation indicates a meta-shape regression
  // (a resolver was added without a schema change to back it).
  mockFetchOptionsSource.mockImplementation(async (source: string) => ({
    ok: false,
    source,
    code: "SOURCE_NOT_FOUND",
    message: `Unknown source '${source}' (test mock).`,
  }));
  __resetNativeActionsCacheForTests();
  __resetNativeTriggersCacheForTests();
  __resetProviderActionsCacheForTests();
  __resetProviderTriggersCacheForTests();
  useGraphSlice.getState().reset();
  useConfigSlice.getState().reset();
  useRunSlice.getState().reset();
});

it("HubSpot create_contact meta exposes the schema's 15 fields, no hubspot_owner_id, duplicateHandling default 'fail' — Slice 3.HUBSPOT-3 meta guard", () => {
  const names = hubspotCreateContactMeta.fields.map((f) => f.name);
  expect(names).toEqual([
    "email",
    "firstname",
    "lastname",
    "phone",
    "company",
    "jobtitle",
    "website",
    "lifecyclestage",
    "hs_lead_status",
    "address",
    "city",
    "state",
    "zip",
    "country",
    "duplicateHandling",
  ]);
  // No hubspot_owner_id on contact metas — the contact schema doesn't
  // accept it. Pins the deferred-resolver decision from HUBSPOT-2.
  expect(names).not.toContain("hubspot_owner_id");

  const byName = new Map(hubspotCreateContactMeta.fields.map((f) => [f.name, f]));
  expect(byName.get("email")!.type).toBe("text");
  expect(byName.get("email")!.required).toBe(true);

  const dup = byName.get("duplicateHandling")!;
  expect(dup.type).toBe("select");
  expect(dup.required).toBe(true);
  expect(dup.defaultValue).toBe("fail");
  expect(dup.options!.map((o) => o.value).sort()).toEqual([
    "fail",
    "skip",
    "update",
  ]);

  // Risk classification + sensitive flag pins.
  expect(hubspotCreateContactMeta.riskLevel).toBe("medium");
  expect(hubspotCreateContactMeta.isDestructive).toBe(false);
  expect(hubspotCreateContactMeta.requiresConfirmation).toBe(false);
  expect(hubspotCreateContactMeta.riskDescription).toBeDefined();
  const sensitive = new Set(
    hubspotCreateContactMeta.outputs
      .filter((o) => o.sensitive === true)
      .map((o) => o.name),
  );
  expect(sensitive).toEqual(
    new Set(["email", "firstName", "lastName", "properties"]),
  );
});

it("end-to-end: type email + names + phone + lifecyclestage → switch duplicateHandling to 'update' → Modal Save → Toolbar Save persists ONCE with EXACT runtime field names", async () => {
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

  // 2. Drill into HubSpot → Create Contact.
  await user.click(screen.getByRole("button", { name: /add action/i }));
  await user.click(
    screen.getByRole("button", { name: /browse hubspot actions/i }),
  );
  await waitFor(() => {
    expect(screen.getByText("Create Contact")).toBeInTheDocument();
  });
  await user.click(screen.getByText("Create Contact"));
  const action = useGraphSlice
    .getState()
    .pendingNodes.find((n) => n.kind === "action")!;
  expect(action.provider).toBe("hubspot");
  expect(action.type).toBe("create_contact");
  // Meta default seeds the draft via deriveDefaultConfig.
  expect(action.config.duplicateHandling).toBe("fail");

  // 3. Open config rail. Expected controls: email + name fields + a few
  //    optionals + duplicateHandling select.
  await user.click(
    screen.getByRole("button", { name: /configure action node/i }),
  );
  await waitFor(() => {
    expect(screen.getByRole("textbox", { name: /^email$/i })).toBeInTheDocument();
  });
  expect(screen.getByRole("textbox", { name: /^first name$/i })).toBeInTheDocument();
  expect(screen.getByRole("textbox", { name: /^last name$/i })).toBeInTheDocument();
  expect(screen.getByRole("textbox", { name: /^phone$/i })).toBeInTheDocument();
  expect(
    screen.getByRole("textbox", { name: /^lifecycle stage$/i }),
  ).toBeInTheDocument();
  expect(
    screen.getByRole("combobox", { name: /^duplicate handling$/i }),
  ).toBeInTheDocument();

  // 4. Type the required + optional fields.
  await user.type(screen.getByRole("textbox", { name: /^email$/i }), EMAIL);
  expect(useConfigSlice.getState().drafts[action.id]!.values.email).toBe(EMAIL);

  await user.type(
    screen.getByRole("textbox", { name: /^first name$/i }),
    FIRSTNAME,
  );
  expect(useConfigSlice.getState().drafts[action.id]!.values.firstname).toBe(
    FIRSTNAME,
  );

  await user.type(
    screen.getByRole("textbox", { name: /^last name$/i }),
    LASTNAME,
  );
  expect(useConfigSlice.getState().drafts[action.id]!.values.lastname).toBe(
    LASTNAME,
  );

  await user.type(screen.getByRole("textbox", { name: /^phone$/i }), PHONE);
  expect(useConfigSlice.getState().drafts[action.id]!.values.phone).toBe(PHONE);

  await user.type(
    screen.getByRole("textbox", { name: /^lifecycle stage$/i }),
    LIFECYCLESTAGE,
  );
  expect(
    useConfigSlice.getState().drafts[action.id]!.values.lifecyclestage,
  ).toBe(LIFECYCLESTAGE);

  // 5. Switch duplicateHandling 'fail' → 'update' to exercise the
  //    select.
  await selectFieldOption(user, /^duplicate handling$/i, "update");
  expect(
    useConfigSlice.getState().drafts[action.id]!.values.duplicateHandling,
  ).toBe("update");

  // 6. Modal Save flushes the draft.
  const modal = screen.getByRole("complementary", {
    name: /node configuration/i,
  });
  await user.click(within(modal).getByRole("button", { name: /^save$/i }));
  const pendingConfig = useGraphSlice
    .getState()
    .pendingNodes.find((n) => n.id === action.id)!.config;
  // CRITICAL: exact HubSpot runtime field names round-trip — NOT
  // camelCased / underscored (HubSpot's API uses `firstname` /
  // `lastname` / `hs_lead_status` / `lifecyclestage`).
  expect(pendingConfig.email).toBe(EMAIL);
  expect(pendingConfig.firstname).toBe(FIRSTNAME);
  expect(pendingConfig.lastname).toBe(LASTNAME);
  expect(pendingConfig.phone).toBe(PHONE);
  expect(pendingConfig.lifecyclestage).toBe(LIFECYCLESTAGE);
  expect(pendingConfig.duplicateHandling).toBe("update");
  // Untouched optional fields stay absent.
  expect(pendingConfig.jobtitle).toBeUndefined();
  expect(pendingConfig.website).toBeUndefined();
  expect(pendingConfig.hs_lead_status).toBeUndefined();
  // No hubspot_owner_id on this meta — the test fixture confirmed it
  // wasn't rendered; the persisted config must not invent it.
  expect(pendingConfig.hubspot_owner_id).toBeUndefined();

  // Modal Save MUST NOT call updateWorkflow yet.
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
  expect(persistedAction.provider).toBe("hubspot");
  expect(persistedAction.type).toBe("create_contact");
  expect(persistedAction.config.email).toBe(EMAIL);
  expect(persistedAction.config.firstname).toBe(FIRSTNAME);
  expect(persistedAction.config.lastname).toBe(LASTNAME);
  expect(persistedAction.config.phone).toBe(PHONE);
  expect(persistedAction.config.lifecyclestage).toBe(LIFECYCLESTAGE);
  expect(persistedAction.config.duplicateHandling).toBe("update");

  // Resolver was never hit — HUBSPOT-3 metas have no optionsSource
  // fields. Any non-zero call count would indicate a meta-shape
  // regression (a resolver was added without a schema change).
  expect(mockFetchOptionsSource).not.toHaveBeenCalled();

  // Single updateWorkflow call — text-input / select interactions
  // must not double-fire persistence.
  expect(mockUpdateWorkflow).toHaveBeenCalledTimes(1);
});
