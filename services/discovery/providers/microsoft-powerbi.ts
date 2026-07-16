import type { ActionMeta } from "@/contracts/actionMeta";
import type { TriggerMeta } from "@/contracts/triggerMeta";

/**
 * Microsoft Power BI discovery sub-registry.
 *
 * Per-provider extraction of the Power BI meta imports so the central
 * `services/discovery/_registry.ts` stays under its line cap (same pattern
 * as `providers/microsoft-excel.ts` / `providers/mailchimp.ts`). The central
 * registry spreads `MICROSOFT_POWERBI_ACTION_METAS` /
 * `MICROSOFT_POWERBI_TRIGGER_METAS`; module-load validation + duplicate-key
 * rejection happen centrally — this file is import grouping only.
 *
 * **Coverage:** 47 actions across 8 domains + 16 polling triggers. Field
 * names are camelCase, mirroring the runtime Zod schemas 1:1 (drift fails
 * the meta-coverage structural test). Cascading pickers resolve through the
 * 21 `microsoft-powerbi:*` option sources registered in
 * `services/options/_registry.ts`.
 *
 * Every trigger registers its activation hook via
 * `registerActivation("microsoft-powerbi", <type>, ...)` in its
 * `triggers/<event>/index.ts`, satisfying the
 * trigger-meta-activation-invariant test without an exemption.
 */
