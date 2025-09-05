import { ExecutionContext } from "../workflowExecutionService"
import { LegacyIntegrationService } from "../legacyIntegrationService"

export class GoogleIntegrationService {
  private legacyService: LegacyIntegrationService

  constructor() {
    this.legacyService = new LegacyIntegrationService()
  }

  async execute(node: any, context: ExecutionContext): Promise<any> {
    const nodeType = node.data.type

    // Google Drive actions
    if (nodeType.startsWith('google_drive_')) {
      return await this.executeGoogleDriveAction(node, context)
    }

    // Google Sheets actions
    if (nodeType.startsWith('sheets_') || nodeType.includes('sheets')) {
      return await this.executeGoogleSheetsAction(node, context)
    }

    // Google Docs actions
    if (nodeType.startsWith('google_docs_')) {
      return await this.executeGoogleDocsAction(node, context)
    }

    // Google Calendar actions
    if (nodeType.startsWith('calendar_')) {
      return await this.executeGoogleCalendarAction(node, context)
    }

    throw new Error(`Unknown Google action: ${nodeType}`)
  }

  private async executeGoogleDriveAction(node: any, context: ExecutionContext) {
    const nodeType = node.data.type

    switch (nodeType) {
      case "google_drive_create_file":
        return await this.executeCreateFile(node, context)
      case "google_drive_upload_file":
        return await this.executeUploadFile(node, context)
      case "google_drive_create_folder":
        return await this.executeCreateFolder(node, context)
      case "google_drive_delete_file":
        return await this.executeDeleteFile(node, context)
      case "google_drive_share_file":
        return await this.executeShareFile(node, context)
      default:
        // Fallback to legacy service
        return await this.legacyService.executeFallbackAction(node, context)
    }
  }

  private async executeGoogleSheetsAction(node: any, context: ExecutionContext) {
    const nodeType = node.data.type

    switch (nodeType) {
      case "sheets_append":
        return await this.executeSheetsAppend(node, context)
      case "sheets_read":
        return await this.executeSheetsRead(node, context)
      case "sheets_update":
        return await this.executeSheetsUpdate(node, context)
      case "sheets_create_spreadsheet":
        return await this.executeSheetsCreateSpreadsheet(node, context)
      case "google_sheets_unified":
        return await this.executeGoogleSheetsUnified(node, context)
      default:
        // Fallback to legacy service
        return await this.legacyService.executeFallbackAction(node, context)
    }
  }

  private async executeGoogleDocsAction(node: any, context: ExecutionContext) {
    const nodeType = node.data.type

    switch (nodeType) {
      case "google_docs_create":
        return await this.executeDocsCreate(node, context)
      case "google_docs_read":
        return await this.executeDocsRead(node, context)
      case "google_docs_update":
        return await this.executeDocsUpdate(node, context)
      default:
        // Fallback to legacy service
        return await this.legacyService.executeFallbackAction(node, context)
    }
  }

  private async executeGoogleCalendarAction(node: any, context: ExecutionContext) {
    const nodeType = node.data.type

    switch (nodeType) {
      case "calendar_create_event":
        return await this.executeCalendarCreateEvent(node, context)
      case "calendar_update_event":
        return await this.executeCalendarUpdateEvent(node, context)
      case "calendar_delete_event":
        return await this.executeCalendarDeleteEvent(node, context)
      default:
        // Fallback to legacy service
        return await this.legacyService.executeFallbackAction(node, context)
    }
  }

  // Google Drive implementations
  private async executeCreateFile(node: any, context: ExecutionContext) {
    console.log("📄 Executing Google Drive create file")
    
    const config = node.data.config || {}
    const fileName = this.resolveValue(config.fileName || config.name, context)
    const content = this.resolveValue(config.content, context)
    const folderId = this.resolveValue(config.folderId || config.parent_id, context)

    if (!fileName) {
      throw new Error("Google Drive create file requires 'fileName' field")
    }

    if (context.testMode) {
      return {
        type: "google_drive_create_file",
        fileName,
        content,
        folderId,
        status: "created (test mode)",
        fileId: "test-file-id"
      }
    }

    // Use legacy service for actual Google Drive API calls
    return await this.legacyService.executeFallbackAction(node, context)
  }

  private async executeUploadFile(node: any, context: ExecutionContext) {
    console.log("⬆️ Executing Google Drive upload file")
    
    // Use legacy service for actual Google Drive API calls
    return await this.legacyService.executeFallbackAction(node, context)
  }

