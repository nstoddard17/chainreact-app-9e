"use client";

import { useEffect, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { MarketingHeroMotion } from "./MarketingHeroMotion";

/**
 * Hero section for the marketing landing page (Slice 4.HOMEPAGE-V2-1).
 *
 * Three parts (mirroring the design's HeroV2 / V2Prompt / V2HeroMedia):
 *   1. Big editorial headline.
 *   2. Inline prompt textarea with a rotating typed example placeholder.
 *      Submit funnels signed-out users to `/auth/sign-up` (they'll land
 *      on the builder after sign-up). The placeholder is decorative —
 *      we don't preserve the prompt across auth, that's an unbuilt
 *      capability and would be a fake action to claim.
 *   3. Animated product visual — rotating illustrative "moments" cards
 *      (Gmail, Slack, Notion, HubSpot) on a dark grid. The copy stays
 *      generic-illustrative; no customer-attributed claims.
 *
 * Below that: a lead paragraph and the primary "Start building" CTA →
 * `/auth/sign-up`. Signed-in users never see this page (server-redirected
 * to `/workflows` upstream).
 *
 * Marked `"use client"` because of the typed-placeholder + rotating-moments
 * `useState`/`useEffect` work. All animations respect `prefers-reduced-
 * motion` via the page's global media query (in `globals.css`).
 */
const PROMPT_EXAMPLES: readonly string[] = [
  "Create a daily summary of yesterday's Shopify sales and email it to me",
  "Send a friendly reminder when a Stripe payment fails",
  "Post in #wins when someone leaves a 5-star Google review",
  "Move new Typeform leads into HubSpot and ping #sales",
  "Text me when inventory drops below 10 units in Shopify",
];

const HERO_MOMENTS: ReadonlyArray<{
  tag: string;
  body: string;
  brand: string;
}> = [
  {
    tag: "01 · invoice follow-ups",
    body: "Hi Alex — just a quick reminder: invoice INV-2841 was due 3 days ago. Want me to send it?",
    brand: "Gmail",
  },
  {
    tag: "02 · review alerts",
    body: "5-star review just came in — \"absolutely lovely service, highly recommend.\"",
    brand: "Slack",
  },
  {
    tag: "03 · weekly recap",
    body: "Last week: 47 orders processed. Best day: Saturday. Pacing +12% vs prior week.",
    brand: "Notion",
  },
  {
    tag: "04 · lead handoff",
    body: "New booking at 2pm. Added to HubSpot, blocked your calendar, sent the welcome doc.",
    brand: "HubSpot",
  },
];

export function MarketingHero() {
  return (
    <section className="mk-hero" aria-labelledby="mk-hero-h">
      <MarketingHeroMotion intensity={5} />
      <div className="mk-hero-inner">
        <h1 id="mk-hero-h" className="mk-hero-h">
          <span>Automations,</span>
          <span>built for how</span>
          <span className="mk-hero-it">small businesses</span>
          <span>actually work.</span>
        </h1>

        <PromptBox />

        <div className="mk-hero-media" aria-hidden>
          <HeroMedia />
        </div>

        <p className="mk-hero-lead">
          ChainReact takes the busywork off your plate — invoice follow-ups,
          scheduling, review requests, the unread inbox. Describe what should
          happen, and it builds the automation, watches it run, and quietly
          fixes the small things that would have woken you up at three in the
          morning.
        </p>

        <div className="mk-hero-cta">
          <Link
            href="/auth/sign-up"
            className="mk-cta"
            data-testid="marketing-hero-start"
          >
            Start building <span aria-hidden>→</span>
          </Link>
        </div>
      </div>
      <style>{`
        .mk-hero { padding: 80px 0 40px; position: relative; isolation: isolate; }
        .mk-hero-inner { max-width: 1320px; margin: 0 auto; padding: 0 32px; position: relative; z-index: 1; }
        .mk-hero-h {
          font-size: clamp(48px, 7vw, 110px);
          line-height: 0.98;
          letter-spacing: -0.035em;
          font-weight: 600;
          margin: 0 0 56px;
          display: flex; flex-direction: column;
          color: var(--mk-text);
        }
        .mk-hero-h span { display: block; }
        .mk-hero-it { font-style: italic; font-family: Georgia, "Times New Roman", serif; font-weight: 500; }
        .mk-hero-media {
          width: 100%;
          aspect-ratio: 21 / 9;
          background: #0a0a0a;
          border-radius: 18px;
          overflow: hidden;
          position: relative;
          margin-bottom: 56px;
        }
        .mk-hero-lead {
          font-size: clamp(20px, 2.3vw, 30px);
          line-height: 1.4;
          color: var(--mk-text);
          max-width: 920px;
          margin: 0 0 36px;
          font-weight: 400;
          letter-spacing: -0.015em;
        }
        .mk-hero-cta { display: flex; }
        .mk-cta {
          display: inline-flex; align-items: center; gap: 8px;
          padding: 16px 24px;
          background: var(--mk-text); color: var(--mk-bg);
          font-size: 15px; font-weight: 500;
          border-radius: 999px;
          transition: filter .15s ease, transform .15s ease;
        }
        .mk-cta:hover { filter: brightness(1.05); transform: translateY(-1px); }
      `}</style>
    </section>
  );
}

function PromptBox() {
  const router = useRouter();
  const [exIdx, setExIdx] = useState(0);
  const [typed, setTyped] = useState("");

  useEffect(() => {
    const cur = PROMPT_EXAMPLES[exIdx] ?? "";
    let i = 0;
    let alive = true;
    let timer: ReturnType<typeof setTimeout>;
    const tick = () => {
      if (!alive) return;
      if (i <= cur.length) {
        setTyped(cur.slice(0, i));
        i++;
        timer = setTimeout(tick, 28);
      } else {
        timer = setTimeout(
          () => alive && setExIdx((p) => (p + 1) % PROMPT_EXAMPLES.length),
          2400,
        );
      }
    };
    tick();
    return () => {
      alive = false;
      clearTimeout(timer);
    };
  }, [exIdx]);

  function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    // The prompt itself isn't preserved across sign-up today (that's an
    // unbuilt capability) — funnel to sign-up; the user picks up the
    // builder fresh on the other side.
    router.push("/auth/sign-up");
  }

  return (
    <form
      className="mk-prompt"
      onSubmit={onSubmit}
      data-testid="marketing-hero-prompt"
      aria-label="Describe what you want to automate"
    >
      <div className="mk-prompt-eyebrow">Or just type what you need</div>
      <div className="mk-prompt-box">
        <textarea
          className="mk-prompt-input"
          placeholder={typed + "▌"}
          rows={3}
          aria-label="Describe what you want to automate"
        />
        <div className="mk-prompt-bar">
          <div className="mk-prompt-chips" aria-hidden>
            {["Notify me", "Summarize", "On a schedule", "Sync apps", "Automate"].map((c) => (
              <span key={c} className="mk-prompt-chip">
                {c}
              </span>
            ))}
          </div>
          <button type="submit" className="mk-prompt-send" aria-label="Get started">
            →
          </button>
        </div>
      </div>
      <style>{`
        .mk-prompt { width: 100%; max-width: 1180px; margin: 0 auto 56px; }
        .mk-prompt-eyebrow { font-size: 13px; color: var(--mk-muted); margin-bottom: 16px; }
        .mk-prompt-box {
          background: var(--mk-panel);
          border: 1px solid var(--mk-border);
          border-radius: 18px;
          padding: 22px 24px 18px;
          transition: border-color .15s ease, box-shadow .15s ease;
        }
        .mk-prompt-box:focus-within {
          border-color: var(--mk-text);
          box-shadow: 0 0 0 4px color-mix(in oklab, var(--mk-text) 8%, transparent);
        }
        .mk-prompt-input {
          width: 100%;
          background: transparent;
          border: 0; outline: none; resize: none;
          color: var(--mk-text);
          font: inherit; font-size: 19px; line-height: 1.45;
          letter-spacing: -0.005em;
          min-height: 78px;
        }
        .mk-prompt-input::placeholder { color: var(--mk-muted-2); white-space: pre-wrap; }
        .mk-prompt-bar {
          display: flex; justify-content: space-between; align-items: center;
          gap: 14px;
          margin-top: 14px;
          padding-top: 14px;
          border-top: 1px solid var(--mk-border);
        }
        .mk-prompt-chips { display: flex; flex-wrap: wrap; gap: 6px; }
        .mk-prompt-chip {
          padding: 7px 13px;
          border: 1px solid var(--mk-border);
          border-radius: 999px;
          font-size: 13px;
          color: var(--mk-text-2);
        }
        .mk-prompt-send {
          width: 44px; height: 44px;
          background: var(--mk-text); color: var(--mk-bg);
          border: 0; border-radius: 50%;
          font-size: 18px; line-height: 1;
          transition: transform .15s cubic-bezier(.2,.8,.3,1), filter .15s ease;
        }
        .mk-prompt-send:hover { transform: translateX(2px) translateY(-1px); filter: brightness(1.05); }
      `}</style>
    </form>
  );
}

