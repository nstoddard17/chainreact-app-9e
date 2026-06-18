import Link from "next/link";
import {
  ShieldCheck,
  KeyRound,
  Users,
  ScrollText,
  Sparkles,
  AlertTriangle,
  Lock,
  Webhook,
  CircleDot,
  Zap,
  Mail,
  CircleCheck,
  type LucideIcon,
} from "lucide-react";
import { MarketingHeader } from "./MarketingHeader";
import { MarketingFooter } from "./MarketingFooter";

/**
 * Public Security / Trust page (Slice 4.SECURITY-1).
 *
 * Adapted from the Claude Design handoff (`Security.html` →
 * `src/security-app.jsx`). The design's standalone token block + theme
 * toggle are dropped in favor of the app's marketing surface: the page is
 * wrapped in `[data-marketing-surface]` (dark-only, matching the locked
 * homepage decision) so it inherits the `--mk-*` tokens from `globals.css`.
 *
 * Server component — no client state. The "Report a vulnerability" hero
 * link is a plain in-page anchor (CSS `scroll-behavior: smooth`), so the
 * page needs no client JS.
 *
 * HONESTY (carried from the homepage slices): every claim describes how
 * ChainReact actually works today. No certification claims (SOC 2 / HIPAA /
 * GDPR), no "end-to-end encrypted" / "zero-knowledge" / "pen-tested"
 * language — only the account-scoped, OAuth-authorized, private-credential
 * model the codebase implements.
 */

const SECURITY_EMAIL = "security@chainreact.app";

interface Pillar {
  icon: LucideIcon;
  title: string;
  text: string;
}

// Hero trust points — the five primary positioning statements.
const TRUST_POINTS: ReadonlyArray<string> = [
  "Account-scoped access",
  "Protected OAuth connections",
  "Private credentials by default",
  "Controlled run visibility",
  "Careful AI data handling",
];

// Section 2 — security overview / trust cards (six pillars).
const PILLARS: ReadonlyArray<Pillar> = [
  {
    icon: ShieldCheck,
    title: "Account & workspace isolation",
    text: "Workflows, integrations, runs, and billing belong to the account or workspace that owns them. You only ever reach what you're a member of.",
  },
  {
    icon: KeyRound,
    title: "OAuth credential protection",
    text: "Connected apps are authorized through each provider's OAuth flow. Access tokens are used to run your workflows and are never shown back to you in the UI.",
  },
  {
    icon: Users,
    title: "Role-based team access",
    text: "Team members can view, edit, run, or manage workflows according to their role. Role checks are enforced on the server before sensitive actions.",
  },
  {
    icon: ScrollText,
    title: "Workflow run data controls",
    text: "Run history surfaces status, timing, and error classifications for debugging — while deliberately keeping raw secrets and tokens out of view.",
  },
  {
    icon: Sparkles,
    title: "AI safety boundaries",
    text: "AI features work from limited, allow-listed workflow context. Credentials, tokens, and raw provider secrets are never sent to a model.",
  },
  {
    icon: AlertTriangle,
    title: "Responsible disclosure",
    text: "Found an issue? Report it to our security team. We read every report and work with researchers in good faith to investigate and fix.",
  },
];

interface Section {
  id: string;
  icon: LucideIcon;
  title: string;
  feature?: boolean;
  pull?: string;
  blocks: ReadonlyArray<string>;
}

