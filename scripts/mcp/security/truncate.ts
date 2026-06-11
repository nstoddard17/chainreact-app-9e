/**
 * Internal MCP server — output truncation.
 *
 * Bounds the size of any single tool result so a large doc or command output
 * cannot blow up the host's context or memory. Truncation is explicit: the
 * marker tells the reader the content was cut.
 */

/** Cut `input` to at most `maxChars`, appending a visible marker if cut. */
export function truncateOutput(input: string, maxChars: number): string {
  if (input.length <= maxChars) return input;
  const kept = input.slice(0, maxChars);
  const dropped = input.length - maxChars;
  return `${kept}\n\n…[truncated ${dropped} characters; output capped at ${maxChars}]`;
}

/** Read-side cap: decode at most `maxBytes` of a buffer as UTF-8. */
export function truncateBuffer(buf: Buffer, maxBytes: number): {
  text: string;
  truncated: boolean;
} {
  if (buf.byteLength <= maxBytes) {
    return { text: buf.toString("utf8"), truncated: false };
  }
  return { text: buf.subarray(0, maxBytes).toString("utf8"), truncated: true };
}
