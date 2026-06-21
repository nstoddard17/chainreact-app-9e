/**
 * Safe guidance-prompt builder for the Hermes Agent gateway (HERMES-AGENT-PROD-CLIENT).
 *
 * Builds the SINGLE `prompt` string ChainReact sends in the gateway body `{ "prompt": ... }` from
 * SAFE inputs ONLY:
 *   - the de-identified generalized workflow shape (from sanitizeWorkflowForGuidance — NO config),
 *   - the public ChainReact capability catalog (provider:type keys — not user data),
 *   - the user's own goal text, defensively scrubbed of obvious secret/token shapes.
 *
 * It NEVER includes node config values, secrets, OAuth/refresh tokens, API keys, the gateway token,
 * provider credentials, raw integration/Supabase rows, service-role data, private provider config,
 * or real workflow/account/user/node ids (nodes are opaque `n0/n1` refs). The Hermes Agent owns the
 * heavy system prompting on its side; this is just the safe, user-facing request payload.
 */

import type { WorkflowGuidanceRequest } from "@/contracts/aiGuidance";

export interface BuildGatewayPromptInput {
  /** Already-sanitized request (generalized shape + guidance kind + safe finding codes). */
  readonly request: WorkflowGuidanceRequest;
  /** The user's own goal text (their words). Scrubbed of obvious secrets before inclusion. */
  readonly goalText?: string;
  /** Public capability catalog the brain may propose from (provider:type keys). Safe — not user data. */
  readonly capabilityCatalog?: readonly string[];
}

/**
 * Defensive redaction of obvious secret/token shapes from user free text. The goal text is the
 * user's own words, but a user could paste a key — redact common shapes so a pasted secret never
 * reaches the gateway. Returns the text with matches replaced by "[redacted]".
 */
export function redactSecretsFromText(text: string): string {
  return text
    .replace(/\bxox[abprs]-[A-Za-z0-9-]{8,}\b/g, "[redacted]") // Slack tokens
    .replace(/\bsk-[A-Za-z0-9]{16,}\b/g, "[redacted]") // OpenAI-style keys
    .replace(/\bgh[pousr]_[A-Za-z0-9]{16,}\b/g, "[redacted]") // GitHub tokens
    .replace(/\bya29\.[A-Za-z0-9._-]{10,}\b/g, "[redacted]") // Google OAuth
    .replace(/\bBearer\s+[A-Za-z0-9._-]{12,}\b/gi, "[redacted]") // bearer headers
    .replace(/\beyJ[A-Za-z0-9._-]{20,}\b/g, "[redacted]") // JWTs
    .replace(/\b[A-Fa-f0-9]{32,}\b/g, "[redacted]"); // long hex secrets
}

/** Build the safe gateway prompt string. Pure; reads only safe inputs; forwards no config/secret/id. */
export function buildGatewayGuidancePrompt(input: BuildGatewayPromptInput): string {
  const wf = input.request.workflow;

  const goal = input.goalText ? redactSecretsFromText(input.goalText).slice(0, 4_000) : "";
  const goalLine = goal
    ? `User goal (their words): ${goal}`
    : "The user has not described a goal yet — ask clarifying questions.";

  const shapeLine =
    wf.nodeCount > 0
      ? `Current workflow shape: ${wf.nodeCount} step(s), ${wf.edgeCount} connection(s).\n` +
        wf.nodes.map((n) => `  - ${n.ref}: ${n.kind} ${n.provider}:${n.type}`).join("\n")
      : "There is no workflow yet.";

  const catalogLine = input.capabilityCatalog?.length
    ? "Available ChainReact capabilities (provider:type) to propose from:\n" +
      input.capabilityCatalog.map((c) => `  - ${c}`).join("\n")
    : "";

  const findingsLine = input.request.findingCodes?.length
    ? `Known issues (codes): ${input.request.findingCodes.join(", ")}`
    : "";

  return [
    `Guidance kind: ${input.request.guidanceKind}`,
    goalLine,
    shapeLine,
    findingsLine,
    catalogLine,
    "This is advice only. ChainReact validates any proposed plan and is the only thing that can build, change, or run a workflow.",
  ]
    .filter((l) => l.length > 0)
    .join("\n\n");
}
