/**
 * Slice 3.38 integration test — Slack `post_interactive_blocks` config
 * end-to-end through the live WorkflowBuilder shell.
 *
 * Canonical UX-shape test for Group E. Proves the Block Kit JSON paste
 * UX (channel combobox + textarea JSON + optional notification text)
 * round-trips through the builder shell:
 *   - channel renders as async combobox sourced from `slack:channels`,
 *   - blocks renders as a textarea (no structured JSON editor in v1
 *     per the metadata plan §4.3),
 *   - the saved `blocks` value is the literal JSON string the author
 *     pastes (the engine resolves `{{...}}` references and Zod
 *     parses on save — neither concern is the meta's job),
 *   - Modal Save flushes draft into pendingNodes,
 *   - Modal Save does NOT call updateWorkflow,
 *   - Toolbar Save persists once via `updateWorkflow` with channel id,
 *     blocks JSON string, and the optional fallback text.
 *
 * Out of scope: integration tests for Group D actions (get_user_info,
 * list_users, get_file_info) — they share simpler UX shapes already
 * exercised by earlier slices' registry tests, and adding more
 * integration tests would add little incremental coverage at this
 * point. The decision is documented in the slice 3.38 report.
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
import { slackPostInteractiveBlocksMeta } from "@/integrations/slack/actions/postInteractiveBlocks.meta";
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

// Minimal Block Kit literal — `[{"type":"section",...}]`. The textarea
// stores this verbatim as a string; the runtime Zod schema parses it
// on save. The integration test only asserts the round-trip.
// What the json renderer commits after parsing BLOCKS_JSON.
const BLOCKS_PARSED = [
  { type: "section", text: { type: "mrkdwn", text: "Build is green" } },
];
const BLOCKS_JSON =
  '[{"type":"section","text":{"type":"mrkdwn","text":"Build is green"}}]';

beforeEach(() => {
  mockUpdateWorkflow.mockReset();
  mockListNativeActions.mockReset();
  mockListNativeActions.mockResolvedValue([]);
  mockListNativeTriggers.mockReset();
  mockListNativeTriggers.mockResolvedValue([manualTriggerMeta]);
  mockListProviderActions.mockReset();
  mockListProviderActions.mockImplementation(async (p: string) =>
    p === "slack" ? [slackPostInteractiveBlocksMeta] : [],
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

it("Slack post_interactive_blocks meta declares channel (combobox), blocks (advanced json array), text (optional text), threadTs (optional text) — Slice 3.38 meta guard + CONFIG-UX-AUDIT-2", () => {
  const channel = slackPostInteractiveBlocksMeta.fields.find(
    (f) => f.name === "channel",
  );
  expect(channel).toBeDefined();
  expect(channel!.type).toBe("combobox");
  expect(channel!.optionsSource).toBe("slack:channels");
  expect(channel!.required).toBe(true);

  const blocks = slackPostInteractiveBlocksMeta.fields.find(
    (f) => f.name === "blocks",
  );
  expect(blocks).toBeDefined();
  expect(blocks!.type).toBe("json");
  expect(blocks!.jsonShape).toBe("array");
  expect(blocks!.advanced).toBe(true);
  expect(blocks!.required).toBe(true);

  const text = slackPostInteractiveBlocksMeta.fields.find(
    (f) => f.name === "text",
  );
  expect(text).toBeDefined();
  expect(text!.type).toBe("text");
  expect(text!.required).toBe(false);
  // Q11: no silent notification-preview fallback.
  expect(text!.defaultValue).toBeUndefined();

  const threadTs = slackPostInteractiveBlocksMeta.fields.find(
    (f) => f.name === "threadTs",
  );
  expect(threadTs).toBeDefined();
  expect(threadTs!.type).toBe("text");
  expect(threadTs!.required).toBe(false);
});

it("end-to-end: pick channel + paste Block Kit JSON + type notification text → Modal Save (draft only) → Toolbar Save (updateWorkflow once with blocks as a REAL parsed array — CONFIG-UX-AUDIT-2)", async () => {
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

  // 2. Drill into Slack → Post Interactive Blocks.
  await user.click(screen.getByRole("button", { name: /add action/i }));
  await user.click(screen.getByRole("button", { name: /browse slack actions/i }));
  await waitFor(() => {
    expect(screen.getByText("Post Interactive Blocks")).toBeInTheDocument();
  });
  await user.click(screen.getByText("Post Interactive Blocks"));
  const action = useGraphSlice
    .getState()
    .pendingNodes.find((n) => n.kind === "action")!;
  expect(action.provider).toBe("slack");
  expect(action.type).toBe("post_interactive_blocks");

  // 3. Open config rail.
  await openLastNodeOfKind("action");
  await waitFor(() => {
    expect(
      screen.getByRole("combobox", { name: /^channel$/i }),
    ).toBeInTheDocument();
  });
  expect(screen.getByRole("textbox", { name: /^blocks$/i })).toBeInTheDocument();
  expect(
    screen.getByRole("textbox", { name: /^notification text$/i }),
  ).toBeInTheDocument();

  // 4. Pick channel.
  await pickComboboxOption(user, /^channel$/i, "#general");
  expect(useConfigSlice.getState().drafts[action.id]!.values.channel).toBe(
    "C01ABC23DEF",
  );

  // 5. Paste Block Kit JSON into the advanced json field. The renderer
  //    PARSES it and commits the REAL array the runtime z.array schema
  //    expects (the paste-JSON era saved a string it rejected).
  await user.click(screen.getByRole("textbox", { name: /^blocks$/i }));
  await user.paste(BLOCKS_JSON);
  expect(useConfigSlice.getState().drafts[action.id]!.values.blocks).toEqual(
    BLOCKS_PARSED,
  );

  // 6. Type the optional notification-preview text.
  await user.type(
    screen.getByRole("textbox", { name: /^notification text$/i }),
    "Build is green",
  );
  expect(useConfigSlice.getState().drafts[action.id]!.values.text).toBe(
    "Build is green",
  );

  // 7. Modal Save flushes the draft.
  const modal = screen.getByRole("complementary", {
    name: /node configuration/i,
  });
  await user.click(within(modal).getByRole("button", { name: /^save$/i }));
  const pendingConfig = useGraphSlice
    .getState()
    .pendingNodes.find((n) => n.id === action.id)!.config;
  expect(pendingConfig.channel).toBe("C01ABC23DEF");
  expect(pendingConfig.blocks).toEqual(BLOCKS_PARSED);
  expect(pendingConfig.text).toBe("Build is green");
  expect(pendingConfig.threadTs).toBeUndefined();

  expect(mockUpdateWorkflow).not.toHaveBeenCalled();

  // 8. Toolbar Save persists once.
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
  expect(persistedAction.type).toBe("post_interactive_blocks");
  expect(persistedAction.config.channel).toBe("C01ABC23DEF");
  expect(persistedAction.config.blocks).toEqual(BLOCKS_PARSED);
  expect(persistedAction.config.text).toBe("Build is green");
  expect(persistedAction.config.threadTs).toBeUndefined();

  expect(mockUpdateWorkflow).toHaveBeenCalledTimes(1);
});

it("invalid Block Kit JSON shows friendly copy, blocks Modal Save, and never leaks internals — CONFIG-UX-AUDIT-2", async () => {
  const user = userEvent.setup();
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
  await user.click(screen.getByRole("button", { name: /browse slack actions/i }));
  await waitFor(() => {
    expect(screen.getByText("Post Interactive Blocks")).toBeInTheDocument();
  });
  await user.click(screen.getByText("Post Interactive Blocks"));
  await openLastNodeOfKind("action");
  await waitFor(() => {
    expect(screen.getByRole("textbox", { name: /^blocks$/i })).toBeInTheDocument();
  });

  const modal = screen.getByRole("complementary", { name: /node configuration/i });

  // Broken JSON → friendly inline error + Save disabled + footer hint.
  await user.click(screen.getByRole("textbox", { name: /^blocks$/i }));
  await user.paste('[{"type": "section"');
  expect(await screen.findByText(/this needs valid json/i)).toBeInTheDocument();
  expect(
    within(modal).getByRole("button", { name: /^save$/i }),
  ).toBeDisabled();
  expect(screen.getByTestId("config-modal-json-blocking")).toHaveTextContent(
    /fix .blocks. before saving/i,
  );
  // Never leak internals to the author.
  expect(document.body.textContent).not.toMatch(
    /SyntaxError|JSON\.parse|zod|renderer|unexpected token/i,
  );

  // Valid JSON but WRONG SHAPE (object where the schema wants a list).
  await user.clear(screen.getByRole("textbox", { name: /^blocks$/i }));
  await user.click(screen.getByRole("textbox", { name: /^blocks$/i }));
  await user.paste('{"type":"section"}');
  expect(
    await screen.findByText(/needs a list/i),
  ).toBeInTheDocument();
  expect(
    within(modal).getByRole("button", { name: /^save$/i }),
  ).toBeDisabled();
});

it("a whole-value {{...}} variable stays a string (runtime resolver supplies the array); mixed JSON+variable is rejected with clear copy — CONFIG-UX-AUDIT-2", async () => {
  const user = userEvent.setup();
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
  await user.click(screen.getByRole("button", { name: /browse slack actions/i }));
  await waitFor(() => {
    expect(screen.getByText("Post Interactive Blocks")).toBeInTheDocument();
  });
  await user.click(screen.getByText("Post Interactive Blocks"));
  const action = useGraphSlice
    .getState()
    .pendingNodes.find((n) => n.kind === "action")!;
  await openLastNodeOfKind("action");
  await waitFor(() => {
    expect(screen.getByRole("textbox", { name: /^blocks$/i })).toBeInTheDocument();
  });
  const modal = screen.getByRole("complementary", { name: /node configuration/i });

  // Whole-value variable → committed as the string token; Save enabled.
  await user.click(screen.getByRole("textbox", { name: /^blocks$/i }));
  await user.paste("{{trigger.payload.blocks}}");
  expect(useConfigSlice.getState().drafts[action.id]!.values.blocks).toBe(
    "{{trigger.payload.blocks}}",
  );
  expect(
    within(modal).getByRole("button", { name: /^save$/i }),
  ).toBeEnabled();

  // Mixed variable + JSON text → rejected with whole-value copy.
  await user.clear(screen.getByRole("textbox", { name: /^blocks$/i }));
  await user.click(screen.getByRole("textbox", { name: /^blocks$/i }));
  await user.paste('[{"text": "{{trigger.payload.title}}"}]');
  expect(
    await screen.findByText(/variable must be the whole value/i),
  ).toBeInTheDocument();
  expect(
    within(modal).getByRole("button", { name: /^save$/i }),
  ).toBeDisabled();
});
