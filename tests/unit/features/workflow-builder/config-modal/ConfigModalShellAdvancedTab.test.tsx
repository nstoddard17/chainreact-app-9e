/**
 * CONFIG-UX-SETUP-ADVANCED-1 — the config shell's Advanced tab.
 *
 * User-behavior coverage:
 *   - config opens in Setup; Advanced tab exists ONLY when the node's meta
 *     declares advanced fields (never a dead tab).
 *   - switching Setup ⇄ Advanced never discards pending edits (one shared
 *     draft), and Setup edits don't erase unrelated Advanced values.
 *   - saved advanced values hydrate into the Advanced controls.
 *   - Save commits the runtime-compatible shape from both tabs.
 *   - the tab chip shows how many Advanced settings hold custom values.
 *   - optional Advanced fields never appear in the readiness checklist;
 *     a (rare) required Advanced field is labeled with its location.
 */

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

import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ConfigModalShell } from "@/features/workflow-builder/config-modal/ConfigModalShell";
import { useGraphSlice } from "@/features/workflow-builder/state/graphSlice";
import { useConfigSlice } from "@/features/workflow-builder/state/configSlice";
import { __resetNativeActionsCacheForTests } from "@/features/workflow-builder/hooks/useNativeActions";
import { __resetNativeTriggersCacheForTests } from "@/features/workflow-builder/hooks/useNativeTriggers";
import { __resetProviderActionsCacheForTests } from "@/features/workflow-builder/hooks/useProviderActions";
import { __resetProviderTriggersCacheForTests } from "@/features/workflow-builder/hooks/useProviderTriggers";
import type { ActionMeta } from "@/contracts/actionMeta";

/** Native action with a mix of setup + advanced fields. */
const advancedCapableMeta: ActionMeta = {
  key: "native:http_request",
  provider: "native",
  type: "http_request",
  displayName: "HTTP Request",
  description: "Send an HTTP request.",
  category: "http",
  requiresIntegration: false,
  fields: [
    { name: "url", label: "URL", type: "text", required: true },
    {
      name: "timeoutSeconds",
      label: "Timeout (seconds)",
      type: "number",
      required: false,
      advanced: true,
      defaultValue: 15,
      numeric: { min: 1, max: 30, integer: true, step: 1 },
    },
    {
      name: "traceHeader",
      label: "Trace header",
      type: "text",
      required: false,
      advanced: true,
    },
  ],
  outputs: [],
  producesFileRef: false,
  consumesFileRef: false,
  displayOrder: 10,
  isDestructive: false,
  requiresConfirmation: false,
  riskLevel: "low",
} as ActionMeta;

/** Native action with NO advanced fields → no Advanced tab. */
const plainMeta: ActionMeta = {
  ...advancedCapableMeta,
  key: "native:format_transformer",
  type: "format_transformer",
  displayName: "Format",
  fields: [{ name: "template", label: "Template", type: "textarea", required: true }],
} as ActionMeta;

/** Rare shape: a REQUIRED advanced field (no default). */
const requiredAdvancedMeta: ActionMeta = {
  ...advancedCapableMeta,
  key: "native:delay",
  type: "delay",
  displayName: "Delay",
  fields: [
    { name: "label", label: "Label", type: "text", required: false },
    {
      name: "durationSpec",
      label: "Duration spec",
      type: "text",
      required: true,
      advanced: true,
    },
  ],
} as ActionMeta;

beforeEach(() => {
  jest.clearAllMocks();
  __resetNativeActionsCacheForTests();
  __resetNativeTriggersCacheForTests();
  __resetProviderActionsCacheForTests();
  __resetProviderTriggersCacheForTests();
  mockListNativeActions.mockResolvedValue([
    advancedCapableMeta,
    plainMeta,
    requiredAdvancedMeta,
  ]);
  mockListNativeTriggers.mockResolvedValue([]);
  mockListProviderActions.mockResolvedValue([]);
  mockListProviderTriggers.mockResolvedValue([]);
  // reset() first — a dirty graph ignores a re-hydrate for the same workflow id.
  useGraphSlice.getState().reset();
  useGraphSlice.getState().hydrate("wf-1", { nodes: [], edges: [] });
  useConfigSlice.setState({ activeNodeId: null, drafts: {} });
});

function openNode(type: string, config: Record<string, unknown> = {}) {
  // graphSlice requires a trigger before actions can be appended.
  useGraphSlice.getState().addTrigger({ provider: "native", type: "manual.run" });
  const node = useGraphSlice.getState().addAction({ provider: "native", type });
  if (Object.keys(config).length > 0) {
    useGraphSlice.getState().updateNodeConfig(node.id, config);
  }
  const fresh = useGraphSlice.getState().pendingNodes.find((n) => n.id === node.id)!;
  useConfigSlice.getState().openNode({ nodeId: node.id, initialValues: fresh.config });
  return node;
}

async function tabs() {
  return within(await screen.findByTestId("config-node-tabs"));
}

