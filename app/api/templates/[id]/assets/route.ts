import { Buffer } from "buffer"
import { NextResponse } from "next/server"
import { createSupabaseServiceClient } from "@/utils/supabase/server"
import { requireTemplateAccess } from "../helpers"

const TEMPLATE_ASSET_BUCKET = "template-assets"

async function ensureBucket(supabase: Awaited<ReturnType<typeof createSupabaseServiceClient>>) {
  const { data: buckets, error } = await supabase.storage.listBuckets()
  if (error) {
    console.error("[TemplateAssets] Failed to list buckets", error)
    throw new Error("Failed to prepare storage bucket")
  }

  const exists = buckets?.some((bucket) => bucket.name === TEMPLATE_ASSET_BUCKET)
  if (!exists) {
    const { error: createError } = await supabase.storage.createBucket(TEMPLATE_ASSET_BUCKET, {
      public: true,
      fileSizeLimit: 50 * 1024 * 1024, // 50MB
    })
    if (createError) {
      console.error("[TemplateAssets] Failed to create bucket", createError)
      throw new Error("Failed to prepare storage bucket")
    }
  }
}

export async function GET(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await context.params
    const { errorResponse } = await requireTemplateAccess(id)
    if (errorResponse) return errorResponse

    const supabase = await createSupabaseServiceClient()
    const { data: assets, error } = await supabase
      .from("template_assets")
      .select("*")
      .eq("template_id", id)
      .order("created_at", { ascending: false })

    if (error) {
      console.error("[TemplateAssets] Failed to list assets", error)
      return NextResponse.json({ error: "Failed to load assets" }, { status: 500 })
    }

    const sanitized = (assets || []).map((asset) => {
      const { data: publicUrlData } = supabase.storage
        .from(TEMPLATE_ASSET_BUCKET)
        .getPublicUrl(asset.storage_path)

      return {
        id: asset.id,
        name: asset.name,
        asset_type: asset.asset_type,
        mime_type: asset.mime_type,
        metadata: asset.metadata,
        created_at: asset.created_at,
        download_url: publicUrlData.publicUrl,
      }
    })

    return NextResponse.json({ assets: sanitized })
  } catch (error) {
    console.error("[TemplateAssets] Unexpected error listing assets", error)
    return NextResponse.json({ error: "Failed to load assets" }, { status: 500 })
  }
}

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await context.params
    const { user, errorResponse } = await requireTemplateAccess(id)
    if (errorResponse) return errorResponse

    const formData = await request.formData()
    const file = formData.get("file")
    const assetType = (formData.get("assetType") || "resource") as string
    const displayName = (formData.get("name") as string) || (file instanceof File ? file.name : undefined)

    if (!(file instanceof File)) {
      return NextResponse.json({ error: "File is required" }, { status: 400 })
    }

    if (!displayName) {
      return NextResponse.json({ error: "Asset name is required" }, { status: 400 })
    }

    const supabase = await createSupabaseServiceClient()
    await ensureBucket(supabase)

    const arrayBuffer = await file.arrayBuffer()
    const buffer = Buffer.from(arrayBuffer)
    const fileExt = file.name.split(".").pop() || "dat"
    const filePath = `${id}/${Date.now()}-${Math.random().toString(36).slice(2)}.${fileExt}`

    const { error: uploadError } = await supabase.storage
      .from(TEMPLATE_ASSET_BUCKET)
      .upload(filePath, buffer, {
        contentType: file.type || "application/octet-stream",
        upsert: false,
      })

    if (uploadError) {
      console.error("[TemplateAssets] Upload failed", uploadError)
      return NextResponse.json({ error: "Failed to upload file" }, { status: 500 })
    }

    const metadata = {
      originalName: file.name,
      size: file.size,
    }

    const { data: asset, error: insertError } = await supabase
      .from("template_assets")
      .insert({
        template_id: id,
        name: displayName,
        asset_type: assetType,
        storage_path: filePath,
        mime_type: file.type || "application/octet-stream",
        metadata,
        created_by: user.id,
      })
      .select("*")
      .single()

    if (insertError) {
      console.error("[TemplateAssets] Failed to save asset record", insertError)
      // Attempt cleanup
      await supabase.storage.from(TEMPLATE_ASSET_BUCKET).remove([filePath])
      return NextResponse.json({ error: "Failed to save asset record" }, { status: 500 })
    }

    const { data: publicUrl } = supabase.storage
      .from(TEMPLATE_ASSET_BUCKET)
      .getPublicUrl(filePath)

    return NextResponse.json({
      asset: {
        id: asset.id,
        name: asset.name,
        asset_type: asset.asset_type,
        mime_type: asset.mime_type,
        metadata: asset.metadata,
        created_at: asset.created_at,
        download_url: publicUrl.publicUrl,
      },
      message: "Asset uploaded",
    })
  } catch (error) {
    console.error("[TemplateAssets] Unexpected error uploading asset", error)
    return NextResponse.json({ error: "Failed to upload asset" }, { status: 500 })
  }
}

export async function DELETE(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await context.params
    const { searchParams } = new URL(request.url)
    const assetId = searchParams.get("assetId")

    if (!assetId) {
      return NextResponse.json({ error: "assetId is required" }, { status: 400 })
    }

    const { errorResponse } = await requireTemplateAccess(id)
    if (errorResponse) return errorResponse

    const supabase = await createSupabaseServiceClient()
    const { data: asset, error: fetchError } = await supabase
      .from("template_assets")
      .select("*")
      .eq("id", assetId)
      .eq("template_id", id)
      .maybeSingle()

    if (fetchError) {
      console.error("[TemplateAssets] Failed to fetch asset", fetchError)
      return NextResponse.json({ error: "Failed to load asset" }, { status: 500 })
    }

    if (!asset) {
      return NextResponse.json({ error: "Asset not found" }, { status: 404 })
    }

    const { error: deleteError } = await supabase
      .from("template_assets")
      .delete()
      .eq("id", assetId)

    if (deleteError) {
      console.error("[TemplateAssets] Failed to delete asset record", deleteError)
      return NextResponse.json({ error: "Failed to delete asset" }, { status: 500 })
    }

    const { error: storageError } = await supabase.storage
      .from(TEMPLATE_ASSET_BUCKET)
      .remove([asset.storage_path])

    if (storageError) {
      console.error("[TemplateAssets] Failed to remove storage file", storageError)
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error("[TemplateAssets] Unexpected error deleting asset", error)
    return NextResponse.json({ error: "Failed to delete asset" }, { status: 500 })
  }
}
