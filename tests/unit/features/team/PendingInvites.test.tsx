/**
 * PendingInvites lifecycle controls (TEAM-INVITATION-LIFECYCLE-2).
 *
 * Proves the three per-row controls and their messaging contract:
 *   - Change role: in place; confirms the existing link is still active and
 *     that no new email was sent.
 *   - Change email: warns the old link will stop working BEFORE submit; on
 *     success shows the NEW copyable link.
 *   - Cancel: revokes via the client.
 * Also: no expiry wording anywhere (invitations are non-expiring).
 * The API client is mocked; this pins the UI contract.
 */
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { PendingInvites } from "@/features/team/PendingInvites";
import {
  revokeInvitation,
  changeInvitationRole,
  changeInvitationEmail,
} from "@/lib/api/accounts";

jest.mock("@/lib/api/accounts", () => ({
  AccountApiError: class extends Error {},
  revokeInvitation: jest.fn(),
  changeInvitationRole: jest.fn(),
  changeInvitationEmail: jest.fn(),
}));

const mockRevoke = revokeInvitation as jest.Mock;
const mockChangeRole = changeInvitationRole as jest.Mock;
const mockChangeEmail = changeInvitationEmail as jest.Mock;

const INVITE = {
  id: "inv-1",
  email: "pending@example.com",
  role: "member",
  status: "pending",
  expiresAt: null,
  createdAt: "2026-07-01T00:00:00.000Z",
};

function renderList(onChanged = () => {}) {
  return render(
    <PendingInvites accountId="t1" invitations={[INVITE]} onChanged={onChanged} />,
  );
}

beforeEach(() => {
  mockRevoke.mockReset();
  mockChangeRole.mockReset();
  mockChangeEmail.mockReset();
});

describe("PendingInvites — lifecycle controls", () => {
  it("shows no expiry wording; the row says the invite stays active", () => {
    renderList();
    const row = screen.getByTestId("team-invite-inv-1");
    expect(row.textContent!.toLowerCase()).not.toContain("expire");
    expect(row).toHaveTextContent(/active until accepted or canceled/i);
  });

  it("change role → in-place update + 'link still active, no new email' confirmation", async () => {
    mockChangeRole.mockResolvedValueOnce({ ...INVITE, role: "admin" });
    const onChanged = jest.fn();
    renderList(onChanged);
    fireEvent.change(screen.getByTestId("team-invite-role-inv-1"), {
      target: { value: "admin" },
    });
    await waitFor(() =>
      expect(screen.getByTestId("team-invite-role-confirm-inv-1")).toBeInTheDocument(),
    );
    expect(mockChangeRole).toHaveBeenCalledWith("t1", "inv-1", "admin");
    expect(screen.getByTestId("team-invite-role-confirm-inv-1")).toHaveTextContent(
      /existing invitation link is still active — no new email was sent/i,
    );
    expect(onChanged).toHaveBeenCalled();
  });

  it("change email → warns the old link will stop working, then shows the NEW link", async () => {
    mockChangeEmail.mockResolvedValueOnce({
      invitation: { ...INVITE, id: "inv-2", email: "new@example.com" },
      acceptToken: "new-raw",
      acceptPath: "/invitations/accept?token=new-raw",
      emailDelivery: { status: "sent" },
    });
    renderList();

    fireEvent.click(screen.getByTestId("team-invite-change-email-inv-1"));
    const form = screen.getByTestId("team-invite-email-form-inv-1");
    // The warning is visible BEFORE submitting.
    expect(form).toHaveTextContent(/old link will stop working/i);
    expect(form).toHaveTextContent(/new invitation email and link/i);

    fireEvent.change(screen.getByLabelText("New invite email"), {
      target: { value: "new@example.com" },
    });
    fireEvent.click(screen.getByRole("button", { name: /re-issue invite/i }));

    await waitFor(() =>
      expect(screen.getByTestId("team-invite-replacement")).toBeInTheDocument(),
    );
    expect(mockChangeEmail).toHaveBeenCalledWith("t1", "inv-1", "new@example.com");
    const panel = screen.getByTestId("team-invite-replacement");
    expect(panel).toHaveTextContent(/New invitation emailed to new@example.com/i);
    expect(panel).toHaveTextContent(/previous link no longer works/i);
    const link = screen.getByLabelText("New invite link") as HTMLInputElement;
    expect(link.value).toContain("/invitations/accept?token=new-raw");
  });

  it("cancel → revokes via the client", async () => {
    mockRevoke.mockResolvedValueOnce(undefined);
    const onChanged = jest.fn();
    renderList(onChanged);
    fireEvent.click(screen.getByTestId("team-revoke-inv-1"));
    await waitFor(() => expect(onChanged).toHaveBeenCalled());
    expect(mockRevoke).toHaveBeenCalledWith("t1", "inv-1");
  });
});