// Sections 3–7 — the detailed model.
const SECTIONS: ReadonlyArray<Section> = [
  {
    id: "account",
    icon: CircleDot,
    title: "Account and workspace security",
    blocks: [
      "Everything in ChainReact is scoped to the account or workspace that owns it. Workflows, integrations, run history, and billing all live inside that boundary.",
      "Personal and team accounts are separate ownership scopes. Team access is role-based: members can view, edit, run, or manage according to their role, and they only reach the accounts and workspaces they actually belong to.",
      "Server-side checks remain the source of truth for every access decision. There is no shared global pool of data — if you are not a member, you do not have access.",
    ],
  },
  {
    id: "oauth",
    icon: Webhook,
    title: "OAuth and connected apps",
    blocks: [
      "When you connect an app like Slack, Gmail, GitHub, or Notion, access is authorized through that provider's own OAuth flow. ChainReact requests only the scopes needed for the actions and triggers that integration supports, where each provider's API allows it.",
      "Tokens and secrets issued during that flow are used only to run the workflows you set up. They are never displayed back to you in the interface.",
      "You stay in control. Reconnect or disconnect any supported integration whenever you like — disconnecting may stop dependent workflows from running until the integration is reconnected.",
    ],
  },
  {
    id: "credentials",
    icon: Lock,
    feature: true,
    title: "Private credentials & team workflows",
    pull: "Team-visible does not automatically mean team-runnable.",
    blocks: [
      "Some connected accounts are personal. If a workflow runs on a private, member-connected credential, ChainReact does not automatically let other teammates run that workflow as the original connector.",
      "To run a shared workflow, a teammate connects their own account, duplicates the workflow, or uses a shared / account-level connection when supported. This keeps people from accidentally acting through someone else's private integration — and it's a feature we treat as core to trust, not a side effect.",
    ],
  },
  {
    id: "run-data",
    icon: Zap,
    title: "Workflow run and automation data",
    blocks: [
      "Workflow runs may contain execution status, step-level results, timestamps, and error details used for debugging. Run visibility is account-scoped — you see the history for the accounts you belong to.",
      "What we deliberately keep out of the interface: raw secrets, access tokens, and unnecessary private provider responses. Error views favor safe summaries and classifications over raw, secret-bearing payloads.",
    ],
  },
  {
    id: "ai",
    icon: Sparkles,
    title: "AI safety",
    blocks: [
      "Not everything uses a model. Deterministic checks — like basic workflow validation — run without any AI at all.",
      "When AI features do run (explaining a workflow issue, suggesting an improvement, or helping build or repair a workflow), they are designed to work from limited, allow-listed workflow context: the structure and configuration needed for the task. OAuth tokens, credentials, and raw provider secrets are not sent to models.",
      "AI suggestions are assistance, not authority. AI explains or assists — it does not silently make unsafe changes. You review and approve changes before they take effect.",
    ],
  },
];

function HeroIcon({ icon: Icon }: { icon: LucideIcon }) {
  return <Icon size={17} aria-hidden strokeWidth={1.75} />;
}

