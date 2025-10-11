import { google, drive_v3 } from "googleapis"
import { BaseActionHandler } from "./baseActionHandler"
import { IntentAnalysisResult, Integration } from "../aiIntentAnalysisService"
import { ActionExecutionResult } from "../aiActionExecutionService"
import { getDecryptedAccessToken } from "@/lib/integrations/getDecryptedAccessToken"
import { runWorkflowAction } from "../utils/runWorkflowAction"

export class FileActionHandler extends BaseActionHandler {
  constructor(private readonly executeAction = runWorkflowAction) {
    super()
  }
  async handleQuery(
    intent: IntentAnalysisResult,
    integrations: Integration[],
    userId: string,
    supabaseAdmin: any
  ): Promise<ActionExecutionResult> {
    this.logHandlerStart("File", intent)

    const fileIntegrations = this.filterIntegrationsByProvider(integrations, [
      "google-drive", "microsoft-onedrive", "dropbox", "box"
    ])
    this.logIntegrationsFound("File", fileIntegrations)

    if (fileIntegrations.length === 0) {
      return this.getNoIntegrationsResponse("file storage", "Google Drive, OneDrive, Dropbox, or Box")
    }

    try {
      const action = intent.action || "search_files"
      const parameters = intent.parameters || {}
      const requestedProvider = parameters.provider || intent.specifiedIntegration
      const integration = this.getPreferredIntegration(fileIntegrations, requestedProvider)

      if (!integration) {
        return this.getErrorResponse("No compatible file integration is connected.")
      }

      switch (integration.provider) {
        case "google-drive":
          switch (action) {
            case "search_files":
            case "find_files":
              return this.handleSearchFiles(parameters, fileIntegrations, userId)
            case "list_files":
              return this.handleListFiles(parameters, fileIntegrations, userId)
            default:
              return this.getErrorResponse(`File query "${action}" is not supported yet.`)
          }
        case "dropbox":
          return this.handleDropboxGetFile(parameters, userId)
        case "microsoft-onedrive":
          return this.handleOnedriveGetFile(parameters, userId)
        default:
          return this.getErrorResponse(`File provider "${integration.provider}" is not supported yet.`)
      }
    } catch (error: any) {
      console.error("❌ File query error:", error)
      return this.getErrorResponse("Failed to fetch files. Please try again.")
    }
  }

  async handleAction(
    intent: IntentAnalysisResult,
    integrations: Integration[],
    userId: string,
    supabaseAdmin: any
  ): Promise<ActionExecutionResult> {
    this.logHandlerStart("File Action", intent)

    const fileIntegrations = this.filterIntegrationsByProvider(integrations, [
      "google-drive", "microsoft-onedrive", "dropbox", "box"
    ])
    this.logIntegrationsFound("File", fileIntegrations)

    if (fileIntegrations.length === 0) {
      return this.getNoIntegrationsResponse("file storage", "Google Drive, OneDrive, Dropbox, or Box")
    }

    try {
      const action = intent.action || "upload_file"
      const parameters = intent.parameters || {}
      const requestedProvider = parameters.provider || intent.specifiedIntegration
      const integration = this.getPreferredIntegration(fileIntegrations, requestedProvider)

      if (!integration) {
        return this.getErrorResponse("No compatible file integration is connected.")
      }

      switch (integration.provider) {
        case "google-drive":
          switch (action) {
            case "upload_file":
              return this.handleUploadFile(parameters, fileIntegrations, userId)
            case "share_file":
              return this.handleShareFile(parameters, fileIntegrations, userId)
            default:
              return this.getErrorResponse(`File action "${action}" is not supported yet.`)
          }
        case "dropbox":
          if (action === "share_file") {
            return this.getErrorResponse("Sharing files is not yet supported for Dropbox.")
          }
          return this.handleDropboxUploadFile(parameters, userId)
        case "microsoft-onedrive":
          if (action === "share_file") {
            return this.getErrorResponse("Sharing files is not yet supported for OneDrive.")
          }
          return this.handleOnedriveUploadFile(parameters, userId)
        default:
          return this.getErrorResponse(`File provider "${integration.provider}" is not supported yet.`)
      }
    } catch (error: any) {
      console.error("❌ File action error:", error)
      return this.getErrorResponse("Failed to complete the file operation.")
    }
  }

