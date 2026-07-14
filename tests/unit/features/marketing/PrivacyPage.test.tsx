/**
 * Tests for features/marketing/PrivacyPage (Slice 4.PRIVACY-1).
 *
 * Asserts the public Privacy page contract:
 *   - Renders inside the `[data-marketing-surface]` token scope.
 *   - Exposes exactly one <h1> (the hero) — section headings are <h2>.
 *   - Includes every required privacy section.
 *   - Surfaces the "team-visible does not automatically mean team-runnable"
 *     trust statement verbatim, and the "do not sell connected app data" line.
 *   - Privacy contact email is privacy@chainreact.app.
 *   - HONESTY: no fabricated compliance / encryption claims (SOC 2 compliant,
 *     HIPAA compliant, GDPR compliant, CCPA compliant, end-to-end encrypted,
 *     zero-knowledge, "we never collect personal data").
 *   - CTAs wire to real V2 routes / mailto.
 */
import { render, screen, within } from "@testing-library/react";

import { PrivacyPage } from "@/features/marketing/PrivacyPage";

describe("PrivacyPage — composition + a11y", () => {
  it("renders inside the marketing surface scope", () => {
    render(<PrivacyPage />);
    expect(screen.getByTestId("privacy-page")).toHaveAttribute("data-marketing-surface");
  });

  it("exposes exactly one <h1> (the hero headline)", () => {
    render(<PrivacyPage />);
    const h1s = screen.getAllByRole("heading", { level: 1 });
    expect(h1s).toHaveLength(1);
    expect(h1s[0]).toHaveTextContent(/Privacy for connected automation/i);
  });

  it("renders every required section heading", () => {
    render(<PrivacyPage />);
    expect(screen.getByRole("heading", { name: /Information we collect/i })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: /How we use information/i })).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: /Connected apps and OAuth data/i }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: /Workflow, run, and automation data/i }),
    ).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: /Team and workspace privacy/i })).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: /AI-assisted features and privacy/i }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: /Cookies, analytics, and product telemetry/i }),
    ).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: /Data sharing/i })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: /Data retention and deletion/i })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: /Children's privacy/i })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: /International users/i })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: /Your choices and controls/i })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: /Contact us about privacy/i })).toBeInTheDocument();
  });
});

describe("PrivacyPage — core positioning statements", () => {
  it("surfaces the team-runnable trust line verbatim", () => {
    render(<PrivacyPage />);
    expect(
      screen.getByText(/Team-visible does not automatically mean team-runnable\./i),
    ).toBeInTheDocument();
  });

  it("states that ChainReact does not sell connected app data", () => {
    render(<PrivacyPage />);
    expect(
      screen.getAllByText(/ChainReact does not sell connected app data\./i).length,
    ).toBeGreaterThan(0);
  });
});

describe("PrivacyPage — honesty (no unproven claims)", () => {
  it("makes no certification, compliance, or strong-crypto claims", () => {
    const { container } = render(<PrivacyPage />);
    const text = container.textContent ?? "";
    expect(text).not.toMatch(/SOC\s*2\s*compliant/i);
    expect(text).not.toMatch(/HIPAA\s*compliant/i);
    expect(text).not.toMatch(/GDPR\s*compliant/i);
    expect(text).not.toMatch(/CCPA\s*compliant/i);
    expect(text).not.toMatch(/end-to-end encrypted/i);
    expect(text).not.toMatch(/zero-knowledge/i);
    expect(text).not.toMatch(/we never collect personal/i);
  });
});

describe("PrivacyPage — CTA wiring", () => {
  it("'Get started' routes to /auth/sign-up; 'Contact privacy' is a mailto", () => {
    render(<PrivacyPage />);
    expect(screen.getByTestId("privacy-cta-get-started")).toHaveAttribute("href", "/auth/sign-up");
    expect(screen.getByTestId("privacy-cta-contact")).toHaveAttribute(
      "href",
      "mailto:privacy@chainreact.app",
    );
  });

  it("every mailto in the page body uses the privacy@chainreact.app mailbox", () => {
    render(<PrivacyPage />);
    // Scope to the page body — the shared marketing footer legitimately
    // carries its own support@ mailbox, which isn't a privacy contact.
    const footer = screen.getByTestId("marketing-footer");
    const mailtos = screen
      .getAllByRole("link")
      .filter((a) => a.getAttribute("href")?.startsWith("mailto:"))
      .filter((a) => !footer.contains(a));
    expect(mailtos.length).toBeGreaterThan(0);
    for (const a of mailtos) {
      expect(a).toHaveAttribute("href", "mailto:privacy@chainreact.app");
    }
  });

  it("footer exposes a Privacy link to /privacy", () => {
    render(<PrivacyPage />);
    const footer = screen.getByTestId("marketing-footer");
    const link = within(footer).getByRole("link", { name: /^privacy$/i });
    expect(link).toHaveAttribute("href", "/privacy");
  });
});