describe("ConfigModalShell — Advanced tab presence", () => {
  it("opens in Setup and shows the Advanced tab when the meta has advanced fields", async () => {
    openNode("http_request");
    render(<ConfigModalShell />);
    const bar = await tabs();
    expect(bar.getByRole("tab", { name: /advanced/i })).toBeInTheDocument();
    // Setup is the active default: the form (URL) is visible, advanced is not.
    expect(await screen.findByLabelText("URL")).toBeInTheDocument();
    expect(screen.queryByLabelText("Timeout (seconds)")).not.toBeInTheDocument();
  });

  it("omits the Advanced tab entirely when the meta has no advanced fields", async () => {
    openNode("format_transformer");
    render(<ConfigModalShell />);
    await screen.findByLabelText("Template");
    const bar = within(screen.getByTestId("config-node-tabs"));
    expect(bar.queryByRole("tab", { name: /advanced/i })).not.toBeInTheDocument();
  });
});

describe("ConfigModalShell — shared pending draft across tabs", () => {
  it("keeps a pending Setup edit when visiting Advanced and back", async () => {
    const user = userEvent.setup();
    openNode("http_request");
    render(<ConfigModalShell />);
    await user.type(await screen.findByLabelText("URL"), "https://x.test");
    await user.click(screen.getByRole("tab", { name: /advanced/i }));
    expect(await screen.findByLabelText("Timeout (seconds)")).toBeInTheDocument();
    await user.click(screen.getByRole("tab", { name: /setup/i }));
    expect(await screen.findByLabelText("URL")).toHaveValue("https://x.test");
    // Still an unsaved draft — switching tabs never committed or discarded it.
    expect(screen.getByText("Unsaved changes")).toBeInTheDocument();
  });

  it("keeps a pending Advanced edit when returning to Setup, and a Setup edit doesn't erase it", async () => {
    const user = userEvent.setup();
    openNode("http_request");
    render(<ConfigModalShell />);
    await screen.findByLabelText("URL");
    await user.click(screen.getByRole("tab", { name: /advanced/i }));
    await user.type(await screen.findByLabelText("Trace header"), "trace-me");
    await user.click(screen.getByRole("tab", { name: /setup/i }));
    await user.type(await screen.findByLabelText("URL"), "https://x.test");
    await user.click(screen.getByRole("tab", { name: /advanced/i }));
    expect(await screen.findByLabelText("Trace header")).toHaveValue("trace-me");
  });

  it("hydrates existing saved advanced values into the Advanced controls", async () => {
    const user = userEvent.setup();
    openNode("http_request", {
      url: "https://saved.test",
      timeoutSeconds: 25,
      traceHeader: "abc",
    });
    render(<ConfigModalShell />);
    await screen.findByLabelText("URL");
    await user.click(screen.getByRole("tab", { name: /advanced/i }));
    expect(await screen.findByLabelText("Timeout (seconds)")).toHaveValue(25);
    expect(screen.getByLabelText("Trace header")).toHaveValue("abc");
    // Both are custom (25 ≠ default 15; traceHeader has no default).
    expect(screen.getAllByTestId("advanced-override-row")).toHaveLength(2);
  });

  it("Save commits both Setup and Advanced values in the runtime shape", async () => {
    const user = userEvent.setup();
    const node = openNode("http_request");
    render(<ConfigModalShell />);
    await user.type(await screen.findByLabelText("URL"), "https://x.test");
    await user.click(screen.getByRole("tab", { name: /advanced/i }));
    const timeout = await screen.findByLabelText("Timeout (seconds)");
    await user.clear(timeout);
    await user.type(timeout, "30");
    await user.click(screen.getByTestId("config-modal-save-button"));
    const saved = useGraphSlice.getState().pendingNodes.find((n) => n.id === node.id)!;
    expect(saved.config).toMatchObject({
      url: "https://x.test",
      timeoutSeconds: 30,
    });
    // Untouched advanced key is absent — not overwritten with a guess.
    expect(saved.config).not.toHaveProperty("traceHeader");
  });
});

describe("ConfigModalShell — Advanced tab chip + readiness interplay", () => {
  it("shows a count chip when advanced values differ from standard", async () => {
    openNode("http_request", { timeoutSeconds: 25 });
    render(<ConfigModalShell />);
    await screen.findByLabelText("URL");
    expect(screen.getByTestId("config-tab-advanced-badge")).toHaveTextContent("1");
  });

  it("shows no chip while advanced values equal their defaults", async () => {
    openNode("http_request", { timeoutSeconds: 15 });
    render(<ConfigModalShell />);
    await screen.findByLabelText("URL");
    expect(screen.queryByTestId("config-tab-advanced-badge")).not.toBeInTheDocument();
  });

  it("optional Advanced fields do not appear in the readiness checklist", async () => {
    openNode("http_request");
    render(<ConfigModalShell />);
    await screen.findByLabelText("URL");
    const banner = screen.getByTestId("config-readiness-banner");
    expect(banner).toHaveTextContent("One thing left to fill in");
    expect(banner).toHaveTextContent("Fill in URL");
    expect(banner).not.toHaveTextContent(/timeout/i);
    expect(banner).not.toHaveTextContent(/trace header/i);
  });

  it("a required Advanced field is listed with its location", async () => {
    openNode("delay");
    render(<ConfigModalShell />);
    await screen.findByLabelText("Label");
    const banner = screen.getByTestId("config-readiness-banner");
    expect(banner).toHaveTextContent("Fill in Duration spec (in the Advanced tab)");
  });
});
