/**
 * 5.DUAL-BUILDER-1 CS-7B — accessibility of the polished Document surfaces.
 *
 * Practical DOM/keyboard assertions (no new axe dependency): landmark + heading
 * hierarchy, real buttons, non-modal Guided Stop vs. modal map sheet, status
 * conveyed as TEXT (not colour alone), and keyboard focus/return.
 */
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";

jest.mock("next/navigation", () => ({ useRouter: () => ({ refresh: jest.fn(), push: jest.fn() }) }));
jest.mock("@xyflow/react", () => {
  const actual = jest.requireActual("@xyflow/react");
  return { ...actual, EdgeLabelRenderer: ({ children }: { children: unknown }) => children };
});
const mockFetchOptionsSource = jest.fn();
jest.mock("@/lib/api/options", () => ({
  __esModule: true,
  fetchOptionsSource: (...a: unknown[]) => mockFetchOptionsSource(...a),
  OptionsApiError: class extends Error {
    code = "UNKNOWN";
    status = 500;
  },
}));
const slack = {
  key: "slack:send_channel_message",
  provider: "slack",
  type: "send_channel_message",
  displayName: "Send Channel Message",
  description: "Post a message.",
  category: "messaging",
  requiresIntegration: true,
  displayOrder: 10,
  fields: [
    { name: "channel", label: "Channel", type: "combobox", required: true, optionsSource: "slack:channels" },
    { name: "text", label: "Message", type: "textarea", required: true },
  ],
  outputs: [],
};
jest.mock("@/lib/api/discovery", () => ({
  __esModule: true,
  listNativeActions: async () => [],
  listNativeTriggers: async () => [],
  listProviderActions: async (p: string) => (p === "slack" ? [slack] : []),
  listProviderTriggers: async () => [],
  DiscoveryApiError: class extends Error {
    code = "UNKNOWN";
    status = 500;
  },
}));

import { WorkflowBuilder } from "@/features/workflow-builder/WorkflowBuilder";
import { useGraphSlice } from "@/features/workflow-builder/state/graphSlice";
import { useConfigSlice } from "@/features/workflow-builder/state/configSlice";
import { useRunSlice } from "@/features/workflow-builder/state/runSlice";
import { __resetNativeActionsCacheForTests } from "@/features/workflow-builder/hooks/useNativeActions";
import { __resetNativeTriggersCacheForTests } from "@/features/workflow-builder/hooks/useNativeTriggers";
import { __resetProviderActionsCacheForTests } from "@/features/workflow-builder/hooks/useProviderActions";
import { __resetProviderTriggersCacheForTests } from "@/features/workflow-builder/hooks/useProviderTriggers";
import { __BUILDER_VIEW_PREF_BASE_KEY__ } from "@/features/workflow-builder/document/documentViewPref";
import type { WorkflowDetail } from "@/contracts/workflow";
import type { RequiredFieldsByType } from "@/core/workflows/requiredFields";
import type { NodeSummaryFieldsByType } from "@/core/workflows/nodeSummaryFields";

const definition = {
  nodes: [
    { id: "t", kind: "trigger" as const, provider: "hubspot", type: "new_contact", config: {}, position: { x: 0, y: 0 } },
    { id: "a", kind: "action" as const, provider: "slack", type: "send_channel_message", config: { text: "Hi" }, position: { x: 0, y: 120 } },
  ],
  edges: [{ id: "e1", from: "t", to: "a" }],
};
const workflow: WorkflowDetail = {
  id: "wf-a11y", name: "Route new leads", state: "draft", disabledReason: null, disabledContext: null,
  activeRevisionId: null, draftDefinition: definition, deletedAt: null,
  createdAt: "2026-07-01T00:00:00Z", updatedAt: "2026-07-01T00:00:00Z",
};
const requiredFieldsByType: RequiredFieldsByType = {
  "hubspot:new_contact": { displayName: "New Contact", requiredFields: [] },
  "slack:send_channel_message": { displayName: "Send Channel Message", requiredFields: [{ name: "channel", label: "Channel" }, { name: "text", label: "Message" }] },
};
const summaryFieldsByType: NodeSummaryFieldsByType = {
  "hubspot:new_contact": { displayName: "New Contact", fields: [] },
  "slack:send_channel_message": { displayName: "Send Channel Message", fields: [{ name: "channel", label: "Channel", type: "combobox", required: true, optionsSource: "slack:channels" }, { name: "text", label: "Message", type: "textarea", required: true }] },
};
const providers = [{ id: "hubspot", displayName: "HubSpot" }, { id: "slack", displayName: "Slack" }];

