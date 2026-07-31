/**
 * RESPONSIVE-TEAM-4 — Team management visual harness.
 *
 * Same approach as the accepted templates / workflows / account harnesses: render
 * the REAL `/team` components with representative fixtures, write the markup to
 * `owner-review/html/team-*.html`, and let
 * `scripts/responsive/measure-app-shell.mjs` wrap it with
 * compiled Tailwind + the authenticated shell chrome and measure continuously
 * from 360→1600 in Chromium. No database, no auth, no dev server.
 *
 * The team components fetch through `lib/api/accounts` (workflow-impact counts,
 * leave impact, credential requests). A single `fetch` stub routes on URL so the
 * REAL client code runs and the components' own loading/loaded branches are what
 * gets measured.
 *
 * FIXTURE SAFETY: every name, address, id and team is invented. Emails use the
 * reserved `example` TLD, ids are zero-padded literals, and no token, link
 * secret, or production identifier appears.
 */
import type { ReactNode } from "react";
import { act, render, screen, fireEvent } from "@testing-library/react";
import { writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";

jest.mock("next/navigation", () => ({
  useRouter: () => ({ push: jest.fn(), refresh: jest.fn(), replace: jest.fn() }),
  usePathname: () => "/team",
  useSearchParams: () => new URLSearchParams(),
}));

import { TeamDashboard } from "@/features/team/TeamDashboard";
import { AppPageContainer } from "@/components/app-shell/AppPageContainer";
import type { AccountSummary } from "@/lib/api/accounts";
import type { TeamInvitationView, TeamMemberView } from "@/features/team/teamTypes";

const OUT = join(process.cwd(), "owner-review", "html");

// ── Fixture content at the widest realistic forms ────────────────────────────

const LONG_NAME =
  "Alexandra Featherstonehaugh-McAllister de la Cruz-Wintersgill";
const LONG_EMAIL =
  "alexandra.featherstonehaugh-mcallister@northwind-traders-global-operations.example";
const LONG_TEAM =
  "Northwind Traders Global Revenue Operations & Partner Enablement (EMEA)";

const ACC = "00000000-0000-4000-8000-00000000000a";
const PERSONAL = "00000000-0000-4000-8000-00000000000b";

function account(over: Partial<AccountSummary> = {}): AccountSummary {
  return {
    id: ACC,
    name: "Northwind Traders",
    type: "team",
    role: "owner",
    deletionStatus: "active",
    ...over,
  } as AccountSummary;
}

const personalAccount = account({
  id: PERSONAL,
  name: "Sam Okafor",
  type: "personal",
  role: "owner",
});

function member(over: Partial<TeamMemberView> & { userId: string }): TeamMemberView {
  return {
    role: "member",
    joinedAt: "2026-04-12T00:00:00Z",
    email: null,
    displayName: null,
    isYou: false,
    ...over,
  };
}

const ownerYou = member({
  userId: "00000000-0000-4000-8000-000000000001",
  role: "owner",
  displayName: "Sam Okafor",
  email: "sam@example.com",
  isYou: true,
  joinedAt: "2026-01-05T00:00:00Z",
});

const adminLong = member({
  userId: "00000000-0000-4000-8000-000000000002",
  role: "admin",
  displayName: LONG_NAME,
  email: LONG_EMAIL,
  joinedAt: "2026-02-20T00:00:00Z",
});

const plainMember = member({
  userId: "00000000-0000-4000-8000-000000000003",
  role: "member",
  displayName: "Priya Raghunathan",
  email: "priya.raghunathan@example.com",
});

/** Neither a name nor an email — the short-id fallback path. */
const identityless = member({
  userId: "00000000-0000-4000-8000-000000000004",
  role: "member",
});

/** Email but no display name. */
const emailOnly = member({
  userId: "00000000-0000-4000-8000-000000000005",
  role: "member",
  email: "jean-baptiste.vandenberghe@northwind-traders-global.example",
});

const TEAM_MEMBERS: readonly TeamMemberView[] = [
  ownerYou,
  adminLong,
  plainMember,
  emailOnly,
  identityless,
];

function invite(over: Partial<TeamInvitationView> & { id: string }): TeamInvitationView {
  return {
    email: "newcomer@example.com",
    role: "member",
    status: "pending",
    expiresAt: null,
    createdAt: "2026-07-18T00:00:00Z",
    ...over,
  };
}

const INVITATIONS: readonly TeamInvitationView[] = [
  invite({ id: "inv-1", email: LONG_EMAIL, role: "admin" }),
  invite({ id: "inv-2", email: "priya.raghunathan+team@example.com" }),
  invite({ id: "inv-3", email: "revoked.teammate@example.com", status: "revoked" }),
];

// ── fetch routing ────────────────────────────────────────────────────────────

const json = (body: unknown, status = 200) =>
  Promise.resolve({ ok: status < 400, status, json: async () => body } as unknown as Response);

/** Never settles — renders a component's loading branch. */
const pending = () => new Promise<Response>(() => {});

interface Scenario {
  /** Advisory workflow-impact count returned for remove / leave. */
  impact?: number;
  /** Hold the impact lookup open, so the confirmation's loading branch renders. */
  impactPending?: boolean;
  credentialRequests?: "none" | "some";
  /** Make invite creation fail, so the form's validation/error path renders. */
  inviteFails?: boolean;
}

function installFetch(s: Scenario = {}) {
  global.fetch = jest.fn((input: unknown, init?: { method?: string }) => {
    const url = String(input);
    const method = init?.method ?? "GET";

    if (url.includes("/workflow-impact") || url.includes("/leave-impact")) {
      if (s.impactPending) return pending();
      return json({ affectedWorkflowCount: s.impact ?? 0 });
    }
    if (url.includes("/credential-requests")) {
      return json({ requests: s.credentialRequests === "some" ? [] : [] });
    }
    if (url.includes("/invitations") && method === "POST") {
      return s.inviteFails
        ? json(
            {
              error:
                "That address already has a pending invitation to this team. Cancel the existing invitation before sending another one.",
            },
            409,
          )
        : json({
            invitation: {
              id: "inv-new",
              email: "newcomer@example.com",
              role: "member",
              status: "pending",
              expiresAt: null,
              createdAt: "2026-07-31T00:00:00Z",
            },
            acceptPath: "/invite/accept?token=FIXTURE_NOT_A_REAL_TOKEN_0000000000",
            emailDelivery: { status: "sent" },
          });
    }
    return json({ ok: true });
  }) as unknown as typeof fetch;
}

// ── emit ─────────────────────────────────────────────────────────────────────

function emit(name: string, node: Element | null) {
  mkdirSync(OUT, { recursive: true });
  writeFileSync(join(OUT, `${name}.html`), node ? node.outerHTML : "<!-- nothing -->", "utf8");
  expect(node).not.toBeNull();
  expect(node!.outerHTML.length).toBeGreaterThan(200);
}

/**
 * Emit every root the state rendered, not just the first — the lesson from
 * RESPONSIVE-SETTINGS-3, where `firstElementChild` silently dropped the toast out
 * of the toast fixture and left that assertion measuring nothing.
 */
function emitAll(name: string, container: HTMLElement, mustContain: string) {
  mkdirSync(OUT, { recursive: true });
  const html = container.innerHTML;
  writeFileSync(join(OUT, `${name}.html`), html, "utf8");
  expect(html).toContain(mustContain);
  expect(container.children.length).toBeGreaterThan(1);
}

/** Mirrors what `app/team/page.tsx` renders around `<TeamDashboard/>`. */
function Page({ children }: { children: ReactNode }) {
  return (
    <AppPageContainer width="content" className="py-6 sm:py-8">
      {children}
    </AppPageContainer>
  );
}

async function settle() {
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });
}

