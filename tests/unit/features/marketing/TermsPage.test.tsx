/**
 * Tests for features/marketing/TermsPage (Slice 4.TERMS-1).
 *
 * Asserts the public Terms of Service page contract:
 *   - Renders inside the `[data-marketing-surface]` token scope.
 *   - Exposes exactly one <h1> (the hero) — section headings are <h2>.
 *   - Includes the required legal sections.
 *   - States Texas governing law and the "as is" disclaimer verbatim.
 *   - Legal contact email is legal@chainreact.app on every mailto.
 *   - CTAs wire to real V2 routes / mailto.
 *   - No em dashes anywhere in the visible copy.
 *   - Footer exposes a Terms link to /terms.
 */
import { render, screen, within } from "@testing-library/react";

import { TermsPage } from "@/features/marketing/TermsPage";

describe("TermsPage — composition + a11y", () => {
  it("renders inside the marketing surface scope", () => {
    render(<TermsPage />);
    expect(screen.getByTestId("terms-page")).toHaveAttribute("data-marketing-surface");
  });

  it("exposes exactly one <h1> (the hero headline)", () => {
    render(<TermsPage />);
    const h1s = screen.getAllByRole("heading", { level: 1 });
    expect(h1s).toHaveLength(1);
    expect(h1s[0]).toHaveTextContent(/Terms of Service/i);
  });

  it("renders the required legal section headings", () => {
    render(<TermsPage />);
    expect(screen.getByRole("heading", { name: /^Eligibility$/i })).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: /Description of the Service/i }),
    ).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: /Accounts and Workspaces/i })).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: /Third-Party Integrations and Permissions/i }),
    ).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: /Acceptable Use/i })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: /Plans, Fees, and Billing/i })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: /Beta Features and AI Features/i })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: /Limitation of Liability/i })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: /Indemnification/i })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: /Governing Law/i })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: /Dispute Resolution/i })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: /Changes to These Terms/i })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: /^Contact$/i })).toBeInTheDocument();
  });
});

describe("TermsPage — core legal statements", () => {
  it("states Texas governing law", () => {
    render(<TermsPage />);
    expect(screen.getByText(/laws of the State of Texas/i)).toBeInTheDocument();
  });

  it("includes the 'as is' / 'as available' disclaimer", () => {
    const { container } = render(<TermsPage />);
    const text = container.textContent ?? "";
    expect(text).toMatch(/as is/i);
    expect(text).toMatch(/as available/i);
  });
});

describe("TermsPage — copy hygiene", () => {
  it("contains no em or en dashes in the rendered copy", () => {
    const { container } = render(<TermsPage />);
    const text = container.textContent ?? "";
    expect(text).not.toMatch(/[—–]/);
  });
});

describe("TermsPage — CTA + contact wiring", () => {
  it("'Get started' routes to /auth/sign-up; 'Contact legal' is a mailto", () => {
    render(<TermsPage />);
    expect(screen.getByTestId("terms-cta-get-started")).toHaveAttribute("href", "/auth/sign-up");
    expect(screen.getByTestId("terms-cta-contact")).toHaveAttribute(
      "href",
      "mailto:legal@chainreact.app",
    );
  });

  it("every mailto in the page body uses the legal@chainreact.app mailbox", () => {
    render(<TermsPage />);
    // Scope to the page body — the shared marketing footer legitimately
    // carries its own support@ mailbox, which isn't a legal contact.
    const footer = screen.getByTestId("marketing-footer");
    const mailtos = screen
      .getAllByRole("link")
      .filter((a) => a.getAttribute("href")?.startsWith("mailto:"))
      .filter((a) => !footer.contains(a));
    expect(mailtos.length).toBeGreaterThan(0);
    for (const a of mailtos) {
      expect(a).toHaveAttribute("href", "mailto:legal@chainreact.app");
    }
  });

  it("footer exposes a Terms link to /terms", () => {
    render(<TermsPage />);
    const footer = screen.getByTestId("marketing-footer");
    const link = within(footer).getByRole("link", { name: /^terms$/i });
    expect(link).toHaveAttribute("href", "/terms");
  });
});
