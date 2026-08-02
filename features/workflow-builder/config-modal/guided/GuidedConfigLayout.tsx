"use client";

import * as React from "react";
import type { FieldMeta } from "@/contracts/actionMeta";
import { Button } from "@/components/ui/button";
import { SchemaForm } from "../SchemaForm";
import { GuidedStepSection } from "./GuidedStepSection";
import { GuidedDestinationStep } from "./GuidedDestinationStep";
import { GuidedWriteStep } from "./GuidedWriteStep";
import {
  buildGuidedSteps,
  firstIncompleteStep,
  planDerivedRange,
  type GuidedStepId,
} from "./guidedStepModel";
import {
  guidedCopy,
  type GuidedSpreadsheetAdapter,
} from "./guidedSpreadsheetAdapters";

/**
 * The guided spreadsheet configuration shell
 * (SHEETS-GUIDED-CONFIG-1).
 *
 * Three questions in the order a person would ask them: which sheet,
 * what goes in each column, how is it written. Structurally this is a
 * REARRANGEMENT of the Setup tab — the same `fields`, the same
 * `values`/`errors`/`onChange` draft, the same field renderers reached
 * through `SchemaForm only=`. Nothing here owns configuration state, so
 * a guided-authored node is indistinguishable from a generically
 * authored one and the generic form can always render it.
 *
 * Open/closed is component-local `useState` — it is transient UI, not
 * business state, so it does not belong in a slice.
 */

export interface GuidedConfigLayoutProps {
  readonly adapter: GuidedSpreadsheetAdapter;
  readonly fields: readonly FieldMeta[];
  readonly values: Readonly<Record<string, unknown>>;
  readonly errors: Readonly<Record<string, string | undefined>>;
  readonly onChange: (name: string, value: unknown) => void;
  readonly disabled?: boolean;
  readonly highlightFieldName?: string;
  /** Number of destination columns detected, when known (wording only). */
  readonly columnCount?: number;
}

const STEP_TITLES: Record<GuidedStepId, (copy: ReturnType<typeof guidedCopy>) => string> =
  {
    destination: (c) => c.destinationTitle,
    mapping: (c) => c.mappingTitle,
    write: (c) => c.writeTitle,
  };

