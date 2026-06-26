/**
 * Defensive removal of fenced JSON/code blocks from an assistant message before it renders in the rail
 * (HERMES-AGENT-WORKFLOW-EDITOR). The server already strips machine operation blocks from the guidance
 * text, but the rail applies this as belt-and-suspenders so raw model JSON (operations / editVersion /
 * any ```json dump) can NEVER reach the user even if a future producer forgets to strip it.
 *
 * Removes ``` … ``` fenced blocks whose body reads as JSON (starts with `{`/`[`) or carries machine-edit
 * keys (`operations` / `editVersion`). Non-JSON fenced blocks (e.g. a code sample) are preserved. Pure.
 */

const FENCED_BLOCK_RE = /```[^\n]*\n?([\s\S]*?)```/g;

export function stripFencedJsonBlocks(text: string): string {
  if (!text || typeof text !== "string") return text ?? "";
  const stripped = text.replace(FENCED_BLOCK_RE, (full, body: string) => {
    const t = String(body ?? "").trim();
    const jsonish = t.startsWith("{") || t.startsWith("[");
    const machineKeys = /"(operations|editVersion|baseVersion)"\s*:/.test(t);
    return jsonish || machineKeys ? "" : full;
  });
  return stripped.replace(/\n{3,}/g, "\n\n").trim();
}
