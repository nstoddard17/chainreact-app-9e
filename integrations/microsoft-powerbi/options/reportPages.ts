import {
  IntegrationActionRequiredError,
  refreshAndRetry,
  Unauthorized401Error,
} from "@/services/oauth/refreshAndRetry";
import {
  OptionsResolverError,
  type OptionsResolver,
} from "@/services/options/types";
import { NotFoundError } from "@/integrations/microsoft-powerbi/api/errors";
import { pagesList } from "@/integrations/microsoft-powerbi/api/reports/pagesList";

/**
 * `microsoft-powerbi:report_pages` options resolver.
 *
 * Backs the optional `pageName` field on the Power BI report export
 * action. Multi-parent cascade: **dep names `workspaceId` + `reportId`
 * are pinned verbatim** to the runtime Zod schemas — meta fields wire
 * `dependsOn: ["workspaceId", "reportId"]`.
 *
 * Value = the wire page `name` ("ReportSection…" — what ExportTo's
 * `pageName` expects), label = the human `displayName` (falls back to
 * the wire name). A gone parent (workspace or report) throws
 * `NotFoundError` → empty items (not an error).
 */
export const microsoftPowerBiReportPagesResolver: OptionsResolver = {
  source: "microsoft-powerbi:report_pages",
  provider: "microsoft-powerbi",
  requiresIntegration: true,
  requiredDeps: ["workspaceId", "reportId"],
  async resolve(ctx) {
    if (!ctx.integration) {
      throw new OptionsResolverError(
        "INTEGRATION_DISCONNECTED",
        "No active Microsoft Power BI integration. Connect Power BI first.",
      );
    }
    const integration = ctx.integration;

    const workspaceId = ctx.deps.workspaceId;
    if (typeof workspaceId !== "string" || workspaceId.length === 0) {
      throw new OptionsResolverError(
        "MISSING_DEPENDENCY",
        "Select a workspace first.",
      );
    }
    const reportId = ctx.deps.reportId;
    if (typeof reportId !== "string" || reportId.length === 0) {
      throw new OptionsResolverError(
        "MISSING_DEPENDENCY",
        "Select a report first.",
      );
    }

    let pages;
    try {
      pages = await refreshAndRetry({
        accountId: integration.accountId,
        provider: "microsoft-powerbi",
        providerAccountId: integration.providerAccountId,
        apiCall: (accessToken) =>
          pagesList({ accessToken, groupId: workspaceId, reportId }),
      });
    } catch (err) {
      if (
        err instanceof IntegrationActionRequiredError ||
        err instanceof Unauthorized401Error
      ) {
        throw new OptionsResolverError(
          "INTEGRATION_DISCONNECTED",
          "Reconnect Microsoft Power BI and try again.",
        );
      }
      if (err instanceof NotFoundError) {
        // Parent workspace/report no longer exists — empty picker.
        return { items: [], hasMore: false };
      }
      throw new OptionsResolverError(
        "PROVIDER_ERROR",
        "Couldn't load report pages. Try again.",
      );
    }

    const items = pages.map((p) => ({
      value: p.name,
      label:
        p.displayName !== null && p.displayName.length > 0
          ? p.displayName
          : p.name,
    }));
    const lowerQ = ctx.q.toLowerCase();
    const filtered =
      lowerQ.length > 0
        ? items.filter((item) => item.label.toLowerCase().includes(lowerQ))
        : items;

    return { items: filtered, hasMore: false };
  },
};
