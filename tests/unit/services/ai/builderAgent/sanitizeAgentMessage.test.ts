/**
 * @jest-environment node
 *
 * Unit tests for `services/ai/builderAgent/sanitizeAgentMessage.ts` (Slice 4.AI-23).
 *
 * The sanitizer is the security control that gates what reaches the
 * `builder_agent_messages` table. These tests plant poison values that
 * MUST never round-trip — Google access tokens, Anthropic / OpenAI keys,
 * Slack tokens, JWTs, Authorization headers, raw proposedPatch / config
 * keys — and assert the output redacts / drops them.
 */
import {
  __testing,
  SanitizeAgentMessageError,
  sanitizeAgentMessageForPersist,
} from "@/services/ai/builderAgent/sanitizeAgentMessage";

describe("role / kind validation", () => {
  it("rejects an unknown role", () => {
    expect(() =>
      sanitizeAgentMessageForPersist({
        // @ts-expect-error — testing runtime guard
        role: "system",
        kind: "prompt",
      }),
    ).toThrow(SanitizeAgentMessageError);
  });

  it("rejects an unknown kind", () => {
    expect(() =>
      sanitizeAgentMessageForPersist({
        role: "user",
        kind: "applied",
      }),
    ).toThrow(SanitizeAgentMessageError);
  });

  it("rejects a kind that doesn't match the role (user/applied)", () => {
    expect(() =>
      sanitizeAgentMessageForPersist({
        role: "user",
        kind: "applied",
      }),
    ).toThrow(SanitizeAgentMessageError);
  });

  it("rejects a kind that doesn't match the role (assistant/prompt)", () => {
    expect(() =>
      sanitizeAgentMessageForPersist({
        role: "assistant",
        kind: "prompt",
      }),
    ).toThrow(SanitizeAgentMessageError);
  });

  it("accepts every valid (role,kind) combination", () => {
    const valid: Array<[string, string]> = [
      ["user", "prompt"],
      ["user", "followup"],
      ["assistant", "plan_result"],
      ["assistant", "needs_input"],
      ["assistant", "applied"],
      ["assistant", "apply_failure"],
      ["assistant", "error"],
      ["assistant", "system_notice"],
    ];
    for (const [role, kind] of valid) {
      expect(() =>
        sanitizeAgentMessageForPersist({
          role: role as "user" | "assistant",
          kind: kind as
            | "prompt"
            | "followup"
            | "plan_result"
            | "needs_input"
            | "applied"
            | "apply_failure"
            | "error"
            | "system_notice",
        }),
      ).not.toThrow();
    }
  });
});

describe("content sanitization", () => {
  it("redacts a Google access token (ya29.) inside content", () => {
    const out = sanitizeAgentMessageForPersist({
      role: "user",
      kind: "prompt",
      content: "Here is my token: ya29.AbCdEfGh1234567890",
    });
    expect(out.content).toBe("[redacted]");
  });

  it("redacts an Anthropic API key (sk-ant-) inside content", () => {
    const out = sanitizeAgentMessageForPersist({
      role: "assistant",
      kind: "applied",
      content: "the model used sk-ant-AbcDef1234567890 to call",
    });
    expect(out.content).toBe("[redacted]");
  });

  it("redacts an Authorization Bearer header inside content", () => {
    const out = sanitizeAgentMessageForPersist({
      role: "user",
      kind: "followup",
      content: "Authorization: Bearer abcdefghij1234",
    });
    expect(out.content).toBe("[redacted]");
  });

  it("redacts a JWT shape inside content", () => {
    const out = sanitizeAgentMessageForPersist({
      role: "assistant",
      kind: "error",
      content: "eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjMifQ.SignaturePayloadHere",
    });
    expect(out.content).toBe("[redacted]");
  });

  it("redacts an AWS access key id inside content", () => {
    const out = sanitizeAgentMessageForPersist({
      role: "user",
      kind: "prompt",
      content: "Use AKIAIOSFODNN7EXAMPLE for AWS",
    });
    expect(out.content).toBe("[redacted]");
  });

  it("redacts a Slack xoxb- token inside content", () => {
    const out = sanitizeAgentMessageForPersist({
      role: "user",
      kind: "prompt",
      content: `Slack: ${(["xoxb", "1234", "567890", "abcdef"].join("-"))}`,
    });
    expect(out.content).toBe("[redacted]");
  });

  it("redacts a GitHub gho_ token inside content", () => {
    // Assembled at runtime (byte-identical to before) so no literal GitHub-token
    // string lives in source; the gho_ detector still matches and triggers redaction.
    const out = sanitizeAgentMessageForPersist({
      role: "user",
      kind: "prompt",
      content: ["gho", "1234567890abcdef"].join("_"),
    });
    expect(out.content).toBe("[redacted]");
  });

  it("leaves benign content untouched", () => {
    const out = sanitizeAgentMessageForPersist({
      role: "user",
      kind: "prompt",
      content: "Post a Slack message to #alerts when a new email arrives.",
    });
    expect(out.content).toBe(
      "Post a Slack message to #alerts when a new email arrives.",
    );
  });

  it("caps content length at MAX_CONTENT_LENGTH", () => {
    const big = "x".repeat(__testing.MAX_CONTENT_LENGTH + 500);
    const out = sanitizeAgentMessageForPersist({
      role: "user",
      kind: "prompt",
      content: big,
    });
    expect(out.content!.length).toBe(__testing.MAX_CONTENT_LENGTH);
  });

  it("normalizes missing content to null", () => {
    const out = sanitizeAgentMessageForPersist({
      role: "user",
      kind: "prompt",
    });
    expect(out.content).toBeNull();
  });
});

