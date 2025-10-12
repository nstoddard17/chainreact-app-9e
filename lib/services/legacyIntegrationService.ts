import { executeAction } from "@/src/infrastructure/workflows/legacy-compatibility"
import { ExecutionContext } from "./workflowExecutionService"

import { logger } from '@/lib/utils/logger'

export class LegacyIntegrationService {
  async executeFallbackAction(node: any, context: ExecutionContext): Promise<any> {
    logger.debug(`🔄 Fallback to legacy action execution for: ${node.data.type}`)
    logger.debug(`📌 Context userId: ${context.userId}, workflowId: ${context.workflowId}`)
    
    if (!context.userId) {
      logger.error('❌ ERROR: userId is undefined in ExecutionContext!')
      logger.error('Full context:', JSON.stringify({
        hasData: !!context.data,
        hasVariables: !!context.variables,
        hasResults: !!context.results,
        testMode: context.testMode,
        userId: context.userId,
        workflowId: context.workflowId,
        hasDataFlowManager: !!context.dataFlowManager
      }, null, 2))
    }
    
    return await executeAction({
      node,
      input: context.data,
      userId: context.userId,
      workflowId: context.workflowId
    })
  }

  async executeOneDriveUpload(node: any, context: ExecutionContext): Promise<any> {
    logger.debug("☁️ Executing OneDrive upload (legacy)")
    
    if (context.testMode) {
      return {
        type: "onedrive_upload_file",
        fileName: node.data.config?.fileName || "test-file.txt",
        status: "uploaded (test mode)",
        fileId: "test-onedrive-file-id"
      }
    }
    
    return await this.executeFallbackAction(node, context)
  }

  async executeDropboxUpload(node: any, context: ExecutionContext): Promise<any> {
    logger.debug("📦 Executing Dropbox upload (legacy)")
    
    if (context.testMode) {
      return {
        type: "dropbox_upload_file",
        fileName: node.data.config?.fileName || "test-file.txt",
        status: "uploaded (test mode)",
        fileId: "test-dropbox-file-id"
      }
    }
    
    return await this.executeFallbackAction(node, context)
  }
}