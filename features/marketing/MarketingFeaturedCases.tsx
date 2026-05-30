/**
 * "Selected work" case-study grid (Slice 4.HOMEPAGE-V2-1).
 *
 * Renders 4 illustrative automation patterns from the design as case
 * cards: animated SVG art, category chips, name, and a one-line
 * description. The design's per-case stat tiles ("$24k recovered per
 * quarter", "94% delivered without owner involvement", etc.) are
 * OMITTED per the decision locked with the user — those are fabricated
 * numbers and would mislead a real visitor. We'll add stats back when
 * we have real customer data to cite.
 *
 * "Browse all" intentionally has no link target — there is no /examples
 * page yet. We render the link as an in-page anchor `#examples` (the
 * section's own id) so it's not a fake navigation promise; when an
 * Examples page ships we'll repoint it.
 */
const CASES: ReadonlyArray<{
  id: string;
  cats: readonly string[];
  name: string;
  desc: string;
  art: "charges" | "inbox" | "stars" | "leads";
}> = [
  {
    id: "payments",
    cats: ["Payments", "AI", "Slack"],
    name: "Failed payment recovery",
    desc: "Catch declines, send friendly nudges, escalate to the right human only when needed.",
    art: "charges",
  },
  {
    id: "inbox",
    cats: ["Email", "AI", "Notion"],
    name: "Inbox triage on autopilot",
    desc: "Read every email overnight, summarize the important ones, log them where they belong.",
    art: "inbox",
  },
  {
    id: "reviews",
    cats: ["Shopify", "Twilio"],
    name: "Review requests that customers answer",
    desc: "Time the ask. Personalize the wording. Skip the unhappy ones automatically.",
    art: "stars",
  },
  {
    id: "leads",
    cats: ["Forms", "Calendar", "HubSpot"],
    name: "Lead handoff that doesn't lose anyone",
    desc: "New form in, calendar booked, CRM updated, internal Slack pinged. All in one breath.",
    art: "leads",
  },
];

export function MarketingFeaturedCases() {
  return (
    <section
      className="mk-fc"
      id="examples"
      aria-labelledby="mk-fc-h"
      data-testid="marketing-cases"
    >
      <div className="mk-fc-inner">
        <div className="mk-fc-head">
          <div className="mk-fc-eyebrow">Selected automations</div>
          <h2 id="mk-fc-h" className="mk-fc-h">
            Real automations our customers run every day.
          </h2>
          <a href="#examples" className="mk-fc-all" aria-label="Browse all examples">
            Browse all <span aria-hidden>→</span>
          </a>
        </div>

        <ul className="mk-fc-grid">
          {CASES.map((c) => (
            <li
              key={c.id}
              className="mk-fc-card"
              data-testid="marketing-case-card"
              data-case-id={c.id}
            >
              <div className="mk-fc-media" aria-hidden>
                <CaseArt kind={c.art} />
              </div>
              <div className="mk-fc-body">
                <div className="mk-fc-cats">
                  {c.cats.map((t) => (
                    <span key={t}>{t}</span>
                  ))}
                </div>
                <h3 className="mk-fc-name">{c.name}</h3>
                <p className="mk-fc-desc">{c.desc}</p>
              </div>
            </li>
          ))}
        </ul>
      </div>
      <style>{`
        .mk-fc { padding: 100px 0; }
        .mk-fc-inner { max-width: 1320px; margin: 0 auto; padding: 0 32px; }
        .mk-fc-head {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 32px;
          align-items: end;
          margin-bottom: 56px;
        }
        .mk-fc-eyebrow {
          font-size: 13px; color: var(--mk-muted);
          letter-spacing: 0.04em;
          margin-bottom: 16px;
          grid-column: 1;
        }
        .mk-fc-h {
          font-size: clamp(28px, 3.4vw, 48px);
          letter-spacing: -0.025em;
          line-height: 1.08;
          font-weight: 500;
          margin: 0;
          max-width: 720px;
          grid-row: 2;
          color: var(--mk-text);
        }
        .mk-fc-all {
          display: inline-flex; align-items: center; gap: 8px;
          font-size: 15px; color: var(--mk-text-2);
          grid-row: 2; grid-column: 2; justify-self: end;
        }
        .mk-fc-all span { transition: transform .2s ease; display: inline-block; }
        .mk-fc-all:hover span { transform: translateX(4px); }

        .mk-fc-grid {
          list-style: none; margin: 0; padding: 0;
          display: grid;
          grid-template-columns: repeat(2, 1fr);
          gap: 18px;
        }
        @media (max-width: 980px) {
          .mk-fc-grid { grid-template-columns: 1fr; }
          .mk-fc-head { grid-template-columns: 1fr; }
          .mk-fc-all { grid-column: 1; grid-row: 3; justify-self: start; }
        }
        .mk-fc-card {
          background: #1a1a1a; color: #fafafa;
          border-radius: 18px;
          overflow: hidden;
          transition: transform .25s cubic-bezier(.2,.8,.3,1);
        }
        .mk-fc-card:hover { transform: translateY(-4px); }
        .mk-fc-media {
          aspect-ratio: 16 / 9;
          position: relative;
          overflow: hidden;
        }
        .mk-fc-body { padding: 28px 30px 32px; }
        .mk-fc-cats {
          display: flex; gap: 14px;
          font-size: 12px;
          color: rgba(255,255,255,0.55);
          margin-bottom: 14px;
        }
        .mk-fc-name {
          font-size: clamp(22px, 2.2vw, 30px);
          letter-spacing: -0.02em;
          line-height: 1.15;
          font-weight: 500;
          margin: 0 0 12px;
        }
        .mk-fc-desc {
          font-size: 15px;
          color: rgba(255,255,255,0.7);
          line-height: 1.5;
          margin: 0;
        }
      `}</style>
    </section>
  );
}