export function GuidedConfigLayout({
  adapter,
  fields,
  values,
  errors,
  onChange,
  disabled,
  highlightFieldName,
  columnCount,
}: GuidedConfigLayoutProps) {
  const copy = guidedCopy(adapter);
  const steps = buildGuidedSteps({
    adapter,
    fields,
    values,
    ...(columnCount !== undefined && { columnCount }),
  });

  // Open the first unfinished step on mount. Deliberately NOT an effect
  // that re-runs on completion: yanking a step closed the moment a user
  // fills its last field would fight them mid-edit.
  const [openStep, setOpenStep] = React.useState<GuidedStepId>(() =>
    firstIncompleteStep(steps),
  );
  const [customRangeNotice, setCustomRangeNotice] = React.useState<string | null>(
    null,
  );

  const headerRefs = React.useRef<Partial<Record<GuidedStepId, HTMLButtonElement | null>>>(
    {},
  );
  const setHeaderRef = (id: GuidedStepId) => (el: HTMLButtonElement | null) => {
    headerRefs.current[id] = el;
  };

  function toggle(id: GuidedStepId): void {
    setOpenStep((current) => (current === id ? ("" as GuidedStepId) : id));
  }

  /** Advance and move focus to the next step's header. */
  function goTo(id: GuidedStepId): void {
    setOpenStep(id);
    // Focus after paint so the target header exists and is expanded.
    window.requestAnimationFrame(() => headerRefs.current[id]?.focus());
  }

  /**
   * Destination changes route through here so the derived range can be
   * kept in step with the chosen tab. Everything else passes straight
   * through to the draft.
   */
  function handleDestinationChange(name: string, value: unknown): void {
    onChange(name, value);

    const spec = adapter.derivedRange;
    if (!spec || name !== spec.fromField) return;

    const nextTab = typeof value === "string" ? value : "";
    if (nextTab.trim().length === 0) {
      setCustomRangeNotice(null);
      return;
    }
    const outcome = planDerivedRange({
      adapter,
      values,
      nextTab,
      ...(columnCount !== undefined && { columnCount }),
    });
    if (outcome.kind === "derive") {
      setCustomRangeNotice(null);
      onChange(outcome.field, outcome.value);
    } else if (outcome.kind === "keep-custom") {
      // A hand-written range survives a tab change; the user is told so
      // rather than discovering later that their range was replaced.
      setCustomRangeNotice(outcome.current);
    }
  }

  /** "Use the whole tab instead" — an explicit, user-initiated overwrite. */
  function useDerivedRange(): void {
    const spec = adapter.derivedRange;
    if (!spec) return;
    const tab = values[spec.fromField];
    if (typeof tab !== "string" || tab.trim().length === 0) return;
    const outcome = planDerivedRange({
      adapter,
      // Force derivation: the user asked for it explicitly.
      values: { ...values, [spec.intoField]: "" },
      nextTab: tab,
      ...(columnCount !== undefined && { columnCount }),
    });
    if (outcome.kind === "derive") {
      onChange(outcome.field, outcome.value);
      setCustomRangeNotice(null);
    }
  }

  const byId = new Map(steps.map((s) => [s.id, s]));
  const destination = byId.get("destination")!;
  const mapping = byId.get("mapping")!;
  const write = byId.get("write")!;

  return (
    <div
      className="flex min-w-0 flex-col gap-2"
      data-testid="guided-config-layout"
      /*
        SPREADSHEET-GUIDED-CONFIG-S3 — panning policy
        (docs/rules/responsive-layout-and-validation.md §C). Node
        configuration is a FORM, and a form is on the rule's
        panning-is-disallowed list: no user should have to drag a settings
        panel sideways to reach the field they are filling in. The floor is
        1600 rather than a viewport breakpoint because this panel lives
        inside the canvas, not inside the page container — viewport width is
        not its content width. Declared here rather than left implicit
        because the drawer that hosts it scrolls, and an unannotated region
        inside a scroller is exempt from the containment check: without this
        line a panel could look green while being unusable.
      */
      data-no-pan-below="1600"
    >
      <GuidedStepSection
        ref={setHeaderRef("destination")}
        stepId="destination"
        index={1}
        title={STEP_TITLES.destination(copy)}
        summary={destination.summary}
        fallbackSummary="Not chosen yet"
        complete={destination.complete}
        open={openStep === "destination"}
        onToggle={() => toggle("destination")}
        footer={
          <div>
            <Button
              type="button"
              size="sm"
              onClick={() => goTo("mapping")}
              disabled={disabled}
              data-testid="guided-next-mapping"
            >
              Next: match the columns
            </Button>
          </div>
        }
      >
        <GuidedDestinationStep
          adapter={adapter}
          fields={fields}
          values={values}
          errors={errors}
          onChange={handleDestinationChange}
          customRangeNotice={customRangeNotice}
          onUseDerivedRange={useDerivedRange}
          hint={copy.destinationHint}
          {...(disabled !== undefined && { disabled })}
          {...(highlightFieldName ? { highlightFieldName } : {})}
        />
      </GuidedStepSection>

      <GuidedStepSection
        ref={setHeaderRef("mapping")}
        stepId="mapping"
        index={2}
        title={STEP_TITLES.mapping(copy)}
        summary={mapping.summary}
        fallbackSummary="Nothing filled in yet"
        complete={mapping.complete}
        open={openStep === "mapping"}
        onToggle={() => toggle("mapping")}
        footer={
          <div>
            <Button
              type="button"
              size="sm"
              onClick={() => goTo("write")}
              disabled={disabled}
              data-testid="guided-next-write"
            >
              Next: check the details
            </Button>
          </div>
        }
      >
        <SchemaForm
          fields={fields}
          values={values}
          errors={errors}
          onChange={onChange}
          only={adapter.mappingField}
          {...(disabled !== undefined && { disabled })}
          {...(highlightFieldName ? { highlightFieldName } : {})}
        />
        <p className="text-xs text-muted-foreground" data-testid="guided-blank-columns-hint">
          {copy.mappingHint}
        </p>
      </GuidedStepSection>

      <GuidedStepSection
        ref={setHeaderRef("write")}
        stepId="write"
        index={3}
        title={STEP_TITLES.write(copy)}
        summary={write.summary}
        fallbackSummary="Not confirmed yet"
        complete={write.complete}
        open={openStep === "write"}
        onToggle={() => toggle("write")}
      >
        <GuidedWriteStep
          adapter={adapter}
          fields={fields}
          values={values}
          onChange={onChange}
          emptyCopy={copy.writeEmpty}
          {...(disabled !== undefined && { disabled })}
        />
      </GuidedStepSection>
    </div>
  );
}