  private getPreferredIntegration(
    integrations: Integration[],
    specified?: string
  ): Integration | null {
    if (specified) {
      const match = integrations.find(i => i.provider === specified)
      if (match) return match
    }
    return integrations[0] || null
  }

  private async handleSearchFiles(
    parameters: any,
    integrations: Integration[],
    userId: string
  ): Promise<ActionExecutionResult> {
    const integration = this.getPreferredIntegration(integrations, parameters.provider)
    if (!integration || integration.provider !== "google-drive") {
      return this.getErrorResponse("File search currently supports Google Drive connections.")
    }

    const drive = await this.getDriveClient(userId)
    const query = parameters.query || parameters.search || "name contains ''"

    const response = await drive.files.list({
      q: query,
      pageSize: Number(parameters.limit || 25),
      fields: "files(id, name, mimeType, modifiedTime, webViewLink, parents)"
    })

    const files = response.data.files || []

    return this.getSuccessResponse(
      `Found ${files.length} file${files.length === 1 ? "" : "s"} matching "${query}".`,
      {
        type: "file_query",
        provider: "google-drive",
        query,
        files
      }
    )
  }

  private async handleListFiles(
    parameters: any,
    integrations: Integration[],
    userId: string
  ): Promise<ActionExecutionResult> {
    const integration = this.getPreferredIntegration(integrations, parameters.provider)
    if (!integration || integration.provider !== "google-drive") {
      return this.getErrorResponse("Listing files currently supports Google Drive connections.")
    }

    const drive = await this.getDriveClient(userId)
    const parent = parameters.folderId || parameters.parentId

    const query = parent ? `'${parent}' in parents` : undefined

    const response = await drive.files.list({
      q: query,
      pageSize: Number(parameters.limit || 50),
      fields: "files(id, name, mimeType, modifiedTime, webViewLink, parents)"
    })

    const files = response.data.files || []

    return this.getSuccessResponse(
      `Listed ${files.length} file${files.length === 1 ? "" : "s"}${parent ? ` inside folder ${parent}` : ""}.`,
      {
        type: "file_query",
        provider: "google-drive",
        parent,
        files
      }
    )
  }

  private async handleDropboxGetFile(
    parameters: any,
    userId: string
  ): Promise<ActionExecutionResult> {
    const filePath = parameters.filePath || parameters.path
    if (!filePath) {
      return this.getErrorResponse("Provide the Dropbox file path you want to retrieve.")
    }

    const result = await this.executeAction(
      userId,
      "dropbox_action_get_file",
      {
        filePath,
        downloadContent: parameters.downloadContent !== false
      }
    )

    if (!result.success) {
      return this.getErrorResponse(result.message || "Failed to retrieve the Dropbox file.")
    }

    return this.getSuccessResponse(
      `Retrieved Dropbox file at ${filePath}.`,
      {
        type: "file_query",
        provider: "dropbox",
        file: result.output
      }
    )
  }

  private async handleOnedriveGetFile(
    parameters: any,
    userId: string
  ): Promise<ActionExecutionResult> {
    const fileId = parameters.fileId || parameters.id
    if (!fileId) {
      return this.getErrorResponse("Provide the OneDrive file ID you want to retrieve.")
    }

    const result = await this.executeAction(
      userId,
      "onedrive_action_get_file",
      {
        fileId,
        downloadContent: parameters.downloadContent !== false
      }
    )

    if (!result.success) {
      return this.getErrorResponse(result.message || "Failed to retrieve the OneDrive file.")
    }

    return this.getSuccessResponse(
      `Retrieved OneDrive file ${fileId}.`,
      {
        type: "file_query",
        provider: "microsoft-onedrive",
        file: result.output
      }
    )
  }

  private async handleUploadFile(
    parameters: any,
    integrations: Integration[],
    userId: string
  ): Promise<ActionExecutionResult> {
    const integration = this.getPreferredIntegration(integrations, parameters.provider)
    if (!integration || integration.provider !== "google-drive") {
      return this.getErrorResponse("Uploading files currently supports Google Drive connections.")
    }

    if (!parameters.file && !parameters.fileId && !parameters.fileContent) {
      return this.getErrorResponse("Provide a file reference or content to upload.")
    }

    const config: Record<string, any> = {
      parentFolderId: parameters.folderId || parameters.parentId,
      fileName: parameters.fileName,
      mimeType: parameters.mimeType,
      fileContent: parameters.fileContent,
      file: parameters.file,
      fileId: parameters.fileId
    }

    const result = await this.executeAction(
      userId,
      "google_drive_action_upload_file",
      config
    )

    if (!result.success) {
      return this.getErrorResponse(result.message || "Failed to upload the file.")
    }

    return this.getSuccessResponse(
      `Uploaded file ${result.output?.file?.name || parameters.fileName || "unnamed file"}.`,
      {
        type: "file_action",
        provider: "google-drive",
        file: result.output?.file
      }
    )
  }

