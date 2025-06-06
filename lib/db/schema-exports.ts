// Define and export the users schema
export const users = {
  tableName: "users",
  columns: {
    id: "id",
    email: "email",
    name: "name",
    created_at: "created_at",
    updated_at: "updated_at",
  },
}

// Define and export the trelloIntegrationTable schema
export const trelloIntegrationTable = {
  tableName: "trello_integrations",
  columns: {
    id: "id",
    user_id: "user_id",
    token: "token",
    token_secret: "token_secret",
    created_at: "created_at",
    updated_at: "updated_at",
  },
}
