/**
 * REACT-AGENT-RESOLVER-RECOVERY-1 — the React Agent's "Finish these details before applying" panel
 * must never trap the user in a field it cannot populate.
 *
 * The production failure this covers: a Typeform `Form` field rendered
 * "Couldn't load options. You can finish this in the step editor." with NO retry, NO manual entry and
 * NO actual path into the step editor, and a Mailchimp `Audience` field rendered a retry that was the
 * only thing on offer. The drafted workflow could not be completed or applied.
 *
 * These are behavior tests, not callback-invocation tests: each one asserts what the user can DO and
 * what survives — good path, failed path, dependency failure, provider failure, recovery, and state
 * integrity.
 */
const mockFetchOptionsSource = jest.fn();
jest.mock("@/lib/api/options", () => ({
  __esModule: true,
  fetchOptionsSource: (...args: unknown[]) => mockFetchOptionsSource(...args),
}));

import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { BuilderPreviewSetupCard } from "@/features/workflow-builder/panels/BuilderPreviewSetupCard";
import type { DraftPreview } from "@/contracts/workflowPlanPreview";
import type { PreviewSetupFieldsByType } from "@/core/workflows/previewSetupFields";

beforeEach(() => {
  mockFetchOptionsSource.mockReset();
});

/** The exact shape React drafted in the reported bug: Typeform trigger → Mailchimp action. */
const preview: DraftPreview = {
  version: 1,
  title: "Typeform to Mailchimp",
  summary: "New response adds a subscriber.",
  notice: "Preview only — your workflow has not changed.",
  notApplied: true,
  nodes: [
    {
      previewId: "preview-step-1",
      role: "trigger",
      provider: "typeform",
      type: "new_response_in_form",
      label: "New Response in Form",
      purpose: "watch",
      missingInputs: ["formId"],
      notApplied: true,
    },
    {
      previewId: "preview-step-2",
      role: "action",
      provider: "mailchimp",
      type: "add_subscriber",
      label: "Add Subscriber",
      purpose: "subscribe",
      missingInputs: ["audience_id", "email_address"],
      notApplied: true,
    },
  ],
  edges: [
    {
      previewId: "preview-edge-1",
      fromPreviewId: "preview-step-1",
      toPreviewId: "preview-step-2",
      notApplied: true,
    },
  ],
};

const setupFieldsByType: PreviewSetupFieldsByType = {
  "typeform:new_response_in_form": [
    { name: "formId", label: "Form", type: "select-async", required: true, optionsSource: "typeform:forms" },
  ],
  "mailchimp:add_subscriber": [
    { name: "audience_id", label: "Audience", type: "select-async", required: true, optionsSource: "mailchimp:audiences" },
    { name: "email_address", label: "Email address", type: "text", required: true },
  ],
};

const providerLabels = { typeform: "Typeform", mailchimp: "Mailchimp" };

const FORM_FIELD = "preview-setup-preview-step-1-formId";
const AUDIENCE_FIELD = "preview-setup-preview-step-2-audience_id";
const EMAIL_FIELD = "preview-setup-preview-step-2-email_address";

function ok(source: string, items: ReadonlyArray<{ value: string; label: string }>) {
  return { ok: true as const, source, items, hasMore: false };
}
function fail(source: string, code: string, message: string) {
  return { ok: false as const, source, code, message };
}

/** Routes each option source to its own scripted response, so the two providers fail independently. */
function routeBySource(map: Record<string, unknown | (() => unknown)>) {
  mockFetchOptionsSource.mockImplementation(async (source: string) => {
    const entry = map[source];
    const value = typeof entry === "function" ? (entry as () => unknown)() : entry;
    if (value === undefined) throw new Error(`unexpected source ${source}`);
    return value;
  });
}

/**
 * Host that owns previewConfig exactly like WorkflowBuilder does, so "does the other field's value
 * survive?" is a real question about state and not about a stub.
 */
