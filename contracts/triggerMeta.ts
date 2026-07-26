import { z } from "zod";
import {
  ActionCategorySchema,
  FieldMetaSchema,
  OutputMetaSchema,
  checkItemFieldOptionSourceReferences,
  checkVisibleWhenReferences,
  normalizeDependsOn,
  type FieldMeta,
  type OutputMeta,
} from "./actionMeta";

/**
 * Builder-facing metadata contract for triggers.
 *
 * Parallel to `ActionMeta` but with distinct semantics:
 *   - `fields[]` is the user-configurable shape (e.g. scheduled trigger's
 *     `cronExpression`, polling trigger's `pollIntervalSeconds`).
 *   - `payloadShape[]` is the shape the trigger EMITS into downstream
 *     nodes' variable pickers — what the trigger guarantees will be
 *     present on the run's input data (e.g. Gmail's `newEmail` emits
 *     `from`, `subject`, `body`, `attachments[]`).
 *
 * Unlike actions, V2 has no central enumerable trigger registry yet —
 * triggers self-register via side-effect imports. The discovery registry
 * therefore canonicalizes the trigger surface by importing every
 * `<trigger>.meta.ts` explicitly. Same hand-maintained pattern as the
 * action registry; lint-checked for orphans (Slice 3.0 native scope).
 *
 * `activation` describes how the trigger gets armed at activation time so
 * the builder UI can render the right affordance:
 *   - `webhook` — provider creates a subscription / webhook resource;
 *     handled by trigger-lifecycle. Builder shows a connection-check hint.
 *   - `polling` — server-side cron polls; builder may surface the
 *     interval as informational.
 *   - `manual` — fired only by `POST /api/workflows/[id]/run-now`. Builder
 *     surfaces the Run Now panel for this trigger.
 *   - `scheduled` — server-side cron fires on the configured cron
 *     expression. Builder surfaces cron preview + "next run at" hint.
 */

export const TriggerActivationSchema = z.enum([
  "webhook",
  "polling",
  "manual",
  "scheduled",
]);
export type TriggerActivation = z.infer<typeof TriggerActivationSchema>;

export const TriggerMetaSchema = z
  .object({
    /** Canonical `${provider}:${type}` lookup key. */
    key: z.string().regex(/^[a-z][a-z0-9_-]*:[a-z][a-z0-9_.]*$/),
    provider: z.string().min(1).max(64),
    type: z.string().min(1).max(64),
    displayName: z.string().min(1).max(128),
    description: z.string().min(1).max(2048),
    category: ActionCategorySchema,
    activation: TriggerActivationSchema,
    requiresIntegration: z.boolean(),
    fields: z.array(FieldMetaSchema).max(64),
    /** Output shape the trigger emits into downstream variable pickers. */
    payloadShape: z.array(OutputMetaSchema).max(128).default([]),
    /**
     * TYPEFORM-DYNAMIC-OUTPUTS-CONSUMPTION-1 — RESOLVER-BACKED dynamic outputs.
     *
     * Distinct from the action-side `dynamicOutputs`, which synthesizes children from a
     * `schema-fields` config value the USER typed. This one covers the other, far more common shape:
     * the schema lives in the PROVIDER and is discovered by picking a resource — a form's questions,
     * a sheet's columns, a database's properties, a CRM's custom fields. Provider-neutral by
     * construction: it names a config field, an options-resolver source, and the static output whose
     * children get synthesized, and knows nothing about any specific provider.
     *
     * The static registry stays IMMUTABLE and does no I/O: this is a DECLARATION only. Resolution
     * happens through the existing options-resolver boundary, and the merge itself is a pure function
     * (`core/workflows/mapping/dynamicTriggerOutputs.ts`) shared by the builder and the server-side agent —
     * one key generator, no UI/agent drift.
     */
    dynamicOutputSource: z
      .object({
        /** Config field whose selected value determines the schema (e.g. `formId`). */
        configField: z.string().min(1).max(64),
        /** Options-resolver source id returning the schema descriptors (e.g. `typeform:form_questions`). */
        source: z.string().min(1).max(128),
        /** Static output whose children are synthesized (e.g. `answersByRef`). */
        attachUnder: z.string().min(1).max(64),
      })
      .strict()
      .optional(),
    /** Optional sort hint within a provider's trigger list. Lower = earlier. */
    displayOrder: z.number().int().nullable().default(null),
  })
  .strict()
  .superRefine((meta, ctx) => {
    if (meta.key !== `${meta.provider}:${meta.type}`) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["key"],
        message: `Trigger key '${meta.key}' must equal '${meta.provider}:${meta.type}'.`,
      });
    }
    const dyn = meta.dynamicOutputSource;
    if (dyn) {
      if (!meta.fields.some((f) => f.name === dyn.configField)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["dynamicOutputSource", "configField"],
          message: `dynamicOutputSource references unknown config field '${dyn.configField}'.`,
        });
      }
      if (!meta.payloadShape.some((o) => o.name === dyn.attachUnder)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["dynamicOutputSource", "attachUnder"],
          message: `dynamicOutputSource attaches under unknown output '${dyn.attachUnder}'.`,
        });
      }
    }
    const fieldNames = new Set<string>();
    for (let i = 0; i < meta.fields.length; i++) {
      const name = meta.fields[i]!.name;
      if (fieldNames.has(name)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["fields", i, "name"],
          message: `Duplicate field name '${name}'.`,
        });
      }
      fieldNames.add(name);
    }
    for (let i = 0; i < meta.fields.length; i++) {
      for (const dep of normalizeDependsOn(meta.fields[i]!.dependsOn)) {
        if (!fieldNames.has(dep)) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ["fields", i, "dependsOn"],
            message: `Field '${meta.fields[i]!.name}' depends on unknown field '${dep}'.`,
          });
        }
      }
    }
    // CONFIG-UX-SETUP-ADVANCED-1 — visibleWhen must reference a known,
    // unconditionally-visible sibling (shared with ActionMetaSchema).
    checkVisibleWhenReferences(meta.fields, ctx);

    // RESOLVERS-3 — an itemField picker's `dependsOn` must name a real
    // TOP-LEVEL sibling (shared with ActionMetaSchema).
    checkItemFieldOptionSourceReferences(meta.fields, ctx);
  });
export type TriggerMeta = z.infer<typeof TriggerMetaSchema>;

// Re-export the shared field / output types so trigger consumers don't have
// to import from two paths.
export type { FieldMeta, OutputMeta };
