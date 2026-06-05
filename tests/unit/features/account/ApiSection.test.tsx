/**
 * Tests for the read-only API & webhooks section (Slice 4.ACCOUNT-SETTINGS-API-WEBHOOKS-2).
 * Pure render — account-scoped like Plan & billing, injected via the `active` prop.
 * There is no public API, no API keys, and no customer webhooks yet: both panels
 * are honest "coming soon" with no interactive controls, no fake keys, no fake
 * endpoints, and no fake delivery logs. See
 * docs/slices/phase-4/account-settings-api-webhooks-plan.md.
 */
import { render, screen, within } from "@testing-library/react";
import { ApiSection } from "@/features/account/AccountSections";
import type { AccountSummary } from "@/lib/api/accounts";

function active(type: AccountSummary["type"], name = "Acct") {
  return { name, type, role: "owner" as const };
}

describe("ApiSection — panels", () => {
  it("renders both an API keys panel and a Webhooks panel", () => {
    render(<ApiSection active={active("personal", "Personal")} />);
    expect(screen.getByText("API keys")).toBeInTheDocument();
    expect(screen.getByText("Webhooks")).toBeInTheDocument();
  });

  it("API keys copy explains owner/admin, trigger-first, and no-token-exposure", () => {
    render(<ApiSection active={active("personal")} />);
    const copy = screen.getByTestId("api-keys-copy");
    expect(copy).toHaveTextContent(/owners and admins/i);
    expect(copy).toHaveTextContent(/triggering your workflows/i);
    expect(copy).toHaveTextContent(/never expose your connected app or OAuth tokens/i);
  });

  it("Webhooks copy explains outbound-to-your-URLs and keeps provider webhooks separate", () => {
    render(<ApiSection active={active("personal")} />);
    const copy = screen.getByTestId("api-webhooks-copy");
    expect(copy).toHaveTextContent(/your own URLs/i);
    expect(copy).toHaveTextContent(/provider webhooks/i);
    expect(copy).toHaveTextContent(/aren.t part of this feature/i);
  });
});

describe("ApiSection — account scoping + labels", () => {
  it("renders the active account name where available", () => {
    render(<ApiSection active={active("team", "Acme")} />);
    expect(screen.getByTestId("api-account-name")).toHaveTextContent("Acme");
  });

  it("labels a team account as Team", () => {
    render(<ApiSection active={active("team", "Acme")} />);
    expect(screen.getByTestId("api-account-type")).toHaveTextContent("Team");
  });

  it("labels an internal organization account as Business (never Organization)", () => {
    render(<ApiSection active={active("organization", "Acme Biz")} />);
    const section = screen.getByTestId("account-section-api");
    expect(screen.getByTestId("api-account-type")).toHaveTextContent("Business");
    expect(section).not.toHaveTextContent(/Organization/);
  });

  it("omits the account row when no active account is resolved", () => {
    render(<ApiSection active={null} />);
    expect(screen.queryByTestId("api-account-name")).toBeNull();
    // The panels + coming-soon markers still render.
    expect(screen.getByText("API keys")).toBeInTheDocument();
    expect(
      within(screen.getByTestId("account-section-api")).getAllByTestId("account-coming-soon")
        .length,
    ).toBeGreaterThan(0);
  });
});

describe("ApiSection — read-only, no fake controls", () => {
  it("exposes only coming-soon markers — no create/revoke/test controls or inputs", () => {
    render(<ApiSection active={active("personal")} />);
    const section = screen.getByTestId("account-section-api");
    // One coming-soon marker per panel (API keys + Webhooks).
    expect(within(section).getAllByTestId("account-coming-soon").length).toBeGreaterThanOrEqual(2);
    // No interactive affordances at all — no buttons, inputs, toggles, or links.
    expect(within(section).queryAllByRole("button")).toHaveLength(0);
    expect(within(section).queryAllByRole("textbox")).toHaveLength(0);
    expect(within(section).queryAllByRole("switch")).toHaveLength(0);
    expect(within(section).queryAllByRole("checkbox")).toHaveLength(0);
    expect(within(section).queryAllByRole("link")).toHaveLength(0);
  });

  it("renders no fabricated key rows or webhook endpoint rows", () => {
    render(<ApiSection active={active("team", "Acme")} />);
    const section = screen.getByTestId("account-section-api");
    // No fabricated key material, secret prefixes, or delivery-attempt artifacts.
    expect(section).not.toHaveTextContent(/crk_|sk_live|sk_test/i);
    expect(section).not.toHaveTextContent(/last used|last delivered|HTTP 2\d\d|attempt #/i);
  });
});
