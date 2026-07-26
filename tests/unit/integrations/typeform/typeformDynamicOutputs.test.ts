/**
 * @jest-environment node
 *
 * Stable Typeform answer paths + the form-questions resolver
 * (REACT-AGENT-TYPEFORM-DYNAMIC-OUTPUTS-1).
 *
 * The contract under test: a mapping chosen at DESIGN time (from the resolver) must resolve to the
 * same question at RUNTIME (from the webhook normalizer), on every submission, no matter which
 * questions the respondent skipped. Positional `answers[0]` cannot do that — it is a different
 * question each time — which is why no stable mapping existed before this slice.
 *
 * Only the Typeform NETWORK boundary is mocked. Key derivation, normalization, the resolver body and
 * the real trigger metadata all run for real.
 */

import { normalizeNewResponseInForm } from "@/integrations/typeform/triggers/newResponseInForm/normalize";
import { typeformNewResponseInFormTriggerMeta } from "@/integrations/typeform/triggers/newResponseInForm/newResponseInForm.meta";
import {
  buildAnswersByRef,
  toAnswerKey,
  toAnswerKeyInfo,
} from "@/integrations/_shared/typeform/answerKeys";
import {
  describeQuestion,
  normalizeQuestionType,
  typeformFormQuestionsResolver,
} from "@/integrations/typeform/options/formQuestions";
import { OptionsResolverError } from "@/services/options/types";

// ───────────────────────── Stable key derivation ─────────────────────────

describe("stable answer keys (#2, #49)", () => {
  it("uses the author's ref verbatim when it is already path-safe", () => {
    expect(toAnswerKey({ ref: "email" })).toBe("email");
    expect(toAnswerKey({ ref: "first_name" })).toBe("first_name");
  });

  it("encodes a ref that the runtime path tokenizer could not address", () => {
    // A dot would split the path; a space/dash would break the segment. Encoded + hashed.
    const key = toAnswerKey({ ref: "work.email address" })!;
    expect(key).toMatch(/^[A-Za-z0-9_]+$/);
    expect(key).toContain("__");
  });

  it("keeps distinct refs distinct even when they sanitize identically", () => {
    const a = toAnswerKey({ ref: "work.email" });
    const b = toAnswerKey({ ref: "work-email" });
    expect(a).not.toBe(b);
  });

  it("is a pure function of ONE field — never of the surrounding set", () => {
    // This is what makes design time (all questions) and runtime (answered only) agree.
    const field = { ref: "company", id: "abc" };
    expect(toAnswerKey(field)).toBe(toAnswerKey(field));
    expect(toAnswerKey(field)).toBe("company");
  });

  it("falls back to the field id when the form uses no refs", () => {
    expect(toAnswerKey({ id: "Xy12" })).toBe("Xy12");
    expect(toAnswerKeyInfo({ id: "Xy12" })).toEqual({ key: "Xy12", providerFieldRef: "Xy12" });
  });

  it("returns null when a field has no durable identity (never a positional fallback)", () => {
    expect(toAnswerKey({})).toBeNull();
    expect(toAnswerKeyInfo({})).toBeNull();
  });

  it("is deterministic across calls (no clock, no RNG — the normalizer's purity rule)", () => {
    const once = toAnswerKey({ ref: "my question!" });
    const twice = toAnswerKey({ ref: "my question!" });
    expect(once).toBe(twice);
  });
});

// ───────────────────────── Runtime normalization ─────────────────────────

function answer(ref: string, type: string, value: unknown) {
  return { type, field: { id: `id-${ref}`, ref, type }, [type]: value };
}

function webhook(answers: unknown[]) {
  return {
    event_id: "ev1",
    event_type: "form_response",
    form_response: {
      form_id: "form-1",
      token: "tok-1",
      submitted_at: "2026-07-26T10:00:00Z",
      definition: { id: "form-1", title: "Contact form", fields: [] },
      answers,
    },
  } as never;
}

