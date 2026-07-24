/**
 * DOC-CONFIG-SYNC-1 — the Document sentence, the inline Guided Stop, and the
 * right-side Node configuration panel as THREE VIEWS OF ONE FIELD.
 *
 * These run the real builder: real graphSlice/configSlice, the real field
 * renderers on both surfaces, the real commit path. Only the external
 * provider-resource calls (`fetchOptionsSource`) and the workflow-save API are
 * mocked, per docs/rules/testing-strategy.md.
 *
 * What is proven here:
 *   - opening a Document field reveals + rings THAT field in the panel, on the
 *     right tab, scoped to the right STEP (never a same-named field elsewhere);
 *   - values are one shared pending draft — inline → panel and panel → inline
 *     are immediate, with no second copy and no second request;
 *   - Cancel restores both surfaces; Done runs the ONE canonical commit path,
 *     exactly once, with nothing persisted;
 *   - a dependent field guides to its prerequisite and advances on its own;
 *   - the highlight is a guidance cue only: it never steals keyboard focus,
 *     never clears the user's step selection, and never animates a scroll under
 *     `prefers-reduced-motion`.
 */
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const mockUpdateWorkflow = jest.fn();
jest.mock("@/lib/api/workflows", () => {
  const actual = jest.requireActual("@/lib/api/workflows");
  return {
    ...actual,
    updateWorkflow: (...args: unknown[]) => mockUpdateWorkflow(...args),
  };
});

// The ONE canonical local-commit path. Wrapped (not replaced) so we can count
// how many times a Done / Save actually commits — a second save path or a
// double-commit would show up here immediately.
const mockCommitDraft = jest.fn();
jest.mock("@/features/workflow-builder/state/commitConfigDraft", () => {
  const actual = jest.requireActual("@/features/workflow-builder/state/commitConfigDraft");
  return {
    __esModule: true,
    ...actual,
    commitNodeConfigDraft: (nodeId: string) => {
      mockCommitDraft(nodeId);
      return actual.commitNodeConfigDraft(nodeId);
    },
  };
});

jest.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: jest.fn(), push: jest.fn() }),
}));

jest.mock("@xyflow/react", () => {
  const actual = jest.requireActual("@xyflow/react");
  return {
    ...actual,
    EdgeLabelRenderer: ({ children }: { children: unknown }) => children,
  };
});

const mockFetchOptionsSource = jest.fn();
jest.mock("@/lib/api/options", () => ({
  __esModule: true,
  fetchOptionsSource: (...args: unknown[]) => mockFetchOptionsSource(...args),
  OptionsApiError: class OptionsApiError extends Error {
    code = "UNKNOWN";
    status = 500;
  },
}));

const slackSendMessage = {
  key: "slack:send_channel_message",
  provider: "slack",
  type: "send_channel_message",
  displayName: "Send Channel Message",
  description: "Post a message to a Slack channel.",
  category: "messaging",
  requiresIntegration: true,
  displayOrder: 10,
  fields: [
    {
      name: "channel",
      label: "Channel",
      type: "combobox",
      required: true,
      optionsSource: "slack:channels",
    },
    { name: "text", label: "Message", type: "textarea", required: true },
    {
      // An ADVANCED field with a value, so a chip exists for it and opening that
      // chip must move the panel to the Advanced tab.
      name: "threadTs",
      label: "Thread",
      type: "text",
      required: false,
      advanced: true,
    },
  ],
  outputs: [],
};

// A provider-agnostic parent → child chain (`property` needs `account`). This is
// the shape shared by account→property, team→channel, workbook→worksheet, …;
// nothing in the Document knows what these fields mean.
const analyticsRunReport = {
  key: "google_analytics:run_report",
  provider: "google_analytics",
  type: "run_report",
  displayName: "Run Report",
  description: "Fetch a report.",
  category: "analytics",
  requiresIntegration: true,
  displayOrder: 20,
  fields: [
    {
      name: "account",
      label: "Account",
      type: "combobox",
      required: true,
      optionsSource: "analytics:accounts",
    },
    {
      name: "property",
      label: "Property",
      type: "combobox",
      required: true,
      optionsSource: "analytics:properties",
      dependsOn: "account",
    },
  ],
  outputs: [],
};

