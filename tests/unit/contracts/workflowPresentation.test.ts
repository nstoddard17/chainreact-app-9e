/** @jest-environment node */
/**
 * Presentation contract + normalization (5.DUAL-BUILDER-1 / CS-4).
 *
 * Locks the strict ingress validator (unknown version / duplicate section id /
 * over-length title / caps rejected) and the shared, defensive normalization
 * rule (stale membership pruned, one-section-per-node, dedup, empty sections
 * dropped, idempotent, non-mutating, byte-equivalent when clean). Also proves
 * WorkflowDefinition stays backward-compatible and auto-normalizes membership.
 */
import {
  WorkflowPresentationSchema,
  normalizePresentation,
  MAX_SECTIONS,
  MAX_SECTION_NODE_IDS,
  type WorkflowPresentation,
} from "@/contracts/workflowPresentation";
import { WorkflowDefinitionSchema } from "@/contracts/workflowDefinition";

const ids = (...xs: string[]) => new Set(xs);

describe("WorkflowPresentationSchema — strict ingress", () => {
  it("accepts a valid version-1 block", () => {
    const parsed = WorkflowPresentationSchema.parse({
      version: 1,
      sections: [{ id: "s1", title: "Qualify", nodeIds: ["a", "b"], collapsed: true }],
    });
    expect(parsed.sections[0]!.title).toBe("Qualify");
  });

  it("rejects an unknown version", () => {
    expect(() => WorkflowPresentationSchema.parse({ version: 2, sections: [] })).toThrow();
  });

  it("rejects duplicate section ids", () => {
    expect(() =>
      WorkflowPresentationSchema.parse({
        version: 1,
        sections: [
          { id: "s1", title: "A", nodeIds: ["a"] },
          { id: "s1", title: "B", nodeIds: ["b"] },
        ],
      }),
    ).toThrow();
  });

  it("rejects an over-length title (>80)", () => {
    expect(() =>
      WorkflowPresentationSchema.parse({
        version: 1,
        sections: [{ id: "s1", title: "x".repeat(81), nodeIds: ["a"] }],
      }),
    ).toThrow();
  });

  it("rejects a blank/whitespace title", () => {
    expect(() =>
      WorkflowPresentationSchema.parse({ version: 1, sections: [{ id: "s1", title: "   ", nodeIds: ["a"] }] }),
    ).toThrow();
  });

  it("enforces the section cap", () => {
    const sections = Array.from({ length: MAX_SECTIONS + 1 }, (_, i) => ({
      id: `s${i}`,
      title: `S${i}`,
      nodeIds: [`n${i}`],
    }));
    expect(() => WorkflowPresentationSchema.parse({ version: 1, sections })).toThrow();
  });

  it("enforces the membership cap", () => {
    const nodeIds = Array.from({ length: MAX_SECTION_NODE_IDS + 1 }, (_, i) => `n${i}`);
    expect(() =>
      WorkflowPresentationSchema.parse({ version: 1, sections: [{ id: "s1", title: "A", nodeIds }] }),
    ).toThrow();
  });

  it("trims titles on parse", () => {
    const parsed = WorkflowPresentationSchema.parse({
      version: 1,
      sections: [{ id: "s1", title: "  Qualify  ", nodeIds: ["a"] }],
    });
    expect(parsed.sections[0]!.title).toBe("Qualify");
  });
});

