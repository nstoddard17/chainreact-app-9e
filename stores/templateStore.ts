"use client"

import { create } from "zustand"
import { createClient } from "@/utils/supabaseClient"

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
  status?: string
  published_at?: string | null
  primary_setup_target?: string | null
  setup_overview?: any
  default_field_values?: Record<string, any> | null
  integration_setup?: any
  airtable_setup?: any
  draft_nodes?: any[]
  draft_connections?: any[]
  draft_default_field_values?: Record<string, any> | null
  draft_integration_setup?: any
  draft_setup_overview?: any
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
  loadingStates: Record<string, boolean>
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
  loadingStates: {},
  error: null,
  searchQuery: "",
  selectedCategory: null,

  fetchPublicTemplates: async () => {
    const supabase = createClient()
    set((state) => ({
      loadingStates: { ...state.loadingStates, public: true },
      error: null
    }))

    try {
      const { data, error } = await supabase
        .from("workflows_templates")
        .select(`
          *,
          author:auth.users(email, user_metadata)
        `)
        .eq("is_public", true)
        .order("downloads_count", { ascending: false })

      if (error) throw error

      set((state) => ({
        templates: data || [],
        loadingStates: { ...state.loadingStates, public: false }
      }))
    } catch (error: any) {
      set((state) => ({
        error: error.message,
        loadingStates: { ...state.loadingStates, public: false }
      }))
    }
  },

  fetchMyTemplates: async () => {
    const supabase = createClient()
    set((state) => ({
      loadingStates: { ...state.loadingStates, mine: true }
    }))

    try {
      const { data: user } = await supabase.auth.getUser()
      if (!user.user) throw new Error("Not authenticated")

      const { data, error } = await supabase
        .from("workflows_templates")
        .select("*")
        .eq("author_id", user.user.id)
        .order("created_at", { ascending: false })

      if (error) throw error

      set((state) => ({
        myTemplates: data || [],
        loadingStates: { ...state.loadingStates, mine: false }
      }))
    } catch (error: any) {
      set((state) => ({
        error: error.message,
        loadingStates: { ...state.loadingStates, mine: false }
      }))
    }
  },

  fetchFeaturedTemplates: async () => {
    const supabase = createClient()
    set((state) => ({
      loadingStates: { ...state.loadingStates, featured: true }
    }))

    try {
      const { data, error } = await supabase
        .from("workflows_templates")
        .select(`
          *,
          author:auth.users(email, user_metadata)
        `)
        .eq("is_public", true)
        .eq("is_featured", true)
        .order("rating_average", { ascending: false })
        .limit(6)

      if (error) throw error

      set((state) => ({
        featuredTemplates: data || [],
        loadingStates: { ...state.loadingStates, featured: false }
      }))
    } catch (error: any) {
      set((state) => ({
        error: error.message,
        loadingStates: { ...state.loadingStates, featured: false }
      }))
    }
  },

  fetchTemplatesByCategory: async (category: string) => {
    const supabase = createClient()
    set((state) => ({
      loadingStates: { ...state.loadingStates, category: true }
    }))

    try {
      const { data, error } = await supabase
        .from("workflows_templates")
        .select(`
          *,
          author:auth.users(email, user_metadata)
        `)
        .eq("is_public", true)
        .eq("category", category)
        .order("downloads_count", { ascending: false })

      if (error) throw error

      set((state) => ({
        templates: data || [],
        loadingStates: { ...state.loadingStates, category: false }
      }))
    } catch (error: any) {
      set((state) => ({
        error: error.message,
        loadingStates: { ...state.loadingStates, category: false }
      }))
    }
  },

  searchTemplates: async (query: string) => {
    const supabase = createClient()
    set((state) => ({
      loadingStates: { ...state.loadingStates, search: true },
      searchQuery: query
    }))

    try {
      const { data, error } = await supabase
        .from("workflows_templates")
        .select(`
          *,
          author:auth.users(email, user_metadata)
        `)
        .eq("is_public", true)
        .or(`name.ilike.%${query}%,description.ilike.%${query}%,tags.cs.{${query}}`)
        .order("downloads_count", { ascending: false })

      if (error) throw error

      set((state) => ({
        templates: data || [],
        loadingStates: { ...state.loadingStates, search: false }
      }))
    } catch (error: any) {
      set((state) => ({
        error: error.message,
        loadingStates: { ...state.loadingStates, search: false }
      }))
    }
  },

  createTemplate: async (data: Partial<WorkflowTemplate>) => {
    const supabase = createClient()

    set((state) => ({
      loadingStates: { ...state.loadingStates, create: true }
    }))

    try {
      const { data: user } = await supabase.auth.getUser()
      if (!user.user) throw new Error("Not authenticated")

      const { data: template, error } = await supabase
        .from("workflows_templates")
        .insert({
          ...data,
          author_id: user.user.id,
        })
        .select()
        .single()

      if (error) throw error

      set((state) => ({
        myTemplates: [template, ...state.myTemplates],
        loadingStates: { ...state.loadingStates, create: false }
      }))

      return template
    } catch (error: any) {
      set((state) => ({
        error: error.message,
        loadingStates: { ...state.loadingStates, create: false }
      }))
      throw error
    }
  },

  updateTemplate: async (id: string, data: Partial<WorkflowTemplate>) => {
    const supabase = createClient()

    set((state) => ({
      loadingStates: { ...state.loadingStates, update: true }
    }))

    try {
      const { error } = await supabase.from("workflows_templates").update(data).eq("id", id)

      if (error) throw error

      set((state) => ({
        myTemplates: state.myTemplates.map((template) => (template.id === id ? { ...template, ...data } : template)),
        templates: state.templates.map((template) => (template.id === id ? { ...template, ...data } : template)),
        loadingStates: { ...state.loadingStates, update: false }
      }))
    } catch (error: any) {
      set((state) => ({
        error: error.message,
        loadingStates: { ...state.loadingStates, update: false }
      }))
      throw error
    }
  },

  deleteTemplate: async (id: string) => {
    const supabase = createClient()

    set((state) => ({
      loadingStates: { ...state.loadingStates, delete: true }
    }))

    try {
      const { error } = await supabase.from("workflows_templates").delete().eq("id", id)

      if (error) throw error

      set((state) => ({
        myTemplates: state.myTemplates.filter((template) => template.id !== id),
        templates: state.templates.filter((template) => template.id !== id),
        loadingStates: { ...state.loadingStates, delete: false }
      }))
    } catch (error: any) {
      set((state) => ({
        error: error.message,
        loadingStates: { ...state.loadingStates, delete: false }
      }))
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
    const supabase = createClient()

    set((state) => ({
      loadingStates: { ...state.loadingStates, download: true }
    }))

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
        .from("workflows_templates")
        .select("*")
        .eq("id", templateId)
        .single()

      if (error) throw error

      return template
    } catch (error: any) {
      set((state) => ({
        error: error.message,
        loadingStates: { ...state.loadingStates, download: false }
      }))
      throw error
    } finally {
      set((state) => ({
        loadingStates: { ...state.loadingStates, download: false }
      }))
    }
  },

  fetchTemplateReviews: async (templateId: string) => {
    const supabase = createClient()
    set((state) => ({
      loadingStates: { ...state.loadingStates, reviews: true }
    }))

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

      set((state) => ({
        reviews: data || [],
        loadingStates: { ...state.loadingStates, reviews: false }
      }))
    } catch (error: any) {
      set((state) => ({
        error: error.message,
        loadingStates: { ...state.loadingStates, reviews: false }
      }))
    }
  },

  addReview: async (templateId: string, rating: number, reviewText?: string) => {
    const supabase = createClient()
    set((state) => ({
      loadingStates: { ...state.loadingStates, reviewMutation: true }
    }))

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
      set((state) => ({
        error: error.message,
        loadingStates: { ...state.loadingStates, reviewMutation: false }
      }))
      throw error
    } finally {
      set((state) => ({
        loadingStates: { ...state.loadingStates, reviewMutation: false }
      }))
    }
  },

  updateReview: async (reviewId: string, rating: number, reviewText?: string) => {
    const supabase = createClient()

    set((state) => ({
      loadingStates: { ...state.loadingStates, reviewMutation: true }
    }))

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
        loadingStates: { ...state.loadingStates, reviewMutation: false }
      }))
    } catch (error: any) {
      set((state) => ({
        error: error.message,
        loadingStates: { ...state.loadingStates, reviewMutation: false }
      }))
      throw error
    }
  },

  deleteReview: async (reviewId: string) => {
    const supabase = createClient()

    set((state) => ({
      loadingStates: { ...state.loadingStates, reviewMutation: true }
    }))

    try {
      const { error } = await supabase.from("template_reviews").delete().eq("id", reviewId)

      if (error) throw error

      set((state) => ({
        reviews: state.reviews.filter((review) => review.id !== reviewId),
        loadingStates: { ...state.loadingStates, reviewMutation: false }
      }))
    } catch (error: any) {
      set((state) => ({
        error: error.message,
        loadingStates: { ...state.loadingStates, reviewMutation: false }
      }))
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