jest.mock("@/lib/api/discovery", () => ({
  __esModule: true,
  listNativeActions: async () => [],
  listNativeTriggers: async () => [],
  listAiActions: async () => [],
  listProviderActions: async (provider: string) => {
    if (provider === "slack") return [slackSendMessage];
    if (provider === "google_analytics") return [analyticsRunReport];
    return [];
  },
  listProviderTriggers: async () => [],
  DiscoveryApiError: class DiscoveryApiError extends Error {
    code = "UNKNOWN";
    status = 500;
  },
}));

import { WorkflowBuilder } from "@/features/workflow-builder/WorkflowBuilder";
import { useGraphSlice } from "@/features/workflow-builder/state/graphSlice";
import { useConfigSlice } from "@/features/workflow-builder/state/configSlice";
import { useRunSlice } from "@/features/workflow-builder/state/runSlice";
import { planGuidedStop } from "@/features/workflow-builder/document/guidedStopModel";
import { __resetNativeActionsCacheForTests } from "@/features/workflow-builder/hooks/useNativeActions";
import { __resetNativeTriggersCacheForTests } from "@/features/workflow-builder/hooks/useNativeTriggers";
import { __resetProviderActionsCacheForTests } from "@/features/workflow-builder/hooks/useProviderActions";
import { __resetProviderTriggersCacheForTests } from "@/features/workflow-builder/hooks/useProviderTriggers";
import { __BUILDER_VIEW_PREF_BASE_KEY__ } from "@/features/workflow-builder/document/documentViewPref";
import { pickComboboxOption } from "@/tests/integration/features/workflow-builder/helpers/comboboxField";
import type { FieldMeta } from "@/contracts/actionMeta";
import type { WorkflowDetail } from "@/contracts/workflow";
import type { RequiredFieldsByType } from "@/core/workflows/requiredFields";
import type { NodeSummaryFieldsByType } from "@/core/workflows/nodeSummaryFields";

const definition = {
  nodes: [
    {
      id: "t",
      kind: "trigger" as const,
      provider: "hubspot",
      type: "new_contact",
      config: {},
      position: { x: 10, y: 20 },
    },
    {
      id: "a",
      kind: "action" as const,
      provider: "slack",
      type: "send_channel_message",
      config: { text: "Hello team", threadTs: "1700.1" },
      position: { x: 30, y: 140 },
    },
    {
      // Step "b" carries a field with the SAME name (`text`) as step "a" — the
      // identity test's whole point.
      id: "b",
      kind: "action" as const,
      provider: "slack",
      type: "send_channel_message",
      config: { text: "Second message" },
      position: { x: 30, y: 260 },
    },
    {
      id: "g",
      kind: "action" as const,
      provider: "google_analytics",
      type: "run_report",
      config: {},
      position: { x: 30, y: 380 },
    },
  ],
  edges: [
    { id: "e1", from: "t", to: "a" },
    { id: "e2", from: "a", to: "b" },
    { id: "e3", from: "b", to: "g" },
  ],
};

const workflow: WorkflowDetail = {
  id: "wf-doc-config-sync",
  name: "Doc config sync",
  state: "draft",
  disabledReason: null,
  disabledContext: null,
  activeRevisionId: null,
  draftDefinition: definition,
  deletedAt: null,
  createdAt: "2026-07-01T00:00:00Z",
  updatedAt: "2026-07-01T00:00:00Z",
};

const requiredFieldsByType: RequiredFieldsByType = {
  "hubspot:new_contact": { displayName: "New Contact", requiredFields: [] },
  "slack:send_channel_message": {
    displayName: "Send Channel Message",
    requiredFields: [
      { name: "channel", label: "Channel" },
      { name: "text", label: "Message" },
    ],
  },
  "google_analytics:run_report": {
    displayName: "Run Report",
    requiredFields: [
      { name: "account", label: "Account" },
      { name: "property", label: "Property" },
    ],
  },
};

