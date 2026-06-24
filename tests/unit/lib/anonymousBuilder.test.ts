/**
 * ANON-BUILDER — anonymous draft + prompt handoff contract (ANON-BUILDER-1/-2).
 *
 * Covers: prompt set/read, full draft save/read round-trip, versioning,
 * sanitization (secrets dropped, unknown/unsafe values dropped), bounds, and the
 * restored-prompt one-shot handoff. Storage is localStorage (durable across the
 * auth round trip).
 */
import {
  ANON_DRAFT_VERSION,
  ANON_PROMPT_MAX_LENGTH,
  clearAnonDraft,
  clearRestoreTarget,
  consumeRestoredContext,
  isAnonGateReason,
  readAnonDraft,
  readAnonPrompt,
  readRestoreTarget,
  saveAnonDraft,
  setAnonPrompt,
  setRestoredContext,
  setRestoreTarget,
} from "@/lib/anonymousBuilder";

beforeEach(() => {
  window.localStorage.clear();
});

describe("anonymousBuilder — prompt", () => {
  it("stores and reads back a prompt", () => {
    setAnonPrompt("Email me my Shopify sales each morning");
    expect(readAnonPrompt()).toBe("Email me my Shopify sales each morning");
  });

  it("trims + bounds the prompt", () => {
    setAnonPrompt("   " + "x".repeat(ANON_PROMPT_MAX_LENGTH + 500) + "   ");
    expect(readAnonPrompt().length).toBe(ANON_PROMPT_MAX_LENGTH);
  });

  it("setting a prompt preserves an already-stored skeleton", () => {
    saveAnonDraft({
      prompt: "first",
      nodes: [{ id: "n1", kind: "trigger", provider: "slack", type: "t" }],
      edges: [],
    });
    setAnonPrompt("second");
    const draft = readAnonDraft();
    expect(draft?.prompt).toBe("second");
    expect(draft?.nodes).toHaveLength(1);
  });

  it("returns empty string when nothing stored", () => {
    expect(readAnonPrompt()).toBe("");
  });
});

describe("anonymousBuilder — draft skeleton", () => {
  it("round-trips a sanitized skeleton with a version stamp", () => {
    saveAnonDraft({
      prompt: "ping #wins on a 5-star review",
      nodes: [
        { id: "t1", kind: "trigger", provider: "slack", type: "slack.message", position: { x: 1, y: 2 } },
        { id: "a1", kind: "action", provider: "slack", type: "send", config: { channel: "#wins" } },
      ],
      edges: [{ id: "e1", from: "t1", to: "a1" }],
    });
    const draft = readAnonDraft();
    expect(draft?.version).toBe(ANON_DRAFT_VERSION);
    expect(draft?.nodes).toHaveLength(2);
    expect(draft?.edges).toHaveLength(1);
    expect(draft?.nodes[1]?.config).toEqual({ channel: "#wins" });
  });

  it("drops secret-ish config keys (never stored or restored)", () => {
    saveAnonDraft({
      prompt: "p",
      nodes: [
        {
          id: "a1",
          kind: "action",
          provider: "slack",
          type: "send",
          config: {
            channel: "#wins",
            access_token: "tok-should-be-dropped",
            apiKey: "key-should-be-dropped",
            password: "pw-should-be-dropped",
            credentialId: "cred-should-be-dropped",
            authorization: "auth-should-be-dropped",
          },
        },
      ],
      edges: [],
    });
    const cfg = readAnonDraft()?.nodes[0]?.config ?? {};
    expect(cfg).toEqual({ channel: "#wins" });
    const serialized = window.localStorage.getItem("chainreact:anon-builder-draft") ?? "";
    expect(serialized).not.toMatch(/should-be-dropped/);
  });

  it("drops unknown/unsafe fields and malformed nodes/edges", () => {
    saveAnonDraft({
      prompt: "p",
      nodes: [
        { id: "a1", kind: "action", provider: "slack", type: "send", evil: "x", config: { fn: () => 1, nested: { deep: { tooDeep: 1 } } } } as unknown,
        { id: "", kind: "action", provider: "slack", type: "send" }, // no id → dropped
        { id: "bad", kind: "weird", provider: "slack", type: "x" } as unknown, // bad kind → dropped
      ],
      edges: [{ id: "e1", from: "a1", to: "missing" }], // dangling → dropped
    });
    const draft = readAnonDraft();
    expect(draft?.nodes).toHaveLength(1);
    expect(draft?.nodes[0]).not.toHaveProperty("evil");
    expect(draft?.edges).toHaveLength(0);
  });

  it("ignores a payload with an unknown version", () => {
    window.localStorage.setItem(
      "chainreact:anon-builder-draft",
      JSON.stringify({ version: 999, prompt: "x", nodes: [], edges: [] }),
    );
    expect(readAnonDraft()).toBeNull();
  });

  it("clearAnonDraft removes the stored draft", () => {
    setAnonPrompt("keep me… or not");
    clearAnonDraft();
    expect(readAnonDraft()).toBeNull();
  });

  it("an empty draft (no prompt, no nodes) is treated as absent", () => {
    saveAnonDraft({ prompt: "   ", nodes: [], edges: [] });
    expect(readAnonDraft()).toBeNull();
  });
});

describe("anonymousBuilder — restore target (idempotency)", () => {
  it("set / read / clear the pending restore target", () => {
    expect(readRestoreTarget()).toBe("");
    setRestoreTarget("wf-created");
    expect(readRestoreTarget()).toBe("wf-created");
    clearRestoreTarget();
    expect(readRestoreTarget()).toBe("");
  });
});

describe("anonymousBuilder — restored context handoff", () => {
  it("set then consume returns { prompt, reason } once, then clears", () => {
    setRestoredContext("wf-123", { prompt: "build me a thing", reason: "save" });
    expect(consumeRestoredContext("wf-123")).toEqual({ prompt: "build me a thing", reason: "save" });
    expect(consumeRestoredContext("wf-123")).toBeNull();
  });

  it("is keyed per workflow id", () => {
    setRestoredContext("wf-a", { prompt: "A" });
    expect(consumeRestoredContext("wf-b")).toBeNull();
    expect(consumeRestoredContext("wf-a")).toEqual({ prompt: "A" });
  });

  it("stores a reason even with an empty prompt; ignores an invalid reason", () => {
    setRestoredContext("wf-r", { prompt: "", reason: "activate" });
    expect(consumeRestoredContext("wf-r")).toEqual({ prompt: "", reason: "activate" });
    // @ts-expect-error invalid reason is dropped at the boundary
    setRestoredContext("wf-bad", { prompt: "p", reason: "bogus" });
    expect(consumeRestoredContext("wf-bad")).toEqual({ prompt: "p" });
  });

  it("isAnonGateReason guards the union", () => {
    expect(isAnonGateReason("connect")).toBe(true);
    expect(isAnonGateReason("nope")).toBe(false);
  });
});
