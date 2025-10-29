import Link from "next/link"
import { redirect } from "next/navigation"

import { Button } from "@/components/ui/button"
import { instantiateTemplate, listTemplates } from "@/src/lib/workflows/builder/templates"
import { resolveDefaultWorkspaceId } from "@/src/lib/workflows/builder/workspace"
import { createSupabaseServerActionClient, createSupabaseServerClient } from "@/utils/supabase/server"

interface TemplateRow {
  id: string
  name: string
  description: string | null
  tags: string[] | null
  thumbnail_url: string | null
  flow_id: string
  revision_id: string
  created_at: string
}

export default async function TemplatesPage() {
  const supabase = await createSupabaseServerClient()
  const { data } = await supabase.auth.getUser()
  if (!data?.user) {
    redirect("/auth/login")
  }

  const templates = (await listTemplates(undefined, supabase)) as TemplateRow[]

  async function useTemplate(formData: FormData) {
    "use server"

    const supabase = await createSupabaseServerActionClient()
    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser()

    if (userError || !user) {
      throw new Error("Authentication required")
    }

    const templateId = formData.get("templateId")?.toString()
    if (!templateId) {
      return
    }
    const name = formData.get("name")?.toString()

    const { data: templateMeta, error } = await supabase
      .from("flow_v2_templates")
      .select("workspace_id")
      .eq("id", templateId)
      .maybeSingle()

    if (error) {
      throw new Error(error.message)
    }

    const defaultWorkspace = await resolveDefaultWorkspaceId(supabase, user.id)
    const workspaceId = templateMeta?.workspace_id ?? defaultWorkspace?.workspaceId ?? null

    const result = await instantiateTemplate({
      templateId,
      name,
      workspaceId: workspaceId ?? undefined,
      createdBy: user.id,
      client: supabase,
    })
    redirect(`/workflows/v2/${result.flowId}`)
  }

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-6 p-8">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Flow v2 Templates</h1>
          <p className="text-muted-foreground">Save and reuse Kadabra-style workflows</p>
        </div>
        <Link href="/workflows/v2">
          <Button variant="outline">Back to flows</Button>
        </Link>
      </div>

      <div className="grid gap-4">
        {templates.map((template) => (
          <form
            key={template.id}
            action={useTemplate}
            className="flex items-center justify-between rounded-md border bg-card p-4"
          >
            <div>
              <h2 className="text-lg font-medium">{template.name}</h2>
              {template.description && (
                <p className="text-sm text-muted-foreground">{template.description}</p>
              )}
              {template.tags && template.tags.length > 0 && (
                <div className="mt-2 flex flex-wrap gap-2 text-xs text-muted-foreground">
                  {template.tags.map((tag) => (
                    <span key={tag} className="rounded-full bg-muted px-2 py-1">{tag}</span>
                  ))}
                </div>
              )}
            </div>
            <input type="hidden" name="templateId" value={template.id} />
            <Button type="submit">Use template</Button>
          </form>
        ))}
        {templates.length === 0 && (
          <div className="rounded-md border border-dashed p-8 text-center text-muted-foreground">
            No templates yet. Open a flow and choose “Save as template” to add one.
          </div>
        )}
      </div>
    </div>
  )
}
