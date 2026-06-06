/**
 * Tests for features/team/CredentialRequestsPanel (CS-7). The typed account
 * client is mocked. Covers: self-hiding empty state, request rendering with
 * clear "runs under your connection" copy, accept/decline calling the existing
 * routes + resolving the item, error rendering, and best-effort hide on fetch
 * failure.
 */
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { CredentialRequestsPanel } from "@/features/team/CredentialRequestsPanel";
import type { CredentialRequestView } from "@/lib/api/accounts";

const mockList = jest.fn();
const mockAccept = jest.fn();
const mockDecline = jest.fn();
jest.mock("@/lib/api/accounts", () => ({
  AccountApiError: class extends Error {},
  listCredentialRequests: (...a: unknown[]) => mockList(...a),
  acceptCredentialRequest: (...a: unknown[]) => mockAccept(...a),
  declineCredentialRequest: (...a: unknown[]) => mockDecline(...a),
}));

const reqA: CredentialRequestView = {
  workflowId: "wf-1",
  nodeId: "node-7",
  provider: "gmail",
  workflowName: "Send daily digest",
  requestedByLabel: "Dana Scully",
  requestedAt: "2026-06-06T00:00:00Z",
};

beforeEach(() => {
  mockList.mockReset();
  mockAccept.mockReset().mockResolvedValue(undefined);
  mockDecline.mockReset().mockResolvedValue(undefined);
});

describe("CredentialRequestsPanel", () => {
  it("renders nothing when there are no pending requests", async () => {
    mockList.mockResolvedValue([]);
    render(<CredentialRequestsPanel accountId="t1" />);
    await waitFor(() => expect(mockList).toHaveBeenCalledWith("t1"));
    expect(screen.queryByTestId("credential-requests")).toBeNull();
  });

  it("renders nothing (best-effort) when the fetch fails", async () => {
    mockList.mockRejectedValue(new Error("network"));
    render(<CredentialRequestsPanel accountId="t1" />);
    await waitFor(() => expect(mockList).toHaveBeenCalled());
    expect(screen.queryByTestId("credential-requests")).toBeNull();
  });

  it("renders a pending request with a clear runs-under-your-connection message + prettified provider", async () => {
    mockList.mockResolvedValue([reqA]);
    render(<CredentialRequestsPanel accountId="t1" />);
    const item = await screen.findByTestId("credential-request-wf-1:node-7");
    expect(item).toHaveTextContent(/Dana Scully/);
    expect(item).toHaveTextContent(/Gmail/); // prettified from "gmail"
    expect(item).toHaveTextContent(/Send daily digest/);
    expect(item).toHaveTextContent(/run under your connection/i);
    expect(item).toHaveTextContent(/Accepting lets that workflow step act using your connected Gmail account/i);
  });

  it("accept calls the accept route and removes the item", async () => {
    mockList.mockResolvedValue([reqA]);
    const user = userEvent.setup();
    render(<CredentialRequestsPanel accountId="t1" />);
    await screen.findByTestId("credential-request-wf-1:node-7");
    await user.click(screen.getByTestId("credential-request-accept-wf-1:node-7"));
    await waitFor(() => expect(mockAccept).toHaveBeenCalledWith("wf-1", "node-7"));
    expect(screen.queryByTestId("credential-request-wf-1:node-7")).toBeNull();
  });

  it("decline calls the decline route and removes the item", async () => {
    mockList.mockResolvedValue([reqA]);
    const user = userEvent.setup();
    render(<CredentialRequestsPanel accountId="t1" />);
    await screen.findByTestId("credential-request-wf-1:node-7");
    await user.click(screen.getByTestId("credential-request-decline-wf-1:node-7"));
    await waitFor(() => expect(mockDecline).toHaveBeenCalledWith("wf-1", "node-7"));
    expect(screen.queryByTestId("credential-request-wf-1:node-7")).toBeNull();
  });

  it("keeps the item and shows an error when accept fails", async () => {
    mockList.mockResolvedValue([reqA]);
    mockAccept.mockRejectedValue(new Error("boom"));
    const user = userEvent.setup();
    render(<CredentialRequestsPanel accountId="t1" />);
    await screen.findByTestId("credential-request-wf-1:node-7");
    await user.click(screen.getByTestId("credential-request-accept-wf-1:node-7"));
    expect(await screen.findByTestId("credential-requests-error")).toBeInTheDocument();
    // The item is still present (action did not resolve it).
    expect(screen.getByTestId("credential-request-wf-1:node-7")).toBeInTheDocument();
  });
});
