/**
 * Invitation acceptance UI tests (5.ONBOARD-4).
 *
 * Covers the required cases at the surface a recipient actually touches: valid,
 * expired, reused, invalid, already-member, and member-limit. (Unauthenticated is
 * handled by the page before this component renders — see the page test.)
 */
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

jest.mock("@/features/marketing/MarketingBrandLogo", () => ({
  MarketingBrandLogo: () => <span data-testid="brand-logo" />,
}));
jest.mock("@/features/auth/AuthShowcase", () => ({
  AuthShowcase: () => <div data-testid="showcase" />,
}));

const mockAccept = jest.fn();
jest.mock("@/lib/api/invitations", () => {
  class AcceptInvitationError extends Error {
    constructor(
      message: string,
      public readonly code: string,
      public readonly status: number,
    ) {
      super(message);
      this.name = "AcceptInvitationError";
    }
  }
  return {
    acceptInvitation: (...a: unknown[]) => mockAccept(...a),
    AcceptInvitationError,
  };
});

import { AcceptInvitationCard } from "@/features/invitations/AcceptInvitationCard";
import { AcceptInvitationError } from "@/lib/api/invitations";

const TOKEN = "raw-token-abc";
const EMAIL = "invitee@example.com";

const assign = jest.fn();

beforeEach(() => {
  jest.clearAllMocks();
  Object.defineProperty(window, "location", {
    configurable: true,
    value: { assign },
  });
});

function renderCard(email: string | null = EMAIL) {
  return render(<AcceptInvitationCard token={TOKEN} email={email} />);
}

describe("acceptance is an explicit action", () => {
  it("does NOT accept on render — a GET must never burn a single-use token", () => {
    renderCard();
    expect(mockAccept).not.toHaveBeenCalled();
    expect(assign).not.toHaveBeenCalled();
  });

  it("shows which identity is accepting", () => {
    renderCard();
    expect(screen.getByTestId("accept-invitation-identity")).toHaveTextContent(
      EMAIL,
    );
  });
});

describe("valid invitation", () => {
  it("accepts with the token and lands the user in the shared workspace", async () => {
    const user = userEvent.setup();
    mockAccept.mockResolvedValue({
      ok: true,
      account: { id: "acct-1", name: "Acme", type: "team" },
      alreadyMember: false,
    });
    renderCard();
    await user.click(screen.getByTestId("accept-invitation-submit"));

    expect(mockAccept).toHaveBeenCalledWith(TOKEN);
    // Hard navigation so the newly-activated account re-renders server-side.
    await waitFor(() => expect(assign).toHaveBeenCalledWith("/workflows"));
  });

  it("treats an already-member response as success (idempotent)", async () => {
    const user = userEvent.setup();
    mockAccept.mockResolvedValue({
      ok: true,
      account: { id: "acct-1", name: "Acme", type: "team" },
      alreadyMember: true,
    });
    renderCard();
    await user.click(screen.getByTestId("accept-invitation-submit"));
    await waitFor(() => expect(assign).toHaveBeenCalledWith("/workflows"));
    expect(screen.queryByTestId("accept-invitation-error")).toBeNull();
  });
});

describe("failure cases", () => {
  const CASES: Array<[string, number, RegExp]> = [
    ["INVITATION_EXPIRED", 410, /expired/i],
    ["INVITATION_ALREADY_ACCEPTED", 409, /already been used/i],
    ["INVITATION_NOT_FOUND", 404, /isn't valid/i],
    ["INVITATION_REVOKED", 410, /no longer active/i],
    ["TEAM_MEMBER_LIMIT_REACHED", 409, /full/i],
    ["INVITATION_EMAIL_MISMATCH", 403, /different email address/i],
    ["ACCOUNT_PENDING_DELETION", 403, /isn't accepting new members/i],
  ];

  it.each(CASES)("surfaces a friendly message for %s", async (code, status, re) => {
    const user = userEvent.setup();
    mockAccept.mockRejectedValue(
      new AcceptInvitationError("server copy", code as never, status),
    );
    renderCard();
    await user.click(screen.getByTestId("accept-invitation-submit"));

    const err = await screen.findByTestId("accept-invitation-error");
    expect(err).toHaveTextContent(re);
    expect(err).toHaveAttribute("role", "alert");
    // Never navigates on failure.
    expect(assign).not.toHaveBeenCalled();
  });

  it("re-enables the button so a transient failure can be retried", async () => {
    const user = userEvent.setup();
    mockAccept.mockRejectedValue(
      new AcceptInvitationError("boom", "UNKNOWN" as never, 500),
    );
    renderCard();
    const button = screen.getByTestId("accept-invitation-submit");
    await user.click(button);
    await screen.findByTestId("accept-invitation-error");
    expect(button).not.toBeDisabled();
  });

  it("never echoes the invited address back on an email mismatch", async () => {
    const user = userEvent.setup();
    mockAccept.mockRejectedValue(
      new AcceptInvitationError(
        // The server's own copy is generic, but even if a future change leaked
        // the address into `message`, the card renders its OWN copy.
        "This invite was sent to someone-else@victim.com",
        "INVITATION_EMAIL_MISMATCH" as never,
        403,
      ),
    );
    renderCard();
    await user.click(screen.getByTestId("accept-invitation-submit"));
    const err = await screen.findByTestId("accept-invitation-error");
    expect(err.textContent).not.toContain("someone-else@victim.com");
  });

  it("discloses no account name or existence in any failure message", async () => {
    const user = userEvent.setup();
    for (const [code, status] of CASES) {
      mockAccept.mockRejectedValue(
        new AcceptInvitationError("Acme Corp is full", code as never, status),
      );
      const { unmount } = renderCard();
      await user.click(screen.getByTestId("accept-invitation-submit"));
      const err = await screen.findByTestId("accept-invitation-error");
      expect(err.textContent).not.toContain("Acme Corp");
      unmount();
      jest.clearAllMocks();
    }
  });
});