const summaryFieldsByType: NodeSummaryFieldsByType = {
  "hubspot:new_contact": { displayName: "New Contact", fields: [] },
  "slack:send_channel_message": {
    displayName: "Send Channel Message",
    fields: [
      {
        name: "channel",
        label: "Channel",
        type: "combobox",
        required: true,
        optionsSource: "slack:channels",
      },
      { name: "text", label: "Message", type: "textarea", required: true },
      { name: "threadTs", label: "Thread", type: "text", required: false, advanced: true },
    ],
  },
  "google_analytics:run_report": {
    displayName: "Run Report",
    fields: [
      {
        name: "account",
        label: "Account",
        type: "combobox",
        required: true,
        optionsSource: "analytics:accounts",
      },
      {
        name: "property",
        label: "Property",
        type: "combobox",
        required: true,
        optionsSource: "analytics:properties",
        dependsOn: "account",
      },
    ],
  },
};

const providers = [
  { id: "hubspot", displayName: "HubSpot" },
  { id: "slack", displayName: "Slack" },
  { id: "google_analytics", displayName: "Google Analytics" },
];

function renderInDocument(overrideWorkflow: WorkflowDetail = workflow) {
  window.localStorage.setItem(__BUILDER_VIEW_PREF_BASE_KEY__, "document");
  return render(
    <WorkflowBuilder
      workflow={overrideWorkflow}
      triggerProviders={providers}
      actionProviders={providers}
      requiredFieldsByType={requiredFieldsByType}
      summaryFieldsByType={summaryFieldsByType}
      documentBuilderEnabled
    />,
  );
}

/** The field container the panel is currently calling out, if any. */
function highlightedFieldName(): string | null {
  const el = document.querySelector("[data-field-highlighted='true']");
  return el?.getAttribute("data-field-name") ?? null;
}

/** Every highlighted container in the whole tree (must never exceed one). */
function highlightedCount(): number {
  return document.querySelectorAll("[data-field-highlighted='true']").length;
}

/** The panel's copy of a field's control (the drawer, not the inline editor). */
function panelField(fieldName: string): HTMLElement {
  const drawer = screen.getByTestId("builder-right-drawer");
  const el = drawer.querySelector(`[data-field-name="${fieldName}"]`);
  if (!el) throw new Error(`panel field "${fieldName}" is not rendered`);
  return el as HTMLElement;
}

beforeEach(() => {
  mockUpdateWorkflow.mockReset();
  mockUpdateWorkflow.mockResolvedValue({ ...workflow, updatedAt: "2026-07-02T00:00:00Z" });
  mockCommitDraft.mockReset();
  mockFetchOptionsSource.mockReset();
  mockFetchOptionsSource.mockImplementation(async (source: string) => {
    const items =
      source === "analytics:accounts"
        ? [{ value: "acct-1", label: "ChainReact" }]
        : source === "analytics:properties"
          ? [{ value: "prop-1", label: "ChainReact Website" }]
          : [
              { value: "C1", label: "#general" },
              { value: "C2", label: "#sales" },
            ];
    return { ok: true, source, items, hasMore: false };
  });
  window.localStorage.clear();
  __resetNativeActionsCacheForTests();
  __resetNativeTriggersCacheForTests();
  __resetProviderActionsCacheForTests();
  __resetProviderTriggersCacheForTests();
  useGraphSlice.getState().reset();
  useConfigSlice.getState().reset();
  useRunSlice.getState().reset();
});

