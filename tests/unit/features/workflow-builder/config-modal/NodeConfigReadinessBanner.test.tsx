/**
 * SPREADSHEET-CONFIG-REDESIGN-1 — the readiness banner is a SHARED
 * config-shell feature: every node's Setup tab gets it, not just Excel.
 * Proven here through the real ConfigModalShell with a plain native
 * action (no spreadsheet anything): missing-count → ready → invalid
 * states, with product copy only.
 */

const mockGetConnectionReadiness = jest.fn();
jest.mock("@/lib/api/workflowConnectionReadiness", () => ({
  __esModule: true,
  getWorkflowConnectionReadiness: (...args: unknown[]) =>
    mockGetConnectionReadiness(...args),
}));

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

import { render, screen, waitFor } from "@testing-library/react";
import { ConfigModalShell } from "@/features/workflow-builder/config-modal/ConfigModalShell";
import { useGraphSlice } from "@/features/workflow-builder/state/graphSlice";
import { useConfigSlice } from "@/features/workflow-builder/state/configSlice";
import { __resetNativeActionsCacheForTests } from "@/features/workflow-builder/hooks/useNativeActions";
import { __resetNativeTriggersCacheForTests } from "@/features/workflow-builder/hooks/useNativeTriggers";
import { __resetProviderActionsCacheForTests } from "@/features/workflow-builder/hooks/useProviderActions";
import { __resetProviderTriggersCacheForTests } from "@/features/workflow-builder/hooks/useProviderTriggers";
import type { ActionMeta } from "@/contracts/actionMeta";

const httpRequestMeta: ActionMeta = {
  key: "native:http_request",
  provider: "native",
  type: "http_request",
  displayName: "HTTP Request",
  description: "Send an HTTP request.",
  category: "http",
  requiresIntegration: false,
  fields: [
    {
      name: "url",
      label: "URL",
      type: "text",
      required: true,
      placeholder: "https://api.example.com",
    },
    {
      name: "method",
      label: "Method",
      type: "select",
      required: true,
      options: [
        { value: "GET", label: "GET" },
        { value: "POST", label: "POST" },
      ],
    },
    {
      name: "timeoutSeconds",
      label: "Timeout",
      type: "number",
      required: false,
      defaultValue: 15,
      numeric: { min: 1, max: 30, integer: true, step: 1 },
    },
    {
      name: "bodyBlocks",
      label: "Request blocks",
      type: "json",
      required: false,
      advanced: true,
      jsonShape: "array",
    },
  ],
  outputs: [],
  producesFileRef: false,
  consumesFileRef: false,
  displayOrder: 10,
  isDestructive: false,
  requiresConfirmation: false,
  riskLevel: "low",
};

beforeEach(() => {
  mockListNativeActions.mockReset();
  mockListNativeActions.mockResolvedValue([httpRequestMeta]);
  mockListNativeTriggers.mockReset();
  mockListNativeTriggers.mockResolvedValue([]);
  mockListProviderActions.mockReset();
  mockListProviderActions.mockResolvedValue([]);
  mockListProviderTriggers.mockReset();
  mockListProviderTriggers.mockResolvedValue([]);
  mockGetConnectionReadiness.mockReset();
  __resetNativeActionsCacheForTests();
  __resetNativeTriggersCacheForTests();
  __resetProviderActionsCacheForTests();
  __resetProviderTriggersCacheForTests();
  useGraphSlice.getState().reset();
  useConfigSlice.getState().reset();
});

function bootWithNativeAction(): { nodeId: string } {
  useGraphSlice.getState().hydrate("wf-1", { nodes: [], edges: [] });
  useGraphSlice.getState().addTrigger({ provider: "slack" });
  const node = useGraphSlice.getState().addActionFromMeta(httpRequestMeta);
  useConfigSlice
    .getState()
    .openNode({ nodeId: node.id, initialValues: node.config });
  return { nodeId: node.id };
}

async function banner(): Promise<HTMLElement> {
  await waitFor(() =>
    expect(screen.getByTestId("config-readiness-banner")).toBeInTheDocument(),
  );
  return screen.getByTestId("config-readiness-banner");
}

describe("NodeConfigReadinessBanner — shared across ALL node config menus", () => {
  it("renders on a plain native action (non-Excel) with the missing-required count; defaulted fields never count", async () => {
    bootWithNativeAction();
    render(<ConfigModalShell />);
    const el = await banner();
    // url + method missing; timeoutSeconds has a metadata default.
    expect(el.getAttribute("data-readiness-status")).toBe("incomplete");
    expect(el.textContent).toContain("2 things left to fill in");
    expect(el.textContent).toContain("Fill in URL");
    expect(el.textContent).toContain("Fill in Method");
    expect(el.textContent).not.toContain("Timeout");
  });

  it("drops to 'One thing left to fill in', then 'Ready to run' as required fields fill", async () => {
    const { nodeId } = bootWithNativeAction();
    render(<ConfigModalShell />);
    await banner();
    useConfigSlice.getState().updateField({ nodeId, name: "url", value: "https://x.dev" });
    await waitFor(() =>
      expect(
        screen.getByTestId("config-readiness-banner").textContent,
      ).toContain("One thing left to fill in"),
    );
    useConfigSlice.getState().updateField({ nodeId, name: "method", value: "GET" });
    await waitFor(() => {
      const el = screen.getByTestId("config-readiness-banner");
      expect(el.getAttribute("data-readiness-status")).toBe("ready");
      expect(el.textContent).toContain("Ready to run");
    });
  });

  it("an invalid advanced JSON draft flips the banner to 'Fix one field before saving' (matches the Save gate)", async () => {
    const { nodeId } = bootWithNativeAction();
    render(<ConfigModalShell />);
    await banner();
    useConfigSlice.getState().updateField({ nodeId, name: "url", value: "https://x.dev" });
    useConfigSlice.getState().updateField({ nodeId, name: "method", value: "GET" });
    // Simulate JsonField keeping an unparseable draft string.
    useConfigSlice
      .getState()
      .updateField({ nodeId, name: "bodyBlocks", value: "{not valid" });
    await waitFor(() => {
      const el = screen.getByTestId("config-readiness-banner");
      expect(el.getAttribute("data-readiness-status")).toBe("invalid");
      expect(el.textContent).toContain("Fix one field before saving");
    });
    // The banner agrees with the existing Save gate.
    expect(screen.getByTestId("config-modal-save-button")).toBeDisabled();
  });

  it("banner copy never exposes schema keys, renderer names, or implementation words", async () => {
    bootWithNativeAction();
    render(<ConfigModalShell />);
    const el = await banner();
    expect(el.textContent).not.toMatch(
      /timeoutSeconds|bodyBlocks|json|zod|schema|renderer|string-array|keyvalue|combobox/i,
    );
  });

  it("native nodes are connectionless: no connection check is made and no connect copy renders (CONNECTION-AWARE-READINESS-1)", async () => {
    const { nodeId } = bootWithNativeAction();
    render(<ConfigModalShell />);
    const el = await banner();
    expect(el.textContent).not.toMatch(/connect|connection/i);
    useConfigSlice.getState().updateField({ nodeId, name: "url", value: "https://x.dev" });
    useConfigSlice.getState().updateField({ nodeId, name: "method", value: "GET" });
    await waitFor(() => {
      expect(
        screen.getByTestId("config-readiness-banner").textContent,
      ).toContain("Ready to run");
    });
    // Field-only readiness: the server connection check is never called.
    expect(mockGetConnectionReadiness).not.toHaveBeenCalled();
  });
});