export function SecurityPage() {
  return (
    <div data-marketing-surface className="sec-root" data-testid="security-page">
      <MarketingHeader />

      <main className="sec-main">
        <div className="sec">
          {/* 1 — Hero */}
          <header className="sec-hero">
            <div className="sec-crumb">
              <Lock size={12} aria-hidden />
              <span>Trust</span>
              <span className="sec-crumb-sep" aria-hidden>
                ›
              </span>
              <span className="sec-crumb-cur">Security</span>
            </div>
            <h1 className="sec-title">Security built for connected workflows</h1>
            <p className="sec-lede">
              ChainReact is designed to protect your accounts, workflows, integrations, and
              automation data while giving teams the control they need to build safely.
            </p>
            <ul className="sec-points" aria-label="Primary trust points">
              {TRUST_POINTS.map((p) => (
                <li key={p} className="sec-point">
                  <CircleCheck size={13} aria-hidden /> {p}
                </li>
              ))}
            </ul>
            <div className="sec-hero-actions">
              <a className="sec-cta" href="#sec-disclosure">
                <AlertTriangle size={13} aria-hidden /> Report a vulnerability
              </a>
              <Link className="sec-cta sec-cta-ghost" href="/auth/sign-up">
                <Sparkles size={13} aria-hidden /> Get started
              </Link>
            </div>
          </header>

          {/* 2 — Trust cards */}
          <section className="sec-pillars-wrap" aria-labelledby="sec-overview-h">
            <h2 id="sec-overview-h" className="sec-sr-only">
              Security overview
            </h2>
            <div className="sec-pillars">
              {PILLARS.map((p) => (
                <div key={p.title} className="sec-pillar">
                  <span className="sec-pillar-ic">
                    <HeroIcon icon={p.icon} />
                  </span>
                  <h3 className="sec-pillar-title">{p.title}</h3>
                  <p className="sec-pillar-text">{p.text}</p>
                </div>
              ))}
            </div>
          </section>

          {/* 3–7 — detailed sections */}
          <div className="sec-body">
            {SECTIONS.map((s) => {
              const Icon = s.icon;
              return (
                <section
                  key={s.id}
                  id={"sec-" + s.id}
                  className={"sec-sec" + (s.feature ? " is-feature" : "")}
                >
                  <div className="sec-sec-head">
                    <span className="sec-sec-ic">
                      <Icon size={16} aria-hidden strokeWidth={1.75} />
                    </span>
                    <h2 className="sec-sec-title">{s.title}</h2>
                  </div>
                  {s.pull && (
                    <blockquote className="sec-pull">
                      <span className="sec-pull-mark" aria-hidden>
                        &ldquo;
                      </span>
                      {s.pull}
                    </blockquote>
                  )}
                  <div className="sec-sec-body">
                    {s.blocks.map((b, j) => (
                      <p key={j} className="sec-p">
                        {b}
                      </p>
                    ))}
                  </div>
                </section>
              );
            })}

            {/* 8 — Compliance status (honest) */}
            <section id="sec-compliance" className="sec-sec">
              <div className="sec-sec-head">
                <span className="sec-sec-ic">
                  <ShieldCheck size={16} aria-hidden strokeWidth={1.75} />
                </span>
                <h2 className="sec-sec-title">Compliance status</h2>
              </div>
              <div className="sec-sec-body">
                <p className="sec-p">
                  ChainReact is actively building toward stronger compliance and enterprise
                  readiness. We do not currently claim SOC&nbsp;2, HIPAA, or other formal compliance
                  certifications unless separately stated in writing.
                </p>
                <p className="sec-p">
                  For business or enterprise customers, security documentation, subprocessor lists,
                  and data processing terms may be expanded over time. If your organization needs
                  specific assurances, reach out and we&apos;ll share what we have today.
                </p>
              </div>
            </section>

            {/* 9 — Responsible disclosure */}
            <section id="sec-disclosure" className="sec-disclose">
              <div className="sec-disclose-ic" aria-hidden>
                <AlertTriangle size={20} />
              </div>
              <div className="sec-disclose-body">
                <h2 className="sec-disclose-h">Responsible disclosure</h2>
                <p className="sec-disclose-p">
                  If you believe you&apos;ve found a security issue, contact us at{" "}
                  <a className="sec-mail" href={`mailto:${SECURITY_EMAIL}`}>
                    {SECURITY_EMAIL}
                  </a>
                  . Please include a clear description of the issue, steps to reproduce it, affected
                  pages or endpoints, and any relevant screenshots or logs.
                </p>
                <p className="sec-disclose-p sec-disclose-muted">
                  Do not access, modify, or disclose other users&apos; data. Give us a reasonable
                  opportunity to investigate before public disclosure — we read every report and
                  will work with you in good faith.
                </p>
                <a className="sec-disclose-btn" href={`mailto:${SECURITY_EMAIL}`}>
                  <Mail size={13} aria-hidden /> Email the security team
                </a>
              </div>
            </section>

            <div className="sec-honest">
              <CircleCheck size={15} aria-hidden />
              <span>
                We&apos;re deliberate about what we claim. This page describes how ChainReact
                actually works today. We don&apos;t advertise certifications or guarantees we
                haven&apos;t earned — as our security program matures, this page will say so.
              </span>
            </div>
          </div>

          {/* 10 — Final CTA */}
          <section className="sec-final" aria-label="Get started with ChainReact">
            <h2 className="sec-final-h">Build workflows with confidence</h2>
            <p className="sec-final-p">
              Account-scoped access, protected connections, and careful AI handling — so you can
              automate the busywork without giving up control.
            </p>
            <div className="sec-final-actions">
              <Link className="sec-cta" href="/auth/sign-up" data-testid="security-cta-get-started">
                Get started <span aria-hidden>→</span>
              </Link>
              <a
                className="sec-cta sec-cta-ghost"
                href={`mailto:${SECURITY_EMAIL}`}
                data-testid="security-cta-contact"
              >
                <Mail size={13} aria-hidden /> Contact security
              </a>
            </div>
          </section>
        </div>
      </main>

      <MarketingFooter />

      <style>{`
        .sec-root {
          --sec-warn: #fbbf24;
          --sec-warn-soft: rgba(251, 191, 36, 0.10);
          position: relative;
          min-height: 100vh;
          font-family: var(--font-sans), ui-sans-serif, system-ui, sans-serif;
          font-size: 15px;
          line-height: 1.5;
          scroll-behavior: smooth;
          -webkit-font-smoothing: antialiased;
        }
        .sec-root a { text-decoration: none; }
        .sec-sr-only { position: absolute; width: 1px; height: 1px; padding: 0; margin: -1px; overflow: hidden; clip: rect(0,0,0,0); white-space: nowrap; border: 0; }

        .sec-main { background: var(--mk-bg); }
        .sec { max-width: 940px; margin: 0 auto; padding: 52px 24px 90px; }

        .sec-hero { text-align: center; max-width: 680px; margin: 0 auto 48px; }
        .sec-crumb { display:inline-flex; align-items:center; gap: 7px; font-size: 12px; color: var(--mk-muted); margin-bottom: 18px; }
        .sec-crumb :first-child { color: var(--mk-text-2); }
        .sec-crumb-sep { color: var(--mk-muted-2); }
        .sec-crumb-cur { color: var(--mk-text-2); font-weight: 500; }
        .sec-title { font-size: clamp(34px, 6vw, 46px); font-weight: 700; letter-spacing: -0.035em; margin: 0 0 16px; color: var(--mk-text); line-height: 1.05; }
        .sec-lede { font-size: 16.5px; line-height: 1.65; color: var(--mk-muted); margin: 0 auto; text-wrap: pretty; }
        .sec-points { list-style: none; margin: 24px 0 0; padding: 0; display: flex; flex-wrap: wrap; justify-content: center; gap: 8px 10px; }
        .sec-point { display:inline-flex; align-items:center; gap: 6px; font-size: 12.5px; font-weight: 500; color: var(--mk-text-2); background: var(--mk-panel); border: 1px solid var(--mk-border); border-radius: 999px; padding: 6px 12px; }
        .sec-point :first-child { color: var(--mk-success); flex: none; }
        .sec-hero-actions { display:flex; gap: 10px; justify-content: center; margin-top: 28px; flex-wrap: wrap; }
        .sec-cta { display:inline-flex; align-items:center; gap: 7px; padding: 10px 18px; background: var(--mk-text); color: var(--mk-bg); border: 1px solid var(--mk-text); border-radius: 8px; font-size: 13px; font-weight: 600; transition: transform .08s ease, filter .12s ease; }
        .sec-cta:hover { filter: brightness(1.1); transform: translateY(-1px); }
        .sec-cta-ghost { background: var(--mk-panel); color: var(--mk-text-2); border-color: var(--mk-border); }
        .sec-cta-ghost:hover { border-color: var(--mk-border-strong); color: var(--mk-text); filter: none; }
        .sec-cta:focus-visible, .sec-mail:focus-visible, .sec-disclose-btn:focus-visible { outline: 2px solid var(--mk-accent); outline-offset: 2px; }

        .sec-pillars { display: grid; grid-template-columns: repeat(3, 1fr); gap: 14px; margin-bottom: 56px; }
        @media (max-width: 880px) { .sec-pillars { grid-template-columns: 1fr 1fr; } }
        @media (max-width: 560px) { .sec-pillars { grid-template-columns: 1fr; } }
        .sec-pillar { background: var(--mk-panel); border: 1px solid var(--mk-border); border-radius: 14px; padding: 22px; transition: border-color .12s ease, transform .12s ease; }
        .sec-pillar:hover { border-color: var(--mk-border-strong); transform: translateY(-2px); }
        .sec-pillar-ic { width: 38px; height: 38px; border-radius: 10px; background: var(--mk-accent-soft); color: var(--mk-text); display:flex; align-items:center; justify-content:center; margin-bottom: 14px; }
        .sec-pillar-title { font-size: 14.5px; font-weight: 600; color: var(--mk-text); margin: 0 0 7px; letter-spacing: -0.01em; }
        .sec-pillar-text { font-size: 13px; line-height: 1.6; color: var(--mk-muted); margin: 0; text-wrap: pretty; }

        .sec-body { max-width: 700px; margin: 0 auto; }
        .sec-sec { padding: 28px 0; border-top: 1px solid var(--mk-border); }
        .sec-sec:first-child { border-top: 0; padding-top: 0; }
        .sec-sec-head { display:flex; align-items:center; gap: 12px; margin-bottom: 16px; }
        .sec-sec-ic { width: 34px; height: 34px; border-radius: 9px; background: var(--mk-panel); border: 1px solid var(--mk-border); color: var(--mk-text); display:flex; align-items:center; justify-content:center; flex-shrink: 0; }
        .sec-sec-title { font-size: 22px; font-weight: 600; letter-spacing: -0.02em; color: var(--mk-text); margin: 0; }
        .sec-sec-body { display:flex; flex-direction: column; gap: 13px; }
        .sec-p { font-size: 14.5px; line-height: 1.75; color: var(--mk-text-2); margin: 0; text-wrap: pretty; }
        .sec-mail { color: var(--mk-text); font-weight: 600; border-bottom: 1px solid var(--mk-border-strong); }
        .sec-mail:hover { border-bottom-color: var(--mk-text); }

        .sec-sec.is-feature { background: var(--mk-panel); border: 1px solid var(--mk-border-strong); border-radius: 16px; padding: 28px 30px; margin: 14px 0; }
        .sec-sec.is-feature .sec-sec-ic { background: var(--mk-accent); color: var(--mk-bg); border-color: var(--mk-accent); }
        .sec-pull { margin: 0 0 16px; padding: 0 0 0 2px; font-size: clamp(19px, 4vw, 23px); line-height: 1.35; font-weight: 600; letter-spacing: -0.02em; color: var(--mk-text); text-wrap: balance; }
        .sec-pull-mark { color: var(--mk-muted-2); margin-right: 2px; }

        .sec-disclose { display:flex; gap: 16px; padding: 26px; background: var(--mk-panel); border: 1px solid var(--mk-border); border-radius: 16px; margin-top: 16px; }
        @media (max-width: 560px) { .sec-disclose { flex-direction: column; gap: 12px; } }
        .sec-disclose-ic { width: 44px; height: 44px; border-radius: 12px; background: var(--sec-warn-soft); color: var(--sec-warn); display:flex; align-items:center; justify-content:center; flex-shrink: 0; }
        .sec-disclose-h { font-size: 16px; font-weight: 600; color: var(--mk-text); margin: 0 0 8px; letter-spacing: -0.01em; }
        .sec-disclose-p { font-size: 14px; line-height: 1.65; color: var(--mk-text-2); margin: 0 0 8px; text-wrap: pretty; }
        .sec-disclose-muted { color: var(--mk-muted); }
        .sec-disclose-btn { display:inline-flex; align-items:center; gap: 7px; padding: 9px 15px; background: var(--mk-panel-2); border: 1px solid var(--mk-border); border-radius: 8px; font-size: 12.5px; font-weight: 500; color: var(--mk-text); margin-top: 6px; }
        .sec-disclose-btn:hover { border-color: var(--mk-border-strong); }

        .sec-honest { display:flex; align-items: flex-start; gap: 11px; padding: 16px 18px; margin-top: 16px; background: var(--mk-success-soft); border: 1px solid color-mix(in oklab, var(--mk-success) 30%, var(--mk-border)); border-radius: 12px; font-size: 13.5px; line-height: 1.6; color: var(--mk-text-2); text-wrap: pretty; }
        .sec-honest :first-child { color: var(--mk-success); flex-shrink: 0; margin-top: 1px; }

        .sec-final { max-width: 700px; margin: 56px auto 0; text-align: center; padding: 44px 28px; background: var(--mk-panel); border: 1px solid var(--mk-border); border-radius: 18px; }
        .sec-final-h { font-size: clamp(26px, 5vw, 32px); font-weight: 700; letter-spacing: -0.025em; color: var(--mk-text); margin: 0 0 12px; }
        .sec-final-p { font-size: 15px; line-height: 1.65; color: var(--mk-muted); margin: 0 auto 24px; max-width: 520px; text-wrap: pretty; }
        .sec-final-actions { display:flex; gap: 10px; justify-content: center; flex-wrap: wrap; }

        #sec-disclosure { scroll-margin-top: 88px; }

        @media print {
          .mk-nav, .mkf, .sec-hero-actions, .sec-final-actions { display: none !important; }
        }
      `}</style>
    </div>
  );
}
