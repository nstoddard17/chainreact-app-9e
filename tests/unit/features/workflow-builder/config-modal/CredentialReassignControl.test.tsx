/**
 * CS-4b — CredentialReassignControl: open → pick eligible member → request →
 * pending, plus inline error mapping and the empty state. Mocks the client lib.
 */
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { CredentialReassignControl } from "@/features/workflow-builder/config-modal/CredentialReassignControl";

const mockFetchEligible = jest.fn();
const mockRequest = jest.fn();
jest.mock("@/lib/api/credentialOwners", () => ({
  fetchEligibleTargets: (...a: unknown[]) => mockFetchEligible(...a),
  requestCredentialReassignment: (...a: unknown[]) => mockRequest(...a),
  fetchNodeCredentialOwners: jest.fn(),
}));

function renderControl(onRequested = jest.fn()) {
  render(<CredentialReassignControl workflowId="wf-1" nodeId="node-gmail" onRequested={onRequested} />);
  return onRequested;
}

beforeEach(() => {
  jest.clearAllMocks();
});

describe("CredentialReassignControl", () => {
  it("opens, lists eligible members by display name, requests, then shows pending", async () => {
    const user = userEvent.setup();
    mockFetchEligible.mockResolvedValue({
      ok: true,
      members: [{ userId: "userB", displayName: "Dana Reyes", role: "member" }],
    });
    mockRequest.mockResolvedValue({ ok: true, status: "pending" });
    const onRequested = renderControl();

    await user.click(screen.getByTestId("credential-reassign-open"));
    await waitFor(() => expect(screen.getByTestId("credential-reassign-select")).toBeInTheDocument());
    // Display name shown; no email.
    expect(screen.getByRole("option", { name: "Dana Reyes" })).toBeInTheDocument();

    await user.selectOptions(screen.getByTestId("credential-reassign-select"), "userB");
    await user.click(screen.getByTestId("credential-reassign-submit"));

    await waitFor(() => expect(screen.getByTestId("credential-reassign-requested")).toBeInTheDocument());
    expect(mockRequest).toHaveBeenCalledWith("wf-1", "node-gmail", "userB");
    expect(onRequested).toHaveBeenCalledTimes(1);
  });

  it("renders an inline error when the request is rejected", async () => {
    const user = userEvent.setup();
    mockFetchEligible.mockResolvedValue({
      ok: true,
      members: [{ userId: "userB", displayName: "Dana Reyes", role: "member" }],
    });
    mockRequest.mockResolvedValue({ ok: false, code: "DUPLICATE_REASSIGNMENT" });
    renderControl();

    await user.click(screen.getByTestId("credential-reassign-open"));
    await waitFor(() => screen.getByTestId("credential-reassign-select"));
    await user.selectOptions(screen.getByTestId("credential-reassign-select"), "userB");
    await user.click(screen.getByTestId("credential-reassign-submit"));

    await waitFor(() =>
      expect(screen.getByTestId("credential-reassign-error")).toHaveTextContent(/already has a pending or active/i),
    );
    expect(screen.queryByTestId("credential-reassign-requested")).toBeNull();
  });

  it("maps an eligible-targets fetch error to inline copy", async () => {
    const user = userEvent.setup();
    mockFetchEligible.mockResolvedValue({ ok: false, code: "FORBIDDEN" });
    renderControl();
    await user.click(screen.getByTestId("credential-reassign-open"));
    await waitFor(() =>
      expect(screen.getByTestId("credential-reassign-error")).toHaveTextContent(/permission/i),
    );
  });

  it("shows an empty state when no members are eligible", async () => {
    const user = userEvent.setup();
    mockFetchEligible.mockResolvedValue({ ok: true, members: [] });
    renderControl();
    await user.click(screen.getByTestId("credential-reassign-open"));
    await waitFor(() => expect(screen.getByTestId("credential-reassign-empty")).toBeInTheDocument());
    // Submit is disabled with nothing selected.
    expect(screen.getByTestId("credential-reassign-submit")).toBeDisabled();
  });
});