interface RenderOpts {
  scenario?: Scenario;
  props?: Partial<Parameters<typeof TeamDashboard>[0]>;
}

async function renderTeam({ scenario = {}, props = {} }: RenderOpts = {}) {
  installFetch(scenario);
  const result = render(
    <Page>
      <TeamDashboard
        accounts={[personalAccount, account()]}
        activeAccountId={ACC}
        currentUserEmail="sam@example.com"
        members={TEAM_MEMBERS}
        invitations={INVITATIONS}
        canManage
        memberCap={5}
        teamMaxMembers={5}
        {...props}
      />
    </Page>,
  );
  await settle();
  return result;
}

/** Click a nav section, since the dashboard's section state is internal. */
async function goTo(testId: string) {
  await act(async () => {
    screen.getByTestId(testId).click();
  });
  await settle();
}

/** The shared app toast, with the contract accepted in RESPONSIVE-FOUNDATION-1. */
function Toast({ message }: { message: string }) {
  return (
    <div
      role="status"
      data-testid="team-toast"
      style={{ maxWidth: "calc(100vw - 2rem)" }}
      className="fixed bottom-6 left-1/2 z-50 w-max -translate-x-1/2 whitespace-normal break-words rounded-lg bg-foreground px-4 py-3 text-sm font-medium text-background shadow-lg"
    >
      {message}
    </div>
  );
}

