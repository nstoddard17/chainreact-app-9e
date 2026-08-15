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
 *   - GOOGLE LIMITED USE (GOOGLE-PRIVACY-LIMITED-USE-CLOSEOUT-1): the policy
 *     carries the disclosures Google's OAuth verification review requires —
 *     a dedicated Google API User Data section adhering to the Google API
 *     Services User Data Policy / Limited Use, the no-generalized-AI-training
 *     statement, the carve-out separating Google Workspace API data from the
 *     broad "improve ChainReact" uses, and explicit data-protection
 *     mechanisms (AES-256-GCM at rest, TLS in transit, server-side access
 *     controls). Concept-based assertions, not exact-paragraph matches.
 *   - HONESTY: no fabricated compliance / encryption claims (SOC 2 compliant,
 *     HIPAA compliant, GDPR compliant, CCPA compliant, end-to-end encrypted,
 *     zero-knowledge, penetration-tested, "we never collect personal data").
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
    expect(screen.getByRole("heading", { name: /Google API User Data/i })).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: /How we protect sensitive and connected-app data/i }),
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

describe("PrivacyPage — Google API User Data (Limited Use review disclosures)", () => {
  const pageText = () => {
    const { container } = render(<PrivacyPage />);
    return container.textContent ?? "";
  };

  it("links to the Google API Services User Data Policy and states Limited Use adherence", () => {
    render(<PrivacyPage />);
    const links = screen
      .getAllByRole("link")
      .filter(
        (a) =>
          a.getAttribute("href") ===
          "https://developers.google.com/terms/api-services-user-data-policy",
      );
    expect(links.length).toBeGreaterThan(0);
    const text = pageText();
    expect(text).toMatch(/Google API Services User Data Policy/i);
    expect(text).toMatch(/Limited Use requirements/i);
  });

  it("scopes Google Workspace API data to user-requested functionality and prohibited uses", () => {
    const text = pageText();
    expect(text).toMatch(/Google Workspace API data/i);
    expect(text).toMatch(/only as necessary to provide the Google-connected features/i);
    expect(text).toMatch(/does not sell Google user data/i);
    expect(text).toMatch(/advertising/i);
    expect(text).toMatch(/creditworthiness/i);
  });

  it("states Google Workspace API data is not used to train generalized/foundational AI models", () => {
    expect(pageText()).toMatch(
      /does not use Google Workspace API data to create, train, or improve generalized or foundational/i,
    );
  });

  it("states that connecting a Google account does not automatically send data to AI", () => {
    expect(pageText()).toMatch(
      /Connecting a Google account does not automatically send Google Workspace data to an AI service/i,
    );
  });

  it("carves Google Workspace API data out of the broad general-use language", () => {
    const text = pageText();
    expect(text).toMatch(/do not expand our permitted use of Google user data/i);
    expect(text).toMatch(/more limited uses described in the "Google API User Data" section/i);
  });
});

describe("PrivacyPage — data-protection mechanisms", () => {
  const pageText = () => {
    const { container } = render(<PrivacyPage />);
    return container.textContent ?? "";
  };

  it("discloses authenticated encryption at rest for stored OAuth tokens", () => {
    const text = pageText();
    expect(text).toMatch(/access and refresh tokens are encrypted before storage/i);
    expect(text).toMatch(/AES-256-GCM/i);
  });

  it("discloses encryption in transit (HTTPS/TLS)", () => {
    expect(pageText()).toMatch(/HTTPS \(TLS\)/i);
  });

  it("discloses account/workspace access controls enforced on the server", () => {
    const text = pageText();
    expect(text).toMatch(/membership, and role checks are enforced on the server/i);
    expect(text).toMatch(/scoped to the account or workspace that owns it/i);
  });

  it("keeps the honest 'no method is completely secure' qualification", () => {
    expect(pageText()).toMatch(/No method of storage or transmission is completely secure/i);
  });

  it("excludes credentials from AI model inputs", () => {
    expect(pageText()).toMatch(
      /OAuth tokens, credentials, and raw secrets are excluded from AI model inputs/i,
    );
  });
});

describe("PrivacyPage — honesty (no unproven claims)", () => {
  it("makes no certification, compliance, or strong-crypto claims", () => {
    const { container } = render(<PrivacyPage />);
    const text = container.textContent ?? "";
    expect(text).not.toMatch(/SOC\s*2\s*(compliant|certified)/i);
    expect(text).not.toMatch(/HIPAA\s*compliant/i);
    expect(text).not.toMatch(/GDPR\s*compliant/i);
    expect(text).not.toMatch(/CCPA\s*compliant/i);
    expect(text).not.toMatch(/end-to-end encrypted/i);
    expect(text).not.toMatch(/zero.knowledge/i);
    expect(text).not.toMatch(/penetration[- ]?test/i);
    expect(text).not.toMatch(/pen[- ]?tested/i);
    expect(text).not.toMatch(/we never store/i);
    expect(text).not.toMatch(/we never collect personal/i);
  });

  it("shows the updated policy date", () => {
    render(<PrivacyPage />);
    expect(screen.getByText(/Last updated August 15, 2026/i)).toBeInTheDocument();
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
