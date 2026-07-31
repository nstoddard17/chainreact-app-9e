import Link from "next/link";
import {
  Sparkles,
  Zap,
  Users,
  Building2,
  Landmark,
  Check,
  Bot,
  Gauge,
  ShieldCheck,
  Layers,
  Mail,
  type LucideIcon,
} from "lucide-react";
import { MarketingHeader } from "./MarketingHeader";
import { MarketingFooter } from "./MarketingFooter";
import {
  PLAN_TIERS,
  type PlanTier,
  planLimitsFor,
  planTierLabel,
  aiCreditsMonthlyLimitFor,
  templateLimitFor,
  canBulkExportForPlan,
} from "@/core/billing/planPolicy";
import { isTrialEligiblePlan } from "@/core/billing/trialPolicy";
import { resolveTrialPeriodDays } from "@/core/billing/platformTrialConfig";

/**
 * Public Pricing page (Slice 4.PRICING-1).
 *
 * Adapted from the Claude Design handoff (`Pricing.html` →
 * `src/pricing-app.jsx`). The design's standalone token block, theme toggle,
 * monthly/yearly billing toggle, and client-side accordion are dropped in
 * favor of the established V2 sub-page idiom (see PrivacyPage / SecurityPage):
 * a pure server component wrapped in `[data-marketing-surface]` (dark-only,
 * matching the locked homepage decision) inheriting the `--mk-*` tokens from
 * `globals.css`, with no client JS. The FAQ uses native `<details>` so it
 * stays keyboard-accessible without state.
 *
 * ADAPTATIONS FROM THE DESIGN:
 *  - The design ships THREE invented tiers (Free / Solo / Team) with invented
 *    dollar prices ($19 / $49), invented limits ("1,000 runs", "247 apps") and
 *    a "Save ~20%" annual toggle. ChainReact's real plan model has FIVE tiers
 *    (Free / Pro / Team / Business / Enterprise) defined in
 *    `core/billing/planPolicy.ts`, and NO dollar prices exist anywhere in the
 *    repo yet. So the cards/table are rebuilt on the real five-tier policy, the
 *    member / AI-credit / folder / template / bulk-export numbers are read
 *    straight from `planPolicy` (single source of truth, so they can't drift),
 *    and NO dollar amounts and NO billing toggle are shown (there is no
 *    decided price and no live checkout to honor them).
 *
 * HONESTY (carried from the homepage / privacy / security slices): every claim
 * describes how ChainReact actually works or is honestly framed as not-final.
 * No invented dollar prices, no "Save 20%", no live checkout. AI-credit and
 * (beyond Free/Pro) task limits are framed as current direction that may change.
 * (`planPolicy` itself marks several as placeholders pending owner pricing.)
 * Enterprise security/DPA language is "by arrangement" / "when available", with
 * no SOC 2 / SSO / SCIM / HIPAA / SLA claims. Paid upgrades route to sign-up
 * (start free, upgrade in-app later) or to sales, never a fake "Buy now".
 */

const SALES_EMAIL = "sales@chainreact.app";
const SALES_MAILTO = `mailto:${SALES_EMAIL}`;
const SIGN_UP = "/auth/sign-up";

const fmt = (n: number) => n.toLocaleString("en-US");

/**
 * Launch prices. Source of truth: docs/billing/pricing-and-tiers.md (PRICING-LOCK-1,
 * owner-approved). `month` = month-to-month price per month; `annual` = price per month when
 * billed annually. No dollar amounts live elsewhere in code (Stripe holds the Price ids);
 * these mirror the canonical doc's Price summary table.
 */
const PRICES: Readonly<Record<"pro" | "team" | "business", { month: number; annual: number }>> = {
  pro: { month: 25, annual: 19 },
  team: { month: 75, annual: 59 },
  business: { month: 249, annual: 199 },
};

// ─── Per-tier card view, with the real numbers sourced from planPolicy ──────────

interface TierView {
  tier: PlanTier;
  icon: LucideIcon;
  tagline: string;
  who: string;
  /** Big value line: capacity, not a price (no dollar prices exist yet). */
  big: string;
  bigUnit: string;
  priceNote: string;
  bullets: ReadonlyArray<string>;
  cta: { label: string; href: string; external?: boolean; kind: "primary" | "ghost" };
  featured?: boolean;
}

