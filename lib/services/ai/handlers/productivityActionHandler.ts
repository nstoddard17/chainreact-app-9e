import { BaseActionHandler } from "./baseActionHandler"
import { IntentAnalysisResult, Integration } from "../aiIntentAnalysisService"
import { ActionExecutionResult } from "../aiActionExecutionService"
import { runWorkflowAction } from "../utils/runWorkflowAction"

export class ProductivityActionHandler extends BaseActionHandler {
  constructor(private readonly executeAction = runWorkflowAction) {
    super()
  }

  async handleQuery(
    intent: IntentAnalysisResult,
    integrations: Integration[],
    userId: string,
    supabaseAdmin: any
  ): Promise<ActionExecutionResult> {
    this.logHandlerStart("Productivity", intent)

    const productivityIntegrations = this.filterIntegrationsByProvider(integrations, [
      "notion", "trello", "airtable", "microsoft-onenote"
    ])
    this.logIntegrationsFound("Productivity", productivityIntegrations)

    if (productivityIntegrations.length === 0) {
      return this.getNoIntegrationsResponse("productivity", "Notion, Trello, Airtable, or OneNote")
    }

    try {
      const action = intent.action || "list_records"
      const parameters = intent.parameters || {}
      const requestedProvider = parameters.provider || intent.specifiedIntegration
      const integration = this.getPreferredIntegration(productivityIntegrations, requestedProvider)

      if (!integration) {
        return this.getErrorResponse("No compatible productivity integration is connected.")
      }

      switch (integration.provider) {
        case "airtable":
          if (action === "list_records" || action === "get_records") {
            return this.handleAirtableListRecords(parameters, [integration], userId)
          }
          return this.getErrorResponse(`Airtable query "${action}" is not supported yet.`)
        case "notion":
          return this.handleNotionQuery(action, parameters, userId)
        case "trello":
          return this.handleTrelloQuery(action, parameters, userId)
        case "microsoft-onenote":
          return this.handleOnenoteQuery(action, parameters, userId)
        default:
          return this.getErrorResponse(`Productivity provider "${integration.provider}" is not supported yet.`)
      }

    } catch (error: any) {
      console.error("❌ Productivity query error:", error)
      return this.getErrorResponse("Failed to fetch productivity data.")
    }
  }

