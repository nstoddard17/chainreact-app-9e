import { ExecutionContext } from "@/lib/workflows/types/execution"

// Existing actions
export * from "./createPage"
export * from "./createNotebook"
export * from "./createSection"
export * from "./updatePage"
export * from "./getPageContent"
export * from "./getPages"
export * from "./copyPage"
export * from "./search"
export * from "./deletePage"

// New actions
export * from "./deleteSection"
export * from "./deleteNotebook"
export * from "./createNoteFromUrl"
export * from "./createQuickNote"
export * from "./createImageNote"
export * from "./listNotebooks"
export * from "./listSections"
export * from "./getNotebookDetails"
export * from "./getSectionDetails"