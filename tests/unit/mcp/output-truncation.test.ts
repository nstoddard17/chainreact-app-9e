/** @jest-environment node */
/**
 * Protects the internal MCP server's output-size bound.
 *
 * Business rule: no single tool result may exceed the configured cap. A
 * regression would let a large doc or command output blow up the host's
 * context/memory. The truncation marker must be visible so the reader knows
 * content was cut.
 */
import { truncateBuffer, truncateOutput } from "@/scripts/mcp/security/truncate";

describe("internal MCP output truncation", () => {
  it("caps over-long output and appends a visible marker", () => {
    const big = "a".repeat(100);
    const out = truncateOutput(big, 10);
    expect(out.startsWith("aaaaaaaaaa")).toBe(true);
    expect(out).toContain("truncated");
    expect(out).toContain("90 characters");
  });

  it("returns short output unchanged", () => {
    expect(truncateOutput("short", 100)).toBe("short");
  });

  it("caps a buffer read at the byte limit and flags truncation", () => {
    const buf = Buffer.from("0123456789abcdef", "utf8");
    const { text, truncated } = truncateBuffer(buf, 8);
    expect(text).toBe("01234567");
    expect(truncated).toBe(true);
  });

  it("returns a small buffer fully and flags no truncation", () => {
    const buf = Buffer.from("hi", "utf8");
    const { text, truncated } = truncateBuffer(buf, 1024);
    expect(text).toBe("hi");
    expect(truncated).toBe(false);
  });
});