afterEach(() => {
  jest.restoreAllMocks();
});

describe("Team management visual harness", () => {
  it("01 — overview: account switcher, account panel, ownership actions", async () => {
    const { container } = await renderTeam();
    emit("team-01-overview-owner", container.firstElementChild);
  });

  it("02 — members roster: owner + admin + members, long name and email", async () => {
    const { container } = await renderTeam();
    await goTo("team-nav-members");
    emit("team-02-members-typical", container.firstElementChild);
  });

  it("03 — very long team name, long member identity, long invite address", async () => {
    const { container } = await renderTeam({
      props: {
        accounts: [personalAccount, account({ name: LONG_TEAM })],
        members: [ownerYou, adminLong, emailOnly],
      },
    });
    await goTo("team-nav-members");
    emit("team-03-long-identity", container.firstElementChild);
  });

  it("04 — viewer is an ADMIN (manages members, not owners)", async () => {
    const { container } = await renderTeam({
      props: {
        accounts: [personalAccount, account({ role: "admin" })],
        members: [
          member({ ...ownerYou, userId: ownerYou.userId, isYou: false }),
          member({
            userId: "00000000-0000-4000-8000-000000000002",
            role: "admin",
            displayName: "You (admin)",
            email: "sam@example.com",
            isYou: true,
          }),
          plainMember,
        ],
      },
    });
    await goTo("team-nav-members");
    emit("team-04-viewer-admin", container.firstElementChild);
  });

  it("05 — viewer is an ordinary MEMBER: read-only roster, no actions at all", async () => {
    const { container } = await renderTeam({
      props: {
        accounts: [personalAccount, account({ role: "member" })],
        canManage: false,
        invitations: [],
        members: [
          member({ ...ownerYou, isYou: false }),
          adminLong,
          member({
            userId: "00000000-0000-4000-8000-000000000003",
            role: "member",
            displayName: "Sam Okafor",
            email: "sam@example.com",
            isYou: true,
          }),
        ],
      },
    });
    await goTo("team-nav-members");
    emit("team-05-viewer-member", container.firstElementChild);
  });

  it("06 — pending invitations with role controls and change-email form open", async () => {
    const { container } = await renderTeam();
    await goTo("team-nav-members");
    await act(async () => {
      screen.getByTestId("team-invite-change-email-inv-1").click();
    });
    await settle();
    emit("team-06-invitations", container.firstElementChild);
  });

  it("07 — invitation form with a validation error", async () => {
    const { container } = await renderTeam({ scenario: { inviteFails: true } });
    await goTo("team-nav-members");
    const input = screen.getByLabelText("Invite by email");
    fireEvent.change(input, { target: { value: LONG_EMAIL } });
    await act(async () => {
      fireEvent.submit(input.closest("form")!);
    });
    await settle();
    emit("team-07-invite-error", container.firstElementChild);
  });

  it("08 — seat limit reached (invite disabled + upgrade messaging)", async () => {
    const { container } = await renderTeam({
      props: {
        members: TEAM_MEMBERS,
        invitations: [invite({ id: "inv-1", email: LONG_EMAIL, role: "admin" })],
        memberCap: 5,
      },
    });
    await goTo("team-nav-members");
    emit("team-08-seat-limit", container.firstElementChild);
  });

  it("09 — remove-member confirmation with the workflow-impact warning", async () => {
    const { container } = await renderTeam({ scenario: { impact: 7 } });
    await goTo("team-nav-members");
    await act(async () => {
      screen.getByTestId(`team-remove-${adminLong.userId}`).click();
    });
    await settle();
    emit("team-09-remove-confirm", container.firstElementChild);
  });

  it("10 — ownership-transfer form (candidate picker + password step-up)", async () => {
    const { container } = await renderTeam();
    await act(async () => {
      screen.getByTestId("team-transfer-open").click();
    });
    await settle();
    emit("team-10-transfer-ownership", container.firstElementChild);
  });

  it("11 — leave-team confirmation with the self-impact warning", async () => {
    const { container } = await renderTeam({
      scenario: { impact: 4 },
      props: {
        accounts: [personalAccount, account({ role: "admin" })],
        members: [member({ ...ownerYou, isYou: false }), {
          ...adminLong,
          isYou: true,
        }],
      },
    });
    await act(async () => {
      screen.getByTestId("team-leave-open").click();
    });
    await settle();
    emit("team-11-leave-team", container.firstElementChild);
  });

  it("12 — sole owner blocked from leaving (last-owner protection visible)", async () => {
    const { container } = await renderTeam({
      props: { members: [ownerYou], invitations: [] },
    });
    emit("team-12-sole-owner", container.firstElementChild);
  });

  it("13 — roles & access matrix", async () => {
    const { container } = await renderTeam();
    await goTo("team-nav-roles-access");
    emit("team-13-roles", container.firstElementChild);
  });

  it("14 — single-member team and an empty invitation list", async () => {
    const { container } = await renderTeam({
      props: { members: [ownerYou], invitations: [] },
    });
    await goTo("team-nav-members");
    emit("team-14-single-member", container.firstElementChild);
  });

  it("15 — loading / disabled: impact lookup still pending inside a confirmation", async () => {
    const { container } = await renderTeam({ scenario: { impactPending: true } });
    await goTo("team-nav-members");
    await act(async () => {
      screen.getByTestId(`team-remove-${plainMember.userId}`).click();
    });
    await settle();
    emit("team-15-loading", container.firstElementChild);
  });

  it("16 — personal account: no team surfaces, create-a-team nudge", async () => {
    const { container } = await renderTeam({
      props: {
        accounts: [personalAccount],
        activeAccountId: PERSONAL,
        members: [],
        invitations: [],
        canManage: false,
        memberCap: null,
      },
    });
    emit("team-16-personal", container.firstElementChild);
  });

  it("17 — toast visible over the members roster", async () => {
    installFetch({});
    const { container } = render(
      <>
        <Page>
          <TeamDashboard
            accounts={[personalAccount, account({ name: LONG_TEAM })]}
            activeAccountId={ACC}
            currentUserEmail="sam@example.com"
            members={TEAM_MEMBERS}
            invitations={INVITATIONS}
            canManage
            memberCap={5}
            teamMaxMembers={5}
          />
        </Page>
        <Toast message="Couldn't change that member's role: the request to /api/accounts/00000000-0000-4000-8000-00000000000a/members returned 409" />
      </>,
    );
    await settle();
    emitAll("team-17-toast", container, 'data-testid="team-toast"');
  });

  it("18 — create-team form open in the account switcher", async () => {
    const { container } = await renderTeam();
    await act(async () => {
      screen.getByTestId("team-create-toggle").click();
    });
    await settle();
    emit("team-18-create-team", container.firstElementChild);
  });
});
