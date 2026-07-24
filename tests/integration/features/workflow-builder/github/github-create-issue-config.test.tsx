/**
 * RESOLVERS-1 integration test — GitHub `create_issue` config end-to-end
 * through the live WorkflowBuilder shell.
 *
 * First GitHub config test. Its reason to exist is the one field
 * combination nothing else covers: a `string-array` chip field that is BOTH
 * option-sourced AND parent-gated (`optionsSource` + `dependsOn`). The
 * `slack:users` precedent proves string-array + optionsSource with no
 * parent; the google-sheets row_changed test proves a cascaded combobox.
 * `create_issue.labels` / `.assignees` are the first fields to need both,
 * so this pins:
 *   - before a repository is picked, both chip pickers render the passive
 *     "Select Repository first" state and fire NO options request,
 *   - after `repository` is picked, each picker fetches its own source with
 *     `deps.repository` carrying the `owner/repo` value,
 *   - picking options commits a real `string[]` of label NAMES / LOGINS —
 *     exactly what `CreateIssueConfigSchema` stores (sweep G's fix holds;
 *     no CSV, no JSON encoding),
 *   - changing the repository CLEARS the dependent chips (SchemaForm's
 *     dependent-clearing), so a label from repo A can't survive onto repo B,
 *   - Modal Save → Toolbar Save persists once with the exact runtime field
 *     names.
 *
 * Mirrors `mailchimp-add-subscriber-config.test.tsx` shape — same mock
 * boundary (`@/lib/api/discovery`, `@/lib/api/options`,
 * `@/lib/api/workflows`), same Trigger → Action → Configure flow.
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

import { openLastNodeOfKind } from "../helpers/openLastNodeOfKind";
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
import { createIssueMeta } from "@/integrations/github/actions/createIssue.meta";
import { CreateIssueConfigSchema } from "@/integrations/github/actions/createIssue.schema";
import type { TriggerMeta } from "@/contracts/triggerMeta";
import type { WorkflowDetail } from "@/contracts/workflow";
import { pickComboboxOption } from "../helpers/comboboxField";

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
  createdAt: "2026-07-15T00:00:00Z",
  updatedAt: "2026-07-15T00:00:00Z",
};

const triggerProviders = [{ id: "native", displayName: "Native" }];
const actionProviders = [{ id: "github", displayName: "GitHub" }];

const REPOSITORY = "octocat/hello-world";
const OTHER_REPOSITORY = "octocat/other-repo";
const TITLE = "Payment webhook retries forever";

beforeEach(() => {
  mockUpdateWorkflow.mockReset();
  mockListNativeActions.mockReset();
  mockListNativeActions.mockResolvedValue([]);
  mockListNativeTriggers.mockReset();
  mockListNativeTriggers.mockResolvedValue([manualTriggerMeta]);
  mockListProviderActions.mockReset();
  mockListProviderActions.mockImplementation(async (p: string) =>
    p === "github" ? [createIssueMeta] : [],
  );
  mockListProviderTriggers.mockReset();
  mockListProviderTriggers.mockResolvedValue([]);
  mockFetchOptionsSource.mockReset();
  mockFetchOptionsSource.mockImplementation(
    async (source: string, opts?: { deps?: Record<string, string> }) => {
      if (source === "github:repos") {
        return {
          ok: true,
          source,
          items: [
            { value: REPOSITORY, label: REPOSITORY },
            { value: OTHER_REPOSITORY, label: OTHER_REPOSITORY, description: "Private" },
          ],
          hasMore: false,
        };
      }
      // Both repo-scoped pickers are keyed off the repository dep — return a
      // per-repo list so the dependent-clearing assertion is meaningful.
      if (source === "github:labels") {
        const items =
          opts?.deps?.repository === REPOSITORY
            ? [
                { value: "bug", label: "bug" },
                { value: "priority: high", label: "priority: high" },
              ]
            : [{ value: "other-repo-label", label: "other-repo-label" }];
        return { ok: true, source, items, hasMore: false };
      }
      if (source === "github:assignees") {
        return {
          ok: true,
          source,
          items: [
            { value: "hubot", label: "hubot" },
            { value: "octocat", label: "octocat" },
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

/** Trigger → GitHub → Create Issue → open the config rail. */
async function openCreateIssueConfig(
  user: ReturnType<typeof userEvent.setup>,
): Promise<{ id: string }> {
  render(
    <WorkflowBuilder
      workflow={baseWorkflow}
      triggerProviders={triggerProviders}
      actionProviders={actionProviders}
    />,
  );

  await user.click(screen.getByRole("button", { name: /choose a trigger/i }));
  await waitFor(() => {
    expect(screen.getByText("Manual")).toBeInTheDocument();
  });
  await user.click(screen.getByText("Manual"));

  await user.click(screen.getByRole("button", { name: /add action/i }));
  await user.click(
    screen.getByRole("button", { name: /browse github actions/i }),
  );
  await waitFor(() => {
    expect(screen.getByText("Create Issue")).toBeInTheDocument();
  });
  await user.click(screen.getByText("Create Issue"));

  const action = useGraphSlice
    .getState()
    .pendingNodes.find((n) => n.kind === "action")!;
  expect(action.provider).toBe("github");
  expect(action.type).toBe("create_issue");

  await openLastNodeOfKind("action");
  await waitFor(() => {
    expect(
      screen.getByRole("combobox", { name: /^repository$/i }),
    ).toBeInTheDocument();
  });
  return { id: action.id };
}

