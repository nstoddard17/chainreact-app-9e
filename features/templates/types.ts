import type {
  AccountTemplateSummary,
  MarketplaceTemplateSummary,
  TemplateVisibility,
} from "@/contracts/workflowTemplate";

/**
 * Client-facing template view models (CS-XT-7A).
 *
 * `MyTemplateItem` is the no-leak projection of an account template for the "Your templates"
 * tab. The raw creator id never reaches the client: the server already resolves the management
 * affordance into `AccountTemplateSummary.canManage`, which this passes through. The marketplace
 * summary is already safe (omits account_id / created_by_user_id) and is used as-is.
 */
export type { MarketplaceTemplateSummary };

export interface MyTemplateItem {
  id: string;
  name: string;
  description: string | null;
  source: "user" | "official";
  visibility: TemplateVisibility;
  usageCount: number;
  forkCount: number;
  publishedAt: string | null;
  /** Server-resolved: true when the viewer may publish/unpublish/delete (creator-only today). */
  canManage: boolean;
}

/** Map an account template summary → the client item. `canManage` is already server-resolved. */
export function toMyTemplateItem(summary: AccountTemplateSummary): MyTemplateItem {
  return {
    id: summary.id,
    name: summary.name,
    description: summary.description,
    source: summary.source,
    visibility: summary.visibility,
    usageCount: summary.usageCount,
    forkCount: summary.forkCount,
    publishedAt: summary.publishedAt,
    canManage: summary.canManage,
  };
}
