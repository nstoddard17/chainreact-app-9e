/**
 * CONNECTION-AWARE-READINESS-1: the readiness banner folds in the
 * SERVER-resolved app-connection state for provider-backed nodes,
 * through the real ConfigModalShell + useConnectionReadiness hook with
 * the typed client mocked at the lib/api boundary (the same sanitized
 * DTO the diagnostics brain emits).
 *
 * Account scoping note: the DTO is produced by
 * `POST /api/workflows/[id]/connection-readiness`, which resolves the
 * WORKFLOW's account server-side (member gate + 404 no-leak; pinned by
 * tests/unit/app/api/workflows/connection-readiness-route.test.ts and
 * tests/unit/services/diagnostics/integrationConnection.test.ts). The
 * client never chooses the account. Here we prove the client half: a
 * non-OK access verdict (e.g. a workflow another account owns) can
 * never render "Ready to run".
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

const mockFetchOptionsSource = jest.fn();
jest.mock("@/lib/api/options", () => ({
  __esModule: true,
  fetchOptionsSource: (...args: unknown[]) => mockFetchOptionsSource(...args),
}));

const mockGetConnectionReadiness = jest.fn();
jest.mock("@/lib/api/workflowConnectionReadiness", () => ({
  __esModule: true,
  getWorkflowConnectionReadiness: (...args: unknown[]) =>
    mockGetConnectionReadiness(...args),
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
import type {
  WorkflowConnectionReadinessDTO,
  WorkflowProviderConnectionEntryDTO,
} from "@/contracts/workflowConnectionReadiness";

const slackMeta: ActionMeta = {
  key: "slack:send_channel_message",
  provider: "slack",
  type: "send_channel_message",
  displayName: "Send Channel Message",
  description: "Post a message to a Slack channel.",
  category: "messaging",
  requiresIntegration: true,
  fields: [
    {
      name: "channelId",
      label: "Channel",
      type: "combobox",
      required: true,
      optionsSource: "slack:channels",
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

function dto(
  entry: Partial<WorkflowProviderConnectionEntryDTO> & {
    status: string;
    ready: boolean;
  },
): WorkflowConnectionReadinessDTO {
  return {
    workflowId: "wf-1",
    access: "OK",
    allRequiredConnected: entry.ready,
    providers: [
      {
        provider: "slack",
        name: "Slack",
        credentialClass: "account",
        nodeIds: ["n-slack"],
        nodeCount: 1,
        providerEnabled: true,
        refreshable: true,
        tokenExpired: false,
        scopesSatisfied: true,
        missingScopeCount: 0,
        reconnectNeeded: false,
        canReconnect: true,
        ...entry,
      },
    ],
  };
}

beforeEach(() => {
  mockListNativeActions.mockReset();
  mockListNativeActions.mockResolvedValue([]);
  mockListNativeTriggers.mockReset();
  mockListNativeTriggers.mockResolvedValue([]);
  mockListProviderActions.mockReset();
  mockListProviderActions.mockImplementation(async (p: string) =>
    p === "slack" ? [slackMeta] : [],
  );
  mockListProviderTriggers.mockReset();
  mockListProviderTriggers.mockResolvedValue([]);
  mockFetchOptionsSource.mockReset();
  mockFetchOptionsSource.mockResolvedValue({
    ok: true,
    source: "slack:channels",
    items: [],
    hasMore: false,
  });
  mockGetConnectionReadiness.mockReset();
  __resetNativeActionsCacheForTests();
  __resetNativeTriggersCacheForTests();
  __resetProviderActionsCacheForTests();
  __resetProviderTriggersCacheForTests();
  useGraphSlice.getState().reset();
  useConfigSlice.getState().reset();
});

function bootWithSlackAction(): { nodeId: string } {
  useGraphSlice.getState().hydrate("wf-1", { nodes: [], edges: [] });
  useGraphSlice.getState().addTrigger({ provider: "native" });
  const node = useGraphSlice.getState().addActionFromMeta(slackMeta);
  useConfigSlice
    .getState()
    .openNode({ nodeId: node.id, initialValues: node.config });
  return { nodeId: node.id };
}

function fillChannel(nodeId: string): void {
  useConfigSlice
    .getState()
    .updateField({ nodeId, name: "channelId", value: "C123" });
}

async function expectBannerContains(text: string): Promise<void> {
  await waitFor(() => {
    const el = screen.getByTestId("config-readiness-banner");
    expect(el.textContent).toContain(text);
  });
}

function bannerText(): string {
  return screen.getByTestId("config-readiness-banner").textContent ?? "";
}

describe("connection-aware readiness banner (provider-backed nodes)", () => {
  it("missing connection: friendly Connect copy + Apps CTA; never Ready to run even with valid fields", async () => {
    mockGetConnectionReadiness.mockResolvedValue(
      dto({ status: "DISCONNECTED", ready: false }),
    );
    const { nodeId } = bootWithSlackAction();
    fillChannel(nodeId);
    render(<ConfigModalShell />);
    await expectBannerContains("Connect Slack to run this step");
    const banner = screen.getByTestId("config-readiness-banner");
    expect(banner.getAttribute("data-readiness-status")).toBe("incomplete");
    expect(banner.textContent).not.toContain("Ready to run");
    const cta = screen.getByTestId("config-readiness-banner-cta");
    expect(cta.textContent).toBe("Connect Slack");
    expect(cta.getAttribute("href")).toBe("/apps");
  });

  it("unusable connection: friendly Reconnect copy, no internals", async () => {
    mockGetConnectionReadiness.mockResolvedValue(
      dto({ status: "RECONNECT_REQUIRED", ready: false, reconnectNeeded: true }),
    );
    const { nodeId } = bootWithSlackAction();
    fillChannel(nodeId);
    render(<ConfigModalShell />);
    await expectBannerContains("Reconnect Slack to run this step");
    expect(
      screen.getByTestId("config-readiness-banner-cta").textContent,
    ).toBe("Reconnect Slack");
  });

  it("connected + missing required field: missing-field readiness, not a connection warning", async () => {
    mockGetConnectionReadiness.mockResolvedValue(
      dto({ status: "CONNECTED", ready: true }),
    );
    bootWithSlackAction();
    render(<ConfigModalShell />);
    await expectBannerContains("One thing left to fill in");
    const text = bannerText();
    expect(text).toContain("Slack is connected");
    expect(text).not.toContain("Connect Slack to run this step");
  });

  it("connected + valid fields: Ready to run", async () => {
    mockGetConnectionReadiness.mockResolvedValue(
      dto({ status: "CONNECTED", ready: true }),
    );
    const { nodeId } = bootWithSlackAction();
    fillChannel(nodeId);
    render(<ConfigModalShell />);
    await expectBannerContains("Ready to run");
    expect(
      screen
        .getByTestId("config-readiness-banner")
        .getAttribute("data-readiness-status"),
    ).toBe("ready");
  });

  it("while the check is in flight: 'Checking connection' and never Ready", async () => {
    mockGetConnectionReadiness.mockReturnValue(new Promise(() => {}));
    const { nodeId } = bootWithSlackAction();
    fillChannel(nodeId);
    render(<ConfigModalShell />);
    await expectBannerContains("Checking connection");
    expect(bannerText()).not.toContain("Ready to run");
  });

  it("failed check: honest 'Couldn't check' copy and never Ready", async () => {
    mockGetConnectionReadiness.mockRejectedValue(new Error("boom"));
    const { nodeId } = bootWithSlackAction();
    fillChannel(nodeId);
    render(<ConfigModalShell />);
    await expectBannerContains("Couldn't check the app connection");
    expect(bannerText()).not.toContain("Ready to run");
  });

  it("a non-OK access verdict (workflow not visible to the caller's account) can never satisfy readiness", async () => {
    mockGetConnectionReadiness.mockResolvedValue({
      workflowId: "wf-1",
      access: "NOT_FOUND",
    } satisfies WorkflowConnectionReadinessDTO);
    const { nodeId } = bootWithSlackAction();
    fillChannel(nodeId);
    render(<ConfigModalShell />);
    await expectBannerContains("Couldn't check the app connection");
    expect(bannerText()).not.toContain("Ready to run");
  });

  it("banner copy never exposes token / health / internal error strings in any connection state", async () => {
    const states = [
      dto({ status: "DISCONNECTED", ready: false }),
      dto({ status: "RECONNECT_REQUIRED", ready: false, reconnectNeeded: true }),
      dto({ status: "TOKEN_EXPIRED", ready: false, tokenExpired: true }),
      dto({ status: "PROVIDER_DISABLED", ready: false, providerEnabled: false }),
    ];
    for (const response of states) {
      mockGetConnectionReadiness.mockReset();
      mockGetConnectionReadiness.mockResolvedValue(response);
      const { nodeId } = bootWithSlackAction();
      fillChannel(nodeId);
      const view = render(<ConfigModalShell />);
      await waitFor(() => {
        const el = screen.getByTestId("config-readiness-banner");
        expect(el.getAttribute("data-readiness-status")).toBe("incomplete");
      });
      const text = bannerText().toLowerCase();
      expect(text).not.toMatch(
        /token|oauth|health|integration row|scope|schema|zod|http|expired|capability|disconnected_at/,
      );
      view.unmount();
      useGraphSlice.getState().reset();
      useConfigSlice.getState().reset();
    }
  });
});

