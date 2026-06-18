import Link from "next/link";
import {
  Lock,
  CircleCheck,
  AlertTriangle,
  Info,
  User,
  Users,
  Webhook,
  Zap,
  CreditCard,
  Sparkles,
  LifeBuoy,
  Clock,
  Database,
  SlidersHorizontal,
  Share2,
  BarChart3,
  Baby,
  Globe,
  Mail,
  type LucideIcon,
} from "lucide-react";
import { MarketingHeader } from "./MarketingHeader";
import { MarketingFooter } from "./MarketingFooter";

/**
 * Public Privacy page (Slice 4.PRIVACY-1).
 *
 * Adapted from the Claude Design handoff (`Privacy.html` →
 * `src/privacy-app.jsx`). The design's standalone token block, theme toggle,
 * scroll-progress bar, sticky TOC, and "Save as PDF" control are dropped in
 * favor of the established V2 sub-page idiom (see SecurityPage / Slice
 * 4.SECURITY-1): the page is wrapped in `[data-marketing-surface]`
 * (dark-only, matching the locked homepage decision) so it inherits the
 * `--mk-*` tokens from `globals.css`, and it stays a pure server component
 * with no client JS.
 *
 * The design source is a combined "Privacy & Terms" document; this page is
 * scoped to PRIVACY per the brief, restructured around the requested
 * privacy-focused sections.
 *
 * HONESTY (carried from the homepage + security slices): every claim
 * describes how ChainReact actually works today. No certification or
 * legal-compliance claims (SOC 2 / HIPAA / GDPR / CCPA), no "end-to-end
 * encrypted" / "zero-knowledge" / "we never collect personal data" language,
 * no named analytics vendors we aren't using, and no promised deletion
 * timelines. Only the account-scoped, OAuth-authorized, private-credential
 * model the codebase implements.
 */

const PRIVACY_EMAIL = "privacy@chainreact.app";
const UPDATED = "June 17, 2026";

// Hero positioning — the five primary privacy points.
const PRIVACY_POINTS: ReadonlyArray<string> = [
  "We use data to provide the service",
  "Connected app data powers authorized workflows",
  "We do not sell connected app data",
  "Workflow data is account-scoped",
  "AI features use limited, safe context",
];

interface Card {
  icon: LucideIcon;
  title: string;
  text: string;
}

// Section 2 — privacy overview / summary cards.
const CARDS: ReadonlyArray<Card> = [
  {
    icon: User,
    title: "Account information",
    text: "Name, email, login provider, and basic profile and authentication metadata used to create and secure your account.",
  },
  {
    icon: Users,
    title: "Workspace and team data",
    text: "Account and workspace names, membership, roles, invites, and settings for the workspaces you belong to.",
  },
  {
    icon: Webhook,
    title: "Connected app data",
    text: "Data and permissions you authorize through each provider's OAuth flow, used only to power the workflows you build.",
  },
  {
    icon: Zap,
    title: "Workflow and run data",
    text: "Workflow configuration, trigger and action settings, drafts, revisions, and run history with safe error summaries.",
  },
  {
    icon: CreditCard,
    title: "Billing and usage data",
    text: "Plan, subscription status, task usage, AI credit usage, and billing metadata for the account that owns the usage.",
  },
  {
    icon: Sparkles,
    title: "AI-assisted features",
    text: "Limited, allow-listed workflow context used by optional AI features — never tokens, credentials, or raw secrets.",
  },
  {
    icon: LifeBuoy,
    title: "Support and diagnostics",
    text: "Messages, screenshots, logs, and diagnostics you choose to share when you contact support.",
  },
  {
    icon: Clock,
    title: "Retention and deletion",
    text: "Data kept while needed to run the service, meet legal duties, and prevent abuse — with options to request deletion.",
  },
];

type Block =
  | { p: string }
  | { list: ReadonlyArray<string> }
  | { note: { tone: "info" | "good" | "warn"; text: string } };