import { microsoftPowerBiRefreshSemanticModelMeta } from "@/integrations/microsoft-powerbi/actions/semantic_models/refreshSemanticModel.meta";
import { microsoftPowerBiCancelSemanticModelRefreshMeta } from "@/integrations/microsoft-powerbi/actions/semantic_models/cancelSemanticModelRefresh.meta";
import { microsoftPowerBiGetSemanticModelRefreshHistoryMeta } from "@/integrations/microsoft-powerbi/actions/semantic_models/getSemanticModelRefreshHistory.meta";
import { microsoftPowerBiGetSemanticModelRefreshDetailsMeta } from "@/integrations/microsoft-powerbi/actions/semantic_models/getSemanticModelRefreshDetails.meta";
import { microsoftPowerBiExecuteDaxQueryMeta } from "@/integrations/microsoft-powerbi/actions/semantic_models/executeDaxQuery.meta";
import { microsoftPowerBiUpdateSemanticModelParametersMeta } from "@/integrations/microsoft-powerbi/actions/semantic_models/updateSemanticModelParameters.meta";
import { microsoftPowerBiUpdateSemanticModelRefreshScheduleMeta } from "@/integrations/microsoft-powerbi/actions/semantic_models/updateSemanticModelRefreshSchedule.meta";
import { microsoftPowerBiUpdateSemanticModelDatasourcesMeta } from "@/integrations/microsoft-powerbi/actions/semantic_models/updateSemanticModelDatasources.meta";
import { microsoftPowerBiBindSemanticModelToGatewayMeta } from "@/integrations/microsoft-powerbi/actions/semantic_models/bindSemanticModelToGateway.meta";
import { microsoftPowerBiTakeOverSemanticModelMeta } from "@/integrations/microsoft-powerbi/actions/semantic_models/takeOverSemanticModel.meta";
import { microsoftPowerBiTriggerQueryScaleOutSyncMeta } from "@/integrations/microsoft-powerbi/actions/semantic_models/triggerQueryScaleOutSync.meta";
import { microsoftPowerBiGetQueryScaleOutSyncStatusMeta } from "@/integrations/microsoft-powerbi/actions/semantic_models/getQueryScaleOutSyncStatus.meta";
import { microsoftPowerBiExportPowerBiReportToFileMeta } from "@/integrations/microsoft-powerbi/actions/reports/exportPowerBiReportToFile.meta";
import { microsoftPowerBiExportPaginatedReportToFileMeta } from "@/integrations/microsoft-powerbi/actions/reports/exportPaginatedReportToFile.meta";
import { microsoftPowerBiExportReportDefinitionMeta } from "@/integrations/microsoft-powerbi/actions/reports/exportReportDefinition.meta";
import { microsoftPowerBiCloneReportMeta } from "@/integrations/microsoft-powerbi/actions/reports/cloneReport.meta";
import { microsoftPowerBiRebindReportMeta } from "@/integrations/microsoft-powerbi/actions/reports/rebindReport.meta";
import { microsoftPowerBiUpdatePaginatedReportDatasourcesMeta } from "@/integrations/microsoft-powerbi/actions/reports/updatePaginatedReportDatasources.meta";
import { microsoftPowerBiBindPaginatedReportToGatewayMeta } from "@/integrations/microsoft-powerbi/actions/reports/bindPaginatedReportToGateway.meta";
import { microsoftPowerBiImportPowerBiFileMeta } from "@/integrations/microsoft-powerbi/actions/imports/importPowerBiFile.meta";
import { microsoftPowerBiGetImportStatusMeta } from "@/integrations/microsoft-powerbi/actions/imports/getImportStatus.meta";
import { microsoftPowerBiRefreshDataflowMeta } from "@/integrations/microsoft-powerbi/actions/dataflows/refreshDataflow.meta";
import { microsoftPowerBiCancelDataflowRefreshMeta } from "@/integrations/microsoft-powerbi/actions/dataflows/cancelDataflowRefresh.meta";
import { microsoftPowerBiGetDataflowRefreshHistoryMeta } from "@/integrations/microsoft-powerbi/actions/dataflows/getDataflowRefreshHistory.meta";
import { microsoftPowerBiUpdateDataflowRefreshScheduleMeta } from "@/integrations/microsoft-powerbi/actions/dataflows/updateDataflowRefreshSchedule.meta";
import { microsoftPowerBiDeployAllPipelineContentMeta } from "@/integrations/microsoft-powerbi/actions/pipelines/deployAllPipelineContent.meta";
import { microsoftPowerBiSelectivelyDeployPipelineContentMeta } from "@/integrations/microsoft-powerbi/actions/pipelines/selectivelyDeployPipelineContent.meta";
import { microsoftPowerBiGetPipelineDeploymentStatusMeta } from "@/integrations/microsoft-powerbi/actions/pipelines/getPipelineDeploymentStatus.meta";
import { microsoftPowerBiGetPipelineDeploymentHistoryMeta } from "@/integrations/microsoft-powerbi/actions/pipelines/getPipelineDeploymentHistory.meta";
import { microsoftPowerBiAssignWorkspaceToPipelineStageMeta } from "@/integrations/microsoft-powerbi/actions/pipelines/assignWorkspaceToPipelineStage.meta";
import { microsoftPowerBiUnassignWorkspaceFromPipelineStageMeta } from "@/integrations/microsoft-powerbi/actions/pipelines/unassignWorkspaceFromPipelineStage.meta";
import { microsoftPowerBiCreateDeploymentPipelineMeta } from "@/integrations/microsoft-powerbi/actions/pipelines/createDeploymentPipeline.meta";
import { microsoftPowerBiUpdateDeploymentPipelineMeta } from "@/integrations/microsoft-powerbi/actions/pipelines/updateDeploymentPipeline.meta";
import { microsoftPowerBiAddOrUpdatePipelineUserMeta } from "@/integrations/microsoft-powerbi/actions/pipelines/addOrUpdatePipelineUser.meta";
import { microsoftPowerBiRemovePipelineUserMeta } from "@/integrations/microsoft-powerbi/actions/pipelines/removePipelineUser.meta";
import { microsoftPowerBiCreateWorkspaceMeta } from "@/integrations/microsoft-powerbi/actions/workspaces/createWorkspace.meta";
import { microsoftPowerBiUpdateWorkspaceMeta } from "@/integrations/microsoft-powerbi/actions/workspaces/updateWorkspace.meta";
import { microsoftPowerBiAddWorkspaceUserMeta } from "@/integrations/microsoft-powerbi/actions/workspaces/addWorkspaceUser.meta";
import { microsoftPowerBiUpdateWorkspaceUserMeta } from "@/integrations/microsoft-powerbi/actions/workspaces/updateWorkspaceUser.meta";
import { microsoftPowerBiRemoveWorkspaceUserMeta } from "@/integrations/microsoft-powerbi/actions/workspaces/removeWorkspaceUser.meta";
import { microsoftPowerBiCreateGatewayDatasourceMeta } from "@/integrations/microsoft-powerbi/actions/gateways/createGatewayDatasource.meta";
import { microsoftPowerBiUpdateGatewayDatasourceCredentialsMeta } from "@/integrations/microsoft-powerbi/actions/gateways/updateGatewayDatasourceCredentials.meta";
import { microsoftPowerBiTestGatewayDatasourceConnectionMeta } from "@/integrations/microsoft-powerbi/actions/gateways/testGatewayDatasourceConnection.meta";
import { microsoftPowerBiAddOrUpdateGatewayDatasourceUserMeta } from "@/integrations/microsoft-powerbi/actions/gateways/addOrUpdateGatewayDatasourceUser.meta";
import { microsoftPowerBiRemoveGatewayDatasourceUserMeta } from "@/integrations/microsoft-powerbi/actions/gateways/removeGatewayDatasourceUser.meta";
import { microsoftPowerBiAssignWorkspaceToCapacityMeta } from "@/integrations/microsoft-powerbi/actions/capacities/assignWorkspaceToCapacity.meta";
import { microsoftPowerBiGetCapacityAssignmentStatusMeta } from "@/integrations/microsoft-powerbi/actions/capacities/getCapacityAssignmentStatus.meta";

