import { edenCallTool, type EdenEnvelope } from "./_client";

function str(v: unknown): string | null {
  return typeof v === "string" ? v : null;
}

/** A bounded saved prompt/skill list entry (Eden shares one "prompts & skills" library). */
export interface EdenPromptSummary {
  id: string;
  title: string | null;
  summary: string | null;
  description: string | null;
  category: string | null;
  source: string | null;
}

function normalizeSummary(raw: unknown): EdenPromptSummary {
  const o = (raw ?? {}) as Record<string, unknown>;
  return {
    id: str(o.id) ?? "",
    title: str(o.title),
    summary: str(o.summary),
    description: str(o.description),
    category: str(o.category),
    source: str(o.source),
  };
}

/**
 * `eden_list_prompts` → the workspace's saved prompts & skills. Eden returns both `prompts` and
 * `skills` arrays (the same shared library); we merge + de-dup by id into one bounded list.
 */
export async function listPrompts(input: {
  accessToken: string;
  workspaceId?: string;
}): Promise<{ prompts: EdenPromptSummary[] }> {
  const env: EdenEnvelope = await edenCallTool({
    accessToken: input.accessToken,
    tool: "eden_list_prompts",
    args: { ...(input.workspaceId ? { workspaceId: input.workspaceId } : {}) },
    idempotent: true,
  });
  const merged = [
    ...(Array.isArray(env.prompts) ? (env.prompts as unknown[]) : []),
    ...(Array.isArray(env.skills) ? (env.skills as unknown[]) : []),
  ].map(normalizeSummary);
  const seen = new Set<string>();
  const prompts: EdenPromptSummary[] = [];
  for (const p of merged) {
    if (p.id.length === 0 || seen.has(p.id)) continue;
    seen.add(p.id);
    prompts.push(p);
  }
  return { prompts };
}

export interface EdenPrompt {
  id: string;
  title: string | null;
  summary: string | null;
  description: string | null;
  category: string | null;
  systemPrompt: string | null;
  toolsEnabled: string[];
  usesVoiceProfile: boolean;
}

/** `eden_get_prompt` → a saved prompt/skill's full definition (bounded; systemPrompt is the body). */
export async function getPrompt(input: { accessToken: string; promptId: string }): Promise<EdenPrompt> {
  const env: EdenEnvelope = await edenCallTool({
    accessToken: input.accessToken,
    tool: "eden_get_prompt",
    args: { promptId: input.promptId },
    idempotent: true,
  });
  const s = (env.skill ?? env.prompt ?? {}) as Record<string, unknown>;
  const tools = Array.isArray(s.toolsEnabled) ? (s.toolsEnabled as unknown[]).filter((t): t is string => typeof t === "string") : [];
  return {
    id: str(s.id) ?? input.promptId,
    title: str(s.title),
    summary: str(s.summary),
    description: str(s.description),
    category: str(s.category),
    systemPrompt: str(s.systemPrompt),
    toolsEnabled: tools,
    usesVoiceProfile: s.usesVoiceProfile === true,
  };
}

/** `eden_export_skill` → a saved prompt/skill exported as portable Markdown. */
export async function exportSkill(input: { accessToken: string; promptId: string }): Promise<{ markdown: string; slug: string | null }> {
  const env = await edenCallTool({
    accessToken: input.accessToken,
    tool: "eden_export_skill",
    args: { promptId: input.promptId },
    idempotent: true,
  });
  return { markdown: str(env.skillMd) ?? "", slug: str(env.slug) };
}
