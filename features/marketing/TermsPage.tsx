import Link from "next/link";
import {
  CircleCheck,
  Zap,
  Users,
  Webhook,
  Box,
  AlertTriangle,
  CircleDot,
  CreditCard,
  Sparkles,
  Eye,
  Lock,
  History,
  Layers,
  MessageSquare,
  Split,
  Scale,
  ShieldCheck,
  Globe,
  Gavel,
  RefreshCw,
  Mail,
  Clock,
  Info,
  type LucideIcon,
} from "lucide-react";
import type { ReactNode } from "react";
import { MarketingHeader } from "./MarketingHeader";
import { MarketingFooter } from "./MarketingFooter";

/**
 * Public Terms of Service page (Slice 4.TERMS-1).
 *
 * Adapted from the Claude Design handoff (`Terms of Service.html` →
 * `src/terms-app.jsx`). The design's standalone token block, theme toggle,
 * scroll-progress bar, sticky TOC, and "Save as PDF" control are dropped in
 * favor of the established V2 sub-page idiom (see PrivacyPage / SecurityPage):
 * the page is wrapped in `[data-marketing-surface]` (dark-only, matching the
 * locked homepage decision) so it inherits the `--mk-*` tokens from
 * `globals.css`, and it stays a pure server component with no client JS.
 *
 * Wording is the legal copy supplied with the slice (21 numbered sections plus
 * a Contact block). Production values are filled in: legal entity
 * "ChainReact, Inc." and the legal@chainreact.app mailbox; the effective date
 * and version constants below advance with substantive edits (currently 3.1,
 * which added the Google API Limited Use carve-out). Texas governs. No em
 * dashes in visible copy.
 */

const TERMS_EMAIL = "legal@chainreact.app";
const ENTITY = "ChainReact, Inc.";
// Version 3.1 (GOOGLE-PRIVACY-LIMITED-USE-CLOSEOUT-1): adds the Google API /
// Limited Use carve-out to the User Content license. Substantive change, so the
// effective date and version advance per the page's established convention.
const EFFECTIVE = "August 15, 2026";
const VERSION = "3.1";

// One-paragraph plain-language summary (convenience only, not binding).
const SUMMARY =
  "These Terms are the agreement between you and ChainReact for using our workflow automation platform. You must be 18 and authorized to bind your organization. You own your workflows and data; you grant us a limited license to run the service. You are responsible for configuring workflows correctly, the third-party accounts you connect, and complying with the law. ChainReact is provided as is, our liability is limited, and Texas law governs. We may update these Terms, and continued use means you accept them.";

const INTRO: ReadonlyArray<string> = [
  `These Terms of Service govern your access to and use of ChainReact, including our website, application, workflow automation tools, integrations, services, and related features. These Terms form a binding agreement between you and ${ENTITY} (“ChainReact,” “we,” “us,” or “our”).`,
  "By creating an account, connecting an integration, creating or running a workflow, or otherwise using ChainReact, you agree to these Terms. If you do not agree to these Terms, you may not access or use ChainReact.",
];

type Block =
  | { p: string }
  | { olist: ReadonlyArray<string> }
  | { note: { tone: "info" | "warn"; text: string } }
  | { node: ReactNode };

interface Section {
  id: string;
  icon: LucideIcon;
  title: string;
  blocks: ReadonlyArray<Block>;
}

function TermsEmailLink() {
  return (
    <a className="tos-mail" href={`mailto:${TERMS_EMAIL}`}>
      {TERMS_EMAIL}
    </a>
  );
}

