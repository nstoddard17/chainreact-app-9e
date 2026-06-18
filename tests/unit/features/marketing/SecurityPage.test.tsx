/**
 * Tests for features/marketing/SecurityPage (Slice 4.SECURITY-1).
 *
 * Asserts the public Security/Trust page contract:
 *   - Renders inside the `[data-marketing-surface]` token scope.
 *   - Exposes exactly one <h1> (the hero) — section headings are <h2>.
 *   - Includes every required section (account, OAuth, private credentials,
 *     run data, AI, compliance, disclosure).
 *   - Surfaces the "team-visible does not automatically mean team-runnable"
 *     trust statement verbatim.
 *   - Responsible-disclosure email is security@chainreact.app.
 *   - HONESTY: no fabricated certification / encryption claims (SOC 2
 *     compliant, HIPAA compliant, GDPR certified, end-to-end encrypted,
 *     zero-knowledge, pen-tested).
 *   - CTAs wire to real V2 routes / mailto.
 */
import { render, screen, within } from "@testing-library/react";

import { SecurityPage } from "@/features/marketing/SecurityPage";

describe("SecurityPage — composition + a11y", () => {
  it("renders inside the marketing surface scope", () => {
    render(<SecurityPage />);
    expect(screen.getByTestId("security-page")).toHaveAttribute("data-marketing-surface");
  });

  it("exposes exactly one <h1> (the hero headline)", () => {
    render(<SecurityPage />);
    const h1s = screen.getAllByRole("heading", { level: 1 });
    expect(h1s).toHaveLength(1);
    expect(h1s[0]).toHaveTextContent(/Security built for connected workflows/i);
  });

  it("renders every required detailed section heading (level 2)", () => {
    render(<SecurityPage />);
    // Section headings are <h2>; the trust-card summaries are <h3>, so
    // scoping to level 2 keeps the two from colliding on shared words.
    const h2 = (name: RegExp) => screen.getByRole("heading", { level: 2, name });
    expect(h2(/^Account and workspace security$/i)).toBeInTheDocument();
    expect(h2(/^OAuth and connected apps$/i)).toBeInTheDocument();
    expect(h2(/^Private credentials & team workflows$/i)).toBeInTheDocument();
    expect(h2(/^Workflow run and automation data$/i)).toBeInTheDocument();
    expect(h2(/^AI safety$/i)).toBeInTheDocument();
    expect(h2(/^Compliance status$/i)).toBeInTheDocument();
    expect(h2(/^Responsible disclosure$/i)).toBeInTheDocument();
  });
});

describe("SecurityPage — core trust statement", () => {
  it("surfaces the team-runnable trust line verbatim", () => {
    render(<SecurityPage />);
    expect(
      screen.getByText(/Team-visible does not automatically mean team-runnable\./i),
    ).toBeInTheDocument();
  });
});

describe("SecurityPage — honesty (no unproven claims)", () => {
  it("makes no certification or strong-crypto claims", () => {
    const { container } = render(<SecurityPage />);
    const text = container.textContent ?? "";
    expect(text).not.toMatch(/SOC\s*2\s*compliant/i);
    expect(text).not.toMatch(/HIPAA\s*compliant/i);
    expect(text).not.toMatch(/GDPR\s*certified/i);
    expect(text).not.toMatch(/end-to-end encrypted/i);
    expect(text).not.toMatch(/zero-knowledge/i);
    expect(text).not.toMatch(/pen-?tested/i);
  });

  it("states compliance honestly (does not currently claim SOC 2 / HIPAA)", () => {
    render(<SecurityPage />);
    expect(screen.getByText(/do not currently claim/i)).toBeInTheDocument();
  });
});

describe("SecurityPage — CTA wiring", () => {
  it("disclosure + contact use the security@chainreact.app mailbox", () => {
    render(<SecurityPage />);
    const mailtos = screen
      .getAllByRole("link")
      .filter((a) => a.getAttribute("href")?.startsWith("mailto:"));
    expect(mailtos.length).toBeGreaterThan(0);
    for (const a of mailtos) {
      expect(a).toHaveAttribute("href", "mailto:security@chainreact.app");
    }
  });

  it("'Get started' routes to /auth/sign-up; 'Contact security' is a mailto", () => {
    render(<SecurityPage />);
    expect(screen.getByTestId("security-cta-get-started")).toHaveAttribute("href", "/auth/sign-up");
    expect(screen.getByTestId("security-cta-contact")).toHaveAttribute(
      "href",
      "mailto:security@chainreact.app",
    );
  });

  it("footer exposes a Security link to /security", () => {
    render(<SecurityPage />);
    const footer = screen.getByTestId("marketing-footer");
    const link = within(footer).getByRole("link", { name: /^security$/i });
    expect(link).toHaveAttribute("href", "/security");
  });
});
