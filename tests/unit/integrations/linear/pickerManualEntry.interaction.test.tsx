/**
 * LINEAR-MANUAL-ENTRY-1 — user-facing behavior of the Linear pickers, driven
 * through the REAL renderers over the REGENERATED metadata and the REAL shared
 * config draft.
 *
 * Linear's metas are GENERATED from `mcp-catalog.ts` + `mcp-snapshot.json`, so
 * these tests import the committed generated artifacts. That is deliberate: it
 * means the behavior below can only pass while the compiler keeps emitting
 * `allowManualEntry`, which is what "survives regeneration" has to mean.
 *
 * Two renderer paths are covered, once each — a scalar `combobox`
 * (`create_issue.team`) and the multi-value `string-array` picker
 * (`create_issue.labels`). Every other Linear field reuses one of these two, so
 * the metadata-level guard (`tests/unit/integrations/pickerManualEntryContract`)
 * carries the rest rather than repeating this component test 15 times.
 *
 * Only the provider-resource call and the upstream variable source are stubbed.
 */
const mockUseOptionsSource = jest.fn();
jest.mock("@/features/workflow-builder/hooks/useOptionsSource", () => ({
  __esModule: true,
  useOptionsSource: (...a: unknown[]) => mockUseOptionsSource(...a),
}));

const mockUpstream = jest.fn();
jest.mock("@/features/workflow-builder/hooks/useActiveNodeUpstreamVariables", () => ({
  __esModule: true,
  useActiveNodeUpstreamVariables: () => mockUpstream(),
}));

