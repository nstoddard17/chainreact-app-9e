import { google, drive_v3 } from "googleapis"

import { logger } from '@/lib/utils/logger'

export async function getGoogleDriveFiles(
  accessToken: string,
  folderId?: string,
) {
  const oauth2Client = new google.auth.OAuth2()
  oauth2Client.setCredentials({ access_token: accessToken })

  const drive = google.drive({ version: "v3", auth: oauth2Client })

  try {
    const query = folderId
      ? `'${folderId}' in parents`
      : "'root' in parents"

    const response = await drive.files.list({
      q: query,
      fields: "files(id, name, mimeType)",
      pageSize: 200,
    })

    const files =
      response.data.files?.map((file: drive_v3.Schema$File) => ({
        id: file.id,
        name: file.name,
        type:
          file.mimeType === "application/vnd.google-apps.folder"
            ? "folder"
            : "file",
      })) || []

    return files
  } catch (error) {
    logger.error("Failed to get Google Drive files:", error)
    throw new Error("Failed to get Google Drive files")
  }
}
