/**
 * Tests for features/team/InviteBar (Slice 4.TEAM-PAGE-3; delivery states
 * TEAM-INVITATION-EMAIL-1).
 *
 * Role helper: the invite role dropdown carries a plain-language explanation
 * that updates as the inviter switches between "As Member" and "As Admin".
 *
 * Delivery states: after submit the panel distinguishes "Invitation emailed"
 * from "created but the email couldn't be sent" (and the unconfigured local
 * case) — always retaining the one-time copyable link, with an aria-live
 * announcement. The API client is mocked; this proves the UI contract.
 */
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { InviteBar } from "@/features/team/InviteBar";
import { createInvitation } from "@/lib/api/accounts";

jest.mock("@/lib/api/accounts", () => ({
  AccountApiError: class extends Error {},
  createInvitation: jest.fn(),
}));

const mockCreate = createInvitation as jest.Mock;

function created(status: "sent" | "failed" | "not_configured") {
  return {
    invitation: {
      id: "i1", email: "new@example.com", role: "member",
      status: "pending", expiresAt: "2026-08-01T00:00:00.000Z", createdAt: "c",
    },
    acceptToken: "raw-token",
    acceptPath: "/invitations/accept?token=raw-token",
    emailDelivery: { status },
  };
}

async function submitInvite() {
  fireEvent.change(screen.getByLabelText("Invite by email"), {
    target: { value: "new@example.com" },
  });
  fireEvent.click(screen.getByRole("button", { name: /send invite/i }));
  await waitFor(() => expect(screen.getByTestId("team-invite-link")).toBeInTheDocument());
}

describe("InviteBar — role helper", () => {
  it("explains the Member role by default", () => {
    render(<InviteBar accountId="t1" disabled={false} onChanged={() => {}} />);
    const help = screen.getByTestId("team-invite-role-help");
    expect(help).toHaveTextContent("As Member:");
    expect(help).toHaveTextContent(/Full access to the team's workflows/i);
    expect(help).toHaveTextContent(/Can't invite or manage people/i);
  });

  it("updates the explanation to the Admin role when selected", () => {
    render(<InviteBar accountId="t1" disabled={false} onChanged={() => {}} />);
    fireEvent.change(screen.getByLabelText("Invite role"), {
      target: { value: "admin" },
    });
    const help = screen.getByTestId("team-invite-role-help");
    expect(help).toHaveTextContent("As Admin:");
    expect(help).toHaveTextContent(/invite people and manage members/i);
    expect(help).toHaveTextContent(/Can't manage owners or other admins/i);
  });
});

describe("InviteBar — email delivery states (TEAM-INVITATION-EMAIL-1)", () => {
  beforeEach(() => mockCreate.mockReset());

  it("'sent' → success panel: 'Invitation emailed to …', link retained, aria-live announced", async () => {
    mockCreate.mockResolvedValueOnce(created("sent"));
    render(<InviteBar accountId="t1" disabled={false} onChanged={() => {}} />);
    await submitInvite();

    const panel = screen.getByTestId("team-invite-delivery");
    expect(panel).toHaveTextContent(/Invitation emailed to new@example.com/i);
    expect(panel).toHaveTextContent(/sign in or create an account/i);
    // Non-expiring (TEAM-INVITATION-LIFECYCLE-2): no expiry wording anywhere.
    expect(panel.textContent!.toLowerCase()).not.toContain("expire");
    expect(panel).toHaveTextContent(/stays active until accepted or canceled/i);
    // Copy-link fallback survives a successful send.
    const link = screen.getByLabelText("Invite link") as HTMLInputElement;
    expect(link.value).toContain("/invitations/accept?token=raw-token");
    expect(screen.getByRole("status")).toHaveTextContent(/Invitation emailed/i);
  });

  it("'failed' → warning panel: created-but-not-emailed, copy link, no-resubmit guidance", async () => {
    mockCreate.mockResolvedValueOnce(created("failed"));
    render(<InviteBar accountId="t1" disabled={false} onChanged={() => {}} />);
    await submitInvite();

    const panel = screen.getByTestId("team-invite-delivery");
    expect(panel).toHaveTextContent(/couldn't be sent/i);
    expect(panel).toHaveTextContent(/copy this link/i);
    // Retry guidance that avoids the duplicate-pending trap.
    expect(panel).toHaveTextContent(/Don't submit the form again/i);
    expect(screen.getByLabelText("Invite link")).toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent(/email was not sent/i);
  });

  it("'not_configured' → neutral local wording, link still shown", async () => {
    mockCreate.mockResolvedValueOnce(created("not_configured"));
    render(<InviteBar accountId="t1" disabled={false} onChanged={() => {}} />);
    await submitInvite();

    expect(screen.getByTestId("team-invite-delivery")).toHaveTextContent(
      /isn't configured in this environment/i,
    );
    expect(screen.getByLabelText("Invite link")).toBeInTheDocument();
  });

  it("an API error (e.g. rate-limited) surfaces as an alert and no link panel", async () => {
    const { AccountApiError } = jest.requireMock("@/lib/api/accounts");
    mockCreate.mockRejectedValueOnce(
      Object.assign(new AccountApiError("Too many invitations sent recently."), {}),
    );
    render(<InviteBar accountId="t1" disabled={false} onChanged={() => {}} />);
    fireEvent.change(screen.getByLabelText("Invite by email"), {
      target: { value: "new@example.com" },
    });
    fireEvent.click(screen.getByRole("button", { name: /send invite/i }));
    await waitFor(() =>
      expect(screen.getByRole("alert")).toHaveTextContent(/Too many invitations/i),
    );
    expect(screen.queryByTestId("team-invite-link")).not.toBeInTheDocument();
  });
});
