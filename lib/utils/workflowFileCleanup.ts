import { createAdminClient } from '@/lib/supabase/admin'

const WORKFLOW_FILES_BUCKET = 'workflow-files'

export async function deleteWorkflowTempFiles(paths: Iterable<string>): Promise<void> {
  const uniquePaths = Array.from(new Set(Array.from(paths).filter((path): path is string => Boolean(path))))
  if (!uniquePaths.length) return

  try {
    const supabase = createAdminClient()
    const { error } = await supabase.storage.from(WORKFLOW_FILES_BUCKET).remove(uniquePaths)

    if (error) {
      console.error('❌ [WorkflowFileCleanup] Failed to delete temp files:', error)
    }
  } catch (error) {
    console.error('❌ [WorkflowFileCleanup] Error removing temp files:', error)
  }
}