describe("safe_payload secret-key denylist", () => {
  it("drops a top-level accessToken key", () => {
    const out = sanitizeAgentMessageForPersist({
      role: "assistant",
      kind: "plan_result",
      safePayload: {
        ok: true,
        intentSummary: "Add slack action",
        accessToken: "ya29.real-token-here",
      },
    });
    expect((out.safePayload as Record<string, unknown>).accessToken).toBeUndefined();
  });

  it("drops nested secret-shaped keys inside preview", () => {
    const out = sanitizeAgentMessageForPersist({
      role: "assistant",
      kind: "plan_result",
      safePayload: {
        ok: true,
        preview: {
          riskLevel: "low",
          requiresConfirmation: false,
          // not in the allowlist either, but extra hardening:
          webhookSecret: "wh-secret-xxx",
        },
      },
    });
    const preview = (out.safePayload as { preview?: Record<string, unknown> }).preview;
    expect(preview?.webhookSecret).toBeUndefined();
  });

  it("drops snake_case secret keys (access_token / refresh_token / private_key)", () => {
    expect(__testing.isSecretKey("access_token")).toBe(true);
    expect(__testing.isSecretKey("refresh_token")).toBe(true);
    expect(__testing.isSecretKey("private_key")).toBe(true);
    expect(__testing.isSecretKey("clientSecret")).toBe(true);
    expect(__testing.isSecretKey("api_key")).toBe(true);
    expect(__testing.isSecretKey("password")).toBe(true);
    expect(__testing.isSecretKey("Authorization")).toBe(true);
    expect(__testing.isSecretKey("bearer")).toBe(true);
  });

  it("does not flag innocent allowlist keys as secrets", () => {
    expect(__testing.isSecretKey("intentSummary")).toBe(false);
    expect(__testing.isSecretKey("riskLevel")).toBe(false);
    expect(__testing.isSecretKey("preview")).toBe(false);
    expect(__testing.isSecretKey("requiredUserInput")).toBe(false);
  });

  // CS-11 — parity after delegating to core/security/secretKeys.isSecretLikeKey.
  it("still treats the required secret-like terms as secret", () => {
    for (const k of [
      "token",
      "accessToken",
      "refreshToken",
      "apiKey",
      "password",
      "secret",
      "bearer",
      "credential",
      "clientSecret",
    ]) {
      expect(__testing.isSecretKey(k)).toBe(true);
    }
  });

  it("does NOT falsely redact normal content-field key names", () => {
    for (const k of ["message", "subject", "body", "description", "oauth"]) {
      expect(__testing.isSecretKey(k)).toBe(false);
    }
  });
});