function Host(props: { onOpenStepEditor?: (previewId: string, fieldName: string) => void }) {
  const [previewConfig, setPreviewConfig] = useState<Record<string, Record<string, unknown>>>({});
  return (
    <>
      <BuilderPreviewSetupCard
        preview={preview}
        setupFieldsByType={setupFieldsByType}
        previewConfig={previewConfig}
        providerLabels={providerLabels}
        onPreviewConfigChange={(previewId, fieldName, value) =>
          setPreviewConfig((prev) => ({ ...prev, [previewId]: { ...prev[previewId], [fieldName]: value } }))
        }
        onApply={() => {}}
        {...(props.onOpenStepEditor ? { onOpenStepEditor: props.onOpenStepEditor } : {})}
      />
      {/* The COMMITTED preview config — the exact value Apply seeds into the new draft node, and
          therefore the exact thing readiness is computed from. */}
      <pre data-testid="committed-config">{JSON.stringify(previewConfig)}</pre>
    </>
  );
}

/** The value actually committed for a preview field (undefined when nothing is committed). */
function committed(previewId: string, fieldName: string): unknown {
  const raw = JSON.parse(screen.getByTestId("committed-config").textContent || "{}") as Record<
    string,
    Record<string, unknown>
  >;
  return raw[previewId]?.[fieldName];
}

describe("resolver recovery — good path", () => {
  it("1. a successful load lets the user select an option", async () => {
    routeBySource({
      "typeform:forms": ok("typeform:forms", [{ value: "form_abc", label: "Customer Feedback" }]),
      "mailchimp:audiences": ok("mailchimp:audiences", [{ value: "aud_1", label: "Newsletter" }]),
    });
    render(<Host />);
    const select = (await screen.findByTestId(FORM_FIELD)) as HTMLSelectElement;
    await waitFor(() => expect(select.querySelectorAll("option").length).toBe(2));
    fireEvent.change(select, { target: { value: "form_abc" } });
    await waitFor(() => expect((screen.getByTestId(FORM_FIELD) as HTMLSelectElement).value).toBe("form_abc"));
    // No recovery block when nothing is wrong.
    expect(screen.queryByTestId(`${FORM_FIELD}-error`)).not.toBeInTheDocument();
  });
});