// Trigger metas — 16 polling triggers. Refresh/job lifecycle (10) then
// state-diff watches (6).
import { microsoftPowerBiSemanticModelRefreshCompletedTriggerMeta } from "@/integrations/microsoft-powerbi/triggers/semanticModelRefreshCompleted/semanticModelRefreshCompleted.meta";
import { microsoftPowerBiSemanticModelRefreshFailedTriggerMeta } from "@/integrations/microsoft-powerbi/triggers/semanticModelRefreshFailed/semanticModelRefreshFailed.meta";
import { microsoftPowerBiSemanticModelRefreshCanceledTriggerMeta } from "@/integrations/microsoft-powerbi/triggers/semanticModelRefreshCanceled/semanticModelRefreshCanceled.meta";
import { microsoftPowerBiDataflowRefreshCompletedTriggerMeta } from "@/integrations/microsoft-powerbi/triggers/dataflowRefreshCompleted/dataflowRefreshCompleted.meta";
import { microsoftPowerBiDataflowRefreshFailedTriggerMeta } from "@/integrations/microsoft-powerbi/triggers/dataflowRefreshFailed/dataflowRefreshFailed.meta";
import { microsoftPowerBiDataflowRefreshCanceledTriggerMeta } from "@/integrations/microsoft-powerbi/triggers/dataflowRefreshCanceled/dataflowRefreshCanceled.meta";
import { microsoftPowerBiImportCompletedTriggerMeta } from "@/integrations/microsoft-powerbi/triggers/importCompleted/importCompleted.meta";
import { microsoftPowerBiImportFailedTriggerMeta } from "@/integrations/microsoft-powerbi/triggers/importFailed/importFailed.meta";
import { microsoftPowerBiPipelineDeploymentCompletedTriggerMeta } from "@/integrations/microsoft-powerbi/triggers/pipelineDeploymentCompleted/pipelineDeploymentCompleted.meta";
import { microsoftPowerBiPipelineDeploymentFailedTriggerMeta } from "@/integrations/microsoft-powerbi/triggers/pipelineDeploymentFailed/pipelineDeploymentFailed.meta";
import { microsoftPowerBiDaxConditionMetTriggerMeta } from "@/integrations/microsoft-powerbi/triggers/daxConditionMet/daxConditionMet.meta";
import { microsoftPowerBiDaxQueryResultChangedTriggerMeta } from "@/integrations/microsoft-powerbi/triggers/daxQueryResultChanged/daxQueryResultChanged.meta";
import { microsoftPowerBiGatewayDatasourceStatusChangedTriggerMeta } from "@/integrations/microsoft-powerbi/triggers/gatewayDatasourceStatusChanged/gatewayDatasourceStatusChanged.meta";
import { microsoftPowerBiWorkspaceItemAddedTriggerMeta } from "@/integrations/microsoft-powerbi/triggers/workspaceItemAdded/workspaceItemAdded.meta";
import { microsoftPowerBiWorkspaceItemRemovedTriggerMeta } from "@/integrations/microsoft-powerbi/triggers/workspaceItemRemoved/workspaceItemRemoved.meta";
import { microsoftPowerBiWorkspaceAccessChangedTriggerMeta } from "@/integrations/microsoft-powerbi/triggers/workspaceAccessChanged/workspaceAccessChanged.meta";

