import { executeAction } from "@/src/infrastructure/workflows/legacy-compatibility"
import { ExecutionContext } from "./workflowExecutionService"

export class LegacyIntegrationService {
  async executeFallbackAction(node: any, context: ExecutionContext): Promise<any> {
    console.log(`🔄 Fallback to legacy action execution for: ${node.data.type}`)
    
    return await executeAction({
      node,
      input: context.data,
      userId: context.userId,
      workflowId: context.workflowId
    })
  }

  async executeOneDriveUpload(node: any, context: ExecutionContext): Promise<any> {
    console.log("☁️ Executing OneDrive upload (legacy)")
    
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
    console.log("📦 Executing Dropbox upload (legacy)")
    
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