function renderDoc() {
  window.localStorage.setItem(__BUILDER_VIEW_PREF_BASE_KEY__, "document");
  return render(
    <WorkflowBuilder workflow={workflow} triggerProviders={providers} actionProviders={providers}
      requiredFieldsByType={requiredFieldsByType} summaryFieldsByType={summaryFieldsByType} documentBuilderEnabled />,
  );
}

beforeEach(() => {
  mockFetchOptionsSource.mockReset().mockResolvedValue({ options: [{ value: "C1", label: "#general" }] });
  window.localStorage.clear();
  __resetNativeActionsCacheForTests();
  __resetNativeTriggersCacheForTests();
  __resetProviderActionsCacheForTests();
  __resetProviderTriggersCacheForTests();
  useGraphSlice.getState().reset();
  useConfigSlice.getState().reset();
  useRunSlice.getState().reset();
});

describe("Document a11y — structure + status text", () => {
  it("exposes a labelled document region and a single h1 workflow title (heading hierarchy)", async () => {
    renderDoc();
    const view = await screen.findByTestId("document-view");
    expect(view).toHaveAttribute("aria-label", "Workflow document");
    const title = await screen.findByTestId("document-title");
    expect(title.tagName).toBe("H1");
    expect(title).toHaveTextContent("Route new leads");
  });

  it("announces setup status via role=status (not colour alone)", async () => {
    renderDoc();
    const banner = await screen.findByTestId("document-setup-banner");
    expect(banner).toHaveAttribute("role", "status");
    // The count is spelled out as text, not implied by a colour.
    expect(banner).toHaveTextContent(/detail/i);
  });

  it("renders value/blank chips as real <button> elements", async () => {
    renderDoc();
    await screen.findByTestId("document-view");
    const blank = screen.getByTestId("document-blank-chip-a-channel");
    expect(blank.tagName).toBe("BUTTON");
    expect(blank).toHaveAttribute("data-chip-state", "blank");
  });

  it("Guided Stop is a NON-modal group (not a false dialog)", async () => {
    renderDoc();
    await screen.findByTestId("document-view");
    fireEvent.click(screen.getByTestId("document-blank-chip-a-channel"));
    const stop = await screen.findByTestId("document-guided-stop");
    expect(stop).toHaveAttribute("role", "group");
    expect(stop).not.toHaveAttribute("aria-modal");
    expect(stop.getAttribute("role")).not.toBe("dialog");
    // Focus moved into the editor.
    await waitFor(() => expect(stop.contains(document.activeElement) || stop === document.activeElement).toBe(true));
  });

  it("Whole Workflow map is a modal dialog with an accessible name and readiness TEXT", async () => {
    renderDoc();
    await screen.findByTestId("document-view");
    fireEvent.click(screen.getByTestId("document-open-map-button"));
    const dialog = await screen.findByRole("dialog", { name: /whole workflow/i });
    // Readiness is textual ("ready"/"needs a detail"), not colour-only.
    expect(within(dialog).getAllByText(/needs a detail|ready/i).length).toBeGreaterThan(0);
    // Escape closes it (no keyboard trap).
    fireEvent.keyDown(dialog, { key: "Escape" });
    await waitFor(() => expect(screen.queryByRole("dialog", { name: /whole workflow/i })).toBeNull());
  });
});
