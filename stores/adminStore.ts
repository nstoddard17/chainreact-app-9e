import { create } from "zustand"
import { apiClient } from "@/lib/apiClient"

interface UserStats {
  totalUsers: number
  freeUsers: number
  proUsers: number
  businessUsers: number
  enterpriseUsers: number
  adminUsers: number
}

interface AdminState {
  userStats: UserStats
  loading: boolean
  error: string | null
  fetchUserStats: () => Promise<void>
}

export const useAdminStore = create<AdminState>((set) => ({
  userStats: {
    totalUsers: 0,
    freeUsers: 0,
    proUsers: 0,
    businessUsers: 0,
    enterpriseUsers: 0,
    adminUsers: 0,
  },
  loading: false,
  error: null,
  fetchUserStats: async () => {
    set({ loading: true, error: null })
    try {
      const response = await apiClient.get<any>("/api/admin/user-stats")

      if (response.error) {
        console.warn("Failed to fetch user stats:", response.error)
        set({
          userStats: {
            totalUsers: 0,
            freeUsers: 0,
            proUsers: 0,
            businessUsers: 0,
            enterpriseUsers: 0,
            adminUsers: 0,
          },
          loading: false,
        })
        return
      }
      
      const userStatsData = response.data || {};
      set({ userStats: userStatsData, loading: false })
    } catch (error) {
      console.error("Error fetching user stats:", error)
      set({
        userStats: {
          totalUsers: 0,
          freeUsers: 0,
          proUsers: 0,
          businessUsers: 0,
          enterpriseUsers: 0,
          adminUsers: 0,
        },
        loading: false,
        error: "Failed to load user stats",
      })
    }
  },
})) 