it("labels + assignees chip pickers stay parent-gated until a repository is picked (no options request fires)", async () => {
  const user = userEvent.setup();
  await openCreateIssueConfig(user);

  // Both chip fields render the passive "Select Repository first" state —
  // NOT an add button, and NOT a scary error.
  const gated = screen.getAllByTestId("string-array-parent-missing");
  expect(gated).toHaveLength(2);
  for (const el of gated) {
    expect(el).toHaveTextContent(/select repository first/i);
    expect(el).toBeDisabled();
  }
  expect(screen.queryByTestId("string-array-labels-add")).toBeNull();
  expect(screen.queryByTestId("string-array-assignees-add")).toBeNull();

  // A gated picker must never call the resolver with a partial dep set.
  const scopedCalls = mockFetchOptionsSource.mock.calls.filter(
    (c) => c[0] === "github:labels" || c[0] === "github:assignees",
  );
  expect(scopedCalls).toEqual([]);
});

it("end-to-end: pick repository → labels + assignees fetch with deps.repository → chips commit string[] of names/logins → Modal Save → Toolbar Save persists once", async () => {
  mockUpdateWorkflow.mockImplementation(async (_id, body) => ({
    ...baseWorkflow,
    draftDefinition: body.draftDefinition,
  }));
  const user = userEvent.setup();
  const action = await openCreateIssueConfig(user);

  // 1. Pick the repository — the cascade root for both chip pickers.
  await pickComboboxOption(user, /^repository$/i, REPOSITORY);
  expect(useConfigSlice.getState().drafts[action.id]!.values.repository).toBe(
    REPOSITORY,
  );

  // 2. Title (required free text).
  await user.type(screen.getByRole("textbox", { name: /^title$/i }), TITLE);

  // 3. Both chip pickers un-gate now that the parent has a value.
  await waitFor(() => {
    expect(screen.getByTestId("string-array-labels-add")).toBeInTheDocument();
  });
  expect(screen.getByTestId("string-array-assignees-add")).toBeInTheDocument();
  expect(screen.queryByTestId("string-array-parent-missing")).toBeNull();

  // 4. Pick two labels. The picker is multi-pick — the popover stays open
  //    between selections, so both are clicked in one session.
  await user.click(screen.getByTestId("string-array-labels-add"));
  await user.click(await screen.findByText("bug"));
  await user.click(await screen.findByText("priority: high"));
  await user.keyboard("{Escape}");

  await waitFor(() => {
    const call = mockFetchOptionsSource.mock.calls.find(
      (c) => c[0] === "github:labels",
    );
    expect(call).toBeDefined();
    const args = call![1] as { deps?: Record<string, string> } | undefined;
    expect(args?.deps?.repository).toBe(REPOSITORY);
  });

  // 5. Pick an assignee.
  await user.click(screen.getByTestId("string-array-assignees-add"));
  await user.click(await screen.findByText("octocat"));

  await waitFor(() => {
    const call = mockFetchOptionsSource.mock.calls.find(
      (c) => c[0] === "github:assignees",
    );
    expect(call).toBeDefined();
    const args = call![1] as { deps?: Record<string, string> } | undefined;
    expect(args?.deps?.repository).toBe(REPOSITORY);
  });

  // 6. Modal Save — the draft carries REAL string[]s of names / logins.
  const modal = screen.getByRole("complementary", {
    name: /node configuration/i,
  });
  await user.click(within(modal).getByRole("button", { name: /^save$/i }));
  const pendingConfig = useGraphSlice
    .getState()
    .pendingNodes.find((n) => n.id === action.id)!.config;
  expect(pendingConfig.repository).toBe(REPOSITORY);
  expect(pendingConfig.labels).toEqual(["bug", "priority: high"]);
  expect(pendingConfig.assignees).toEqual(["octocat"]);
  // Sweep G's fix holds — never a CSV string, never JSON.
  expect(typeof pendingConfig.labels).not.toBe("string");
  expect(typeof pendingConfig.assignees).not.toBe("string");

  // 7. The picked shape is exactly what the runtime schema accepts — the
  //    picker cannot commit a value create_issue would then reject.
  expect(CreateIssueConfigSchema.safeParse(pendingConfig).success).toBe(true);

  // Modal Save MUST NOT persist on its own.
  expect(mockUpdateWorkflow).not.toHaveBeenCalled();

  // 8. Toolbar Save persists ONCE with the exact runtime field names.
  const allSaveButtons = screen.getAllByRole("button", { name: /^save$/i });
  await user.click(allSaveButtons.find((btn) => !modal.contains(btn))!);
  await waitFor(() => {
    expect(mockUpdateWorkflow).toHaveBeenCalledTimes(1);
  });
  const body = mockUpdateWorkflow.mock.calls[0]![1] as {
    draftDefinition: { nodes: Array<{ id: string; config: Record<string, unknown> }> };
  };
  const persisted = body.draftDefinition.nodes.find((n) => n.id === action.id)!;
  expect(persisted.config.labels).toEqual(["bug", "priority: high"]);
  expect(persisted.config.assignees).toEqual(["octocat"]);
});

it("changing the repository clears the dependent chips (a label from repo A can't survive onto repo B)", async () => {
  const user = userEvent.setup();
  const action = await openCreateIssueConfig(user);

  await pickComboboxOption(user, /^repository$/i, REPOSITORY);
  await waitFor(() => {
    expect(screen.getByTestId("string-array-labels-add")).toBeInTheDocument();
  });
  await user.click(screen.getByTestId("string-array-labels-add"));
  await user.click(await screen.findByText("bug"));
  expect(useConfigSlice.getState().drafts[action.id]!.values.labels).toEqual([
    "bug",
  ]);

  // Re-point at a different repo — `bug` may not exist there, so the stale
  // chip must not linger (SchemaForm clears direct dependents).
  await pickComboboxOption(user, /^repository$/i, OTHER_REPOSITORY);
  await waitFor(() => {
    expect(
      useConfigSlice.getState().drafts[action.id]!.values.labels,
    ).toBeUndefined();
  });
});
