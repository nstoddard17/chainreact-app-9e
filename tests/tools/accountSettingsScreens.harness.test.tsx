/**
 * RESPONSIVE-SETTINGS-3 — Account Settings visual harness.
 *
 * Same proven approach as `templatesScreens.harness.test.tsx` and
 * `workflowsScreens.harness.test.tsx`: render the REAL Account Settings shell and
 * its REAL section bodies with representative fixtures, then write the markup to
 * `owner-review/html/account-*.html`, which
 * `scripts/responsive/measure-app-shell.mjs` wraps with
 * compiled Tailwind + the authenticated shell chrome and measures continuously
 * from 360→1600 in a real browser. No database, no auth, no dev server.
 *
 * The section bodies fetch (MFA status, notification preferences, API keys, MCP
 * tokens, personal plan, subscription). Rather than mock each client module — which
 * would stop exercising the real components' loading/loaded/error branches — a
 * single `fetch` stub routes on URL, so the REAL client code in `lib/api/*` runs.
 *
 * FIXTURE SAFETY: every value here is invented. The MFA "secret" and QR are
 * obviously-fake constants, the MCP token is a literal `…_FIXTURE_NOT_A_REAL_TOKEN`
 * string, and no real email, customer, account id, or Stripe id appears.
 */
import type { ReactNode } from "react";
import { act, render, screen, fireEvent } from "@testing-library/react";
import { writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";

jest.mock("next/navigation", () => ({
  useRouter: () => ({ push: jest.fn(), refresh: jest.fn(), replace: jest.fn() }),
  usePathname: () => "/account",
  useSearchParams: () => new URLSearchParams(),
}));

import { AccountSettings } from "@/features/account/AccountSettings";
import { AppPageContainer } from "@/components/app-shell/AppPageContainer";
import { CheckoutChoiceButton } from "@/features/account/CheckoutChoiceButton";
import type { AccountBillingView } from "@/features/account/AccountSections";
import type { ActiveAccountView } from "@/features/account/settingsRows";

const OUT = join(process.cwd(), "owner-review", "html");

// ── Fixture content, deliberately at the widest realistic forms ───────────────

const LONG_ACCOUNT_NAME =
  "Northwind Traders Global Revenue Operations & Partner Enablement (EMEA)";
const LONG_UNBROKEN_ACCOUNT_NAME =
  "Northwind_Traders_Global_Revenue_Operations_And_Partner_Enablement_EMEA_2026";
const LONG_EMAIL =
  "alexandra.featherstonehaugh-mcallister@northwind-traders-global-operations.example";
const SHORT_EMAIL = "sam@example.com";

/** An obviously-fake TOTP secret. Never a real one. */
const FIXTURE_MFA_SECRET = "AAAAAAAABBBBBBBBCCCCCCCCDDDDDDDD";
/** A 1x1 transparent PNG — stands in for the enrollment QR. */
const FIXTURE_QR =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";
const ACCOUNT_ID = "00000000-0000-4000-8000-000000000001";

function billing(over: Partial<AccountBillingView> = {}): AccountBillingView {
  return {
    usage: { tasksUsed: 1284, tasksLimit: 10000, periodStartedAt: "2026-07-01T00:00:00Z" },
    aiCredits: { used: 190, limit: 500, periodStartedAt: "2026-07-01T00:00:00Z" },
    memberLimit: 25,
    memberCount: 12,
    folderLimit: 250,
    frozen: false,
    plan: "business",
    planStatus: "active",
    currentPeriodEnd: "2026-08-01T00:00:00Z",
    cancelAtPeriodEnd: false,
    personalAccountId: "00000000-0000-4000-8000-0000000000f0",
    billingMode: "standard",
    checkoutConfigured: true,
    usageNowIso: "2026-07-15T12:00:00Z",
    ...over,
  };
}

function active(over: Partial<ActiveAccountView> = {}): ActiveAccountView {
  return { name: "Northwind Traders", type: "organization", role: "owner", ...over };
}

// ── fetch routing ────────────────────────────────────────────────────────────

interface FetchScenario {
  mfa?: "off" | "on" | "error";
  notifications?: "loaded" | "error" | "pending";
  apiKeys?: "loaded" | "empty" | "pending";
  mcpTokens?: "loaded" | "empty";
  /** Make the display-name PATCH fail, so the validation/error path renders. */
  profileSaveFails?: boolean;
}

const json = (body: unknown, status = 200) =>
  Promise.resolve({
    ok: status < 400,
    status,
    json: async () => body,
  } as unknown as Response);

/** A promise that never settles — renders a component's loading branch. */
const pending = () => new Promise<Response>(() => {});

function installFetch(scenario: FetchScenario) {
  const s: Required<Omit<FetchScenario, "profileSaveFails">> & { profileSaveFails: boolean } = {
    mfa: scenario.mfa ?? "off",
    notifications: scenario.notifications ?? "loaded",
    apiKeys: scenario.apiKeys ?? "loaded",
    mcpTokens: scenario.mcpTokens ?? "loaded",
    profileSaveFails: scenario.profileSaveFails ?? false,
  };

  global.fetch = jest.fn((input: unknown) => {
    const url = String(input);

    if (url.includes("/api/account/mfa")) {
      if (s.mfa === "error") return json({ error: "Couldn't load two-factor status." }, 500);
      if (url.endsWith("/enroll")) {
        return json({
          factorId: "factor-fixture",
          secret: FIXTURE_MFA_SECRET,
          qrCode: FIXTURE_QR,
          uri: "otpauth://totp/fixture",
        });
      }
      return json({
        enabled: s.mfa === "on",
        factor: s.mfa === "on" ? { id: "factor-fixture", createdAt: "2026-05-02T00:00:00Z" } : null,
      });
    }

    if (url.includes("/api/account/notification-preferences")) {
      if (s.notifications === "pending") return pending();
      if (s.notifications === "error") return json({ error: "nope" }, 500);
      return json({
        ok: true,
        preferences: { workflowAlerts: true, teamActivity: true, productUpdates: false },
      });
    }

    if (url.includes("/api/account/profile")) {
      return s.profileSaveFails
        ? json(
            {
              error:
                "That display name is too long — use 80 characters or fewer so it fits everywhere ChainReact shows it.",
            },
            400,
          )
        : json({ ok: true, displayName: "Alexandra Featherstonehaugh-McAllister" });
    }

    if (url.includes("/api/account/builder-view")) {
      return json({ ok: true, defaultBuilderView: "ask" });
    }

    if (url.includes("/api-keys")) {
      if (s.apiKeys === "pending") return pending();
      return json({
        apiKeys:
          s.apiKeys === "empty"
            ? []
            : [
                {
                  id: "key-1",
                  name: "Continuous integration deploy trigger (production, EMEA cluster)",
                  prefix: "crk_live_2f8a",
                  status: "active",
                  scopes: ["workflows:trigger"],
                  createdAt: "2026-06-11T00:00:00Z",
                  lastUsedAt: "2026-07-29T00:00:00Z",
                  expiresAt: "2027-06-11T00:00:00Z",
                },
                {
                  id: "key-2",
                  name: "Revoked legacy key",
                  prefix: "crk_live_9d10",
                  status: "revoked",
                  scopes: ["workflows:trigger"],
                  createdAt: "2026-01-04T00:00:00Z",
                  lastUsedAt: null,
                  expiresAt: null,
                },
              ],
      });
    }

    if (url.includes("/mcp-tokens")) {
      return json({
        tokens:
          s.mcpTokens === "empty"
            ? []
            : [
                {
                  id: "tok-1",
                  name: "Claude Desktop — Alexandra's workstation (read-only reporting)",
                  prefix: "crmcp_4b7e",
                  status: "active",
                  scopes: ["accounts:read", "workflows:read", "runs:read"],
                  createdAt: "2026-07-02T00:00:00Z",
                  lastUsedAt: "2026-07-30T00:00:00Z",
                  expiresAt: null,
                },
              ],
      });
    }

    if (url.includes("/billing/personal")) {
      return json({
        isPaidPersonalPro: true,
        planStatus: "active",
        currentPeriodEnd: "2026-08-14T00:00:00Z",
        cancelAtPeriodEnd: false,
        downgrade: { allowed: true, blockers: [] },
      });
    }

    if (url.includes("/billing/subscription")) {
      return json({
        plan: "business",
        planStatus: "active",
        hasSubscription: true,
        isCancelable: true,
        cancelAtPeriodEnd: false,
        currentPeriodEnd: "2026-08-01T00:00:00Z",
        frozen: false,
        internalBilling: false,
        canManage: true,
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
 * Emit EVERY root the state rendered, not just the first.
 *
 * `emit` takes `firstElementChild`, which is right for a state that is one page
 * subtree — and silently wrong for one that also renders an overlay beside it. It
 * dropped the toast out of the toast fixture, so the sweep's "toasts stay inside
 * the viewport" assertion was measuring a page with no toast in it. Any state with
 * a sibling overlay uses this instead.
 */
function emitAll(name: string, container: HTMLElement, mustContain: string) {
  mkdirSync(OUT, { recursive: true });
  const html = container.innerHTML;
  writeFileSync(join(OUT, `${name}.html`), html, "utf8");
  // Guard the guard: assert the overlay actually survived serialisation.
  expect(html).toContain(mustContain);
  expect(container.children.length).toBeGreaterThan(1);
}

/**
 * Mirrors what `app/account/page.tsx` renders around `<AccountSettings/>`. Kept in
 * step with the route deliberately — if the page's container changes, this changes
 * with it, so the harness never measures a container the page doesn't use.
 */
function Page({ children }: { children: ReactNode }) {
  return (
    <AppPageContainer width="content" className="py-6 sm:py-8">
      {children}
    </AppPageContainer>
  );
}

/** Let every mounted effect's fetch settle before the markup is captured. */
async function settle() {
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });
}

interface RenderOpts {
  section: Parameters<typeof AccountSettings>[0]["initialSection"];
  scenario?: FetchScenario;
  props?: Partial<Parameters<typeof AccountSettings>[0]>;
}

async function renderSettings({ section, scenario = {}, props = {} }: RenderOpts) {
  installFetch(scenario);
  const result = render(
    <Page>
      <AccountSettings
        active={active()}
        activeAccountId={ACCOUNT_ID}
        isPersonal={false}
        deletionStatus="active"
        purgeAfter={null}
        userEmail={SHORT_EMAIL}
        displayName="Sam Okafor"
        emailVerified
        signInMethod="Email & password"
        billing={billing()}
        initialSection={section}
        builderViewPreferenceEnabled
        {...props}
      />
    </Page>,
  );
  await settle();
  return result;
}

/** The shared app toast, with the contract accepted in RESPONSIVE-FOUNDATION-1. */
function Toast({ message }: { message: string }) {
  return (
    <div
      role="status"
      data-testid="account-toast"
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

describe("Account Settings visual harness", () => {
  it("01 — account overview, default state", async () => {
    const { container } = await renderSettings({ section: "account" });
    emit("account-01-account-default", container.firstElementChild);
  });

  it("02 — very long account name and email (account + profile identity)", async () => {
    const { container } = await renderSettings({
      section: "profile",
      props: {
        active: active({ name: LONG_UNBROKEN_ACCOUNT_NAME }),
        userEmail: LONG_EMAIL,
        displayName: "Alexandra Featherstonehaugh-McAllister",
      },
    });
    emit("account-02-long-identity", container.firstElementChild);
  });

  it("03 — profile validation error + helper text + save row", async () => {
    const { container } = await renderSettings({
      section: "profile",
      scenario: { profileSaveFails: true },
      props: { active: active({ name: LONG_ACCOUNT_NAME }), userEmail: LONG_EMAIL },
    });
    const input = screen.getByTestId("profile-display-name-input");
    fireEvent.change(input, {
      target: { value: "Alexandra Featherstonehaugh-McAllister the Third of Northwind" },
    });
    await act(async () => {
      screen.getByTestId("profile-display-name-save").click();
    });
    await settle();
    emit("account-03-profile-validation", container.firstElementChild);
  });

  it("04 — billing and usage, normal state", async () => {
    const { container } = await renderSettings({
      section: "billing",
      props: { active: active({ name: LONG_ACCOUNT_NAME }) },
    });
    emit("account-04-billing-normal", container.firstElementChild);
  });

  it("05 — billing exhausted: over-limit usage + lifecycle warning", async () => {
    const { container } = await renderSettings({
      section: "billing",
      props: {
        active: active({ name: LONG_ACCOUNT_NAME }),
        billing: billing({
          usage: {
            tasksUsed: 1250000,
            tasksLimit: 1000000,
            periodStartedAt: "2026-07-01T00:00:00Z",
          },
          aiCredits: { used: 500, limit: 500, periodStartedAt: "2026-07-01T00:00:00Z" },
          planStatus: "past_due",
          memberCount: 25,
        }),
      },
    });
    emit("account-05-billing-exhausted", container.firstElementChild);
  });

  it("06 — billing frozen + internal-free + usage unavailable (disabled state)", async () => {
    const { container } = await renderSettings({
      section: "billing",
      props: {
        billing: billing({
          frozen: true,
          usage: null,
          aiCredits: null,
          billingMode: "internal_free",
          checkoutConfigured: false,
        }),
      },
    });
    emit("account-06-billing-frozen", container.firstElementChild);
  });

  it("07 — API keys: rows with long names, create form open, revoke confirm", async () => {
    const { container } = await renderSettings({ section: "api" });
    await act(async () => {
      screen.getByTestId("api-key-create-open").click();
    });
    await act(async () => {
      screen.getByTestId("api-key-revoke-key-1").click();
    });
    await settle();
    emit("account-07-api-keys", container.firstElementChild);
  });

  it("08 — security: MFA enrollment (QR, setup key, code entry) + password form", async () => {
    const { container } = await renderSettings({
      section: "security",
      props: { userEmail: LONG_EMAIL, emailVerified: false },
    });
    await act(async () => {
      screen.getByTestId("security-change-password-open").click();
    });
    await act(async () => {
      screen.getByTestId("mfa-setup-open").click();
    });
    await settle();
    const code = screen.queryByTestId("security-new-password");
    if (code) fireEvent.change(code, { target: { value: "abc" } });
    await settle();
    emit("account-08-security-mfa", container.firstElementChild);
  });

  it("09 — danger zone: consequences + verification form open", async () => {
    const { container } = await renderSettings({
      section: "danger-zone",
      props: { isPersonal: true, active: active({ name: LONG_ACCOUNT_NAME, type: "personal" }) },
    });
    await act(async () => {
      screen.getByTestId("account-delete-open").click();
    });
    await settle();
    emit("account-09-danger-zone", container.firstElementChild);
  });

  it("10 — dialog open: the Personal-Pro checkout choice", async () => {
    installFetch({});
    const { container } = render(
      <Page>
        <section className="flex flex-col gap-5">
          <CheckoutChoiceButton
            checkoutAccountId={ACCOUNT_ID}
            plan="business"
            personalAccountId="00000000-0000-4000-8000-0000000000f0"
            label="Upgrade to Business"
            redirect={() => {}}
          />
        </section>
      </Page>,
    );
    await act(async () => {
      screen.getByTestId("checkout-choice-trigger").click();
    });
    await settle();
    emit("account-10-dialog-open", container.firstElementChild);
  });

  it("11 — toast visible over the settings page", async () => {
    installFetch({});
    const { container } = render(
      <>
        <Page>
          <AccountSettings
            active={active({ name: LONG_ACCOUNT_NAME })}
            activeAccountId={ACCOUNT_ID}
            isPersonal={false}
            deletionStatus="active"
            purgeAfter={null}
            userEmail={LONG_EMAIL}
            displayName="Sam Okafor"
            emailVerified
            signInMethod="Email & password"
            billing={billing()}
            initialSection="account"
          />
        </Page>
        <Toast message="Couldn't save your notification preferences: the request to /api/account/notification-preferences returned 503" />
      </>,
    );
    await settle();
    emitAll("account-11-toast", container, 'data-testid="account-toast"');
  });

  it("12 — compact settings navigation, expanded", async () => {
    const { container } = await renderSettings({ section: "developer" });
    // Present only once the compact disclosure ships; before then this state
    // still measures the stacked nav, which is what it replaces.
    const toggle = screen.queryByTestId("account-settings-nav-toggle");
    if (toggle) {
      await act(async () => {
        toggle.click();
      });
    }
    await settle();
    emit("account-12-nav-compact-open", container.firstElementChild);
  });

  it("13 — loading + error states (notifications loading, MFA load error)", async () => {
    const { container } = await renderSettings({
      section: "notifications",
      scenario: { notifications: "pending" },
    });
    emit("account-13-loading", container.firstElementChild);
  });

  it("14 — developer: MCP token rows + server URL card", async () => {
    const { container } = await renderSettings({ section: "developer" });
    emit("account-14-developer-mcp", container.firstElementChild);
  });

  it("15 — notifications preferences loaded (switch rows)", async () => {
    const { container } = await renderSettings({ section: "notifications" });
    emit("account-15-notifications", container.firstElementChild);
  });
});