  private async handleDropboxUploadFile(
    parameters: any,
    userId: string
  ): Promise<ActionExecutionResult> {
    const fileName = parameters.fileName || parameters.name || "uploaded-file"

    const sourceType = parameters.sourceType ||
      (parameters.fileContent ? "text" : parameters.fileUrl ? "url" : parameters.fileFromNode ? "node" : "file")

    const result = await this.executeAction(
      userId,
      "dropbox_action_upload_file",
      {
        fileName,
        sourceType,
        path: parameters.path || parameters.folderPath,
        uploadedFiles: parameters.uploadedFiles || parameters.files || parameters.file,
        fileUrl: parameters.fileUrl,
        fileContent: parameters.fileContent,
        fileFromNode: parameters.fileFromNode
      }
    )

    if (!result.success) {
      return this.getErrorResponse(result.message || "Failed to upload the Dropbox file.")
    }

    return this.getSuccessResponse(
      `Uploaded file ${fileName} to Dropbox.`,
      {
        type: "file_action",
        provider: "dropbox",
        file: result.output?.file || result.output
      }
    )
  }

  private async handleOnedriveUploadFile(
    parameters: any,
    userId: string
  ): Promise<ActionExecutionResult> {
    const sourceType = parameters.sourceType ||
      (parameters.fileContent ? "text" : parameters.fileUrl ? "url" : parameters.fileFromNode ? "node" : "file")

    const result = await this.executeAction(
      userId,
      "onedrive_action_upload_file",
      {
        sourceType,
        folderId: parameters.folderId || parameters.parentId,
        fileName: parameters.fileName || parameters.name,
        uploadedFiles: parameters.uploadedFiles || parameters.files || parameters.file,
        fileUrl: parameters.fileUrl,
        fileContent: parameters.fileContent,
        fileFromNode: parameters.fileFromNode
      }
    )

    if (!result.success) {
      return this.getErrorResponse(result.message || "Failed to upload the OneDrive file.")
    }

    return this.getSuccessResponse(
      `Uploaded file ${parameters.fileName || "file"} to OneDrive.`,
      {
        type: "file_action",
        provider: "microsoft-onedrive",
        file: result.output?.file || result.output
      }
    )
  }

  private async handleShareFile(
    parameters: any,
    integrations: Integration[],
    userId: string
  ): Promise<ActionExecutionResult> {
    const integration = this.getPreferredIntegration(integrations, parameters.provider)
    if (!integration || integration.provider !== "google-drive") {
      return this.getErrorResponse("Sharing files currently supports Google Drive connections.")
    }

    const fileId = parameters.fileId || parameters.id
    const email = parameters.email || parameters.recipient

    if (!fileId || !email) {
      return this.getErrorResponse("Provide both a file ID and the recipient email to share.")
    }

    const drive = await this.getDriveClient(userId)

    await drive.permissions.create({
      fileId,
      requestBody: {
        type: "user",
        role: parameters.role || "writer",
        emailAddress: email
      },
      sendNotificationEmail: Boolean(parameters.notify ?? true)
    })

    const file = await drive.files.get({
      fileId,
      fields: "id, name, webViewLink"
    })

    return this.getSuccessResponse(
      `Shared ${file.data.name || "the file"} with ${email}.`,
      {
        type: "file_action",
        provider: "google-drive",
        fileId,
        sharedWith: email,
        link: file.data.webViewLink
      }
    )
  }

  private async getDriveClient(userId: string): Promise<drive_v3.Drive> {
    const accessToken = await getDecryptedAccessToken(userId, "google-drive")
    const auth = new google.auth.OAuth2()
    auth.setCredentials({ access_token: accessToken })
    return google.drive({ version: "v3", auth })
  }
}
