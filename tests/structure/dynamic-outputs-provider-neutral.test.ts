/**
 * @jest-environment node
 *
 * The generic dynamic-output path must not know about Typeform
 * (TYPEFORM-AGENT-PREVIEW-ENRICHMENT-CLOSEOUT-1).
 *
 * Typeform is the first production consumer of dynamic trigger outputs, not a special case. The
 * whole architecture only pays off if the SECOND consumer — spreadsheet columns, CRM properties, a
 * custom webhook schema — needs zero platform changes. The cheapest way for that to quietly stop
 * being true is a `provider === "typeform"` branch appearing in a shared file during a hurried fix.
 * This scan makes that a failing build instead of a discovery six months later.
 *
 * Typeform-specific code is allowed — in Typeform-OWNED files: its resolver, its metadata, its
 * normalizer, its API wrapper. Those are the layers whose job is provider specifics.
 */

import { readFileSync } from "node:fs";
import { resolve } from "node:path";

/** Generic platform files that must remain provider-neutral. */
const GENERIC_PATHS = [
  // Contract + merge + mapping + enrichment + lifecycle.
  "contracts/triggerMeta.ts",
  "core/workflows/mapping/dynamicTriggerOutputs.ts",
  "core/workflows/mapping/semanticFieldMapping.ts",
  "core/workflows/mapping/enrichProposal.ts",
  "core/workflows/mapping/enrichmentLifecycle.ts",
  // Resolution service + builder wiring + preview wiring.
  "services/discovery/dynamicTriggerOutputs.ts",
  "features/workflow-builder/hooks/useDynamicTriggerOutputs.ts",
  "features/workflow-builder/hooks/useUpstreamVariables.ts",
  "features/workflow-builder/hooks/usePreviewEnrichment.ts",
  // REACT-AGENT-PREVIEW-PROVENANCE-CLOSEOUT-1 — provenance, readiness, apply overlay, and the
  // bridge + owner + card that connect them. These are where a "just special-case the first
  // provider" shortcut would be most tempting, because they are the layers the user actually sees.
  "core/workflows/mapping/previewProvenance.ts",
  "core/workflows/mapping/previewReadiness.ts",
  "core/workflows/mapping/previewConfigOverlay.ts",
  "features/workflow-builder/hooks/usePreviewEnrichmentBridge.ts",
  "features/workflow-builder/hooks/useBuilderPreview.ts",
  "features/workflow-builder/panels/BuilderPreviewSetupCard.tsx",
] as const;

/**
 * Provider tokens that must not appear as BEHAVIOR in a generic file. Matched case-insensitively
 * against code with comments stripped, so an explanatory comment naming the first consumer is fine
 * while a branch on it is not.
 */
const PROVIDER_TOKENS = [
  "typeform",
  "answersByRef",
  "answers_by_ref",
  "form_questions",
  "formId",
  "new_response_in_form",
  "toAnswerKey",
] as const;

/** Strip line + block comments so documentation may name Typeform without failing the scan. */
function stripComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");
}

describe("generic dynamic-output path is provider-neutral", () => {
  it.each(GENERIC_PATHS)("%s contains no provider-specific behavior", (relPath) => {
    const code = stripComments(readFileSync(resolve(process.cwd(), relPath), "utf8"));
    const offenders = PROVIDER_TOKENS.filter((token) =>
      new RegExp(token.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i").test(code),
    );
    expect({ file: relPath, offenders }).toEqual({ file: relPath, offenders: [] });
  });

  it("Typeform-specific behavior DOES live in Typeform-owned files (the scan is meaningful)", () => {
    // A control: if these stopped containing Typeform specifics, the scan above would be trivially
    // green for the wrong reason.
    const resolver = readFileSync(
      resolve(process.cwd(), "integrations/typeform/options/formQuestions.ts"),
      "utf8",
    );
    expect(resolver).toContain("typeform:form_questions");
    expect(resolver).toContain("toAnswerKey");

    const meta = readFileSync(
      resolve(
        process.cwd(),
        "integrations/typeform/triggers/newResponseInForm/newResponseInForm.meta.ts",
      ),
      "utf8",
    );
    expect(meta).toContain("dynamicOutputSource");
    expect(meta).toContain("answersByRef");
  });

  it("the contract's declaration is generic — a source id, a config field, an attach point", () => {
    const contract = stripComments(
      readFileSync(resolve(process.cwd(), "contracts/triggerMeta.ts"), "utf8"),
    );
    expect(contract).toContain("dynamicOutputSource");
    expect(contract).toContain("configField");
    expect(contract).toContain("attachUnder");
  });
});
