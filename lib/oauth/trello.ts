import { db } from "@/lib/db"
import { trelloIntegrationTable } from "@/lib/db/schema"
import { eq } from "drizzle-orm"

export async function getTrelloIntegration(userId: string) {
  try {
    const trelloIntegration = await db
      .select()
      .from(trelloIntegrationTable)
      .where(eq(trelloIntegrationTable.userId, userId))
    return trelloIntegration[0]
  } catch (error: any) {
    console.error("Error getting Trello integration:", error)
    return null
  }
}

export async function createTrelloIntegration(userId: string, accessToken: string, refreshToken: string) {
  try {
    await db.insert(trelloIntegrationTable).values({
      userId: userId,
      accessToken: accessToken,
      refreshToken: refreshToken,
    })
    return { success: true }
  } catch (error: any) {
    console.error("Error creating Trello integration:", error)
    return { success: false, error: error.message }
  }
}

export async function updateTrelloIntegration(userId: string, accessToken: string, refreshToken: string) {
  try {
    await db
      .update(trelloIntegrationTable)
      .set({ accessToken: accessToken, refreshToken: refreshToken })
      .where(eq(trelloIntegrationTable.userId, userId))
    return { success: true }
  } catch (error: any) {
    console.error("Error updating Trello integration:", error)
    return { success: false, error: error.message }
  }
}

export async function deleteTrelloIntegration(userId: string) {
  try {
    await db.delete(trelloIntegrationTable).where(eq(trelloIntegrationTable.userId, userId))
    return { success: true }
  } catch (error: any) {
    console.error("Error deleting Trello integration:", error)
    return { success: false, error: error.message }
  }
}