interface Section {
  id: string;
  icon: LucideIcon;
  title: string;
  feature?: boolean;
  pull?: string;
  blocks: ReadonlyArray<Block>;
}

// Sections 3–14 — the detailed privacy model.
const SECTIONS: ReadonlyArray<Section> = [
  {
    id: "collect",
    icon: Database,
    title: "Information we collect",
    blocks: [
      {
        p: "ChainReact collects the information needed to provide the automation service. The amount and type depend on how you use ChainReact and which apps you connect.",
      },
      {
        list: [
          "Account details: your name, email address, login provider, profile details, and authentication metadata.",
          "Workspace details: account and workspace names, membership, roles, invites, and settings.",
          "Workflow details: workflow names, node configuration, trigger and action settings, drafts, active revisions, variables, and references between steps.",
          "Integration details: the connected provider, who owns the connection, connection status, required scopes, and reconnect or disconnect status.",
          "Run details: execution status, timestamps, node-level status, safe error summaries, usage data, and debugging information.",
          "Billing and usage details: your plan, subscription status, task usage, AI credit usage, and billing metadata.",
          "Support details: messages, screenshots, diagnostics, or logs you choose to share with our team.",
        ],
      },
      {
        note: {
          tone: "info",
          text: "Connected app data is accessed or processed only as needed to support the workflows, triggers, actions, and diagnostics you authorize. ChainReact does not copy the full contents of your third-party accounts by default.",
        },
      },
    ],
  },
  {
    id: "use",
    icon: SlidersHorizontal,
    title: "How we use information",
    blocks: [
      { p: "We use the information we collect to operate, secure, and improve ChainReact, including to:" },
      {
        list: [
          "Create and manage accounts and workspaces.",
          "Authenticate users and protect access.",
          "Build, save, validate, test, publish, and run workflows.",
          "Connect to the third-party apps you authorize.",
          "Display workflow history, run status, errors, and diagnostics.",
          "Enforce billing, usage limits, and AI credit limits.",
          "Improve reliability, security, and the product experience.",
          "Provide customer support.",
          "Detect abuse, investigate security issues, and comply with legal obligations.",
        ],
      },
    ],
  },
  {
    id: "connected-apps",
    icon: Webhook,
    title: "Connected apps and OAuth data",
    blocks: [
      {
        p: "When you connect a third-party app, that provider authorizes ChainReact to access certain data or perform certain actions. ChainReact uses those permissions to power the workflows, triggers, actions, and app features you choose to use.",
      },
      {
        list: [
          "Connected app access depends on the provider's OAuth flow and the scopes you approve.",
          "ChainReact aims to request only the scopes needed for supported features, where each provider's API allows it.",
          "Access tokens and credentials are protected and are not shown in the ChainReact interface.",
          "Disconnecting an app may stop dependent workflows from running until it is reconnected.",
          "Third-party providers have their own privacy policies and terms.",
        ],
      },
      { note: { tone: "good", text: "ChainReact does not sell connected app data." } },
    ],
  },
  {
    id: "workflow-data",
    icon: Zap,
    title: "Workflow, run, and automation data",
    blocks: [
      {
        p: "Workflows may include configuration, selected apps, trigger settings, action fields, templates, variable references, and automation logic. Workflow runs may include execution status, timestamps, step-level status, safe outputs, error classifications, and troubleshooting details.",
      },
      {
        list: [
          "Workflow and run data is scoped to the account or workspace that owns it.",
          "Team members may see workflow and run data depending on their role and workspace access.",
          "Run and error views are designed to avoid exposing raw secrets, tokens, or unnecessary provider payloads.",
          "Test runs and debugging data are handled carefully because they may include workflow content you provided.",
        ],
      },
    ],
  },
  {
    id: "team",
    icon: Users,
    feature: true,
    title: "Team and workspace privacy",
    pull: "Team-visible does not automatically mean team-runnable.",
    blocks: [
      {
        p: "Personal accounts and team accounts are separate ownership scopes. In a team workspace, certain workflow and integration details may be visible to other members depending on their role and the workflow's credential model.",
      },
      {
        p: "If a workflow uses a private or member-connected credential, ChainReact does not automatically let other teammates run that workflow as the original connector. Other members may need to duplicate the workflow, connect their own account, or use a shared or account-level connection where supported.",
      },
      {
        note: {
          tone: "info",
          text: "This protects users from accidentally letting other people run automations through their private connected accounts.",
        },
      },
    ],
  },
  {
    id: "ai",
    icon: Sparkles,
    title: "AI-assisted features and privacy",
    blocks: [
      {
        p: "ChainReact may use AI features to explain workflow issues, suggest improvements, create drafts, or help repair workflows. These features are designed to use limited, allow-listed workflow context and should not receive OAuth tokens, credentials, raw secrets, or unnecessary sensitive provider data.",
      },
      {
        list: [
          "Deterministic workflow checks, such as basic validation, can run without AI.",
          "AI features may process workflow structure, labels, safe summaries, and selected instructions you provide.",
          "AI usage may be metered separately through AI credits.",
        ],
      },
      {
        note: {
          tone: "warn",
          text: "AI-generated suggestions may be inaccurate. Review AI suggestions before applying or relying on them.",
        },
      },
    ],
  },
  {
    id: "telemetry",
    icon: BarChart3,
    title: "Cookies, analytics, and product telemetry",
    blocks: [
      {
        p: "ChainReact may use cookies, local storage, analytics, logs, and telemetry to operate and improve the service, including to:",
      },
      {
        list: [
          "Keep you signed in and maintain your session.",
          "Protect accounts, sessions, and security.",
          "Understand how the product is used.",
          "Improve performance and reliability.",
          "Debug errors and detect abuse.",
        ],
      },
      {
        note: {
          tone: "info",
          text: "As the product matures, analytics providers and other subprocessors may be listed separately. We avoid naming providers here that we are not actually using.",
        },
      },
    ],
  },
  {
    id: "sharing",
    icon: Share2,
    title: "Data sharing",
    blocks: [
      { p: "ChainReact may share limited information with:" },
      {
        list: [
          "Third-party app providers when you connect and run workflows.",
          "Service providers for hosting, databases, infrastructure, logging, analytics, payments, support, and AI features.",
          "Legal, security, or compliance parties when required by law or to protect the service.",
          "Other members of your workspace, according to account roles and workflow access.",
        ],
      },
      { note: { tone: "good", text: "ChainReact does not sell connected app data." } },
    ],
  },
  {
    id: "retention",
    icon: Clock,
    title: "Data retention and deletion",
    blocks: [
      {
        p: "ChainReact retains account, workflow, integration, billing, usage, and run data for as long as needed to provide the service, maintain security, comply with legal obligations, resolve disputes, prevent abuse, and improve reliability.",
      },
      {
        list: [
          "You may request deletion of certain account data.",
          "Deleted data may remain temporarily in backups, logs, or legally required records before it is fully removed.",
          "Billing and security records may be retained where required.",
          "Disconnecting an integration stops future access but may not immediately delete historical workflow or run records.",
        ],
      },
    ],
  },
  {
    id: "children",
    icon: Baby,
    title: "Children's privacy",
    blocks: [
      {
        p: "ChainReact is not intended for children under 13, and we do not knowingly collect personal information from children under 13. If you believe a child has provided personal information, contact us and we will take appropriate steps.",
      },
    ],
  },
  {
    id: "international",
    icon: Globe,
    title: "International users",
    blocks: [
      {
        p: "ChainReact may process and store information in the United States or other locations where our service providers operate. By using ChainReact, you understand that your information may be processed outside your country of residence.",
      },
    ],
  },
  {
    id: "choices",
    icon: SlidersHorizontal,
    title: "Your choices and controls",
    blocks: [
      { p: "Depending on your account, you may be able to:" },
      {
        list: [
          "Update your account information.",
          "Manage workspace membership.",
          "Connect, reconnect, or disconnect integrations.",
          "Delete or modify workflows.",
          "Adjust notification settings.",
          "Contact support or privacy for data questions or deletion requests.",
        ],
      },
    ],
  },
];