describe("runtime answersByRef (#9-#15)", () => {
  it("(#9) is keyed by the stable field reference", () => {
    const ev = normalizeNewResponseInForm(
      webhook([answer("email", "email", "a@real.co"), answer("company", "text", "Real Ltd")]),
      { formId: "form-1" },
    );
    const payload = ev.payload as Record<string, unknown>;
    expect(payload.answersByRef).toEqual({ email: "a@real.co", company: "Real Ltd" });
  });

  it("(#10,#11) a skipped question does NOT shift the others — the whole point", () => {
    const full = normalizeNewResponseInForm(
      webhook([
        answer("first_name", "text", "Ada"),
        answer("email", "email", "ada@real.co"),
        answer("company", "text", "Real Ltd"),
      ]),
      { formId: "form-1" },
    );
    const partial = normalizeNewResponseInForm(
      // `first_name` skipped: positionally, email moves from index 1 to index 0.
      webhook([answer("email", "email", "ada@real.co"), answer("company", "text", "Real Ltd")]),
      { formId: "form-1" },
    );
    const fullMap = (full.payload as Record<string, unknown>).answersByRef as Record<string, unknown>;
    const partialMap = (partial.payload as Record<string, unknown>).answersByRef as Record<string, unknown>;

    // The stable path keeps meaning across BOTH submissions…
    expect(fullMap.email).toBe("ada@real.co");
    expect(partialMap.email).toBe("ada@real.co");
    // …while the positional view genuinely does shift, which is why it must not be the contract.
    const fullAnswers = (full.payload as { answers: { fieldRef: string }[] }).answers;
    const partialAnswers = (partial.payload as { answers: { fieldRef: string }[] }).answers;
    expect(fullAnswers[0]!.fieldRef).toBe("first_name");
    expect(partialAnswers[0]!.fieldRef).toBe("email");
  });

  it("(#11) unanswered questions are ABSENT, not empty strings", () => {
    const ev = normalizeNewResponseInForm(webhook([answer("email", "email", "a@real.co")]), {
      formId: "form-1",
    });
    const map = (ev.payload as Record<string, unknown>).answersByRef as Record<string, unknown>;
    expect(Object.prototype.hasOwnProperty.call(map, "company")).toBe(false);
  });

  it("(#13) preserves primitive types across supported answer variants", () => {
    const ev = normalizeNewResponseInForm(
      webhook([
        answer("score", "number", 9),
        answer("agreed", "boolean", true),
        answer("when", "date", "2026-07-26"),
        { type: "choice", field: { id: "i", ref: "plan" }, choice: { label: "Pro" } },
        { type: "choices", field: { id: "i2", ref: "tags" }, choices: { labels: ["a", "b"] } },
      ]),
      { formId: "form-1" },
    );
    const map = (ev.payload as Record<string, unknown>).answersByRef as Record<string, unknown>;
    expect(map.score).toBe(9);
    expect(map.agreed).toBe(true);
    expect(map.when).toBe("2026-07-26");
    expect(map.plan).toBe("Pro");
    expect(typeof map.tags).toBe("string");
  });

  it("(#14) a field with no durable identity is skipped rather than given a positional key", () => {
    const map = buildAnswersByRef([{ type: "text", text: "orphan" }]);
    expect(map).toEqual({});
  });

  it("(#15) the raw webhook payload is never exposed — only the bounded projection", () => {
    const ev = normalizeNewResponseInForm(
      {
        event_id: "ev1",
        event_type: "form_response",
        form_response: {
          form_id: "form-1",
          token: "tok-1",
          answers: [answer("email", "email", "a@real.co")],
          // Fields the projection must not carry through.
          response_url: "https://admin.typeform.com/secret",
          calculated: { score: 3 },
        },
      } as never,
      { formId: "form-1" },
    );
    const serialized = JSON.stringify(ev.payload);
    expect(serialized).not.toContain("admin.typeform.com");
    expect(serialized).not.toContain("response_url");
  });

  it("keeps the legacy positional answers[] intact (backward compatibility)", () => {
    const ev = normalizeNewResponseInForm(webhook([answer("email", "email", "a@real.co")]), {
      formId: "form-1",
    });
    const payload = ev.payload as { answers: unknown[] };
    expect(Array.isArray(payload.answers)).toBe(true);
    expect(payload.answers).toHaveLength(1);
  });

  it("(#16) the trigger metadata declares answersByRef alongside the static outputs", () => {
    const names = (typeformNewResponseInFormTriggerMeta.payloadShape ?? []).map((o) => o.name);
    expect(names).toContain("answersByRef");
    expect(names).toContain("answers"); // legacy contract retained
    const declared = (typeformNewResponseInFormTriggerMeta.payloadShape ?? []).find(
      (o) => o.name === "answersByRef",
    )!;
    expect(declared.sensitive).toBe(true); // respondent content
  });
});

