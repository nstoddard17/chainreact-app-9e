"use client"

import { create } from "zustand"
import { getSupabaseClient } from "@/lib/supabase"

interface WorkflowTemplate {
  id: string
  name: string
  description?: string
  category?: string
  tags: string[]
  nodes: any[]
  connections: any[]
  variables: any
  configuration: any
  author_id: string
  organization_id?: string
  is_public: boolean
  is_featured: boolean
  version: string
  downloads_count: number
  rating_average: number
  rating_count: number
  thumbnail_url?: string
  created_at: string
  updated_at: string
  author?: {
    email: string
    user_metadata?: any
  }
}

interface TemplateReview {
  id: string
  template_id: string
  user_id: string
  rating: number
  review_text?: string
  created_at: string
  updated_at: string
  user?: {
    email: string
    user_metadata?: any
  }
}

interface TemplateState {
  templates: WorkflowTemplate[]
  myTemplates: WorkflowTemplate[]
  featuredTemplates: WorkflowTemplate[]
  reviews: TemplateReview[]
  categories: string[]
  loading: boolean
  error: string | null
  searchQuery: string
  selectedCategory: string | null
}

interface TemplateActions {
  fetchPublicTemplates: () => Promise<void>
  fetchMyTemplates: () => Promise<void>
  fetchFeaturedTemplates: () => Promise<void>
  fetchTemplatesByCategory: (category: string) => Promise<void>
  searchTemplates: (query: string) => Promise<void>

  createTemplate: (data: Partial<WorkflowTemplate>) => Promise<WorkflowTemplate>
  updateTemplate: (id: string, data: Partial<WorkflowTemplate>) => Promise<void>
  deleteTemplate: (id: string) => Promise<void>
  publishTemplate: (id: string) => Promise<void>
  unpublishTemplate: (id: string) => Promise<void>

  downloadTemplate: (templateId: string) => Promise<WorkflowTemplate>

  fetchTemplateReviews: (templateId: string) => Promise<void>
  addReview: (templateId: string, rating: number, reviewText?: string) => Promise<void>
  updateReview: (reviewId: string, rating: number, reviewText?: string) => Promise<void>
  deleteReview: (reviewId: string) => Promise<void>

  setSearchQuery: (query: string) => void
  setSelectedCategory: (category: string | null) => void
}

