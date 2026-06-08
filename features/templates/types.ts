import type {
  AccountTemplateSummary,
  MarketplaceTemplateSummary,
  TemplateVisibility,
} from "@/contracts/workflowTemplate";

/**
 * Client-facing template view models (CS-XT-7A).
 *
 * `MyTemplateItem` is the no-leak projection of an account template for the "Your templates"
 * tab: it DROPS `createdByUserId` (a raw user id is never rendered) and replaces it with a
 * `canManage` boolean computed against the viewer's own id. The marketplace summary is already
 * safe (omits account_id / created_by_user_id) and is used as-is.
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
  /** True when the viewer authored it → may publish/unpublish/delete (creator-only). */
  canManage: boolean;
}

/** Map an account template summary → the client item, stripping the raw creator id. */
export function toMyTemplateItem(
  summary: AccountTemplateSummary,
  currentUserId: string,
): MyTemplateItem {
  return {
    id: summary.id,
    name: summary.name,
    description: summary.description,
    source: summary.source,
    visibility: summary.visibility,
    usageCount: summary.usageCount,
    forkCount: summary.forkCount,
    publishedAt: summary.publishedAt,
    canManage: summary.createdByUserId === currentUserId,
  };
}
