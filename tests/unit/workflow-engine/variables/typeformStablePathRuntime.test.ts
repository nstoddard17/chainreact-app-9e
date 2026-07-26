/**
 * @jest-environment node
 *
 * RUNTIME PROOF for stable Typeform paths (TYPEFORM-DYNAMIC-OUTPUTS-CONSUMPTION-1, Phase 6).
 *
 * The claim under test is the one that matters for the whole arc: a mapping chosen at DESIGN time
 * (from the form-questions resolver) resolves to the right value at RUN time, through the REAL
 * canonical resolver, against a REAL normalized Typeform webhook event — on every submission,
 * regardless of which questions the respondent skipped or in what order the provider sent them.
 *
 * Real: `normalizeNewResponseInForm`, `resolveStrict`/`resolveSoft`, `toAnswerKey`, the resolver's
 * `describeQuestion`, the dynamic-output merger, the semantic mapper, and the real trigger metadata.
 * Mocked: nothing internal. No provider network call happens here — the webhook payload IS the
 * external boundary, and it is supplied as a fixture exactly as Typeform would deliver it.
 */

import { normalizeNewResponseInForm } from "@/integrations/typeform/triggers/newResponseInForm/normalize";
import { typeformNewResponseInFormTriggerMeta as TYPEFORM } from "@/integrations/typeform/triggers/newResponseInForm/newResponseInForm.meta";
import { describeQuestion } from "@/integrations/typeform/options/formQuestions";
import { mergeDynamicTriggerOutputs } from "@/core/workflows/mapping/dynamicTriggerOutputs";
import {
  buildSummaryBody,
  mapFieldSemantically,
  toReference,
  type MappingCandidate,
} from "@/core/workflows/mapping/semanticFieldMapping";
import { MissingVariableError, resolveStrict } from "@/workflow-engine/variables/resolveValue";

/** The form definition as `GET /forms/{id}` would return it (external boundary fixture). */
const FORM_FIELDS = [
  { id: "f1", ref: "email", title: "Email address", type: "email" },
  { id: "f2", ref: "first_name", title: "First name", type: "short_text" },
  { id: "f3", ref: "last_name", title: "Last name", type: "short_text" },
  { id: "f4", ref: "company", title: "Company", type: "short_text" },
  { id: "f5", ref: "message", title: "Message", type: "long_text" },
  // An author-hostile ref that is NOT a safe dot-path segment — must still round-trip.
  { id: "f6", ref: "how did you hear.about us", title: "How did you hear about us?", type: "short_text" },
];

/** One submitted answer as the webhook delivers it. */
function answer(ref: string, id: string, type: string, value: unknown) {
  return { type, field: { id, ref, type }, [type]: value };
}

function webhookEvent(answers: unknown[]) {
  return {
    event_id: "ev-1",
    event_type: "form_response",
    form_response: {
      form_id: "form-1",
      token: "tok-1",
      submitted_at: "2026-07-26T10:00:00Z",
      definition: { id: "form-1", title: "Contact form", fields: FORM_FIELDS },
      answers,
    },
  } as never;
}

const FULL_SUBMISSION = [
  answer("email", "f1", "email", "lead@example.com"),
  answer("first_name", "f2", "text", "Jamie"),
  answer("last_name", "f3", "text", "Smith"),
  answer("company", "f4", "text", "Acme"),
  answer("message", "f5", "text", "Please contact me"),
  answer("how did you hear.about us", "f6", "text", "A friend"),
];

/** Design time: the resolver's descriptors → merged dynamic outputs → mapping candidates. */
function designTimeCandidates(): MappingCandidate[] {
  const descriptors = FORM_FIELDS.map((f) => describeQuestion(f)!).filter(Boolean);
  const { outputs, synthesized } = mergeDynamicTriggerOutputs(TYPEFORM, descriptors);
  expect(synthesized).toBe(true);
  const byRef = outputs.find((o) => o.name === "answersByRef")!;
  return (byRef.fields ?? []).map((child) => ({
    path: `answersByRef.${child.name}`,
    label: child.description ?? child.name,
    type: child.type,
  }));
}

/** Runtime: the normalized event, as the engine would place it under the `trigger` alias. */
function runtimeVariables(answers: unknown[]): Record<string, unknown> {
  const event = normalizeNewResponseInForm(webhookEvent(answers), { formId: "form-1" });
  return { trigger: event.payload as Record<string, unknown> };
}