/** Power BI action metas in displayOrder (10..810). */
export const MICROSOFT_POWERBI_ACTION_METAS: ReadonlyArray<ActionMeta> = [
  microsoftPowerBiRefreshSemanticModelMeta,
  microsoftPowerBiCancelSemanticModelRefreshMeta,
  microsoftPowerBiGetSemanticModelRefreshHistoryMeta,
  microsoftPowerBiGetSemanticModelRefreshDetailsMeta,
  microsoftPowerBiExecuteDaxQueryMeta,
  microsoftPowerBiUpdateSemanticModelParametersMeta,
  microsoftPowerBiUpdateSemanticModelRefreshScheduleMeta,
  microsoftPowerBiUpdateSemanticModelDatasourcesMeta,
  microsoftPowerBiBindSemanticModelToGatewayMeta,
  microsoftPowerBiTakeOverSemanticModelMeta,
  microsoftPowerBiTriggerQueryScaleOutSyncMeta,
  microsoftPowerBiGetQueryScaleOutSyncStatusMeta,
  microsoftPowerBiExportPowerBiReportToFileMeta,
  microsoftPowerBiExportPaginatedReportToFileMeta,
  microsoftPowerBiExportReportDefinitionMeta,
  microsoftPowerBiCloneReportMeta,
  microsoftPowerBiRebindReportMeta,
  microsoftPowerBiUpdatePaginatedReportDatasourcesMeta,
  microsoftPowerBiBindPaginatedReportToGatewayMeta,
  microsoftPowerBiImportPowerBiFileMeta,
  microsoftPowerBiGetImportStatusMeta,
  microsoftPowerBiRefreshDataflowMeta,
  microsoftPowerBiCancelDataflowRefreshMeta,
  microsoftPowerBiGetDataflowRefreshHistoryMeta,
  microsoftPowerBiUpdateDataflowRefreshScheduleMeta,
  microsoftPowerBiDeployAllPipelineContentMeta,
  microsoftPowerBiSelectivelyDeployPipelineContentMeta,
  microsoftPowerBiGetPipelineDeploymentStatusMeta,
  microsoftPowerBiGetPipelineDeploymentHistoryMeta,
  microsoftPowerBiAssignWorkspaceToPipelineStageMeta,
  microsoftPowerBiUnassignWorkspaceFromPipelineStageMeta,
  microsoftPowerBiCreateDeploymentPipelineMeta,
  microsoftPowerBiUpdateDeploymentPipelineMeta,
  microsoftPowerBiAddOrUpdatePipelineUserMeta,
  microsoftPowerBiRemovePipelineUserMeta,
  microsoftPowerBiCreateWorkspaceMeta,
  microsoftPowerBiUpdateWorkspaceMeta,
  microsoftPowerBiAddWorkspaceUserMeta,
  microsoftPowerBiUpdateWorkspaceUserMeta,
  microsoftPowerBiRemoveWorkspaceUserMeta,
  microsoftPowerBiCreateGatewayDatasourceMeta,
  microsoftPowerBiUpdateGatewayDatasourceCredentialsMeta,
  microsoftPowerBiTestGatewayDatasourceConnectionMeta,
  microsoftPowerBiAddOrUpdateGatewayDatasourceUserMeta,
  microsoftPowerBiRemoveGatewayDatasourceUserMeta,
  microsoftPowerBiAssignWorkspaceToCapacityMeta,
  microsoftPowerBiGetCapacityAssignmentStatusMeta,
];


/** Power BI trigger metas in displayOrder (10..160) — all polling. */
export const MICROSOFT_POWERBI_TRIGGER_METAS: ReadonlyArray<TriggerMeta> = [
  microsoftPowerBiSemanticModelRefreshCompletedTriggerMeta,
  microsoftPowerBiSemanticModelRefreshFailedTriggerMeta,
  microsoftPowerBiSemanticModelRefreshCanceledTriggerMeta,
  microsoftPowerBiDataflowRefreshCompletedTriggerMeta,
  microsoftPowerBiDataflowRefreshFailedTriggerMeta,
  microsoftPowerBiDataflowRefreshCanceledTriggerMeta,
  microsoftPowerBiImportCompletedTriggerMeta,
  microsoftPowerBiImportFailedTriggerMeta,
  microsoftPowerBiPipelineDeploymentCompletedTriggerMeta,
  microsoftPowerBiPipelineDeploymentFailedTriggerMeta,
  microsoftPowerBiDaxConditionMetTriggerMeta,
  microsoftPowerBiDaxQueryResultChangedTriggerMeta,
  microsoftPowerBiGatewayDatasourceStatusChangedTriggerMeta,
  microsoftPowerBiWorkspaceItemAddedTriggerMeta,
  microsoftPowerBiWorkspaceItemRemovedTriggerMeta,
  microsoftPowerBiWorkspaceAccessChangedTriggerMeta,
];
