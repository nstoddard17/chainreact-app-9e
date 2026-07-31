/**
 * Parity locks: the mobile package's mirrored vocabularies must stay
 * IDENTICAL to the web contracts they mirror
 * (MOBILE-COMPANION-M0-CONTRACTS-FOUNDATION-1).
 *
 * The package is self-contained (it cannot import `@/contracts` — that alias
 * does not exist in the mobile repo), so equality is enforced HERE, in the
 * web repo's CI, where both sides are importable. Drift fails the build on
 * the server side, before it can ship.
 */
import {
  WorkflowStateSchema,
  WorkflowDisabledReasonSchema,
  WorkflowRunDisplayStatusSchema,
  WorkflowRunTriggeredBySchema,
  HumanizedErrorSchema,
} from "../../../../contracts/workflow";
import {
  AccountTypeSchema,
  MembershipRoleSchema,
} from "../../../../contracts/accounts";
import {
  computeAccountUsageSummary,
} from "../../../../core/billing/accountUsageSummary";
import type { WorkflowApiErrorCode } from "../../../../lib/api/workflows";
import {
  MOBILE_WORKFLOW_STATES,
  MOBILE_WORKFLOW_DISABLED_REASONS,
  MOBILE_RUN_STATUSES,
  MOBILE_RUN_TRIGGERED_BY,
  MOBILE_HUMANIZED_ERROR_ACTIONS,
  MOBILE_ACCOUNT_TYPES,
  MOBILE_MEMBERSHIP_ROLES,
  MOBILE_ERROR_CODES,
  MobileHumanizedErrorSchema,
  MobileUsageSummarySchema,
  MobileConfirmationRequiredDetailSchema,
  type MobileErrorCode,
} from "../../../../packages/mobile-contracts/src/index";

describe("mobile-contracts parity with web contracts", () => {
  it("workflow states match contracts/workflow.ts exactly", () => {
    expect([...MOBILE_WORKFLOW_STATES]).toEqual(WorkflowStateSchema.options);
  });

  it("disabled reasons match exactly", () => {
    expect([...MOBILE_WORKFLOW_DISABLED_REASONS]).toEqual(
      WorkflowDisabledReasonSchema.options,
    );
  });

  it("run display statuses match exactly (incl. non-terminal queued/running)", () => {
    expect([...MOBILE_RUN_STATUSES]).toEqual(WorkflowRunDisplayStatusSchema.options);
  });

  it("run triggered-by labels match exactly", () => {
    expect([...MOBILE_RUN_TRIGGERED_BY]).toEqual(WorkflowRunTriggeredBySchema.options);
  });

  it("humanized-error actions and severities match exactly", () => {
    const webAction = HumanizedErrorSchema.shape.action.unwrap();
    expect([...MOBILE_HUMANIZED_ERROR_ACTIONS]).toEqual(webAction.options);
    expect(MobileHumanizedErrorSchema.shape.severity.options).toEqual(
      HumanizedErrorSchema.shape.severity.options,
    );
  });

  it("every humanized error the web schema accepts parses on mobile", () => {
    const webAction = HumanizedErrorSchema.shape.action.unwrap();
    for (const action of webAction.options) {
      for (const severity of HumanizedErrorSchema.shape.severity.options) {
        const sample = HumanizedErrorSchema.parse({
          title: "Example title",
          description: "Example description.",
          hint: "Example hint.",
          action,
          severity,
        });
        expect(MobileHumanizedErrorSchema.safeParse(sample).success).toBe(true);
      }
    }
  });

  it("account types and membership roles match contracts/accounts.ts exactly", () => {
    expect([...MOBILE_ACCOUNT_TYPES]).toEqual(AccountTypeSchema.options);
    expect([...MOBILE_MEMBERSHIP_ROLES]).toEqual(MembershipRoleSchema.options);
  });

  it("mobile error codes cover every wire-visible WorkflowApiErrorCode", () => {
    // Compile-time completeness: adding a code to WorkflowApiErrorCode without
    // deciding its mobile fate breaks this Record. UNKNOWN is client-local
    // (never sent on the wire) and is deliberately absent from the mobile set.
    const coverage: Record<Exclude<WorkflowApiErrorCode, "UNKNOWN">, MobileErrorCode> = {
      BAD_REQUEST: "BAD_REQUEST",
      UNAUTHENTICATED: "UNAUTHENTICATED",
      WORKFLOW_NOT_FOUND: "WORKFLOW_NOT_FOUND",
      INVALID_TRANSITION: "INVALID_TRANSITION",
      MISSING_PRECONDITIONS: "MISSING_PRECONDITIONS",
      TRIGGER_REGISTRATION_FAILED: "TRIGGER_REGISTRATION_FAILED",
      LIFECYCLE_CONFLICT: "LIFECYCLE_CONFLICT",
      ACCOUNT_PENDING_DELETION: "ACCOUNT_PENDING_DELETION",
      CONFIRMATION_REQUIRED: "CONFIRMATION_REQUIRED",
      SERVER_ERROR: "SERVER_ERROR",
    };
    for (const mobileCode of Object.values(coverage)) {
      expect(MOBILE_ERROR_CODES).toContain(mobileCode);
    }
  });

  it("a web-shaped 409 confirmation detail parses with the mobile schema", () => {
    // Shape mirrored from lib/api/workflows.ts WorkflowConfirmationRequiredDetail
    // + services/workflows/riskConfirmation.ts ConfirmationRequiredAction.
    const webShaped = {
      requiresConfirmation: true as const,
      confirmationText: "CONFIRM",
      actions: [
        {
          nodeId: "node-9",
          provider: "example-storage",
          type: "delete_file",
          displayName: "Delete file",
          riskDescription: "Permanently deletes the matched file.",
        },
      ],
    };
    expect(MobileConfirmationRequiredDetailSchema.safeParse(webShaped).success).toBe(true);
  });

  it("real computeAccountUsageSummary output parses with the mobile usage schema", () => {
    const now = new Date("2026-07-31T12:00:00.000Z");
    const available = computeAccountUsageSummary({
      billingMode: "standard",
      tasks: { used: 1500, limit: 2000, periodStartedAt: "2026-07-12T00:00:00.000Z" },
      aiCredits: { used: 10, limit: 100, periodStartedAt: "2026-07-12T00:00:00.000Z" },
      now,
    });
    expect(MobileUsageSummarySchema.safeParse(available).success).toBe(true);

    const degraded = computeAccountUsageSummary({
      billingMode: "internal_free",
      tasks: null,
      aiCredits: null,
      now,
    });
    const parsed = MobileUsageSummarySchema.parse(degraded);
    expect(parsed.tasks.available).toBe(false);
    expect(parsed.internalFree).toBe(true);
  });
});
