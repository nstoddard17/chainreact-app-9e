import { edenCallTool, type EdenEnvelope } from "./_client";

/** One Eden workspace, bounded to safe display fields (no owner email / user object). */
export interface EdenWorkspace {
  id: string;
  name: string | null;
  slug: string | null;
  role: string | null;
}

export interface EdenWorkspacesResult {
  workspaces: EdenWorkspace[];
  defaultWorkspaceId: string | null;
}

function asString(v: unknown): string | null {
  return typeof v === "string" ? v : null;
}

/**
 * `eden_list_workspaces` → the caller's workspaces + default. Deliberately DROPS the envelope's
 * `user` object (which carries the account email) — never surfaced into options or outputs.
 */
export async function listWorkspaces(input: { accessToken: string }): Promise<EdenWorkspacesResult> {
  const env: EdenEnvelope = await edenCallTool({
    accessToken: input.accessToken,
    tool: "eden_list_workspaces",
    args: {},
    idempotent: true,
  });
  const rawList = Array.isArray(env.workspaces) ? (env.workspaces as unknown[]) : [];
  const workspaces: EdenWorkspace[] = rawList.map((w) => {
    const o = (w ?? {}) as Record<string, unknown>;
    return { id: asString(o.id) ?? "", name: asString(o.name), slug: asString(o.slug), role: asString(o.role) };
  }).filter((w) => w.id.length > 0);
  return { workspaces, defaultWorkspaceId: asString(env.defaultWorkspaceId) };
}