function HeroMedia() {
  const [idx, setIdx] = useState(0);
  useEffect(() => {
    const t = setInterval(
      () => setIdx((i) => (i + 1) % HERO_MOMENTS.length),
      3500,
    );
    return () => clearInterval(t);
  }, []);
  const m = HERO_MOMENTS[idx];
  if (!m) return null;
  return (
    <div className="mk-hm" data-testid="marketing-hero-media">
      <div className="mk-hm-grid" />
      <div className="mk-hm-glow" />
      <div className="mk-hm-tag">{m.tag}</div>
      <div className="mk-hm-card" key={idx}>
        <div className="mk-hm-card-h">
          <span className="mk-hm-card-brand">{m.brand}</span>
          <span className="mk-hm-card-time">just now</span>
          <span className="mk-hm-card-status">delivered</span>
        </div>
        <div className="mk-hm-card-body">{m.body}</div>
      </div>
      <div className="mk-hm-pips" aria-hidden>
        {HERO_MOMENTS.map((_, i) => (
          <span key={i} className={"mk-hm-pip" + (i === idx ? " is-on" : "")} />
        ))}
      </div>
      <style>{`
        .mk-hm { position: absolute; inset: 0; background: linear-gradient(180deg, #0c0c0c 0%, #050505 100%); }
        .mk-hm-grid {
          position: absolute; inset: 0;
          background-image: radial-gradient(rgba(255,255,255,0.06) 1px, transparent 1px);
          background-size: 24px 24px;
          mask-image: radial-gradient(ellipse 70% 70% at 50% 40%, #000 30%, transparent 80%);
        }
        .mk-hm-glow {
          position: absolute; left: 20%; top: 10%; width: 60%; height: 80%;
          background: radial-gradient(circle, rgba(255,255,255,0.10) 0%, transparent 70%);
          filter: blur(40px);
          animation: mk-hm-glow 6s ease-in-out infinite;
        }
        @keyframes mk-hm-glow {
          0%, 100% { transform: translate(0, 0); }
          50%      { transform: translate(40px, -20px); }
        }
        .mk-hm-tag {
          position: absolute; top: 24px; left: 28px;
          font-family: var(--font-mono); font-size: 11px;
          color: rgba(255,255,255,0.55);
          letter-spacing: 0.08em; text-transform: uppercase;
        }
        .mk-hm-card {
          position: absolute; left: 50%; top: 50%;
          transform: translate(-50%, -50%);
          width: min(540px, 70%);
          background: rgba(20,20,20,0.85);
          border: 1px solid rgba(255,255,255,0.10);
          backdrop-filter: blur(20px);
          border-radius: 14px;
          padding: 18px 22px;
          animation: mk-hm-in .7s cubic-bezier(.2,.8,.3,1);
          color: #fafafa;
          box-shadow: 0 30px 80px -20px rgba(0,0,0,0.7);
        }
        @keyframes mk-hm-in {
          from { opacity: 0; transform: translate(-50%, -42%); }
          to   { opacity: 1; transform: translate(-50%, -50%); }
        }
        .mk-hm-card-h { display: flex; align-items: center; gap: 10px; margin-bottom: 10px; }
        .mk-hm-card-brand { font-size: 13px; font-weight: 600; }
        .mk-hm-card-time { font-size: 11px; color: rgba(255,255,255,0.45); margin-left: auto; }
        .mk-hm-card-status {
          font-size: 10.5px; padding: 2px 8px; border-radius: 999px;
          background: rgba(52,211,153,0.18); color: #6ee7b7; font-weight: 500;
        }
        .mk-hm-card-body { font-size: 14.5px; line-height: 1.5; color: rgba(255,255,255,0.95); }
        .mk-hm-pips {
          position: absolute; bottom: 20px; left: 50%; transform: translateX(-50%);
          display: flex; gap: 6px;
        }
        .mk-hm-pip { width: 24px; height: 2px; background: rgba(255,255,255,0.18); border-radius: 2px; transition: background .3s; }
        .mk-hm-pip.is-on { background: rgba(255,255,255,0.85); }
      `}</style>
    </div>
  );
}
