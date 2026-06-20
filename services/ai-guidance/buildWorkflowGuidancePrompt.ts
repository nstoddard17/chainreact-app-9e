/**
 * Safe-DTO prompt builder for `workflow_guidance_intake` (HOSTED-HERMES-GUIDANCE-BRAIN-2).
 *
 * Builds the chat messages sent to the hosted brain from SAFE inputs ONLY:
 *   - the de-identified generalized workflow shape (from sanitizeWorkflowForGuidance — NO config),
 *   - the ChainReact capability CATALOG (public provider/action/trigger names — not user data),
 *   - the user's own goal text, defensively scrubbed of obvious secret/token shapes.
 *
 * It NEVER receives or forwards node config values, secrets, tokens, provider credentials, raw
 * integration rows, account/user/workflow ids, or DB rows. The system prompt instructs the brain
 * to ask clarifying questions, propose ONLY listed capabilities, and never claim it created or
 * changed anything (guidance is advisory; ChainReact applies, after approval).
 */

import type { WorkflowGuidanceRequest } from "@/contracts/aiGuidance";

export interface GuidanceChatMessage {
  readonly role: "system" | "user";
  readonly content: string;
}

export interface BuildGuidancePromptInput {
  /** Already-sanitized request (generalized shape + guidance kind + safe finding codes). */
  readonly request: WorkflowGuidanceRequest;
  /** The user's own goal text (their words). Scrubbed of obvious secrets before inclusion. */
  readonly goalText?: string;
  /** Public capability catalog the brain may propose from (provider:type keys). Safe — not user data. */
  readonly capabilityCatalog: readonly string[];
}

/**
 * Defensive redaction of obvious secret/token shapes from user free text. User GOAL text is
 * their own words (not credentials), but a user could paste a key — redact common shapes so a
 * pasted secret never reaches the brain. Returns the text with matches replaced by "[redacted]".
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

const SYSTEM_PROMPT = [
  "You are ChainReact's workflow guidance assistant. You help a user who may not know how to",
  "build an automation think through what they want, ask clarifying questions, and propose a",
  "safe Workflow Plan.",
  "",
  "HARD RULES:",
  "- Propose ONLY steps whose `provider:type` appears in the provided capability catalog. Never",
  "  invent providers, actions, or triggers. If the catalog lacks something, say so.",
  "- You do NOT create, change, save, run, or apply anything. A plan is advice only; ChainReact",
  "  builds and applies workflows deterministically after the user approves.",
  "- Never ask for, infer, or include secrets, API keys, tokens, passwords, or config VALUES.",
  "  Describe what inputs a step needs by field NAME only.",
  "- Prefer asking a clarifying question over guessing when the user's goal is ambiguous.",
].join("\n");

/** Build the chat messages. Pure; reads only the safe inputs; forwards no config/secret/id. */
export function buildWorkflowGuidancePrompt(input: BuildGuidancePromptInput): readonly GuidanceChatMessage[] {
  const wf = input.request.workflow;
  const shapeLine =
    `Current workflow shape: ${wf.nodeCount} step(s), ${wf.edgeCount} connection(s).\n` +
    wf.nodes.map((n) => `  - ${n.ref}: ${n.kind} ${n.provider}:${n.type}`).join("\n");

  const catalogLine =
    "Available ChainReact capabilities (provider:type) you may propose from:\n" +
    input.capabilityCatalog.map((c) => `  - ${c}`).join("\n");

  const findingsLine = input.request.findingCodes?.length
    ? `Known issues (codes): ${input.request.findingCodes.join(", ")}`
    : "";

  const goal = input.goalText ? redactSecretsFromText(input.goalText).slice(0, 4_000) : "";
  const goalLine = goal ? `The user's goal, in their words: ${goal}` : "The user has not described a goal yet — ask.";

  const userContent = [
    `Guidance kind: ${input.request.guidanceKind}`,
    shapeLine,
    findingsLine,
    catalogLine,
    goalLine,
    "",
    "Ask any clarifying questions you need, then propose a safe Workflow Plan using only the",
    "listed capabilities.",
  ]
    .filter((l) => l.length > 0)
    .join("\n\n");

  return [
    { role: "system", content: SYSTEM_PROMPT },
    { role: "user", content: userContent },
  ];
}