// ───────────────────────── Resolver ─────────────────────────

function ctx(over: Record<string, unknown> = {}) {
  return {
    q: "",
    integration: { accountId: "acc1", providerAccountId: "pa1" },
    deps: { formId: "form-1" },
    ...over,
  } as never;
}

describe("typeform:form_questions resolver (#1-#8)", () => {
  it("(#4) rejects a missing form selection with a typed, actionable dependency error", async () => {
    await expect(typeformFormQuestionsResolver.resolve(ctx({ deps: {} }))).rejects.toMatchObject({
      code: "MISSING_DEPENDENCY",
    });
    await expect(typeformFormQuestionsResolver.resolve(ctx({ deps: {} }))).rejects.toBeInstanceOf(
      OptionsResolverError,
    );
  });

  it("(#5) rejects a disconnected integration before any provider call", async () => {
    await expect(
      typeformFormQuestionsResolver.resolve(ctx({ integration: undefined })),
    ).rejects.toMatchObject({ code: "INTEGRATION_DISCONNECTED" });
  });

  it("(#3) normalizes question types without inventing precision", () => {
    expect(normalizeQuestionType("email")).toBe("string");
    expect(normalizeQuestionType("number")).toBe("number");
    expect(normalizeQuestionType("yes_no")).toBe("boolean");
    expect(normalizeQuestionType("opinion_scale")).toBe("number");
    // Unknown/new Typeform question types degrade to string rather than guessing.
    expect(normalizeQuestionType("brand_new_type")).toBe("string");
    expect(normalizeQuestionType(undefined)).toBe("string");
  });

  it("(#2,#7) describes a question with a stable key + label, and no raw provider payload", () => {
    const q = describeQuestion({
      id: "abc",
      ref: "work_email",
      title: "Work email",
      type: "email",
      properties: { choices: [{ id: "c1", label: "Yes" }] },
    })!;
    expect(q).toEqual({
      key: "work_email",
      label: "Work email",
      type: "string",
      providerFieldRef: "work_email",
      choices: ["Yes"],
    });
    // Provider-internal ids never cross the boundary.
    expect(JSON.stringify(q)).not.toContain("abc");
    expect(JSON.stringify(q)).not.toContain("c1");
  });

  it("(#2) a titleless question falls back to its durable ref, never to a position", () => {
    const q = describeQuestion({ id: "abc", ref: "q_7", title: "  ", type: "short_text" })!;
    expect(q.label).toBe("q_7");
  });

  it("(#49) a question without ref or id is not offered as mappable at all", () => {
    expect(describeQuestion({ title: "Orphan", type: "short_text" })).toBeNull();
  });

  it("the resolver's key matches the runtime key for the same question (one contract)", () => {
    const field = { id: "abc", ref: "work.email", title: "Work email", type: "email" };
    const designTime = describeQuestion(field)!.key;
    const runtime = Object.keys(
      buildAnswersByRef([{ type: "email", field: { id: "abc", ref: "work.email" }, email: "x@y.co" }]),
    )[0];
    expect(designTime).toBe(runtime);
  });
});