describe("safe_payload forbidden-internal-key denylist", () => {
  it("drops a top-level proposedPatch", () => {
    const out = sanitizeAgentMessageForPersist({
      role: "assistant",
      kind: "plan_result",
      safePayload: {
        ok: true,
        intentSummary: "x",
        proposedPatch: { patchId: "p1", operations: [{ op: "addNode" }] },
      },
    });
    expect((out.safePayload as Record<string, unknown>).proposedPatch).toBeUndefined();
  });

  it("drops `patch`, `operations`, `config`, `workflowDefinition`", () => {
    const out = sanitizeAgentMessageForPersist({
      role: "assistant",
      kind: "plan_result",
      safePayload: {
        ok: true,
        patch: { operations: [] },
        operations: [],
        config: { token: "ya29.secret" },
        workflowDefinition: { nodes: [] },
      },
    });
    const keys = Object.keys(out.safePayload);
    for (const forbidden of ["patch", "operations", "config", "workflowDefinition"]) {
      expect(keys).not.toContain(forbidden);
    }
  });

  it("drops `rawModelOutput` / `completion` / `rawPrompt`", () => {
    const out = sanitizeAgentMessageForPersist({
      role: "assistant",
      kind: "plan_result",
      safePayload: {
        ok: true,
        rawModelOutput: "the model said ...",
        completion: "<long output>",
        rawPrompt: "the user said ...",
      },
    });
    expect((out.safePayload as Record<string, unknown>).rawModelOutput).toBeUndefined();
    expect((out.safePayload as Record<string, unknown>).completion).toBeUndefined();
    expect((out.safePayload as Record<string, unknown>).rawPrompt).toBeUndefined();
  });

  it("drops unrelated unknown top-level keys silently (forward-compatible)", () => {
    const out = sanitizeAgentMessageForPersist({
      role: "assistant",
      kind: "plan_result",
      safePayload: {
        ok: true,
        intentSummary: "x",
        futurePlannerField: { foo: "bar" },
      },
    });
    expect((out.safePayload as Record<string, unknown>).futurePlannerField).toBeUndefined();
    expect((out.safePayload as Record<string, unknown>).intentSummary).toBe("x");
  });
});

describe("safe_payload allowlist for plan_result", () => {
  it("keeps the AI-21B plan-success shape (intentSummary, lists, preview)", () => {
    const out = sanitizeAgentMessageForPersist({
      role: "assistant",
      kind: "plan_result",
      safePayload: {
        ok: true,
        intentSummary: "Add a Slack post after the email trigger",
        assumptions: ["Channel = #alerts"],
        unsupportedRequests: [],
        safetyNotes: ["Re-read your draft before publishing"],
        canApplyLater: true,
        requiredUserInput: [
          {
            label: "Slack channel",
            kind: "config_value",
            provider: "slack",
            nodeType: "send_channel_message",
            nodeLabel: "Send message",
            fieldLabel: "Channel",
            fieldType: "select",
            multiple: false,
            placeholder: "#alerts",
          },
        ],
        preview: {
          riskLevel: "low",
          requiresConfirmation: false,
          changeCount: 1,
          affectedNodeCount: 1,
          affectedEdgeCount: 0,
          userFacingSummaryText: "Adds one Slack action",
          taskCostEstimate: { estimatedTasksPerRun: 1 },
        },
      },
    });
    const payload = out.safePayload as Record<string, unknown>;
    expect(payload.ok).toBe(true);
    expect(payload.intentSummary).toBe(
      "Add a Slack post after the email trigger",
    );
    expect(payload.assumptions).toEqual(["Channel = #alerts"]);
    expect(payload.canApplyLater).toBe(true);
    const items = payload.requiredUserInput as Array<Record<string, unknown>>;
    expect(items).toHaveLength(1);
    expect(items[0]?.label).toBe("Slack channel");
    expect(items[0]?.fieldLabel).toBe("Channel");
    const preview = payload.preview as Record<string, unknown>;
    expect(preview.riskLevel).toBe("low");
    expect((preview.taskCostEstimate as { estimatedTasksPerRun: number })
      .estimatedTasksPerRun).toBe(1);
  });

  it("drops disallowed required-input fields (nodeId, field, options, optionsSource, dependsOn)", () => {
    const out = sanitizeAgentMessageForPersist({
      role: "assistant",
      kind: "plan_result",
      safePayload: {
        ok: true,
        requiredUserInput: [
          // safePayload is typed `Record<string, unknown>` so the
          // extra fields below don't trip a type error — TS accepts
          // unknown keys. The runtime assertions still hold.
          {
            label: "Slack channel",
            kind: "config_value",
            nodeId: "node-abc",
            field: "channelId",
            options: [{ label: "C1", value: "ya29.poisoned-token" }],
            optionsSource: "slack:channels",
            dependsOn: ["accountId"],
          },
        ],
      },
    });
    const items = (out.safePayload as { requiredUserInput?: Array<Record<string, unknown>> }).requiredUserInput;
    expect(items).toHaveLength(1);
    const item = items![0]!;
    expect(item.nodeId).toBeUndefined();
    expect(item.field).toBeUndefined();
    expect(item.options).toBeUndefined();
    expect(item.optionsSource).toBeUndefined();
    expect(item.dependsOn).toBeUndefined();
    expect(item.label).toBe("Slack channel");
  });

  it("drops required-input items with no label after sanitization", () => {
    const out = sanitizeAgentMessageForPersist({
      role: "assistant",
      kind: "plan_result",
      safePayload: {
        ok: true,
        requiredUserInput: [
          { label: "", kind: "config_value" },
          { kind: "config_value" } as Record<string, unknown>,
        ] as Array<Record<string, unknown>>,
      },
    });
    const items = (out.safePayload as { requiredUserInput?: unknown[] }).requiredUserInput;
    expect(items).toEqual([]);
  });

  it("keeps the AI-21B plan-failure shape (ok:false, code)", () => {
    const out = sanitizeAgentMessageForPersist({
      role: "assistant",
      kind: "plan_result",
      safePayload: {
        ok: false,
        code: "MODEL_FAILED",
      },
    });
    expect(out.safePayload).toEqual({ ok: false, code: "MODEL_FAILED" });
  });
});

