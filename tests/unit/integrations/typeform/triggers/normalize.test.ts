/**
 * @jest-environment node
 *
 * Tests for the Typeform form_response normalizer — Slice 5.TYPEFORM-1.
 * Pure transformation; the dedup key is the stable response token
 * (timestamp-free) so provider redeliveries collapse.
 */
import { normalizeNewResponseInForm } from "@/integrations/typeform/triggers/newResponseInForm/normalize";

function webhookEvent(overrides: Record<string, unknown> = {}) {
  return {
    event_id: "ev-1",
    event_type: "form_response",
    form_response: {
      form_id: "form-1",
      token: "resp-token-1",
      submitted_at: "2026-07-04T10:00:00Z",
      landed_at: "2026-07-04T09:58:00Z",
      calculated: { score: 7 },
      hidden: { user_ref: "u-42" },
      definition: {
        id: "form-1",
        title: "Customer feedback",
        fields: [
          { id: "f-text", title: "What do you think?", ref: "r-text", type: "long_text" },
          { id: "f-email", title: "Your email", ref: "r-email", type: "email" },
          { id: "f-rating", title: "Rating", ref: "r-rating", type: "rating" },
          { id: "f-choices", title: "Cities", ref: "r-choices", type: "multiple_choice" },
        ],
      },
      answers: [
        {
          type: "text",
          text: "Great product",
          field: { id: "f-text", ref: "r-text", type: "long_text" },
        },
        {
          type: "email",
          email: "laura@example.test",
          field: { id: "f-email", ref: "r-email", type: "email" },
        },
        {
          type: "number",
          number: 4,
          field: { id: "f-rating", ref: "r-rating", type: "rating" },
        },
        {
          type: "choices",
          choices: { labels: ["London", "Sydney"] },
          field: { id: "f-choices", ref: "r-choices", type: "multiple_choice" },
        },
      ],
    },
    // NOTE: a `form_response` key here REPLACES the base object wholesale.
    ...overrides,
  } as never;
}

describe("normalizeNewResponseInForm — shape", () => {
  it("produces the canonical TriggerEvent with a bounded answers projection", () => {
    const event = normalizeNewResponseInForm(webhookEvent(), { formId: "form-1" });
    expect(event.provider).toBe("typeform");
    expect(event.eventType).toBe("new_response_in_form");
    expect(event.eventId).toBe("new_response_in_form:form-1:resp-token-1");
    expect(event.occurredAt).toBe("2026-07-04T10:00:00Z");
    expect(event.providerAccountId).toBe("form-1");
    expect(event.payload).toMatchObject({
      changeKind: "new_response_in_form",
      formId: "form-1",
      responseToken: "resp-token-1",
      providerEventId: "ev-1",
      formTitle: "Customer feedback",
      submittedAt: "2026-07-04T10:00:00Z",
      landedAt: "2026-07-04T09:58:00Z",
      hidden: { user_ref: "u-42" },
      score: 7,
    });
    expect(event.payload.answers).toEqual([
      {
        fieldId: "f-text",
        fieldRef: "r-text",
        fieldTitle: "What do you think?",
        fieldType: "long_text",
        answerType: "text",
        value: "Great product",
      },
      {
        fieldId: "f-email",
        fieldRef: "r-email",
        fieldTitle: "Your email",
        fieldType: "email",
        answerType: "email",
        value: "laura@example.test",
      },
      {
        fieldId: "f-rating",
        fieldRef: "r-rating",
        fieldTitle: "Rating",
        fieldType: "rating",
        answerType: "number",
        value: 4,
      },
      {
        fieldId: "f-choices",
        fieldRef: "r-choices",
        fieldTitle: "Cities",
        fieldType: "multiple_choice",
        answerType: "choices",
        value: "London, Sydney",
      },
    ]);
    // The admin response_url NEVER becomes a workflow variable.
    expect(JSON.stringify(event.payload)).not.toContain("response_url");
  });

  it("keeps answerType with a null value for unknown/complex answer types (no raw spread)", () => {
    const event = normalizeNewResponseInForm(
      webhookEvent({
        form_response: {
          form_id: "form-1",
          token: "t",
          answers: [
            {
              type: "payment",
              payment: { amount: "$10", last4: "1234", name: "L" },
              field: { id: "f-pay", type: "payment" },
            },
          ],
        },
      }),
      { formId: "form-1" },
    );
    expect(event.payload.answers).toEqual([
      {
        fieldId: "f-pay",
        fieldRef: null,
        fieldTitle: null,
        fieldType: "payment",
        answerType: "payment",
        value: null,
      },
    ]);
    // Raw payment structure never reaches the payload.
    expect(JSON.stringify(event.payload)).not.toContain("1234");
  });

  it("handles minimal deliveries (no answers/hidden/score/definition)", () => {
    const event = normalizeNewResponseInForm(
      { event_id: "ev-2", event_type: "form_response", form_response: { form_id: "f", token: "t" } },
      { formId: "f" },
    );
    expect(event.payload.answers).toEqual([]);
    expect(event.payload.hidden).toBeNull();
    expect(event.payload.score).toBeNull();
    expect(event.payload.formTitle).toBeNull();
  });

  it("falls back to the row's configured formId when the payload omits form_id", () => {
    const event = normalizeNewResponseInForm(
      { event_type: "form_response", form_response: { token: "t" } },
      { formId: "row-form" },
    );
    expect(event.payload.formId).toBe("row-form");
    expect(event.providerAccountId).toBe("row-form");
    expect(event.eventId).toBe("new_response_in_form:row-form:t");
  });
});

describe("normalizeNewResponseInForm — dedup key determinism", () => {
  it("same delivery → same eventId (redelivery collapses)", () => {
    const a = normalizeNewResponseInForm(webhookEvent(), { formId: "form-1" });
    const b = normalizeNewResponseInForm(webhookEvent(), { formId: "form-1" });
    expect(a.eventId).toBe(b.eventId);
  });

  it("token-less delivery falls back to the provider event_id", () => {
    const ev = webhookEvent({
      form_response: { form_id: "form-1", token: undefined },
    });
    const event = normalizeNewResponseInForm(ev, { formId: "form-1" });
    expect(event.eventId).toBe("new_response_in_form:form-1:no-token:ev-1");
  });

  it("token-less + event_id-less delivery falls back to submitted_at (payload data, not a clock)", () => {
    const event = normalizeNewResponseInForm(
      {
        event_type: "form_response",
        form_response: { form_id: "form-1", submitted_at: "2026-07-04T10:00:00Z" },
      },
      { formId: "form-1" },
    );
    expect(event.eventId).toBe(
      "new_response_in_form:form-1:no-token:2026-07-04T10:00:00Z",
    );
  });

  it("different response tokens → different eventIds", () => {
    const a = normalizeNewResponseInForm(
      webhookEvent({ form_response: { form_id: "f", token: "t-1" } }),
      { formId: "f" },
    );
    const b = normalizeNewResponseInForm(
      webhookEvent({ form_response: { form_id: "f", token: "t-2" } }),
      { formId: "f" },
    );
    expect(a.eventId).not.toBe(b.eventId);
  });
});
