/**
 * @jest-environment node
 *
 * Server-component tests for /invitations/accept (5.ONBOARD-4).
 *
 * Covers the UNAUTHENTICATED case and the no-leak contract: the page must reveal
 * nothing about the invitation, the account, or the invitee before the POST.
 */
const mockGetUser = jest.fn();
jest.mock("@/utils/supabase/server", () => ({
  createClient: jest.fn(async () => ({
    auth: { getUser: () => mockGetUser() },
  })),
}));

class RedirectError extends Error {
  constructor(public readonly location: string) {
    super(`NEXT_REDIRECT:${location}`);
  }
}
jest.mock("next/navigation", () => ({
  redirect: (location: string) => {
    throw new RedirectError(location);
  },
}));

// A server component RETURNS a React element; it never calls the child function.
// So we identify the card by element type rather than by a call spy.
jest.mock("@/features/invitations/AcceptInvitationCard", () => ({
  AcceptInvitationCard: Object.assign(() => null, {
    displayName: "AcceptInvitationCardMock",
  }),
}));

import { AcceptInvitationCard } from "@/features/invitations/AcceptInvitationCard";

/** The card's props when the page rendered it, else null. */
function cardPropsOf(out: unknown): Record<string, unknown> | null {
  const el = out as { type?: unknown; props?: Record<string, unknown> } | null;
  if (el && el.type === AcceptInvitationCard) return el.props ?? {};
  return null;
}

jest.mock("@/features/auth/AuthShell", () => ({
  AuthShell: ({ children }: { children: unknown }) => children,
  AuthHeading: ({ title }: { title: string }) => title,
}));

import AcceptInvitationPage from "@/app/invitations/accept/page";

const TOKEN = "raw-token-abc";

function params(token?: string | string[]) {
  return { searchParams: Promise.resolve(token === undefined ? {} : { token }) };
}

function signedIn(email = "invitee@example.com") {
  mockGetUser.mockResolvedValue({ data: { user: { id: "u1", email } } });
}

beforeEach(() => {
  jest.clearAllMocks();
  mockGetUser.mockResolvedValue({ data: { user: null } });
});

describe("unauthenticated", () => {
  it("redirects to sign-in carrying this exact URL as returnTo", async () => {
    await expect(AcceptInvitationPage(params(TOKEN))).rejects.toMatchObject({
      location: `/auth/sign-in?returnTo=${encodeURIComponent(
        `/invitations/accept?token=${encodeURIComponent(TOKEN)}`,
      )}`,
    });
    // The card — and therefore any accept — is never reached.
  });

  it("round-trips a token containing URL-significant characters", async () => {
    // Tokens are base64url, but the encode must be correct regardless.
    const tricky = "a+b/c=d&e";
    await expect(AcceptInvitationPage(params(tricky))).rejects.toMatchObject({
      location: `/auth/sign-in?returnTo=${encodeURIComponent(
        `/invitations/accept?token=${encodeURIComponent(tricky)}`,
      )}`,
    });
  });

  it("does NOT redirect (and leaks nothing) when the token is absent", async () => {
    // A signed-out visitor with no token gets the generic invalid-link page,
    // not a bounce through auth — there is nothing to come back for.
    const out = await AcceptInvitationPage(params(undefined));
    expect(out).toBeTruthy();
    expect(cardPropsOf(out)).toBeNull();
  });
});

describe("authenticated", () => {
  it("renders the accept card with the token and the signed-in identity", async () => {
    signedIn("member@example.com");
    const out = await AcceptInvitationPage(params(TOKEN));
    expect(cardPropsOf(out)).toEqual({
      token: TOKEN,
      email: "member@example.com",
    });
  });

  it("shows the invalid-link page for a missing or empty token", async () => {
    signedIn();
    for (const t of [undefined, "", []]) {
      signedIn();
      const out = await AcceptInvitationPage(params(t as never));
      expect(cardPropsOf(out)).toBeNull();
    }
  });

  it("takes the first value when the token param repeats", async () => {
    signedIn();
    const out = await AcceptInvitationPage(params([TOKEN, "second"]));
    expect(cardPropsOf(out)).toMatchObject({ token: TOKEN });
  });
});

describe("no-leak on render", () => {
  it("never looks the invitation up — rendering discloses nothing", async () => {
    // The page imports no invitation repository or service at all, so there is
    // no code path by which a GET could reveal the account's name/existence, the
    // invitee address, the role, or whether the token is even real. This test
    // pins that structurally: if someone adds a lookup, the module graph gains a
    // dependency and this assertion fails.
    const raw = await import("node:fs").then((fs) =>
      fs.readFileSync("app/invitations/accept/page.tsx", "utf8"),
    );
    // Strip comments first — the doc comment legitimately NAMES the invitation
    // service to explain why the page deliberately does not call it.
    const code = raw
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .replace(/\/\/.*/g, "");
    expect(code).not.toMatch(/repositories\/accountInvitations/);
    expect(code).not.toMatch(/services\/accounts\/invitations/);
    expect(code).not.toMatch(/getByTokenHash/);
    // No accept call of any kind on the render path.
    expect(code).not.toMatch(/\bacceptInvitation\b/);
  });
});