const TIERS: ReadonlyArray<TierView> = [
  {
    tier: "free",
    icon: Sparkles,
    tagline: "Get started",
    who: "Try ChainReact and automate your first personal workflows.",
    big: "$0",
    bigUnit: "",
    priceNote: "Free forever · no card needed",
    bullets: [
      `${fmt(planLimitsFor("free").taskLimit ?? 100)} workflow tasks a month`,
      `${fmt(aiCreditsMonthlyLimitFor("free") ?? 0)} AI credits a month`,
      "Connect any supported app",
      "Built-in templates",
      "Manual runs and testing",
      "Email support",
    ],
    cta: { label: "Start free", href: SIGN_UP, kind: "ghost" },
  },
  {
    tier: "pro",
    icon: Zap,
    tagline: "For power users",
    who: "For individuals who automate every day.",
    big: `$${PRICES.pro.month}`,
    bigUnit: "/ mo",
    priceNote: `or $${PRICES.pro.annual}/mo billed annually`,
    bullets: [
      `${fmt(planLimitsFor("pro").taskLimit ?? 1000)} workflow tasks a month`,
      `${fmt(aiCreditsMonthlyLimitFor("pro") ?? 0)} AI credits a month`,
      `Up to ${fmt(templateLimitFor("pro") ?? 0)} custom templates`,
      "Full activity history",
      "Whole-account bulk export",
      "Priority email support",
    ],
    cta: { label: "Get started", href: SIGN_UP, kind: "primary" },
    featured: true,
  },
  {
    tier: "team",
    icon: Users,
    tagline: "For small teams",
    who: "For small teams building shared workflows together.",
    big: `$${PRICES.team.month}`,
    bigUnit: "/ mo",
    priceNote: `or $${PRICES.team.annual}/mo billed annually`,
    bullets: [
      "Everything in Pro, for the whole team",
      `Up to ${fmt(planLimitsFor("team").memberLimit ?? 5)} members included`,
      `${fmt(aiCreditsMonthlyLimitFor("team") ?? 0)} AI credits a month`,
      "Shared team workspace",
      "Role-based access",
      "Account-level connections where supported",
    ],
    cta: { label: "Get started", href: SIGN_UP, kind: "ghost" },
  },
  {
    tier: "business",
    icon: Building2,
    tagline: "For growing teams",
    who: "For growing teams running operational workflows.",
    big: `$${PRICES.business.month}`,
    bigUnit: "/ mo",
    priceNote: `or $${PRICES.business.annual}/mo billed annually`,
    bullets: [
      "Everything in Team",
      `Up to ${fmt(planLimitsFor("business").memberLimit ?? 25)} members`,
      `${fmt(aiCreditsMonthlyLimitFor("business") ?? 0)} AI credits a month`,
      "Larger folder and template limits",
      "Advanced team management",
      "Priority support",
    ],
    cta: { label: "Contact sales", href: SALES_MAILTO, external: true, kind: "ghost" },
  },
  {
    tier: "enterprise",
    icon: Landmark,
    tagline: "For organizations",
    who: "For organizations with advanced security, support, and procurement needs.",
    big: "Custom",
    bigUnit: "",
    priceNote: "Limits & terms by arrangement",
    bullets: [
      "Custom member and usage limits",
      "Security review by arrangement",
      "DPA and procurement support when available",
      "Custom onboarding",
      "Dedicated support",
    ],
    cta: { label: "Contact sales", href: SALES_MAILTO, external: true, kind: "ghost" },
  },
];

// ─── Comparison table: repo-backed numbers, honest qualitative copy elsewhere ──

type CellVal = boolean | string;

/** Build a per-tier record from a function so computed rows can't drift from policy. */
function byTier(fn: (t: PlanTier) => CellVal): Record<PlanTier, CellVal> {
  return Object.fromEntries(PLAN_TIERS.map((t) => [t, fn(t)])) as Record<PlanTier, CellVal>;
}

/** Explicit per-tier record for qualitative rows the policy doesn't define numerically. */
function rec(
  free: CellVal,
  pro: CellVal,
  team: CellVal,
  business: CellVal,
  enterprise: CellVal,
): Record<PlanTier, CellVal> {
  return { free, pro, team, business, enterprise };
}

const memberCell = (t: PlanTier): CellVal => {
  const v = planLimitsFor(t).memberLimit;
  if (v == null) return "Custom";
  return t === "team" || t === "business" ? `Up to ${fmt(v)}` : fmt(v);
};
const aiCell = (t: PlanTier): CellVal => {
  const v = aiCreditsMonthlyLimitFor(t);
  return v == null ? "Custom" : fmt(v);
};
const taskCell = (t: PlanTier): CellVal => {
  const v = planLimitsFor(t).taskLimit;
  return v == null ? "Custom" : fmt(v);
};
const folderCell = (t: PlanTier): CellVal => {
  const v = planLimitsFor(t).folderLimit;
  return v == null ? "Custom" : fmt(v);
};
const templateCell = (t: PlanTier): CellVal => {
  const v = templateLimitFor(t);
  if (v == null) return "Custom";
  return v === 0 ? "Built-ins only" : fmt(v);
};

interface CmpRow {
  label: string;
  vals: Record<PlanTier, CellVal>;
}
interface CmpGroup {
  group: string;
  rows: ReadonlyArray<CmpRow>;
}

const COMPARE: ReadonlyArray<CmpGroup> = [
  {
    group: "Usage & limits",
    rows: [
      { label: "Best for", vals: rec("Trying it", "Power users", "Small teams", "Growing teams", "Organizations") },
      { label: "Members included", vals: byTier(memberCell) },
      { label: "Monthly workflow tasks", vals: byTier(taskCell) },
      { label: "Monthly AI credits", vals: byTier(aiCell) },
      { label: "Workflow folders", vals: byTier(folderCell) },
      { label: "Custom templates", vals: byTier(templateCell) },
      { label: "Built-in templates", vals: byTier(() => true) },
      { label: "Whole-account bulk export", vals: byTier(canBulkExportForPlan) },
    ],
  },
  {
    group: "Team & collaboration",
    rows: [
      { label: "Shared team workspace", vals: rec(false, false, true, true, true) },
      { label: "Role-based access", vals: rec(false, false, true, true, true) },
      { label: "Account-scoped billing", vals: byTier(() => true) },
      { label: "Private credential protection", vals: byTier(() => true) },
    ],
  },
  {
    group: "Support & terms",
    rows: [
      { label: "Support", vals: rec("Community & email", "Email", "Priority email", "Priority support", "Dedicated") },
      { label: "Onboarding help", vals: rec(false, false, true, true, "Custom") },
      { label: "Security review / DPA", vals: rec(false, false, false, false, "By arrangement") },
    ],
  },
];

