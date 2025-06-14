// Utility functions for global data preloading

export interface DataTypeConfig {
  provider: string
  dataType: string
  priority: number // 1 = high, 2 = medium, 3 = low
}

// Define all possible dynamic data types with priorities
export const getAllDynamicDataTypes = (): DataTypeConfig[] => {
  return [
    // High priority - commonly used
    { provider: "slack", dataType: "channels", priority: 1 },
    { provider: "notion", dataType: "pages", priority: 1 },
    { provider: "notion", dataType: "databases", priority: 1 },
    { provider: "google-sheets", dataType: "spreadsheets", priority: 1 },
    { provider: "google-calendar", dataType: "calendars", priority: 1 },

    // Medium priority
    { provider: "slack", dataType: "users", priority: 2 },
    { provider: "discord", dataType: "channels", priority: 2 },
    { provider: "google-drive", dataType: "folders", priority: 2 },
    { provider: "airtable", dataType: "bases", priority: 2 },
    { provider: "trello", dataType: "boards", priority: 2 },
    { provider: "github", dataType: "repositories", priority: 2 },

    // Lower priority
    { provider: "hubspot", dataType: "pipelines", priority: 3 },
    { provider: "teams", dataType: "teams", priority: 3 },
    { provider: "mailchimp", dataType: "lists", priority: 3 },
  ]
}

export const getPreloadBatches = (dataTypes: DataTypeConfig[]): DataTypeConfig[][] => {
  // Sort by priority
  const sorted = [...dataTypes].sort((a, b) => a.priority - b.priority)

  // Group into batches by priority
  const batches: DataTypeConfig[][] = []
  let currentBatch: DataTypeConfig[] = []
  let currentPriority = 0

  for (const dataType of sorted) {
    if (dataType.priority !== currentPriority) {
      if (currentBatch.length > 0) {
        batches.push(currentBatch)
      }
      currentBatch = [dataType]
      currentPriority = dataType.priority
    } else {
      currentBatch.push(dataType)
    }
  }

  if (currentBatch.length > 0) {
    batches.push(currentBatch)
  }

  return batches
}