describe("design-time mappings resolve at runtime (#48-#56)", () => {
  const candidates = designTimeCandidates();
  const variables = runtimeVariables(FULL_SUBMISSION);

  it("(#48) every design-time candidate resolves through the canonical engine resolver", () => {
    for (const candidate of candidates) {
      const reference = toReference("trigger", candidate);
      // resolveStrict throws MissingVariableError if the path does not exist — so a clean pass IS
      // the proof that design-time and runtime paths are identical.
      expect(() => resolveStrict(reference, { variables })).not.toThrow();
    }
  });

  it("(#49,#50) the mapped destinations receive the submitted values", () => {
    // Destination fields as their real provider metas name them.
    const mailchimpEmail = mapFieldSemantically({ name: "email", label: "Email", type: "text" }, candidates);
    const hubspotEmail = mapFieldSemantically({ name: "email", label: "Email", type: "text" }, candidates);
    const hubspotFirst = mapFieldSemantically({ name: "firstname", label: "First name", type: "text" }, candidates);
    const hubspotLast = mapFieldSemantically({ name: "lastname", label: "Last name", type: "text" }, candidates);
    const hubspotCompany = mapFieldSemantically({ name: "company", label: "Company", type: "text" }, candidates);

    for (const outcome of [mailchimpEmail, hubspotEmail, hubspotFirst, hubspotLast, hubspotCompany]) {
      expect(outcome.kind).toBe("mapped");
    }
    const resolve = (o: typeof mailchimpEmail) =>
      o.kind === "mapped" ? resolveStrict(toReference("trigger", o.candidate), { variables }) : null;

    // The SAME upstream output feeds two different downstream actions.
    expect(resolve(mailchimpEmail)).toBe("lead@example.com");
    expect(resolve(hubspotEmail)).toBe("lead@example.com");
    expect(resolve(hubspotFirst)).toBe("Jamie");
    expect(resolve(hubspotLast)).toBe("Smith");
    expect(resolve(hubspotCompany)).toBe("Acme");
  });

  it("(#51) the Gmail summary body resolves to the submitted values", () => {
    const body = buildSummaryBody("trigger", candidates, { heading: "New Typeform submission" })!;
    const resolved = resolveStrict(body, { variables }) as string;
    expect(resolved).toContain("New Typeform submission");
    expect(resolved).toContain("Jamie Smith");
    expect(resolved).toContain("lead@example.com");
    expect(resolved).toContain("Acme");
    expect(resolved).toContain("Please contact me");
    // No unresolved tokens survived.
    expect(resolved).not.toContain("{{");
  });

  it("(#52,#53) a skipped question does not shift any other mapping", () => {
    // first_name and company skipped: every positional index after them moves.
    const partial = runtimeVariables([
      answer("email", "f1", "email", "lead@example.com"),
      answer("last_name", "f3", "text", "Smith"),
      answer("message", "f5", "text", "Please contact me"),
    ]);
    expect(resolveStrict("{{trigger.answersByRef.email}}", { variables: partial })).toBe("lead@example.com");
    expect(resolveStrict("{{trigger.answersByRef.last_name}}", { variables: partial })).toBe("Smith");
    // Reordering the delivery changes nothing either.
    const reordered = runtimeVariables([...FULL_SUBMISSION].reverse());
    expect(resolveStrict("{{trigger.answersByRef.email}}", { variables: reordered })).toBe("lead@example.com");
    expect(resolveStrict("{{trigger.answersByRef.company}}", { variables: reordered })).toBe("Acme");
  });

  it("(#54) a question the respondent skipped produces the canonical missing-variable failure", () => {
    const partial = runtimeVariables([answer("email", "f1", "email", "lead@example.com")]);
    expect(() => resolveStrict("{{trigger.answersByRef.company}}", { variables: partial })).toThrow(
      MissingVariableError,
    );
    try {
      resolveStrict("{{trigger.answersByRef.company}}", { variables: partial });
    } catch (e) {
      // The engine's own typed failure — not a silent empty string.
      expect((e as MissingVariableError).path).toBe("trigger.answersByRef.company");
    }
  });

  it("(#55) no mapping uses a numeric answer position", () => {
    for (const candidate of candidates) {
      expect(candidate.path).not.toMatch(/answers\[/);
      expect(candidate.path.startsWith("answersByRef.")).toBe(true);
    }
    const body = buildSummaryBody("trigger", candidates) ?? "";
    expect(body).not.toMatch(/answers\[/);
  });

  it("(#56) an unsafe provider ref round-trips through toAnswerKey at both ends", () => {
    const descriptor = describeQuestion(FORM_FIELDS[5]!)!;
    // The key is path-safe even though the ref is not…
    expect(descriptor.key).toMatch(/^[A-Za-z0-9_]+$/);
    expect(descriptor.providerFieldRef).toBe("how did you hear.about us");
    // …and the same key resolves against the real runtime payload.
    expect(
      resolveStrict(`{{trigger.answersByRef.${descriptor.key}}}`, { variables }),
    ).toBe("A friend");
  });

  it("(#59) the legacy positional answers[] output still resolves exactly as before", () => {
    expect(resolveStrict("{{trigger.answers[0].value}}", { variables })).toBe("lead@example.com");
    expect(resolveStrict("{{trigger.answers[0].fieldRef}}", { variables })).toBe("email");
  });
});