  private async executeCreateFolder(node: any, context: ExecutionContext) {
    console.log("📁 Executing Google Drive create folder")
    
    const config = node.data.config || {}
    const folderName = this.resolveValue(config.folderName || config.name, context)
    const parentId = this.resolveValue(config.parentId || config.parent_id, context)

    if (!folderName) {
      throw new Error("Google Drive create folder requires 'folderName' field")
    }

    if (context.testMode) {
      return {
        type: "google_drive_create_folder",
        folderName,
        parentId,
        status: "created (test mode)",
        folderId: "test-folder-id"
      }
    }

    // Use legacy service for actual Google Drive API calls
    return await this.legacyService.executeFallbackAction(node, context)
  }

  private async executeDeleteFile(node: any, context: ExecutionContext) {
    console.log("🗑️ Executing Google Drive delete file")
    
    const config = node.data.config || {}
    const fileId = this.resolveValue(config.fileId || config.file_id, context)

    if (!fileId) {
      throw new Error("Google Drive delete file requires 'fileId' field")
    }

    if (context.testMode) {
      return {
        type: "google_drive_delete_file",
        fileId,
        status: "deleted (test mode)"
      }
    }

    // Use legacy service for actual Google Drive API calls
    return await this.legacyService.executeFallbackAction(node, context)
  }

  private async executeShareFile(node: any, context: ExecutionContext) {
    console.log("🔗 Executing Google Drive share file")
    
    const config = node.data.config || {}
    const fileId = this.resolveValue(config.fileId || config.file_id, context)
    const email = this.resolveValue(config.email, context)
    const role = this.resolveValue(config.role, context) || 'reader'

    if (!fileId || !email) {
      throw new Error("Google Drive share file requires 'fileId' and 'email' fields")
    }

    if (context.testMode) {
      return {
        type: "google_drive_share_file",
        fileId,
        email,
        role,
        status: "shared (test mode)"
      }
    }

    // Use legacy service for actual Google Drive API calls
    return await this.legacyService.executeFallbackAction(node, context)
  }

  // Google Sheets implementations
  private async executeSheetsAppend(node: any, context: ExecutionContext) {
    console.log("📊 Executing Google Sheets append")
    
    // Use legacy service for actual Google Sheets API calls
    return await this.legacyService.executeFallbackAction(node, context)
  }

  private async executeSheetsRead(node: any, context: ExecutionContext) {
    console.log("📖 Executing Google Sheets read")
    
    // Use legacy service for actual Google Sheets API calls
    return await this.legacyService.executeFallbackAction(node, context)
  }

  private async executeSheetsUpdate(node: any, context: ExecutionContext) {
    console.log("✏️ Executing Google Sheets update")
    
    // Use legacy service for actual Google Sheets API calls
    return await this.legacyService.executeFallbackAction(node, context)
  }

  private async executeSheetsCreateSpreadsheet(node: any, context: ExecutionContext) {
    console.log("📋 Executing Google Sheets create spreadsheet")
    
    // Use legacy service for actual Google Sheets API calls
    return await this.legacyService.executeFallbackAction(node, context)
  }

  private async executeGoogleSheetsUnified(node: any, context: ExecutionContext) {
    console.log("📊 Executing Google Sheets unified action")
    
    // Use legacy service for actual Google Sheets API calls
    return await this.legacyService.executeFallbackAction(node, context)
  }

  // Google Docs implementations
  private async executeDocsCreate(node: any, context: ExecutionContext) {
    console.log("📝 Executing Google Docs create")
    
    // Use legacy service for actual Google Docs API calls
    return await this.legacyService.executeFallbackAction(node, context)
  }

  private async executeDocsRead(node: any, context: ExecutionContext) {
    console.log("📖 Executing Google Docs read")
    
    // Use legacy service for actual Google Docs API calls
    return await this.legacyService.executeFallbackAction(node, context)
  }

  private async executeDocsUpdate(node: any, context: ExecutionContext) {
    console.log("✏️ Executing Google Docs update")
    
    // Use legacy service for actual Google Docs API calls
    return await this.legacyService.executeFallbackAction(node, context)
  }

  // Google Calendar implementations
  private async executeCalendarCreateEvent(node: any, context: ExecutionContext) {
    console.log("📅 Executing Google Calendar create event")
    
    // Use legacy service for actual Google Calendar API calls
    return await this.legacyService.executeFallbackAction(node, context)
  }

  private async executeCalendarUpdateEvent(node: any, context: ExecutionContext) {
    console.log("📅 Executing Google Calendar update event")
    
    // Use legacy service for actual Google Calendar API calls
    return await this.legacyService.executeFallbackAction(node, context)
  }

  private async executeCalendarDeleteEvent(node: any, context: ExecutionContext) {
    console.log("📅 Executing Google Calendar delete event")
    
    // Use legacy service for actual Google Calendar API calls
    return await this.legacyService.executeFallbackAction(node, context)
  }

  private resolveValue(value: any, context: ExecutionContext): any {
    if (typeof value === 'string' && context.dataFlowManager) {
      return context.dataFlowManager.resolveVariable(value)
    }
    return value
  }
}