function CaseArt({ kind }: { kind: "charges" | "inbox" | "stars" | "leads" }) {
  if (kind === "charges") return <ArtCharges />;
  if (kind === "inbox") return <ArtInbox />;
  if (kind === "stars") return <ArtStars />;
  return <ArtLeads />;
}

function ArtCharges() {
  return (
    <div className="mk-art mk-art-charges">
      <svg viewBox="0 0 600 340" preserveAspectRatio="xMidYMid slice">
        {Array.from({ length: 8 }).map((_, i) => (
          <g
            key={i}
            style={{
              animation: "mk-art-fall 6s linear infinite",
              animationDelay: `${-(i * 0.7)}s`,
            }}
          >
            <rect
              x={60 + i * 65}
              y="-40"
              width="40"
              height="56"
              rx="6"
              fill="none"
              stroke="rgba(255,255,255,0.35)"
              strokeWidth="1"
            />
            <text
              x={80 + i * 65}
              y="-10"
              textAnchor="middle"
              fill="rgba(255,255,255,0.4)"
              fontSize="9"
              fontFamily="var(--font-mono)"
            >
              ${(i + 1) * 49}
            </text>
          </g>
        ))}
        <line x1="0" y1="240" x2="600" y2="240" stroke="rgba(255,255,255,0.25)" strokeWidth="1" />
        <text
          x="20"
          y="280"
          fill="rgba(255,255,255,0.55)"
          fontSize="13"
          fontFamily="var(--font-mono)"
        >
          caught · 17 / 18
        </text>
      </svg>
      <style>{`
        .mk-art-charges { background: linear-gradient(180deg, #1a1a1a 0%, #0a0a0a 100%); }
        @keyframes mk-art-fall {
          0%   { transform: translateY(0); opacity: 0; }
          10%  { opacity: 1; }
          80%  { opacity: 1; }
          100% { transform: translateY(380px); opacity: 0; }
        }
      `}</style>
    </div>
  );
}

function ArtInbox() {
  return (
    <div className="mk-art mk-art-inbox">
      <svg viewBox="0 0 600 340" preserveAspectRatio="xMidYMid slice">
        <text
          x="80"
          y="30"
          fill="rgba(255,255,255,0.55)"
          fontSize="11"
          fontFamily="var(--font-mono)"
        >
          INBOX · 6 read overnight
        </text>
        {Array.from({ length: 6 }).map((_, i) => (
          <g
            key={i}
            style={{
              animation: "mk-art-slide 5s ease-in-out infinite",
              animationDelay: `${-(i * 0.5)}s`,
            }}
          >
            <rect
              x="80"
              y={40 + i * 38}
              width="440"
              height="28"
              rx="6"
              fill="rgba(255,255,255,0.06)"
              stroke="rgba(255,255,255,0.18)"
              strokeWidth="1"
            />
            <circle
              cx="100"
              cy={54 + i * 38}
              r="4"
              fill={i < 2 ? "#6ee7b7" : "rgba(255,255,255,0.35)"}
            />
            <rect
              x="118"
              y={48 + i * 38}
              width={120 + i * 20}
              height="5"
              rx="2"
              fill="rgba(255,255,255,0.4)"
            />
          </g>
        ))}
      </svg>
      <style>{`
        .mk-art-inbox { background: linear-gradient(180deg, #0f0f0f 0%, #050505 100%); }
        @keyframes mk-art-slide {
          0%   { transform: translateX(-20px); opacity: 0; }
          10%  { transform: translateX(0); opacity: 1; }
          90%  { opacity: 1; }
          100% { transform: translateX(20px); opacity: 0; }
        }
      `}</style>
    </div>
  );
}

