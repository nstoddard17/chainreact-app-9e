import { Mail } from "lucide-react";

/**
 * Support fallback callout (HELP-CENTER-1).
 *
 * Renders the real staffed support mailbox (the same
 * `support@chainreact.app` used by the marketing footers and the in-app
 * user menu). If NO destination is configured (email omitted), the
 * component renders nothing at all — a dead "Contact us" button must never
 * ship. Server-safe: no client state.
 */

interface Props {
  /** Real support mailbox. Omit/undefined ⇒ the callout is not rendered. */
  email?: string;
  /** Smaller inline variant for article-page footers. */
  compact?: boolean;
}

export function HelpSupportCallout({ email, compact }: Props) {
  if (!email) return null;

  if (compact) {
    return (
      <p className="hc-support-compact" data-testid="help-support-callout">
        Still stuck?{" "}
        <a href={`mailto:${email}`} className="hc-support-mail">
          Email support
        </a>{" "}
        — we read every message.
      </p>
    );
  }

  return (
    <section
      className="hc-support"
      aria-label="Contact support"
      data-testid="help-support-callout"
    >
      <h2 className="hc-support-h">Can&apos;t find what you need?</h2>
      <p className="hc-support-p">
        Tell us what you&apos;re trying to do and where you got stuck — a real person reads
        every message.
      </p>
      <a className="hc-support-btn" href={`mailto:${email}`} data-testid="help-support-email">
        <Mail size={13} aria-hidden /> Email support
      </a>
    </section>
  );
}