function BlockView({ block }: { block: Block }) {
  if ("p" in block) {
    return <p className="pp-p">{block.p}</p>;
  }
  if ("list" in block) {
    return (
      <ul className="pp-list">
        {block.list.map((li, i) => (
          <li key={i}>
            <span className="pp-li-dot" aria-hidden />
            <span>{li}</span>
          </li>
        ))}
      </ul>
    );
  }
  const { tone, text } = block.note;
  const Icon = tone === "good" ? CircleCheck : tone === "warn" ? AlertTriangle : Info;
  return (
    <div className={"pp-note tone-" + tone}>
      <span className="pp-note-ic">
        <Icon size={15} aria-hidden strokeWidth={1.9} />
      </span>
      <span>{text}</span>
    </div>
  );
}

export function PrivacyPage() {
  return (
    <div data-marketing-surface className="pp-root" data-testid="privacy-page">
      <MarketingHeader />

      <main className="pp-main">
        <div className="pp">
          {/* 1 — Hero */}
          <header className="pp-hero">
            <div className="pp-crumb">
              <Lock size={12} aria-hidden />
              <span>Legal</span>
              <span className="pp-crumb-sep" aria-hidden>
                ›
              </span>
              <span className="pp-crumb-cur">Privacy</span>
            </div>
            <h1 className="pp-title">Privacy for connected automation</h1>
            <p className="pp-lede">
              ChainReact is designed to help you automate work across your apps while being clear
              about the data we collect, how we use it, and how we protect connected workflow
              information.
            </p>
            <ul className="pp-points" aria-label="Primary privacy points">
              {PRIVACY_POINTS.map((p) => (
                <li key={p} className="pp-point">
                  <CircleCheck size={13} aria-hidden /> {p}
                </li>
              ))}
            </ul>
            <p className="pp-updated">
              <Clock size={12} aria-hidden /> Last updated {UPDATED}
            </p>
          </header>

          {/* 2 — Privacy overview / summary cards */}
          <section className="pp-cards" aria-label="Privacy overview">
            {CARDS.map((c) => {
              const Icon = c.icon;
              return (
                <div key={c.title} className="pp-card">
                  <span className="pp-card-ic">
                    <Icon size={17} aria-hidden strokeWidth={1.75} />
                  </span>
                  <h2 className="pp-card-title">{c.title}</h2>
                  <p className="pp-card-text">{c.text}</p>
                </div>
              );
            })}
          </section>

          {/* 3–14 — detailed sections */}
          <div className="pp-body">
            {SECTIONS.map((s, i) => {
              const Icon = s.icon;
              return (
                <section
                  key={s.id}
                  id={"pp-" + s.id}
                  className={"pp-sec" + (s.feature ? " is-feature" : "")}
                >
                  <div className="pp-sec-head">
                    <span className="pp-sec-ic">
                      <Icon size={16} aria-hidden strokeWidth={1.75} />
                    </span>
                    <span className="pp-sec-n">{String(i + 1).padStart(2, "0")}</span>
                    <h2 className="pp-sec-title">{s.title}</h2>
                  </div>
                  {s.pull && (
                    <blockquote className="pp-pull">
                      <span className="pp-pull-mark" aria-hidden>
                        &ldquo;
                      </span>
                      {s.pull}
                    </blockquote>
                  )}
                  <div className="pp-sec-body">
                    {s.blocks.map((b, j) => (
                      <BlockView key={j} block={b} />
                    ))}
                  </div>
                </section>
              );
            })}

            {/* 15 — Contact */}
            <section id="pp-contact" className="pp-contact">
              <div className="pp-contact-ic" aria-hidden>
                <Mail size={20} />
              </div>
              <div className="pp-contact-body">
                <h2 className="pp-contact-h">Contact us about privacy</h2>
                <p className="pp-contact-p">
                  For privacy questions, requests, or concerns — including data access or deletion
                  requests — contact us at{" "}
                  <a className="pp-mail" href={`mailto:${PRIVACY_EMAIL}`}>
                    {PRIVACY_EMAIL}
                  </a>
                  .
                </p>
                <a className="pp-contact-btn" href={`mailto:${PRIVACY_EMAIL}`}>
                  <Mail size={13} aria-hidden /> Email the privacy team
                </a>
              </div>
            </section>

            <div className="pp-honest">
              <CircleCheck size={15} aria-hidden />
              <span>
                We&apos;re deliberate about what we claim. This page describes how ChainReact
                actually works today. We don&apos;t advertise certifications, legal compliance, or
                privacy guarantees we haven&apos;t earned — as our privacy program matures, this
                page will say so.
              </span>
            </div>
          </div>

          {/* 16 — Final CTA */}
          <section className="pp-final" aria-label="Get started with ChainReact">
            <h2 className="pp-final-h">Build with clarity and control</h2>
            <p className="pp-final-p">
              Account-scoped data, authorized connections, and careful AI handling — so you can
              automate the busywork while staying clear on how your data is used.
            </p>
            <div className="pp-final-actions">
              <Link className="pp-cta" href="/auth/sign-up" data-testid="privacy-cta-get-started">
                Get started <span aria-hidden>→</span>
              </Link>
              <a
                className="pp-cta pp-cta-ghost"
                href={`mailto:${PRIVACY_EMAIL}`}
                data-testid="privacy-cta-contact"
              >
                <Mail size={13} aria-hidden /> Contact privacy
              </a>
            </div>
          </section>
        </div>
      </main>

      <MarketingFooter />

      <style>{`
        .pp-root {
          --pp-warn: #fbbf24;
          --pp-warn-soft: rgba(251, 191, 36, 0.10);
          position: relative;
          min-height: 100vh;
          font-family: var(--font-sans), ui-sans-serif, system-ui, sans-serif;
          font-size: 15px;
          line-height: 1.5;
          scroll-behavior: smooth;
          -webkit-font-smoothing: antialiased;
        }
        .pp-root a { text-decoration: none; }

        .pp-main { background: var(--mk-bg); }
        .pp { max-width: 940px; margin: 0 auto; padding: 52px 24px 90px; }

        .pp-hero { text-align: center; max-width: 700px; margin: 0 auto 48px; }
        .pp-crumb { display:inline-flex; align-items:center; gap: 7px; font-size: 12px; color: var(--mk-muted); margin-bottom: 18px; }
        .pp-crumb :first-child { color: var(--mk-text-2); }
        .pp-crumb-sep { color: var(--mk-muted-2); }
        .pp-crumb-cur { color: var(--mk-text-2); font-weight: 500; }
        .pp-title { font-size: clamp(34px, 6vw, 46px); font-weight: 700; letter-spacing: -0.035em; margin: 0 0 16px; color: var(--mk-text); line-height: 1.05; }
        .pp-lede { font-size: 16.5px; line-height: 1.65; color: var(--mk-muted); margin: 0 auto; text-wrap: pretty; }
        .pp-points { list-style: none; margin: 24px 0 0; padding: 0; display: flex; flex-wrap: wrap; justify-content: center; gap: 8px 10px; }
        .pp-point { display:inline-flex; align-items:center; gap: 6px; font-size: 12.5px; font-weight: 500; color: var(--mk-text-2); background: var(--mk-panel); border: 1px solid var(--mk-border); border-radius: 999px; padding: 6px 12px; }
        .pp-point :first-child { color: var(--mk-success); flex: none; }
        .pp-updated { display:inline-flex; align-items:center; gap: 6px; font-size: 12.5px; color: var(--mk-muted); margin: 22px 0 0; font-variant-numeric: tabular-nums; }
        .pp-updated :first-child { color: var(--mk-muted-2); }

        .pp-cards { display: grid; grid-template-columns: repeat(4, 1fr); gap: 14px; margin-bottom: 56px; }
        @media (max-width: 880px) { .pp-cards { grid-template-columns: 1fr 1fr; } }
        @media (max-width: 520px) { .pp-cards { grid-template-columns: 1fr; } }
        .pp-card { background: var(--mk-panel); border: 1px solid var(--mk-border); border-radius: 14px; padding: 20px; transition: border-color .12s ease, transform .12s ease; }
        .pp-card:hover { border-color: var(--mk-border-strong); transform: translateY(-2px); }
        .pp-card-ic { width: 38px; height: 38px; border-radius: 10px; background: var(--mk-accent-soft); color: var(--mk-text); display:flex; align-items:center; justify-content:center; margin-bottom: 14px; }
        .pp-card-title { font-size: 14px; font-weight: 600; color: var(--mk-text); margin: 0 0 7px; letter-spacing: -0.01em; }
        .pp-card-text { font-size: 12.5px; line-height: 1.6; color: var(--mk-muted); margin: 0; text-wrap: pretty; }

        .pp-body { max-width: 720px; margin: 0 auto; }
        .pp-sec { padding: 30px 0; border-top: 1px solid var(--mk-border); }
        .pp-sec:first-child { border-top: 0; padding-top: 0; }
        .pp-sec-head { display:flex; align-items:center; gap: 12px; margin-bottom: 16px; }
        .pp-sec-ic { width: 34px; height: 34px; border-radius: 9px; background: var(--mk-panel); border: 1px solid var(--mk-border); color: var(--mk-text); display:flex; align-items:center; justify-content:center; flex-shrink: 0; }
        .pp-sec-n { font-family: var(--font-mono), ui-monospace, monospace; font-size: 12px; color: var(--mk-muted-2); font-weight: 600; }
        .pp-sec-title { font-size: 22px; font-weight: 600; letter-spacing: -0.02em; color: var(--mk-text); margin: 0; }
        .pp-sec-body { display:flex; flex-direction: column; gap: 13px; padding-left: 46px; }
        @media (max-width: 520px) { .pp-sec-body { padding-left: 0; } }
        .pp-p { font-size: 14.5px; line-height: 1.75; color: var(--mk-text-2); margin: 0; text-wrap: pretty; }
        .pp-mail { color: var(--mk-text); font-weight: 600; border-bottom: 1px solid var(--mk-border-strong); }
        .pp-mail:hover { border-bottom-color: var(--mk-text); }

        .pp-list { list-style: none; margin: 0; padding: 0; display:flex; flex-direction: column; gap: 10px; }
        .pp-list li { display:flex; align-items: flex-start; gap: 11px; font-size: 14.5px; line-height: 1.6; color: var(--mk-text-2); }
        .pp-li-dot { width: 6px; height: 6px; border-radius: 50%; background: var(--mk-muted-2); flex-shrink: 0; margin-top: 9px; }

        .pp-note { display:flex; align-items: flex-start; gap: 11px; padding: 13px 15px; border-radius: 11px; font-size: 14px; line-height: 1.6; margin: 2px 0; color: var(--mk-text-2); text-wrap: pretty; }
        .pp-note-ic { flex-shrink: 0; margin-top: 1px; }
        .pp-note.tone-info { background: var(--mk-panel); border: 1px solid var(--mk-border-strong); }
        .pp-note.tone-info .pp-note-ic { color: var(--mk-text); }
        .pp-note.tone-good { background: var(--mk-success-soft); border: 1px solid color-mix(in oklab, var(--mk-success) 32%, var(--mk-border)); color: var(--mk-text); font-weight: 500; }
        .pp-note.tone-good .pp-note-ic { color: var(--mk-success); }
        .pp-note.tone-warn { background: var(--pp-warn-soft); border: 1px solid color-mix(in oklab, var(--pp-warn) 32%, var(--mk-border)); }
        .pp-note.tone-warn .pp-note-ic { color: var(--pp-warn); }

        .pp-sec.is-feature { background: var(--mk-panel); border: 1px solid var(--mk-border-strong); border-radius: 16px; padding: 28px 30px; margin: 14px 0; }
        .pp-sec.is-feature .pp-sec-ic { background: var(--mk-accent); color: var(--mk-bg); border-color: var(--mk-accent); }
        .pp-sec.is-feature .pp-sec-body { padding-left: 0; }
        .pp-pull { margin: 0 0 16px; padding: 0 0 0 2px; font-size: clamp(19px, 4vw, 23px); line-height: 1.35; font-weight: 600; letter-spacing: -0.02em; color: var(--mk-text); text-wrap: balance; }
        .pp-pull-mark { color: var(--mk-muted-2); margin-right: 2px; }

        .pp-contact { display:flex; gap: 16px; padding: 26px; background: var(--mk-panel); border: 1px solid var(--mk-border); border-radius: 16px; margin-top: 16px; }
        @media (max-width: 560px) { .pp-contact { flex-direction: column; gap: 12px; } }
        .pp-contact-ic { width: 44px; height: 44px; border-radius: 12px; background: var(--mk-accent-soft); color: var(--mk-text); display:flex; align-items:center; justify-content:center; flex-shrink: 0; }
        .pp-contact-h { font-size: 16px; font-weight: 600; color: var(--mk-text); margin: 0 0 8px; letter-spacing: -0.01em; }
        .pp-contact-p { font-size: 14px; line-height: 1.65; color: var(--mk-text-2); margin: 0 0 8px; text-wrap: pretty; }
        .pp-contact-btn { display:inline-flex; align-items:center; gap: 7px; padding: 9px 15px; background: var(--mk-panel-2); border: 1px solid var(--mk-border); border-radius: 8px; font-size: 12.5px; font-weight: 500; color: var(--mk-text); margin-top: 6px; }
        .pp-contact-btn:hover { border-color: var(--mk-border-strong); }

        .pp-honest { display:flex; align-items: flex-start; gap: 11px; padding: 16px 18px; margin-top: 16px; background: var(--mk-success-soft); border: 1px solid color-mix(in oklab, var(--mk-success) 30%, var(--mk-border)); border-radius: 12px; font-size: 13.5px; line-height: 1.6; color: var(--mk-text-2); text-wrap: pretty; }
        .pp-honest :first-child { color: var(--mk-success); flex-shrink: 0; margin-top: 1px; }

        .pp-final { max-width: 700px; margin: 56px auto 0; text-align: center; padding: 44px 28px; background: var(--mk-panel); border: 1px solid var(--mk-border); border-radius: 18px; }
        .pp-final-h { font-size: clamp(26px, 5vw, 32px); font-weight: 700; letter-spacing: -0.025em; color: var(--mk-text); margin: 0 0 12px; }
        .pp-final-p { font-size: 15px; line-height: 1.65; color: var(--mk-muted); margin: 0 auto 24px; max-width: 540px; text-wrap: pretty; }
        .pp-final-actions { display:flex; gap: 10px; justify-content: center; flex-wrap: wrap; }
        .pp-cta { display:inline-flex; align-items:center; gap: 7px; padding: 10px 18px; background: var(--mk-text); color: var(--mk-bg); border: 1px solid var(--mk-text); border-radius: 8px; font-size: 13px; font-weight: 600; transition: transform .08s ease, filter .12s ease; }
        .pp-cta:hover { filter: brightness(1.1); transform: translateY(-1px); }
        .pp-cta-ghost { background: var(--mk-panel); color: var(--mk-text-2); border-color: var(--mk-border); }
        .pp-cta-ghost:hover { border-color: var(--mk-border-strong); color: var(--mk-text); filter: none; }
        .pp-cta:focus-visible, .pp-mail:focus-visible, .pp-contact-btn:focus-visible { outline: 2px solid var(--mk-accent); outline-offset: 2px; }

        #pp-contact { scroll-margin-top: 88px; }

        @media print {
          .mk-nav, .mkf, .pp-final-actions, .pp-contact-btn { display: none !important; }
        }
      `}</style>
    </div>
  );
}
