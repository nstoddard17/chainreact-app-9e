/**
 * Slice 3.36 integration test — Slack `add_reaction` config
 * end-to-end through the live WorkflowBuilder shell.
 *
 * Canonical UX-shape test for Group B (reactions / pins). Proves the
 * three-field shape `{channel (combobox), ts (text), reaction (text)}`
 * round-trips through the builder shell:
 *   - channel field renders as async combobox sourced from
 *     `slack:channels`,
 *   - ts and reaction render as text inputs,
 *   - selecting a channel writes the channel id (not the label),
 *   - Modal Save flushes draft into pendingNodes,
 *   - Modal Save does NOT call updateWorkflow,
 *   - Toolbar Save persists once via `updateWorkflow` with the channel
 *     id, message timestamp, and reaction name.
 *
 * Out of scope: integration tests for the other 4 Group B actions —
 * they share this shape; registry + provider-route tests cover meta
 * correctness for each.
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
import { slackAddReactionMeta } from "@/integrations/slack/actions/addReaction.meta";
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
    p === "slack" ? [slackAddReactionMeta] : [],
  );
  mockListProviderTriggers.mockReset();
  mockListProviderTriggers.mockResolvedValue([]);
  mockFetchOptionsSource.mockReset();
  mockFetchOptionsSource.mockImplementation(async (source: string) => {
    if (source === "slack:channels") {
      return {
        ok: true,
        source: "slack:channels",
        items: [
          { value: "C01ABC23DEF", label: "#general" },
          { value: "C02XYZ45GHI", label: "#engineering" },
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

it("Slack add_reaction meta declares channel as combobox+slack:channels, ts as text, reaction as text (Slice 3.36 — meta guard)", () => {
  const channel = slackAddReactionMeta.fields.find((f) => f.name === "channel");
  expect(channel).toBeDefined();
  expect(channel!.type).toBe("combobox");
  expect(channel!.optionsSource).toBe("slack:channels");
  expect(channel!.required).toBe(true);

  const ts = slackAddReactionMeta.fields.find((f) => f.name === "ts");
  expect(ts).toBeDefined();
  expect(ts!.type).toBe("text");
  expect(ts!.required).toBe(true);

  const reaction = slackAddReactionMeta.fields.find(
    (f) => f.name === "reaction",
  );
  expect(reaction).toBeDefined();
  expect(reaction!.type).toBe("text");
  expect(reaction!.required).toBe(true);
});

it("end-to-end: pick channel via async combobox + type ts + type reaction → Modal Save (draft only) → Toolbar Save (updateWorkflow once)", async () => {
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

  // 2. Drill into Slack → Add Reaction.
  await user.click(screen.getByRole("button", { name: /add action/i }));
  await user.click(screen.getByRole("button", { name: /browse slack actions/i }));
  await waitFor(() => {
    expect(screen.getByText("Add Reaction")).toBeInTheDocument();
  });
  await user.click(screen.getByText("Add Reaction"));
  const action = useGraphSlice
    .getState()
    .pendingNodes.find((n) => n.kind === "action")!;
  expect(action.provider).toBe("slack");
  expect(action.type).toBe("add_reaction");

  // 3. Open config rail.
  await user.click(
    screen.getByRole("button", { name: /configure action node/i }),
  );
  await waitFor(() => {
    expect(
      screen.getByRole("combobox", { name: /^channel$/i }),
    ).toBeInTheDocument();
  });
  expect(
    screen.getByRole("textbox", { name: /^message timestamp$/i }),
  ).toBeInTheDocument();
  expect(
    screen.getByRole("textbox", { name: /^reaction$/i }),
  ).toBeInTheDocument();

  // 4. Pick a channel — saved value is the channel id.
  await pickComboboxOption(user, /^channel$/i, "#general");
  expect(useConfigSlice.getState().drafts[action.id]!.values.channel).toBe(
    "C01ABC23DEF",
  );

  // 5. Type ts + reaction.
  await user.type(
    screen.getByRole("textbox", { name: /^message timestamp$/i }),
    "1700000000.000100",
  );
  await user.type(
    screen.getByRole("textbox", { name: /^reaction$/i }),
    "tada",
  );
  const draft = useConfigSlice.getState().drafts[action.id]!;
  expect(draft.values.ts).toBe("1700000000.000100");
  expect(draft.values.reaction).toBe("tada");

  // 6. Modal Save flushes the draft.
  const modal = screen.getByRole("complementary", {
    name: /node configuration/i,
  });
  await user.click(within(modal).getByRole("button", { name: /^save$/i }));
  const pendingConfig = useGraphSlice
    .getState()
    .pendingNodes.find((n) => n.id === action.id)!.config;
  expect(pendingConfig.channel).toBe("C01ABC23DEF");
  expect(pendingConfig.ts).toBe("1700000000.000100");
  expect(pendingConfig.reaction).toBe("tada");

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
  expect(persistedAction.provider).toBe("slack");
  expect(persistedAction.type).toBe("add_reaction");
  expect(persistedAction.config.channel).toBe("C01ABC23DEF");
  expect(persistedAction.config.ts).toBe("1700000000.000100");
  expect(persistedAction.config.reaction).toBe("tada");

  expect(mockUpdateWorkflow).toHaveBeenCalledTimes(1);
});
