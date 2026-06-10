/**
 * Tests for app/auth/confirmed/page.tsx — the email-confirmation success screen.
 *
 * Async server component: we await the component and render the returned
 * element. The CTA adapts to session state (callback may or may not have
 * established a session).
 */
import { render, screen } from "@testing-library/react";

const mockGetUser = jest.fn();
jest.mock("@/utils/supabase/server", () => ({
  createClient: jest.fn(async () => ({ auth: { getUser: mockGetUser } })),
}));

import ConfirmedPage from "@/app/auth/confirmed/page";

beforeEach(() => {
  mockGetUser.mockReset();
});

describe("ConfirmedPage", () => {
  it("renders the confirmed heading + copy", async () => {
    mockGetUser.mockResolvedValueOnce({ data: { user: { id: "u1" } } });
    render(await ConfirmedPage());
    expect(screen.getByRole("heading", { name: /email confirmed/i })).toBeInTheDocument();
    expect(screen.getByText(/your email has been verified/i)).toBeInTheDocument();
  });

  it("CTA goes to /workflows when a session exists", async () => {
    mockGetUser.mockResolvedValueOnce({ data: { user: { id: "u1" } } });
    render(await ConfirmedPage());
    const cta = screen.getByTestId("confirmed-cta");
    expect(cta).toHaveAttribute("href", "/workflows");
    expect(cta).toHaveTextContent(/continue to dashboard/i);
  });

  it("CTA goes to /auth/sign-in when there is no session", async () => {
    mockGetUser.mockResolvedValueOnce({ data: { user: null } });
    render(await ConfirmedPage());
    const cta = screen.getByTestId("confirmed-cta");
    expect(cta).toHaveAttribute("href", "/auth/sign-in");
    expect(cta).toHaveTextContent(/continue to sign in/i);
  });
});