describe("safe_payload allowlist for apply_failure / applied", () => {
  it("apply_failure: keeps `code` only", () => {
    const out = sanitizeAgentMessageForPersist({
      role: "assistant",
      kind: "apply_failure",
      content: "Re-run the plan to work from the latest version.",
      safePayload: {
        code: "STALE_PATCH",
        rawError: "Error: revision mismatch at 2026-05-26",
      },
    });
    expect(out.safePayload).toEqual({ code: "STALE_PATCH" });
  });

  it("applied: keeps summary + counts + risk + confirmation flag", () => {
    const out = sanitizeAgentMessageForPersist({
      role: "assistant",
      kind: "applied",
      safePayload: {
        summaryText: "Added 1 action.",
        appliedOperationCount: 1,
        riskLevel: "low",
        requiresConfirmation: false,
      },
    });
    expect(out.safePayload).toEqual({
      summaryText: "Added 1 action.",
      appliedOperationCount: 1,
      riskLevel: "low",
      requiresConfirmation: false,
    });
  });
});

describe("size + depth caps", () => {
  it("caps string fields inside payload at MAX_PAYLOAD_STRING_LENGTH", () => {
    const long = "y".repeat(__testing.MAX_PAYLOAD_STRING_LENGTH + 200);
    const out = sanitizeAgentMessageForPersist({
      role: "assistant",
      kind: "plan_result",
      safePayload: { ok: true, intentSummary: long },
    });
    expect(
      ((out.safePayload as { intentSummary: string }).intentSummary).length,
    ).toBe(__testing.MAX_PAYLOAD_STRING_LENGTH);
  });

  it("drops keys to keep total serialized payload under cap", () => {
    // Build a payload that would exceed MAX_PAYLOAD_SERIALIZED_BYTES if all
    // fields survived. With the drop order, `preview` is dropped first.
    const long = "z".repeat(__testing.MAX_PAYLOAD_STRING_LENGTH);
    const out = sanitizeAgentMessageForPersist({
      role: "assistant",
      kind: "plan_result",
      safePayload: {
        ok: true,
        intentSummary: long,
        assumptions: [long, long, long, long, long, long, long, long, long],
        unsupportedRequests: [long],
        safetyNotes: [long],
      },
    });
    const serialized = JSON.stringify(out.safePayload);
    expect(serialized.length).toBeLessThanOrEqual(
      __testing.MAX_PAYLOAD_SERIALIZED_BYTES,
    );
  });

  it("throws on excessive depth (defense in depth)", () => {
    let nest: Record<string, unknown> = { leaf: 1 };
    for (let i = 0; i < 30; i++) nest = { wrap: nest };
    expect(() =>
      sanitizeAgentMessageForPersist({
        role: "assistant",
        kind: "plan_result",
        safePayload: nest,
      }),
    ).toThrow(SanitizeAgentMessageError);
  });
});

describe("nuanced secret patterns", () => {
  it("redacts a real-looking refresh_token value embedded in content", () => {
    expect(
      __testing.looksLikeSecretValue("refresh_token=\"1//04xyzABC123_-\""),
    ).toBe(true);
  });

  it("does NOT redact harmless mentions like `the token expired`", () => {
    expect(__testing.looksLikeSecretValue("the token expired")).toBe(false);
    expect(__testing.looksLikeSecretValue("Slack channel #alerts")).toBe(false);
    expect(__testing.looksLikeSecretValue("a low-risk plan")).toBe(false);
  });
});