import { act, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { FieldMeta } from "@/contracts/actionMeta";
import { SchemaForm } from "@/features/workflow-builder/config-modal/SchemaForm";
import { useConfigSlice } from "@/features/workflow-builder/state/configSlice";
import { useGraphSlice } from "@/features/workflow-builder/state/graphSlice";
import { commitNodeConfigDraft } from "@/features/workflow-builder/state/commitConfigDraft";
import { createIssueMeta } from "@/integrations/linear/actions/createIssue.meta";
import { CreateIssueConfigSchema } from "@/integrations/linear/actions/createIssue.schema";

const NODE_ID = "n1";

const SOURCES = [
  {
    sourceId: "trigger",
    label: "Trigger",
    outputs: [{ name: "teamName", type: "string", description: "A Linear team name." }],
  },
];

function renderFields(fields: readonly FieldMeta[], initial: Record<string, unknown> = {}) {
  act(() => {
    useGraphSlice.getState().hydrate("wf-1", {
      nodes: [
        {
          id: NODE_ID,
          kind: "action",
          provider: "linear",
          type: "create_issue",
          config: initial,
          position: { x: 0, y: 0 },
        },
      ],
      edges: [],
    });
    useConfigSlice.getState().openNode({ nodeId: NODE_ID, initialValues: initial });
  });

  function Harness() {
    const values = useConfigSlice((s) => s.drafts[NODE_ID]?.values ?? {});
    const updateField = useConfigSlice((s) => s.updateField);
    return (
      <SchemaForm
        fields={fields}
        values={values}
        onChange={(name, value) => updateField({ nodeId: NODE_ID, name, value })}
      />
    );
  }
  return render(<Harness />);
}

const draftValues = () => useConfigSlice.getState().drafts[NODE_ID]!.values;
const savedConfig = () =>
  useGraphSlice.getState().pendingNodes.find((n) => n.id === NODE_ID)!.config;

/** Only the field under test, so sibling pickers don't add ambiguous matches. */
const only = (name: string): readonly FieldMeta[] =>
  createIssueMeta.fields.filter((f) => f.name === name);

beforeEach(() => {
  mockUseOptionsSource.mockReset();
  mockUseOptionsSource.mockReturnValue({
    state: {
      status: "ready",
      items: [
        { value: "TEAM_ENG", label: "Engineering" },
        { value: "LBL_BUG", label: "Bug" },
      ],
      hasMore: false,
    },
    refetch: jest.fn(),
  });
  mockUpstream.mockReset();
  mockUpstream.mockReturnValue({ sources: SOURCES, latestValuesBySource: {} });
  useGraphSlice.getState().reset();
  useConfigSlice.getState().reset();
});

describe("linear:create_issue.team — scalar combobox", () => {
  it("still renders the resolver's options", async () => {
    const user = userEvent.setup();
    renderFields(only("team"));
    await user.click(screen.getByRole("combobox", { name: /team/i }));
    expect(await screen.findByText("Engineering")).toBeInTheDocument();
  });

  it("picking an option commits the resolver's id", async () => {
    const user = userEvent.setup();
    renderFields(only("team"));
    await user.click(screen.getByRole("combobox", { name: /team/i }));
    await user.click(await screen.findByText("Engineering"));
    expect(draftValues().team).toBe("TEAM_ENG");
  });

  it("accepts a typed team NAME — the value Linear's own tool schema documents", async () => {
    const user = userEvent.setup();
    renderFields(only("team"));
    await user.click(screen.getByRole("combobox", { name: /team/i }));
    // Linear types `team` as "Team name or ID"; no picker enumerates every name.
    await user.type(await screen.findByPlaceholderText(/search/i), "Platform");
    await user.click(await screen.findByTestId("combobox-manual-entry"));

    expect(draftValues().team).toBe("Platform");
    act(() => {
      commitNodeConfigDraft(NODE_ID);
    });
    expect(savedConfig().team).toBe("Platform");
    expect(() =>
      CreateIssueConfigSchema.parse({ title: "T", team: "Platform" }),
    ).not.toThrow();
  });

  it("offers the variable picker and commits an upstream token", async () => {
    const user = userEvent.setup();
    renderFields(only("team"));

    await user.click(screen.getByTestId("combobox-team-picker-trigger"));
    const popover = await screen.findByTestId("combobox-team-picker-popover");
    await user.click(
      within(popover).getByRole("button", { name: /insert \{\{trigger\.teamName\}\}/i }),
    );

    expect(draftValues().team).toBe("{{trigger.teamName}}");
    act(() => {
      commitNodeConfigDraft(NODE_ID);
    });
    expect(savedConfig().team).toBe("{{trigger.teamName}}");
  });

  it("required-empty is still rejected — the flag does not weaken validation", () => {
    renderFields(only("team"));
    expect(createIssueMeta.fields.find((f) => f.name === "team")!.required).toBe(true);
    expect(draftValues().team).toBeUndefined();
    expect(() => CreateIssueConfigSchema.parse({ title: "T" })).toThrow();
    expect(() => CreateIssueConfigSchema.parse({ title: "T", team: "" })).toThrow();
  });
});

describe("linear:create_issue.labels — string-array picker", () => {
  it("still renders the resolver's options", async () => {
    const user = userEvent.setup();
    renderFields(only("labels"));
    await user.click(screen.getByTestId("string-array-labels-add"));
    expect(await screen.findByText("Bug")).toBeInTheDocument();
  });

  it("accepts a typed label NAME and stores a real string array", async () => {
    const user = userEvent.setup();
    renderFields(only("labels"));
    await user.click(screen.getByTestId("string-array-labels-add"));
    // Linear: "Label names or IDs as a JSON array of strings".
    await user.type(await screen.findByPlaceholderText(/search/i), "Urgent");
    await user.click(await screen.findByTestId("string-array-manual-entry"));

    expect(draftValues().labels).toEqual(["Urgent"]);
    act(() => {
      commitNodeConfigDraft(NODE_ID);
    });
    expect(savedConfig().labels).toEqual(["Urgent"]);
    expect(() =>
      CreateIssueConfigSchema.parse({ title: "T", team: "Eng", labels: ["Urgent"] }),
    ).not.toThrow();
  });

  it("a picked option and a typed name coexist as separate chips", async () => {
    const user = userEvent.setup();
    renderFields(only("labels"));

    // The popover deliberately stays open across adds, so both go in one visit —
    // which is how a user actually applies several labels.
    await user.click(screen.getByTestId("string-array-labels-add"));
    await user.click(await screen.findByText("Bug"));
    await user.type(await screen.findByPlaceholderText(/search/i), "Urgent");
    await user.click(await screen.findByTestId("string-array-manual-entry"));

    expect(draftValues().labels).toEqual(["LBL_BUG", "Urgent"]);
    expect(
      within(screen.getByTestId("field-labels-chips")).getAllByRole("button", {
        name: /remove/i,
      }),
    ).toHaveLength(2);
  });
});

/**
 * The point of doing this in the compiler rather than by hand: regeneration must
 * not silently undo it. `mcp-generated.test.ts` already proves the committed
 * artifacts are byte-identical to a fresh compile; this pins the specific flag
 * so a compiler change that dropped it would fail here with a readable reason.
 */
describe("the capability survives regeneration", () => {
  it("every Linear picker field carries allowManualEntry in the GENERATED meta", () => {
    const pickers = createIssueMeta.fields.filter((f) => f.optionsSource);
    expect(pickers.length).toBeGreaterThan(0);
    for (const f of pickers) {
      expect({ name: f.name, allowManualEntry: f.allowManualEntry }).toEqual({
        name: f.name,
        allowManualEntry: true,
      });
    }
  });
});
