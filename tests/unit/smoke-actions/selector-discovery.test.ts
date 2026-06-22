/**
 * @jest-environment node
 *
 * Tier-1 selector auto-discovery — PURE engine.
 *
 * Drives `discoverSelectors` with a fake metadata graph + a fake source
 * resolver (no DB / no provider). Pins the algorithm: required sourced fields are
 * discovered (incl. cascade parents), present fields win + seed deps, required
 * fields with no source are "unavailable", and resolver outcomes map to the
 * documented states.
 */
import {
  discoverSelectors,
  type DiscoveryMeta,
  type SelectorDiscoveryDeps,
  type SourceResolveOutcome,
} from "@/tests/smoke-actions/selectorDiscovery";

const META: Record<string, DiscoveryMeta> = {
  // OneNote-style cascade: notebookId (root) ← sectionId ← pageId, all required.
  "x:get_page_content": {
    fields: [
      { name: "notebookId", required: true, optionsSource: "x:notebooks" },
      { name: "sectionId", required: true, optionsSource: "x:sections", dependsOn: "notebookId" },
      { name: "pageId", required: true, optionsSource: "x:pages", dependsOn: "sectionId" },
    ],
  },
  // One required field with NO source (e.g. a free-text email/query).
  "x:get_by_email": {
    fields: [{ name: "email", required: true }],
  },
  // Required sourced root + an OPTIONAL sourced field (must NOT be discovered).
  "x:list": {
    fields: [
      { name: "listId", required: true, optionsSource: "x:lists" },
      { name: "folderId", required: false, optionsSource: "x:folders" },
    ],
  },
};

const REQUIRED_DEPS: Record<string, readonly string[]> = {
  "x:sections": ["notebookId"],
  "x:pages": ["sectionId"],
};

function deps(resolveImpl: (source: string, d: Record<string, string>) => SourceResolveOutcome): SelectorDiscoveryDeps {
  return {
    getMeta: (key) => META[key],
    requiredDepsForSource: (source) => REQUIRED_DEPS[source],
    resolveSource: async ({ source, deps: d }) => resolveImpl(source, d as Record<string, string>),
  };
}

describe("discoverSelectors — cascade + overlay", () => {
  it("discovers a 3-level cascade and overlays ALL required parents, not just the leaf", async () => {
    const seen: Array<{ source: string; deps: Record<string, string> }> = [];
    const r = await discoverSelectors(
      { provider: "x", action: "get_page_content", presentFields: {} },
      deps((source, d) => {
        seen.push({ source, deps: d });
        const value = { "x:notebooks": "NB1", "x:sections": "SEC1", "x:pages": "PG1" }[source]!;
        return { kind: "items", values: [value] };
      }),
    );
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    // Cascade parents must end up on the overlay (readiness requires them).
    expect(r.overlay).toEqual({ notebookId: "NB1", sectionId: "SEC1", pageId: "PG1" });
    expect([...r.discoveredFields].sort()).toEqual(["notebookId", "pageId", "sectionId"]);
    // sectionId resolved under the discovered notebookId; pageId under sectionId.
    expect(seen.find((s) => s.source === "x:sections")?.deps).toEqual({ notebookId: "NB1" });
    expect(seen.find((s) => s.source === "x:pages")?.deps).toEqual({ sectionId: "SEC1" });
  });

  it("resolves each shared parent only ONCE (memoized)", async () => {
    let notebookCalls = 0;
    await discoverSelectors(
      { provider: "x", action: "get_page_content", presentFields: {} },
      deps((source) => {
        if (source === "x:notebooks") notebookCalls += 1;
        const value = { "x:notebooks": "NB1", "x:sections": "SEC1", "x:pages": "PG1" }[source]!;
        return { kind: "items", values: [value] };
      }),
    );
    expect(notebookCalls).toBe(1);
  });

  it("a present (manually-pinned) field wins and seeds the cascade dep — no discovery for it", async () => {
    const seen: string[] = [];
    const r = await discoverSelectors(
      { provider: "x", action: "get_page_content", presentFields: { notebookId: "PINNED" } },
      deps((source) => {
        seen.push(source);
        const value = { "x:sections": "SEC1", "x:pages": "PG1" }[source] ?? "x";
        return { kind: "items", values: [value] };
      }),
    );
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(seen).not.toContain("x:notebooks"); // pinned, not re-discovered
    expect(r.overlay.notebookId).toBeUndefined(); // already present, not overlaid
    // sectionId discovered under the PINNED notebook.
    expect(r.overlay).toEqual({ sectionId: "SEC1", pageId: "PG1" });
  });
});

describe("discoverSelectors — non-discoverable + outcome mapping", () => {
  it("a required field with NO option source is unavailable", async () => {
    const r = await discoverSelectors(
      { provider: "x", action: "get_by_email", presentFields: {} },
      deps(() => ({ kind: "items", values: ["v"] })),
    );
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.state).toBe("unavailable");
    expect(r.blockedField).toBe("email");
  });

  it("does NOT discover an optional sourced field", async () => {
    const r = await discoverSelectors(
      { provider: "x", action: "list", presentFields: {} },
      deps((source) => (source === "x:lists" ? { kind: "items", values: ["L1"] } : { kind: "error" })),
    );
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.overlay).toEqual({ listId: "L1" }); // folderId (optional) left unset
  });

  it("maps not-connected / empty / error from the source resolver", async () => {
    for (const [outcome, state] of [
      [{ kind: "not-connected" }, "not-connected"],
      [{ kind: "empty" }, "empty"],
      [{ kind: "error", reason: "boom" }, "error"],
    ] as const) {
      const r = await discoverSelectors(
        { provider: "x", action: "list", presentFields: {} },
        deps(() => outcome),
      );
      expect(r.ok).toBe(false);
      if (r.ok) continue;
      expect(r.state).toBe(state);
      expect(r.blockedField).toBe("listId");
    }
  });

  it("no metadata → nothing to discover (relies on config/env), ok empty", async () => {
    const r = await discoverSelectors(
      { provider: "x", action: "unknown", presentFields: {} },
      deps(() => ({ kind: "items", values: ["v"] })),
    );
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.overlay).toEqual({});
    expect(r.discoveredFields).toEqual([]);
  });

  it("nothing needed when every required field is already present", async () => {
    const r = await discoverSelectors(
      { provider: "x", action: "list", presentFields: { listId: "L1" } },
      deps(() => {
        throw new Error("resolveSource must not be called");
      }),
    );
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.overlay).toEqual({});
  });
});
