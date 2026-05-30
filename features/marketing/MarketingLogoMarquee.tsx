"use client";

import { useState } from "react";
import type { MarketingMarqueeProvider } from "./marqueeProviders";

/**
 * Brand logo marquee (Slice 4.HOMEPAGE-V2-1).
 *
 * Receives the provider strip resolved server-side from
 * `@/integrations/_registry`. Renders two copies in a flex track so the
 * CSS `@keyframes mk-mq-scroll` translation by -50% produces a seamless
 * loop. Each chip uses the real provider SVG at `/integrations/<id>.svg`;
 * a per-chip `onError` falls back to two-letter initials if an asset is
 * missing (same pattern WorkflowProviderChips uses).
 */
interface Props {
  providers: readonly MarketingMarqueeProvider[];
}

export function MarketingLogoMarquee({ providers }: Props) {
  if (providers.length === 0) return null;
  const row = [...providers, ...providers];
  return (
    <section
      className="mk-mq"
      id="apps"
      aria-label="Connected apps"
      data-testid="marketing-marquee"
    >
      <div className="mk-mq-eyebrow">Connects with everything you already use</div>
      <div className="mk-mq-track">
        <div className="mk-mq-row">
          {row.map((p, i) => (
            <ProviderChip key={`${p.id}-${i}`} provider={p} />
          ))}
        </div>
      </div>
      <style>{`
        .mk-mq {
          padding: 60px 0 80px;
          border-top: 1px solid var(--mk-border);
          border-bottom: 1px solid var(--mk-border);
          overflow: hidden;
        }
        .mk-mq-eyebrow {
          text-align: center;
          font-size: 13px;
          color: var(--mk-muted);
          margin-bottom: 36px;
        }
        .mk-mq-track {
          overflow: hidden;
          mask-image: linear-gradient(to right, transparent, #000 8%, #000 92%, transparent);
        }
        .mk-mq-row {
          display: flex; gap: 56px;
          animation: mk-mq-scroll 40s linear infinite;
          width: max-content;
        }
        @keyframes mk-mq-scroll { to { transform: translateX(-50%); } }
        .mk-mq-item {
          display: inline-flex; align-items: center; gap: 12px;
          flex-shrink: 0;
          opacity: 0.7;
          font-size: 17px; font-weight: 500;
          letter-spacing: -0.01em;
          color: var(--mk-text-2);
        }
        .mk-mq-icon {
          width: 28px; height: 28px;
          display: inline-flex; align-items: center; justify-content: center;
          background: var(--mk-panel);
          border: 1px solid var(--mk-border);
          border-radius: 6px;
          font-size: 11px; font-weight: 700;
          color: var(--mk-text-2);
          overflow: hidden;
        }
        .mk-mq-icon img { width: 18px; height: 18px; }
      `}</style>
    </section>
  );
}

function ProviderChip({ provider }: { provider: MarketingMarqueeProvider }) {
  const [failed, setFailed] = useState(false);
  const initials = provider.label
    .replace(/[^a-z0-9]/gi, "")
    .slice(0, 2)
    .toUpperCase();
  return (
    <div
      className="mk-mq-item"
      data-testid="marketing-marquee-item"
      data-provider-id={provider.id}
    >
      <span className="mk-mq-icon" aria-hidden>
        {provider.iconUrl && !failed ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={provider.iconUrl}
            alt=""
            onError={() => setFailed(true)}
          />
        ) : (
          <span>{initials || "?"}</span>
        )}
      </span>
      <span>{provider.label}</span>
    </div>
  );
}