// ─── "Workflow tasks vs AI credits" explainer ──────────────────────────────────

const METER_CARDS: ReadonlyArray<{ icon: LucideIcon; h: string; p: string; points: ReadonlyArray<string> }> = [
  {
    icon: Gauge,
    h: "Workflow tasks",
    p: "Tasks measure automation work, roughly one action your workflow carries out when it runs.",
    points: [
      "Watching or waiting for a trigger doesn't use a task.",
      "Deterministic steps and validation don't use AI credits.",
      "You only spend a task when something actually runs.",
    ],
  },
  {
    icon: Bot,
    h: "AI credits",
    p: "AI credits are a separate dimension for AI-assisted features like drafting, explanations, and repair help.",
    points: [
      "Used by optional AI features, not by ordinary runs.",
      "Paid AI is checked against your credits before the model runs.",
      "AI credit enforcement is being rolled out, and usage is shown in the app.",
    ],
  },
];

// ─── FAQ (native <details>, no client JS) ──────────────────────────────────────

const FAQ: ReadonlyArray<{ q: string; a: string }> = [
  {
    q: "Can I start for free?",
    a: "Yes. The Free plan needs no card. Build personal workflows, connect any supported app, and run them by hand or on a trigger.",
  },
  {
    q: "What counts as workflow usage?",
    a: "A workflow task is one action your automation carries out when it runs. Quietly watching for a trigger doesn't count. Your monthly allowance is shown in the app.",
  },
  {
    q: "What are AI credits?",
    a: "AI credits are metered separately from workflow tasks. They cover AI-assisted features such as drafting workflows, explanations, and repair help. Deterministic checks and validation don't spend credits.",
  },
  {
    q: "Can I upgrade from Team to Business later?",
    a: "Yes, in place. A Team account can move up to Business without starting over or creating a separate account, and Enterprise is available by arrangement from there.",
  },
  {
    q: "Are personal and team plans separate?",
    a: "Yes. Billing is account-scoped: personal workflows bill your personal account, and team or business workflows bill the team or business account that owns them.",
  },
  {
    q: "Can teammates use my connected apps?",
    a: "Team-visible does not automatically mean team-runnable. Private, member-connected credentials stay protected. To run a workflow that uses one, teammates may need to connect their own account or use a shared, account-level connection where supported.",
  },
  {
    q: "Do you offer enterprise plans?",
    a: "Yes, by arrangement. Enterprise covers custom member and usage limits, a security review, and custom onboarding. Contact sales to discuss your requirements.",
  },
  {
    q: "Is pricing final?",
    a: "Yes. The prices on this page are ChainReact's plan prices. Start on Free and upgrade whenever you're ready.",
  },
  {
    q: "What happens if I hit a usage limit?",
    a: "You'll see your usage in the app and can upgrade whenever you need more room. We won't surprise you with hidden charges.",
  },
  {
    q: "Do you offer refunds?",
    a: "Billing terms, including any refund policy, will be shown at checkout and in our Terms when available.",
  },
];

function ctaClass(kind: "primary" | "ghost") {
  return kind === "primary" ? "pr-cta primary" : "pr-cta ghost";
}

function CtaLink({
  cta,
  testId,
  className,
}: {
  cta: { label: string; href: string; external?: boolean; kind: "primary" | "ghost" };
  testId?: string;
  className?: string;
}) {
  const cls = (className ?? "") + " " + ctaClass(cta.kind);
  if (cta.external) {
    return (
      <a className={cls} href={cta.href} data-testid={testId}>
        {cta.label}
      </a>
    );
  }
  return (
    <Link className={cls} href={cta.href} data-testid={testId}>
      {cta.label} <span aria-hidden>→</span>
    </Link>
  );
}

function Cell({ v }: { v: CellVal }) {
  if (v === true) {
    return (
      <span className="pr-cmp-yes" aria-label="Included">
        <Check size={14} aria-hidden strokeWidth={2.4} />
      </span>
    );
  }
  if (v === false) {
    return (
      <span className="pr-cmp-no" aria-label="Not included">
        –
      </span>
    );
  }
  return <span className="pr-cmp-val">{v}</span>;
}