function ArtStars() {
  return (
    <div className="mk-art mk-art-stars">
      <svg viewBox="0 0 600 340" preserveAspectRatio="xMidYMid slice">
        {Array.from({ length: 20 }).map((_, i) => {
          const x = (i * 73) % 600;
          const delay = (i * 0.3) % 5;
          return (
            <g
              key={i}
              style={{
                animation: "mk-art-rise 6s ease-out infinite",
                animationDelay: `${-delay}s`,
              }}
            >
              <path
                d={`M ${x} 380 L ${x + 5} 392 L ${x + 18} 394 L ${x + 8} 402 L ${x + 11} 415 L ${x} 408 L ${x - 11} 415 L ${x - 8} 402 L ${x - 18} 394 L ${x - 5} 392 Z`}
                fill="rgba(255,255,255,0.85)"
              />
            </g>
          );
        })}
      </svg>
      <style>{`
        .mk-art-stars { background: linear-gradient(180deg, #1a1a1a 0%, #050505 100%); }
        @keyframes mk-art-rise {
          0%   { transform: translateY(0); opacity: 0; }
          10%  { opacity: 1; }
          90%  { opacity: 0.6; }
          100% { transform: translateY(-400px); opacity: 0; }
        }
      `}</style>
    </div>
  );
}

function ArtLeads() {
  const nodes: ReadonlyArray<{ cx: number; label: string }> = [
    { cx: 100, label: "form" },
    { cx: 250, label: "calendar" },
    { cx: 400, label: "CRM" },
    { cx: 550, label: "slack" },
  ];
  return (
    <div className="mk-art mk-art-leads">
      <svg viewBox="0 0 600 340" preserveAspectRatio="xMidYMid slice">
        <g style={{ animation: "mk-art-pulse 4s ease-in-out infinite" }}>
          {nodes.map((n, i) => (
            <g key={n.cx}>
              <circle
                cx={n.cx}
                cy="170"
                r="32"
                fill="none"
                stroke="rgba(255,255,255,0.25)"
                strokeWidth="1"
              />
              <circle
                cx={n.cx}
                cy="170"
                r="6"
                fill="rgba(255,255,255,0.8)"
                style={{
                  animation: "mk-art-glow 2s ease-in-out infinite",
                  animationDelay: `${-(i * 0.5)}s`,
                }}
              />
            </g>
          ))}
          {[100, 250, 400].map((cx, i) => (
            <line
              key={cx}
              x1={cx + 32}
              y1="170"
              x2={cx + 150 - 32}
              y2="170"
              stroke="rgba(255,255,255,0.4)"
              strokeWidth="1.5"
              strokeDasharray="4 4"
              style={{
                animation: "mk-art-dash 1.5s linear infinite",
                animationDelay: `${-(i * 0.5)}s`,
              }}
            />
          ))}
        </g>
        {nodes.map((n) => (
          <text
            key={`label-${n.cx}`}
            x={n.cx}
            y="220"
            textAnchor="middle"
            fill="rgba(255,255,255,0.55)"
            fontSize="11"
            fontFamily="var(--font-mono)"
          >
            {n.label}
          </text>
        ))}
      </svg>
      <style>{`
        .mk-art-leads { background: linear-gradient(180deg, #181818 0%, #050505 100%); }
        @keyframes mk-art-pulse { 0%, 100% { opacity: 0.85; } 50% { opacity: 1; } }
        @keyframes mk-art-glow { 0%, 100% { r: 6; } 50% { r: 10; } }
        @keyframes mk-art-dash { to { stroke-dashoffset: -16; } }
      `}</style>
    </div>
  );
}