  async handleAction(
    intent: IntentAnalysisResult,
    integrations: Integration[],
    userId: string,
    supabaseAdmin: any
  ): Promise<ActionExecutionResult> {
    this.logHandlerStart("Productivity Action", intent)

    const productivityIntegrations = this.filterIntegrationsByProvider(integrations, [
      "notion", "trello", "airtable", "microsoft-onenote"
    ])
    this.logIntegrationsFound("Productivity", productivityIntegrations)

    if (productivityIntegrations.length === 0) {
      return this.getNoIntegrationsResponse("productivity", "Notion, Trello, Airtable, or OneNote")
    }

    try {
      const action = intent.action || "create_record"
      const parameters = intent.parameters || {}
      const requestedProvider = parameters.provider || intent.specifiedIntegration
      const integration = this.getPreferredIntegration(productivityIntegrations, requestedProvider)

      if (!integration) {
        return this.getErrorResponse("No compatible productivity integration is connected.")
      }

      switch (integration.provider) {
        case "airtable":
          if (action === "create_record") {
            return this.handleAirtableCreateRecord(parameters, [integration], userId)
          }
          return this.getErrorResponse(`Airtable action "${action}" is not supported yet.`)
        case "notion":
          return this.handleNotionAction(action, parameters, userId)
        case "trello":
          return this.handleTrelloAction(action, parameters, userId)
        case "microsoft-onenote":
          return this.handleOnenoteAction(action, parameters, userId)
        default:
          return this.getErrorResponse(`Productivity provider "${integration.provider}" is not supported yet.`)
      }

    } catch (error: any) {
      console.error("❌ Productivity action error:", error)
      return this.getErrorResponse("Failed to perform the productivity action.")
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

  private async handleAirtableListRecords(
    parameters: any,
    integrations: Integration[],
    userId: string
  ): Promise<ActionExecutionResult> {
    const integration = this.getPreferredIntegration(integrations, parameters.provider)
    if (!integration || integration.provider !== "airtable") {
      return this.getErrorResponse("Listing records currently supports Airtable connections.")
    }

    const baseId = parameters.baseId || parameters.base
    const tableName = parameters.tableName || parameters.table

    if (!baseId || !tableName) {
      return this.getErrorResponse("Provide the Airtable base ID and table name.")
    }

    const result = await this.executeAction(
      userId,
      "airtable_action_list_records",
      {
        baseId,
        tableName,
        maxRecords: Math.min(Number(parameters.limit || 50), 100),
        filterByFormula: parameters.filter
      }
    )

    if (!result.success) {
      return this.getErrorResponse(result.message || "Failed to fetch Airtable records.")
    }

    return this.getSuccessResponse(
      `Fetched ${result.output?.records?.length || 0} record${(result.output?.records?.length || 0) === 1 ? "" : "s"} from ${tableName}.`,
      {
        type: "productivity_query",
        provider: "airtable",
        baseId,
        tableName,
        records: result.output?.records || []
      }
    )
  }

  private async handleAirtableCreateRecord(
    parameters: any,
    integrations: Integration[],
    userId: string
  ): Promise<ActionExecutionResult> {
    const integration = this.getPreferredIntegration(integrations, parameters.provider)
    if (!integration || integration.provider !== "airtable") {
      return this.getErrorResponse("Creating records currently supports Airtable connections.")
    }

    const baseId = parameters.baseId || parameters.base
    const tableName = parameters.tableName || parameters.table
    const fields = parameters.fields || parameters.record

    if (!baseId || !tableName || !fields) {
      return this.getErrorResponse("Provide the Airtable base ID, table name, and fields for the record.")
    }

    const result = await this.executeAction(
      userId,
      "airtable_action_create_record",
      {
        baseId,
        tableName,
        fields
      }
    )

    if (!result.success) {
      return this.getErrorResponse(result.message || "Failed to create the Airtable record.")
    }

    return this.getSuccessResponse(
      `Created new record in ${tableName}.`,
      {
        type: "productivity_action",
        provider: "airtable",
        baseId,
        tableName,
      record: result.output?.record || {}
      }
    )
  }

  private async handleNotionQuery(
    action: string,
    parameters: any,
    userId: string
  ): Promise<ActionExecutionResult> {
    if (action === "query_database" || parameters.databaseId || parameters.database_id) {
      const databaseId = parameters.databaseId || parameters.database_id
      if (!databaseId) {
        return this.getErrorResponse("Please provide the Notion database ID to query.")
      }

      const result = await this.executeAction(
        userId,
        "notion_action_query_database",
        {
          database_id: databaseId,
          filter: parameters.filter,
          sorts: parameters.sorts,
          page_size: parameters.limit,
          start_cursor: parameters.cursor
        }
      )

      if (!result.success) {
        return this.getErrorResponse(result.message || "Failed to query the Notion database.")
      }

      return this.getSuccessResponse(
        `Queried Notion database ${databaseId}.`,
        {
          type: "productivity_query",
          provider: "notion",
          databaseId,
          results: result.output?.results || result.output
        }
      )
    }

    const result = await this.executeAction(
      userId,
      "notion_action_search",
      {
        query: parameters.query,
        filter: parameters.filter,
        sort: parameters.sort,
        page_size: parameters.limit
      }
    )

    if (!result.success) {
      return this.getErrorResponse(result.message || "Failed to search Notion.")
    }

    return this.getSuccessResponse(
      `Found ${result.output?.results?.length || 0} Notion item${(result.output?.results?.length || 0) === 1 ? "" : "s"}.`,
      {
        type: "productivity_query",
        provider: "notion",
        results: result.output?.results || result.output
      }
    )
  }

  private async handleNotionAction(
    action: string,
    parameters: any,
    userId: string
  ): Promise<ActionExecutionResult> {
    if (action !== "create_page") {
      return this.getErrorResponse(`Notion action "${action}" is not supported yet.`)
    }

    const databaseId = parameters.databaseId || parameters.database_id
    const parentPageId = parameters.parentPageId || parameters.parent_page_id
    const parentType = parameters.parentType || (databaseId ? "database" : parentPageId ? "page" : undefined)

    if (!parentType) {
      return this.getErrorResponse("Specify a Notion database or parent page to create the page in.")
    }

    const title = parameters.title || parameters.name
    if (!title) {
      return this.getErrorResponse("Provide a title for the new Notion page.")
    }

    const result = await this.executeAction(
      userId,
      "notion_action_create_page",
      {
        parent_type: parentType,
        database_id: databaseId,
        parent_page_id: parentPageId,
        title,
        properties: parameters.properties,
        icon_type: parameters.iconType,
        icon_emoji: parameters.iconEmoji,
        icon_url: parameters.iconUrl,
        cover_type: parameters.coverType,
        cover_url: parameters.coverUrl,
        content_blocks: parameters.contentBlocks || parameters.blocks
      }
    )

    if (!result.success) {
      return this.getErrorResponse(result.message || "Failed to create the Notion page.")
    }

    return this.getSuccessResponse(
      "Created Notion page successfully.",
      {
        type: "productivity_action",
        provider: "notion",
        page: result.output
      }
    )
  }

  private async handleTrelloQuery(
    action: string,
    parameters: any,
    userId: string
  ): Promise<ActionExecutionResult> {
    const boardId = parameters.boardId || parameters.board_id
    if (!boardId) {
      return this.getErrorResponse("Please provide the Trello board ID.")
    }

    const result = await this.executeAction(
      userId,
      "trello_action_get_cards",
      {
        boardId,
        listId: parameters.listId || parameters.list_id,
        filter: parameters.filter,
        limit: parameters.limit
      }
    )

    if (!result.success) {
      return this.getErrorResponse(result.message || "Failed to fetch Trello cards.")
    }

    return this.getSuccessResponse(
      `Retrieved ${result.output?.count || 0} card${(result.output?.count || 0) === 1 ? "" : "s"} from Trello.`,
      {
        type: "productivity_query",
        provider: "trello",
        boardId,
        listId: parameters.listId || parameters.list_id,
        cards: result.output?.cards || []
      }
    )
  }

  private async handleTrelloAction(
    action: string,
    parameters: any,
    userId: string
  ): Promise<ActionExecutionResult> {
    if (action !== "create_card") {
      return this.getErrorResponse(`Trello action "${action}" is not supported yet.`)
    }

    const boardId = parameters.boardId || parameters.board_id
    const listId = parameters.listId || parameters.list_id
    const name = parameters.name || parameters.title

    if (!boardId || !listId || !name) {
      return this.getErrorResponse("Provide the board ID, list ID, and card name to create a Trello card.")
    }

    const result = await this.executeAction(
      userId,
      "trello_action_create_card",
      {
        boardId,
        listId,
        name,
        desc: parameters.description,
        due: parameters.due,
        start: parameters.start,
        idMembers: parameters.members,
        idLabels: parameters.labels,
        attachment: parameters.attachment,
        pos: parameters.position
      }
    )

    if (!result.success) {
      return this.getErrorResponse(result.message || "Failed to create the Trello card.")
    }

    return this.getSuccessResponse(
      "Created Trello card successfully.",
      {
        type: "productivity_action",
        provider: "trello",
        card: result.output?.card || result.output
      }
    )
  }

  private async handleOnenoteQuery(
    action: string,
    parameters: any,
    userId: string
  ): Promise<ActionExecutionResult> {
    if (action !== "list_records" && action !== "get_pages") {
      return this.getErrorResponse(`OneNote query "${action}" is not supported yet.`)
    }

    const result = await this.executeAction(
      userId,
      "microsoft-onenote_action_get_pages",
      {
        notebookId: parameters.notebookId || parameters.notebook_id,
        sectionId: parameters.sectionId || parameters.section_id,
        filter: parameters.filter,
        orderBy: parameters.orderBy,
        top: parameters.limit
      }
    )

    if (!result.success) {
      return this.getErrorResponse(result.message || "Failed to retrieve OneNote pages.")
    }

    return this.getSuccessResponse(
      `Retrieved ${result.output?.pages?.length || 0} OneNote page${(result.output?.pages?.length || 0) === 1 ? "" : "s"}.`,
      {
        type: "productivity_query",
        provider: "microsoft-onenote",
        pages: result.output?.pages || result.output
      }
    )
  }

  private async handleOnenoteAction(
    action: string,
    parameters: any,
    userId: string
  ): Promise<ActionExecutionResult> {
    if (action !== "create_page") {
      return this.getErrorResponse(`OneNote action "${action}" is not supported yet.`)
    }

    const title = parameters.title || parameters.name
    if (!title) {
      return this.getErrorResponse("Provide a title for the OneNote page.")
    }

    const result = await this.executeAction(
      userId,
      "microsoft-onenote_action_create_page",
      {
        notebookId: parameters.notebookId || parameters.notebook_id,
        sectionId: parameters.sectionId || parameters.section_id,
        title,
        content: parameters.content,
        contentType: parameters.contentType
      }
    )

    if (!result.success) {
      return this.getErrorResponse(result.message || "Failed to create the OneNote page.")
    }

    return this.getSuccessResponse(
      "Created OneNote page successfully.",
      {
        type: "productivity_action",
        provider: "microsoft-onenote",
        page: result.output?.data || result.output
      }
    )
  }
}
