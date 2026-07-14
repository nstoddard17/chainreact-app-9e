/**
 * @jest-environment node
 *
 * Schema-drift detection for pinned MCP tools. Guards a pinned/certified Eden tool
 * against a live catalog change that would make our arguments wrong.
 */
import { detectSchemaDrift } from "@/integrations/_shared/mcp";

const pinned = {
  type: "object",
  properties: { boardId: { type: "string" }, cursor: { type: "string" } },
  required: ["boardId"],
};

describe("detectSchemaDrift", () => {
  it("no drift when the schema is identical", () => {
    expect(detectSchemaDrift(pinned, pinned).drifted).toBe(false);
  });

  it("no drift when the live schema ADDS an optional field (additive, our args stay valid)", () => {
    const live = { ...pinned, properties: { ...pinned.properties, limit: { type: "number" } } };
    expect(detectSchemaDrift(pinned, live).drifted).toBe(false);
  });

  it("DRIFT when a pinned field is removed", () => {
    const live = { type: "object", properties: { cursor: { type: "string" } }, required: [] as string[] };
    const r = detectSchemaDrift(pinned, live);
    expect(r.drifted).toBe(true);
    expect(r.reason).toContain("boardId");
  });

  it("DRIFT when a field becomes newly required", () => {
    const live = { ...pinned, required: ["boardId", "cursor"] };
    const r = detectSchemaDrift(pinned, live);
    expect(r.drifted).toBe(true);
    expect(r.reason).toContain("cursor");
  });
});
