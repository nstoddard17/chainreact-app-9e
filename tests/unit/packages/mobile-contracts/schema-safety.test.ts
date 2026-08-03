/** @jest-environment node */
/**
 * Schema-safety locks for @chainreact/mobile-contracts
 * (MOBILE-COMPANION-M0-CONTRACTS-FOUNDATION-1).
 *
 * Walks every exported zod schema recursively and proves, as data:
 *   1. no object key anywhere in the contract matches a secret-bearing or
 *      raw-data name (tokens, credentials, scopes, outputs, payloads, Stripe,
 *      OAuth, service-role) — catches renamed and nested reintroductions, not
 *      one exact string;
 *   2. the security-critical shapes are `.strict()` so unknown keys are
 *      REJECTED, not stripped;
 *   3. the run step/detail key sets are exactly the sanctioned ones — the
 *      shape of "what a phone may ever see about a run" is pinned.
 */
import { z } from "zod";
import * as pkg from "../../../../packages/mobile-contracts/src/index";
import {
  MobileRunDetailSchema,
  MobileRunStepSchema,
  MobileRunStepErrorSchema,
  MobilePushDataSchema,
  MobileDeepLinkTargetSchema,
  MobileAppConfigSchema,
  MobileMaintenanceSchema,
  MobileConfirmationRequiredDetailSchema,
  MobileIntegrationHealthItemSchema,
  MobileWorkflowDetailSchema,
  MobileWorkflowNodeSummarySchema,
  MobileWorkflowListResponseSchema,
  MobileRunListResponseSchema,
  MobileAccountCapabilitiesSchema,
} from "../../../../packages/mobile-contracts/src/index";

const FORBIDDEN_KEY = new RegExp(
  [
    "token",
    "secret",
    "password",
    "credential",
    "api_?key",
    "scope",
    "payload",
    "output",
    "trigger_?event",
    "triggerevent",
    "fatal",
    "stripe",
    "oauth",
    "bearer",
    "encrypted",
    "authorization",
    "session_?id",
    "provider_?account",
    "metadata",
    "email_?address",
  ].join("|"),
  "i",
);

/** Recursively collect every object key reachable in a zod schema. */
function collectKeys(schema: z.ZodTypeAny, seen = new Set<z.ZodTypeAny>()): string[] {
  if (seen.has(schema)) return [];
  seen.add(schema);
  const def = schema._def as Record<string, unknown> & { typeName: z.ZodFirstPartyTypeKind };
  switch (def.typeName) {
    case z.ZodFirstPartyTypeKind.ZodObject: {
      const shape = (schema as z.AnyZodObject).shape as Record<string, z.ZodTypeAny>;
      return Object.entries(shape).flatMap(([key, child]) => [
        key,
        ...collectKeys(child, seen),
      ]);
    }
    case z.ZodFirstPartyTypeKind.ZodArray:
      return collectKeys((def.type as z.ZodTypeAny), seen);
    case z.ZodFirstPartyTypeKind.ZodOptional:
    case z.ZodFirstPartyTypeKind.ZodNullable:
    case z.ZodFirstPartyTypeKind.ZodDefault:
      return collectKeys(def.innerType as z.ZodTypeAny, seen);
    case z.ZodFirstPartyTypeKind.ZodEffects:
      return collectKeys(def.schema as z.ZodTypeAny, seen);
    case z.ZodFirstPartyTypeKind.ZodUnion:
    case z.ZodFirstPartyTypeKind.ZodDiscriminatedUnion:
      return (def.options as z.ZodTypeAny[]).flatMap((o) => collectKeys(o, seen));
    case z.ZodFirstPartyTypeKind.ZodRecord:
      return collectKeys(def.valueType as z.ZodTypeAny, seen);
    default:
      return [];
  }
}

function exportedSchemas(): Array<[string, z.ZodTypeAny]> {
  const entries: Array<[string, unknown]> = Object.entries(pkg);
  return entries.filter(
    (entry): entry is [string, z.ZodTypeAny] => entry[1] instanceof z.ZodType,
  );
}

describe("mobile-contracts schema safety", () => {
  it("exports a meaningful number of schemas (non-vacuous)", () => {
    expect(exportedSchemas().length).toBeGreaterThanOrEqual(15);
  });

  it("no schema anywhere carries a secret-bearing or raw-data key name", () => {
    const offenders: string[] = [];
    for (const [name, schema] of exportedSchemas()) {
      for (const key of collectKeys(schema)) {
        if (FORBIDDEN_KEY.test(key)) offenders.push(`${name} → key "${key}"`);
      }
    }
    expect(offenders).toEqual([]);
  });

  it("security-critical shapes are strict (unknown keys rejected, not stripped)", () => {
    const strictObjects: Array<[string, z.AnyZodObject]> = [
      ["MobileRunDetailSchema", MobileRunDetailSchema],
      ["MobileRunStepSchema", MobileRunStepSchema],
      ["MobileRunStepErrorSchema", MobileRunStepErrorSchema],
      ["MobilePushDataSchema", MobilePushDataSchema],
      ["MobileAppConfigSchema", MobileAppConfigSchema],
      ["MobileConfirmationRequiredDetailSchema", MobileConfirmationRequiredDetailSchema],
      ["MobileIntegrationHealthItemSchema", MobileIntegrationHealthItemSchema],
      ["MobileMaintenanceSchema", MobileMaintenanceSchema],
      ["MobileWorkflowDetailSchema", MobileWorkflowDetailSchema],
      ["MobileWorkflowNodeSummarySchema", MobileWorkflowNodeSummarySchema],
      ["MobileWorkflowListResponseSchema", MobileWorkflowListResponseSchema],
      ["MobileRunListResponseSchema", MobileRunListResponseSchema],
      ["MobileAccountCapabilitiesSchema", MobileAccountCapabilitiesSchema],
    ];
    for (const [name, schema] of strictObjects) {
      expect(`${name}:${schema._def.unknownKeys}`).toBe(`${name}:strict`);
    }
    // The deep-link union's every variant is strict.
    for (const option of MobileDeepLinkTargetSchema.options) {
      expect(option._def.unknownKeys).toBe("strict");
    }
  });

  it("the run step and run detail key sets are exactly the sanctioned ones", () => {
    expect(Object.keys(MobileRunStepSchema.shape).sort()).toEqual([
      "displayName",
      "error",
      "nodeId",
      "status",
    ]);
    expect(Object.keys(MobileRunStepErrorSchema.shape).sort()).toEqual([
      "code",
      "message",
    ]);
    expect(Object.keys(MobileRunDetailSchema.shape).sort()).toEqual([
      "durationMs",
      "errorClassification",
      "finishedAt",
      "id",
      "isTest",
      "startedAt",
      "status",
      "steps",
      "triggeredBy",
      "workflowId",
      "workflowName",
    ]);
  });

  it("the workflow node summary is exactly labeling data (config structurally impossible)", () => {
    expect(Object.keys(MobileWorkflowNodeSummarySchema.shape).sort()).toEqual([
      "capability",
      "displayName",
      "kind",
      "nodeId",
      "provider",
    ]);
    expect(Object.keys(MobileWorkflowDetailSchema.shape)).not.toContain("draftDefinition");
    expect(Object.keys(MobileWorkflowDetailSchema.shape)).not.toContain("edges");
  });

  it("the push payload carries only ids, the type tag, and the schema generation", () => {
    expect(Object.keys(MobilePushDataSchema.shape).sort()).toEqual([
      "accountId",
      "notificationId",
      "runId",
      "type",
      "v",
      "workflowId",
    ]);
  });
});