describe("DOC-CONFIG-SYNC-1 — revealing the matching configuration field", () => {
  it("opening a Document field opens the panel and rings THAT field", async () => {
    renderInDocument();
    fireEvent.click(screen.getByTestId("document-value-chip-a-Message"));

    await screen.findByTestId("document-guided-stop");
    const drawer = await screen.findByTestId("builder-right-drawer");

    // The panel is showing the same node, on the same shared draft…
    expect(useConfigSlice.getState().activeNodeId).toBe("a");
    await within(drawer).findByDisplayValue("Hello team");
    // …and exactly ONE field container carries the guidance highlight: `text`.
    await waitFor(() => expect(highlightedFieldName()).toBe("text"));
    expect(highlightedCount()).toBe(1);
    // The identity is (node, field) — not a bare key.
    expect(useConfigSlice.getState().focusFieldNodeId).toBe("a");
    expect(useConfigSlice.getState().focusFieldKey).toBe("text");
  });

  it("does not highlight the whole panel or any sibling field", async () => {
    renderInDocument();
    fireEvent.click(screen.getByTestId("document-value-chip-a-Message"));
    await screen.findByTestId("builder-right-drawer");
    await waitFor(() => expect(highlightedFieldName()).toBe("text"));

    expect(panelField("channel").getAttribute("data-field-highlighted")).toBeNull();
    expect(
      screen.getByTestId("node-inspector-panel").getAttribute("data-field-highlighted"),
    ).toBeNull();
  });

  it("switches to the Advanced tab when the opened field lives there", async () => {
    renderInDocument();
    fireEvent.click(screen.getByTestId("document-value-chip-a-Thread"));
    const drawer = await screen.findByTestId("builder-right-drawer");

    await waitFor(() =>
      expect(within(drawer).getByRole("tab", { name: /advanced/i })).toHaveAttribute(
        "aria-selected",
        "true",
      ),
    );
    await waitFor(() => expect(highlightedFieldName()).toBe("threadTs"));
    expect(within(drawer).getByTestId("schema-form-advanced-section")).toBeInTheDocument();
  });

  it("a same-named field on ANOTHER step is never the one highlighted", async () => {
    renderInDocument();
    // Step b also has a `text` field.
    fireEvent.click(screen.getByTestId("document-value-chip-b-Message"));
    const drawer = await screen.findByTestId("builder-right-drawer");
    await within(drawer).findByDisplayValue("Second message");
    await waitFor(() => expect(useConfigSlice.getState().focusFieldNodeId).toBe("b"));
    expect(highlightedCount()).toBe(1);

    // A focus request addressed at step "a" while step "b" is open paints
    // nothing: the node half of the identity does not match.
    act(() => {
      useConfigSlice.getState().focusField({ nodeId: "a", fieldKey: "text" });
    });
    await waitFor(() => expect(highlightedCount()).toBe(0));
  });

  it("announces the revealed field in words, without moving keyboard focus", async () => {
    renderInDocument();
    const chip = screen.getByTestId("document-value-chip-a-Message");
    chip.focus();
    fireEvent.click(chip);

    const stop = await screen.findByTestId("document-guided-stop");
    await screen.findByTestId("builder-right-drawer");
    await waitFor(() => expect(highlightedFieldName()).toBe("text"));

    expect(screen.getByTestId("config-focus-announcement").textContent).toContain("Message");
    // Focus stayed inside the inline editor — the panel only *shows*.
    expect(stop.contains(document.activeElement)).toBe(true);
    // The label is still visible text; the ring is never the only signal.
    expect(within(panelField("text")).getByText(/message/i)).toBeInTheDocument();
  });

  it("opening another field MOVES the highlight instead of adding one", async () => {
    renderInDocument();
    fireEvent.click(screen.getByTestId("document-value-chip-a-Message"));
    await screen.findByTestId("builder-right-drawer");
    await waitFor(() => expect(highlightedFieldName()).toBe("text"));

    fireEvent.click(screen.getByTestId("document-blank-chip-a-channel"));
    await waitFor(() => expect(highlightedFieldName()).toBe("channel"));
    expect(highlightedCount()).toBe(1);
  });

  it("uses a non-animated scroll under prefers-reduced-motion", async () => {
    const originalMatchMedia = window.matchMedia;
    window.matchMedia = ((query: string) => ({
      matches: query.includes("prefers-reduced-motion"),
      media: query,
      onchange: null,
      addEventListener: () => {},
      removeEventListener: () => {},
      addListener: () => {},
      removeListener: () => {},
      dispatchEvent: () => false,
    })) as unknown as typeof window.matchMedia;
    const scrollSpy = jest
      .spyOn(HTMLElement.prototype, "scrollIntoView")
      .mockImplementation(() => {});
    try {
      renderInDocument();
      fireEvent.click(screen.getByTestId("document-value-chip-a-Message"));
      await screen.findByTestId("builder-right-drawer");
      await waitFor(() => expect(highlightedFieldName()).toBe("text"));

      const behaviors = scrollSpy.mock.calls.map(
        (c) => (c[0] as { behavior?: string } | undefined)?.behavior,
      );
      expect(behaviors.length).toBeGreaterThan(0);
      expect(behaviors).not.toContain("smooth");
      expect(behaviors).toContain("auto");
    } finally {
      scrollSpy.mockRestore();
      window.matchMedia = originalMatchMedia;
    }
  });
});