describe("normalizePresentation — the shared cleanup rule", () => {
  it("returns null for null/undefined/garbage/unknown version", () => {
    expect(normalizePresentation(null, ids("a"))).toBeNull();
    expect(normalizePresentation(undefined, ids("a"))).toBeNull();
    expect(normalizePresentation(42, ids("a"))).toBeNull();
    expect(normalizePresentation({ version: 9, sections: [] }, ids("a"))).toBeNull();
    expect(normalizePresentation({ version: 1, sections: "nope" }, ids("a"))).toBeNull();
  });

  it("removes references to node ids that no longer exist", () => {
    const out = normalizePresentation(
      { version: 1, sections: [{ id: "s1", title: "A", nodeIds: ["a", "gone", "b"] }] },
      ids("a", "b"),
    );
    expect(out?.sections[0]!.nodeIds).toEqual(["a", "b"]);
  });

  it("de-duplicates membership within a section", () => {
    const out = normalizePresentation(
      { version: 1, sections: [{ id: "s1", title: "A", nodeIds: ["a", "a", "b"] }] },
      ids("a", "b"),
    );
    expect(out?.sections[0]!.nodeIds).toEqual(["a", "b"]);
  });

  it("one node in multiple sections resolves to the FIRST section (array order)", () => {
    const out = normalizePresentation(
      {
        version: 1,
        sections: [
          { id: "s1", title: "First", nodeIds: ["a", "shared"] },
          { id: "s2", title: "Second", nodeIds: ["shared", "b"] },
        ],
      },
      ids("a", "b", "shared"),
    );
    expect(out?.sections[0]!.nodeIds).toEqual(["a", "shared"]);
    expect(out?.sections[1]!.nodeIds).toEqual(["b"]); // shared removed from the later section
  });

  it("removes sections left empty after pruning", () => {
    const out = normalizePresentation(
      {
        version: 1,
        sections: [
          { id: "s1", title: "Keep", nodeIds: ["a"] },
          { id: "s2", title: "Empty", nodeIds: ["gone"] },
        ],
      },
      ids("a"),
    );
    expect(out?.sections.map((s) => s.id)).toEqual(["s1"]);
  });

  it("drops later duplicate section ids", () => {
    const out = normalizePresentation(
      {
        version: 1,
        sections: [
          { id: "s1", title: "A", nodeIds: ["a"] },
          { id: "s1", title: "B", nodeIds: ["b"] },
        ],
      },
      ids("a", "b"),
    );
    expect(out?.sections).toHaveLength(1);
    expect(out?.sections[0]!.title).toBe("A");
  });

  it("preserves valid id/title/order/collapse", () => {
    const input: WorkflowPresentation = {
      version: 1,
      sections: [
        { id: "s2", title: "Second", nodeIds: ["b"], collapsed: true },
        { id: "s1", title: "First", nodeIds: ["a"] },
      ],
    };
    const out = normalizePresentation(input, ids("a", "b"));
    expect(out?.sections.map((s) => s.id)).toEqual(["s2", "s1"]); // array order preserved
    expect(out?.sections[0]!.collapsed).toBe(true);
  });

  it("caps over-length titles defensively (keeps legacy data round-trippable)", () => {
    const out = normalizePresentation(
      { version: 1, sections: [{ id: "s1", title: "x".repeat(200), nodeIds: ["a"] }] },
      ids("a"),
    );
    expect(out?.sections[0]!.title).toHaveLength(80);
  });

  it("is idempotent and returns the SAME reference when already clean", () => {
    const clean: WorkflowPresentation = {
      version: 1,
      sections: [{ id: "s1", title: "A", nodeIds: ["a", "b"] }],
    };
    const first = normalizePresentation(clean, ids("a", "b"));
    expect(first).toBe(clean); // byte-equivalent → same reference
    expect(normalizePresentation(first, ids("a", "b"))).toBe(first); // idempotent
  });

  it("does not mutate its input", () => {
    const input = { version: 1, sections: [{ id: "s1", title: "A", nodeIds: ["a", "gone"] }] };
    const snapshot = JSON.stringify(input);
    normalizePresentation(input, ids("a"));
    expect(JSON.stringify(input)).toBe(snapshot);
  });
});

describe("WorkflowDefinitionSchema — backward compatibility + auto-normalize", () => {
  const node = (id: string) => ({
    id,
    kind: "action" as const,
    provider: "slack",
    type: "send_channel_message",
    config: {},
    position: { x: 0, y: 0 },
  });

  it("an old { nodes, edges } definition parses unchanged (no presentation key)", () => {
    const parsed = WorkflowDefinitionSchema.parse({ nodes: [node("a")], edges: [] });
    expect(parsed).not.toHaveProperty("presentation");
  });

  it("a valid presentation parses and normalizes membership against the nodes", () => {
    const parsed = WorkflowDefinitionSchema.parse({
      nodes: [node("a"), node("b")],
      edges: [],
      presentation: { version: 1, sections: [{ id: "s1", title: "Group", nodeIds: ["a", "b", "ghost"] }] },
    });
    expect(parsed.presentation?.sections[0]!.nodeIds).toEqual(["a", "b"]); // ghost pruned
  });

  it("presentation that normalizes to empty is omitted entirely", () => {
    const parsed = WorkflowDefinitionSchema.parse({
      nodes: [node("a")],
      edges: [],
      presentation: { version: 1, sections: [{ id: "s1", title: "Ghost", nodeIds: ["ghost"] }] },
    });
    expect(parsed).not.toHaveProperty("presentation");
  });

  it("strips unknown top-level fields (unchanged security policy)", () => {
    const parsed = WorkflowDefinitionSchema.parse({
      nodes: [node("a")],
      edges: [],
      evil: "x",
    } as unknown as { nodes: unknown; edges: unknown });
    expect(parsed).not.toHaveProperty("evil");
  });
});
