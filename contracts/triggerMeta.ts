import { z } from "zod";
import {
  ActionCategorySchema,
  FieldMetaSchema,
  OutputMetaSchema,
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
  });
export type TriggerMeta = z.infer<typeof TriggerMetaSchema>;

// Re-export the shared field / output types so trigger consumers don't have
// to import from two paths.
export type { FieldMeta, OutputMeta };