describe("DOC-CONFIG-SYNC-1 — one pending value, two surfaces", () => {
  it("an inline edit shows in the right panel immediately (before Done)", async () => {
    renderInDocument();
    fireEvent.click(screen.getByTestId("document-value-chip-a-Message"));
    const stop = await screen.findByTestId("document-guided-stop");
    const drawer = await screen.findByTestId("builder-right-drawer");

    fireEvent.change(await within(stop).findByDisplayValue("Hello team"), {
      target: { value: "typed inline" },
    });

    await waitFor(() =>
      expect(within(panelField("text")).getByRole("textbox")).toHaveValue("typed inline"),
    );
    // No commit, no request — this is pending state only.
    expect(mockCommitDraft).not.toHaveBeenCalled();
    expect(mockUpdateWorkflow).not.toHaveBeenCalled();
    expect(useGraphSlice.getState().pendingNodes.find((n) => n.id === "a")?.config.text).toBe(
      "Hello team",
    );
    expect(drawer).toBeInTheDocument();
  });

  it("a right-panel edit shows in the inline editor immediately", async () => {
    renderInDocument();
    fireEvent.click(screen.getByTestId("document-value-chip-a-Message"));
    const stop = await screen.findByTestId("document-guided-stop");
    await screen.findByTestId("builder-right-drawer");

    fireEvent.change(within(panelField("text")).getByRole("textbox"), {
      target: { value: "typed in panel" },
    });

    await waitFor(() =>
      expect(within(stop).getByRole("textbox")).toHaveValue("typed in panel"),
    );
    // ONE value, not two copies that can diverge.
    expect(useConfigSlice.getState().drafts["a"]?.values.text).toBe("typed in panel");
    // The sentence follows the EXISTING pending-edit contract: the chip tracks
    // the canonical graph, and shows "editing" while the stop is open.
    expect(screen.getByTestId("document-value-chip-a-Message")).toHaveAttribute(
      "data-chip-state",
      "editing",
    );
  });

  it("Done commits once, through the canonical path, and both surfaces agree", async () => {
    renderInDocument();
    fireEvent.click(screen.getByTestId("document-value-chip-a-Message"));
    const stop = await screen.findByTestId("document-guided-stop");
    await screen.findByTestId("builder-right-drawer");

    fireEvent.change(await within(stop).findByDisplayValue("Hello team"), {
      target: { value: "final copy" },
    });
    fireEvent.click(screen.getByTestId("guided-stop-done"));

    await waitFor(() =>
      expect(useGraphSlice.getState().pendingNodes.find((n) => n.id === "a")?.config.text).toBe(
        "final copy",
      ),
    );
    // Exactly one commit; no second save path, no API request.
    expect(mockCommitDraft).toHaveBeenCalledTimes(1);
    expect(mockCommitDraft).toHaveBeenCalledWith("a");
    expect(mockUpdateWorkflow).not.toHaveBeenCalled();
    // Document sentence re-projected; the panel shows the same value.
    expect(screen.getByTestId("document-value-chip-a-Message").textContent).toContain(
      "final copy",
    );
    fireEvent.click(screen.getByTestId("document-configure-step-a"));
    const drawer = await screen.findByTestId("builder-right-drawer");
    await within(drawer).findByDisplayValue("final copy");
  });

  it("Cancel restores the saved value on BOTH surfaces — the panel never keeps the abandoned one", async () => {
    renderInDocument();
    fireEvent.click(screen.getByTestId("document-value-chip-a-Message"));
    const stop = await screen.findByTestId("document-guided-stop");
    await screen.findByTestId("builder-right-drawer");

    fireEvent.change(await within(stop).findByDisplayValue("Hello team"), {
      target: { value: "throwaway" },
    });
    await waitFor(() =>
      expect(within(panelField("text")).getByRole("textbox")).toHaveValue("throwaway"),
    );

    fireEvent.click(screen.getByTestId("guided-stop-cancel"));
    await waitFor(() => expect(screen.queryByTestId("document-guided-stop")).toBeNull());

    expect(useConfigSlice.getState().drafts["a"]?.values.text).toBe("Hello team");
    expect(useGraphSlice.getState().isDirty).toBe(false);
    expect(mockCommitDraft).not.toHaveBeenCalled();
    // Re-open the step: the panel shows the restored value, not "throwaway".
    fireEvent.click(screen.getByTestId("document-configure-step-a"));
    const drawer = await screen.findByTestId("builder-right-drawer");
    await within(drawer).findByDisplayValue("Hello team");
    expect(within(drawer).queryByDisplayValue("throwaway")).toBeNull();
  });

  it("closing the editor clears the highlight without clearing the step selection", async () => {
    renderInDocument();
    // Select step "a" through the Document's own selection model.
    fireEvent.click(screen.getByTestId("document-step-menu-a"));
    fireEvent.click(await screen.findByTestId("document-select-a"));
    await waitFor(() =>
      expect(document.querySelector("[data-document-selected='true']")).not.toBeNull(),
    );

    fireEvent.click(screen.getByTestId("document-value-chip-a-Message"));
    await screen.findByTestId("builder-right-drawer");
    await waitFor(() => expect(highlightedFieldName()).toBe("text"));

    fireEvent.click(screen.getByTestId("guided-stop-cancel"));
    await waitFor(() => expect(screen.queryByTestId("document-guided-stop")).toBeNull());

    expect(useConfigSlice.getState().focusFieldKey).toBeNull();
    expect(useConfigSlice.getState().focusFieldNodeId).toBeNull();
    // The user's selection is untouched — guidance is not selection.
    expect(document.querySelector("[data-document-selected='true']")).not.toBeNull();
  });
});