export const useTemplateStore = create<TemplateState & TemplateActions>((set, get) => ({
  templates: [],
  myTemplates: [],
  featuredTemplates: [],
  reviews: [],
  categories: [
    "Communication",
    "Reporting",
    "Customer Success",
    "Data Processing",
    "Marketing",
    "Sales",
    "HR",
    "Finance",
  ],
  loading: false,
  error: null,
  searchQuery: "",
  selectedCategory: null,

  fetchPublicTemplates: async () => {
    const supabase = getSupabaseClient()
    set({ loading: true, error: null })

    try {
      const { data, error } = await supabase
        .from("workflow_templates")
        .select(`
          *,
          author:auth.users(email, user_metadata)
        `)
        .eq("is_public", true)
        .order("downloads_count", { ascending: false })

      if (error) throw error

      set({ templates: data || [], loading: false })
    } catch (error: any) {
      set({ error: error.message, loading: false })
    }
  },

  fetchMyTemplates: async () => {
    const supabase = getSupabaseClient()
    set({ loading: true })

    try {
      const { data: user } = await supabase.auth.getUser()
      if (!user.user) throw new Error("Not authenticated")

      const { data, error } = await supabase
        .from("workflow_templates")
        .select("*")
        .eq("author_id", user.user.id)
        .order("created_at", { ascending: false })

      if (error) throw error

      set({ myTemplates: data || [], loading: false })
    } catch (error: any) {
      set({ error: error.message, loading: false })
    }
  },

  fetchFeaturedTemplates: async () => {
    const supabase = getSupabaseClient()

    try {
      const { data, error } = await supabase
        .from("workflow_templates")
        .select(`
          *,
          author:auth.users(email, user_metadata)
        `)
        .eq("is_public", true)
        .eq("is_featured", true)
        .order("rating_average", { ascending: false })
        .limit(6)

      if (error) throw error

      set({ featuredTemplates: data || [] })
    } catch (error: any) {
      set({ error: error.message })
    }
  },

  fetchTemplatesByCategory: async (category: string) => {
    const supabase = getSupabaseClient()
    set({ loading: true })

    try {
      const { data, error } = await supabase
        .from("workflow_templates")
        .select(`
          *,
          author:auth.users(email, user_metadata)
        `)
        .eq("is_public", true)
        .eq("category", category)
        .order("downloads_count", { ascending: false })

      if (error) throw error

      set({ templates: data || [], loading: false })
    } catch (error: any) {
      set({ error: error.message, loading: false })
    }
  },

  searchTemplates: async (query: string) => {
    const supabase = getSupabaseClient()
    set({ loading: true, searchQuery: query })

    try {
      const { data, error } = await supabase
        .from("workflow_templates")
        .select(`
          *,
          author:auth.users(email, user_metadata)
        `)
        .eq("is_public", true)
        .or(`name.ilike.%${query}%,description.ilike.%${query}%,tags.cs.{${query}}`)
        .order("downloads_count", { ascending: false })

      if (error) throw error

      set({ templates: data || [], loading: false })
    } catch (error: any) {
      set({ error: error.message, loading: false })
    }
  },

  createTemplate: async (data: Partial<WorkflowTemplate>) => {
    const supabase = getSupabaseClient()

    try {
      const { data: user } = await supabase.auth.getUser()
      if (!user.user) throw new Error("Not authenticated")

      const { data: template, error } = await supabase
        .from("workflow_templates")
        .insert({
          ...data,
          author_id: user.user.id,
        })
        .select()
        .single()

      if (error) throw error

      set((state) => ({
        myTemplates: [template, ...state.myTemplates],
      }))

      return template
    } catch (error: any) {
      set({ error: error.message })
      throw error
    }
  },

  updateTemplate: async (id: string, data: Partial<WorkflowTemplate>) => {
    const supabase = getSupabaseClient()

    try {
      const { error } = await supabase.from("workflow_templates").update(data).eq("id", id)

      if (error) throw error

      set((state) => ({
        myTemplates: state.myTemplates.map((template) => (template.id === id ? { ...template, ...data } : template)),
        templates: state.templates.map((template) => (template.id === id ? { ...template, ...data } : template)),
      }))
    } catch (error: any) {
      set({ error: error.message })
      throw error
    }
  },

  deleteTemplate: async (id: string) => {
    const supabase = getSupabaseClient()

    try {
      const { error } = await supabase.from("workflow_templates").delete().eq("id", id)

      if (error) throw error

      set((state) => ({
        myTemplates: state.myTemplates.filter((template) => template.id !== id),
        templates: state.templates.filter((template) => template.id !== id),
      }))
    } catch (error: any) {
      set({ error: error.message })
      throw error
    }
  },

  publishTemplate: async (id: string) => {
    await get().updateTemplate(id, { is_public: true })
  },

  unpublishTemplate: async (id: string) => {
    await get().updateTemplate(id, { is_public: false })
  },

  downloadTemplate: async (templateId: string) => {
    const supabase = getSupabaseClient()

    try {
      const { data: user } = await supabase.auth.getUser()
      if (!user.user) throw new Error("Not authenticated")

      // Record the download
      await supabase.from("template_downloads").insert({
        template_id: templateId,
        user_id: user.user.id,
      })

      // Get the template data
      const { data: template, error } = await supabase
        .from("workflow_templates")
        .select("*")
        .eq("id", templateId)
        .single()

      if (error) throw error

      return template
    } catch (error: any) {
      set({ error: error.message })
      throw error
    }
  },

  fetchTemplateReviews: async (templateId: string) => {
    const supabase = getSupabaseClient()

    try {
      const { data, error } = await supabase
        .from("template_reviews")
        .select(`
          *,
          user:auth.users(email, user_metadata)
        `)
        .eq("template_id", templateId)
        .order("created_at", { ascending: false })

      if (error) throw error

      set({ reviews: data || [] })
    } catch (error: any) {
      set({ error: error.message })
    }
  },

  addReview: async (templateId: string, rating: number, reviewText?: string) => {
    const supabase = getSupabaseClient()

    try {
      const { data: user } = await supabase.auth.getUser()
      if (!user.user) throw new Error("Not authenticated")

      const { error } = await supabase.from("template_reviews").insert({
        template_id: templateId,
        user_id: user.user.id,
        rating,
        review_text: reviewText,
      })

      if (error) throw error

      await get().fetchTemplateReviews(templateId)
    } catch (error: any) {
      set({ error: error.message })
      throw error
    }
  },

  updateReview: async (reviewId: string, rating: number, reviewText?: string) => {
    const supabase = getSupabaseClient()

    try {
      const { error } = await supabase
        .from("template_reviews")
        .update({ rating, review_text: reviewText })
        .eq("id", reviewId)

      if (error) throw error

      set((state) => ({
        reviews: state.reviews.map((review) =>
          review.id === reviewId ? { ...review, rating, review_text: reviewText } : review,
        ),
      }))
    } catch (error: any) {
      set({ error: error.message })
      throw error
    }
  },

  deleteReview: async (reviewId: string) => {
    const supabase = getSupabaseClient()

    try {
      const { error } = await supabase.from("template_reviews").delete().eq("id", reviewId)

      if (error) throw error

      set((state) => ({
        reviews: state.reviews.filter((review) => review.id !== reviewId),
      }))
    } catch (error: any) {
      set({ error: error.message })
      throw error
    }
  },

  setSearchQuery: (query: string) => {
    set({ searchQuery: query })
  },

  setSelectedCategory: (category: string | null) => {
    set({ selectedCategory: category })
  },
}))