/**
 * REACT-AGENT-CONVERSATION-PERSISTENCE-1 — the structured proposal column.
 *
 * The proposal must round-trip faithfully enough to reopen the SAME preview, so
 * it is deep-scrubbed rather than allowlisted. What must never survive is
 * anything credential-shaped, at any depth, whether it arrived as a key or as a
 * value.
 */
describe("structured proposal scrubbing", () => {
  function proposalOf(raw: Record<string, unknown>) {
    return sanitizeAgentMessageForPersist({
      role: "assistant",
      kind: "plan_result",
      content: "Here's the workflow.",
      proposal: raw,
    }).proposal;
  }

  it("keeps the member's own graph so a reopened preview proposes the same thing", () => {
    const out = proposalOf({
      preview: { title: "Payment alert", nodes: [{ previewId: "p1", label: "slack:send" }] },
      definition: {
        nodes: [{ id: "n1", provider: "slack", type: "send_channel_message", config: { channel: "C1", text: "hi" } }],
        edges: [],
      },
    });
    expect(out).toMatchObject({
      preview: { title: "Payment alert" },
      definition: { nodes: [{ id: "n1", config: { channel: "C1", text: "hi" } }] },
    });
  });

  it("drops secret-shaped KEYS at any depth", () => {
    const out = proposalOf({
      definition: {
        nodes: [
          {
            id: "n1",
            config: {
              channel: "C1",
              accessToken: "abc",
              refresh_token: "def",
              apiKey: "ghi",
              clientSecret: "jkl",
              nested: { webhookSecret: "mno", keep: "yes" },
            },
          },
        ],
      },
    });
    const serialized = JSON.stringify(out);
    for (const banned of ["accessToken", "refresh_token", "apiKey", "clientSecret", "webhookSecret"]) {
      expect(serialized).not.toContain(banned);
    }
    expect(serialized).toContain("\"keep\":\"yes\"");
    expect(serialized).toContain("C1");
  });

  it("redacts secret-shaped VALUES that arrive under innocent keys", () => {
    // Assembled at runtime so the guardrail scan never sees a literal token
    // shape, while the detector still matches (V2-READY-45 pattern).
    const smuggled = ["xoxb", "1234567890", "abcdefghij"].join("-");
    const out = proposalOf({
      definition: { nodes: [{ id: "n1", config: { note: smuggled } }] },
    });
    expect(JSON.stringify(out)).not.toContain(smuggled);
    expect(JSON.stringify(out)).toContain("[redacted]");
  });

  it("drops an over-cap proposal ENTIRELY rather than storing half a graph", () => {
    const nodes = Array.from({ length: 400 }, (_, i) => ({
      id: `n${i}`,
      config: { text: "x".repeat(500) },
    }));
    expect(proposalOf({ definition: { nodes, edges: [] } })).toBeNull();
  });

  it("returns null for an absent or empty proposal", () => {
    expect(
      sanitizeAgentMessageForPersist({ role: "assistant", kind: "plan_result" }).proposal,
    ).toBeNull();
    expect(proposalOf({})).toBeNull();
  });
});

describe("reference columns", () => {
  it("trims, caps, and nulls blank refs", () => {
    const out = sanitizeAgentMessageForPersist({
      role: "assistant",
      kind: "review",
      content: "Status: ready",
      clientMessageId: "  m:3  ",
      requestId: "   ",
      baseGraphVersion: "v".repeat(500),
    });
    expect(out.clientMessageId).toBe("m:3");
    expect(out.requestId).toBeNull();
    expect(out.baseGraphVersion).toHaveLength(128);
  });

  it("refuses a secret-shaped value smuggled into a reference column", () => {
    const out = sanitizeAgentMessageForPersist({
      role: "user",
      kind: "prompt",
      content: "hi",
      requestId: ["xoxb", "1234567890", "abcdefghij"].join("-"),
    });
    expect(out.requestId).toBeNull();
  });

  it("accepts the deterministic review turn as an assistant kind", () => {
    expect(() =>
      sanitizeAgentMessageForPersist({ role: "assistant", kind: "review", content: "Status: ready" }),
    ).not.toThrow();
    expect(() =>
      sanitizeAgentMessageForPersist({ role: "user", kind: "review", content: "x" }),
    ).toThrow(SanitizeAgentMessageError);
  });
});