describe("DOC-CONFIG-SYNC-1 — dependent fields", () => {
  it("opening a child guides to its prerequisite, then advances on its own", async () => {
    const user = userEvent.setup();
    renderInDocument();

    // `property` needs `account`, which is empty.
    fireEvent.click(screen.getByTestId("document-blank-chip-g-property"));
    const stop = await screen.findByTestId("document-guided-stop");

    // The stop is still "about" property, but it DRAWS account — the real next
    // decision — and says why.
    expect(stop).toHaveAttribute("data-field-name", "property");
    expect(stop).toHaveAttribute("data-drawn-field-name", "account");
    const note = within(stop).getByTestId("guided-stop-prerequisite");
    expect(note).toHaveAttribute("data-requested-field", "property");
    expect(note.textContent).toMatch(/Account first/i);

    // The panel follows the prerequisite, not the clicked field.
    await screen.findByTestId("builder-right-drawer");
    await waitFor(() => expect(highlightedFieldName()).toBe("account"));

    // Answer it through the real resolver-backed picker, scoped to the inline
    // editor (the same field also exists in the panel).
    await pickComboboxOption(user, /account/i, "ChainReact", { container: stop });

    // Guidance advances to the originally-requested field, on both surfaces.
    await waitFor(() =>
      expect(screen.getByTestId("document-guided-stop")).toHaveAttribute(
        "data-drawn-field-name",
        "property",
      ),
    );
    expect(screen.queryByTestId("guided-stop-prerequisite")).toBeNull();
    await waitFor(() => expect(highlightedFieldName()).toBe("property"));
    expect(highlightedCount()).toBe(1);
    // The prerequisite's value is in the ONE shared draft.
    expect(useConfigSlice.getState().drafts["g"]?.values.account).toBe("acct-1");
  });

  it("a satisfied prerequisite opens the requested field directly", async () => {
    renderInDocument({
      ...workflow,
      draftDefinition: {
        ...definition,
        nodes: definition.nodes.map((n) =>
          n.id === "g" ? { ...n, config: { account: "acct-1" } } : n,
        ),
      },
    });

    fireEvent.click(screen.getByTestId("document-blank-chip-g-property"));
    const stop = await screen.findByTestId("document-guided-stop");
    expect(stop).toHaveAttribute("data-drawn-field-name", "property");
    expect(screen.queryByTestId("guided-stop-prerequisite")).toBeNull();
    await screen.findByTestId("builder-right-drawer");
    await waitFor(() => expect(highlightedFieldName()).toBe("property"));
  });
});