describe("resolver recovery — failure states are distinct and actionable", () => {
  it("2. a failed load renders a named failure with a working Try again (not a dead end)", async () => {
    routeBySource({
      "typeform:forms": fail("typeform:forms", "PROVIDER_ERROR", "Couldn't load Typeform forms. Try again."),
      "mailchimp:audiences": ok("mailchimp:audiences", []),
    });
    render(<Host />);
    const box = await screen.findByTestId(`${FORM_FIELD}-error`);
    expect(box).toHaveTextContent(/Typeform is temporarily unavailable/i);
    expect(screen.getByTestId(`${FORM_FIELD}-retry`)).toBeInTheDocument();
    // The copy that promised something that did not exist is gone.
    expect(box).not.toHaveTextContent(/You can finish this in the step editor/i);
    expect(box).not.toHaveTextContent(/^Couldn't load options\.$/);
  });

  it("2b. the two providers fail INDEPENDENTLY — one broken field never hides the other's state", async () => {
    routeBySource({
      "typeform:forms": fail("typeform:forms", "NOT_WORKFLOW_OWNER", "This step runs under the workflow owner's typeform connection."),
      "mailchimp:audiences": fail("mailchimp:audiences", "INTEGRATION_DISCONNECTED", "No active mailchimp integration."),
    });
    render(<Host />);
    const typeformBox = await screen.findByTestId(`${FORM_FIELD}-error`);
    const mailchimpBox = await screen.findByTestId(`${AUDIENCE_FIELD}-error`);
    expect(typeformBox).toHaveAttribute("data-recovery-kind", "owner-managed");
    expect(mailchimpBox).toHaveAttribute("data-recovery-kind", "connection-missing");
    // The owner-gated field offers no pointless retry, but is still finishable by hand.
    expect(screen.queryByTestId(`${FORM_FIELD}-retry`)).not.toBeInTheDocument();
    expect(screen.getByTestId(`${FORM_FIELD}-manual-toggle`)).toBeInTheDocument();
    expect(screen.getByTestId(`${AUDIENCE_FIELD}-retry`)).toBeInTheDocument();
  });

  it("8. a missing integration produces a reconnect CTA deep-linked to that provider", async () => {
    routeBySource({
      "typeform:forms": ok("typeform:forms", []),
      "mailchimp:audiences": fail("mailchimp:audiences", "INTEGRATION_DISCONNECTED", "No active mailchimp integration. Connect mailchimp first."),
    });
    render(<Host />);
    const link = await screen.findByTestId(`${AUDIENCE_FIELD}-reconnect`);
    expect(link).toHaveAttribute("href", "/apps?provider=mailchimp");
    expect(screen.getByTestId(`${AUDIENCE_FIELD}-error`)).toHaveTextContent(/Mailchimp isn't connected/i);
  });

  it("9. a missing provider permission renders the reconnect/permission state, not a bare retry", async () => {
    routeBySource({
      "typeform:forms": fail(
        "typeform:forms",
        "PROVIDER_REAUTH_REQUIRED",
        "Your Typeform connection is missing a required permission. Reconnect Typeform to grant it.",
      ),
      "mailchimp:audiences": ok("mailchimp:audiences", []),
    });
    render(<Host />);
    const box = await screen.findByTestId(`${FORM_FIELD}-error`);
    expect(box).toHaveAttribute("data-recovery-kind", "reconnect-required");
    expect(box).toHaveTextContent(/missing a required permission/i);
    expect(screen.getByTestId(`${FORM_FIELD}-reconnect`)).toHaveAttribute("href", "/apps?provider=typeform");
  });

  it("10. an empty provider result reads differently from a failed request", async () => {
    routeBySource({
      "typeform:forms": ok("typeform:forms", []),
      "mailchimp:audiences": fail("mailchimp:audiences", "PROVIDER_ERROR", "boom"),
    });
    render(<Host />);
    expect(await screen.findByTestId(`${FORM_FIELD}-error`)).toHaveAttribute("data-recovery-kind", "no-results");
    expect(await screen.findByTestId(`${AUDIENCE_FIELD}-error`)).toHaveAttribute(
      "data-recovery-kind",
      "provider-unavailable",
    );
  });

  it("13. a resolver error never surfaces the raw provider payload", async () => {
    routeBySource({
      "typeform:forms": fail(
        "typeform:forms",
        "PROVIDER_ERROR",
        'HTTP 401 {"access_token":"tf_live_LEAK","detail":"respondent@example.com"}',
      ),
      "mailchimp:audiences": ok("mailchimp:audiences", []),
    });
    render(<Host />);
    const text = (await screen.findByTestId(`${FORM_FIELD}-error`)).textContent ?? "";
    expect(text).not.toMatch(/tf_live_LEAK/);
    expect(text).not.toMatch(/access_token/);
    expect(text).not.toMatch(/respondent@example.com/);
  });
});

describe("resolver recovery — retry in place", () => {
  it("3. Try again issues a fresh request and replaces the error with real options", async () => {
    const user = userEvent.setup();
    let typeformAttempt = 0;
    routeBySource({
      "typeform:forms": () => {
        typeformAttempt += 1;
        return typeformAttempt === 1
          ? fail("typeform:forms", "PROVIDER_ERROR", "temporary")
          : ok("typeform:forms", [{ value: "form_abc", label: "Customer Feedback" }]);
      },
      "mailchimp:audiences": ok("mailchimp:audiences", []),
    });
    render(<Host />);
    await user.click(await screen.findByTestId(`${FORM_FIELD}-retry`));
    const select = (await screen.findByTestId(FORM_FIELD)) as HTMLSelectElement;
    await waitFor(() => expect(select.querySelectorAll("option").length).toBe(2));
    // Stale error state is gone once the retry succeeds.
    expect(screen.queryByTestId(`${FORM_FIELD}-error`)).not.toBeInTheDocument();
    expect(typeformAttempt).toBe(2);
  });

  it("4. a retry that fails again stays recoverable and keeps every other value already entered", async () => {
    const user = userEvent.setup();
    let typeformAttempt = 0;
    routeBySource({
      "typeform:forms": () => {
        typeformAttempt += 1;
        return fail("typeform:forms", "PROVIDER_ERROR", "still down");
      },
      "mailchimp:audiences": ok("mailchimp:audiences", [{ value: "aud_1", label: "Newsletter" }]),
    });
    render(<Host />);
    // The user fills what they can while the broken field is broken.
    fireEvent.change(await screen.findByTestId(EMAIL_FIELD), { target: { value: "lead@example.com" } });
    const audience = (await screen.findByTestId(AUDIENCE_FIELD)) as HTMLSelectElement;
    await waitFor(() => expect(audience.querySelectorAll("option").length).toBe(2));
    fireEvent.change(audience, { target: { value: "aud_1" } });

    await user.click(await screen.findByTestId(`${FORM_FIELD}-retry`));
    await waitFor(() => expect(typeformAttempt).toBe(2));

    // Still recoverable...
    expect(await screen.findByTestId(`${FORM_FIELD}-retry`)).toBeInTheDocument();
    expect(screen.getByTestId(`${FORM_FIELD}-manual-toggle`)).toBeInTheDocument();
    // ...and nothing the user already entered was lost.
    expect((screen.getByTestId(EMAIL_FIELD) as HTMLInputElement).value).toBe("lead@example.com");
    expect((screen.getByTestId(AUDIENCE_FIELD) as HTMLSelectElement).value).toBe("aud_1");
  });

  it("does not duplicate requests from render/effect loops", async () => {
    routeBySource({
      "typeform:forms": fail("typeform:forms", "PROVIDER_ERROR", "down"),
      "mailchimp:audiences": ok("mailchimp:audiences", []),
    });
    render(<Host />);
    await screen.findByTestId(`${FORM_FIELD}-error`);
    await new Promise((r) => setTimeout(r, 60));
    const typeformCalls = mockFetchOptionsSource.mock.calls.filter((c) => c[0] === "typeform:forms");
    expect(typeformCalls).toHaveLength(1);
  });
});

describe("resolver recovery — manual provider ID", () => {
  it("6. manual mode accepts a valid provider ID and persists it as the field's value", async () => {
    const user = userEvent.setup();
    routeBySource({
      "typeform:forms": fail("typeform:forms", "PROVIDER_ERROR", "down"),
      "mailchimp:audiences": ok("mailchimp:audiences", []),
    });
    render(<Host />);
    await user.click(await screen.findByTestId(`${FORM_FIELD}-manual-toggle`));
    const input = screen.getByTestId(`${FORM_FIELD}-manual`) as HTMLInputElement;
    fireEvent.change(input, { target: { value: "form_abc123" } });
    expect(screen.queryByTestId(`${FORM_FIELD}-manual-error`)).not.toBeInTheDocument();
    // Committed into the SAME previewConfig slot the picker writes to — so Apply seeds it into the
    // new draft node exactly as if it had been picked from the list.
    await waitFor(() => expect(committed("preview-step-1", "formId")).toBe("form_abc123"));
    expect((screen.getByTestId(`${FORM_FIELD}-manual`) as HTMLInputElement).value).toBe("form_abc123");
  });

  it("7. an invalid manual ID shows a useful validation error and does not silently keep a stale value", async () => {
    const user = userEvent.setup();
    routeBySource({
      "typeform:forms": fail("typeform:forms", "PROVIDER_ERROR", "down"),
      "mailchimp:audiences": ok("mailchimp:audiences", []),
    });
    render(<Host />);
    await user.click(await screen.findByTestId(`${FORM_FIELD}-manual-toggle`));
    const input = screen.getByTestId(`${FORM_FIELD}-manual`);
    fireEvent.change(input, { target: { value: "form_abc123" } });
    // Now the user replaces it with the form's DISPLAY NAME — which is not an id.
    fireEvent.change(input, { target: { value: "Customer Feedback Survey" } });
    const error = await screen.findByTestId(`${FORM_FIELD}-manual-error`);
    expect(error).toHaveTextContent(/looks like a name, not an ID/i);
    // The typed text is preserved for correction...
    expect((screen.getByTestId(`${FORM_FIELD}-manual`) as HTMLInputElement).value).toBe(
      "Customer Feedback Survey",
    );
    // ...but the invalid value is NOT committed, and the earlier valid one is not silently kept —
    // readiness must stay honest about this field still being unset.
    expect(committed("preview-step-1", "formId")).toBe("");
    // Correcting it commits again.
    fireEvent.change(input, { target: { value: "form_zzz999" } });
    await waitFor(() => expect(committed("preview-step-1", "formId")).toBe("form_zzz999"));
    expect(screen.queryByTestId(`${FORM_FIELD}-manual-error`)).not.toBeInTheDocument();
  });

  it("11/12. switching between manual and picker keeps the draft and the committed value", async () => {
    const user = userEvent.setup();
    routeBySource({
      "typeform:forms": fail("typeform:forms", "PROVIDER_ERROR", "down"),
      "mailchimp:audiences": ok("mailchimp:audiences", [{ value: "aud_1", label: "Newsletter" }]),
    });
    render(<Host />);
    fireEvent.change(await screen.findByTestId(EMAIL_FIELD), { target: { value: "lead@example.com" } });

    await user.click(await screen.findByTestId(`${FORM_FIELD}-manual-toggle`));
    fireEvent.change(screen.getByTestId(`${FORM_FIELD}-manual`), { target: { value: "form_abc123" } });

    // Back to the picker...
    await user.click(screen.getByTestId(`${FORM_FIELD}-picker-toggle`));
    expect(await screen.findByTestId(`${FORM_FIELD}-error`)).toBeInTheDocument();

    // ...and back to manual: the id the user typed is still there, and so is every other field.
    await user.click(screen.getByTestId(`${FORM_FIELD}-manual-toggle`));
    expect((screen.getByTestId(`${FORM_FIELD}-manual`) as HTMLInputElement).value).toBe("form_abc123");
    expect((screen.getByTestId(EMAIL_FIELD) as HTMLInputElement).value).toBe("lead@example.com");
    expect(committed("preview-step-1", "formId")).toBe("form_abc123");
    expect(committed("preview-step-2", "email_address")).toBe("lead@example.com");
    // The Agent's draft is untouched: Apply is still the only thing that touches it, and it is
    // still offered (this panel never removes the user's way forward).
    expect(screen.getByTestId("builder-preview-setup-apply")).toBeInTheDocument();
  });
});

describe("resolver recovery — step editor path", () => {
  it("5. the step-editor action reports the exact preview node and field", async () => {
    const user = userEvent.setup();
    const onOpenStepEditor = jest.fn();
    routeBySource({
      "typeform:forms": fail("typeform:forms", "PROVIDER_ERROR", "down"),
      "mailchimp:audiences": fail("mailchimp:audiences", "INTEGRATION_DISCONNECTED", "not connected"),
    });
    render(<Host onOpenStepEditor={onOpenStepEditor} />);
    await user.click(await screen.findByTestId(`${AUDIENCE_FIELD}-open-step-editor`));
    expect(onOpenStepEditor).toHaveBeenCalledWith("preview-step-2", "audience_id");
    expect(onOpenStepEditor).toHaveBeenCalledTimes(1);
  });

  it("5b. a field with no pre-apply control ('Choose after Apply') is reachable too", async () => {
    const user = userEvent.setup();
    const onOpenStepEditor = jest.fn();
    routeBySource({
      "typeform:forms": ok("typeform:forms", []),
      "mailchimp:audiences": ok("mailchimp:audiences", []),
    });
    // `tags` has no entry in setupFieldsByType, so the card can only defer it — but deferring is
    // not the same as stranding it.
    render(
      <BuilderPreviewSetupCard
        preview={{
          ...preview,
          nodes: preview.nodes.map((n) =>
            n.previewId === "preview-step-2" ? { ...n, missingInputs: ["tags"] } : n,
          ),
        }}
        setupFieldsByType={setupFieldsByType}
        previewConfig={{}}
        providerLabels={providerLabels}
        onPreviewConfigChange={() => {}}
        onApply={() => {}}
        onOpenStepEditor={onOpenStepEditor}
      />,
    );
    expect(screen.getByTestId("preview-setup-after-apply")).toHaveTextContent("Choose after Apply: tags");
    await user.click(screen.getByTestId("preview-setup-preview-step-2-after-apply-open"));
    expect(onOpenStepEditor).toHaveBeenCalledWith("preview-step-2", "tags");
  });

  it("never claims a step editor exists when no handler is wired", async () => {
    routeBySource({
      "typeform:forms": fail("typeform:forms", "PROVIDER_ERROR", "down"),
      "mailchimp:audiences": ok("mailchimp:audiences", []),
    });
    render(<Host />);
    const box = await screen.findByTestId(`${FORM_FIELD}-error`);
    expect(screen.queryByTestId(`${FORM_FIELD}-open-step-editor`)).not.toBeInTheDocument();
    expect(box).not.toHaveTextContent(/step editor/i);
  });
});