const SECTIONS: ReadonlyArray<Section> = [
  {
    id: "eligibility",
    icon: CircleCheck,
    title: "Eligibility",
    blocks: [
      {
        p: "You must be at least 18 years old and legally capable of entering into a binding agreement to use ChainReact. If you use ChainReact on behalf of a company, organization, or other entity, you represent that you have authority to bind that entity to these Terms. In that case, “you” and “your” refer to both you and the entity you represent.",
      },
    ],
  },
  {
    id: "service",
    icon: Zap,
    title: "Description of the Service",
    blocks: [
      {
        p: "ChainReact is a workflow automation platform that allows users to connect third-party services, create automated workflows, and move information between applications based on user-configured actions, triggers, and conditions.",
      },
      {
        p: "ChainReact may support integrations with third-party services such as Slack, Google, Microsoft, and other providers. Your use of any third-party service remains subject to that provider’s own terms, policies, permissions, and account requirements.",
      },
    ],
  },
  {
    id: "accounts",
    icon: Users,
    title: "Accounts and Workspaces",
    blocks: [
      {
        p: "You may be required to create an account to use ChainReact. You agree to provide accurate information and to keep your account information current.",
      },
      {
        p: "You are responsible for maintaining the confidentiality of your login credentials and for all activity that occurs under your account, workspace, team, or organization. You must notify us promptly if you believe your account has been accessed without authorization.",
      },
      {
        p: "If you create or administer a team or organization account, you are responsible for managing users, permissions, connected accounts, workflows, and any activity within that account.",
      },
    ],
  },
  {
    id: "integrations",
    icon: Webhook,
    title: "Third-Party Integrations and Permissions",
    blocks: [
      {
        p: "To use certain features, you may choose to connect ChainReact to third-party services. By connecting a third-party service, you authorize ChainReact to access, use, process, and transmit information from that service as necessary to provide the features you configure.",
      },
      {
        p: "You are responsible for ensuring that you have the right to connect any third-party account and to use any data, content, channel, file, message, contact, record, or other information made available through that connection.",
      },
      {
        note: {
          tone: "info",
          text: "ChainReact is not responsible for the availability, security, performance, accuracy, policies, or practices of third-party services. A third-party provider may change, suspend, revoke, or limit access to its service at any time, which may affect your workflows.",
        },
      },
    ],
  },
  {
    id: "user-content",
    icon: Box,
    title: "User Content and Workflow Data",
    blocks: [
      {
        p: "You retain ownership of the data, content, instructions, workflow definitions, files, messages, prompts, outputs, and other materials that you submit to or process through ChainReact.",
      },
      {
        p: "You grant ChainReact a limited license to host, process, transmit, display, and use your content only as necessary to provide, maintain, secure, improve, and support the Service.",
      },
      {
        node: (
          <p className="tos-p" key="google-limited-use">
            Information ChainReact receives from Google APIs, including Google Workspace APIs, is
            subject to the additional limitations described in our{" "}
            <Link className="tos-mail" href="/privacy">
              Privacy Policy
            </Link>{" "}
            and the{" "}
            <a
              className="tos-mail"
              href="https://developers.google.com/terms/api-services-user-data-policy"
              target="_blank"
              rel="noopener noreferrer"
            >
              Google API Services User Data Policy
            </a>
            , including its Limited Use requirements. Where those limitations are narrower than the
            license above, the narrower limitations control for that information.
          </p>
        ),
      },
      {
        p: "You are responsible for your workflows and for the data they access, send, modify, create, delete, or otherwise process. You should test workflows before using them in production or with important data.",
      },
    ],
  },
  {
    id: "acceptable-use",
    icon: AlertTriangle,
    title: "Acceptable Use",
    blocks: [
      { p: "You may not use ChainReact to:" },
      {
        olist: [
          "Violate any law, regulation, contract, or third-party right.",
          "Access, collect, process, or disclose data without proper authorization.",
          "Send spam, phishing messages, malware, malicious code, or deceptive communications.",
          "Harass, abuse, defame, threaten, or harm another person or organization.",
          "Interfere with or disrupt ChainReact, its infrastructure, or third-party services.",
          "Attempt to bypass usage limits, security controls, permissions, or access restrictions.",
          "Reverse engineer, scrape, copy, or misuse ChainReact except as permitted by law.",
          "Use ChainReact to build or operate a competing service without our prior written consent.",
          "Process sensitive personal data, protected health information, payment card data, or regulated data unless you have a written agreement with us that expressly permits that use.",
        ],
      },
      {
        p: "We may suspend or terminate access if we believe your use violates these Terms, creates risk, or may harm ChainReact, other users, third-party providers, or the public.",
      },
    ],
  },
  {
    id: "responsibilities",
    icon: CircleDot,
    title: "Customer Responsibilities",
    blocks: [
      { p: "You are responsible for:" },
      {
        olist: [
          "Configuring workflows correctly.",
          "Reviewing workflow actions before enabling them.",
          "Maintaining proper access controls within your account, team, or organization.",
          "Ensuring that connected third-party accounts have appropriate permissions.",
          "Complying with laws and third-party terms that apply to your data and workflows.",
          "Backing up important data where appropriate.",
          "Monitoring workflow results, errors, and automated actions.",
        ],
      },
      {
        note: {
          tone: "warn",
          text: "ChainReact does not guarantee that a workflow will always run successfully, at a specific time, or without interruption.",
        },
      },
    ],
  },
  {
    id: "billing",
    icon: CreditCard,
    title: "Plans, Fees, and Billing",
    blocks: [
      {
        p: "Some features may be free, while others may require a paid plan. If you purchase a paid plan, you agree to pay all fees, taxes, and charges associated with that plan.",
      },
      {
        p: "Fees, plan limits, billing periods, included usage, and overage charges will be disclosed during checkout or in the applicable plan details. Unless stated otherwise, fees are non-refundable except where required by law or expressly stated in a separate written agreement.",
      },
      {
        p: "We may change pricing or plan features from time to time. If a change affects an active paid subscription, we will provide notice as required by law or as otherwise described in the Service.",
      },
    ],
  },
  {
    id: "beta-ai",
    icon: Sparkles,
    title: "Beta Features and AI Features",
    blocks: [
      {
        p: "ChainReact may offer beta, experimental, preview, or AI-assisted features. These features may be incomplete, inaccurate, unavailable, or subject to change.",
      },
      {
        p: "You are responsible for reviewing outputs, recommendations, workflow configurations, and automated actions before relying on them. AI-assisted features may generate incorrect or incomplete information and should not be treated as legal, financial, medical, security, or other professional advice.",
      },
    ],
  },
  {
    id: "privacy",
    icon: Eye,
    title: "Privacy",
    blocks: [
      {
        node: (
          <p className="tos-p">
            Our{" "}
            <Link className="tos-mail" href="/privacy">
              Privacy Policy
            </Link>{" "}
            explains how we collect, use, disclose, and protect information. By using ChainReact, you
            agree that we may process information as described in the Privacy Policy.
          </p>
        ),
      },
    ],
  },
  {
    id: "security",
    icon: Lock,
    title: "Security",
    blocks: [
      {
        node: (
          <p className="tos-p">
            We use reasonable administrative, technical, and organizational measures designed to
            protect ChainReact and user data. However, no system is completely secure. You are
            responsible for using strong credentials, protecting your devices, managing user access,
            and promptly reporting suspected security issues. See our{" "}
            <Link className="tos-mail" href="/security">
              Security
            </Link>{" "}
            page for more.
          </p>
        ),
      },
    ],
  },
  {
    id: "availability",
    icon: History,
    title: "Service Availability and Changes",
    blocks: [
      {
        p: "We may modify, suspend, discontinue, or limit any part of ChainReact at any time. We may also perform maintenance, updates, or changes that affect availability or functionality.",
      },
      {
        p: "We are not liable for delays, failures, data loss, workflow errors, or interruptions caused by third-party services, internet providers, hosting providers, user configuration, force majeure events, or circumstances outside our reasonable control.",
      },
    ],
  },
  {
    id: "ip",
    icon: Layers,
    title: "Intellectual Property",
    blocks: [
      {
        p: "ChainReact and its software, design, features, interfaces, trademarks, logos, documentation, and other materials are owned by ChainReact or its licensors and are protected by intellectual property laws.",
      },
      {
        p: "Except for the rights expressly granted in these Terms, we do not grant you any rights in ChainReact or our intellectual property. You may not copy, modify, distribute, sell, lease, sublicense, or create derivative works from ChainReact except as expressly permitted by us in writing.",
      },
    ],
  },
  {
    id: "feedback",
    icon: MessageSquare,
    title: "Feedback",
    blocks: [
      {
        p: "If you provide ideas, suggestions, bug reports, comments, or other feedback, you grant us the right to use that feedback without restriction or compensation to you. We are not required to treat feedback as confidential.",
      },
    ],
  },
  {
    id: "termination",
    icon: Split,
    title: "Suspension and Termination",
    blocks: [
      {
        p: "You may stop using ChainReact at any time. You may also cancel your account or subscription through the available account settings or by contacting us.",
      },
      {
        p: "We may suspend or terminate your access if you violate these Terms, fail to pay amounts owed, create risk for ChainReact or others, or use the Service in a way that may cause legal, security, operational, or reputational harm.",
      },
      {
        p: "After termination, your right to use ChainReact ends immediately. Certain provisions of these Terms will survive termination, including provisions related to ownership, payment obligations, disclaimers, limitations of liability, indemnification, dispute resolution, and any other terms that by their nature should survive.",
      },
    ],
  },
  {
    id: "disclaimers",
    icon: AlertTriangle,
    title: "Disclaimers",
    blocks: [
      {
        p: "ChainReact is provided “as is” and “as available.” To the maximum extent permitted by law, we disclaim all warranties, whether express, implied, statutory, or otherwise, including warranties of merchantability, fitness for a particular purpose, title, non-infringement, availability, accuracy, reliability, and error-free operation.",
      },
      {
        p: "We do not warrant that ChainReact will meet your requirements, that workflows will run without error, that third-party integrations will remain available, or that data processed through workflows will always be complete, accurate, or delivered successfully.",
      },
    ],
  },
  {
    id: "liability",
    icon: Scale,
    title: "Limitation of Liability",
    blocks: [
      {
        p: "To the maximum extent permitted by law, ChainReact and its owners, officers, employees, contractors, affiliates, suppliers, and licensors will not be liable for any indirect, incidental, special, consequential, exemplary, or punitive damages, including lost profits, lost revenue, lost data, business interruption, loss of goodwill, or costs of substitute services.",
      },
      {
        p: "To the maximum extent permitted by law, our total liability for any claim arising out of or relating to these Terms or ChainReact will not exceed the greater of: (a) the amount you paid to ChainReact for the Service during the three months before the event giving rise to the claim, or (b) one hundred dollars ($100).",
      },
      {
        p: "Some jurisdictions do not allow certain limitations of liability, so some of the above limitations may not apply to you.",
      },
    ],
  },
  {
    id: "indemnification",
    icon: ShieldCheck,
    title: "Indemnification",
    blocks: [
      {
        p: "You agree to defend, indemnify, and hold harmless ChainReact and its owners, officers, employees, contractors, affiliates, suppliers, and licensors from and against any claims, damages, losses, liabilities, costs, and expenses, including reasonable attorneys’ fees, arising out of or related to:",
      },
      {
        olist: [
          "Your use of ChainReact.",
          "Your workflows, configurations, content, or data.",
          "Your connected third-party accounts or integrations.",
          "Your violation of these Terms.",
          "Your violation of any law, regulation, contract, or third-party right.",
          "Any activity under your account, workspace, team, or organization.",
        ],
      },
    ],
  },
  {
    id: "governing-law",
    icon: Globe,
    title: "Governing Law",
    blocks: [
      {
        p: "These Terms are governed by the laws of the State of Texas, without regard to its conflict of laws rules, unless applicable law requires otherwise.",
      },
    ],
  },
  {
    id: "disputes",
    icon: Gavel,
    title: "Dispute Resolution",
    blocks: [
      {
        node: (
          <p className="tos-p">
            Before filing a claim, you agree to contact us and attempt to resolve the dispute
            informally. You may contact us at <TermsEmailLink />. We will attempt to resolve the
            dispute in good faith.
          </p>
        ),
      },
      {
        p: "If the dispute cannot be resolved informally, any legal action arising out of or relating to these Terms or ChainReact will be brought in the state or federal courts located in Texas, unless applicable law requires a different venue.",
      },
    ],
  },
  {
    id: "changes",
    icon: RefreshCw,
    title: "Changes to These Terms",
    blocks: [
      {
        p: "We may update these Terms from time to time. If we make material changes, we will provide notice by posting the updated Terms, updating the effective date, or using another reasonable method. Your continued use of ChainReact after the updated Terms become effective means you accept the updated Terms.",
      },
    ],
  },
];