/**
 * The redirect rule itself is pure and provider-agnostic — it reads only
 * `dependsOn` + the current values, so account→property, team→channel,
 * workbook→worksheet and database→table all behave identically.
 */
describe("DOC-CONFIG-SYNC-1 — planGuidedStop prerequisite rule", () => {
  const fields: readonly FieldMeta[] = [
    { name: "base", label: "Base", type: "text", required: true },
    { name: "table", label: "Table", type: "text", required: true, dependsOn: "base" },
    { name: "column", label: "Column", type: "text", required: true, dependsOn: "table" },
    {
      name: "secretParent",
      label: "Token",
      type: "text",
      required: true,
      sensitivity: "secret",
    },
    {
      name: "needsSecret",
      label: "Needs token",
      type: "text",
      required: true,
      dependsOn: "secretParent",
    },
  ];

  it("redirects to the FIRST unanswered ancestor, one question at a time", () => {
    // Nothing filled: opening `column` asks for `base`.
    expect(planGuidedStop(fields, "column", {})).toMatchObject({
      kind: "prerequisite",
      field: { name: "base" },
      requested: { name: "column" },
    });
    // Base filled: it asks for `table`.
    expect(planGuidedStop(fields, "column", { base: "b1" })).toMatchObject({
      kind: "prerequisite",
      field: { name: "table" },
    });
    // Both filled: the requested field is drawn.
    expect(planGuidedStop(fields, "column", { base: "b1", table: "t1" })).toEqual({
      kind: "inline",
      field: fields[2],
    });
  });

  it("treats an empty string as unanswered, matching SchemaForm's parent rule", () => {
    expect(planGuidedStop(fields, "table", { base: "" })).toMatchObject({
      kind: "prerequisite",
      field: { name: "base" },
    });
  });

  it("does not redirect to a parent the Document can't honestly ask inline", () => {
    // A secret parent is never editable in prose, so the requested field is drawn
    // as-is and its renderer keeps its own "select parent first" hint.
    expect(planGuidedStop(fields, "needsSecret", {})).toEqual({
      kind: "inline",
      field: fields[4],
    });
  });

  it("terminates on a mis-authored dependsOn cycle instead of looping", () => {
    const cyclic: readonly FieldMeta[] = [
      { name: "x", label: "X", type: "text", required: true, dependsOn: "y" },
      { name: "y", label: "Y", type: "text", required: true, dependsOn: "x" },
    ];
    // The walk stops the moment it revisits a field: it asks for the one
    // unanswered parent it reached and does not recurse back around.
    expect(planGuidedStop(cyclic, "x", {})).toMatchObject({
      kind: "prerequisite",
      field: { name: "y" },
      requested: { name: "x" },
    });
  });

  it("leaves every pre-existing inspector-handoff outcome unchanged", () => {
    expect(planGuidedStop(fields, "nope", {})).toEqual({
      kind: "inspector",
      reason: "unknown_field",
    });
    expect(planGuidedStop(fields, "secretParent", {})).toEqual({
      kind: "inspector",
      reason: "sensitive_field",
    });
  });
});
