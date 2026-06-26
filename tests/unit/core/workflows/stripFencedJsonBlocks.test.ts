/**
 * @jest-environment node
 *
 * Defensive rail JSON stripper (HERMES-AGENT-WORKFLOW-EDITOR). Belt-and-suspenders so raw model JSON
 * never renders even if a producer forgets to strip it server-side.
 */

import { stripFencedJsonBlocks } from "@/core/workflows/stripFencedJsonBlocks";

describe("stripFencedJsonBlocks", () => {
  it("removes a fenced JSON operations block but keeps the prose", () => {
    const text = "I'll make that change.\n\n```json\n{\"editVersion\":\"x\",\"operations\":[{\"op\":\"removeNode\",\"nodeId\":\"node_2\"}]}\n```";
    const out = stripFencedJsonBlocks(text);
    expect(out).toBe("I'll make that change.");
    expect(out).not.toContain("operations");
    expect(out).not.toContain("```");
  });

  it("removes an unlabeled fenced JSON dump", () => {
    expect(stripFencedJsonBlocks("Here:\n```\n{ \"foo\": 1 }\n```")).toBe("Here:");
  });

  it("preserves a non-JSON code block (e.g. a shell snippet)", () => {
    const text = "Run this:\n```bash\nnpm test\n```";
    expect(stripFencedJsonBlocks(text)).toBe(text.trim());
  });

  it("returns plain prose unchanged", () => {
    expect(stripFencedJsonBlocks("Should I use Gmail or Outlook?")).toBe("Should I use Gmail or Outlook?");
  });
});
