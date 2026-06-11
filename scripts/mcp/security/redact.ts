/**
 * Internal MCP server — secret redaction.
 *
 * Defense-in-depth. The whitelist only exposes curated, secret-free docs and
 * manifest text, but every byte returned to the AI host passes through
 * `redactSecrets` so that an accidentally-pasted credential in a doc never
 * leaves the machine.
 *
 * Patterns are conservative and target high-signal credential shapes; they are
 * not a general PII scrubber.
 */

interface RedactionRule {
  readonly label: string;
  readonly pattern: RegExp;
}

const RULES: readonly RedactionRule[] = [
  // PEM private key blocks.
  {
    label: "private-key",
    pattern:
      /-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*?-----END [A-Z ]*PRIVATE KEY-----/g,
  },
  // JWTs (three base64url segments). No leading \b — Supabase service-role
  // keys are JWTs, and a token glued to preceding word chars (no delimiter)
  // must still be caught. The `eyJ.<seg>.<seg>` shape is specific enough that
  // dropping the boundary does not cause realistic false positives.
  {
    label: "jwt",
    pattern: /eyJ[A-Za-z0-9_-]{6,}\.[A-Za-z0-9_-]{6,}\.[A-Za-z0-9_-]{6,}/g,
  },
  // Slack tokens.
  { label: "slack-token", pattern: /\bxox[baprs]-[A-Za-z0-9-]{10,}\b/g },
  // OpenAI keys.
  { label: "openai-key", pattern: /\bsk-[A-Za-z0-9_-]{20,}\b/g },
  // Stripe secret/restricted keys (live + test).
  { label: "stripe-key", pattern: /\b[rs]k_(?:live|test)_[A-Za-z0-9]{16,}\b/g },
  // GitHub tokens.
  { label: "github-token", pattern: /\bgh[posu]_[A-Za-z0-9]{20,}\b/g },
  // Google API keys.
  { label: "google-api-key", pattern: /\bAIza[A-Za-z0-9_-]{20,}\b/g },
  // AWS access key id.
  { label: "aws-access-key", pattern: /\bAKIA[A-Z0-9]{16}\b/g },
  // Bearer tokens in headers.
  {
    label: "bearer",
    pattern: /\bBearer\s+[A-Za-z0-9._-]{12,}/g,
  },
  // KEY/SECRET/TOKEN/PASSWORD assignments (env-style or KV) with a real value.
  {
    label: "assigned-secret",
    pattern:
      /\b([A-Z0-9_]*(?:SECRET|TOKEN|PASSWORD|API[_-]?KEY|PRIVATE[_-]?KEY|SERVICE[_-]?ROLE[_-]?KEY))\b\s*[:=]\s*["']?[A-Za-z0-9._\-/+]{8,}["']?/gi,
  },
];

/** Replace credential-shaped substrings with `[REDACTED:<label>]`. */
export function redactSecrets(input: string): string {
  let out = input;
  for (const rule of RULES) {
    out = out.replace(rule.pattern, (match) => {
      // For assignment-style matches keep the key name, redact the value.
      if (rule.label === "assigned-secret") {
        const eq = match.search(/[:=]/);
        return `${match.slice(0, eq + 1)} [REDACTED:secret]`;
      }
      return `[REDACTED:${rule.label}]`;
    });
  }
  return out;
}
