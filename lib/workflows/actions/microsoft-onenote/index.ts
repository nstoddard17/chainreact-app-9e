// Existing actions
export * from "./createPage"
export * from "./createNotebook"
export * from "./createSection"
export * from "./updatePage"
export * from "./getPageContent"
export * from "./getPages"
export * from "./copyPage"
export * from "./deletePage"

// New actions
// NOTE: deleteSection and deleteNotebook are NOT supported by Microsoft Graph API
// See: https://learn.microsoft.com/en-us/graph/api/resources/onenotesection
export * from "./createNoteFromUrl"
export * from "./createImageNote"
export * from "./listNotebooks"
export * from "./listSections"
export * from "./getNotebookDetails"
export * from "./getSectionDetails"