function BlockView({ block }: { block: Block }) {
  if ("p" in block) {
    return <p className="tos-p">{block.p}</p>;
  }
  if ("olist" in block) {
    return (
      <ol className="tos-olist">
        {block.olist.map((li, i) => (
          <li key={i}>
            <span className="tos-oli-n">{i + 1}</span>
            <span>{li}</span>
          </li>
        ))}
      </ol>
    );
  }
  if ("note" in block) {
    const { tone, text } = block.note;
    const Icon = tone === "warn" ? AlertTriangle : Info;
    return (
      <div className={"tos-note tone-" + tone}>
        <span className="tos-note-ic">
          <Icon size={15} aria-hidden strokeWidth={1.9} />
        </span>
        <span>{text}</span>
      </div>
    );
  }
  return <>{block.node}</>;
}

export function TermsPage() {
  return (
    <div data-marketing-surface className="tos-root" data-testid="terms-page">
      <MarketingHeader />

      <main className="tos-main">
        <div className="tos">
          {/* 1 — Hero */}
          <header className="tos-hero">
            <div className="tos-crumb">
              <Box size={12} aria-hidden />
              <span>Legal</span>
              <span className="tos-crumb-sep" aria-hidden>
                ›
              </span>
              <span className="tos-crumb-cur">Terms of Service</span>
            </div>
            <h1 className="tos-title">Terms of Service</h1>
            <p className="tos-lede">
              The agreement that governs your access to and use of ChainReact: your account,
              workflows, connected apps, billing, and the rules everyone plays by.
            </p>
            <div className="tos-meta">
              <span className="tos-meta-item">
                <Clock size={12} aria-hidden /> Effective {EFFECTIVE}
              </span>
              <span className="tos-meta-dot" aria-hidden />
              <span className="tos-meta-item">
                <CircleDot size={12} aria-hidden /> Version {VERSION}
              </span>
              <span className="tos-meta-dot" aria-hidden />
              <span className="tos-meta-item">
                <Eye size={12} aria-hidden /> ~9 min read
              </span>
            </div>
          </header>

          {/* 2 — Intro */}
          <section className="tos-intro" aria-label="Introduction">
            {INTRO.map((p, i) => (
              <p key={i} className="tos-p">
                {p}
              </p>
            ))}
          </section>

          {/* 3 — The short version */}
          <section className="tos-tldr" aria-label="Summary">
            <div className="tos-tldr-head">
              <span className="tos-tldr-badge" aria-hidden>
                <Sparkles size={13} />
              </span>
              <span>The short version</span>
            </div>
            <p className="tos-tldr-body">{SUMMARY}</p>
            <p className="tos-tldr-foot">
              This summary is for convenience only. The full sections below are the binding terms
              that govern your use of ChainReact.
            </p>
          </section>

          {/* 4 — Numbered sections */}
          <div className="tos-body">
            {SECTIONS.map((s, i) => {
              const Icon = s.icon;
              return (
                <section key={s.id} id={"tos-" + s.id} className="tos-sec">
                  <div className="tos-sec-head">
                    <span className="tos-sec-ic">
                      <Icon size={16} aria-hidden strokeWidth={1.75} />
                    </span>
                    <span className="tos-sec-n">{String(i + 1).padStart(2, "0")}</span>
                    <h2 className="tos-sec-title">{s.title}</h2>
                  </div>
                  <div className="tos-sec-body">
                    {s.blocks.map((b, j) => (
                      <BlockView key={j} block={b} />
                    ))}
                  </div>
                </section>
              );
            })}

            {/* Contact */}
            <section id="tos-contact" className="tos-contact">
              <div className="tos-contact-ic" aria-hidden>
                <Mail size={20} />
              </div>
              <div className="tos-contact-body">
                <h2 className="tos-contact-h">Contact</h2>
                <p className="tos-contact-p">
                  If you have questions about these Terms, contact us at <TermsEmailLink />.
                </p>
                <p className="tos-contact-entity">{ENTITY}</p>
                <a className="tos-contact-btn" href={`mailto:${TERMS_EMAIL}`}>
                  <Mail size={13} aria-hidden /> Email the legal team
                </a>
              </div>
            </section>
          </div>

          {/* 5 — Final CTA */}
          <section className="tos-final" aria-label="Get started with ChainReact">
            <h2 className="tos-final-h">Ready when you are</h2>
            <p className="tos-final-p">
              Connect your apps and automate the busywork. Build a workflow in minutes, on terms you
              can read in one sitting.
            </p>
            <div className="tos-final-actions">
              <Link className="tos-cta" href="/auth/sign-up" data-testid="terms-cta-get-started">
                Get started <span aria-hidden>→</span>
              </Link>
              <a
                className="tos-cta tos-cta-ghost"
                href={`mailto:${TERMS_EMAIL}`}
                data-testid="terms-cta-contact"
              >
                <Mail size={13} aria-hidden /> Contact legal
              </a>
            </div>
          </section>
        </div>
      </main>

      <MarketingFooter />

      <style>{`
        .tos-root {
          --tos-warn: #fbbf24;
          --tos-warn-soft: rgba(251, 191, 36, 0.10);
          position: relative;
          min-height: 100vh;
          font-family: var(--font-sans), ui-sans-serif, system-ui, sans-serif;
          font-size: 15px;
          line-height: 1.5;
          scroll-behavior: smooth;
          -webkit-font-smoothing: antialiased;
        }
        .tos-root a { text-decoration: none; }

        .tos-main { background: var(--mk-bg); }
        .tos { max-width: 880px; margin: 0 auto; padding: 52px 24px 90px; }

        .tos-hero { padding-bottom: 30px; border-bottom: 1px solid var(--mk-border); margin-bottom: 28px; }
        .tos-crumb { display:inline-flex; align-items:center; gap: 7px; font-size: 12px; color: var(--mk-muted); margin-bottom: 18px; }
        .tos-crumb :first-child { color: var(--mk-text-2); }
        .tos-crumb-sep { color: var(--mk-muted-2); }
        .tos-crumb-cur { color: var(--mk-text-2); font-weight: 500; }
        .tos-title { font-size: clamp(34px, 6vw, 44px); font-weight: 700; letter-spacing: -0.035em; margin: 0 0 14px; color: var(--mk-text); line-height: 1.05; }
        .tos-lede { font-size: 16.5px; line-height: 1.6; color: var(--mk-muted); max-width: 640px; margin: 0; text-wrap: pretty; }
        .tos-meta { display:flex; align-items:center; gap: 12px; margin-top: 24px; flex-wrap: wrap; }
        .tos-meta-item { display:inline-flex; align-items:center; gap: 6px; font-size: 12.5px; color: var(--mk-muted); font-variant-numeric: tabular-nums; }
        .tos-meta-item :first-child { color: var(--mk-muted-2); flex: none; }
        .tos-meta-dot { width: 3px; height: 3px; border-radius: 50%; background: var(--mk-muted-2); }

        .tos-intro { display:flex; flex-direction: column; gap: 14px; margin-bottom: 28px; }

        .tos-tldr { background: var(--mk-panel); border: 1px solid var(--mk-border); border-radius: 14px; padding: 22px 24px; margin-bottom: 44px; position: relative; overflow: hidden; }
        .tos-tldr::before { content: ""; position: absolute; left: 0; top: 14px; bottom: 14px; width: 3px; border-radius: 3px; background: var(--mk-accent); }
        .tos-tldr-head { display:flex; align-items:center; gap: 9px; font-size: 13px; font-weight: 600; color: var(--mk-text); margin-bottom: 12px; }
        .tos-tldr-badge { width: 26px; height: 26px; border-radius: 8px; background: var(--mk-accent-soft); color: var(--mk-text); display:flex; align-items:center; justify-content:center; flex: none; }
        .tos-tldr-body { font-size: 14.5px; line-height: 1.72; color: var(--mk-text-2); margin: 0; text-wrap: pretty; }
        .tos-tldr-foot { font-size: 12.5px; color: var(--mk-muted); margin: 12px 0 0; font-style: italic; }

        .tos-body { max-width: 720px; margin: 0 auto; }
        .tos-sec { padding: 30px 0; border-top: 1px solid var(--mk-border); }
        .tos-sec:first-child { border-top: 0; padding-top: 0; }
        .tos-sec-head { display:flex; align-items:center; gap: 12px; margin-bottom: 16px; }
        .tos-sec-ic { width: 34px; height: 34px; border-radius: 9px; background: var(--mk-panel); border: 1px solid var(--mk-border); color: var(--mk-text); display:flex; align-items:center; justify-content:center; flex-shrink: 0; }
        .tos-sec-n { font-family: var(--font-mono), ui-monospace, monospace; font-size: 12px; color: var(--mk-muted-2); font-weight: 600; }
        .tos-sec-title { font-size: 22px; font-weight: 600; letter-spacing: -0.02em; color: var(--mk-text); margin: 0; }
        .tos-sec-body { display:flex; flex-direction: column; gap: 13px; padding-left: 46px; }
        @media (max-width: 520px) { .tos-sec-body { padding-left: 0; } }

        .tos-p { font-size: 14.5px; line-height: 1.75; color: var(--mk-text-2); margin: 0; text-wrap: pretty; }
        .tos-mail { color: var(--mk-text); font-weight: 600; border-bottom: 1px solid var(--mk-border-strong); }
        .tos-mail:hover { border-bottom-color: var(--mk-text); }

        .tos-olist { list-style: none; margin: 0; padding: 0; display:flex; flex-direction: column; gap: 11px; }
        .tos-olist li { display:flex; align-items: flex-start; gap: 13px; font-size: 14.5px; line-height: 1.65; color: var(--mk-text-2); }
        .tos-oli-n { width: 22px; height: 22px; border-radius: 6px; background: var(--mk-accent-soft); border: 1px solid var(--mk-border); color: var(--mk-text); display:flex; align-items:center; justify-content:center; flex-shrink: 0; margin-top: 1px; font-family: var(--font-mono), ui-monospace, monospace; font-size: 11.5px; font-weight: 600; font-variant-numeric: tabular-nums; }

        .tos-note { display:flex; align-items: flex-start; gap: 11px; padding: 13px 15px; border-radius: 11px; font-size: 14px; line-height: 1.6; margin: 2px 0; color: var(--mk-text-2); text-wrap: pretty; }
        .tos-note-ic { flex-shrink: 0; margin-top: 1px; }
        .tos-note.tone-info { background: var(--mk-panel); border: 1px solid var(--mk-border-strong); }
        .tos-note.tone-info .tos-note-ic { color: var(--mk-text); }
        .tos-note.tone-warn { background: var(--tos-warn-soft); border: 1px solid color-mix(in oklab, var(--tos-warn) 32%, var(--mk-border)); }
        .tos-note.tone-warn .tos-note-ic { color: var(--tos-warn); }

        .tos-contact { display:flex; gap: 16px; padding: 26px; background: var(--mk-panel); border: 1px solid var(--mk-border); border-radius: 16px; margin-top: 20px; }
        @media (max-width: 560px) { .tos-contact { flex-direction: column; gap: 12px; } }
        .tos-contact-ic { width: 44px; height: 44px; border-radius: 12px; background: var(--mk-accent-soft); color: var(--mk-text); display:flex; align-items:center; justify-content:center; flex-shrink: 0; }
        .tos-contact-h { font-size: 16px; font-weight: 600; color: var(--mk-text); margin: 0 0 8px; letter-spacing: -0.01em; }
        .tos-contact-p { font-size: 14px; line-height: 1.65; color: var(--mk-text-2); margin: 0 0 4px; text-wrap: pretty; }
        .tos-contact-entity { font-size: 13px; color: var(--mk-muted); margin: 0; }
        .tos-contact-btn { display:inline-flex; align-items:center; gap: 7px; padding: 9px 15px; background: var(--mk-panel-2); border: 1px solid var(--mk-border); border-radius: 8px; font-size: 12.5px; font-weight: 500; color: var(--mk-text); margin-top: 12px; }
        .tos-contact-btn:hover { border-color: var(--mk-border-strong); }

        .tos-final { max-width: 700px; margin: 56px auto 0; text-align: center; padding: 44px 28px; background: var(--mk-panel); border: 1px solid var(--mk-border); border-radius: 18px; }
        .tos-final-h { font-size: clamp(26px, 5vw, 32px); font-weight: 700; letter-spacing: -0.025em; color: var(--mk-text); margin: 0 0 12px; }
        .tos-final-p { font-size: 15px; line-height: 1.65; color: var(--mk-muted); margin: 0 auto 24px; max-width: 540px; text-wrap: pretty; }
        .tos-final-actions { display:flex; gap: 10px; justify-content: center; flex-wrap: wrap; }
        .tos-cta { display:inline-flex; align-items:center; gap: 7px; padding: 10px 18px; background: var(--mk-text); color: var(--mk-bg); border: 1px solid var(--mk-text); border-radius: 8px; font-size: 13px; font-weight: 600; transition: transform .08s ease, filter .12s ease; }
        .tos-cta:hover { filter: brightness(1.1); transform: translateY(-1px); }
        .tos-cta-ghost { background: var(--mk-panel); color: var(--mk-text-2); border-color: var(--mk-border); }
        .tos-cta-ghost:hover { border-color: var(--mk-border-strong); color: var(--mk-text); filter: none; }
        .tos-cta:focus-visible, .tos-mail:focus-visible, .tos-contact-btn:focus-visible { outline: 2px solid var(--mk-accent); outline-offset: 2px; }

        #tos-contact { scroll-margin-top: 88px; }

        @media print {
          .mk-nav, .mkf, .tos-final-actions, .tos-contact-btn { display: none !important; }
        }
      `}</style>
    </div>
  );
}