export function PricingPage() {
  // PRO-TEAM-TRIAL-ENFORCEMENT-1 — public trial copy is shown ONLY when the platform has a trial
  // length configured (dark by default → no trial advertised, preserving the honest current copy),
  // and ONLY on the trial-eligible tiers (Pro & Team). Business and Enterprise never show a trial.
  // For unauthenticated visitors this is a general offer; account-specific eligibility is revalidated
  // server-side after sign-in (the in-app CTA uses the sanitized per-account offer).
  const trialDays = resolveTrialPeriodDays();
  const trialsOn = trialDays > 0;
  const faqItems = trialsOn
    ? [
        {
          q: "Is there a free trial?",
          a: `Yes — Pro and Team each include a ${trialDays}-day free trial with no charge today. Business and Enterprise don't include a trial. Each account gets one free trial total across Pro and Team; switching plans or billing intervals doesn't restart it.`,
        },
        ...FAQ,
      ]
    : FAQ;
  return (
    <div data-marketing-surface className="pr-root" data-testid="pricing-page">
      <MarketingHeader />

      <main className="pr-main">
        <div className="pr">
          {/* 1. Hero */}
          <header className="pr-hero">
            <div className="pr-eyebrow">Pricing</div>
            <h1 className="pr-title">Pricing that scales with your workflows</h1>
            <p className="pr-lead">
              Start with simple automations, then grow into team workflows, business operations, and
              enterprise-ready automation as your needs expand.
            </p>
            <ul className="pr-points" aria-label="What you get">
              {[
                "Start free",
                "Upgrade when usage grows",
                "Plans for individuals and teams",
                "Separate workflow and AI usage",
                "Built for connected apps",
              ].map((p) => (
                <li key={p} className="pr-point">
                  <Check size={13} aria-hidden /> {p}
                </li>
              ))}
            </ul>
            <div className="pr-hero-actions">
              <Link className="pr-cta primary" href={SIGN_UP} data-testid="pricing-hero-get-started">
                Get started <span aria-hidden>→</span>
              </Link>
              <a className="pr-cta ghost" href="#compare" data-testid="pricing-hero-compare">
                Compare plans
              </a>
            </div>
          </header>

          {/* 2. Tier cards */}
          <section className="pr-grid" aria-label="Plans">
            {TIERS.map((tier) => {
              const Icon = tier.icon;
              return (
                <div
                  key={tier.tier}
                  className={"pr-card" + (tier.featured ? " is-featured" : "")}
                  data-testid={`pricing-card-${tier.tier}`}
                >
                  {tier.featured && <div className="pr-flag">Most popular</div>}
                  <div className="pr-card-top">
                    <span className="pr-plan-ic">
                      <Icon size={16} aria-hidden strokeWidth={1.9} />
                    </span>
                    <span className="pr-tagline">{tier.tagline}</span>
                  </div>
                  <h3 className="pr-name">{planTierLabel(tier.tier)}</h3>
                  <div className="pr-price">
                    <span className="pr-price-v">{tier.big}</span>
                    {tier.bigUnit && <span className="pr-price-u">{tier.bigUnit}</span>}
                  </div>
                  <div className="pr-price-sub">{tier.priceNote}</div>
                  {trialsOn && isTrialEligiblePlan(tier.tier) && (
                    <div className="pr-trial" data-testid={`pricing-trial-${tier.tier}`}>
                      {trialDays}-day free trial · no charge today
                    </div>
                  )}
                  <p className="pr-desc">{tier.who}</p>
                  <CtaLink cta={tier.cta} testId={`pricing-cta-${tier.tier}`} />
                  <ul className="pr-bullets">
                    {tier.bullets.map((b) => (
                      <li key={b}>
                        <Check size={13} aria-hidden strokeWidth={2.2} />
                        <span>{b}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              );
            })}
          </section>

          {/* 3. Run/usage band */}
          <section className="pr-band" aria-label="How usage is measured">
            <span className="pr-band-ic" aria-hidden>
              <Zap size={16} strokeWidth={1.9} />
            </span>
            <p className="pr-band-text">
              <strong>You spend usage on work that actually happens.</strong> A workflow task is one
              action your automation carries out, and watching for a trigger is free. AI features are
              metered separately as AI credits. <a className="pr-band-link" href="#meter">More on how usage works</a>.
            </p>
          </section>

          {/* 4. Workflow tasks vs AI credits */}
          <section className="pr-section pr-meter" id="meter">
            <div className="pr-section-head">
              <h2 className="pr-section-title">Workflow tasks and AI credits</h2>
              <p className="pr-section-sub">
                Two separate dials, so you stay in control of automation usage and AI usage.
              </p>
            </div>
            <div className="pr-meter-grid">
              {METER_CARDS.map((c) => {
                const Icon = c.icon;
                return (
                  <div className="pr-meter-card" key={c.h}>
                    <span className="pr-meter-ic">
                      <Icon size={18} aria-hidden strokeWidth={1.8} />
                    </span>
                    <h3 className="pr-meter-h">{c.h}</h3>
                    <p className="pr-meter-p">{c.p}</p>
                    <ul className="pr-meter-list">
                      {c.points.map((pt) => (
                        <li key={pt}>
                          <Check size={12} aria-hidden strokeWidth={2.2} />
                          <span>{pt}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                );
              })}
            </div>
            <p className="pr-meter-note">
              Today, Free includes {fmt(planLimitsFor("free").taskLimit ?? 100)} tasks and{" "}
              {fmt(aiCreditsMonthlyLimitFor("free") ?? 0)} AI credits a month; Pro raises that to{" "}
              {fmt(planLimitsFor("pro").taskLimit ?? 2000)} tasks and{" "}
              {fmt(aiCreditsMonthlyLimitFor("pro") ?? 0)} AI credits. Team raises monthly tasks to{" "}
              {fmt(planLimitsFor("team").taskLimit ?? 7500)} and AI credits to{" "}
              {fmt(aiCreditsMonthlyLimitFor("team") ?? 0)}; Business to{" "}
              {fmt(planLimitsFor("business").taskLimit ?? 25000)} tasks and{" "}
              {fmt(aiCreditsMonthlyLimitFor("business") ?? 0)} AI credits. Enterprise is custom.
              Your usage is always visible in the app.
            </p>
          </section>

          {/* 5. Comparison table */}
          {/*
            RESPONSIVE-MARKETING-9 — this is the one place on the public funnel
            where a contained horizontal scroller is the RIGHT answer: five plans
            across ~30 features is genuinely two-dimensional, and stacking it
            would repeat the plan headings for every row and destroy the
            comparison the section exists to make. So the matrix keeps its 720px
            floor and scrolls INSIDE its card.

            The SECTION, however, must never pan — that is what this declaration
            asserts, and it is what stops the scroller from being used as an
            excuse to let the whole section widen the page. No feature row is
            hidden at any width; the narrow-screen visitor scrolls the matrix
            rather than losing data.
          */}
          <section
            className="pr-section pr-compare"
            id="compare"
            data-no-pan-below="1600"
          >
            <div className="pr-section-head">
              <h2 className="pr-section-title">Compare every plan</h2>
              <p className="pr-section-sub">The full picture, line by line.</p>
            </div>
            <p className="pr-cmp-hint" data-testid="pricing-compare-hint">
              Scroll the table sideways to see every plan.
            </p>
            <div
              className="pr-cmp-scroll"
              role="region"
              aria-label="Plan comparison table"
              tabIndex={0}
              data-testid="pricing-compare"
            >
              <table className="pr-cmp">
                <caption className="pr-sr-only">
                  Feature comparison across the Free, Pro, Team, Business, and Enterprise plans.
                </caption>
                <thead>
                  <tr>
                    <th scope="col" className="pr-cmp-feature">
                      Features
                    </th>
                    {TIERS.map((t) => (
                      <th
                        key={t.tier}
                        scope="col"
                        className={"pr-cmp-plan" + (t.featured ? " is-featured" : "")}
                      >
                        <span className="pr-cmp-plan-name">{planTierLabel(t.tier)}</span>
                      </th>
                    ))}
                  </tr>
                </thead>
                {COMPARE.map((g) => (
                  <tbody key={g.group}>
                    <tr className="pr-cmp-grouprow">
                      <th scope="colgroup" colSpan={TIERS.length + 1} className="pr-cmp-group">
                        {g.group}
                      </th>
                    </tr>
                    {g.rows.map((r) => (
                      <tr key={r.label}>
                        <th scope="row" className="pr-cmp-feature">
                          {r.label}
                        </th>
                        {PLAN_TIERS.map((t) => (
                          <td key={t} className="pr-cmp-cell">
                            <Cell v={r.vals[t]} />
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                ))}
              </table>
            </div>
          </section>

          {/* 6. Team pricing & private credentials */}
          <section className="pr-section pr-team" aria-label="Team pricing and private credentials">
            <div className="pr-team-card">
              <span className="pr-team-ic" aria-hidden>
                <ShieldCheck size={20} strokeWidth={1.8} />
              </span>
              <div className="pr-team-body">
                <h2 className="pr-team-h">Team billing, and credentials that stay yours</h2>
                <blockquote className="pr-pull">
                  <span className="pr-pull-mark" aria-hidden>
                    &ldquo;
                  </span>
                  Team-visible does not automatically mean team-runnable.
                </blockquote>
                <p className="pr-team-p">
                  Team and business workflows belong to the team or business account, and usage bills
                  that account, not the individual who built the workflow. Billing is account-scoped
                  from the start.
                </p>
                <p className="pr-team-p">
                  Some connected app credentials are private to the member who connected them. If a
                  workflow relies on a private, member-connected credential, other teammates may need
                  to duplicate the workflow and connect their own account, or use a shared,
                  account-level connection where supported.
                </p>
                <div className="pr-team-note">
                  <Layers size={15} aria-hidden />
                  <span>
                    This protects you from teammates accidentally running automations through your
                    private connected apps.
                  </span>
                </div>
              </div>
            </div>
          </section>

          {/* 7. FAQ */}
          <section className="pr-section pr-faq" id="faq" data-testid="pricing-faq">
            <div className="pr-section-head">
              <h2 className="pr-section-title">Questions, answered</h2>
              <p className="pr-section-sub">
                Still curious? Email{" "}
                <a className="pr-inline-link" href={SALES_MAILTO}>
                  {SALES_EMAIL}
                </a>
                .
              </p>
            </div>
            <div className="pr-faq-list">
              {faqItems.map((item) => (
                <details key={item.q} className="pr-faq-item">
                  <summary className="pr-faq-q">
                    <span>{item.q}</span>
                    <span className="pr-faq-chev" aria-hidden>
                      +
                    </span>
                  </summary>
                  <div className="pr-faq-a">{item.a}</div>
                </details>
              ))}
            </div>
          </section>

          {/* 8. Final CTA */}
          <section className="pr-final" aria-label="Get started with ChainReact">
            <h2 className="pr-final-h">Start building workflows today</h2>
            <p className="pr-final-p">
              Try ChainReact with a free account, then upgrade when your workflows, team, or AI usage
              grows.
            </p>
            <div className="pr-final-actions">
              <Link className="pr-cta primary" href={SIGN_UP} data-testid="pricing-final-get-started">
                Get started <span aria-hidden>→</span>
              </Link>
              <a className="pr-cta ghost" href={SALES_MAILTO} data-testid="pricing-final-contact">
                <Mail size={13} aria-hidden /> Contact sales
              </a>
            </div>
          </section>
        </div>
      </main>

      <MarketingFooter />

      <style>{`
        .pr-root {
          position: relative;
          min-height: 100vh;
          font-family: var(--font-sans), ui-sans-serif, system-ui, sans-serif;
          font-size: 15px;
          line-height: 1.5;
          scroll-behavior: smooth;
          -webkit-font-smoothing: antialiased;
        }
        .pr-root a { text-decoration: none; }
        .pr-sr-only { position: absolute; width: 1px; height: 1px; padding: 0; margin: -1px; overflow: hidden; clip: rect(0,0,0,0); white-space: nowrap; border: 0; }

        .pr-main { background: var(--mk-bg); }
        .pr { max-width: 1240px; margin: 0 auto; padding: 56px 24px 90px; }

        /* Hero */
        .pr-hero { text-align: center; max-width: 720px; margin: 0 auto 52px; }
        .pr-eyebrow { font-family: var(--font-mono), ui-monospace, monospace; font-size: 11px; letter-spacing: 0.16em; text-transform: uppercase; color: var(--mk-muted); margin-bottom: 16px; }
        .pr-title { font-size: clamp(34px, 6vw, 50px); font-weight: 700; letter-spacing: -0.035em; line-height: 1.05; margin: 0 0 16px; color: var(--mk-text); text-wrap: balance; }
        .pr-lead { font-size: 17px; line-height: 1.6; color: var(--mk-muted); margin: 0 auto; max-width: 600px; text-wrap: pretty; }
        .pr-points { list-style: none; margin: 24px 0 0; padding: 0; display: flex; flex-wrap: wrap; justify-content: center; gap: 8px 10px; }
        .pr-point { display:inline-flex; align-items:center; gap: 6px; font-size: 12.5px; font-weight: 500; color: var(--mk-text-2); background: var(--mk-panel); border: 1px solid var(--mk-border); border-radius: 999px; padding: 6px 12px; }
        .pr-point :first-child { color: var(--mk-success); flex: none; }
        .pr-hero-actions { display:flex; gap: 10px; justify-content: center; flex-wrap: wrap; margin-top: 28px; }
        .pr-disclaimer { font-size: 12.5px; color: var(--mk-muted-2); margin: 18px auto 0; max-width: 520px; text-wrap: pretty; }

        /* Shared CTA */
        .pr-cta { display:inline-flex; align-items:center; justify-content:center; gap: 7px; padding: 11px 18px; border-radius: 9px; font-size: 13.5px; font-weight: 600; border: 1px solid var(--mk-border); transition: filter .12s ease, border-color .12s ease, transform .08s ease, background .12s ease; }
        .pr-cta.ghost { background: var(--mk-panel); color: var(--mk-text); }
        .pr-cta.ghost:hover { border-color: var(--mk-border-strong); }
        .pr-cta.primary { background: var(--mk-text); border-color: var(--mk-text); color: var(--mk-bg); }
        .pr-cta.primary:hover { filter: brightness(1.1); transform: translateY(-1px); }
        .pr-cta:focus-visible { outline: 2px solid var(--mk-accent); outline-offset: 2px; }

        /* Tier cards */
        .pr-grid { display: grid; grid-template-columns: repeat(5, 1fr); gap: 14px; align-items: stretch; margin-bottom: 26px; }
        @media (max-width: 1180px) { .pr-grid { grid-template-columns: repeat(3, 1fr); } }
        @media (max-width: 820px) { .pr-grid { grid-template-columns: repeat(2, 1fr); } }
        @media (max-width: 560px) { .pr-grid { grid-template-columns: 1fr; max-width: 420px; margin-inline: auto; } }
        .pr-card { background: var(--mk-panel); border: 1px solid var(--mk-border); border-radius: 18px; padding: 24px 20px; display:flex; flex-direction:column; position: relative; }
        .pr-card.is-featured { border-color: var(--mk-accent); box-shadow: 0 24px 70px -34px color-mix(in oklab, var(--mk-accent) 50%, transparent); }
        .pr-flag { position: absolute; top: -11px; left: 50%; transform: translateX(-50%); padding: 4px 13px; font-size: 11px; background: var(--mk-accent); color: var(--mk-bg); border-radius: 999px; font-weight: 700; white-space: nowrap; }
        .pr-card-top { display:flex; align-items:center; gap: 8px; margin-bottom: 14px; }
        .pr-plan-ic { width: 30px; height: 30px; border-radius: 8px; background: var(--mk-accent-soft); color: var(--mk-text); display:flex; align-items:center; justify-content:center; flex-shrink: 0; }
        .pr-tagline { font-size: 12px; color: var(--mk-muted); font-weight: 500; }
        .pr-name { font-size: 15px; color: var(--mk-text); font-weight: 700; margin: 0; }
        .pr-price { display:flex; align-items: baseline; gap: 6px; margin: 10px 0 5px; flex-wrap: wrap; }
        .pr-price-v { font-size: clamp(26px, 3vw, 34px); font-weight: 700; letter-spacing: -0.03em; line-height: 1; color: var(--mk-text); }
        .pr-price-u { font-size: 12.5px; color: var(--mk-muted); }
        .pr-price-sub { font-size: 12px; color: var(--mk-muted); min-height: 16px; }
        .pr-trial { margin-top: 8px; display:inline-flex; align-items:center; align-self:flex-start; gap: 6px; font-size: 11.5px; font-weight: 600; color: var(--mk-text); background: var(--mk-success-soft); border: 1px solid color-mix(in oklab, var(--mk-success) 30%, var(--mk-border)); border-radius: 999px; padding: 4px 10px; }
        .pr-desc { font-size: 13px; color: var(--mk-text-2); margin: 12px 0 16px; line-height: 1.5; }
        .pr-card .pr-cta { width: 100%; margin-bottom: 18px; }
        .pr-bullets { list-style: none; padding: 0; margin: auto 0 0; display:flex; flex-direction:column; gap: 11px; padding-top: 18px; border-top: 1px dashed var(--mk-border); }
        .pr-bullets li { display:flex; align-items:flex-start; gap: 9px; font-size: 13px; color: var(--mk-text-2); line-height: 1.4; }
        .pr-bullets li > :first-child { color: var(--mk-success); margin-top: 2px; flex-shrink: 0; }

        /* Usage band */
        .pr-band { display:flex; align-items:center; gap: 14px; padding: 16px 20px; background: var(--mk-panel); border: 1px solid var(--mk-border); border-radius: 14px; margin-bottom: 72px; }
        .pr-band-ic { width: 38px; height: 38px; border-radius: 10px; background: var(--mk-accent-soft); color: var(--mk-text); display:flex; align-items:center; justify-content:center; flex-shrink: 0; }
        .pr-band-text { font-size: 14px; line-height: 1.55; color: var(--mk-text-2); margin: 0; text-wrap: pretty; }
        .pr-band-text strong { color: var(--mk-text); font-weight: 650; }
        .pr-band-link { color: var(--mk-text); font-weight: 600; border-bottom: 1px solid var(--mk-border-strong); }
        .pr-band-link:hover { border-bottom-color: var(--mk-text); }

        /* Sections */
        .pr-section { margin-bottom: 72px; scroll-margin-top: 84px; }
        .pr-section-head { text-align: center; margin-bottom: 28px; }
        .pr-section-title { font-size: clamp(24px, 4vw, 32px); font-weight: 700; letter-spacing: -0.03em; margin: 0; color: var(--mk-text); text-wrap: balance; }
        .pr-section-sub { font-size: 14.5px; color: var(--mk-muted); margin: 8px 0 0; text-wrap: pretty; }
        .pr-inline-link { color: var(--mk-text); font-weight: 600; border-bottom: 1px solid var(--mk-border-strong); }
        .pr-inline-link:hover { border-bottom-color: var(--mk-text); }

        /* Meter cards */
        .pr-meter-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; }
        @media (max-width: 720px) { .pr-meter-grid { grid-template-columns: 1fr; } }
        .pr-meter-card { padding: 24px 22px; background: var(--mk-panel); border: 1px solid var(--mk-border); border-radius: 16px; }
        .pr-meter-ic { width: 40px; height: 40px; border-radius: 11px; background: var(--mk-accent-soft); color: var(--mk-text); display:flex; align-items:center; justify-content:center; margin-bottom: 14px; }
        .pr-meter-h { font-size: 16px; font-weight: 650; letter-spacing: -0.01em; color: var(--mk-text); margin: 0 0 8px; }
        .pr-meter-p { font-size: 13.5px; line-height: 1.6; color: var(--mk-text-2); margin: 0 0 14px; text-wrap: pretty; }
        .pr-meter-list { list-style: none; margin: 0; padding: 0; display:flex; flex-direction:column; gap: 9px; }
        .pr-meter-list li { display:flex; align-items:flex-start; gap: 9px; font-size: 13px; color: var(--mk-muted); line-height: 1.45; }
        .pr-meter-list li > :first-child { color: var(--mk-success); margin-top: 2px; flex-shrink: 0; }
        .pr-meter-note { font-size: 13px; line-height: 1.65; color: var(--mk-muted); margin: 18px auto 0; max-width: 760px; text-align: center; text-wrap: pretty; }

        /* Comparison table */
        /* max-width:100% is what stops the 720px table from sizing its own card
           and widening the section (RESPONSIVE-MARKETING-9). */
        .pr-cmp-scroll { border: 1px solid var(--mk-border); border-radius: 16px; overflow-x: auto; max-width: 100%; min-width: 0; }
        /* An undiscoverable scroller is its own defect, so the cue is shown at the
           widths where the matrix actually needs scrolling and hidden once every
           column fits without it. */
        .pr-cmp-hint { display: none; font-size: 12.5px; color: var(--mk-muted); margin: 0 0 10px; text-align: center; }
        @media (max-width: 860px) { .pr-cmp-hint { display: block; } }
        .pr-cmp-scroll:focus-visible { outline: 2px solid var(--mk-accent); outline-offset: 2px; }
        .pr-cmp { width: 100%; min-width: 720px; border-collapse: collapse; }
        .pr-cmp th, .pr-cmp td { padding: 13px 16px; font-size: 13px; font-weight: 400; text-align: center; vertical-align: middle; }
        .pr-cmp thead th { position: sticky; top: 0; background: var(--mk-panel); border-bottom: 1px solid var(--mk-border); z-index: 1; }
        .pr-cmp-feature { text-align: left !important; color: var(--mk-text-2); font-weight: 500 !important; }
        .pr-cmp-plan { border-left: 1px solid var(--mk-border); }
        .pr-cmp-plan.is-featured { background: var(--mk-accent-soft); }
        .pr-cmp-plan-name { font-weight: 700; color: var(--mk-text); font-size: 14px; }
        .pr-cmp-group { text-align: left !important; font-family: var(--font-mono), ui-monospace, monospace; font-size: 10.5px; letter-spacing: 0.1em; text-transform: uppercase; color: var(--mk-muted); background: var(--mk-bg-2); font-weight: 600 !important; }
        .pr-cmp tbody tr:not(.pr-cmp-grouprow) { border-bottom: 1px solid var(--mk-border); }
        .pr-cmp tbody td { border-left: 1px solid var(--mk-border); }
        .pr-cmp tbody tr:not(.pr-cmp-grouprow):hover { background: var(--mk-panel); }
        .pr-cmp-yes { color: var(--mk-success); display:inline-flex; }
        .pr-cmp-no { color: var(--mk-muted-2); font-size: 15px; }
        .pr-cmp-val { font-size: 12.5px; color: var(--mk-text); font-weight: 500; }

        /* Team / credentials */
        .pr-team-card { display:flex; gap: 18px; padding: 30px 32px; background: var(--mk-panel); border: 1px solid var(--mk-border-strong); border-radius: 18px; }
        @media (max-width: 620px) { .pr-team-card { flex-direction: column; gap: 14px; padding: 24px; } }
        .pr-team-ic { width: 46px; height: 46px; border-radius: 12px; background: var(--mk-accent); color: var(--mk-bg); display:flex; align-items:center; justify-content:center; flex-shrink: 0; }
        .pr-team-h { font-size: clamp(20px, 3.4vw, 25px); font-weight: 700; letter-spacing: -0.02em; color: var(--mk-text); margin: 2px 0 14px; text-wrap: balance; }
        .pr-pull { margin: 0 0 16px; padding: 0; font-size: clamp(18px, 3vw, 21px); line-height: 1.35; font-weight: 600; letter-spacing: -0.015em; color: var(--mk-text); text-wrap: balance; }
        .pr-pull-mark { color: var(--mk-muted-2); margin-right: 2px; }
        .pr-team-p { font-size: 14px; line-height: 1.7; color: var(--mk-text-2); margin: 0 0 12px; text-wrap: pretty; }
        .pr-team-note { display:flex; align-items:flex-start; gap: 10px; margin-top: 6px; padding: 13px 15px; border-radius: 11px; background: var(--mk-success-soft); border: 1px solid color-mix(in oklab, var(--mk-success) 30%, var(--mk-border)); font-size: 13.5px; line-height: 1.55; color: var(--mk-text-2); text-wrap: pretty; }
        .pr-team-note :first-child { color: var(--mk-success); flex-shrink: 0; margin-top: 1px; }

        /* FAQ */
        .pr-faq { max-width: 760px; margin-inline: auto; }
        .pr-faq-list { display:flex; flex-direction: column; gap: 8px; }
        .pr-faq-item { border: 1px solid var(--mk-border); border-radius: 13px; background: var(--mk-panel); overflow: hidden; }
        .pr-faq-item[open] { border-color: var(--mk-border-strong); }
        .pr-faq-q { width: 100%; display:flex; align-items:center; justify-content:space-between; gap: 16px; padding: 16px 20px; font-size: 14.5px; font-weight: 600; color: var(--mk-text); cursor: pointer; list-style: none; }
        .pr-faq-q::-webkit-details-marker { display: none; }
        .pr-faq-q:focus-visible { outline: 2px solid var(--mk-accent); outline-offset: -2px; border-radius: 13px; }
        .pr-faq-chev { color: var(--mk-muted); flex-shrink: 0; font-size: 18px; line-height: 1; transition: transform .15s ease; }
        .pr-faq-item[open] .pr-faq-chev { transform: rotate(45deg); }
        .pr-faq-a { padding: 0 20px 18px; font-size: 13.5px; line-height: 1.65; color: var(--mk-text-2); max-width: 640px; text-wrap: pretty; }

        /* Final CTA */
        .pr-final { text-align: center; padding: 52px 32px; background: var(--mk-panel); border: 1px solid var(--mk-border); border-radius: 20px; }
        .pr-final-h { font-size: clamp(26px, 5vw, 32px); font-weight: 700; letter-spacing: -0.03em; line-height: 1.15; margin: 0 auto 12px; max-width: 620px; color: var(--mk-text); text-wrap: balance; }
        .pr-final-p { font-size: 15px; color: var(--mk-muted); margin: 0 auto 24px; max-width: 540px; text-wrap: pretty; }
        .pr-final-actions { display:flex; gap: 10px; justify-content: center; flex-wrap: wrap; }

        @media print { .mk-nav, .mkf { display: none !important; } }
      `}</style>
    </div>
  );
}
