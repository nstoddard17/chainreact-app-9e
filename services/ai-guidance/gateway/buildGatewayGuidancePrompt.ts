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

import type { GuidanceConversationTurn, WorkflowGuidanceRequest } from "@/contracts/aiGuidance";
import { MAX_GUIDANCE_CONVERSATION_TURNS, MAX_GUIDANCE_CONVERSATION_TURN_TEXT } from "@/contracts/aiGuidance";
import type { SafeGuidanceContext } from "../guidanceContextPolicy";

export interface BuildGatewayPromptInput {
  /** Already-sanitized request (generalized shape + guidance kind + safe finding codes). */
  readonly request: WorkflowGuidanceRequest;
  /** The user's own goal text (their words). Scrubbed of obvious secrets before inclusion. */
  readonly goalText?: string;
  /**
   * HERMES-AGENT-BUILDER-RAIL-CHAT-MODE — optional session-scoped recent conversation (plain-text
   * user/assistant turns). Each turn is defensively secret-scrubbed + truncated and the list is bounded
   * to the most recent turns, so a follow-up reads in context without leaking config/secrets/ids.
   */
  readonly recentTurns?: readonly GuidanceConversationTurn[];
  /** Public capability catalog the brain may propose from (provider:type keys). Safe — not user data. */
  readonly capabilityCatalog?: readonly string[];
  /**
   * Scope-guarded context (HERMES-AGENT-MEMORY-SCOPE-GUARD) — account summary, account-shared /
   * own-connection availability, and a private-connection notice. Built by `buildSafeGuidanceContext`,
   * which guarantees no other-member private data / secrets / identity ever appears here.
   */
  readonly context?: SafeGuidanceContext;
}

/**
 * Hard scope instruction sent every request (HERMES-AGENT-MEMORY-SCOPE-GUARD). The REAL enforcement
 * is in ChainReact code (the selector decides what crosses the boundary); this just reinforces it.
 */
const CONTEXT_SCOPE_INSTRUCTION =
  "Use only the context included in this request. Do not infer or claim access to other team members' private data, credentials, messages, files, or memories.";

/**
 * Provider-availability instruction (HERMES-AGENT-CREDENTIAL-AVAILABILITY-CONTEXT). Keeps suggestions
 * grounded in the sanitized availability summary instead of assuming a connection exists.
 */
const CREDENTIAL_AVAILABILITY_INSTRUCTION =
  "Only suggest using connections listed as available in this request, or ask the user to connect or share the provider first.";

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

  // Session-scoped recent conversation (HERMES-AGENT-BUILDER-RAIL-CHAT-MODE). Bounded to the most
  // recent turns; each turn defensively secret-scrubbed + truncated. Plain text only — no config/ids.
  const recent = (input.recentTurns ?? [])
    .slice(-MAX_GUIDANCE_CONVERSATION_TURNS)
    .map((t) => {
      const who = t.role === "assistant" ? "Assistant" : "User";
      const text = redactSecretsFromText(t.text).slice(0, MAX_GUIDANCE_CONVERSATION_TURN_TEXT);
      return `  ${who}: ${text}`;
    })
    .filter((l) => l.trim().length > 0);
  const conversationLine = recent.length
    ? `Recent conversation (most recent last, for context — the latest user goal above is the request to answer now):\n${recent.join("\n")}`
    : "";

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

  // Scope-guarded context (account-safe only). Each line is omitted when its field is absent.
  const ctx = input.context;
  const accountLine = ctx
    ? `Account context: type=${ctx.account.type}${ctx.account.role ? `, your role=${ctx.account.role}` : ""}.`
    : "";
  const sharedConnLine = ctx?.sharedCredentialProviders?.length
    ? `Shared account connections available: ${ctx.sharedCredentialProviders.join(", ")}.`
    : "";
  const ownConnLine = ctx?.ownConnectionProviders?.length
    ? `Your own connected accounts: ${ctx.ownConnectionProviders.join(", ")}.`
    : "";
  const privateConnLine = ctx?.privateConnectionNotice ?? "";

  return [
    `Guidance kind: ${input.request.guidanceKind}`,
    goalLine,
    conversationLine,
    shapeLine,
    findingsLine,
    catalogLine,
    accountLine,
    sharedConnLine,
    ownConnLine,
    privateConnLine,
    RESPONSE_FORMAT_INSTRUCTIONS,
    CONTEXT_SCOPE_INSTRUCTION,
    CREDENTIAL_AVAILABILITY_INSTRUCTION,
    "This is advice only. ChainReact validates any proposed plan and is the only thing that can build, change, or run a workflow.",
  ]
    .filter((l) => l.length > 0)
    .join("\n\n");
}

/**
 * Response-format guidance for the Hermes Agent (HERMES-AGENT-PLAN-EXTRACTION +
 * HERMES-AGENT-PREFER-PARTIAL-PREVIEW-WITH-SETUP). Asks for normal-language help PLUS an OPTIONAL
 * structured plan in a single fenced ```json block.
 *
 * KEY RULE (the partial-preview correction): the plan describes the workflow SHAPE (which trigger /
 * actions, in what order). Missing CONFIG VALUES — a Slack channel, a recipient, the exact message
 * text, dates — are NOT a reason to withhold the plan. ChainReact collects those itself with a guided
 * setup UI (dropdowns / text fields) AFTER the user reviews the shape. So whenever the trigger/action
 * shape is clear, the agent should RETURN the plan and list the unknown field keys in `requiredInputs`,
 * rather than asking for those values first. Clarifying questions come first ONLY when the SHAPE itself
 * is ambiguous. The plan shape mirrors ChainReact's WorkflowPlan; provider/type MUST come from the
 * capability catalog (ChainReact rejects anything it cannot find). The agent must NOT claim it
 * created/changed/saved anything — ChainReact never applies a plan automatically.
 */
const RESPONSE_FORMAT_INSTRUCTIONS = [
  "How to respond:",
  "- Answer in clear, normal language first (one or two sentences is fine).",
  "- The structured plan describes the workflow SHAPE — which trigger and actions, in what order. Missing CONFIG VALUES (e.g. which Slack channel, the recipient, the exact message text, specific dates) are NOT part of the shape and are NOT a reason to withhold the plan: ChainReact collects them itself with a guided setup form (dropdowns / text fields) after the user reviews the shape.",
  "- When the trigger/action shape is clear, RETURN the plan even if specific config values are still unknown. List each unknown field key the step needs in that step's `requiredInputs` (e.g. \"channel\", \"text\") and leave the values out — do NOT ask the user for a channel, recipient, or message text before returning the plan.",
  "- Append the plan as ONE optional structured plan in a single fenced ```json code block, in this shape:",
  '  {"title": "...", "summary": "...", "steps": [{"ref": "s0", "role": "trigger|action|logic", "provider": "<from the catalog>", "type": "<from the catalog>", "purpose": "...", "requiredInputs": ["fieldKey"]}], "clarifyingQuestions": ["..."]}',
  "- Every step's provider:type MUST be one of the listed ChainReact capabilities. Do not invent providers, actions, or triggers.",
  "- Ask short clarifying questions FIRST (and OMIT the json block) ONLY when the SHAPE itself is ambiguous — e.g. you cannot tell which trigger or action to use, which app/provider the user means, or the request could map to materially different workflow structures. Missing config values alone never make the shape ambiguous.",
  "- If the shape is genuinely unclear and you cannot pick capabilities from the catalog, OMIT the json block — do not guess providers/actions.",
  "- The plan is a suggestion for the user to review. Do NOT say you created, added, applied, saved, ran, or changed anything — nothing is changed in their workflow.",
].join("\n");
